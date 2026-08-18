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
import path from "node:path";

import { lastUpdatedLabel, formatDateFr } from "@/lib/dates";
import { ELECTION_CALL_DATE, ELECTION_DATE } from "@/lib/election";
import { MEDIA_LABELS } from "@/lib/medias";

export const PARTY_KEYS = ["plq", "caq", "qs", "pq", "pcq"] as const;
export type PartyKey = (typeof PARTY_KEYS)[number];

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
 * Sourdine : sous ce seuil, un parti n'est plus considéré comme audible.
 *
 * ⚠️ 5 % est un choix d'AFFICHAGE, plus élevé que le seuil du raffineur, qui
 * reste à 2 % (ECLIPSE_THRESHOLD dans radar-party-score-salient-shadow, publié
 * dans la colonne `threshold`). Les deux divergent donc volontairement : la
 * colonne `threshold` de la donnée ne décrit PLUS ce que le site affiche.
 * À aligner si le seuil de 5 % est retenu durablement.
 */
const SHADOW_THRESHOLD = 0.05;
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
  overall: "Tout",
};

export type Sov  = { today: number; week: number; month: number; year: number };
export type Tone = { today: number; week: number; month: number; year: number };

type ShadowRow = {
  party: string;
  date_utc: string;
  date_montreal_tz: string;
  weighted_mentions: number; // already SOV (0–1)
  weighted_tone: number;
  computed_at?: string;
  /** Présent uniquement dans les tables `*_by_media_*`. */
  media_id?: string;
};

type Entry = { mentions: number; tone: number };
type Lookup = Record<string, Record<string, Entry>>; // date → party_lower → entry

type Stat = {
  key: PartyKey;
  sov: Sov;
  tone: Tone;
  /** `daily` couvre TOUTE la fenêtre disponible ; `week` n'en garde que les 7
   *  derniers jours. La courbe partagée veut la première, l'ancienne mini-courbe
   *  voulait la seconde. */
  history: { daily: number[]; week: number[]; weekly: number[]; month: number[]; monthly: number[] };
  toneHistory: { daily: number[]; weekly: number[]; monthly: number[] };
};

/** Les dates effectivement retenues pour chaque échelle — l'axe horizontal de
 *  la courbe les étiquette, donc elles doivent voyager avec les valeurs. */
type SeriesDates = { daily: string[]; weekly: string[]; monthly: string[] };

export type RowView = {
  key: PartyKey;
  label: string;
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
  /** Sommet atteint sur la fenêtre suivie, et le jour où il l'a été.
   *  C'est le « peak hold » de la console : le trait qui reste au niveau le
   *  plus haut atteint, longtemps après que le son soit redescendu. */
  peakPct: number;
  peakDate: string;
  sparkPolyline: string;
  sparkCircles: { cx: number; cy: number; r: number }[];
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
  /** Position de l'ÉTIQUETTE : `lastY` écarté de ses voisines si nécessaire.
   *  Distinct de `lastY` pour que le point reste sur la donnée exacte même
   *  quand son étiquette a dû être déplacée. */
  labelY: number;
  lastPct: number;
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
};

