// Build-time loader for the partis-couverture section.
//
// Reads the three JSON files produced by the radar-party-score-salient-shadow refiner:
//   - provincial_parties_salient_shadow_day.json   → "Aujourd'hui" view
//   - provincial_parties_salient_shadow_week.json  → "Depuis une semaine" view
//   - provincial_parties_salient_shadow_month.json → "Depuis un mois" view
//
// Key difference from radar-party-score: weighted_mentions is already a SOV
// fraction (0–1) normalised within provincial parties — no frontend normalisation
// needed. The eclipse threshold is 2 % (vs 5 % in the previous refiner).
//
// Each file keeps a rolling 35-day window (one row per party per date).
// The week file resets every Monday; the month file resets on the 1st.

import fs from "node:fs/promises";
import { formatDuree } from "@/lib/duree";
import path from "node:path";

import { readDatasetText } from "@/lib/data/source";

import { lastUpdatedLabel, formatDateFr } from "@/lib/dates";
import { ELECTION_CALL_DATE, ELECTION_DATE } from "@/lib/election";
import { MEDIA_LABELS, MEDIA_PANEL_QC } from "@/lib/medias";
import { samediDeLaSemaine } from "@/lib/semaine";

export const PARTY_KEYS = ["plq", "caq", "qs", "pq", "pcq"] as const;
export type PartyKey = (typeof PARTY_KEYS)[number];

/** Noms officiels, casse comprise, tels que le guide de rédaction les fixe.
 *
 *  Les sigles suffisent dans la console, où la place manque et où le contexte
 *  lève l'ambiguïté. Une phrase destinée à être CITÉE, elle, porte le nom
 *  complet : c'est ce qu'un journaliste recopiera dans son article, et
 *  « Coalition avenir Québec » ne s'invente pas (minuscule à « avenir », pas de
 *  trait d'union). */
export const PARTY_FULL_NAMES: Record<PartyKey, string> = {
  plq: "Parti libéral du Québec",
  caq: "Coalition avenir Québec",
  qs: "Québec solidaire",
  pq: "Parti québécois",
  pcq: "Parti conservateur du Québec",
};

export const PARTY_LABELS: Record<PartyKey, string> = {
  plq: "PLQ",
  caq: "CAQ",
  qs: "QS",
  pq: "PQ",
  pcq: "PCQ",
};

/**
 * Couleurs des partis — les MÊMES que celles du module « L'alignement de
 * l'Assemblée », déclarées en CSS dans `app/globals.css` sous
 * `.parti-name-box.{plq,caq,qs,pq,pcq}`. Les deux modules doivent rester
 * accordés : un lecteur qui descend de l'un à l'autre suit les mêmes couleurs.
 *
 * ⚠️ DUPLICATION ASSUMÉE, mais fragile : ces valeurs existent à deux endroits,
 * ici et dans globals.css. Modifier l'une sans l'autre désaccorde les deux
 * modules en silence. La sortie propre serait des jetons `--party-*` dans
 * `:root`, lus des deux côtés — non fait, parce que les couleurs partent aussi
 * dans des attributs SVG (`stroke`), où `var()` ne se résout pas.
 *
 * Ces teintes ont été retenues plutôt que la norme graphique du CAPP
 * (Elxn_qc22), dont deux couleurs n'atteignent pas le contraste de 3:1 attendu
 * d'un trait fin sur le papier ivoire du site : CAQ #00B0F0 à 2,11 et
 * QS #ED8528 à 2,24. Celles-ci passent toutes (3,94 au plus bas, pour QS).
 *
 * Limite connue : la CAQ et le PQ sont deux bleus proches (écart de luminance
 * 1,60). Sans conséquence tant que chaque parti avait sa rangée ; sur une
 * course où les lignes se croisent, ça se voit.
 */
export const PARTY_COLORS: Record<PartyKey, string> = {
  plq: "#A03440",
  caq: "#2B5C7C",
  qs: "#B85A2C",
  pq: "#1E3A5F",
  pcq: "#5A3B6E",
};

/**
 * Les partis en sourdine : ceux qui occupent le MOINS de place, quelle que soit
 * leur part.
 *
 * La sourdine était un seuil (sous 5 %, un parti passait en gris). Elle est
 * devenue un RANG : le dernier est toujours en sourdine, même à 19 %. Le module
 * y gagne une propriété que le seuil ne donnait pas — il reste exactement quatre
 * partis actifs, donc quatre decks, quelle que soit la journée.
 *
 * Égalité au plus bas : TOUS les ex æquo passent en sourdine, et les decks
 * correspondants restent vides. Une égalité est presque toujours une égalité à
 * zéro (un parti dont on ne parle pas du tout), et départager deux néants par
 * ordre alphabétique donnerait un classement que la donnée ne soutient pas.
 *
 * Conséquence assumée du cas dégénéré : si les cinq partis sont à égalité — en
 * pratique tous à zéro, mesure suspendue ou détection en panne — les cinq
 * passent en sourdine et aucun deck ne se remplit. C'est le comportement voulu :
 * l'avis d'indisponibilité prend alors toute la place, plutôt que quatre decks
 * qui prétendraient classer du vide.
 *
 * L'égalité se teste sur la part BRUTE, pas sur le pourcentage affiché : deux
 * partis à 11,6 % et 12,4 % s'affichent tous deux « 12 % » sans être à égalité.
 */
export function clesEnSourdine(parts: [PartyKey, number][]): Set<PartyKey> {
  if (parts.length === 0) return new Set();
  const min = Math.min(...parts.map(([, v]) => v));
  return new Set(parts.filter(([, v]) => v === min).map(([k]) => k));
}
const SPARK_W = 100;
const SPARK_H = 30;

/** `overall` a remplacé l'ancien `month` : ce n'est plus une granularité de
 *  plus, c'est la vue dont l'axe court jusqu'au scrutin. */
export type RangeKey = "today" | "week" | "overall";

const SPARK_HEAD_LABELS: Record<RangeKey, string> = {
  today: "Jour par jour",
  week: "Semaine par semaine",
  overall: "Depuis le début du suivi, jusqu'au scrutin",
};

const RANGE_CONFIG: Record<
  RangeKey,
  { barKey: keyof Sov; refKey: keyof Sov; toneKey: keyof Tone; refLabel: string }
> = {
  // Chaque onglet donne la MOYENNE de sa période, ce que le podium affiche.
  // Pas de moyenne recalculée ici : le raffineur accumule déjà depuis minuit
  // (jour) et depuis lundi (semaine) avant de normaliser en part de voix — la
  // valeur publiée EST la moyenne de sa période. La remoyenner la fausserait.
  // Seul le portrait global demande un vrai calcul : `year` est la moyenne sur
  // toutes les journées de la fenêtre.
  today:   { barKey: "today", refKey: "week",  toneKey: "today", refLabel: "moyenne du jour" },
  week:    { barKey: "week",  refKey: "month", toneKey: "week",  refLabel: "moyenne de la semaine" },
  overall: { barKey: "year",  refKey: "year",  toneKey: "today", refLabel: "moyenne de la période" },
};

/** Fenêtres de moyennage du podium. Les anciens libellés parlaient de
 *  « course » alors que la course est passée sous la console : ils décrivent
 *  désormais ce qu'ils font vraiment, une période. */
const TAB_LABELS: Record<RangeKey, string> = {
  today: "Jour",
  week: "Semaine",
  overall: "Campagne",
};

export type Sov  = { today: number; week: number; month: number; year: number };
export type Tone = { today: number; week: number; month: number; year: number };

type ShadowRow = {
  party: string;
  date_utc: string;
  date_montreal_tz: string;
  weighted_mentions: number; // already SOV (0–1)
  /** Minutes en Une attribuées à ce parti, cumulées depuis le reset de la
   *  période. Depuis aws-refiners#355 elles sont RÉPARTIES entre les partis
   *  d'un article au prorata de leurs phrases : leur somme égale donc les
   *  minutes réelles, ce qui n'était pas le cas auparavant. */
  total_raw_score?: number;
  weighted_tone: number;
  computed_at?: string;
  /** Présent uniquement dans les tables `*_by_media_*`. */
  media_id?: string;
  /** Présent uniquement dans les tables `*_by_media_*` (aws-refiners#447) :
   *  l'URL de l'article qui pèse le plus dans le score de ce parti sur CE
   *  média. `null`/absent quand aucun article du groupe n'en a — jamais une
   *  chaîne vide, qui se lirait comme un lien valide. */
  representative_url?: string | null;
};

/** Une ligne de `*_salient_shadow_intraday` : la part de voix à un bloc de 4 h. */
type IntradayRow = ShadowRow & { block_hour: number; block_label: string };

/** Une ligne de `parties_issues_salient_shadow_day`. */
type IssueRow = {
  party: string;
  theme: string;
  issue_share: number;
  /** Minutes en Une attribuées à ce couple. C'est CE champ, et non la part, qui
   *  permet de recomposer une part de voix sur une sélection d'enjeux : les
   *  parts sont normalisées par parti, donc non additionnables entre partis. */
  total_raw_score: number;
  weighted_tone: number;
  date_utc: string;
  date_montreal_tz?: string;
  /** Instant UTC exact du calcul. C'est LUI qui donne la date de Montréal —
   *  voir `dateMontreal()`. */
  computed_at?: string;
};

/**
 * La date de MONTRÉAL d'un relevé, déduite de `computed_at`.
 *
 * ⚠️ NE PAS se fier à `date_montreal_tz` : la colonne porte ce nom mais contient
 * la date UTC. Le raffineur écrit `as.Date(now_mtl)`, or `as.Date()` sur un
 * horodatage R IGNORE son fuseau et retombe sur UTC. Vérifié :
 *
 *   as.Date(ymd_hms("2026-08-27 23:31:12", tz = "America/Montreal"))
 *     → 2026-08-28        (et non le 27)
 *
 * Tout relevé calculé entre 20 h et minuit heure de Montréal est donc classé au
 * LENDEMAIN — un bloc de 4 h sur six, systématiquement. Constaté dans Athena le
 * 2026-08-28 : le bloc « 20h » calculé à 03h31 UTC, soit 23h31 à Montréal le 27,
 * portait `date_montreal_tz = 2026-08-28`. La courbe du jour mélangeait alors la
 * soirée de la veille et le matin courant, avec le point de 20h posé à l'extrême
 * droite de l'axe alors qu'il PRÉCÈDE celui de 4h.
 *
 * On corrige ICI et non dans le raffineur (décision du 2026-08-28) : la colonne
 * reste telle quelle en base, le site recalcule depuis `computed_at`, qui est un
 * instant UTC exact. Même fuseau que `aujourdhuiMontreal()`, pour que les deux
 * ne puissent pas diverger.
 *
 * Repli sur les colonnes publiées quand `computed_at` manque — une archive
 * antérieure à son introduction, par exemple. Le repli est alors décalé comme
 * avant, ce qui reste préférable à une date vide.
 */