export type RangeView = {
  range: RangeKey;
  tabLabel: string;
  sparkHeadLabel: string;
  refLabel: string;
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
  /** Vrai quand la donnée vient de `fixtures/` et non de `public/data/`.
   *  Le module l'affiche en toutes lettres — cf. `.gitignore` : « aucune donnée
   *  inventée ne doit pouvoir être confondue avec la donnée réelle ». */
  surFixtures: boolean;
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
 *  À repasser à `false` quand le réentraînement est validé, avec la métho §05
 *  et le §10 (Limites reconnues) mis à jour dans le même geste.
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
const MESURE_PROVINCIALE_SUSPENDUE = true;

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
    result[row.date_utc][pKey] = { mentions: row.weighted_mentions, tone: row.weighted_tone };
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

    return {
      key: pKey,
      sov:  { today: todaySov, week: weekSov,  month: monthSov,  year: yearSov },
      tone: { today: todayTone, week: weekTone, month: monthTone, year: 0 },
      history: {
        daily:   allDayDates.map((d)      => dayLookup[d]?.[pKey]?.mentions   || 0),
        week:    last7DayDates.map((d)    => dayLookup[d]?.[pKey]?.mentions   || 0),
        weekly:  weekSampleDates.map((d)  => weekLookup[d]?.[pKey]?.mentions  || 0),
        month:   [],
        monthly: monthSampleDates.map((d) => monthLookup[d]?.[pKey]?.mentions || 0),
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
const CHART_H = 46;
/** Marge droite réservée aux étiquettes de parti posées en bout de ligne.
 *  Resserrée pour que la ligne d'arrivée se rapproche du bord. */
const CHART_PAD_R = 9;

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
 *   Semaine  → vendredi 20 h de la semaine en cours, sur quatre semaines
 *   Tout     → le jour du scrutin, sur toute la fenêtre suivie
 *
 * Chaque onglet a donc sa propre course et son propre but, au lieu d'une
 * course unique qui ne pouvait pas dire ce que « la journée » veut dire.
 */
function arrivee(range: RangeKey, derniere: string): { t: number; label: string; sub: string } {
  const j = new Date(`${derniere}T00:00:00Z`);
  if (range === "overall") {
    return {
      t: Date.parse(`${ELECTION_DATE}T00:00:00Z`),
      label: "Scrutin",
      sub: shortDateFr(ELECTION_DATE),
    };
  }
  if (range === "week") {
    // Vendredi de la semaine en cours (lundi = 1).
    const jour = j.getUTCDay() || 7;
    const vendredi = new Date(j);
    vendredi.setUTCDate(j.getUTCDate() + (5 - jour));
    return {
      t: vendredi.getTime() + HEURE_ARRIVEE * 3_600_000,
      label: "Arrivée",
      sub: `vendredi ${HEURE_ARRIVEE} h`,
    };
  }
  return { t: j.getTime() + HEURE_ARRIVEE * 3_600_000, label: "Arrivée", sub: `${HEURE_ARRIVEE} h` };
}

/**
 * Départ de l'axe, en regard de l'arrivée.
 *
 *   Semaine → vendredi 22 h de la semaine PRÉCÉDENTE, soit exactement sept
 *             jours avant l'arrivée du vendredi 20 h.
 *   Tout    → le déclenchement du scrutin quand il est connu, sinon le début
 *             du suivi : mieux vaut un axe plus large qu'une date inventée.
 *   Jour    → la première journée montrée.
 */
function depart(range: RangeKey, premiere: string, arriveeT: number): number {
  if (range === "week") return arriveeT - 7 * 86_400_000 - 2 * 3_600_000;
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
 *  `week` : 7 jours, soit exactement vendredi à vendredi. */
const FENETRE: Record<RangeKey, number> = { today: 7, week: 7, overall: Infinity };

/**
 * La course — épurée : des lignes, leurs étiquettes de bout, deux dates, une
 * ligne d'arrivée. Ni grille, ni graduations, ni fond : l'objectif est de VOIR
 * LA TENDANCE, pas de lire une valeur au pixel près. Les valeurs, elles, sont
 * écrites en toutes lettres au bout de chaque ligne.
 */
function buildChart(stats: Stat[], dates: SeriesDates, range: RangeKey): ChartView {
  const toutes = dates.daily;
  const garde = FENETRE[range];
  const fenetre = Number.isFinite(garde) ? toutes.slice(-garde) : toutes;

  const plotW = CHART_W - CHART_PAD_R;
  const but = arrivee(range, fenetre.at(-1) ?? ELECTION_DATE);
  const t0 = depart(range, fenetre[0] ?? ELECTION_DATE, but.t);

  // LES BORNES DE L'AXE D'ABORD, LES POINTS ENSUITE : une date anterieure au
  // depart se dessinerait a gauche du cadre, hors champ. C'est ce qui arrivait
  // a la vue semaine, dont l'axe commence le vendredi 22 h alors que la fenetre
  // de sept jours remonte au-dela.
  const axisDates = fenetre.filter((iso) => Date.parse(`${iso}T00:00:00Z`) >= t0);
  const decalage = toutes.length - axisDates.length;
  const n = axisDates.length;

  const histOf = (s: Stat) => s.history.daily.slice(decalage);
  const top = axisTop(Math.max(0, ...stats.flatMap(histOf)) * 100);
  const span = Math.max(but.t - t0, 86_400_000);
  const xAt = (t: number) => ((t - t0) / span) * plotW;
  const xAtDate = (iso: string) => xAt(Date.parse(`${iso}T00:00:00Z`));
  const yAt = (pct: number) => CHART_H - (pct / top) * CHART_H;

  const series: ChartSeries[] = stats
    .slice()
    .sort((a, b) => histOf(b).at(-1)! - histOf(a).at(-1)!)
    .map((stat) => {
      const hist = histOf(stat);
      const pts = hist.map((v, i) => [xAtDate(axisDates[i] ?? ""), yAt(v * 100)] as const);
      return {
        key: stat.key,
        label: PARTY_LABELS[stat.key],
        color: PARTY_COLORS[stat.key],
        inShadow: (hist.at(-1) ?? 0) < SHADOW_THRESHOLD,
        polyline: pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
        lastX: Number((pts.at(-1)?.[0] ?? 0).toFixed(2)),
        lastY: Number((pts.at(-1)?.[1] ?? CHART_H).toFixed(2)),
        labelY: 0,
        lastPct: Math.round((hist.at(-1) ?? 0) * 100),
      };
    });

  spreadLabels(series);

  // Deux dates seulement : le début et la fin de ce qui est mesuré. La ligne
  // d'arrivée porte sa propre étiquette.
  const xLabels =
    n <= 1
      ? [{ label: shortDateFr(axisDates[0] ?? ""), x: 0 }]
      : [
          { label: shortDateFr(axisDates[0]), x: 0 },
          {
            label: shortDateFr(axisDates[n - 1]),
            x: Number(xAtDate(axisDates[n - 1]).toFixed(2)),
          },
        ];

  return {
    series,
    xLabels,
    finish: { x: Number(xAt(but.t).toFixed(2)), label: but.label, sub: but.sub },
    width: CHART_W,
    height: CHART_H,
    tooShort: n <= 1,
  };
}

function buildRangeView(stats: Stat[], range: RangeKey, dates: SeriesDates): RangeView {
  const cfg = RANGE_CONFIG[range];
  const sorted = stats.slice().sort((a, b) => b.sov[cfg.barKey] - a.sov[cfg.barKey]);

  const rows: RowView[] = sorted.map((stat, idx) => {
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
    const dirLabel =
      streak.direction === "positive"
        ? "Positif"
        : streak.direction === "negative"
          ? "Négatif"
          : "Neutre";
    const toneLabel =
      streak.direction === "neutral" || streak.count <= 1 || range === "today"
        ? `${arrow} ${dirLabel}`
        : `${arrow} ${dirLabel}  ${streak.count} ${unit}`;
    // Vocabulaire aligné sur la manchette : « du temps », jamais « couverture ».
    const toneTitle = `Ton\u00a0: ${toneLabel}. Proportion nette de mots positifs\u00a0: ${unclamped >= 0 ? "+" : ""}${(unclamped * 100).toFixed(2)}\u00a0%.`;

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
      inShadow: sov < SHADOW_THRESHOLD,
      peakPct: Math.round((dailyHist[peakIdx] ?? 0) * 100),
      peakDate: dates.daily[peakIdx] ?? "",
      color: PARTY_COLORS[stat.key],
      sovPct,
      barWidthPct: Number(barWidthPct.toFixed(1)),
      barTitle: `${sovPct}\u00a0% du temps consacré aux partis`,
      refLeftPct: Number(refLeftPct.toFixed(1)),
      refTitle,
      showLeaderLabel: idx === 0 && sov >= SHADOW_THRESHOLD,
      toneLabel,
      toneDirection: streak.direction,
      toneTitle,
      sparkPolyline: polyline,
      sparkCircles: circles,
    };
  });

  return {
    range,
    tabLabel: TAB_LABELS[range],
    sparkHeadLabel: SPARK_HEAD_LABELS[range],
    refLabel: cfg.refLabel,
    rows,
    chart: buildChart(stats, dates, range),
  };
}

// Exports réservés aux tests unitaires (pipeline interne ; pas l'API publique).
export const __test__ = {
  buildLookup,
  computeStats,
  sparkPoints,
  samplePoints,
  buildRangeView,
  buildChart,
  axisTop,
  detecterIndisponibilite,
};

// Par défaut : la donnée réelle publiée par fetch_data.R. En développement,
// VITRINE_PARTIES_FIXTURES pointe vers un jeu FICTIF au même schéma
// (cf. scripts/make_parties_fixtures.mjs) — la donnée réelle est aujourd'hui
// dégénérée (un seul parti détecté, cf. aws-refiners#223/#248), donc impossible
// d'y juger un changement visuel. Variable absente ⇒ comportement inchangé.
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
    const [dayRaw, weekRaw, monthRaw] = await Promise.all([
      fs.readFile(path.join(DATA_DIR, "day",   "provincial_parties_salient_shadow_day.json"),   "utf8"),
      fs.readFile(path.join(DATA_DIR, "week",  "provincial_parties_salient_shadow_week.json"),  "utf8"),
      fs.readFile(path.join(DATA_DIR, "month", "provincial_parties_salient_shadow_month.json"), "utf8"),
    ]);

    const upTo = (rows: ShadowRow[]) =>
      asOfIso ? rows.filter((r) => String(r.date_utc ?? "") <= asOfIso) : rows;
    const dayRows   = upTo(JSON.parse(dayRaw)   as ShadowRow[]);
    const weekRows  = upTo(JSON.parse(weekRaw)  as ShadowRow[]);
    const monthRows = upTo(JSON.parse(monthRaw) as ShadowRow[]);

    // Ventilation par média — facultative : le fader ne s'affiche que si les
    // tables `*_by_media_*` sont publiées. Un `null` ici n'est pas une erreur,
    // c'est l'état d'avant aws-refiners#… (la PR qui les crée).
    const lireMedia = async (p: string) => {
      try {
        return JSON.parse(await fs.readFile(p, "utf8")) as ShadowRow[];
      } catch {
        return null;
      }
    };
    const [mDay, mWeek, mMonth] = await Promise.all([
      lireMedia(path.join(DATA_DIR, "day",   "provincial_parties_salient_shadow_by_media_day.json")),
      lireMedia(path.join(DATA_DIR, "week",  "provincial_parties_salient_shadow_by_media_week.json")),
      lireMedia(path.join(DATA_DIR, "month", "provincial_parties_salient_shadow_by_media_month.json")),
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
      const ids = [...new Set(mDay.map((r) => r.media_id).filter((x): x is string => !!x))].sort();
      for (const id of ids) {
        const parMedia = (rows: ShadowRow[] | null) =>
          upTo((rows ?? []).filter((r) => r.media_id === id));
        const c = computeStats(parMedia(mDay), parMedia(mWeek), parMedia(mMonth));
        if (!c) continue;
        medias.push({ id, label: MEDIA_LABELS[id] ?? id });
        byMedia[id] = {
          ranges: {
            today: buildRangeView(c.stats, "today", c.dates),
            week: buildRangeView(c.stats, "week", c.dates),
            overall: buildRangeView(c.stats, "overall", c.dates),
          },
        };
      }
    }

    return {
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
      surFixtures: SUR_FIXTURES,
      medias,
      byMedia,
      ranges: {
        today: buildRangeView(stats, "today", dates),
        week:  buildRangeView(stats, "week", dates),
        overall: buildRangeView(stats, "overall", dates),
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