function dateMontreal(row: {
  computed_at?: string;
  date_montreal_tz?: string;
  date_utc?: string;
}): string {
  const quand = row.computed_at ? Date.parse(row.computed_at) : NaN;
  if (!Number.isNaN(quand)) {
    return new Intl.DateTimeFormat("fr-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(quand));
  }
  return String(row.date_montreal_tz ?? row.date_utc ?? "");
}

type Entry = { mentions: number; tone: number; minutes: number };
type Lookup = Record<string, Record<string, Entry>>; // date → party_lower → entry

type Stat = {
  key: PartyKey;
  /** Minutes en Une, par période. Même structure que `sov`. */
  minutes: Sov;
  sov: Sov;
  tone: Tone;
  /** `daily` couvre TOUTE la fenêtre disponible ; `week` n'en garde que les 7
   *  derniers jours. La courbe partagée veut la première, l'ancienne mini-courbe
   *  voulait la seconde. */
  history: { daily: number[]; week: number[]; weekly: number[]; month: number[]; monthly: number[] };
  /** Le même découpage, mais en MINUTES de Une plutôt qu'en part de voix.
   *  C'est ce que trace le palmarès : « la CAQ a occupé 2 h 15 » se cite, un
   *  pourcentage oblige le lecteur à faire le calcul lui-même. */
  minutesHistory: { daily: number[]; weekly: number[]; monthly: number[] };
  toneHistory: { daily: number[]; weekly: number[]; monthly: number[] };
};

/** Les dates effectivement retenues pour chaque échelle — l'axe horizontal de
 *  la courbe les étiquette, donc elles doivent voyager avec les valeurs. */
type SeriesDates = { daily: string[]; weekly: string[]; monthly: string[] };

/** La matrice parti × enjeu, telle que la console la consomme.
 *
 *  C'est ELLE qui rend les pads jouables : sélectionner des enjeux revient à
 *  recalculer la part de voix sur les seules minutes attribuées à ces enjeux,
 *  puis à renormaliser entre les cinq partis. Le calcul se fait côté client, à
 *  chaque clic, sur un objet déjà en mémoire — aucune requête, aucun recalcul
 *  de build. */
export type EnjeuMix = {
  /** Les enjeux réellement détectés, du plus au moins présent tous partis
   *  confondus. L'ordre est stable d'un rendu à l'autre : une banque de pads
   *  dont les touches changent de place à chaque mise à jour serait
   *  injouable. */
  enjeux: string[];
  /** parti → enjeu → minutes attribuées et ton de ce couple. */
  parParti: Record<string, Record<string, { score: number; tone: number }>>;
};

/** Un enjeu dont on parle à propos d'un parti. */
export type EnjeuView = {
  /** Libellé CAP canonique, repris au caractère près : ces douze catégories
   *  sont partagées avec le Digital Society Lab, les changer casserait la
   *  comparabilité entre projets. */
  label: string;
  /** Part de cet enjeu DANS ce parti, en % entier. Les parts d'un même parti
   *  somment à 100. */
  pct: number;
  toneLabel: string;
  toneDirection: "positive" | "negative" | "neutral";
  /** Vrai pour le pad « Autres enjeux », qui agrège la queue de distribution.
   *  Il se rend éteint : ce n'est pas un enjeu, c'est ce qui reste. */
  reste?: boolean;
};

export type RowView = {
  key: PartyKey;
  label: string;
  /** Nom officiel complet (« Coalition avenir Québec »), pour la phrase
   *  citable du bloc journalistes. Le sigle suffit dans la console. */
  fullLabel: string;
  inShadow: boolean;
  color: string;
  sovPct: number;
  barWidthPct: number;
  barTitle: string;
  refLeftPct: number;
  refTitle: string;
  showLeaderLabel: boolean;
  toneLabel: string;
  toneDirection: "positive" | "negative" | "neutral";
  toneTitle: string;
  /** Position du ton sur une jauge de 0 à 100, pour le repère de la pochette
   *  ouverte : 0 = défavorable, 50 = neutre, 100 = favorable.
   *
   *  MÊME OBJET VISUEL que le « Ton en chambre » du module de l'Assemblée
   *  (`.ass-tone`) : une barre en dégradé et un repère qui s'y déplace. Deux
   *  modules qui mesurent un ton doivent le montrer de la même façon, sinon le
   *  lecteur croit lire deux grandeurs différentes.
   *
   *  L'échelle va de -1 à +1 et se borne : la proportion nette de mots
   *  favorables ne sort pas de cet intervalle, et une valeur aberrante doit
   *  buter contre le bord plutôt que sortir de la barre. */
  tonePct: number;
  /** Minutes en Une attribuées à ce parti sur la période, arrondies.
   *
   *  Publiées telles quelles pour un palmarès : « la CAQ a occupé 2 h 15 de
   *  Une » se cite mieux qu'une part de voix, et la valeur est désormais
   *  interprétable — depuis la répartition, la somme sur tous les partis égale
   *  le temps réellement passé en Une, et non un multiple. */
  minutesUne: number;
  /** Rang sur la période, 1 = le plus présent. « 2e sur 5 » se cite ; une
   *  part de voix seule oblige le lecteur à comparer lui-même. */
  rang: number;
  /** Journées où ce parti a été le plus présent, sur celles que couvre
   *  l'onglet. Les journées sans aucune détection ne comptent pour personne. */
  joursEnTete: number;
  joursComptes: number;
  /** Évolution entre le premier et le dernier jour de la fenêtre, en POINTS de
   *  pourcentage. Jamais en pourcentage d'un pourcentage. */
  evolutionPts: number;
  /** Les enjeux dont on parle à propos de ce parti, du plus au moins présent.
   *  Vide tant que la table de croisement n'est pas publiée. */
  enjeux: EnjeuView[];
  /** La carte des enjeux a-t-elle été FOURNIE pour cette vue ? Les vues par
   *  média ne la reçoivent pas — le raffineur ne croise pas parti × enjeu ×
   *  média. Sans ce drapeau, `enjeux: []` se lit « aucun enjeu identifié », ce
   *  qui est une affirmation sur la couverture au lieu d'un aveu sur la mesure
   *  (relevé d'Alexandre, PR #539). */
  enjeuxVentiles: boolean;
  /** Sommet atteint sur la fenêtre suivie, et le jour où il l'a été.
   *  C'est le « peak hold » de la console : le trait qui reste au niveau le
   *  plus haut atteint, longtemps après que le son soit redescendu. */
  peakPct: number;
  peakDate: string;
  sparkPolyline: string;
  sparkCircles: { cx: number; cy: number; r: number }[];
  /** L'article qui pèse le plus dans le score de ce parti — voir
   *  `dernieresUrlsParParti`. Présent SEULEMENT sur les vues par média
   *  (`byMedia`, aws-refiners#447) : l'agrégat « tous les médias » n'a pas
   *  d'URL propre, il en existe une par média. `undefined` sur l'agrégat,
   *  `null` sur un média sans article connu — deux absences différentes que
   *  `Deck` distingue (voir `PartisCouvertureClient.tsx`). */
  representativeUrl?: string | null;
};

/** Une ligne de la course, déjà projetée en coordonnées du viewBox. */
export type ChartSeries = {
  key: PartyKey;
  label: string;
  color: string;
  inShadow: boolean;
  polyline: string;
  /** Bout de ligne — position du point terminal. */
  lastX: number;
  lastY: number;
  /** Le même tracé, mais normalisé sur la propre amplitude du parti.
   *
   *  L'échelle commune répond à « qui est devant », ce que le rang et le
   *  pourcentage disent déjà mieux ; elle écrase en revanche le mouvement d'un
   *  parti qui joue dans les basses eaux. Chaque piste porte donc sa propre
   *  amplitude, et la comparaison des NIVEAUX se lit sur les chiffres, à côté.
   *  Les deux lectures ne se contredisent pas : elles répondent à deux
   *  questions différentes. */
  polylineSolo: string;
  /** Position de l'ÉTIQUETTE : `lastY` écarté de ses voisines si nécessaire.
   *  Distinct de `lastY` pour que le point reste sur la donnée exacte même
   *  quand son étiquette a dû être déplacée. */
  labelY: number;
  lastPct: number;
  /** Le tracé du PALMARÈS : mêmes abscisses, mais l'ordonnée porte les minutes
   *  de Une. Les cinq partis partagent la même échelle — c'est tout l'intérêt,
   *  on compare des durées. */
  polylineMin: string;
  /** Tête de courbe sur l'échelle des minutes : c'est là que se pose la
   *  pochette miniature. L'abscisse est la même que `lastX`. */
  lastYMin: number;
  /** Minutes du dernier point, pour l'étiquette de bout de courbe. */
  lastMinutes: number;
  /** LE SECOND TRACÉ DU PALMARÈS : mêmes abscisses, mais l'ordonnée porte le
   *  TON — la proportion nette de mots favorables, dans [-1, 1].
   *
   *  Le palmarès sait classer deux choses, et le lecteur bascule de l'une à
   *  l'autre : le disque le plus ÉCOUTÉ (les minutes) et le plus APPRÉCIÉ (le
   *  ton). Les deux pistes voyagent ensemble parce que la bascule est
   *  instantanée, côté client : aller chercher la seconde au moment du clic
   *  aurait demandé une requête pour une donnée déjà calculée.
   *
   *  ⚠️ L'ordonnée est INVERSÉE comme partout en SVG : un ton favorable donne un
   *  `y` PETIT, donc un bon rang. Sans ça le classement se lirait à l'envers. */
  polylineTon: string;
  /** L'ÉCART DU DERNIER POINT AU TON MOYEN DES AUTRES PARTIS, au même instant.
   *
   *  Et non le ton brut. Un ton absolu — « +24,3 % de mots favorables en net » —
   *  ne dit rien à un lecteur qui n'a aucun repère pour le juger. Un écart en
   *  fournit un : « couverture 42 points plus négative que celle des autres
   *  partis » se lit sans rien connaître d'avance.
   *
   *  DES AUTRES, ET NON DES CINQ. Un parti comparé à une moyenne qui le contient
   *  se compare en partie à lui-même, et l'écart s'en trouve tassé d'autant.
   *  « Plus négative que les autres » exclut le parti de sa propre référence,
   *  ce que la phrase affichée annonce d'ailleurs mot pour mot.
   *
   *  Le CLASSEMENT n'en est pas changé. Retrancher aux uns la moyenne des autres
   *  est une transformation CROISSANTE du ton — le calcul se ramène à
   *  `ton × n/(n-1)` moins une constante commune — donc l'ordre est identique à
   *  celui du ton brut, et c'est pourquoi `polylineTon` reste tracée dessus.
   *
   *  `null` QUAND IL N'Y A RIEN À MESURER. Un parti dont on n'a pas parlé n'a
   *  pas un ton neutre : il n'a PAS DE TON. Le raffineur écrit pourtant zéro
   *  (`replace_na(weighted_tone = 0)`), valeur indistinguable d'une couverture
   *  parfaitement équilibrée, et le module le classait donc au milieu du
   *  peloton, au-dessus de partis réellement malmenés. */
  lastEcartTon: number | null;
};

export type ChartView = {
  series: ChartSeries[];
  /** Bornes de la période affichée, aux deux extrémités de l'axe. */
  xLabels: { label: string; x: number }[];
  /** La ligne d'ARRIVÉE, propre à l'onglet : 20 h aujourd'hui pour le jour,
   *  vendredi 20 h pour la semaine, le jour du scrutin pour tout le suivi.
   *  Le vide entre la dernière donnée et elle EST l'information — c'est ce
   *  qu'il reste à courir. */
  finish: { x: number; label: string; sub: string };
  width: number;
  height: number;
  /** Vrai quand la fenêtre ne contient qu'une seule date : une « courbe » d'un
   *  seul point ne veut rien dire, le composant affiche autre chose. */
  tooShort: boolean;
  /** Pourquoi il n'y a rien à tracer, quand `tooShort` est vrai. */
  raison?: "court" | "detail-horaire-absent";
  /** Graduations de l'axe des minutes, pour le palmarès. */
  yLabels: { label: string; y: number }[];
  /** CE QUE COUVRE `lastMinutes`, en toutes lettres.
   *
   *  Il le faut depuis que les onglets ne mesurent plus la même chose. Sur
   *  « Jour », la mesure du raffineur CUMULE depuis minuit : le dernier bloc
   *  vaut la journée entière. Sur « Semaine » et « Période », le palmarès classe
   *  désormais sur les minutes DU JOUR, et sa dernière valeur est donc celle du
   *  dernier jour publié — pas un total de période. Sans cette phrase, la même
   *  durée affichée voudrait dire deux choses selon l'onglet. */
  mesureLabel: string;
};

export type RangeView = {
  range: RangeKey;
  tabLabel: string;
  sparkHeadLabel: string;
  refLabel: string;
  /** « du 11 au 17 août 2026 » : la fenêtre réellement couverte par la donnée,
   *  formulée pour être recopiée telle quelle dans un article. */
  periodeLabel: string;
  /** Depuis quand la mesure court, pour l'écrire sous le titre du vumètre. */
  depuisLabel: string;
  rows: RowView[];
  /** La course de CETTE période : sa fenêtre et sa ligne d'arrivée en
   *  dépendent. */
  chart: ChartView;
};

/** Une position du fader : « tous les médias », ou un média du panel. */
export type MediaOption = { id: string; label: string };

/** Ce que le fader donne à voir pour une position : les classements par
 *  période, et la course. */
export type MediaView = {
  ranges: Record<RangeKey, RangeView>;
};

/** Pourquoi le module n'a rien à montrer.
 *
 *  La distinction est tout le sujet : « les médias n'ont pas parlé des partis »
 *  et « notre instrument de mesure est hors service » sont deux affirmations
 *  différentes, et le module n'a le droit d'énoncer la première que lorsqu'elle
 *  est vraie. Jusqu'ici il affichait « tous les canaux sont silencieux » dans
 *  les deux cas — il imputait donc aux médias un silence qui était le nôtre.
 *
 *  - `perimee`  : plus rien n'est publié depuis `lastDate` (pipeline arrêté).
 *  - `recalibrage` : l'instrument lui-même ne mesure pas. Deux chemins y
 *    mènent — la fenêtre entièrement à zéro (le raffineur publie, le modèle ne
 *    détecte rien), et surtout la suspension éditoriale déclarée par
 *    `MESURE_PROVINCIALE_SUSPENDUE`, qui prime sur tout le reste.
 *    Cause connue : six des onze seuils du classifieur « canadian political
 *    parties » sont au-dessus de ce que le modèle atteint réellement, les
 *    classes provinciales n'ayant pas été apprises (aws-refiners#223, #248).
 *
 *  Ordre de priorité voulu : la suspension d'abord. `perimee` décrit un
 *  symptôme (« ça s'est arrêté le 31 juillet ») qui laisserait croire que la
 *  donnée d'avant était bonne — elle ne l'était pas.
 */
export type Indisponibilite = {
  raison: "perimee" | "recalibrage";
  /** Dernière date effectivement présente dans la donnée. */
  lastDate: string;
  /** « 31 juillet 2026 » — formaté ici, côté serveur, pour que le rendu
   *  statique et le rendu client donnent exactement la même chaîne. */
  lastDateLabel: string;
  /** Écart en jours entre `lastDate` et l'édition affichée. 0 si à jour. */
  joursDeRetard: number;
};

/** Le dernier bloc de 4 h publié pour la journée la plus récente.
 *
 *  Sert au CONTRAT D'ILLUSTRATION (`data/partis-selection.json`) : le raffineur
 *  des pochettes a besoin de savoir quelle édition il illustre, pour ranger
 *  l'image sous le bon jour et pour savoir quand la journée est close. `null`
 *  quand la table intra-journée n'est pas publiée — le contrat le dit alors,
 *  plutôt que d'inventer un bloc. */
export type BlocCourant = {
  /** Jour de Montréal du bloc, « 2026-08-30 ». */
  date: string;
  /** Heure de FIN du bloc (0, 4, 8, 12, 16, 20). */
  hour: number;
  /** Intervalle brut publié par le raffineur, « 16-20 ». */
  label: string | null;
};

export type PartiesData = {
  ranges: Record<RangeKey, RangeView>;
  /** Non nul quand le module ne peut rien affirmer — voir `Indisponibilite`.
   *  Le module reste affiché (il garde sa place et son explication), mais il
   *  dit ce qu'il ne sait pas au lieu de présenter des zéros comme un
   *  résultat. */
  indisponible: Indisponibilite | null;
  /** Positions du fader, « tous les médias » en tête. Vide si la ventilation
   *  par média n'est pas publiée — le fader disparaît alors, plutôt que de
   *  s'afficher inerte. */
  medias: MediaOption[];
  /** Vues par position du fader. La clé TOUS_MEDIAS n'y figure PAS : elle
   *  correspond à `ranges`/`chart` ci-dessus, qui viennent de la table
   *  agrégée. Et c'est volontaire — l'agrégat est pondéré par les minutes de
   *  chaque média, il n'est donc pas la moyenne des vues par média. */
  byMedia: Record<string, MediaView>;
  /** La matrice parti × enjeu, pour la banque de pads de la console. Vide tant
   *  que le croisement n'est pas publié : la banque disparaît alors, plutôt que
   *  d'offrir des touches qui ne commandent rien. */
  enjeuMix: EnjeuMix;
  /** Vrai quand la donnée vient de `fixtures/` et non de `public/data/`.
   *  Le module l'affiche en toutes lettres — cf. `.gitignore` : « aucune donnée
   *  inventée ne doit pouvoir être confondue avec la donnée réelle ». */
  surFixtures: boolean;
  /** Dernier bloc de 4 h publié, ou `null` sans table intra-journée. */
  blocCourant: BlocCourant | null;
  lastDate: string; // ISO date de la dernière donnée disponible
  /** « Dernière mise à jour : mardi 30 juin 2026 » — table journalière, pas d'heure. */
  lastUpdated: string;
};

const TONE_THRESHOLD = 0.002;
const SPARK_CIRCLE_COUNT = 7;

/** Au-delà de ce retard, la série est déclarée périmée. La table journalière
 *  est republiée à chaque run (6×/jour) : trois jours sans nouvelle ligne ne
 *  s'expliquent pas par un simple décalage de publication. */
const RETARD_MAX_JOURS = 3;

/** La mesure provinciale est suspendue, par décision éditoriale, tant que le
 *  modèle n'a pas été réentraîné et validé (aws-refiners#248).
 *
 *  Pourquoi une constante plutôt qu'une détection sur la donnée : le défaut
 *  n'est pas un trou qu'on peut repérer, c'est que les valeurs publiées ne
 *  mesurent pas ce qu'elles prétendent mesurer. Elles en ont toute l'apparence
 *  — un nombre, une date, cinq partis. Sur les 32 jours de la dernière fenêtre
 *  publiée, 19 ne détectaient que deux partis ou moins, et 7 un seul (un parti
 *  à 100 %, les quatre autres à zéro). Aucune heuristique honnête ne distingue
 *  ça d'une vraie journée creuse ; et le préprint qui documente le modèle le
 *  confirme en amont : QS obtient un F1 de 0,000, le PQ n'est pas rapporté, le
 *  PCQ est absent de l'évaluation, le PLQ plafonne à 0,15–0,20.
 *
 *  Conséquence assumée : le module ne montre AUCUN niveau, y compris dans les
 *  éditions archivées — le défaut est antérieur au gel du 31 juillet 2026, il
 *  ne commence pas à cette date. Le module reste affiché et dit pourquoi.
 *
 *  À repasser à `false` quand le réentraînement est validé, avec les sections
 *  `#partis-et-couverture` et `#limites` (Limites reconnues) de la métho mises
 *  à jour dans le même geste. Repérées par leur ancre, pas par leur numéro de
 *  § : l'ordre des sections a déjà changé une fois (#492).
 *
 *  UNE SEULE DÉROGATION : les fixtures (voir `SUR_FIXTURES` plus bas). La
 *  suspension protège le PUBLIC d'une affirmation que la donnée ne soutient
 *  pas ; une donnée fictive n'affirme rien sur le monde, donc il n'y a rien à
 *  protéger. Sans cette dérogation, le module ne se rend plus du tout et
 *  devient impossible à faire évoluer — il a fallu basculer cette constante à
 *  la main pour la vérification responsive du 2026-08-17, ce qui est
 *  exactement le genre de manipulation qui finit par être commitée par
 *  accident. Le rendu sur fixtures porte un bandeau « DONNÉES FICTIVES »
 *  (`GabaritFictif`), pour qu'aucune capture ne puisse passer pour le site. */
const MESURE_PROVINCIALE_SUSPENDUE = false;

/** Aujourd'hui en heure de MONTRÉAL, pas en UTC (AGENTS.md règle #2).
 *  `toISOString()` bascule de jour dès 20 h heure locale : le module aurait
 *  annoncé « 17 jours » de retard un soir où il n'y en avait que 16. */
function aujourdhuiMontreal(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Minuscule initiale : le libellé est inséré après « depuis le », où
 *  « Vendredi 31 juillet » se lirait comme une coquille. Même geste que
 *  `lastUpdatedLabel`. Partagé par les deux chemins d'indisponibilité, pour
 *  qu'ils produisent exactement la même chaîne. */
function labelDateIndispo(lastDate: string): string {
  const brut = formatDateFr(lastDate);
  return brut.charAt(0).toLowerCase() + brut.slice(1);
}

function ecartEnJours(depuis: string, jusqu: string): number {
  const a = Date.parse(`${depuis}T00:00:00Z`);
  const b = Date.parse(`${jusqu}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Décide si le module peut affirmer quelque chose.
 *
 *  `asOfIso` (édition passée) sert de « aujourd'hui » : une archive du 30 juin
 *  ne doit pas être marquée périmée parce qu'on la consulte en août. */
function detecterIndisponibilite(
  rows: ShadowRow[],
  lastDate: string,
  asOfIso?: string,
): Indisponibilite | null {
  if (!lastDate) return null;
  const aujourdhui = asOfIso ?? aujourdhuiMontreal();
  const joursDeRetard = ecartEnJours(lastDate, aujourdhui);

  const lastDateLabel = labelDateIndispo(lastDate);

  if (joursDeRetard > RETARD_MAX_JOURS) {
    return { raison: "perimee", lastDate, lastDateLabel, joursDeRetard };
  }

  // Toute la fenêtre à zéro : le raffineur tourne, mais le modèle ne détecte
  // plus rien. Un seul jour creux ne suffit pas à conclure — les médias
  // peuvent réellement ne pas avoir parlé des partis un jour donné, et c'est
  // l'état vide ordinaire de la console qui le dit alors.
  const aDuSignal = rows.some((r) => Number(r.weighted_mentions) > 0);
  if (!aDuSignal) return { raison: "recalibrage", lastDate, lastDateLabel, joursDeRetard };

  return null;
}

function computeToneStreak(
  history: number[],
): { direction: "positive" | "negative" | "neutral"; count: number } {
  if (history.length === 0) return { direction: "neutral", count: 0 };
  const latest = history[history.length - 1];
  const dir =
    latest > TONE_THRESHOLD ? "positive" : latest < -TONE_THRESHOLD ? "negative" : "neutral";
  let count = 1;
  for (let i = history.length - 2; i >= 0; i--) {
    const v = history[i];
    const d = v > TONE_THRESHOLD ? "positive" : v < -TONE_THRESHOLD ? "negative" : "neutral";
    if (d === dir) count++;
    else break;
  }
  return { direction: dir, count };
}

function sparkPoints(history: number[], w: number, h: number): [number, number][] {
  if (history.length === 0) return [];
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 0.001;
  const n = history.length;
  return history.map((v, i) => {
    const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
    const y = h - ((v - min) / range) * (h * 0.8) - h * 0.1;
    return [x, y];
  });
}

function samplePoints(points: [number, number][], n: number): [number, number][] {
  if (points.length <= n) return points;
  const step = (points.length - 1) / (n - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push(points[Math.round(i * step)]);
  return out;
}

// Returns the last date of each ISO week — one sparkline point per week.
function lastDatesPerWeek(dates: string[]): string[] {
  const last = new Map<string, string>();
  for (const d of dates) {
    const dt = new Date(d + "T12:00:00Z");
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() - (day - 1));
    last.set(dt.toISOString().slice(0, 10), d);
  }
  return [...last.values()].sort();
}

// Returns the last date of each calendar month — one sparkline point per month.
function lastDatesPerMonth(dates: string[]): string[] {
  const last = new Map<string, string>();
  for (const d of dates) last.set(d.slice(0, 7), d);
  return [...last.values()].sort();
}

/**
 * L'URL représentative la plus RÉCENTE par parti, dans des lignes déjà
 * filtrées sur UN SEUL média.
 *
 * `representative_url` n'est PAS une série — contrairement à `weighted_tone`
 * ou `total_raw_score`, elle ne s'accumule pas sur la fenêtre glissante :
 * chaque relevé republie sa propre valeur, la plus à jour l'emportant tout
 * simplement sur les précédentes. Même départage que `buildLookup`,
 * `computed_at`, pour la même raison : plusieurs relevés par jour sont
 * publiés depuis que le raffineur tourne six fois par jour.
 */
function dernieresUrlsParParti(rows: ShadowRow[]): Map<string, string | null> {
  const vus = new Map<string, string>();
  const urls = new Map<string, string | null>();
  for (const row of rows) {
    const pKey = row.party.toLowerCase();
    const quand = row.computed_at ?? "";
    const vu = vus.get(pKey);
    if (vu !== undefined && vu >= quand) continue;
    vus.set(pKey, quand);
    urls.set(pKey, row.representative_url ?? null);
  }
  return urls;
}

// Builds a date → party → entry lookup. First occurrence wins for duplicate
// (date, party) pairs — the refiner guarantees uniqueness per run.
/**
 * Indexe par date puis parti, en gardant le relevé le PLUS RÉCENT.
 *
 * L'ancienne version gardait la premiere ligne rencontree, ce qui etait sans
 * effet tant que le raffineur ne publiait qu'un releve par jour. Des qu'il en
 * publiera six — la frequence augmente pour la campagne — cette regle aurait
 * fait prendre a la serie quotidienne un instantane intra-journee arbitraire
 * au lieu de la valeur accumulee de fin de journee, et RIEN ne l'aurait
 * signale. `computed_at` tranche.
 */
function buildLookup(rows: ShadowRow[]): Lookup {
  const result: Lookup = Object.create(null);
  const vus: Record<string, string> = Object.create(null);
  for (const row of rows) {
    const pKey = row.party.toLowerCase();
    const cle = `${row.date_utc}|${pKey}`;
    const quand = row.computed_at ?? "";
    if (vus[cle] !== undefined && vus[cle] >= quand) continue;
    vus[cle] = quand;
    if (!result[row.date_utc]) result[row.date_utc] = Object.create(null);
    result[row.date_utc][pKey] = {
      mentions: row.weighted_mentions,
      tone: row.weighted_tone,
      minutes: Number(row.total_raw_score) || 0,
    };
  }
  return result;
}

function computeStats(
  dayRows: ShadowRow[],
  weekRows: ShadowRow[],
  monthRows: ShadowRow[],
): { stats: Stat[]; dates: SeriesDates } | null {
  const dayLookup   = buildLookup(dayRows);
  const weekLookup  = buildLookup(weekRows);
  const monthLookup = buildLookup(monthRows);

  const allDayDates  = Object.keys(dayLookup).sort();
  const weekDates    = Object.keys(weekLookup).sort();
  const monthDates   = Object.keys(monthLookup).sort();

  if (!allDayDates.length || !weekDates.length || !monthDates.length) return null;

  const latestDay   = allDayDates[allDayDates.length - 1];
  const latestWeek  = weekDates[weekDates.length - 1];
  const latestMonth = monthDates[monthDates.length - 1];

  const last7DayDates    = allDayDates.slice(-7);
  const weekSampleDates  = lastDatesPerWeek(weekDates).slice(-12);
  const monthSampleDates = lastDatesPerMonth(monthDates).slice(-12);

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const stats = PARTY_KEYS.map((pKey): Stat => {
    const todaySov  = dayLookup[latestDay]?.[pKey]?.mentions   || 0;
    const weekSov   = weekLookup[latestWeek]?.[pKey]?.mentions  || 0;
    const monthSov  = monthLookup[latestMonth]?.[pKey]?.mentions || 0;
    const yearSov   = avg(allDayDates.map((d) => dayLookup[d]?.[pKey]?.mentions || 0));

    const todayTone = dayLookup[latestDay]?.[pKey]?.tone   || 0;
    const weekTone  = weekLookup[latestWeek]?.[pKey]?.tone  || 0;
    const monthTone = monthLookup[latestMonth]?.[pKey]?.tone || 0;

    // Les minutes de chaque période, à côté des parts. Le `year` somme la
    // fenêtre entière, puisqu'il n'existe pas de table annuelle.
    const minutes: Sov = {
      today: dayLookup[latestDay]?.[pKey]?.minutes || 0,
      week:  weekLookup[latestWeek]?.[pKey]?.minutes || 0,
      month: monthLookup[latestMonth]?.[pKey]?.minutes || 0,
      year:  allDayDates.reduce((t, d) => t + (dayLookup[d]?.[pKey]?.minutes || 0), 0),
    };

    return {
      key: pKey,
      minutes,
      sov:  { today: todaySov, week: weekSov,  month: monthSov,  year: yearSov },
      tone: { today: todayTone, week: weekTone, month: monthTone, year: 0 },
      history: {
        daily:   allDayDates.map((d)      => dayLookup[d]?.[pKey]?.mentions   || 0),
        week:    last7DayDates.map((d)    => dayLookup[d]?.[pKey]?.mentions   || 0),
        weekly:  weekSampleDates.map((d)  => weekLookup[d]?.[pKey]?.mentions  || 0),
        month:   [],
        monthly: monthSampleDates.map((d) => monthLookup[d]?.[pKey]?.mentions || 0),
      },
      minutesHistory: {
        daily:   allDayDates.map((d)      => dayLookup[d]?.[pKey]?.minutes   || 0),
        weekly:  weekSampleDates.map((d)  => weekLookup[d]?.[pKey]?.minutes  || 0),
        monthly: monthSampleDates.map((d) => monthLookup[d]?.[pKey]?.minutes || 0),
      },
      toneHistory: {
        daily:   allDayDates.map((d)       => dayLookup[d]?.[pKey]?.tone   || 0),
        weekly:  weekSampleDates.map((d)   => weekLookup[d]?.[pKey]?.tone  || 0),
        monthly: monthSampleDates.map((d)  => monthLookup[d]?.[pKey]?.tone || 0),
      },
    };
  });

  return {
    stats,
    dates: { daily: allDayDates, weekly: weekSampleDates, monthly: monthSampleDates },
  };
}

const CHART_W = 100;
// 30 et non 46 : la course passe en TÊTE du module, où elle sert de repère
// d'entrée et non de pièce à examiner. Une bande basse se lit d'un coup d'œil
// et laisse la place à la console, qui porte le détail.
const CHART_H = 30;
/** Marge droite réservée aux étiquettes de parti posées en bout de ligne.
 *  Resserrée pour que la ligne d'arrivée se rapproche du bord. */
/** Réserve à DROITE de la ligne d'arrivée, en unités du viewBox.
 *
 *  ZÉRO depuis le 2026-08-30 : l'arrivée touche le bord droit du tracé. Ces 9 %
 *  existaient pour loger les étiquettes de bout de ligne, qui vivaient alors
 *  dans le repère du graphique. Elles vivent maintenant dans `--marge-fin`, une
 *  réserve CSS posée HORS de la zone de tracé — garder les deux revenait à
 *  réserver la place deux fois, et à laisser un vide de 9 % après l'arrivée qui
 *  se lisait comme du chemin restant alors que la course y était finie. */
const CHART_PAD_R = 0;

const MONTHS_SHORT_FR = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** « 2026-07-10 » → « 10 juil. » */
function shortDateFr(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${Number(d)} ${MONTHS_SHORT_FR[Number(m) - 1]}`;
}

/**
 * Plafond de l'axe vertical : le multiple de 10 juste au-dessus du maximum
 * observé, plancher à 20 %.
 *
 * L'axe est TRONQUÉ, et c'est assumé : la course est passée au second plan
 * derrière le podium, et un axe jusqu'à 100 % y écrasait les cinq lignes dans
 * son tiers inférieur. La base reste à zéro, donc les rapports de hauteur
 * restent exacts — ce n'est pas le piège de l'axe qui démarre en l'air.
 *
 * Conséquence à ne pas oublier : le dégradé de fond ne peut PAS se caler sur ce
 * plafond, sinon la même bande de couleur désignerait un niveau différent d'un
 * jour à l'autre. Il est ancré sur des valeurs absolues, via `topPct`.
 */
function axisTop(maxPct: number): number {
  return Math.max(20, Math.ceil(maxPct / 10) * 10);
}

/** Le sommet de l'axe des MINUTES, arrondi à un palier lisible.
 *
 *  Les paliers suivent l'HORLOGE et non la base dix : on lit « 2 h » et
 *  « 30 min », jamais « 250 minutes ». Un axe qui grimpe par 100 obligerait à
 *  convertir de tête à chaque graduation. */
function paliersMinutes(maxMin: number): number {
  const paliers = [15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440];
  return paliers.find((p) => maxMin <= p) ?? Math.ceil(maxMin / 1440) * 1440;
}

/** Les graduations de l'axe des minutes, du bas vers le haut, zéro compris.
 *  Il l'était devenu nécessaire : le trait qui marquait le sol a été retiré pour
 *  alléger le graphique, et plus rien ne situait le départ de l'échelle. */
function graduationsMinutes(topMin: number): { label: string; y: number }[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    // Le zéro s'écrit « 0h » et non « 0 min » : il ouvre une échelle d'heures,
    // et `formatDuree` bascule en minutes sous l'heure.
    label: f === 0 ? "0h" : formatDuree(topMin * f),
    y: Number((CHART_H - f * CHART_H).toFixed(2)),
  }));
}


/** Écart vertical minimal entre deux étiquettes de bout de ligne, en unités du
 *  viewBox (hauteur totale 46). En dessous, elles se chevauchent. */
const MIN_LABEL_GAP = 4.2;

/**
 * Écarte verticalement les étiquettes trop proches, sans toucher aux points.
 *
 * Nécessaire dès que deux partis se tiennent : à un point de part de voix
 * d'écart, deux étiquettes se superposent et aucune n'est lisible — exactement
 * la situation d'une campagne serrée, donc celle où le module compte le plus.
 *
 * `series` est déjà trié par part de voix décroissante, donc par `lastY`
 * croissant. On descend la liste en poussant vers le bas ce qui est trop haut,
 * puis on remonte si le paquet a débordé du cadre.
 */
function spreadLabels(series: ChartSeries[]): void {
  for (const s of series) s.labelY = s.lastY;

  for (let i = 1; i < series.length; i++) {
    const min = series[i - 1].labelY + MIN_LABEL_GAP;
    if (series[i].labelY < min) series[i].labelY = min;
  }

  // Débordement par le bas : on repousse tout le paquet vers le haut.
  const overflow = (series.at(-1)?.labelY ?? 0) - CHART_H;
  if (overflow > 0) {
    for (const s of series) s.labelY -= overflow;
    for (let i = series.length - 2; i >= 0; i--) {
      const max = series[i + 1].labelY - MIN_LABEL_GAP;
      if (series[i].labelY > max) series[i].labelY = max;
    }
  }

  for (const s of series) s.labelY = Number(s.labelY.toFixed(2));
}

/**
 * Construit la course : toutes les lignes sur UNE échelle verticale commune.
 *
 * C'est la différence de fond avec les anciennes mini-courbes, qui étaient
 * normalisées chacune sur son propre min/max — pratique pour lire une forme
 * isolée, mais trompeur dès qu'on les met côte à côte : un parti à 2 % et un
 * parti à 40 % y occupaient exactement la même hauteur.
 */
/** 20 h, l'heure de publication du dernier bloc de la journée. */
const HEURE_ARRIVEE = 20;

/**
 * La ligne d'ARRIVÉE de chaque onglet, et la fenêtre de données à montrer.
 *
 *   Jour     → 20 h aujourd'hui, sur les sept derniers jours
 *   Semaine  → vendredi 20 h, sur les sept jours qui l'ouvrent (samedi → vendredi)
 *   Tout     → le jour du scrutin, sur toute la fenêtre suivie
 *
 * Chaque onglet a donc sa propre course et son propre but, au lieu d'une
 * course unique qui ne pouvait pas dire ce que « la journée » veut dire.
 */
function arrivee(range: RangeKey, derniere: string): { t: number; label: string; sub: string } {
  const j = new Date(`${derniere}T00:00:00Z`);
  if (range === "overall") {
    return {
      // L'ÉDITION DE 20 H DU JOUR DU SCRUTIN, et non son minuit.
      //
      // Depuis que les points sont posés sur les éditions (`instantDe`), une
      // arrivée à minuit tombait vingt heures AVANT le dernier point possible :
      // le jour du scrutin, la ligne aurait dépassé sa propre arrivée. Les deux
      // bornes se calculent maintenant de la même façon, donc elles coïncident
      // exactement le jour où la course se termine.
      t: Date.parse(`${ELECTION_DATE}T00:00:00Z`) + HEURE_ARRIVEE * 3_600_000,
      label: "Scrutin",
      sub: shortDateFr(ELECTION_DATE),
    };
  }
  if (range === "week") {
    // VENDREDI 20 h — mais d'une semaine qui S'OUVRE LE SAMEDI.
    //
    // C'est ce qui donne sept jours à l'axe sans déplacer l'arrivée : samedi,
    // dimanche, puis du lundi au vendredi. Une semaine lundi → vendredi n'en
    // comptait que cinq, et les repères s'arrêtant à l'arrivée, la fin de
    // semaine n'apparaissait jamais.
    //
    // Le rang du jour dans CETTE semaine : samedi = 0 … vendredi = 6.
    const rang = (j.getUTCDay() + 1) % 7;
    const vendredi = new Date(j);
    vendredi.setUTCDate(j.getUTCDate() + (6 - rang));
    return {
      t: vendredi.getTime() + HEURE_ARRIVEE * 3_600_000,
      label: "vendredi",
      sub: `${HEURE_ARRIVEE} h`,
    };
  }
  return { t: j.getTime() + HEURE_ARRIVEE * 3_600_000, label: "Arrivée", sub: `${HEURE_ARRIVEE} h` };
}

/**
 * Départ de l'axe, en regard de l'arrivée.
 *
 *   Semaine → le SAMEDI 00 h qui ouvre la semaine d'arrivée, six jours pleins
 *             avant le vendredi de la ligne d'arrivée.
 *   Tout    → le déclenchement du scrutin quand il est connu, sinon le début
 *             du suivi : mieux vaut un axe plus large qu'une date inventée.
 *   Jour    → la première journée montrée.
 */
/**
 * Le LUNDI 00h de la semaine qui contient `t`, en UTC comme le reste du
 * fichier. Une seule définition, partagée par la borne de l'axe et par ses
 * repères : c'est en les calculant chacun de leur côté qu'ils avaient divergé.
 */
/** Le SAMEDI 00 h qui ouvre la semaine contenant `t`.
 *
 *  La semaine de ce module va du samedi au vendredi : l'arrivée est le vendredi
 *  20 h, et les deux jours de fin de semaine qui la précèdent en font partie
 *  plutôt que d'en être exclus.
 *
 *  LA FORMULE VIT DANS `lib/semaine.ts`, PARTAGÉE avec la discothèque : ses
 *  albums hebdomadaires doivent compter EXACTEMENT la même semaine que ce
 *  palmarès, sans quoi « sept singles » ne voudrait pas dire la même chose aux
 *  deux endroits. Ce wrapper ne fait que convertir entre l'ISO du module
 *  partagé et les timestamps en millisecondes qu'emploie le reste de ce
 *  fichier. */
function samediDOuverture(t: number): number {
  const jourIso = new Date(t).toISOString().slice(0, 10);
  return Date.parse(`${samediDeLaSemaine(jourIso)}T00:00:00Z`);
}

function depart(range: RangeKey, premiere: string, arriveeT: number): number {
  if (range === "week") {
    // LUNDI 00h, la borne de la table du raffineur :
    // `floor_date(now_mtl, "week", week_start = 1)`
    // (radar-party-score-salient-shadow/runtime.R:271).
    //
    // L'axe partait du samedi et cumulait donc deux jours que la table ne
    // compte pas : la pochette annonçait 14h40 quand le palmarès finissait à
    // 17h16 pour la CAQ, et le classement du palmarès pouvait contredire celui
    // des decks (relevé d'Alexandre, PR #539). Le reste du module était déjà
    // calé sur le lundi — `arrivee()` cherche « le vendredi de la semaine en
    // cours (lundi = 1) » et le texte sous le graphique dit « depuis lundi ».
    // Seule cette borne-ci ne l'était pas.
    // Le SAMEDI de la semaine d'arrivée, à son ÉDITION DE 20 H.
    //
    // Pas à son minuit : l'axe porte les éditions, pas les minuits (voir
    // `instantDe` dans `buildChart`). Ouvrir à minuit laissait vingt heures
    // mortes avant le premier point, et surtout décalait les six intervalles
    // suivants — le vendredi tombait alors vingt heures AVANT sa propre ligne
    // d'arrivée. D'ici à l'arrivée il y a exactement six jours pleins, donc sept
    // repères régulièrement espacés dont le dernier est l'arrivée elle-même.
    return samediDOuverture(arriveeT) + HEURE_ARRIVEE * 3_600_000;
  }
  if (range === "overall" && ELECTION_CALL_DATE) {
    return Date.parse(`${ELECTION_CALL_DATE}T00:00:00Z`);
  }
  return Date.parse(`${premiere}T00:00:00Z`);
}

/** Nombre de journées montrées, par onglet.
 *
 *  `today` : 7 jours et non la seule journée. L'axe voulu — 22 h la veille à
 *  20 h — ne contiendrait qu'un point : le raffineur ne publie QU'UN relevé par
 *  jour, pris à 20 h. Tracer une tendance intra-journée demanderait qu'il
 *  conserve ses six blocs de 4 h au lieu de les écraser.
 *  `week` : 7 jours, soit exactement samedi à vendredi. */
const FENETRE: Record<RangeKey, number> = { today: 7, week: 7, overall: Infinity };

/**
 * La course — épurée : des lignes, leurs étiquettes de bout, deux dates, une
 * ligne d'arrivée. Ni grille, ni graduations, ni fond : l'objectif est de VOIR
 * LA TENDANCE, pas de lire une valeur au pixel près. Les valeurs, elles, sont
 * écrites en toutes lettres au bout de chaque ligne.
 */
/** La course d'UNE JOURNÉE, tracée sur ses blocs de 4 h.
 *
 *  L'onglet « Jour » montrait en réalité les sept derniers jours : le raffineur
 *  ne publiait qu'un relevé par journée, et une journée ne pouvait donc pas se
 *  tracer. Depuis aws-refiners#355 il conserve ses six blocs (00h … 20h), les
 *  mêmes que le sélecteur d'édition en tête du site.
 *
 *  L'axe couvre la journée ENTIÈRE, de minuit à 20h, même si la donnée s'arrête
 *  au bloc courant : le vide à droite est ce qu'il reste à courir, exactement
 *  comme la ligne d'arrivée des autres onglets.
 */
/** Le dernier bloc publié de la journée la plus récente.
 *
 *  On date les lignes avec `dateMontreal`, comme partout ailleurs dans ce
 *  fichier : `date_montreal_tz` porte en réalité la date UTC (le raffineur
 *  fait `as.Date()` sur un POSIXct, ce qui ignore le fuseau), si bien qu'un
 *  relevé de 21 h à Montréal est classé au lendemain. Se fier à la colonne
 *  ferait illustrer la mauvaise journée un soir sur deux. */
function dernierBloc(rows: IntradayRow[] | null): BlocCourant | null {
  if (!rows || rows.length === 0) return null;
  const date = rows.map(dateMontreal).sort().at(-1);
  if (!date) return null;
  const duJour = rows.filter((r) => dateMontreal(r) === date);
  const heures = duJour.map((r) => Number(r.block_hour)).filter((h) => Number.isFinite(h));
  if (heures.length === 0) return null;
  const hour = Math.max(...heures);
  const label = duJour.find((r) => Number(r.block_hour) === hour)?.block_label ?? null;
  return { date, hour, label: label ? String(label) : null };
}

/** Le pas des graduations de la journée : un repère toutes les quatre heures,
 *  00h, 04h … 20h. Les mêmes que le sélecteur d'édition en tête du site. */
const PAS_GRADUATION_H = 4;

/**
 * Le bloc, REMONTÉ à sa graduation.
 *
 * On TRICHE, et c'est délibéré. Le raffineur nomme un bloc par son heure de fin,
 * et rien ne garantit qu'elle tombe sur la grille : un passage qui couvre 7h à
 * 11h publie `block_hour: 11`, et le point se pose alors entre le repère de 08h
 * et celui de 12h. Sur un axe dont les seules références sont ces repères, un
 * point posé entre deux d'entre eux se lit comme une erreur de calage — on
 * cherche à quoi il correspond, il ne correspond à rien.
 *
 * On le remonte donc au repère SUIVANT : ce bloc est ce qu'on sait de la journée
 * au moment où l'on arrive à 12h, et c'est là qu'il se lit. Vers le haut et non
 * vers le bas, parce que redescendre à 08h daterait la mesure d'avant les
 * trois heures qu'elle couvre.
 *
 * Ce que ça coûte : l'abscisse d'un point n'est plus l'instant exact de sa
 * mesure, à moins de quatre heures près. Le module ne prétend rien de plus fin —
 * ses repères sont espacés de quatre heures.
 */
const surLaGraduation = (h: number): number =>
  Math.min(20, Math.max(0, Math.ceil(h / PAS_GRADUATION_H) * PAS_GRADUATION_H));

function buildChartIntraday(rows: IntradayRow[], parts: PartyKey[]): ChartView | null {
  if (rows.length === 0) return null;
  const dernierJour = rows.map(dateMontreal).sort().at(-1);
  // TRIÉ par heure BRUTE : deux blocs bâtards peuvent remonter sur la même
  // graduation (9h et 11h donnent 12h tous les deux), et les tables ci-dessous
  // gardent alors le dernier inscrit. Trié, le dernier est le plus récent —
  // donc, sur une mesure qui cumule depuis minuit, le plus complet.
  const duJour = rows
    .filter((r) => dateMontreal(r) === dernierJour)
    .sort((a, b) => Number(a.block_hour) - Number(b.block_hour));
  const heureBloc = (r: IntradayRow) => surLaGraduation(Number(r.block_hour));
  const blocs = [...new Set(duJour.map(heureBloc))].sort((a, b) => a - b);
  if (blocs.length <= 1) return null;

  const plotW = CHART_W - CHART_PAD_R;
  // 20h est le dernier bloc publié, donc la fin de l'axe : au-delà, le
  // raffineur ne produit plus rien avant le reset de minuit.
  const xAtH = (h: number) => (h / 20) * plotW;

  // Même définition de sourdine que le vumètre : le dernier au classement, pas
  // ceux sous un seuil. Jugée sur le dernier bloc publié, qui est l'état courant
  // de la journée — c'est ce que le vumètre montre au même instant.
  const valeurCourante = (key: PartyKey) =>
    duJour
      .filter((r) => String(r.party ?? "").toLowerCase() === key && heureBloc(r) === blocs.at(-1))
      .reduce((s, r) => s + (Number(r.weighted_mentions) || 0), 0);
  const sourdineCourse = clesEnSourdine(parts.map((k) => [k, valeurCourante(k)]));

  // Les MINUTES du bloc : `total_raw_score` EST la somme des `headline_minutes`
  // (radar-party-score-salient-shadow/runtime.R, où `total_raw_score` et
  // `total_minutes` sont calculés à l'identique avant que le second soit jeté).
  // Le nom trompe, la grandeur non.
  //
  // ⚠️ Le raffineur ACCUMULE depuis minuit à chaque passage : ces minutes sont
  // donc un cumul de la journée, pas le temps du bloc seul. La courbe monte.
  const minParBloc = (key: PartyKey) => {
    const m = new Map(
      duJour
        .filter((r) => String(r.party ?? "").toLowerCase() === key)
        .map((r) => [heureBloc(r), Number(r.total_raw_score) || 0]),
    );
    return blocs.map((h) => m.get(h) ?? 0);
  };
  const topMin = paliersMinutes(Math.max(0, ...parts.flatMap((k) => minParBloc(k))));
  const yMin = (m: number) => CHART_H - (topMin > 0 ? (m / topMin) * CHART_H : 0);

  /** Le TON de chaque bloc — la seconde piste du palmarès, celle du disque le
   *  plus APPRÉCIÉ. Contrairement aux minutes, le ton ne s'accumule pas : c'est
   *  l'état du vocabulaire au moment du relevé, et il monte comme il descend. */
  const tonParBloc = (key: PartyKey) => {
    const m = new Map(
      duJour
        .filter((r) => String(r.party ?? "").toLowerCase() === key)
        .map((r) => [heureBloc(r), Number(r.weighted_tone) || 0]),
    );
    return blocs.map((h) => m.get(h) ?? 0);
  };
  const yTon = (t: number) => CHART_H - ((Math.min(1, Math.max(-1, t)) + 1) / 2) * CHART_H;
  /** Même règle que la vue par journées : zéro minute en Une, aucun ton. Ici les
   *  minutes CUMULENT depuis minuit, donc un parti peut n'apparaître qu'à partir
   *  du bloc où on a commencé à en parler, et sa ligne démarre là. */
  const mesure = (key: PartyKey, i: number) => (minParBloc(key)[i] ?? 0) > 0;

  const derBloc = blocs.length - 1;
  const tonsFinaux = parts
    .filter((k) => mesure(k, derBloc))
    .map((k) => tonParBloc(k).at(-1) ?? 0);
  const sommeTons = tonsFinaux.reduce((a, b) => a + b, 0);
  const ecartAuxAutres = (ton: number): number | null =>
    tonsFinaux.length > 1 ? ton - (sommeTons - ton) / (tonsFinaux.length - 1) : null;

  const series: ChartSeries[] = parts.map((key) => {
    const parBloc = new Map(
      duJour
        .filter((r) => String(r.party ?? "").toLowerCase() === key)
        .map((r) => [heureBloc(r), Number(r.weighted_mentions) || 0]),
    );
    const hist = blocs.map((h) => parBloc.get(h) ?? 0);
    const pts = blocs.map((h, i) => [xAtH(h), soloY(hist)[i]] as const);
    const last = pts.at(-1)!;
    return {
      key,
      label: PARTY_LABELS[key],
      color: PARTY_COLORS[key],
      inShadow: sourdineCourse.has(key),
      polylineMin: minParBloc(key)
        .map((m, i) => `${xAtH(blocs[i]).toFixed(2)},${yMin(m).toFixed(2)}`)
        .join(" "),
      lastYMin: Number(yMin(minParBloc(key).at(-1) ?? 0).toFixed(2)),
      lastMinutes: Math.round(minParBloc(key).at(-1) ?? 0),
      polylineTon: tonParBloc(key)
        .map((t, i) => (mesure(key, i) ? `${xAtH(blocs[i]).toFixed(2)},${yTon(t).toFixed(2)}` : ""))
        .filter(Boolean)
        .join(" "),
      lastEcartTon: (() => {
        if (!mesure(key, derBloc)) return null;
        const e = ecartAuxAutres(tonParBloc(key).at(-1) ?? 0);
        return e === null ? null : Number(e.toFixed(4));
      })(),
      polyline: pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
      polylineSolo: pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
      lastX: Number(last[0].toFixed(2)),
      lastY: Number(last[1].toFixed(2)),
      labelY: Number(last[1].toFixed(2)),
      lastPct: Math.round((hist.at(-1) ?? 0) * 100),
    };
  });

  spreadLabels(series);

  return {
    series,
    xLabels: [0, 4, 8, 12, 16, 20].map((h) => ({
      label: `${String(h).padStart(2, "0")}h`,
      x: Number(xAtH(h).toFixed(2)),
    })),
    finish: { x: Number(xAtH(20).toFixed(2)), label: "20h", sub: "fin du jour" },
    width: CHART_W,
    height: CHART_H,
    tooShort: false,
    yLabels: graduationsMinutes(topMin),
    // Le raffineur accumule depuis minuit à chaque passage : le dernier bloc
    // vaut donc la journée entière, et c'est bien un total.
    mesureLabel: "depuis minuit",
  };
}

const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** Les repères de l'axe horizontal, propres à chaque onglet.
 *
 *  - `today`   : toutes les 4 h, soit les six blocs du pipeline (00h … 20h) —
 *                les mêmes que le sélecteur d'édition en tête du site, plutôt
 *                qu'un second vocabulaire du temps ;
 *  - `week`    : les SEPT jours de la semaine, y compris ceux à venir ;
 *  - `overall` : des dates en jj/mm, réparties jusqu'au scrutin.
 *
 *  Dans les trois cas les repères sont posés sur des instants, jamais sur les
 *  dates publiées : c'est ce qui laisse voir le chemin qu'il reste à parcourir.
 */
function reperesAxe(
  range: RangeKey,
  t0: number,
  tFin: number,
  xAt: (t: number) => number,
  axisDates: string[],
): { label: string; x: number }[] {
  const JOUR = 86_400_000;
  const out: { label: string; x: number }[] = [];
  const pousser = (t: number, label: string) => {
    const x = xAt(t);
    if (x >= -1 && x <= 101) out.push({ label, x: Number(x.toFixed(2)) });
  };

  if (range === "today") {
    // Minuit du dernier jour couvert, puis un repère toutes les 4 h.
    const dernier = axisDates.at(-1);
    if (!dernier) return [];
    const minuit = Date.parse(`${dernier}T00:00:00Z`);
    for (let h = 0; h <= 20; h += 4) pousser(minuit + h * 3_600_000, `${String(h).padStart(2, "0")}h`);
    return out;
  }

  if (range === "week") {
    // LES SEPT ÉDITIONS, du samedi 20 h au vendredi 20 h.
    //
    // Elles partent de `t0` et vont jusqu'à `tFin` : la boucle ne calcule donc
    // plus ses propres bornes, elle suit celles de l'axe. C'est ce qui garantit
    // que le dernier repère — « vendredi » — TOMBE EXACTEMENT SUR LA LIGNE
    // D'ARRIVÉE. Il tombait auparavant sur le minuit du vendredi, vingt heures
    // avant elle, et l'axe se lisait comme mal calé.
    //
    // Sept repères, six intervalles de 24 h, parfaitement réguliers.
    //
    // Le jour d'ARRIVÉE s'écrit en toutes lettres : le distinguer évite d'avoir
    // à poser une étiquette de plus au bout de l'axe.
    for (let t = t0; t <= tFin + 1; t += JOUR) {
      const j = new Date(t).getUTCDay();
      pousser(t, j === 5 ? "vendredi" : JOURS_COURTS[j]);
    }
    return out;
  }

  // `overall` : jusqu'à six dates en jj/mm, du début du suivi au scrutin.
  const REPERES = 6;
  const pas = (tFin - t0) / (REPERES - 1);
  for (let i = 0; i < REPERES; i += 1) {
    const d = new Date(t0 + i * pas);
    const jj = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    pousser(t0 + i * pas, `${jj}/${mm}`);
  }
  return out;
}

/** Les ordonnées d'une piste, normalisées sur la PROPRE amplitude du parti.
 *
 *  Une marge de 15 % en haut et en bas évite que le tracé colle aux bords : une
 *  courbe qui touche le plafond se lit comme tronquée.
 *
 *  Amplitude nulle (série parfaitement plate, ou parti à zéro toute la période)
 *  : on centre au lieu de diviser par zéro. Une ligne droite au milieu dit
 *  exactement ce qu'il y a à dire — rien n'a bougé. */
function soloY(hist: number[]): number[] {
  // Les bornes RÉELLES de la série, sans ancrage à zéro : `Math.min(..., 0)`
  // ramenait le plancher à 0, si bien qu'une série oscillant entre 33 % et 37 %
  // s'étalait sur une plage 0–37 et restait plate. C'est tout le contraire du
  // but : ici on veut voir le mouvement, le niveau étant dit par le chiffre.
  const hi = Math.max(...hist);
  const lo = Math.min(...hist);
  const marge = CHART_H * 0.15;
  const utile = CHART_H - 2 * marge;
  if (hi - lo < 1e-9) return hist.map(() => CHART_H / 2);
  return hist.map((v) => marge + (1 - (v - lo) / (hi - lo)) * utile);
}

function buildChart(stats: Stat[], dates: SeriesDates, range: RangeKey): ChartView {
  const toutes = dates.daily;
  const garde = FENETRE[range];
  const fenetre = Number.isFinite(garde) ? toutes.slice(-garde) : toutes;

  const plotW = CHART_W - CHART_PAD_R;
  const but = arrivee(range, fenetre.at(-1) ?? ELECTION_DATE);
  const t0 = depart(range, fenetre[0] ?? ELECTION_DATE, but.t);

  // LES BORNES DE L'AXE D'ABORD, LES POINTS ENSUITE : une date anterieure au
  // depart se dessinerait a gauche du cadre, hors champ. C'est ce qui arrivait
  // a la vue semaine, dont l'axe commence le samedi 00 h alors que la fenetre
  // de sept jours peut remonter au-dela.
  /** L'INSTANT D'UNE JOURNÉE SUR L'AXE : son ÉDITION DE 20 H, pas son minuit.
   *
   *  Le relevé quotidien du raffineur est une accumulation de FIN de journée :
   *  le poser à minuit le datait de son début, soit vingt heures trop tôt. Et
   *  c'est ce décalage qui empêchait le vendredi de tomber sur sa ligne
   *  d'arrivée — elle est à 20 h, le point était à 00 h.
   *
   *  Repères et points partagent maintenant la même fonction d'instant : une
   *  étiquette est toujours sous le point qu'elle nomme. */
  const instantDe = (iso: string) => Date.parse(`${iso}T00:00:00Z`) + HEURE_ARRIVEE * 3_600_000;
  const axisDates = fenetre.filter((iso) => instantDe(iso) >= t0);
  const decalage = toutes.length - axisDates.length;
  const n = axisDates.length;

  const histOf = (s: Stat) => s.history.daily.slice(decalage);
  /** Les minutes DU JOUR, jour par jour — et non plus leur cumul.
   *
   *  POURQUOI LE CUMUL A ÉTÉ ABANDONNÉ. Il servait quand le palmarès traçait des
   *  durées : une courbe qui ne fait que monter, comme un compteur de course.
   *  Depuis qu'il classe des RANGS, le cumul est exactement la mauvaise
   *  grandeur — il VERROUILLE l'ordre. Une fois devant, on y reste : mesuré sur
   *  trente-cinq jours du jeu d'essai, deux changements de classement dans les
   *  trois premiers jours, puis plus aucun pendant trente-deux. Un graphique de
   *  rangs sans croisement ne montre rien.
   *
   *  Les minutes du jour, elles, montent et redescendent au gré de l'actualité,
   *  et le classement bouge avec. C'est la question que la courbe pose :
   *  QUI MÈNE CE JOUR-LÀ.
   *
   *  ⚠️ CONSÉQUENCE HEUREUSE, à ne pas défaire par mégarde. Le palmarès ne
   *  publie plus de total de période : sa dernière valeur est celle du dernier
   *  jour. Il ne peut donc plus contredire la durée de la pochette, qui vient de
   *  la table hebdomadaire du raffineur — la divergence qu'ouvrait l'axe du
   *  samedi (cf. `libelleDepuis`) n'a plus de surface où se voir. */
  const minOf = (s: Stat) => s.minutesHistory.daily.slice(decalage);
  /** Le TON, jour par jour. Même fenêtre, mêmes abscisses que les minutes : les
   *  deux pistes se superposent exactement, et basculer de l'une à l'autre ne
   *  déplace aucun point sur l'axe du temps. */
  const tonOf = (s: Stat) => s.toneHistory.daily.slice(decalage);
  /** UN TON N'EXISTE QUE LÀ OÙ IL Y A EU DE LA COUVERTURE.
   *
   *  Le raffineur écrit `weighted_tone = 0` pour un parti dont aucun article ne
   *  parle, et ce zéro est indistinguable d'une couverture parfaitement
   *  équilibrée. Un parti silencieux se retrouvait donc classé au MILIEU du
   *  peloton, au-dessus de partis réellement malmenés, et sa valeur tirait en
   *  plus la référence des autres vers le neutre.
   *
   *  Les minutes tranchent : zéro minute en Une, aucune phrase à classer, donc
   *  aucun ton. C'est un signal déjà publié, exact, et qui ne demande rien au
   *  raffineur. */
  const mesure = (s: Stat, i: number) => (minOf(s)[i] ?? 0) > 0;

  /** L'écart au ton moyen des AUTRES partis MESURÉS, au dernier instant. Un
   *  parti sans couverture ne compte donc ni comme sujet ni comme repère. */
  const dernier = axisDates.length - 1;
  const tonsFinaux = stats.filter((st) => mesure(st, dernier)).map((st) => tonOf(st).at(-1) ?? 0);
  const sommeTons = tonsFinaux.reduce((a, b) => a + b, 0);
  const ecartAuxAutres = (ton: number): number | null =>
    tonsFinaux.length > 1 ? ton - (sommeTons - ton) / (tonsFinaux.length - 1) : null;
  const top = axisTop(Math.max(0, ...stats.flatMap(histOf)) * 100);
  // ÉCHELLE COMMUNE des minutes : c'est la comparaison des durées qui fait le
  // palmarès. Une échelle par parti dirait la forme, pas le classement.
  const topMin = paliersMinutes(Math.max(0, ...stats.flatMap(minOf)));
  const yMin = (m: number) => CHART_H - (topMin > 0 ? (m / topMin) * CHART_H : 0);
  /** Le ton, de -1 à +1, reporté sur la hauteur. Borné : la mesure peut sortir
   *  de l'intervalle sur de très petits volumes, et un point hors cadre se
   *  lirait comme une erreur de tracé plutôt que comme une valeur extrême. */
  const yTon = (t: number) => CHART_H - ((Math.min(1, Math.max(-1, t)) + 1) / 2) * CHART_H;
  const span = Math.max(but.t - t0, 86_400_000);
  const xAt = (t: number) => ((t - t0) / span) * plotW;
  const xAtDate = (iso: string) => xAt(instantDe(iso));
  const yAt = (pct: number) => CHART_H - (pct / top) * CHART_H;

  // Même définition de sourdine que le vumètre (voir `clesEnSourdine`).
  const sourdineCourse = clesEnSourdine(stats.map((s) => [s.key, histOf(s).at(-1) ?? 0]));

  const series: ChartSeries[] = stats
    .slice()
    .sort((a, b) => histOf(b).at(-1)! - histOf(a).at(-1)!)
    .map((stat) => {
      const hist = histOf(stat);
      const mins = minOf(stat);
      const tons = tonOf(stat);
      const pts = hist.map((v, i) => [xAtDate(axisDates[i] ?? ""), yAt(v * 100)] as const);
      const ptsMin = mins.map((m, i) => [xAtDate(axisDates[i] ?? ""), yMin(m)] as const);
      return {
        key: stat.key,
        label: PARTY_LABELS[stat.key],
        color: PARTY_COLORS[stat.key],
        inShadow: sourdineCourse.has(stat.key),
        polyline: pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
      polylineSolo: soloY(hist)
        .map((y, i) => `${xAtDate(axisDates[i] ?? "").toFixed(2)},${y.toFixed(2)}`)
        .join(" "),
        lastX: Number((pts.at(-1)?.[0] ?? 0).toFixed(2)),
        lastY: Number((pts.at(-1)?.[1] ?? CHART_H).toFixed(2)),
        labelY: 0,
        lastPct: Math.round((hist.at(-1) ?? 0) * 100),
        polylineMin: ptsMin.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
        lastYMin: Number((ptsMin.at(-1)?.[1] ?? CHART_H).toFixed(2)),
        // La dernière valeur est celle du DERNIER JOUR, pas un total de période :
        // c'est la grandeur sur laquelle la ligne vient d'être classée, donc la
        // seule que l'étiquette puisse afficher à côté de son rang sans le
        // contredire.
        lastMinutes: Math.round(mins.at(-1) ?? 0),
        // Seuls les instants MESURÉS sont tracés : ailleurs, la ligne n'a pas
        // de place à occuper, et lui en donner une inventerait un classement.
        polylineTon: tons
          .map((t, i) =>
            mesure(stat, i) ? `${xAtDate(axisDates[i] ?? "").toFixed(2)},${yTon(t).toFixed(2)}` : "",
          )
          .filter(Boolean)
          .join(" "),
        lastEcartTon: (() => {
          if (!mesure(stat, dernier)) return null;
          const e = ecartAuxAutres(tons.at(-1) ?? 0);
          return e === null ? null : Number(e.toFixed(4));
        })(),
      };
    });

  spreadLabels(series);

  // L'AXE SE CONSTRUIT SUR LE TEMPS, pas sur les dates présentes dans la donnée.
  //
  // C'est ce qui permet d'étiqueter des jours À VENIR : sur la semaine, l'axe
  // court jusqu'au vendredi même si la donnée s'arrête mercredi, et le lecteur
  // voit ce qu'il reste à courir. Une version antérieure dérivait les repères
  // des dates publiées, donc l'axe s'arrêtait avec elles.
  const xLabels = reperesAxe(range, t0, but.t, xAt, axisDates);

  return {
    series,
    xLabels,
    finish: { x: Number(xAt(but.t).toFixed(2)), label: but.label, sub: but.sub },
    width: CHART_W,
    height: CHART_H,
    tooShort: n <= 1,
    yLabels: graduationsMinutes(topMin),
    mesureLabel: axisDates.at(-1) ? `le ${shortDateFr(axisDates.at(-1)!)}` : "ce jour-là",
};
}

/** Les indices de `history.daily` qui tombent dans la fenêtre de l'onglet.
 *
 *  Même borne que `libellePeriode`, et pour la même raison : les chiffres
 *  affichés doivent porter sur exactement la période que le module annonce. */
function fenetreDeLOnglet(range: RangeKey, joursIso: string[]): number[] {
  const tous = joursIso.map((_, i) => i);
  if (joursIso.length === 0) return tous;
  const dernier = joursIso[joursIso.length - 1];

  // « Jour » compte sur les SEPT DERNIERS jours, pas sur la seule journée.
  //
  // Sur un seul jour, « en tête 1 jour sur 1 » et « 0 point d'évolution » ne
  // disent rien : ce sont des cases remplies, pas des informations. La courbe
  // de la platine trace déjà sept jours dans cet onglet ; les chiffres suivent
  // donc la même fenêtre, et l'affichage porte son propre libellé (« sur 7 »),
  // ce qui les garde exacts sans dépendre du titre de l'onglet.
  if (range === "today") return tous.slice(-7);
  if (range === "overall") return tous;

  const lundis = joursIso.filter(
    (j) => j <= dernier && new Date(`${j}T12:00:00Z`).getUTCDay() === 1,
  );
  const debut = joursIso.indexOf(lundis[lundis.length - 1] ?? joursIso[0]);
  return tous.filter((i) => i >= debut);
}

/** Trois chiffres « qui parlent », par parti, sur la fenêtre de l'onglet.
 *
 *  La platine affichait des mesures exactes mais muettes : une part de voix et
 *  un écart relatif ne disent pas au lecteur ce qui s'est PASSÉ. Un rang, un
 *  nombre de journées en tête et une évolution en points se recopient dans une
 *  phrase sans calcul intermédiaire.
 *
 *  En points de pourcentage et jamais en pourcentage d'un pourcentage :
 *  « +12 points » est sans ambiguïté, « +34 % » ne dit pas si l'on parle de
 *  points ou d'un rapport, et c'est exactement le genre d'ambiguïté qui finit
 *  mal citée. */
function chiffresParlants(
  stat: Stat,
  tousLesStats: Stat[],
  fenetre: number[],
): { joursEnTete: number; joursComptes: number; evolutionPts: number } {
  let joursEnTete = 0;
  for (const i of fenetre) {
    const valeurs = tousLesStats.map((s) => s.history.daily[i] ?? 0);
    const max = Math.max(...valeurs);
    // Une journée sans aucune détection n'a pas de meneur : la compter en
    // donnerait une au premier parti de la liste, par pur effet d'ordre.
    if (max > 0 && (stat.history.daily[i] ?? 0) === max) joursEnTete += 1;
  }

  const premier = stat.history.daily[fenetre[0]] ?? 0;
  const dernier = stat.history.daily[fenetre[fenetre.length - 1]] ?? 0;

  return {
    joursEnTete,
    joursComptes: fenetre.length,
    evolutionPts: Math.round((dernier - premier) * 100),
  };
}

/** Les enjeux du dernier jour publié, groupés par parti et triés.
 *
 *  On garde les CINQ premiers : au-delà, la queue est faite de parts sous 3 %
 *  que le lecteur ne peut pas comparer utilement, et qui allongeraient la
 *  platine sans rien apprendre. La somme des parts d'un parti vaut 100 sur la
 *  table complète, donc le total affiché est volontairement inférieur — c'est
 *  un « les plus présents », pas une répartition exhaustive.
 */
/** La matrice parti × enjeu du dernier jour publié.
 *
 *  On somme les MINUTES et non les parts : `issue_share` est normalisée par
 *  parti (elle vaut 1 pour chacun), donc l'additionner entre partis n'aurait
 *  aucun sens. Les minutes, elles, sont dans la même unité partout — c'est ce
 *  qui permet de renormaliser après filtrage.
 */
/** Le libellé de l'enjeu de reste, tel que le raffineur le publie. Doit rester
 *  identique à `SANS_ENJEU` dans `radar-party-score-salient-shadow/runtime.R` :
 *  les deux se répondent, et une divergence ferait passer le reste pour un
 *  treizième sujet. */
export const SANS_ENJEU = "Aucun enjeu identifié";

/** Les 21 têtes CAP fines, agrégées en 12 catégories, puis nommées.
 *
 *  L'AGRÉGATION N'EST PAS DE MON INVENTION : elle est reprise telle quelle de
 *  `THEME_TO_CATEGORY`, identique dans `radar-issues-score/runtime.R` et
 *  `agora-decideurs-qc/runtime.R`. Les recopier plutôt que d'en imaginer une
 *  autre est ce qui garde ce module comparable aux enjeux saillants et à
 *  l'Assemblée : trois modules qui découperaient l'actualité différemment ne se
 *  liraient plus ensemble.
 *
 *  Elle tranche notamment deux cas qui n'ont pas de catégorie évidente :
 *  `transportation` et `housing` sont rattachés à « Culture et nationalisme ».
 *  Surprenant, mais c'est la convention en place — la changer ici la ferait
 *  diverger des deux autres raffineurs en silence.
 *
 *  Les libellés viennent du dictionnaire `CAP_ISSUES` de `radar-event-salience`,
 *  qui note : « les libellés FR sont ceux du Polimètre […] c'est la seule
 *  orthographe publiée côté Vitrine, tous modules confondus. Ne pas les
 *  reformuler. »
 */
const THEME_VERS_CATEGORIE: Record<string, string> = {
  macroeconomics: "Économie et travail",
  labor: "Économie et travail",
  domestic_commerce: "Économie et travail",
  foreign_trade: "Économie et travail",
  rights_liberties_minorities_discrimination: "Droits, libertés, minorités et discrimination",
  health: "Santé et politiques sociales",
  social_welfare: "Santé et politiques sociales",
  public_lands: "Terres publiques et agriculture",
  agriculture: "Terres publiques et agriculture",
  immigration: "Immigration",
  education: "Éducation",
  environment: "Environnement et énergie",
  energy: "Environnement et énergie",
  law_and_crime: "Loi et crime",
  international_affairs: "Affaires internationales et défense",
  defense: "Affaires internationales et défense",
  technology: "Technologie",
  governments_governance: "Gouvernements et gouvernance",
  culture_nationalism: "Culture et nationalisme",
  transportation: "Culture et nationalisme",
  housing: "Culture et nationalisme",
};

/** La catégorie d'affichage d'une tête CAP, tolérante à une clé inconnue.
 *
 *  La liste des modèles est DÉCOUVERTE à l'exécution par
 *  `radar-data-preparation` (`startsWith(id, "cap_theme_")`), jamais figée : une
 *  tête ajoutée en amont arriverait ici sans correspondance. On la rend lisible
 *  plutôt que d'afficher une clé brute ou, pire, de la jeter — un enjeu absent
 *  fausserait les parts, qui doivent sommer à 1. Elle apparaîtra alors comme une
 *  treizième catégorie, ce qui est un signal utile : il manque une entrée.
 */
export function libelleEnjeu(cle: string): string {
  if (cle === SANS_ENJEU) return cle;
  const connu = THEME_VERS_CATEGORIE[cle];
  if (connu) return connu;
  const brut = cle.replace(/_/g, " ").trim();
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

function buildEnjeuMix(rows: IssueRow[]): EnjeuMix {
  const vide: EnjeuMix = { enjeux: [], parParti: {} };
  if (rows.length === 0) return vide;

  const dernier = rows.map(dateMontreal).sort().at(-1);
  const duJour = rows.filter((r) => dateMontreal(r) === dernier);
  if (duJour.length === 0) return vide;

  const parParti: EnjeuMix["parParti"] = {};
  const totalParEnjeu = new Map<string, number>();

  for (const r of duJour) {
    const key = String(r.party ?? "").toLowerCase();
    if (!(PARTY_KEYS as readonly string[]).includes(key)) continue;
    const theme = String(r.theme ?? "");
    if (!theme) continue;
    const score = Number(r.total_raw_score) || 0;
    const nom = libelleEnjeu(theme);
    (parParti[key] ??= {})[nom] = { score, tone: Number(r.weighted_tone) || 0 };
    totalParEnjeu.set(nom, (totalParEnjeu.get(nom) ?? 0) + score);
  }

  // Ordre STABLE, du plus au moins présent tous partis confondus : une banque
  // de pads dont les touches changent de place à chaque mise à jour serait
  // injouable.
  // L'enjeu de RESTE est forcé en dernier, quel que soit son poids : il occupe
  // toute la largeur de la banque, donc le laisser au milieu du classement
  // couperait la grille en deux. Et il se lit de toute façon comme un pied de
  // liste, pas comme un sujet parmi les autres.
  const enjeux = [...totalParEnjeu.entries()]
    .sort((a, b) => {
      if (a[0] === SANS_ENJEU) return 1;
      if (b[0] === SANS_ENJEU) return -1;
      return b[1] - a[1] || a[0].localeCompare(b[0], "fr");
    })
    .map(([theme]) => theme);

  return { enjeux, parParti };
}

function buildEnjeux(rows: IssueRow[]): Map<PartyKey, EnjeuView[]> {
  const out = new Map<PartyKey, EnjeuView[]>();
  if (rows.length === 0) return out;

  const dernier = rows.map(dateMontreal).sort().at(-1);

  for (const key of PARTY_KEYS) {
    const siens = rows
      .filter(
        (r) => String(r.party ?? "").toLowerCase() === key && dateMontreal(r) === dernier,
      )
      .sort((a, b) => Number(b.issue_share) - Number(a.issue_share))
      .slice(0, 5);

    if (siens.length === 0) continue;

    // Le reste des enjeux, en un sixième pad. Une banque de pads se remplit par
    // bancs pairs, et surtout la queue de distribution EST une information :
    // sans elle, cinq parts qui ne somment pas à 100 laisseraient croire à une
    // erreur de calcul.
    const cumul = siens.reduce((t, r) => t + Number(r.issue_share), 0);
    const reste = Math.max(0, 1 - cumul);

    out.set(
      key,
      [...siens.map((r) => {
        const t = Number(r.weighted_tone) || 0;
        const dir = t > TONE_THRESHOLD ? "positive" : t < -TONE_THRESHOLD ? "negative" : "neutral";
        return {
          label: libelleEnjeu(String(r.theme ?? "")),
          pct: Math.round(Number(r.issue_share) * 100),
          // « Favorable / défavorable », jamais « positif / négatif » : règle du
          // guide de rédaction pour ce module.
          toneLabel: dir === "positive" ? "Favorable" : dir === "negative" ? "Défavorable" : "Neutre",
          toneDirection: dir as EnjeuView["toneDirection"],
        };
      }),
      ...(reste > 0.01
        ? [{
            label: "Autres enjeux",
            pct: Math.round(reste * 100),
            toneLabel: "Neutre",
            toneDirection: "neutral" as const,
            reste: true,
          }]
        : []),
      ],
    );
  }
  return out;
}

function buildRangeView(stats: Stat[], range: RangeKey, dates: SeriesDates, chartJour?: ChartView | null, enjeux?: Map<PartyKey, EnjeuView[]>): RangeView {
  const cfg = RANGE_CONFIG[range];
  const sorted = stats.slice().sort((a, b) => b.sov[cfg.barKey] - a.sov[cfg.barKey]);
  const fenetre = fenetreDeLOnglet(range, dates.daily);
  const sourdine = clesEnSourdine(sorted.map((s) => [s.key, s.sov[cfg.barKey]]));

  const rows: RowView[] = sorted.map((stat, idx) => {
    const parlants = chiffresParlants(stat, stats, fenetre);
    const sov = stat.sov[cfg.barKey];
    const sovPct = Math.round(sov * 100);
    const barWidthPct = Math.min(100, sov * 100);

    const refSov = stat.sov[cfg.refKey];
    const refLeftPct = Math.min(100, refSov * 100);
    const refTitle = `${cfg.refLabel}\u00a0: ${Math.round(refSov * 100)}\u00a0%`;

    // Le ton suit la MÊME série que la courbe du même onglet : le portrait
    // global lit le journalier, donc son ton aussi.
    const toneHist =
      range === "week" ? stat.toneHistory.weekly : stat.toneHistory.daily;
    const streak = computeToneStreak(toneHist);
    const unclamped = toneHist.length > 0 ? toneHist[toneHist.length - 1] : 0;
    const unit = range === "week" ? "sem." : streak.count > 1 ? "jours" : "jour";
    const arrow =
      streak.direction === "positive" ? "↑" : streak.direction === "negative" ? "↓" : "—"; // garde-redaction: ok (tiret = glyphe, aucune direction)
    // « Favorable / défavorable », jamais « positif / négatif » : règle du guide
    // de rédaction pour CE module. Un ton « positif » se lit comme un jugement
    // sur le parti ; « favorable » dit ce qu'on mesure vraiment, l'orientation
    // de la couverture. La distinction compte d'autant plus qu'un journaliste
    // peut citer ce mot tel quel.
    const dirLabel =
      streak.direction === "positive"
        ? "Favorable"
        : streak.direction === "negative"
          ? "Défavorable"
          : "Neutre";
    const toneLabel =
      streak.direction === "neutral" || streak.count <= 1 || range === "today"
        ? `${arrow} ${dirLabel}`
        : `${arrow} ${dirLabel}  ${streak.count} ${unit}`;
    /* ⚠️ CETTE PHRASE A DIT FAUX jusqu'au 2026-08-31, et il faut savoir pourquoi
       pour ne pas y revenir.
       
       Elle annonçait « Proportion nette de mots favorables : +24,30 % ». AUCUN
       MOT N'EST COMPTÉ NULLE PART. Ce que le raffineur produit
       (radar-party-score-salient-shadow/runtime.R:142) est tout autre chose :
       chaque PHRASE qui nomme le parti est classée favorable, défavorable ou
       neutre par le modèle, et vaut alors `+confiance`, `-confiance` ou zéro.
       Ces valeurs sont moyennées sur les phrases du parti, puis sur les
       articles, pondérées par leurs MINUTES EN UNE.
       
       L'écart n'était pas cosmétique : une « proportion de mots » se vérifie en
       comptant des mots, et un journaliste citant le chiffre aurait décrit une
       méthode qui n'existe pas. Le pourcentage aggravait le tout, la mesure
       n'étant une part de rien.
       
       La formulation dit maintenant les trois choses qui la définissent : ce
       qu'on classe (des phrases), ce qui les pondère (la confiance, puis le
       temps en Une), et sur quelle échelle on lit le résultat. */
    // Vocabulaire aligné sur la manchette : « du temps », jamais « couverture ».
    const toneValeur = `${unclamped >= 0 ? "+" : "\u2212"}${Math.abs(unclamped).toFixed(2).replace(".", ",")}`;
    const toneTitle =
      `Ton\u00a0: ${toneLabel}. Orientation moyenne des phrases qui nomment le parti, ` +
      `pondérée par la confiance du classement puis par le temps passé en Une\u00a0: ` +
      `${toneValeur} sur une échelle de \u22121 (défavorable) à +1 (favorable).`;
    // Le ton report\u00e9 sur une jauge de 0 \u00e0 100, born\u00e9 : -1 \u2192 0, 0 \u2192 50, +1 \u2192 100.
    const tonePct = Math.round(Math.min(1, Math.max(-1, unclamped)) * 50 + 50);

    const rawHistory =
      range === "week" ? stat.history.weekly : stat.history.week;
    const pts = sparkPoints(rawHistory, SPARK_W, SPARK_H);
    const polyline = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

    const sampled = samplePoints(pts, SPARK_CIRCLE_COUNT);
    const circles = sampled.map((p, i) => ({
      cx: Number(p[0].toFixed(1)),
      cy: Number(p[1].toFixed(1)),
      r: i === sampled.length - 1 ? 3.5 : 2.5,
    }));

    const dailyHist = stat.history.daily;
    const peakIdx = dailyHist.reduce((best, v, i) => (v > dailyHist[best] ? i : best), 0);

    return {
      key: stat.key,
      label: PARTY_LABELS[stat.key],
      /** Nom officiel complet, pour les textes destinés à être cités. */
      fullLabel: PARTY_FULL_NAMES[stat.key],
      rang: idx + 1,
      minutesUne: Math.round(stat.minutes[cfg.barKey] ?? 0),
      enjeux: enjeux?.get(stat.key) ?? [],
      enjeuxVentiles: enjeux != null,
      joursEnTete: parlants.joursEnTete,
      joursComptes: parlants.joursComptes,
      evolutionPts: parlants.evolutionPts,
      inShadow: sourdine.has(stat.key),
      peakPct: Math.round((dailyHist[peakIdx] ?? 0) * 100),
      peakDate: dates.daily[peakIdx] ?? "",
      color: PARTY_COLORS[stat.key],
      sovPct,
      barWidthPct: Number(barWidthPct.toFixed(1)),
      barTitle: `${sovPct}\u00a0% du temps consacré aux partis`,
      refLeftPct: Number(refLeftPct.toFixed(1)),
      refTitle,
      showLeaderLabel: idx === 0 && !sourdine.has(stat.key),
      toneLabel,
      toneDirection: streak.direction,
      toneTitle,
      tonePct,
      sparkPolyline: polyline,
      sparkCircles: circles,
    };
  });

  return {
    range,
    tabLabel: TAB_LABELS[range],
    sparkHeadLabel: SPARK_HEAD_LABELS[range],
    refLabel: cfg.refLabel,
    periodeLabel: libellePeriode(range, dates.daily),
    depuisLabel: libelleDepuis(range, dates.daily),
    rows,
    // Vue JOUR sans détail horaire : on ne trace RIEN.
    //
    // `buildChart` sait tracer des jours, pas des heures : son axe couvre toute
    // la fenêtre du suivi, et les six repères horaires d'une seule journée s'y
    // écrasaient dans les 12 % de droite (mesuré : 00h à 79,9 et 20h à 91 sur un
    // axe de 91). Un axe faux est pire qu'un axe absent : il se lit comme une
    // mesure.
    //
    // UNE SEULE raison publiée pour les deux chemins qui mènent ici :
    // `chartJour` à `null` (agrégat, table intra-journée manquante ou réduite à
    // un bloc) et à `undefined` (vue PAR MÉDIA, l'appelant ne le passe pas).
    // Ils portaient deux raisons distinctes, dont `sans-detail-horaire` pour la
    // seconde — que rien ne pouvait afficher : le palmarès lit TOUJOURS
    // l'agrégat, donc une vue par média n'atteint aucun rendu. Distinguer deux
    // cas dont un seul se voit, c'est se donner une garantie qu'on n'a pas.
    chart:
      range === "today"
        ? chartJour ?? {
            ...buildChart(stats, dates, range),
            tooShort: true,
            raison: "detail-horaire-absent" as const,
          }
        : buildChart(stats, dates, range),
  };
}

/** La période couverte, écrite pour être RECOPIÉE dans un article.
 *
 *  Un chiffre de part de voix ne veut rien dire sans sa fenêtre : « la CAQ à
 *  35 % » se cite mal, « la CAQ à 35 % du 11 au 17 août » se cite. Le libellé
 *  est donc calculé ici, où les dates réelles de la série sont disponibles,
 *  plutôt que reconstruit côté client à partir d'une étiquette d'onglet.
 *
 *  Il décrit la donnée EFFECTIVEMENT présente, pas la fenêtre théorique de
 *  l'onglet : si le raffineur n'a publié que trois jours cette semaine, la
 *  phrase dit ces trois jours. */
/** Depuis quand la mesure court, en toutes lettres.
 *
 *  Ce n'est PAS une fenêtre glissante. Le raffineur accumule depuis un point de
 *  départ et remet à zéro au calendrier : minuit pour la journée, le lundi pour
 *  la semaine. Écrire « depuis les 4 dernières heures » sur la vue jour serait
 *  faux — le bloc de 4 h est la fréquence de PUBLICATION, pas la fenêtre
 *  mesurée : à 16h, la colonne porte tout ce qui s'est dit depuis minuit.
 *
 *  ⚠️ « DEPUIS LUNDI » DÉCRIT LA TABLE, PAS L'AXE DU PALMARÈS — et depuis le
 *  2026-08-30 les deux ne coïncident plus.
 *
 *  Le raffineur agrège sa semaine avec `week_start = 1`, donc du lundi, et c'est
 *  de cette table que viennent les minutes de la pochette : ce libellé est exact
 *  pour elle. L'axe du palmarès, lui, ouvre la semaine le SAMEDI, pour que la
 *  fin de semaine apparaisse avant une arrivée fixée au vendredi 20h. Il cumule
 *  donc deux journées que la table n'agrège pas.
 *
 *  C'est exactement la divergence qu'avait corrigée la PR #539 — la pochette
 *  annonçait 14h40 quand le palmarès finissait à 17h16 pour le même parti, sur
 *  le même écran. Elle est rétablie en connaissance de cause, à la demande, et
 *  mesurée par un test (« le palmarès cumule DEUX JOURS DE PLUS que la
 *  pochette »). La seule vraie correction est côté raffineur : agréger la
 *  semaine du samedi. Tant qu'elle n'est pas faite, ne pas « réparer » l'un des
 *  deux côtés sans l'autre.
 */
function libelleDepuis(range: RangeKey, joursIso: string[]): string {
  if (range === "today") return "depuis minuit";
  if (range === "week") return "depuis lundi";
  const jours = joursIso.filter(Boolean);
  const premier = jours[0];
  return premier ? `depuis le ${formatDateFr(premier).toLowerCase()}` : "depuis le début du suivi";
}

function libellePeriode(range: RangeKey, joursIso: string[]): string {
  const jours = joursIso.filter(Boolean);
  if (jours.length === 0) return "";
  const dernier = jours[jours.length - 1];

  if (range === "today") return `le ${formatDateFr(dernier).toLowerCase()}`;

  // La semaine du raffineur repart le lundi : on borne au dernier lundi présent
  // dans la série plutôt qu'aux 7 derniers jours, sinon le libellé annoncerait
  // une fenêtre que la donnée ne couvre pas.
  // Le DERNIER lundi, pas le premier : la série couvre plusieurs semaines, et
  // chercher par le début annonçait « du 20 juillet au 17 août » pour un onglet
  // qui montre une semaine.
  const lundis = jours.filter(
    (j) => j <= dernier && new Date(`${j}T12:00:00Z`).getUTCDay() === 1,
  );
  const premier = range === "week" ? (lundis[lundis.length - 1] ?? jours[0]) : jours[0];

  if (premier === dernier) return `le ${formatDateFr(dernier).toLowerCase()}`;
  return `du ${formatDateFr(premier).toLowerCase()} au ${formatDateFr(dernier).toLowerCase()}`;
}

// Exports réservés aux tests unitaires (pipeline interne ; pas l'API publique).
export const __test__ = {
  buildLookup,
  computeStats,
  sparkPoints,
  samplePoints,
  buildRangeView,
  buildChart,
  buildChartIntraday,
  dateMontreal,
  axisTop,
  detecterIndisponibilite,
  samediDOuverture,
};

// Par défaut : la donnée réelle publiée par fetch_data.R. En développement
// LOCAL, VITRINE_PARTIES_FIXTURES pointe vers un jeu FICTIF au même schéma
// (cf. scripts/make_parties_fixtures.mjs) — utile pour juger un changement
// visuel sans dépendre de ce que les raffineurs ont produit à l'instant.
//
// ⚠️ N'EST PLUS FORCÉE SUR LE MIROIR DEV depuis le 2026-09-01 : elle l'était
// tant que le modèle des partis restait dégénéré (un seul parti détecté,
// aws-refiners#223/#248) et pour garder dev identique au miroir GitHub
// Pages — débranché depuis. Le modèle a été réentraîné (§06 de la
// méthodologie) ; dev lit maintenant l'API comme le reste du build. Variable
// absente ⇒ comportement inchangé.
const SUR_FIXTURES = Boolean(process.env.VITRINE_PARTIES_FIXTURES);

// GARDE-FOU : des fausses données ne doivent JAMAIS partir en production.
//
// Le signal est NEXT_PUBLIC_SITE_ENV, et non plus « basePath vide ». Ce dernier
// signifiait « production » tant que le miroir dev vivait sous un sous-chemin
// GitHub Pages. Depuis que le dev est servi à la racine de son propre domaine
// (dev.vitrinedemocratique.com), son basePath est vide LUI AUSSI : l'ancien
// signal aurait classé le dev comme production et fait échouer son build.
//
// On garde le principe du commentaire d'origine — UN seul signal, partagé avec
// `app/robots.ts`, pour qu'ils ne puissent pas diverger — on remplace seulement
// une déduction fragile par une déclaration explicite.
//
// Le défaut est SÛR : tout ce qui n'est pas explicitement « dev » compte comme
// production. Oublier la variable fait échouer le build au lieu de publier des
// chiffres inventés sur les partis politiques.
//
// Restreint aux builds de CI : en local, bloquer interdirait précisément
// l'usage pour lequel les fixtures existent.
if (SUR_FIXTURES && process.env.CI && process.env.NEXT_PUBLIC_SITE_ENV !== "dev") {
  throw new Error(
    "VITRINE_PARTIES_FIXTURES est défini sur un build qui n'est pas le miroir dev " +
      `(NEXT_PUBLIC_SITE_ENV=${process.env.NEXT_PUBLIC_SITE_ENV ?? "<absent>"}). ` +
      "Les fausses données du module des partis sont réservées au dev. " +
      "Retirez la variable, ou posez NEXT_PUBLIC_SITE_ENV=dev si c'est bien un build dev.",
  );
}

const DATA_DIR = SUR_FIXTURES
  ? path.resolve(process.cwd(), process.env.VITRINE_PARTIES_FIXTURES as string)
  : path.resolve(process.cwd(), "public", "data", "refined");

export async function loadParties(
  /** Édition passée (#434) : jour de publication de l'édition affichée. Ce
   *  module est publié une fois par JOUR — son archive est donc exacte au jour,
   *  pas au bloc de 4 h. Naviguer de l'édition de 8 h à celle de midi le laisse
   *  identique, et c'est la vérité : rien n'a été republié entre les deux. */
  asOfIso?: string,
): Promise<PartiesData | null> {
  try {
    // SUR FIXTURES, ON NE PASSE JAMAIS PAR L'API : les fausses données vivent
    // dans un dossier local et n'existent nulle part en base. Confondre les
    // deux ferait apparaître de vrais chiffres sous le bandeau « DONNÉES
    // FICTIVES », ou l'inverse — les deux étant pires qu'une erreur franche.
    const lireJeu = (periode: "day" | "week" | "month", fichier: string) =>
      SUR_FIXTURES
        ? fs.readFile(path.join(DATA_DIR, periode, fichier), "utf8")
        : readDatasetText(`public/data/refined/${periode}/${fichier}`);

    const [dayRaw, weekRaw, monthRaw] = await Promise.all([
      lireJeu("day",   "provincial_parties_salient_shadow_day.json"),
      lireJeu("week",  "provincial_parties_salient_shadow_week.json"),
      lireJeu("month", "provincial_parties_salient_shadow_month.json"),
    ]);

    // La série intra-journée est FACULTATIVE : elle n'existe que depuis
    // aws-refiners#355, et les archives antérieures n'en ont pas. Son absence
    // fait retomber l'onglet « Jour » sur la courbe au jour le jour, plutôt que
    // de casser tout le module.
    // Le croisement parti × enjeu, lui aussi FACULTATIF : la table date
    // d'aws-refiners#355 et les archives antérieures n'en ont pas.
    // ⚠️ Ces deux tables passent par `lireJeu`, comme les trois principales, et
    // NON par un `fs.readFile` direct. C'est ce qui les fait venir de l'API.
    // Lues sur le disque, elles étaient introuvables hors fixtures : le dossier
    // `public/data/refined/` ne contient que ce que `fetch_data.R` y écrit, et
    // ces deux-là n'y sont pas. En production, l'onglet « Jour » perdait donc sa
    // courbe et les pochettes annonçaient « Aucun enjeu identifié », sans que
    // rien ne le signale — le `.catch(() => null)` avalait l'absence.
    const enjeuxRaw = await lireJeu("day", "parties_issues_salient_shadow_day.json").catch(() => null);
    const intradayRaw = await lireJeu(
      "day",
      "provincial_parties_salient_shadow_intraday.json",
    ).catch(() => null);

    const upTo = (rows: ShadowRow[]) =>
      asOfIso ? rows.filter((r) => String(r.date_utc ?? "") <= asOfIso) : rows;
    const dayRows   = upTo(JSON.parse(dayRaw)   as ShadowRow[]);
    const weekRows  = upTo(JSON.parse(weekRaw)  as ShadowRow[]);
    const monthRows = upTo(JSON.parse(monthRaw) as ShadowRow[]);

    // Ventilation par média — facultative : le fader ne s'affiche que si les
    // tables `*_by_media_*` sont publiées. Un `null` ici n'est pas une erreur,
    // c'est l'état d'avant aws-refiners#… (la PR qui les crée).
    //
    // ⚠️ PASSE PAR `lireJeu`, comme les cinq autres tables, et NON par un
    // `fs.readFile` direct. C'est la même correction que celle déjà appliquée
    // aux tables des enjeux et de l'intra-journée (voir plus haut), et elle
    // avait été oubliée ici.
    //
    // Ce que le `fs.readFile` produisait : sur dev, `VITRINE_DATA_SOURCE=api`,
    // donc l'agrégat venait de l'API tandis que la ventilation par média lisait
    // les JSON du disque. UN SEUL ÉCRAN, DEUX SOURCES. Et comme l'API ne servait
    // pas `total_raw_score`, la position « tous les médias » affichait 0 minute
    // sur les pochettes et dans le palmarès, pendant que chaque position par
    // média affichait la bonne durée — lue ailleurs. Le repli était muet :
    // `Number(undefined) || 0` ne lève rien.
    const lireMedia = (periode: "day" | "week" | "month") =>
      lireJeu(periode, `provincial_parties_salient_shadow_by_media_${periode}.json`)
        .then((txt) => JSON.parse(txt) as ShadowRow[])
        .catch(() => null);
    const [mDay, mWeek, mMonth] = await Promise.all([
      lireMedia("day"),
      lireMedia("week"),
      lireMedia("month"),
    ]);

    const computed = computeStats(dayRows, weekRows, monthRows);
    if (!computed) return null;
    const { stats, dates } = computed;

    const lastDate = dayRows.reduce((max, r) => (r.date_utc > max ? r.date_utc : max), "");

    // Une vue par média, construite avec exactement le même code que la vue
    // agrégée — seules les lignes d'entrée changent.
    const medias: MediaOption[] = [];
    const byMedia: Record<string, MediaView> = {};

    if (mDay && mWeek && mMonth) {
      // C'EST LE PANEL QUI DÉCIDE, pas la donnée. La table publie tout le
      // corpus — CBC, CNN, Fox News, sans colonne de pays pour les écarter —
      // alors que le module porte sur des partis PROVINCIAUX. On part donc des
      // six médias québécois et on ne garde que ceux qui ont une ligne, plutôt
      // que de prendre tous les `media_id` rencontrés (cf. `MEDIA_PANEL_QC`).
      //
      // L'ordre est celui du panel, et non alphabétique : c'est celui des crans
      // du fader, et le `sort()` d'avant ne servait qu'à rendre la sortie
      // déterministe — le panel l'est déjà.
      const publies = new Set(mDay.map((r) => r.media_id).filter((x): x is string => !!x));
      const ids = MEDIA_PANEL_QC.filter((id) => publies.has(id));
      for (const id of ids) {
        const parMedia = (rows: ShadowRow[] | null) =>
          upTo((rows ?? []).filter((r) => r.media_id === id));
        const c = computeStats(parMedia(mDay), parMedia(mWeek), parMedia(mMonth));
        if (!c) continue;
        medias.push({ id, label: MEDIA_LABELS[id] ?? id });
        // `representative_url` n'est pas un champ du pipeline stats/history
        // (`computeStats`/`buildRangeView` ne connaissent que des séries) :
        // elle se pose à part, à même les lignes déjà filtrées sur CE média.
        const avecUrl = (vue: RangeView, urls: Map<string, string | null>): RangeView => ({
          ...vue,
          rows: vue.rows.map((row) => ({ ...row, representativeUrl: urls.get(row.key) ?? null })),
        });
        byMedia[id] = {
          ranges: {
            today: avecUrl(buildRangeView(c.stats, "today", c.dates), dernieresUrlsParParti(parMedia(mDay))),
            week: avecUrl(buildRangeView(c.stats, "week", c.dates), dernieresUrlsParParti(parMedia(mWeek))),
            overall: avecUrl(buildRangeView(c.stats, "overall", c.dates), dernieresUrlsParParti(parMedia(mMonth))),
          },
        };
      }
    }

    // Les enjeux du DERNIER jour publié, par parti. On ne moyenne pas sur la
    // fenêtre : la question posée est « de quoi parle-t-on en ce moment », et
    // une moyenne de trente jours lisserait précisément ce qui fait l'actualité.
    const lignesEnjeux = enjeuxRaw
      ? (upTo(JSON.parse(enjeuxRaw) as unknown as ShadowRow[]) as unknown as IssueRow[])
      : [];
    const enjeuMix = buildEnjeuMix(lignesEnjeux);

    const enjeuxParParti = buildEnjeux(
      enjeuxRaw ? (upTo(JSON.parse(enjeuxRaw) as unknown as ShadowRow[]) as unknown as IssueRow[]) : [],
    );

    // Une seule lecture de la table intra-journée, pour deux usages : la course
    // de la journée et le bloc courant. Elle était parsée à l'endroit même où
    // on s'en servait ; deux `JSON.parse` du même texte auraient fini par
    // diverger sur le filtre `upTo`.
    const intradayRows = intradayRaw
      ? (upTo(JSON.parse(intradayRaw) as IntradayRow[]) as IntradayRow[])
      : null;

    // La course de la journée, sur ses blocs de 4 h. `null` quand la table n'a
    // pas encore deux blocs — un seul point ne dessine pas une journée.
    const chartJour = intradayRows ? buildChartIntraday(intradayRows, [...PARTY_KEYS]) : null;

    return {
      blocCourant: dernierBloc(intradayRows),
      lastDate,
      lastUpdated: lastUpdatedLabel(lastDate),
      // La suspension éditoriale prime sur la détection par la donnée : celle-ci
      // ne voit que les symptômes (série gelée, fenêtre à zéro), et une édition
      // archivée n'en présente aucun tout en portant la même donnée invalide.
      // Sur fixtures, on laisse la détection ordinaire faire son travail : c'est
      // elle qu'on veut pouvoir éprouver (bandeau périmé, série à zéro), et la
      // suspension éditoriale la court-circuiterait toujours.
      indisponible:
        MESURE_PROVINCIALE_SUSPENDUE && !SUR_FIXTURES
          ? { raison: "recalibrage" as const, lastDate, lastDateLabel: labelDateIndispo(lastDate), joursDeRetard: 0 }
          : detecterIndisponibilite(dayRows, lastDate, asOfIso),
      /** Vrai quand la vue vient d'un jeu FICTIF. Voyage jusqu'au composant
       *  pour qu'il puisse le dire à l'écran : une capture d'un rendu sur
       *  fixtures ne doit jamais pouvoir passer pour le site. */
      enjeuMix,
      surFixtures: SUR_FIXTURES,
      medias,
      byMedia,
      ranges: {
        today: buildRangeView(stats, "today", dates, chartJour, enjeuxParParti),
        week:  buildRangeView(stats, "week", dates, null, enjeuxParParti),
        overall: buildRangeView(stats, "overall", dates, null, enjeuxParParti),
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

