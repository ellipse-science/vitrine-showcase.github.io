"use client";

import { useState, useRef } from "react";
import type { ReactNode } from "react";
import type { PartiesData, PartyKey, RangeKey, RangeView, RowView, ChartView, Indisponibilite } from "@/lib/data/parties";
import type { Album, Discographie, Discotheque, Pochette, PochetteSource } from "@/lib/data/pochettes";
import { TOUS_MEDIAS, MEDIA_ORDER, MEDIA_PANEL_QC, MEDIA_SIGLES, MEDIA_DANS, MEDIA_DE, MEDIA_LABELS } from "@/lib/medias";
import { signaturePochette } from "@/lib/enjeux";
import { formatDuree } from "@/lib/duree";
import { formatEcartTon, phraseEcartTon } from "@/lib/ton";
import { cheminDeRang, depuisLOrigine, hauteurDuRang, rangsParInstant } from "@/lib/rangs";
import { samediDeLaSemaine } from "@/lib/semaine";
import { formatDateFr } from "@/lib/dates";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { DoomGame } from "@/components/interactive/DoomGame";
import { LigneTracklist, LigneTracklistTon } from "@/components/interactive/Tracklist";

/** L'enjeu de reste : les phrases qui nomment un parti sans qu'aucun modèle CAP
 *  ne franchisse son seuil. Il EST sélectionnable — sans lui, cocher tous les
 *  pads ne redonnerait pas la vue d'ensemble — mais il se rend à part : ce n'est
 *  pas un sujet, c'est ce qui n'en a pas.
 *
 *  ⚠️ DUPLIQUÉ à dessein, et non importé de `parties.ts`. Un import de VALEUR
 *  depuis ce module embarquerait tout son contenu dans le paquet client, y
 *  compris `node:fs/promises`, et le build échoue (« the chunking context does
 *  not support external modules »). Seuls les imports de TYPE s'effacent à la
 *  compilation. La chaîne doit rester identique ici, dans `parties.ts` et dans
 *  `radar-party-score-salient-shadow/runtime.R`. */
const SANS_ENJEU = "Aucun enjeu identifié";
/** Quand le fader quitte le centre, le raffineur ne croise pas parti × enjeu ×
 *  média : il n'y a rien à afficher, mais ce n'est PAS « aucun enjeu ». Dire la
 *  limite de la mesure plutôt qu'inventer un fait sur la couverture. */
const ENJEU_NON_VENTILE = "Non ventilé par média";

// Doom RETIRÉ DE PROD, gardé sur dev (décision du 2026-08-20) : l'easter egg
// des partis reste un jeu d'équipe, pas une porte du site public. Même signal
// d'environnement que `app/robots.ts`, `lib/data/parties.ts` et les retraits
// de #544 — un seul signal, pas de divergence. Flappy Enjeux n'est PAS visé :
// il reste accessible en prod, c'est le seul jeu autorisé en ligne.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

const RANGES: RangeKey[] = ["today", "week", "overall"];

/** UN CHOIX DÉTERMINISTE, PAS UN VRAI HASARD.
 *
 *  `Math.random()` dans le rendu d'un composant client donnerait une valeur
 *  différente au serveur (l'export statique) et au navigateur (l'hydratation)
 *  — exactement le mésappariement qu'un `useSearchParams()` sur du
 *  `force-static` a déjà coûté sur cette branche. Une fonction de `cle` reste
 *  stable d'un rendu à l'autre, et varie déjà assez d'un jour à l'autre :
 *  c'est la LISTE des médias disponibles qui change avec la donnée, pas ce
 *  hachage. Sert à choisir « un média au hasard, parmi ceux qui ont un
 *  article pour ce parti » (le deck sur « Tous les médias », voir
 *  `lienArticle`). */
function choisirParmi(cle: string, n: number): number {
  let h = 0;
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
  return h % n;
}

/** CE QUE LE PALMARÈS CLASSE.
 *
 *  Deux courses sur le même graphique, et le lecteur bascule de l'une à
 *  l'autre : le disque le plus ÉCOUTÉ — le temps passé en Une — et le plus
 *  APPRÉCIÉ — le ton de ce qui s'y dit. Ce sont deux questions différentes, et
 *  leurs classements n'ont aucune raison de coïncider : un parti peut occuper
 *  toute la Une et n'y récolter que du défavorable. C'est même l'écart entre les
 *  deux qui est intéressant.
 *
 *  Les deux pistes voyagent dans la même donnée (cf. `polylineTon` dans
 *  `lib/data/parties.ts`), donc la bascule est instantanée : rien à recharger. */
type ModePalmares = "ecoute" | "apprecie";

type Mode = { cle: ModePalmares; onglet: string; titre: string; infobulle: string };

/** UNE ENTRÉE DU TROPHÉE — un parti, ses quatre grandeurs (temps, part,
 *  enjeu, ton), et sa couverture quand une en existe. Mise à la même forme
 *  depuis trois sources
 *  différentes (`RowView` pour le jour, `Album`/`Discographie` — leur piste la
 *  plus écoutée — pour la semaine et la campagne) : le trophée ne connaît que
 *  cette forme-là, pas d'où elle vient. */
type EntreeTrophee = {
  /** Clé React — la clé du parti suffit, les cinq entrées d'un même trophée ne
   *  peuvent pas se répéter. */
  cle: PartyKey;
  sigle: string;
  nom: string;
  couleur: string;
  minutes: number;
  /** L'écart au ton moyen des autres partis, au dernier relevé — la même
   *  grandeur que `ChartSeries.lastEcartTon`, celle qui classe le palmarès en
   *  mode Apprécié. `null` quand le parti n'a aucune couverture mesurée. */
  ecart: number | null;
  partPct: number;
  enjeu: string;
  /** Renseigné seulement quand l'enjeu ne vient pas de la journée affichée. */
  enjeuTitle?: string;
  tonMot: string;
  tonPct: number;
  tonTitle?: string;
  src?: string;
  sources?: PochetteSource[];
};

/** ⚠️ EXACTEMENT DEUX, et le type l'impose. Les touches encadrent le titre, une
 *  à gauche et une à droite : un troisième mode n'aurait pas de côté où aller,
 *  et se serait ajouté en silence sans jamais s'afficher. Le tuple fait échouer
 *  la compilation plutôt que le rendu. */
const MODES: readonly [Mode, Mode] = [
  {
    cle: "ecoute",
    onglet: "Écouté",
    titre: "le disque le plus écouté",
    infobulle: "Classer les partis par temps passé en Une",
  },
  {
    cle: "apprecie",
    onglet: "Apprécié",
    titre: "le disque le plus apprécié",
    infobulle:
      "Classer les partis selon que la couverture est plus positive " +
      "ou plus négative que celle des autres",
  },
];

/** LA VITESSE DU PLATEAU, par onglet.
 *
 *  Un tourne-disque n'a qu'un sélecteur à trois positions, et ce sont les
 *  vitesses : le module en a trois aussi. Le rapport tombe juste sans rien
 *  forcer — PLUS LE DISQUE TOURNE LENTEMENT, PLUS IL JOUE LONGTEMPS. Le 78
 *  tours, court et rapide, pour la journée ; le 33, le « long play », pour toute
 *  la campagne.
 *
 *  La mention reste SECONDAIRE, en petit et après le mot. Remplacer « Jour » par
 *  « 78 T » aurait été une devinette : la métaphore doit habiller la lecture,
 *  jamais s'y substituer. Elle est `aria-hidden` pour la même raison — un
 *  lecteur d'écran doit entendre « Jour », pas « Jour 78 T ». */
const TOURS: Record<RangeKey, string> = { today: "78", week: "45", overall: "33" };

/** Ce que chaque vitesse couvre, en toutes lettres, puis le clin d'œil. */
const VITESSE_INFOBULLE: Record<RangeKey, string> = {
  today:
    "La journée en cours, depuis minuit. Le 78 tours\u00a0: celui qui tourne le plus " +
    "vite et joue le moins longtemps.",
  week: "La semaine en cours, du samedi au vendredi 20\u00a0h. Le 45 tours.",
  overall:
    "Depuis le début du suivi jusqu'au scrutin. Le 33 tours, le «\u00a0long play\u00a0».",
};

/** LE TERME DU TROPHÉE, par vitesse — un mot différent selon ce qui est
 *  couronné : un SINGLE (un jour), un ALBUM (une semaine, sept titres au plus,
 *  comme `/discotheque`), un DISQUE (toute la campagne). Reprend le vocabulaire
 *  déjà établi par `/discotheque` (Édition/Album/Discographie) plutôt que d'en
 *  inventer un autre pour ce trophée.
 *
 *  LE PALIER MONTE AVEC LA VITESSE — or, puis platine, puis diamant — sur le
 *  modèle des certifications RIAA réelles : plus la période est longue, plus
 *  la mener longtemps est rare, et plus haut le palier qui le dit. */
const NOM_TROPHEE: Record<RangeKey, string> = {
  today: "Le single d'or",
  week: "L'album de platine",
  overall: "Le disque de diamant",
};
/** Avant que la course ne soit courue, rien n'est encore pressé — voir
 *  `chartTermine`. Le nom reste visible, seul le disque manque. */
const PRODUCTION_TROPHEE: Record<RangeKey, string> = {
  today: "Single en production",
  week: "Album en production",
  overall: "Disque en production",
};

/** LA COULEUR DE L'ENCADRÉ, une fois couronné — un token par palier, sur le
 *  modèle des trois couleurs RIAA réelles (or, argent du platine, blanc
 *  glacé du diamant) plutôt qu'un seul laiton pour les trois : le palier se
 *  VOIT, pas seulement se lit dans le nom du trophée. */
const PALIER_COULEUR: Record<RangeKey, string> = {
  today: "var(--brass)",
  week: "var(--platine)",
  overall: "var(--diamant)",
};

/** LA COURSE EST-ELLE FINIE ? Même geste que `Palmares` (`resteACourir`), sans
 *  les rangs : toutes les séries d'un même graphique partagent les mêmes
 *  abscisses (cf. `Palmares`), donc `lastX` — l'abscisse du DERNIER relevé,
 *  avant tout prolongement pointillé — suffit à savoir si la ligne d'arrivée
 *  est déjà atteinte.
 *
 *  ⚠️ DUPLIQUÉE À DESSEIN plutôt que sortie de `Palmares` : le disque d'or en a
 *  besoin AVANT que le graphique ne se rende, pour décider s'il montre une
 *  vraie pochette ou « en production ». Exposer l'état interne d'un composant
 *  de rendu pour ça aurait été plus fragile qu'une formule de deux lignes. */
function chartTermine(chart: ChartView): boolean {
  const xDernier = Math.max(0, ...chart.series.map((s) => s.lastX));
  return chart.finish.x - xDernier <= chart.width * 0.005;
}

/** Le titre du palmarès, pour un mode et un onglet donnés.
 *
 *  Une seule fonction, parce que le titre est écrit DEUX fois : une fois pour de
 *  bon, et une fois en gabarit invisible qui réserve la place. Deux formules
 *  auraient dérivé au premier ajustement de libellé, et le gabarit aurait cessé
 *  de mesurer ce qu'il est censé mesurer, en silence. */
const titrePalmares = (mode: ModePalmares, range: RangeKey) =>
  `Le palmarès\u00a0: ${MODES.find((m) => m.cle === mode)!.titre}, ${PAS_DU_PALMARES[range]}`;

/** Le PAS du palmarès, par onglet — ce que vaut un cran de son axe.
 *
 *  Il s'écrit dans le titre parce que les trois onglets ne classent plus sur la
 *  même chose : « Jour » suit les blocs de 4 h du raffineur, les deux autres
 *  suivent les journées. « Heure par heure » sur un axe de trente-cinq jours
 *  serait faux, et c'était le cas avant que ce tableau existe. */
const PAS_DU_PALMARES: Record<RangeKey, string> = {
  today: "heure par heure",
  week: "jour par jour",
  overall: "jour par jour",
};

/** Article défini de chaque parti — « LA CAQ », « LE PQ », mais « Québec
 *  solidaire » n'en prend pas. Sans ça la manchette écrit « CAQ occupe… ». */
const ARTICLE: Record<string, string> = {
  caq: "La ",
  pq: "Le ",
  plq: "Le ",
  pcq: "Le ",
  qs: "",
};

/** La phrase que porte une colonne du vumètre, en toutes lettres.
 *
 *  Elle dit la BASE du calcul, qui est l'incompréhension la plus fréquente sur
 *  ce module : les cinq partis se partagent 100 %, pas toute l'actualité. Un
 *  pourcentage nu la laissait deviner.
 *
 *  Le même texte sert au survol ET aux lecteurs d'écran. Un `title` seul ne
 *  suffit pas : il n'est pas atteignable au clavier et son annonce est
 *  irrégulière d'un lecteur à l'autre — c'est le défaut qui rendait la tonalité
 *  muette avant 3158d9d9. */
function phraseColonne(row: RowView, ecartPts: number): string {
  const nom = `${ARTICLE[row.key] ?? ""}${row.label}`;
  const base = "de la couverture médiatique réservée aux partis politiques en Une de l'actualité";

  if (row.inShadow) {
    return (
      `${nom} est le parti dont les médias parlent le moins sur cette période\u00a0: ` +
      `${row.sovPct}\u00a0% ${base}.`
    );
  }

  // Pas de « record sur la période » ici : deux pourcentages côte à côte, l'un
  // courant et l'autre historique, se lisent comme une contradiction plutôt que
  // comme une mise en perspective.
  let phrase = `${nom} occupe ${row.sovPct}\u00a0% ${base}.`;
  if (ecartPts !== 0) {
    phrase +=
      ` Ce média lui en donne ${Math.abs(ecartPts)}\u00a0% ` +
      `${ecartPts > 0 ? "de plus" : "de moins"} que l'ensemble des médias.`;
  }
  return phrase;
}

function shareTitle(data: PartiesData): string {
  const leader = data.ranges.today.rows[0];
  // `indisponible` en tête, comme partout ailleurs : ce titre part dans le
  // bouton de partage ET dans l'`aria-label`, donc il s'énonce au survol et à
  // voix haute pour les lecteurs d'écran. Sans ce test, il annonçait « c'est
  // CAQ 100 % du temps » alors que la page affiche un avis de suspension.
  if (data.indisponible || !leader || leader.sovPct === 0 || leader.inShadow) {
    return "De quel parti parle-t-on dans les médias?";
  }
  const tone =
    leader.toneDirection === "positive"
      ? "on en parle en bien"
      : leader.toneDirection === "negative"
        ? "on en parle en mal"
        : "l'important, c'est qu'on en parle";
  return `Quand les médias parlent d'un parti, c'est ${leader.label} ${leader.sovPct}\u00a0% du temps\u00a0: ${tone}`;
}

export function PartisCouvertureClient({
  data,
  discotheque,
  albums,
  discographies,
  saillanceRang = 0,
  editionKey,
}: {
  data: PartiesData;
  /** Les pochettes engendrées, lues sur le disque du build. Le deck qu'on
   *  clique en sort une ; le disque d'or du palmarès s'en sert aussi. Absent ou
   *  vide tant que le raffineur n'a rien publié — les pochettes retombent alors
   *  sur leur composition géométrique. */
  discotheque?: Discotheque;
  /** Les albums (un par parti et par semaine) et les discographies (un par
   *  parti, toute la campagne) — mêmes groupages que `/discotheque`
   *  (`lib/data/pochettes.ts`), sur le même fonds. Le disque d'or du palmarès y
   *  puise sa couverture en vue Semaine et Campagne ; vide tant que le fonds
   *  n'a rien à grouper. */
  albums?: Album[];
  discographies?: Discographie[];
  /** Rang de saillance de la Une du moment, 1 (très faible) → 6
   *  (exceptionnelle), 0 si la donnée manque. Ne pilote QUE le tempo des
   *  vumètres : aucune lecture n'en dépend. */
  saillanceRang?: number;
  /** L'édition affichée, pour la carte de partage du module (venu de main
   *  avec #partage-cartes). Absent sur l'accueil. */
  editionKey?: string;
}) {
  const [range, setRange] = useState<RangeKey>("today");
  const [modePalmares, setModePalmares] = useState<ModePalmares>("ecoute");
  const [media, setMedia] = useState<string>(TOUS_MEDIAS);
  const [showDoom, setShowDoom] = useState(false);
  /** LE PANNEAU DU DISQUE D'OR — les cinq partis en dessous du palmarès,
   *  déplié par un clic sur le disque (voir `PalmaresTrophee`/`TropheePanel`).
   *  Vit ICI, au-dessus de `.palmares-rangee`, et non dans `PalmaresTrophee` :
   *  le panneau se rend en PLEINE LARGEUR, sous toute la rangée, pas dans la
   *  seule colonne étroite du disque. */
  const [trophéeOuvert, setTrophéeOuvert] = useState(false);
  const pcqTapRef = useRef({ count: 0, lastTime: 0 });

  const handlePcqTap = () => {
    if (isProd) return;
    const now = performance.now();
    if (now - pcqTapRef.current.lastTime < 1500) {
      pcqTapRef.current.count += 1;
    } else {
      pcqTapRef.current.count = 1;
    }
    pcqTapRef.current.lastTime = now;

    if (pcqTapRef.current.count >= 3) {
      pcqTapRef.current.count = 0;
      setShowDoom(true);
    }
  };

  // Position du fader. « Tous les médias » lit la table AGRÉGÉE, jamais une
  // moyenne des vues par média : l'agrégat est pondéré par les minutes de
  // chaque média, donc les deux nombres diffèrent légitimement.
  const source =
    media !== TOUS_MEDIAS && data.byMedia[media]
      ? data.byMedia[media]
      : { ranges: data.ranges };
  const view: RangeView = source.ranges[range];
  const visibleRows = view.rows.filter((r) => !r.inShadow);
  const shadowRows = view.rows.filter((r) => r.inShadow);

  // Les quatre decks, dans l'ordre du classement : 1er en haut à gauche, 2e en
  // haut à droite, 3e en bas à gauche, 4e en bas à droite. L'assignation est
  // AUTOMATIQUE — il n'y a plus rien à charger ni à déposer, puisque la sourdine
  // garantit qu'il reste exactement quatre partis actifs.
  //
  // Le tableau est complété à quatre : à égalité au plus bas, deux partis
  // passent en sourdine et le dernier deck reste donc vide. Ce vide est la
  // lecture juste — il dit qu'un seul parti se disputait la dernière place.
  const decks: (RowView | null)[] = [0, 1, 2, 3].map((i) => visibleRows[i] ?? null);
  const mediaLabel =
    media === TOUS_MEDIAS ? null : (data.medias.find((m) => m.id === media)?.label ?? null);

  /** L'ARTICLE VERS LEQUEL UN DECK MÈNE (aws-refiners#447), pour CE parti à LA
   *  POSITION COURANTE du fader.
   *
   *  Sur un média précis, `view` EST déjà la vue de ce média : la ligne du
   *  parti porte directement l'URL qui le concerne (`representativeUrl`,
   *  posée par `lib/data/parties.ts`).
   *
   *  Sur « Tous les médias », l'agrégat n'a pas d'URL propre — il n'existe
   *  qu'une URL PAR média. On en choisit une parmi les médias qui en ont une
   *  pour ce parti, jamais un article qui ne le mentionne pas. */
  const lienArticle = (row: RowView): string | null => {
    if (media !== TOUS_MEDIAS) return row.representativeUrl ?? null;
    const disponibles = data.medias
      .map((m) => data.byMedia[m.id]?.ranges[range].rows.find((r) => r.key === row.key)?.representativeUrl)
      .filter((u): u is string => !!u);
    if (disponibles.length === 0) return null;
    return disponibles[choisirParmi(row.key, disponibles.length)];
  };

  /** LE CLASSEMENT DU TROPHÉE, jusqu'à cinq entrées, pour la vitesse choisie
   *  ET LA MESURE CHOISIE — le disque d'or suit le knob Mesure, exactement
   *  comme le graphique juste à côté : en Apprécié, il couronne le ton, pas
   *  l'écoute.
   *
   *  ⚠️ `data.ranges[range].rows` — L'AGRÉGAT, JAMAIS `view.rows`. `view` peut
   *  être le tableau D'UN SEUL MÉDIA (`source.ranges[range]` plus haut) quand
   *  le fader n'est pas sur « tous les médias » ; le trophée, comme le
   *  graphique du palmarès (`data.ranges[range].chart`, jamais `view.chart`),
   *  doit rester une course entre PARTIS, pas entre médias. Utiliser `view`
   *  ici ferait couronner le meneur d'UN journal plutôt que celui de la
   *  couverture réelle.
   *
   *  ⚠️ MÊME AGRÉGAT POUR LES TROIS VITESSES — c'est le bogue que ce
   *  commentaire documente. Semaine et campagne lisaient `albums`/
   *  `discographies` (le fonds de pochettes archivées) pour le CLASSEMENT
   *  lui-même, pas seulement pour l'illustration ; un fonds vide ou pas
   *  encore rattrapé (le raffineur d'images tourne à part de celui des
   *  chiffres) faisait alors disparaître le disque d'or ENTIER sur ces deux
   *  vitesses, silencieusement. `data.ranges[range].rows` existe TOUJOURS,
   *  quel que soit l'état du fonds : c'est la même donnée qui trace déjà le
   *  graphique et les barres du module, jamais en retard sur elles.
   *
   *  La COUVERTURE, elle, reste optionnelle et VIENT du fonds — c'est la
   *  seule chose qu'il lui reste à fournir : `pochetteAppariee` pour le jour,
   *  la piste la plus écoutée de l'album de la semaine COURANTE
   *  (`samediDeLaSemaine`, ancrée sur `data.lastDate`, jamais sur l'horloge du
   *  visiteur) ou de la discographie complète pour la campagne. Sans elle, le
   *  disque affiche son repli — jamais son absence totale. */
  const albumSemaineParParti = new Map(
    (albums ?? [])
      .filter((a) => a.semaineDebut === samediDeLaSemaine(data.lastDate))
      .map((a) => [a.parti, a] as const),
  );
  const discographieParParti = new Map((discographies ?? []).map((d) => [d.parti, d] as const));

  /** L'écart de ton de chaque parti, au dernier relevé — la MÊME grandeur que
   *  `Palmares` (`valeurDe`) utilise pour classer ses lignes en Apprécié
   *  (`ChartSeries.lastEcartTon`). Une carte plutôt qu'un accès direct : le
   *  classement du trophée part de `rows` (`RowView`), le graphique de
   *  `series` (`ChartSeries`) — deux tableaux distincts sur les mêmes partis,
   *  et c'est cette carte qui les relie par clé. */
  const ecartParParti = new Map(data.ranges[range].chart.series.map((s) => [s.key, s.lastEcartTon]));
  const apprecieTrophee = modePalmares === "apprecie";
  /** ⚠️ UN PARTI SANS TON EST ENVOYÉ EN QUEUE, jamais classé comme un ton
   *  neutre — même garde que `Palmares` (`valeurDe`), pour la même raison :
   *  `null` veut dire « aucune couverture », pas « couverture équilibrée ». */
  const valeurTrophee = (row: RowView) =>
    apprecieTrophee ? (ecartParParti.get(row.key) ?? Number.NEGATIVE_INFINITY) : row.minutesUne;
  const classementTrophee = data.ranges[range].rows
    .slice()
    .sort((a, b) => valeurTrophee(b) - valeurTrophee(a) || a.label.localeCompare(b.label, "fr"));

  const entreesTrophee: EntreeTrophee[] = classementTrophee
    .slice(0, 5)
    .map((row) => {
      // `SANS_ENJEU` est écarté ICI AUSSI — `pochetteAppariee` et
      // `app/data/partis-selection.json` le faisaient déjà, ce site-ci l'avait
      // oublié. « Aucun enjeu identifié » n'est pas un sujet à annoncer sur une
      // pochette ; quand c'est tout ce qu'on a, le repli plus bas le dit.
      const enjeu = row.enjeux.find((e) => !e.reste && e.label !== SANS_ENJEU) ?? null;
      const couverture =
        range === "today"
          ? pochetteAppariee(row, discotheque?.duJour ?? [])
          : range === "week"
            ? (albumSemaineParParti.get(row.key)?.pistes[0] ?? null)
            : (discographieParParti.get(row.key)?.pistes[0] ?? null);
      return {
        cle: row.key,
        sigle: row.label,
        nom: row.fullLabel,
        couleur: row.color,
        minutes: row.minutesUne,
        ecart: ecartParParti.get(row.key) ?? null,
        partPct: row.sovPct,
        enjeu: enjeu?.label ?? (row.enjeuxVentiles ? SANS_ENJEU : ENJEU_NON_VENTILE),
        // Dire d'où vient l'enjeu quand ce n'est pas la journée affichée : la
        // journée en cours n'en portait aucun et `buildEnjeux` a reculé. Rien
        // à dire dans le cas courant, donc pas d'infobulle.
        enjeuTitle: enjeu?.dateSource
          ? `Enjeu du ${formatDateFr(enjeu.dateSource)}\u00a0: la journée en cours n'en porte pas encore.`
          : undefined,
        tonMot: row.toneLabel,
        tonPct: row.tonePct,
        tonTitle: row.toneTitle,
        src: couverture?.src,
        sources: couverture?.sources,
      };
    });
  const gagnantTrophee = entreesTrophee[0] ?? null;

  /** LA DATE DE SORTIE — quand le disque « en production » sera pressé.
   *  Réutilise `chart.finish` (`label`/`sub`), déjà la ligne d'arrivée du
   *  graphique juste à côté : le disque et le graphique doivent annoncer LA
   *  MÊME échéance, pas deux calculs qui pourraient un jour diverger. */
  const finishTrophee = data.ranges[range].chart.finish;
  const sortieTrophee =
    range === "today"
      ? `Sortie prévue à ${finishTrophee.label}`
      : range === "week"
        ? `Sortie prévue ${finishTrophee.label} à ${finishTrophee.sub}`
        : `Sortie prévue le ${finishTrophee.sub}`;

  /** LE PLUS LONG DES TITRES POSSIBLES — le gabarit qui fige la largeur.
   *
   *  LE DÉFAUT QU'IL CORRIGE. Le titre change avec la voie choisie, et la
   *  colonne centrale se redimensionnait avec lui : « écouté » fait six lettres,
   *  « apprécié » huit, et le titre est en chasse fixe. Chaque touche sautait
   *  donc d'environ huit pixels VERS L'EXTÉRIEUR au moment même où on la
   *  cliquait. Une commande qui se dérobe sous le doigt se lit comme un défaut,
   *  et elle empêche de cliquer deux fois de suite au même endroit.
   *
   *  Calculé sur les libellés eux-mêmes, et non codé en dur : ajouter une voie
   *  ou changer un mot déplace le gabarit tout seul. La chasse fixe fait que le
   *  plus long en caractères est aussi le plus large en pixels. */
  const gabaritTitre = MODES.flatMap((m) => RANGES.map((r) => titrePalmares(m.cle, r))).reduce(
    (long, t) => (t.length > long.length ? t : long),
  );

  // La garde de PROD vient de main (#547) : l'easter egg reste sur dev.
  if (showDoom && !isProd) {
    return <DoomGame onExit={() => setShowDoom(false)} />;
  }

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">De quel parti parle-t-on dans les médias?</h2>
        </div>
        <div className="control-block">
          <div className="control-row">
            {/* LES DEUX RÉGLAGES SONT DES KNOBS, au-dessus du graphique du
                palmarès. Il ne reste ici que le bouton de partage. */}
            <ShareButton title={shareTitle(data)} anchor="partis-et-couverture" editionKey={editionKey} />
          </div>
        </div>
      </div>

      {/* Le marqueur de développement passe AVANT tout le reste, et il est
          volontairement laid : une capture d'écran d'un rendu sur fixtures ne
          doit pas pouvoir circuler comme si c'était le site. Il ne se rend
          jamais en production, `VITRINE_PARTIES_FIXTURES` étant absent. */}
      {data.surFixtures && (
        <p
          role="status"
          style={{
            margin: "0 0 16px",
            padding: "10px 14px",
            background: "#6B1E2A",
            color: "#F3ECDD",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 13,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Données fictives (développement)&nbsp;: ne pas diffuser
        </p>
      )}

      {data.indisponible && <AvisIndisponible info={data.indisponible} />}

      <div className="pupitre">
        <div className="pupitre-aide">
          <InfoTip size="lg" label="Comment lire cette visualisation">
              <b>Comment lire cette visualisation&nbsp;:</b>
              <br />
              <br />• Chaque parti a sa <b>colonne</b>. Sa hauteur indique la part du temps que
              les médias lui consacrent <i>quand ils parlent d&apos;un parti</i>, et non sur
              l&apos;ensemble de l&apos;actualité, où les partis occupent une place bien plus
              petite. Les cinq colonnes se partagent 100&nbsp;%.
              <br />
              <br />• Chaque colonne porte la <b>couleur de son parti</b>.
              <br />
              <br />• Le curseur <b>Source</b> change de média&nbsp;: les hauteurs se recalculent
              sur les Unes de ce média seul.
              <br />
              <br />• <b>Sourdine</b> : le parti dont on parle le moins sur la période, quelle
              que soit sa part. Le dernier du classement y passe toujours, et sa colonne reste
              affichée sans valeur. À égalité au plus bas, les deux y passent.
              <br />
              <br />• <b>Cliquez un disque</b> pour lire l&apos;article qui en parle le plus,
              quand on en connaît un.
              <br />
              <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#partis-et-couverture`}>
                En savoir plus sur la méthodologie →
              </a>
            </InfoTip>
        </div>

      {/* Quatre decks aux quatre coins, le vumètre entre eux.
          La colonne de gauche porte les rangs 1 et 3, celle de droite les rangs
          2 et 4 : la lecture suit l'ordre naturel de la page, le premier en haut
          à gauche. Les decks débordent volontairement au-dessus et au-dessous de
          la console — ce sont eux les objets, la console est l'instrument qui
          les mesure. */}
      <div className="regie">
        <div className="regie-flanc regie-flanc--gauche">
          <Deck row={decks[0]} rang={1} indisponible={data.indisponible} mediaLabel={mediaLabel}
            articleUrl={decks[0] && lienArticle(decks[0])} />
          <Deck row={decks[2]} rang={3} indisponible={data.indisponible} mediaLabel={mediaLabel}
            articleUrl={decks[2] && lienArticle(decks[2])} />
        </div>

        <div className="regie-centre">
          <Console
            rows={view.rows}
            reference={data.ranges[range].rows}
            onPcqTap={handlePcqTap}
            indisponible={data.indisponible}
            saillanceRang={saillanceRang}
            media={media}
            depuis={view.depuisLabel}
          />
        </div>

        <div className="regie-flanc regie-flanc--droite">
          <Deck row={decks[1]} rang={2} indisponible={data.indisponible} mediaLabel={mediaLabel}
            articleUrl={decks[1] && lienArticle(decks[1])} />
          <Deck row={decks[3]} rang={4} indisponible={data.indisponible} mediaLabel={mediaLabel}
            articleUrl={decks[3] && lienArticle(decks[3])} />
        </div>
      </div>

      {/* Le fader reste EN PLACE tant que la ventilation par média n'est pas
          publiée (aws-refiners#324) — QUE la mesure soit suspendue ou non.
          La condition portait sur `data.indisponible` : elle affichait le
          repli inerte pendant la suspension, puis se réduisait à `null` dès
          que #542 a levé le drapeau, alors que la VRAIE raison de l'absence
          — pas de ventilation par média — n'avait pas changé. Le fader
          disparaissait donc précisément au moment où le module redevenait
          actif. Le panel de médias est une CONSTANTE, connue indépendamment
          de toute donnée : on peut le montrer. Inerte, parce qu'il n'y a rien
          à filtrer, et le dire vaut mieux que de le faire disparaître. */}
      {data.medias.length > 0 ? (
        <Fader medias={data.medias} valeur={media} onChange={setMedia} />
      ) : (
        <Fader
          medias={MEDIA_PANEL_QC.map((id) => ({
            id,
            label: MEDIA_LABELS[id] ?? id,
          }))}
          valeur={TOUS_MEDIAS}
          onChange={() => {}}
          inerte
        />
      )}
      </div>

      {/* LE PALMARÈS SUIT LA TABLE DE MIX depuis le 2026-09-01 (déplacé après
          elle, plutôt qu'en tête du module) : on regarde d'abord qui occupe
          la Une en ce moment, puis le classement qui en résulte dans le
          temps.

          La condition ne teste PLUS `chart.tooShort` : `Palmares` le teste déjà
          et rend une phrase qui dit pourquoi il n'y a pas de courbe. Testé aux
          deux étages, c'est le parent qui gagnait — la section disparaissait
          sans un mot et les trois messages de l'enfant étaient du code mort.
          Le cas n'a rien d'exceptionnel : le raffineur remet ses blocs de 4 h à
          zéro à minuit, donc chaque matin, jusqu'au deuxième bloc publié,
          l'onglet « Jour » n'a qu'un point et rien à tracer. Un trou muet s'y
          lit comme une panne du site. */}
      {!data.indisponible && (
        <section className="partis-course partis-course--tete">
          {/* Le titre a suivi la forme. « En minutes passées en Une » annonçait
              une échelle de durées ; l'axe porte maintenant des PLACES, et les
              minutes ne sont plus qu'au bout de chaque ligne. Un titre qui
              promet une grandeur que le graphique ne trace pas est une
              inexactitude, pas un raccourci.
              
              « LE DISQUE LE PLUS ÉCOUTÉ » plutôt que « qui mène la Une » : le
              module parle disquaire d'un bout à l'autre — le disque d'or se
              couronne « par temps d'écoute », la discothèque aussi, chaque
              parti a sa pochette.
              Le palmarès était le seul endroit à parler encore en minutes de
              Une, et il rompait la métaphore au moment même où elle commence.
              La grandeur réelle n'est pas perdue pour autant : l'infobulle de
              chaque ligne l'énonce en toutes lettres — « 2h27 de Une depuis
              minuit ». L'image en tête, la mesure au survol.
              
              Le PAS suit l'onglet : les blocs de 4 h sur « Jour », les journées
              sur les deux autres. */}
          <p className="course-tete">
            {/* Le gabarit occupe la place sans se voir : c'est LUI qui fixe la
                largeur, donc le titre ne se recentre pas à chaque bascule.
                `aria-hidden`, sans quoi il serait lu deux fois. */}
            <span className="course-tete-gabarit" aria-hidden="true">{gabaritTitre}</span>
            <span>{titrePalmares(modePalmares, range)}</span>
          </p>

          {/* LE PALMARÈS ENCADRÉ : les deux knobs à gauche, le disque d'or à
              droite — un pupitre complet à lui seul, plutôt qu'un graphique nu
              entre deux blocs de commande séparés.
              
              LES KNOBS choisissent ce que le palmarès montre : la MESURE (le
              temps d'écoute ou le ton) et la PÉRIODE. Ils étaient posés
              au-dessus du graphique ; à gauche, ils se lisent comme la console
              d'un instrument qu'on règle avant de le lire, plutôt que comme un
              bandeau qu'on traverse pour atteindre le graphique.
              
              La période commande en réalité TOUT le module, pas seulement le
              palmarès. Elle est ici quand même : c'est le seul endroit où les
              deux réglages se voient ensemble, et les séparer obligerait à
              chercher l'un après avoir trouvé l'autre.
              
              LE DISQUE D'OR, à droite, remplace le bac du jour et la
              discothèque qui vivaient en bas du pupitre : un seul disque —
              celui de la vitesse en cours, quelle que soit la mesure choisie
              (le trophée se gagne à l'écoute, pas au ton) — plutôt qu'un bac
              entier. Voir `PalmaresTrophee`. */}
          <div className="palmares-rangee">
            <div className="palmares-commandes">
              <Knob
                voie="Mesure"
                positions={MODES.map((m) => ({ cle: m.cle, mot: m.onglet, detail: m.infobulle }))}
                valeur={modePalmares}
                onChange={(c) => setModePalmares(c as ModePalmares)}
              />
              <Knob
                voie="Vitesse"
                positions={RANGES.map((r) => ({
                  cle: r,
                  mot: `${data.ranges[r].tabLabel} ${TOURS[r]}\u00a0T`,
                  detail: VITESSE_INFOBULLE[r],
                }))}
                valeur={range}
                onChange={(c) => {
                  setRange(c as RangeKey);
                  // Le panneau déplié parlait de l'ancienne vitesse ; le
                  // rouvrir pour la nouvelle est un second clic, pas un
                  // carry-over qui induirait en erreur.
                  setTrophéeOuvert(false);
                }}
              />
            </div>

            {/* Le palmarès lit TOUJOURS l'agrégat, quelle que soit la position
                du fader : c'est une course entre partis, pas entre médias. Le
                curseur ne commande que le vumètre. */}
            <Palmares chart={data.ranges[range].chart} mode={modePalmares} />

            {gagnantTrophee && (
              <PalmaresTrophee
                range={range}
                apprecie={apprecieTrophee}
                termine={chartTermine(data.ranges[range].chart)}
                gagnant={gagnantTrophee}
                sortie={sortieTrophee}
                ouvert={trophéeOuvert}
                onToggle={() => setTrophéeOuvert((v) => !v)}
              />
            )}
          </div>

          {/* LE PANNEAU, PLEINE LARGEUR, SOUS TOUTE LA RANGÉE — pas dans la
              seule colonne du disque, trop étroite pour cinq cartes. Les CINQ
              entrées, gagnant compris : en production, aucune n'a de pochette
              finale à montrer, les cinq sont à égalité, en cours de mesure. */}
          {gagnantTrophee && trophéeOuvert && (
            <TropheePanel
              range={range}
              apprecie={apprecieTrophee}
              termine={chartTermine(data.ranges[range].chart)}
              entrees={entreesTrophee}
              sortie={sortieTrophee}
              onFermer={() => setTrophéeOuvert(false)}
            />
          )}
        </section>
      )}

      {/* LE BAC DU JOUR ET LA DISCOTHÈQUE ONT QUITTÉ LE BAS DU PUPITRE le
          2026-09-01 : l'accès aux pochettes se fait désormais par le DISQUE
          D'OR, à côté du palmarès (voir `PalmaresTrophee`) — un seul disque à
          la fois plutôt qu'un bac entier.

          LE CLIC SUR UN DECK NE MÈNE PLUS NULLE PART depuis le 2026-09-01 :
          il menait au panneau du disque d'or, une carte déjà retournée, mais
          ce panneau n'a rien à montrer tant que la course n'est pas courue
          (« disque en production » pour les cinq, sans rapport avec le
          parti cliqué) — un geste qui ne menait donc jamais où il le
          promettait. Le deck attend `articleUrl` (aws-refiners#447, voir
          `Deck`) : place gardée pour un vrai lien, pas de geste de repli
          entre-temps. */}

      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

/**
 * Le module n'a rien à affirmer — et il le dit.
 *
 * Placé AVANT le pupitre, pas après : le lecteur doit savoir ce qu'il regarde
 * avant de lire des colonnes à zéro, sinon il en tire une conclusion (« on ne
 * parle pas des partis ») que la donnée ne permet pas.
 *
 * Le module reste affiché plutôt que d'être masqué. Le retirer effacerait
 * l'information la plus utile du moment : que la mesure existe, qu'elle est
 * en panne, et pourquoi.
 *
 * Vocabulaire visuel repris du bandeau d'archive (`.archive-notice`) : pastille
 * cordovan et filets fins, sans barre latérale ni ombre portée — le site emploie
 * déjà cet idiome pour signaler un état, et Adrien avait écarté les autres.
 */
function AvisIndisponible({ info }: { info: Indisponibilite }) {
  const recalibrage = info.raison === "recalibrage";
  return (
    <div className="partis-avis" role="status">
      <p className="partis-avis-line">
        <span className="partis-avis-tag">
          {recalibrage ? "Mesure suspendue" : "Données périmées"}
        </span>
        <span className="partis-avis-body">
          {recalibrage ? (
            <>
              Le modèle qui repère les partis dans les articles ne distingue pas de façon
              fiable les partis québécois les uns des autres. Le défaut n&apos;est pas
              récent&nbsp;: il touche aussi les valeurs publiées avant le{" "}
              {info.lastDateLabel}. Nous préférons ne rien afficher plutôt qu&apos;un
              classement que nous ne pourrions pas défendre. <b>Ce silence est celui de
              notre instrument, pas celui des médias.</b>
            </>
          ) : (
            <>
              Ce module n&apos;a reçu aucune donnée depuis le {info.lastDateLabel}, soit{" "}
              {info.joursDeRetard}&nbsp;jour{info.joursDeRetard > 1 ? "s" : ""}. Rien
              n&apos;est affiché&nbsp;: nous ne présentons pas une donnée périmée comme la
              couverture d&apos;aujourd&apos;hui.
            </>
          )}
        </span>
      </p>
      <a
        className="partis-avis-lien"
        href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#partis-et-couverture`}
      >
        En savoir plus →
      </a>
    </div>
  );
}

/**
 * L'échelle des vumètres, en points de part de voix.
 *
 * FIXE, et non calée sur le meneur : sur une console, un niveau se lit dans
 * l'absolu. Un vumètre auto-calibré mettrait toujours le premier canal à fond,
 * et « dans le rouge » ne voudrait plus rien dire.
 *
 * 50 % est le fond d'échelle : à cinq partis, dominer la moitié de toute la
 * couverture, c'est saturer. Les seuils de couleur ne sont pas décoratifs —
 * 20 % est le PARTAGE ÉGAL entre cinq partis, donc la frontière entre un canal
 * en dessous de sa part et un canal au-dessus.
 */
/** 20 crans pour une pleine échelle de 100 % : un cran vaut 5 points. */
const METER_SEGMENTS = 20;
// Pleine échelle à 100 % et non 50 : le vumètre couvre désormais la TOTALITÉ du
// temps consacré aux partis, si bien qu'un canal plein veut dire « ce parti
// occupe tout ». À 50, un parti à la moitié saturait déjà l'échelle, ce qui
// exagérait les écarts en haut du classement.
const METER_FULL_SCALE = 100;

/**
 * La couleur d'un canal dit son ÉCART À LA MOYENNE, pas son niveau.
 *
 * Deux encodages distincts, donc deux informations : la HAUTEUR porte la part
 * de voix, la COULEUR porte la sur-représentation par rapport à ce que ce parti
 * obtient tous médias confondus.
 *
 * Conséquence voulue : sur « tous les médias », chaque parti est exactement à
 * sa propre moyenne, donc tout reste vert. Les couleurs ne s'allument qu'en
 * bougeant le fader — un canal part dans le rouge parce que CE média-LÀ le
 * pousse au-dessus de sa moyenne.
 */
const SEUIL_ROUGE = 1.3;


/**
 * Position visuelle d'une tranche, pour que le canal le plus fort soit AU
 * CENTRE : rangs pairs à gauche, impairs à droite, soit 4-2-1-3-5. Le HTML
 * reste dans l'ordre du classement — c'est lui qu'énonce un lecteur d'écran.
 */
function positionVisuelle(rang: number, total: number): number {
  if (rang === 1) return 0;
  return rang % 2 === 0 ? -Math.ceil(rang / 2) : Math.ceil((rang - 1) / 2) + total;
}

/**
 * La console — une tranche par parti, un vumètre par tranche.
 *
 * La couleur des segments dit le NIVEAU, jamais le parti : c'est ainsi que
 * fonctionne une console, et c'est ce qui règle au passage la confusion entre
 * les deux bleus de la CAQ et du PQ. L'identité du canal est portée par son
 * étiquette, comme le ruban de couleur collé sur une tranche.
 *
 * Le trait qui flotte au-dessus des segments allumés est le PEAK HOLD : le
 * sommet atteint sur la fenêtre, qui reste affiché longtemps après que le
 * niveau soit redescendu.
 *
 * Un parti dans l'ombre médiatique est un CANAL COUPÉ — pas un dernier de
 * classement. Il quitte la console et passe sous la barre des coupés.
 */
function Console({
  rows,
  reference,
  onPcqTap,
  indisponible,
  saillanceRang,
  media,
  depuis,
}: {
  rows: RowView[];
  /** Les mêmes partis, tous médias confondus — le point de comparaison des
   *  couleurs. Identique à `rows` quand le fader est sur « tous ». */
  reference: RowView[];
  onPcqTap: () => void;
  /** Non nul quand la mesure elle-même est en cause : l'état vide ne peut
   *  alors plus être formulé comme un silence des médias. */
  indisponible: Indisponibilite | null;
  /** Saillance de la Une, 1 → 6. Pilote le tempo, rien d'autre. */
  saillanceRang: number;
  /** Le média affiché, ou `TOUS_MEDIAS`. Le titre le nomme. */
  media: string;
  /** Depuis quand la mesure court : « depuis minuit », « depuis lundi »… */
  depuis: string;
}) {
  // L'ORDRE DES TRANCHES SUIT L'AGRÉGAT, jamais le média affiché : bouger le
  // fader ne doit pas faire sauter les partis d'une position à l'autre. Un
  // canal reste à sa place, et seul son niveau change — c'est ce qui rend la
  // comparaison entre médias lisible.
  /* Le titre nomme la SOURCE : bouger le fader change ce qu'on mesure, et un
     titre qui ne bouge pas laisse croire qu'on lit encore l'ensemble.
     La forme génitive ne se déduit pas du libellé — « de Le Devoir » est
     fautif — d'où la table `MEDIA_DE`. */
  const titre =
    media === TOUS_MEDIAS
      ? "Part de temps passé en Une de l\u2019actualité"
      : `Part de temps passé en Une ${MEDIA_DE[media] ?? `de ${media}`}`;

  const ordre = new Map(reference.map((r, i) => [r.key, i]));
  const tranches = rows
    .slice()
    .sort((a, b) => (ordre.get(a.key) ?? 99) - (ordre.get(b.key) ?? 99));

  // Les canaux en sourdine RESTENT sur la console : un canal muet se voit, il
  // ne disparaît pas. C'est aussi ce que montre un afficheur de table de mix.
  const tete = rows.filter((r) => !r.inShadow)[0];

  // `indisponible` d'abord, AVANT de regarder s'il y a un meneur : la donnée
  // gelée contient des journées à un seul parti détecté (CAQ à 100 %, les
  // quatre autres à zéro). Elles passaient `sovPct > 0` et se rendaient donc
  // comme une part de voix, sous un bandeau qui les cautionnait. Ce n'est pas
  // une mesure : c'est un classifieur qui déclenche une fois. Tant que le
  // module est déclaré indisponible, il n'affiche AUCUN niveau — y compris
  // dans les éditions archivées, qui traversent le même chemin.
  // La console MUETTE garde tout son cadre : titre, échelle, cinq pistes. Seuls
  // les NIVEAUX disparaissent.
  //
  // Elle se réduisait à une ligne de texte, et le module tout entier rapetissait
  // avec elle. L'état sans donnée doit être celui de l'état plein aux niveaux
  // près : c'est la seule façon de voir que l'instrument est là et n'affiche
  // rien, plutôt que de croire qu'il a disparu.
  //
  // « Tous les canaux sont silencieux » n'est vrai que si l'instrument
  // fonctionne. Quand il est en panne, le dire ainsi imputerait aux médias un
  // silence qui est le nôtre : c'est le bandeau au-dessus qui l'explique.
  const muet = Boolean(indisponible) || !tete || tete.sovPct <= 0;
  if (!indisponible && muet) {
    return <p className="console-vide">Aucun parti n&apos;a été détecté sur cette période.</p>;
  }

  return (
    <section
      className="console"
      aria-label="Niveaux de couverture médiatique par parti"
      /* Le tempo des vumètres : 2 s quand l'actualité est très faible, 0,7 s
         quand elle est exceptionnelle. Rang 0 (donnée absente) tombe au milieu
         de l'échelle plutôt qu'à une extrémité. */
      style={{ ["--tempo" as string]: `${saillanceRang > 0 ? 2.0 - (saillanceRang - 1) * 0.26 : 1.35}s` }}
    >
      {/* Le titre vit DANS le cadre du vumètre, pas au-dessus : il nomme
          l'instrument, il ne l'introduit pas. */}
      <p className="console-tete">
        {titre}
        <span className="console-depuis">{depuis}</span>
      </p>
      <div className="console-corps">
        <ol className="console-tranches" style={{ ["--n" as string]: tranches.length }}>
          {tranches.map((row, i) => (
            <Tranche
              muet={muet}
              key={row.key}
              row={row}
              rang={i + 1}
              total={tranches.length}
              moyennePct={reference.find((r) => r.key === row.key)?.sovPct ?? 0}
              onPcqTap={row.key === "pcq" ? onPcqTap : undefined}
            />
          ))}
        </ol>

        {/* Graduations, à droite comme sur une tranche de console.
            `--n` est le NOMBRE DE SEGMENTS sous le repère, pas une fraction de
            hauteur : les segments sont séparés par des gouttières, donc la
            pile n'est pas linéaire et une position en pourcentage tombe à côté.
            Chaque graduation choisie est un multiple de 5 %, donc elle tombe
            exactement sur une frontière entre deux segments. */}
        <ul className="console-graduations" aria-hidden="true">
          {[100, 80, 60, 40, 20, 0].map((v) => (
            <li
              key={v}
              style={{ ["--n" as string]: (v / METER_FULL_SCALE) * METER_SEGMENTS }}
            >
              {v === 20 ? <b>{v} %</b> : `${v} %`}
            </li>
          ))}
        </ul>
      </div>

    </section>
  );
}

/**
 * L'APPARIEMENT d'une pochette engendrée à la ligne qu'elle illustre.
 *
 * Une pochette n'est montrée que si sa signature correspond à ce que le module
 * affiche À CET INSTANT : même parti, même enjeu distinctif, même sens du ton.
 * La chaîne est décalée d'un cycle par construction (le raffineur lit le build
 * courant, le build suivant rapatrie) ; sans cette garde, un changement d'enjeu
 * ferait illustrer la CAQ « santé » sous un module qui annonce « immigration ».
 * Le repli géométrique est préférable à une image qui ment.
 *
 * ⚠️ N'apparie QUE la position « tous les médias ». Les pochettes sont
 * engendrées sur l'agrégat (cf. le contrat d'illustration) ; sur une position du
 * fader, l'enjeu et le ton sont ceux d'un seul média, et la signature ne
 * correspondra pas d'elle-même. C'est le comportement voulu.
 *
 * UN SEUL APPELANT depuis le 2026-09-01 : `entreesTrophee`, pour la couverture
 * du disque d'or du jour. Le clic sur un deck n'ouvre plus de pochette en
 * place — il mène vers `/discotheque`, qui appareille les siennes elle-même.
 */
function pochetteAppariee(row: RowView, duJour: Pochette[]): Pochette | null {
  const attendue = signaturePochette(
    row.key,
    row.enjeux.find((e) => !e.reste && e.label !== SANS_ENJEU)?.label,
    row.toneDirection,
  );
  return duJour.find((p) => p.parti === row.key && p.signature === attendue) ?? null;
}

function Deck({
  row,
  rang,
  indisponible,
  mediaLabel,
  articleUrl,
}: {
  row: RowView | null;
  /** Le rang affiché, de 1 à 4 — la position du deck, pas le rang du parti dans
   *  les cinq (ils coïncident, la sourdine ne retirant que la queue). */
  rang: number;
  indisponible: Indisponibilite | null;
  /** Nom du média affiché, ou `null` sur « tous les médias ». Il s'inscrit
   *  autour du disque et en bandeau sur la pochette : sans lui, rien sur le deck
   *  ne dit que les chiffres portent sur UNE source.
   *
   *  ⚠️ Ce n'est PAS une clé de remontage — celle-ci ne porte que le parti, pour
   *  que le changement de disque ne se rejoue que sur un vrai changement de
   *  piste. */
  mediaLabel: string | null;
  /** L'article vers lequel le deck mène (aws-refiners#447), déjà résolu par
   *  l'appelant — média courant si le fader en désigne un, sinon un média
   *  choisi parmi ceux qui en ont un pour ce parti (voir `lienArticle`).
   *
   *  ⚠️ `null`/absent : PAS de repli vers le panneau du disque d'or (retiré
   *  le 2026-09-01, cf. `PartisCouvertureClient`, section « LE BAC DU
   *  JOUR… ») — le deck reste inerte, place gardée pour le jour où l'article
   *  existe vraiment. */
  articleUrl?: string | null;
}) {

  /** Un deck vide n'est pas une erreur : il dit qu'il n'y avait pas de parti à
   *  ce rang, deux partis s'étant partagé la dernière place en sourdine. */
  /* Un deck vide garde EXACTEMENT la géométrie d'un deck plein : le carré, et
     la pastille du rang dans son coin. Seul le disque est nu.

     La géométrie tenait autrefois à une ligne de texte sous le vinyle ; elle
     tient maintenant au CARRÉ, qui est à ratio fixe et ne dépend d'aucun
     contenu. L'absence de donnée ne peut donc plus changer la forme du module.

     Le rang reste écrit : c'est une position, pas une mesure. Il dit qu'il y a
     bien quatre places, et que celle-ci attend. */
  if (indisponible || !row) {
    return (
      <div
        className={`deck deck--vide${indisponible ? " deck--suspendu" : ""}`}
        title={
          indisponible
            ? "La mesure est suspendue\u00a0: voir l'avis en tête du module."
            : `Aucun parti au ${rang}${rang === 1 ? "er" : "e"} rang sur cette période.`
        }
      >
        <div className="deck-carre">
          <span className="deck-jog deck-jog--vide" aria-hidden="true">
            <span className="deck-jog-cap deck-jog-cap--vide" />
          </span>
          <span className="deck-rang">{rang}</span>
        </div>
      </div>
    );
  }

  /* Le survol du disque annonce ce que le clic FAIT — quand il fait
     quelque chose. `articleUrl` seul déclenche un vrai geste : un lien qui
     QUITTE le site pour l'article qui parle le plus de ce parti. Sans lui,
     le deck n'a RIEN à annoncer depuis le 2026-09-01 (voir la section
     « LE BAC DU JOUR… » plus haut dans le fichier) : plus de repli vers un
     panneau qui ne menait nulle part avant la fin de la course. */
  const annonceDisque = articleUrl
    ? `${row.fullLabel}, ${rang}${rang === 1 ? "er" : "e"} au classement. ` +
      `Lire l'article qui en parle le plus, dans un nouvel onglet.`
    : undefined;

  {/* Face avant — le vinyle. Il n'est plus seulement décoratif depuis que
      la ligne de nom est partie : le sigle gravé sur son capuchon est
      désormais le seul endroit où le parti s'écrit en toutes lettres, et
      la pastille du rang est posée dans son coin haut-gauche.
      Partagé entre les deux gestes possibles (lien vers un article, ou
      bouton de repli) : même disque, la différence est dans ce qui
      l'entoure, pas dans ce qu'il montre. */}
  const visuel = (
    <>
      <span className="deck-face deck-face--disque" aria-hidden="true">
        <span className="deck-jog">
          {/* Le capuchon est un aplat de la couleur EXACTE du parti — celle du
              vumètre — depuis le 2026-09-01. Il reprenait la composition à
              trois couleurs de la pochette (parti, enjeu, ton) ; signalé
              « une pastille à trois couleurs, elle doit être remplacée par
              une pastille de la couleur du parti » : le deck identifie un
              CANAL, comme sa tranche sur la console — l'enjeu et le ton ont
              leur place sur la vraie pochette, pas ici en double. */}
          {mediaLabel && (
            <svg className="deck-jog-media" viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                {/* Un cercle de rayon 25,5, soit deux unités et demie au-delà
                    du capuchon (23) : le nom lui est collé, et non posé au
                    milieu du plateau. Le tracé part de la gauche et tourne
                    dans le sens horaire, si bien qu'un décalage d'un quart
                    place le texte en haut, à l'endroit. */}
                <path
                  id={`arc-${row.key}`}
                  d="M 50,50 m -25.5,0 a 25.5,25.5 0 1,1 51,0 a 25.5,25.5 0 1,1 -51,0"
                  fill="none"
                />
              </defs>
              <text>
                <textPath href={`#arc-${row.key}`} startOffset="25%" textAnchor="middle">
                  {mediaLabel}
                </textPath>
              </text>
            </svg>
          )}
          <svg className="deck-jog-cap" viewBox="0 0 100 100" aria-hidden="true">
            <clipPath id={`cap-${row.key}`}>
              <circle cx="50" cy="50" r="50" />
            </clipPath>
            <g clipPath={`url(#cap-${row.key})`}>
              <rect className="forme-parti" x="0" y="0" width="100" height="100" />
            </g>
            <circle className="cap-cercle" cx="50" cy="50" r="49.4" />
            {/* Retiré le 2026-09-01 (« enlève le trou au centre de cette
                pastille ») : le trou du spindle qui vivait ici, au-dessus du
                sigle. Le sigle revient donc au centre géométrique du
                capuchon (`y="50"`, comme avant son ajout) — même traitement
                que `.trophee-repli`, le sigle seul sur l'aplat du parti. */}
            <text className="cap-sigle" x="50" y="50" textAnchor="middle" dominantBaseline="central">
              {row.label}
            </text>
          </svg>
        </span>
      </span>

      {/* LE RANG, dans le coin du vinyle. Il vit DANS le lien ou le bouton,
          seul élément à position relative du deck : posé plus haut dans
          l'arbre, il se serait calé sur `.deck` et non sur le carré, donc à
          côté du disque plutôt que dessus. L'`aria-label` du conteneur
          l'emporte de toute façon sur ce contenu, qui n'est donc jamais
          annoncé deux fois. */}
      <span className="deck-rang">{rang}</span>
    </>
  );

  return (
    <div
      className="deck"
      style={{ ["--party" as string]: row.color }}
    >
      {/* La clé ne porte QUE le parti, et non la source : changer de média ne
          change pas forcément qui occupe ce deck, keyer sur la source
          rejouait le changement de disque à chaque coup de fader. */}
      {articleUrl ? (
        <a
          key={row.key}
          className="deck-carre"
          href={articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={annonceDisque}
          title={annonceDisque}
        >
          {visuel}
        </a>
      ) : (
        // INERTE, sans `aria-label` ni `title` : rien à annoncer tant qu'il
        // n'y a pas d'article (voir `annonceDisque`), et un `<div>` plutôt
        // qu'un `<button>` pour ne pas laisser croire au clavier ou au
        // survol qu'un clic ferait quelque chose.
        <div key={row.key} className="deck-carre deck-carre--inerte">
          {visuel}
        </div>
      )}
    </div>
  );
}


const MOIS_COURTS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** « 2026-08-10 » → « 10 août ». Chaîne vide si la date manque. */
function formatCourt(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MOIS_COURTS[Number(m) - 1] ?? ""}`;
}

/** La couleur de l'aiguille du petit vumètre de ton, sous chaque colonne —
 *  reprise À L'IDENTIQUE de « Ton en chambre » du module de l'Assemblée
 *  (`.ass-tone` dans `globals.css`) : rouge défavorable `#A8302C`, parchemin
 *  neutre `#C8BDA6`, vert favorable `#3D6B3A`. Deux modules qui mesurent un ton
 *  le montrent pareil.
 *
 *  `tonePct` va de 0 (défavorable) à 100 (favorable), 50 = neutre — le champ
 *  déjà calculé pour le repère de la pochette (`RowView.tonePct`). Interpolation
 *  linéaire entre les deux arrêts qui encadrent la valeur. */
function couleurTon(tonePct: number): string {
  const ROUGE = [0xa8, 0x30, 0x2c];
  const NEUTRE = [0xc8, 0xbd, 0xa6];
  const VERT = [0x3d, 0x6b, 0x3a];
  const p = Math.max(0, Math.min(100, tonePct));
  const [depart, arrivee, f] =
    p <= 50 ? [ROUGE, NEUTRE, p / 50] : [NEUTRE, VERT, (p - 50) / 50];
  const c = depart.map((v, i) => Math.round(v + (arrivee[i] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Une tranche : vumètre segmenté, peak hold, ruban d'identité, ton. */
function Tranche({
  row,
  rang,
  total,
  moyennePct,
  onPcqTap,
  muet,
}: {
  row: RowView;
  rang: number;
  total: number;
  moyennePct: number;
  onPcqTap?: () => void;
  /** Mesure suspendue : la piste garde sa place et son échelle, mais AUCUN
   *  segment ne s'allume et rien ne s'écrit dessous. */
  muet?: boolean;
}) {
  // Sourdine : la colonne reste VIDE — aucun segment, gris compris. Les deux
  // segments gris d'avant (« signal résiduel » d'une table de mix) laissaient
  // croire à un petit niveau ; rien du tout se lit plus clairement, et le
  // vumètre de ton CASSÉ dessous dit déjà « pas de mesure ici ».
  const coupe = !muet && row.inShadow;
  const niveau = Math.min(1, row.sovPct / METER_FULL_SCALE);
  const allumes = muet || coupe ? 0 : Math.max(1, Math.round(niveau * METER_SEGMENTS));
  // Moyenne nulle ⇒ pas d'écart calculable : on reste au vert plutôt que
  // d'inventer une sur-représentation par division par zéro.
  /** Le rang d'un segment dans la tête du vumètre, de 1 (le plus bas des trois)
   *  à 3 (le sommet), ou 0 s'il n'en fait pas partie.
   *
   *  Les trois derniers segments allumés vacillent comme la tête d'un vrai
   *  vumètre : le sommet plonge fort et souvent, les deux du dessous de moins en
   *  moins. Leurs durées sont volontairement incommensurables, pour qu'ils ne se
   *  resynchronisent jamais — c'est ce désaccord qui fait vivant plutôt que
   *  clignotant. Le mouvement ne mesure rien.
   *
   *  Jamais sur un canal en SOURDINE — un canal muet qui se charge annoncerait
   *  une activité qu'il n'a justement pas. Et jamais plus de segments qu'il n'y
   *  en a d'allumés : sous trois, la cascade se raccourcit au lieu de déborder
   *  sur des segments éteints. */
  const debutVu = Math.max(0, allumes - 3);
  const vu = (i: number) =>
    !coupe && i < allumes && i >= debutVu ? i - debutVu + 1 : 0;

  const ratio = moyennePct > 0 ? row.sovPct / moyennePct : 1;
  const ecart = Math.round((ratio - 1) * 100);
  const phrase = phraseColonne(row, ecart);

  return (
    <li
      className={`console-tranche${coupe ? " coupee" : ""}`}
      style={{
        ["--ordre" as string]: positionVisuelle(rang, total),
        ["--party" as string]: row.color,
      }}
    >
      <div className="console-vumetre" title={phrase}>
        <span className="visually-hidden">{phrase}</span>
        {/* Du haut vers le bas : le segment 19 est en haut de l'échelle. */}
        {Array.from({ length: METER_SEGMENTS }, (_, k) => METER_SEGMENTS - 1 - k).map((idx) => (
          <i
            key={idx}
            className={
              `seg${coupe ? " mute" : ""}${idx < allumes ? " on" : ""}` +
              (vu(idx) ? ` vu vu--${vu(idx)}` : "")
            }
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Le ruban n'est plus une commande : les decks se remplissent seuls, par
          rang. Un <button> annoncerait donc aux lecteurs d'écran un contrôle
          qui ne fait rien. Le clic ne sert plus qu'au jeu caché, volontairement
          hors du parcours clavier. */}
      <span className="console-ruban-nom" onClick={() => onPcqTap?.()}>
        {row.label}
      </span>
      {/* LE PETIT VUMÈTRE DE TON, sous la colonne — une fenêtre rectangulaire,
          esprit vumètre de magnéto. L'AIGUILLE dévie de −58° (bout rouge,
          défavorable) à +58° (bout vert, favorable) selon `tonePct`, qui va
          de 0 à 100 : l'angle vaut `(tonePct − 50) × 1,16`. Ce commentaire
          annonçait ±27° ; c'est LUI qui a été réécrit pour dire ce que le
          code fait, et le code n'a pas bougé — personne n'a demandé de
          réduire la course de l'aiguille. Si ±27° était bien l'intention de
          départ, alors c'est le facteur 1,16 qui est à revoir (0,54), et ça
          se décide avec Jules, pas dans un commentaire. Sa
          couleur reprend le dégradé de « Ton en chambre » (`couleurTon`).
          Angle ET couleur disent la même chose. Elle frémit, décalée d'une
          colonne à l'autre (`--ct-phase`) ; coupé pour `prefers-reduced-motion`.

          POUR UN CANAL EN SOURDINE : le même boîtier, mais CASSÉ (`--casse`) —
          aiguille affalée hors échelle, cadran éteint, plus aucun frémissement.
          Rien n'est mesuré là, et ça se voit.

          `aria-hidden` ; le `<title>` porte la phrase de ton au survol. */}
      {!muet && (
        <svg
          className={`console-ton${coupe ? " console-ton--casse" : ""}`}
          viewBox="0 0 64 24"
          aria-hidden="true"
          style={{
            ["--ct-angle" as string]: `${((row.tonePct - 50) * 1.16).toFixed(1)}deg`,
            ["--ct-ton" as string]: couleurTon(row.tonePct),
            ["--ct-phase" as string]: (choisirParmi(row.key, 24) / 10).toFixed(1),
          }}
        >
          <title>{coupe ? "Aucun ton à mesurer : le parti est en sourdine." : row.toneTitle}</title>
          <clipPath id={`ct-${row.key}`}>
            <rect x="0.6" y="0.6" width="62.8" height="22.8" rx="1.6" />
          </clipPath>
          <rect className="ct-cadre" x="0.6" y="0.6" width="62.8" height="22.8" rx="1.6" />
          {/* Cadran, aiguille et couleurs occupent TOUT le boîtier (viewBox
              inchangé) : arc large, traits épais. Le débord est rogné par le
              clip. */}
          <g clipPath={`url(#ct-${row.key})`}>
            <path className="ct-echelle ct-echelle--defav" d="M15.04 16.40 A20 20 0 0 1 25.38 8.13" />
            <path className="ct-echelle" d="M25.38 8.13 A20 20 0 0 1 38.62 8.13" />
            <path className="ct-echelle ct-echelle--fav" d="M38.62 8.13 A20 20 0 0 1 48.96 16.40" />
            <line className="ct-tick" x1="32" y1="7" x2="32" y2="10.5" />
            <g className="ct-pivot">
              <g className="ct-saut">
                {/* L'aiguille en deux traits : un liseré sombre dessous pour
                    qu'elle tienne sur le cadran ivoire quel que soit le ton,
                    la couleur du ton dessus. */}
                <line className="ct-aiguille-fond" x1="32" y1="27" x2="32" y2="4" />
                <line className="ct-aiguille" x1="32" y1="27" x2="32" y2="4" />
              </g>
            </g>
            <circle className="ct-axe" cx="32" cy="27" r="3" />
          </g>
        </svg>
      )}

      {/* « Sourdine » — SOUS le vumètre cassé, dans la 4e rangée réservée de la
          grille (vide pour les colonnes actives, pour que tous les boîtiers
          restent alignés). Le mot reste le seul emprunt visible au vocabulaire
          de la table de mixage : court, connu, il dit l'état mieux qu'un rang. */}
      {coupe && (
        <span className="console-sourdine">
          Sourdine
          <InfoTip size="sm" label="Sourdine">
            C&apos;est le parti dont les médias parlent le MOINS sur cette période. Le
            dernier du classement passe toujours en sourdine, quelle que soit sa part,
            et sa colonne reste affichée sans valeur. En cas d&apos;égalité au plus bas,
            les deux y passent.
          </InfoTip>
        </span>
      )}
    </li>
  );
}


/**
 * Le fader — choisir la source qu'on écoute.
 *
 * Un `input[type=range]` à crans plutôt qu'un menu déroulant : sur une
 * console, on ne choisit pas une source dans une liste, on pousse un curseur.
 * Le clavier fonctionne (flèches), et le lecteur d'écran annonce la valeur via
 * `aria-valuetext`, que le rendu visuel ne lui donnerait pas.
 *
 * « Tous les médias » n'est pas la position 0 mais le cran CENTRAL (index 3 de
 * MEDIA_ORDER), la position de repos du crossfader. Il lit la table AGRÉGÉE —
 * pas la moyenne des autres positions.
 */
function Fader({
  medias,
  valeur,
  onChange,
  inerte,
}: {
  medias: { id: string; label: string }[];
  valeur: string;
  onChange: (v: string) => void;
  /** Mesure suspendue : le curseur garde sa place mais ne commande rien — il
   *  n'y a aucune donnée à filtrer. */
  inerte?: boolean;
}) {
  // Ordre du crossfader : « tous » AU CENTRE, les médias de part et d'autre.
  // MEDIA_ORDER fixe la disposition ; tout média publié mais absent de cette
  // liste est ajouté à la fin plutôt que d'être escamoté.
  const parId = new Map(medias.map((m) => [m.id, m]));
  const connus = MEDIA_ORDER.flatMap((id) =>
    id === TOUS_MEDIAS
      ? [{ id: TOUS_MEDIAS, label: "Tous les médias" }]
      : parId.has(id)
        ? [parId.get(id)!]
        : [],
  );
  const restants = medias.filter((m) => !MEDIA_ORDER.includes(m.id));
  const positions = [...connus, ...restants];
  const idx = Math.max(0, positions.findIndex((p) => p.id === valeur));
  const courante = positions[idx];

  return (
    <div className={`fader${inerte ? " fader--inerte" : ""}`}>
      <div className="fader-piste">
        <input
          type="range"
          min={0}
          max={positions.length - 1}
          step={1}
          value={idx}
          onChange={(e) => onChange(positions[Number(e.target.value)].id)}
          disabled={inerte}
          aria-label="Source médiatique"
          aria-valuetext={courante.label}
          className="fader-input"
        />
        <div className="fader-crans" aria-hidden="true">
          {positions.map((p, i) => (
            <span
              key={p.id}
              className={`fader-cran${i === idx ? " actif" : ""}${
                p.id === TOUS_MEDIAS ? " tous" : ""
              }`}
              /* La poignée native ne va pas de 0 à 100 % : elle est rentrée
                 d'une demi-largeur à chaque bout pour rester dans la piste. Les
                 crans suivent la même course, sinon la tirette ne tomberait pas
                 dessus. --pouce porte cette largeur, définie en CSS. */
              style={{
                left: `calc(var(--pouce) / 2 + ${
                  i / (positions.length - 1)
                } * (100% - var(--pouce)))`,
              }}
              title={
                p.id === TOUS_MEDIAS
                  ? "Tous les médias réunis, chacun pesé selon son temps de Une"
                  : /* `MEDIA_DANS` est capitalisé pour OUVRIR une phrase
                       (« Dans Le Devoir, … ») : en milieu de phrase il faut
                       décapitaliser la préposition, sinon on lit « les Unes
                       Dans Le Devoir ». Seule la première lettre bouge — le
                       titre du quotidien garde la sienne. */
                    `Ne montrer que les Unes ${
                      MEDIA_DANS[p.id]
                        ? MEDIA_DANS[p.id].charAt(0).toLowerCase() + MEDIA_DANS[p.id].slice(1)
                        : `de ${p.label}`
                    }`
              }
            >
              <i />
              <b>{p.id === TOUS_MEDIAS ? "tous" : (MEDIA_SIGLES[p.id] ?? p.id)}</b>
            </span>
          ))}
        </div>
      </div>

      {/* « Source » SOUS le curseur, et plus de titre du média à droite : la
          manchette nomme déjà le média en toutes lettres et le cran actif porte
          son sigle. Le répéter en gros corps disputait l'attention à la
          manchette, qui est ce qu'on doit lire en premier. */}
      <span className="fader-label">Source</span>
    </div>
  );
}


/** L'ANGLE d'un cran, en degrés. Le cadran balaie 120°, de -60 à +60 : c'est la
 *  course d'un commutateur à crans, pas d'un potentiomètre. Un cran unique
 *  pointerait droit devant. */
const angleDuCran = (i: number, total: number) => (total > 1 ? -60 + (i * 120) / (total - 1) : 0);

/**
 * UN KNOB — un commutateur rotatif à crans.
 *
 * POURQUOI PAS DES ONGLETS. Le module est un pupitre : ses commandes se
 * poussent, se pressent et se tournent. Deux réglages y choisissent ce que le
 * palmarès montre — la mesure et la période — et un commutateur rotatif est
 * l'objet qui fait ça sur une console. L'aiguille dit la position choisie sans
 * un mot, et les crans montrent qu'il y en a d'autres.
 *
 * L'INTERACTION. Un clic avance d'un cran et revient au premier après le
 * dernier, comme un commutateur qu'on tourne toujours dans le même sens. Les
 * FLÈCHES vont dans les deux sens, ce qu'un bouton seul ne permet pas : sans
 * elles, revenir d'un cran demanderait de faire tout le tour.
 *
 * CE QU'IL ANNONCE. Le cadran est un vrai `<button>` dont le nom accessible
 * porte la voie ET sa position — « Mesure : Écouté » — parce qu'un bouton nommé
 * « Mesure » seul ne dirait pas où il en est. L'aiguille, les crans et le mot
 * affiché sont `aria-hidden` : ils redisent en image ce que le nom énonce.
 */
function Knob({
  voie,
  positions,
  valeur,
  onChange,
}: {
  /** Le nom de la commande, sous le cadran — comme « Source » sous le fader. */
  voie: string;
  /** `detail` est facultatif : c'est la phrase qui dit ce que la position
   *  couvre. Elle apparaît dans l'infobulle du cadran, pour la position en
   *  cours — sans quoi « Campagne » n'annoncerait pas jusqu'où elle va. */
  positions: readonly { cle: string; mot: string; detail?: string }[];
  valeur: string;
  onChange: (cle: string) => void;
}) {
  const n = positions.length;
  // `Math.max(0, …)` : une valeur inconnue pointe le premier cran plutôt que de
  // faire disparaître l'aiguille sur un index -1.
  const i = Math.max(0, positions.findIndex((p) => p.cle === valeur));
  const bouger = (pas: number) => onChange(positions[(i + pas + n) % n].cle);

  return (
    <div className="knob">
      <button
        type="button"
        className="knob-cadran"
        aria-label={`${voie}\u00a0: ${positions[i].mot}. Tourner pour changer.`}
        title={
          `${voie}\u00a0: ${positions[i].mot}.` +
          `${positions[i].detail ? ` ${positions[i].detail}` : ""}` +
          ` Tourner pour changer\u00a0: ${positions.map((p) => p.mot).join(", ")}.`
        }
        onClick={() => bouger(1)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            bouger(-1);
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            bouger(1);
          }
        }}
      >
        <span className="knob-crans" aria-hidden="true">
          {positions.map((p, k) => (
            <i
              key={p.cle}
              className={k === i ? "actif" : undefined}
              style={{ ["--a" as string]: `${angleDuCran(k, n)}deg` }}
            />
          ))}
        </span>
        <span
          className="knob-aiguille"
          style={{ ["--a" as string]: `${angleDuCran(i, n)}deg` }}
          aria-hidden="true"
        />
      </button>
      {/* LE GABARIT, même geste que `.course-tete-gabarit` (le titre du
          palmarès) : chaque position possible est posée, invisible, dans la
          MÊME cellule de grille que le mot affiché — la boîte prend donc
          toujours la largeur de la position la plus longue. Sans lui,
          « Jour » et « Campagne 33 T » n'ont pas la même largeur, et tourner
          un knob élargissait ou rétrécissait toute la colonne — jusqu'à
          pousser le graphique du palmarès à côté. */}
      <span className="knob-valeur-boite">
        {positions.map((p) => (
          <span key={p.cle} className="knob-valeur-gabarit" aria-hidden="true">{p.mot}</span>
        ))}
        <span className="knob-valeur" aria-hidden="true">{positions[i].mot}</span>
      </span>
      <span className="fader-label">{voie}</span>
    </div>
  );
}

/**
 * Le palmarès — la course aux RANGS, les cinq partis sur un seul graphique.
 *
 * L'axe des X est celui de l'onglet (heures, jours, dates) ; l'axe des Y porte
 * les cinq PLACES, du premier au dernier. Ce qui monte et descend ici n'est
 * donc pas une quantité mais une position, et les croisements sont
 * l'information : on voit qui double qui, et quand.
 *
 * POURQUOI PAS DES DURÉES. `lib/rangs.ts` le raconte en détail. En deux mots :
 * six blocs de 4 h par jour ne font pas des courbes, une donnée où un parti
 * domine et quatre s'écrasent ne se lit pas sur une échelle commune, et une
 * bande large et basse est le pire format pour des lignes. La durée n'a pas
 * disparu pour autant — elle est écrite au bout de chaque ligne, parce que
 * « la CAQ a occupé 2 h 15 » est le chiffre qui se cite et que le rang, lui, ne
 * dit jamais DE COMBIEN.
 *
 * ⚠️ Les cinq lignes partagent la même bande, et le validateur de palette
 * ÉCHOUE sur ces couleurs : QS et le PLQ sont à ΔE 10,9 en vision normale, sous
 * le plancher de 15 — deux lecteurs sur trois les confondront à l'œil. Les
 * couleurs des partis ne sont pas réétalonnables. C'est pourquoi le NOM de
 * chaque parti est écrit au bout de sa ligne : c'est lui qui porte l'identité,
 * la couleur ne fait que la rappeler. Ici l'étiquetage direct ne demande aucun
 * arrangement — les rangs étant une permutation, il y a exactement une ligne
 * par place à l'arrivée, donc exactement une étiquette par rangée.
 *
 * La zone est étirée (`preserveAspectRatio="none"`) pour occuper toute la
 * largeur du module. Les étiquettes sont donc des éléments HTML placés en
 * pourcentage, et non des formes SVG : sous un étirement non uniforme, un carré
 * SVG deviendrait un rectangle, et un texte SVG serait déformé.
 */
function Palmares({ chart, mode }: { chart: ChartView; mode: ModePalmares }) {
  // Un troisième message invitait à « ramener le curseur au centre », pour le
  // cas où le détail horaire n'existe que sur l'agrégat. Il ne pouvait pas
  // s'afficher — le palmarès reçoit TOUJOURS l'agrégat, jamais une vue par
  // média — et il aurait été trompeur s'il l'avait pu, le fader ne commandant
  // pas ce graphique.
  if (chart.tooShort) {
    return (
      <p className="course-vide">
        {chart.raison === "detail-horaire-absent"
          ? "Le détail heure par heure n'est pas encore publié pour cette période."
          : "Une seule journée de données. Pas encore de tendance à lire."}
      </p>
    );
  }

  /* CE QU'ON CLASSE, selon la course choisie. Une seule ligne décide, et tout
     le reste — l'ordre de dessin, les rangs, la valeur écrite au bout — en
     découle. Les deux pistes partagent les mêmes abscisses, si bien que basculer
     ne déplace aucun point sur l'axe du temps : seules les hauteurs changent. */
  const apprecie = mode === "apprecie";
  /** LA JOURNÉE CHOISIE SUR L'AXE, ou `null` pour la dernière.
   *
   *  Le graphique trace une course aux RANGS : à chaque journée, qui est
   *  premier, deuxième, troisième. Cette information était tracée sans qu'on
   *  puisse la DÉSIGNER — on lisait la position d'une ligne, pas le classement
   *  d'un jour. Choisir une graduation fige le classement de cette journée-là
   *  dans les étiquettes de bout ; la reprendre revient au dernier relevé.
   *
   *  On garde l'abscisse du RELEVÉ (`xPoint`) et non celle de la graduation :
   *  sur la campagne, les repères ne tombent pas sur les journées. */
  const [jourChoisi, setJourChoisi] = useState<{ x: number; label: string } | null>(null);

  /** « Mercredi 8 juillet » s'insère après « du » : la majuscule y ferait une
   *  coquille. Même geste que `labelDateIndispo` dans `lib/data/parties.ts`. */
  const enMinuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  const pisteDe = (s: ChartView["series"][number]) => (apprecie ? s.polylineTon : s.polylineMin);
  /** ⚠️ UN PARTI SANS TON EST RENVOYÉ EN QUEUE, jamais au milieu.
   *
   *  `lastEcartTon` vaut `null` quand aucun article n'a parlé du parti : il n'a
   *  pas un ton neutre, il n'a pas de ton. Le trier comme un zéro le plaçait au
   *  milieu du peloton, au-dessus de partis réellement malmenés. `-Infinity` ne
   *  sert QU'À ce tri, et ne s'écrit jamais : l'étiquette lit `lastEcartTon` et
   *  affiche « n. d. ». */
  const valeurDe = (s: ChartView["series"][number]) =>
    apprecie ? (s.lastEcartTon ?? Number.NEGATIVE_INFINITY) : s.lastMinutes;
  const ecriteDe = (s: ChartView["series"][number]) =>
    apprecie ? formatEcartTon(s.lastEcartTon) : formatDuree(s.lastMinutes);

  /* LA COURSE AUX RANGS. On ne trace plus des durées mais des PLACES : à chaque
     bloc, qui est premier, deuxième, troisième. `lib/rangs.ts` dit pourquoi la
     forme a changé — en deux mots, six points par jour et une donnée très
     asymétrique ne font pas des courbes, et un rang est discret.

     Chaque ligne est dessinée deux fois — le trait qu'on voit et la bande large
     qu'on vise — et les deux suivent exactement le même chemin, sinon on
     cliquerait à côté de ce qu'on montre.

     CALCULÉS AVANT LE TRI, et non après : `rangsParInstant` classe lui-même à
     chaque abscisse, sa sortie ne dépend donc pas de l'ordre qu'on lui donne.
     C'est ce qui permet d'ORDONNER les étiquettes sur le classement d'une
     journée choisie — l'ordre a besoin des rangs, les rangs n'ont pas besoin de
     l'ordre. */
  const rangs = rangsParInstant(chart.series.map((s) => ({ cle: s.key, points: pisteDe(s) })));

  /** Le rang d'un parti à la journée choisie, ou au dernier relevé. */
  const rangAu = (cle: string): [number, number] | null => {
    const suite = rangs.get(cle) ?? [];
    if (!jourChoisi) return suite.at(-1) ?? null;
    return suite.find(([x]) => Math.abs(x - jourChoisi.x) < 0.01) ?? suite.at(-1) ?? null;
  };

  // De haut en bas : le meilleur en premier, comme un classement. Quand une
  // journée est choisie, c'est SON classement qui ordonne — c'est tout l'objet
  // du clic. Sinon, l'ordre du dernier relevé.
  const series = chart.series
    .slice()
    .sort((a, b) =>
      jourChoisi
        ? (rangAu(a.key)?.[1] ?? Number.POSITIVE_INFINITY) -
          (rangAu(b.key)?.[1] ?? Number.POSITIVE_INFINITY)
        : valeurDe(b) - valeurDe(a),
    );

  const nRangs = series.length;
  const chemins = new Map(
    series.map((s) => [
      s.key,
      cheminDeRang(
        depuisLOrigine(
          (rangs.get(s.key) ?? []).map(([x, r]) => [x, hauteurDuRang(r, nRangs, chart.height)]),
        ),
      ),
    ]),
  );
  /* Le bout de chaque ligne : c'est là que se pose son étiquette. Pris dans la
     suite des rangs et non dans `lastX`/`lastYMin`, pour que le nom soit
     exactement au bout du trait et non à côté. */
  const bouts = new Map(series.map((s) => [s.key, rangAu(s.key)]));

  /* CE QU'IL RESTE À COURIR : du dernier relevé jusqu'à la ligne d'arrivée.
     Toutes les lignes partagent les mêmes abscisses, donc n'importe laquelle
     donne la borne. Un demi-pour-cent de garde : sur une course terminée, le
     dernier point EST l'arrivée et il n'y a pas de piste à dessiner. */
  const xDernier = Math.max(0, ...series.map((s) => bouts.get(s.key)?.[0] ?? 0));
  const resteACourir = chart.finish.x - xDernier > chart.width * 0.005;

  /* Mettre un parti EN VEDETTE : les autres s'effacent sans disparaître.
   *
   *  C'est ce qui rend la course jouable — on suit un coureur du regard — et
   *  c'est aussi ce qui rattrape la faiblesse mesurée de la palette : QS et le
   *  PLQ sont à ΔE 10,9 en vision normale, sous le plancher de 15. Tant que les
   *  cinq courbes se croisent, la couleur seule ne les sépare pas ; isolée, la
   *  courbe ne se confond avec rien.
   *
   *  DEUX ENTRÉES, ET AUCUNE N'EST LE SURVOL. Celui-ci a été retiré plus tôt :
   *  le graphique changeait sous le curseur au moindre déplacement, et on ne
   *  pouvait plus lire le peloton sans écarter la souris. Restent le CLIC, qui
   *  fixe, et le FOCUS, qui prévisualise — le second est la seule prise qu'ait
   *  le clavier, et il passe par les jetons de la légende. Les bandes de saisie
   *  du SVG, elles, ne sont pas focalisables.
   *
   *  L'entrée clavier avait disparu avec l'encadré du classement, le
   *  2026-08-30 ; la légende la rend le même jour. */
  const [isole, setIsole] = useState<string | null>(null);
  const [focalise, setFocalise] = useState<string | null>(null);
  const vedette = focalise ?? isole;


  return (
    <figure className={"palmares-figure" + (vedette ? " a-vedette" : "")}>
      <div className="palmares-corps">
        <div className="palmares-zone">
          <svg
            className="palmares-svg"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* LES FILETS DE GRADUATION ONT ÉTÉ RETIRÉS le 2026-08-30 : cinq
                pointillés horizontaux sur un graphique haut de 52 px faisaient
                plus de hachures que de courbe. Les durées restent écrites à
                gauche, elles portent l'échelle à elles seules. La verticale
                ci-dessous, elle, n'est pas une graduation : c'est l'arrivée. */}
            {/* La ligne d'ARRIVÉE : le vide à sa gauche est ce qu'il reste à
                courir. C'est elle qui fait de la mesure une course. */}
            <line
              className="palmares-arrivee"
              x1={chart.finish.x}
              x2={chart.finish.x}
              y1="0"
              y2={chart.height}
            />
            {/* DU DERNIER AU PREMIER, et chaque ligne porte un HALO de papier.
                
                C'est ce qui rend un croisement lisible : sans lui, deux lignes
                qui se coupent se confondent en un X ambigu où l'on ne sait plus
                laquelle passe devant. Le halo creuse la ligne du dessous, et
                l'ordre de dessin décide — le meneur, tracé en dernier, passe
                au-dessus de tout le monde. */}
            {series
              .slice()
              .reverse()
              .map((s, iRev) => {
                const i = series.length - 1 - iRev;
                return (
                  <g key={s.key}>
                    <path
                      className="palmares-halo"
                      d={chemins.get(s.key)}
                      style={{ ["--retard" as string]: `${(series.length - 1 - i) * 110}ms` }}
                    />
                    <path
                      className={
                        `palmares-trait${s.inShadow ? " shadow" : ""}` +
                        (vedette === s.key ? " vedette" : "") +
                        (i === 0 ? " meneur" : "")
                      }
                      d={chemins.get(s.key)}
                      style={{
                        ["--party" as string]: s.color,
                        ["--retard" as string]: `${(series.length - 1 - i) * 110}ms`,
                      }}
                    />
                  </g>
                );
              })}
            {/* LE PROLONGEMENT JUSQU'À L'ARRIVÉE.
                
                Chaque ligne tient son dernier rang connu jusqu'à la ligne
                d'arrivée, à plat. C'est le symétrique exact du palier de gauche
                (`depuisLOrigine`) : là on prolongeait en arrière ce qu'on avait
                trouvé en ouvrant les yeux, ici on prolonge en avant ce qu'on
                sait au dernier relevé.
                
                TIRETÉ, ET C'EST NON NÉGOCIABLE. Le segment de gauche décrit du
                passé non observé ; celui-ci décrit de l'AVENIR. Un trait plein
                affirmerait que le classement tiendra jusqu'à 20h, ce que
                personne ne sait — le tireté dit « tenu, pas mesuré ». C'est la
                seule chose qui sépare un prolongement d'une prédiction.
                
                Rien quand la course est courue : le dernier point EST l'arrivée,
                il n'y a plus rien à prolonger. */}
            {resteACourir &&
              series.map((s) => {
                const bout = bouts.get(s.key);
                if (!bout) return null;
                const y = hauteurDuRang(bout[1], nRangs, chart.height);
                return (
                  <path
                    key={`attente-${s.key}`}
                    className={`palmares-attente${s.inShadow ? " shadow" : ""}`}
                    d={`M ${bout[0]} ${y} L ${chart.finish.x} ${y}`}
                    style={{ ["--party" as string]: s.color }}
                  />
                );
              })}

            {/* Bande de SAISIE, large et invisible : un trait fin ne se vise pas
                à la souris. Elle suit le MÊME chemin que le trait visible.
                Le clavier, lui, passe par les étiquettes de bout de ligne. */}
            {series.map((s) => (
              <path
                key={`touche-${s.key}`}
                className="palmares-touche"
                d={chemins.get(s.key)}
                onClick={() => setIsole((k) => (k === s.key ? null : s.key))}
              />
            ))}
          </svg>

          {/* L'ÉTIQUETTE DE BOUT DE LIGNE — le sigle ET la durée.
              
              AUCUN ARRANGEMENT N'EST NÉCESSAIRE, et c'est tout le gain de la
              course aux rangs : à l'arrivée les cinq partis occupent cinq
              places distinctes, donc il y a exactement une étiquette par rangée.
              L'écarteur qui servait aux courbes de durées n'a plus d'objet.
              
              LA DURÉE Y EST ÉCRITE, et il le faut : le rang dit qui mène, jamais
              DE COMBIEN. Premier de dix minutes ou de six heures, c'est le même
              trait. « La CAQ a occupé 2 h 15 » est le chiffre qui se cite, et
              sans lui le module perdrait ce qu'il mesure.
              
              CE SONT DES BOUTONS : ils se tabulent, leur focus prévisualise la
              mise en vedette, leur clic l'arrête. Le nom qu'il fallait de toute
              façon écrire fait aussi la commande — aucun meuble ajouté. */}
          {series.map((s) => {
            const bout = bouts.get(s.key);
            if (!bout) return null;
            const [, rangFin] = bout;
            return (
              <button
                key={`etiquette-${s.key}`}
                type="button"
                className={
                  `palmares-etiquette${s.inShadow ? " shadow" : ""}` +
                  (vedette === s.key ? " vedette" : "")
                }
                style={{
                  ["--party" as string]: s.color,
                  // AU BOUT DE L'AXE, et non au dernier relevé. La ligne se
                  // prolonge maintenant jusqu'à l'arrivée : laisser le nom au
                  // dernier point l'aurait posé en plein milieu du cadre, avec
                  // du trait qui continue derrière lui. Les cinq étiquettes
                  // s'alignent donc en colonne, une par rangée.
                  left: `${(chart.finish.x / chart.width) * 100}%`,
                  top: `${(hauteurDuRang(rangFin, nRangs, chart.height) / chart.height) * 100}%`,
                }}
                onFocus={() => setFocalise(s.key)}
                onBlur={() => setFocalise(null)}
                onClick={() => setIsole((k) => (k === s.key ? null : s.key))}
                aria-pressed={isole === s.key}
                title={
                  // `mesureLabel` dit CE QUE COUVRE la valeur, et il change d'un
                  // onglet à l'autre : « depuis minuit » sur Jour, où le
                  // raffineur cumule, la date du dernier jour sur les deux
                  // autres, où le classement se fait sur ce jour-là. Sans lui,
                  // le même nombre voudrait dire deux choses.
                  `${s.label}, ${rangFin}${rangFin === 1 ? "er" : "e"} : ` +
                  (apprecie
                    ? `${phraseEcartTon(s.lastEcartTon)}, ${chart.mesureLabel}. `
                    : `${ecriteDe(s)} de Une ${chart.mesureLabel}. `) +
                  `Cliquez pour ne garder que cette ligne.`
                }
              >
                {/* LE RANG REMPLACE LA PUCE. Une pastille de couleur ne disait
                    que l'identité, déjà portée par le sigle juste à côté ; le
                    chiffre dit la PLACE, et il la dit à l'endroit exact où l'œil
                    arrive. C'est ce qui permet de retirer l'axe des rangs à
                    gauche : la graduation n'a plus rien à graduer. */}
                <i className="palmares-rang" aria-hidden="true">{rangFin}</i>
                <span className="palmares-etiquette-sigle">{s.label}</span>
                {/* PAS DE DURÉE AU BOUT DE LA LIGNE.
                    Le graphique trace des RANGS, pas des durées : y écrire des
                    minutes invitait à les comparer à la pochette du même parti,
                    qui couvre toute la période. Les deux ne mesuraient pas la
                    même chose et se contredisaient à l'écran — mesuré le
                    2026-09-04, pochette CAQ 90 h 03 en tête quand le palmarès
                    montrait 6 h 34 au PQ. Le rang, lui, se lit sans ambiguïté.
                    L'écart de ton reste écrit : ce n'est pas une durée, et rien
                    d'autre à l'écran ne le donne. */}
                {apprecie && <b className="palmares-etiquette-duree">{ecriteDe(s)}</b>}
              </button>
            );
          })}

          <i
            className="palmares-damier"
            style={{ left: `${(chart.finish.x / chart.width) * 100}%` }}
            aria-hidden="true"
          />

        </div>
      </div>

      {/* Le repère d'arrivée MARQUE celui qui existe déjà, au lieu d'en poser
          un second : `xLabels` porte un point à l'abscisse de l'arrivée sur les
          deux vues (« 20h » sur la journée, le dernier jour sur les autres), et
          en ajouter un l'écrivait exactement par-dessus. On ne l'ajoute que si
          aucun ne coïncide. */}
      <ul className="palmares-x">
        {chart.xLabels.map((l) => {
          const arrivee =
            Math.abs(l.x - chart.finish.x) < 0.5 || l.label === chart.finish.label;
          const choisie = jourChoisi !== null && l.xPoint === jourChoisi.x;
          const classes =
            (arrivee ? "palmares-x-arrivee" : "") + (choisie ? " palmares-x-choisi" : "");
          return (
            <li
              key={l.label}
              className={classes.trim() || undefined}
              style={{ left: `${(l.x / chart.width) * 100}%` }}
            >
              {/* UNE GRADUATION QUI DÉSIGNE UNE JOURNÉE EST UN BOUTON.
                  La course trace un classement par journée ; sans prise, on
                  lisait la position d'une ligne sans pouvoir nommer le jour.
                  Les repères de la vue Jour sont horaires et ne désignent
                  aucune journée : ils restent du texte. */}
              {l.jour && l.xPoint !== undefined ? (
                <button
                  type="button"
                  className="palmares-x-bouton"
                  aria-pressed={choisie}
                  title={
                    choisie
                      ? `Classement du ${enMinuscule(formatDateFr(l.jour))}. Cliquez pour revenir au dernier relevé.`
                      : `Voir le classement du ${enMinuscule(formatDateFr(l.jour))}.`
                  }
                  onClick={() =>
                    setJourChoisi((j) =>
                      j && j.x === l.xPoint ? null : { x: l.xPoint!, label: enMinuscule(formatDateFr(l.jour!)) },
                    )
                  }
                >
                  {l.label}
                </button>
              ) : (
                l.label
              )}
            </li>
          );
        })}
        {/* On dédoublonne aussi sur le TEXTE : sur la semaine, le repère du
            vendredi porte déjà le nom de l'arrivée sans être à sa position. */}
        {!chart.xLabels.some(
          (l) => Math.abs(l.x - chart.finish.x) < 0.5 || l.label === chart.finish.label,
        ) && (
          <li
            className="palmares-x-arrivee"
            aria-hidden="true"
            style={{ left: `${(chart.finish.x / chart.width) * 100}%` }}
          >
            {chart.finish.label}
          </li>
        )}
      </ul>

    </figure>
  );
}
/**
 * LE DISQUE D'OR — le champion de la vitesse en cours, à droite du palmarès.
 *
 * REMPLACE LE BAC DU JOUR ET LA DISCOTHÈQUE qui vivaient en bas du pupitre :
 * un seul disque, celui qui mène, plutôt qu'un bac entier de cinq pochettes
 * fixes ou une vitrine séparée. Cliquer le disque déplie le PANNEAU
 * (`TropheePanel`) — les CINQ partis, sous le palmarès, chacun avec ses
 * quatre grandeurs ; un second lien mène vers `/discotheque` pour qui veut
 * tout le fonds.
 *
 * ⚠️ TROIS FORMES, PAS UNE. Le nom du trophée change avec la vitesse
 * (`NOM_TROPHEE`) : un SINGLE d'or pour un jour, un ALBUM de platine pour une
 * semaine — sept titres au plus, comme `/discotheque` — un DISQUE de diamant
 * pour toute la campagne. Le palier MONTE avec la vitesse, comme les
 * certifications RIAA réelles, et se voit dans l'encadré (`PALIER_COULEUR`),
 * pas seulement dans le nom. Le classement, lui, vient TOUJOURS de l'écoute :
 * la mesure du palmarès (Écouté/Apprécié) ne change rien ici, le trophée
 * n'existe qu'à l'écoute — un « disque d'or » au ton n'aurait pas de sens.
 *
 * ⚠️ « EN PRODUCTION » TANT QUE LA COURSE N'EST PAS COURUE. Avant que le
 * palmarès n'atteigne sa ligne d'arrivée — 20 h aujourd'hui, vendredi pour la
 * semaine, le scrutin pour la campagne — le classement peut encore changer, et
 * aucune pochette FINALE n'existe pour le couronner. Le disque montre alors
 * qui mène pour l'instant, en texte, plutôt qu'une image qui pourrait se
 * révéler fausse une heure plus tard. Le PANNEAU, lui, reste consultable :
 * c'est une vraie donnée en direct, seule la pochette-trophée attend la fin.
 *
 * ⚠️ LA LÉGENDE NE PORTE QUE LE NOM DU TROPHÉE, UNE SEULE LIGNE, TOUJOURS —
 * depuis le 2026-09-01. Elle portait aussi le nom complet du gagnant et sa
 * durée une fois la course courue, une seconde ligne qui n'apparaissait qu'à
 * ce moment-là : le disque d'or grandissait donc de façon VARIABLE, parfois
 * plus haut que le graphique, et se décalait en changeant de vitesse. Le
 * sigle du gagnant reste lisible SUR le disque lui-même (superposé à l'image,
 * ou en repli) ; le nom complet et la durée survivent dans `aria-label` et
 * `title`, au clic comme au survol, plutôt que dans un texte toujours
 * affiché.
 *
 * ⚠️ L'ÉTAT `ouvert` VIT CHEZ L'APPELANT, PAS ICI — depuis le 2026-09-03.
 * Le panneau qu'un clic déplie se rend en PLEINE LARGEUR, sous toute la
 * rangée du palmarès (`.palmares-rangee`), pas dans la seule colonne étroite
 * de ce disque : il lui faut donc un ancêtre commun avec le graphique et les
 * knobs, que seul `PartisCouvertureClient` a.
 */
function PalmaresTrophee({
  range,
  apprecie,
  termine,
  gagnant,
  sortie,
  ouvert,
  onToggle,
}: {
  range: RangeKey;
  /** Vrai quand le knob Mesure est sur Apprécié : le trophée couronne alors
   *  le ton, pas l'écoute — voir `apprecieTrophee` chez l'appelant. */
  apprecie: boolean;
  termine: boolean;
  gagnant: EntreeTrophee;
  /** « Sortie prévue à 20h » — voir `sortieTrophee` chez l'appelant. */
  sortie: string;
  ouvert: boolean;
  onToggle: () => void;
}) {
  const nomTrophee = NOM_TROPHEE[range];
  const chiffre = chiffreTrophee(gagnant, apprecie);
  const detail = termine
    ? `${nomTrophee} : ${gagnant.nom}, ${chiffre.valeur}.`
    : `${nomTrophee}. ${PRODUCTION_TROPHEE[range]}. ${sortie}. En tête pour l'instant : ${gagnant.nom}, ${chiffre.valeur}.`;
  const invite = ` ${ouvert ? "Refermer" : "Voir"} le classement complet, sous le palmarès.`;

  return (
    <div className="trophee">
      {/* AU-DESSUS DU DISQUE, PAS EN DESSOUS — la flèche seule (« → »)
          qui vivait sous le disque ne disait rien qu'on lise sans deviner.
          Un lien vers une discothèque dont les pochettes sont ENCORE EN
          PRODUCTION (rien n'est couronné avant la fin de la course) se lit
          mieux comme une invite qu'on croise EN PREMIER, avant le disque
          lui-même. */}
      <a
        className="trophee-voir-tout"
        href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/discotheque/`}
        aria-label={"Toute la discoth\u00e8que, pochettes en production"}
        title={"Toute la discoth\u00e8que, pochettes en production"}
      >
        Toute la discothèque
      </a>

      <button
        type="button"
        className="trophee-disque"
        style={{ ["--palier" as string]: PALIER_COULEUR[range] }}
        onClick={onToggle}
        aria-expanded={ouvert}
        aria-controls="trophee-panel"
        aria-label={detail + invite}
        title={detail + invite}
      >
        <TropheeCouverture entree={gagnant} termine={termine} range={range} sortie={sortie} />
      </button>
    </div>
  );
}

/**
 * L'ILLUSTRATION D'UNE ENTRÉE DU TROPHÉE — le disque lui-même ou une carte du
 * panneau déplié, au même gabarit. Trois états, dans l'ordre où ils
 * s'excluent :
 * 1. « En production » — la course n'est pas courue, `termine` est faux :
 *    aucune image ne peut couronner un classement encore mobile. C'est
 *    l'état le PLUS SOUVENT VU de toute cette page — la plupart des
 *    consultations tombent en cours de journée, de semaine ou de campagne,
 *    jamais pile à l'arrivée — d'où l'ÉTIQUETTE DE DISQUE VIERGE plutôt qu'un
 *    simple hachurage : un aplat qui attend son impression mérite un vrai
 *    dessin, pas un motif de chargement.
 * 2. La VRAIE pochette engendrée, quand la course est courue ET qu'une image
 *    a été confirmée.
 * 3. Le REPLI géométrique — course courue, mais sans image confirmée : le
 *    sigle en texte sur l'aplat du parti, comme partout ailleurs sur le site
 *    plutôt que d'inventer une pochette.
 */
function TropheeCouverture({
  entree,
  termine,
  range,
  sortie,
}: {
  entree: EntreeTrophee;
  termine: boolean;
  range: RangeKey;
  sortie: string;
}) {
  if (!termine) {
    // LE TITRE EN HAUT, LA DATE EN BAS — depuis le 2026-09-01 (« met single
    // en production en haut et laisse sortie prévue en bas »). Les deux
    // essais précédents empilaient tout d'UN SEUL côté du disque (groupe
    // centré, puis bloc collé en bas) : sur le disque compact du palmarès,
    // qui portait aussi le meneur (« En tête : X », retiré ici — le panneau
    // ne le répétait déjà pas, son rang est son propre badge), le bloc du
    // bas devenait trop grand pour la place restée sous le disque centré, et
    // touchait au cercle. Répartir titre et date sur les DEUX bords opposés
    // de la carte règle ça sans rien retirer de plus : chacun a toute la
    // largeur de la carte pour lui, et le disque, seul élément dans le flux,
    // se centre dans ce qui reste entre les deux — toujours par
    // `position: absolute` sur le titre et la date, jamais en concurrence
    // avec le disque pour la même moitié de boîte.
    return (
      <span className="trophee-etiquette">
        <b className="trophee-etiquette-titre">{PRODUCTION_TROPHEE[range]}</b>
        <span className="trophee-etiquette-disque" style={{ ["--party" as string]: entree.couleur }}>
          <b className="trophee-etiquette-sigle">{entree.sigle}</b>
        </span>
        <span className="trophee-etiquette-mention">{sortie}</span>
      </span>
    );
  }
  if (entree.src) {
    return (
      <span className="pochette-art">
        <picture>
          {(entree.sources ?? []).map((f) => (
            <source key={f.type} srcSet={f.src} type={f.type} />
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pochette-image" src={entree.src} alt="" aria-hidden="true" />
        </picture>
        <b className="pochette-sigle">{entree.sigle}</b>
      </span>
    );
  }
  // La course est courue mais aucune image n'a été confirmée : le sigle en
  // texte sur son aplat de couleur, comme partout ailleurs sur le site quand
  // une pochette manque plutôt que d'en inventer une.
  return (
    <span className="trophee-repli" style={{ ["--party" as string]: entree.couleur }}>
      <b>{entree.sigle}</b>
    </span>
  );
}

/** LE CHIFFRE QU'ON MET EN AVANT — la même bascule que le palmarès juste à
 *  côté (`Palmares`, `ecriteDe`) : le temps en Une quand le trophée couronne
 *  l'écoute, l'écart de ton quand il couronne l'appréciation. Un seul point
 *  de vérité pour ce choix, appelé partout où le chiffre du trophée s'écrit —
 *  l'étiquette du disque, le panneau, chaque carte. */
function chiffreTrophee(entree: EntreeTrophee, apprecie: boolean): { label: string; valeur: string } {
  return apprecie
    ? { label: "Écart de ton", valeur: formatEcartTon(entree.ecart) }
    : { label: "Temps en Une", valeur: formatDuree(entree.minutes) };
}

/**
 * LES QUATRE GRANDEURS D'UNE ENTRÉE — temps (ou écart de ton), part, enjeu,
 * ton — en tracklist (`LigneTracklist`/`LigneTracklistTon`, partagées avec
 * `/discotheque` — voir `components/interactive/Tracklist.tsx`). N'a plus
 * qu'un seul appelant depuis le 2026-09-01, `CarteTrophee` (l'endos d'une
 * carte du panneau du disque d'or) — le clic sur un deck n'ouvre plus de
 * pochette ici, il mène vers `/discotheque` (voir `Deck`).
 */
function TracklisteGrandeurs({
  temps,
  partPct,
  enjeu,
  tonMot,
  tonPct,
  tonTitle,
  enjeuTitle,
  labelTemps = "Temps en Une",
  labelEnjeu = "Enjeu",
  labelTon = "Ton",
}: {
  temps: string;
  partPct: number;
  enjeu: string;
  /** Infobulle de la rangée « Enjeu » — sert à dater l'enjeu quand il ne vient
   *  pas de la journée affichée. Absente le reste du temps. */
  enjeuTitle?: string;
  tonMot: string;
  tonPct: number;
  tonTitle?: string;
  /** « Écart de ton » depuis `CarteTrophee` en mode Apprécié — la première
   *  ligne montre alors la MÊME grandeur que le classement du trophée, pas
   *  une durée qui n'a plus rien à voir avec l'ordre affiché. */
  labelTemps?: string;
  /** Libellés plus longs, réservés à d'éventuels usages sur un seul volet
   *  (« Enjeu du parti », « Ton de la couverture ») — cinq cartes de front,
   *  comme dans le panneau du disque d'or, n'ont pas la place de le dire en
   *  entier. */
  labelEnjeu?: string;
  labelTon?: string;
}) {
  return (
    <>
      <LigneTracklist categorie={labelTemps} chiffre>{temps}</LigneTracklist>
      <LigneTracklist categorie="Part de temps">{partPct}&nbsp;%</LigneTracklist>
      <LigneTracklist categorie={labelEnjeu} title={enjeuTitle}>{enjeu}</LigneTracklist>
      <LigneTracklistTon categorie={labelTon} tonMot={tonMot} tonPct={tonPct} tonTitle={tonTitle} />
    </>
  );
}

/**
 * LE PANNEAU DU DISQUE D'OR, sous le palmarès — les CINQ partis, chacun avec
 * sa pochette, qui se retourne au clic pour montrer son endos (voir
 * `CarteTrophee`). Remplace le classement compact du
 * 2026-09-01 (quatre miniatures dans la seule colonne du disque) : cinq
 * cartes lisibles, en pleine largeur, disent plus et se lisent mieux — et un
 * disque « en production » n'a de toute façon pas de meneur à distinguer du
 * reste, les cinq sont à égalité, en cours de mesure.
 */
function TropheePanel({
  range,
  apprecie,
  termine,
  entrees,
  sortie,
  onFermer,
}: {
  range: RangeKey;
  apprecie: boolean;
  termine: boolean;
  entrees: EntreeTrophee[];
  sortie: string;
  onFermer: () => void;
}) {
  return (
    <div id="trophee-panel" className="trophee-panel" aria-label={`${NOM_TROPHEE[range]} : le classement complet`}>
      <div className="trophee-panel-tete">
        <p className="trophee-panel-titre">
          {NOM_TROPHEE[range]}
          <span>, le classement complet</span>
        </p>
        <button type="button" className="trophee-panel-fermer" onClick={onFermer}>
          Refermer
        </button>
      </div>

      <ol className="trophee-panel-grille">
        {entrees.map((e) => (
          <CarteTrophee
            key={e.cle}
            entree={e}
            apprecie={apprecie}
            termine={termine}
            range={range}
            sortie={sortie}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * UNE CARTE DU PANNEAU — fermée par défaut, comme une plaque de
 * `/discotheque` (`CartePlaque`) : on regarde une pochette avant de la
 * retourner. Cliquer LE DISQUE le fait PIVOTER — un vrai flip 3D
 * (`.flip-carte`, partagé avec `/discotheque`) — pour montrer son endos, les
 * quatre grandeurs, à la place de la pochette plutôt qu'en dessous d'elle :
 * « les informations sont derrière la pochette », pas sous elle. Chaque
 * carte garde son propre état : retourner celle du PLQ ne referme pas celle
 * de la CAQ.
 *
 * ⚠️ LES DEUX FACES SONT TOUJOURS DANS LE DOM, contrairement à l'ancien
 * dépliant (retiré le 2026-09-06) qui ne montait l'endos qu'à l'ouverture.
 * Un flip anime les DEUX faces en même temps ; en démonter une romprait
 * l'animation. Sans coût réel ici : l'endos n'est que du texte, pas des
 * images à charger.
 */
function CarteTrophee({
  entree,
  apprecie,
  termine,
  range,
  sortie,
}: {
  entree: EntreeTrophee;
  apprecie: boolean;
  termine: boolean;
  range: RangeKey;
  sortie: string;
}) {
  const [ouverte, setOuverte] = useState(false);
  const chiffre = chiffreTrophee(entree, apprecie);

  return (
    <li style={{ ["--party" as string]: entree.couleur }}>
      <button
        type="button"
        className="trophee-panel-declencheur"
        onClick={() => setOuverte((v) => !v)}
        aria-expanded={ouverte}
        aria-label={`${entree.nom}. ${ouverte ? "Refermer" : "Voir"} le détail au dos de la pochette.`}
      >
        <span className="trophee-panel-art">
          <span className={`flip-carte${ouverte ? " retournee" : ""}`}>
            <span className="flip-face flip-face--recto">
              <TropheeCouverture entree={entree} termine={termine} range={range} sortie={sortie} />
            </span>
            <span className="flip-face flip-face--verso">
              <dl className="trophee-panel-chiffres">
                <TracklisteGrandeurs
                  temps={chiffre.valeur}
                  labelTemps={chiffre.label}
                  partPct={entree.partPct}
                  enjeu={entree.enjeu}
                  enjeuTitle={entree.enjeuTitle}
                  tonMot={entree.tonMot}
                  tonPct={entree.tonPct}
                  tonTitle={entree.tonTitle}
                />
              </dl>
            </span>
          </span>
        </span>
        {/* Le NOM du parti ne s'écrit plus ici depuis le 2026-09-07 : le
            sigle est déjà gravé sur la pochette elle-même
            (`.pochette-sigle`/`.trophee-etiquette-sigle`), et le nom complet
            reste accessible — `aria-label` du bouton, ci-dessus — sans qu'il
            faille le répéter à l'écran pour tout le monde. Le RANG, lui, a
            quitté la carte le 2026-09-01 : `<ol>` porte déjà l'ordre, et un
            chiffre en plus sous cinq pochettes déjà numérotées par leur
            position ajoutait un badge de plus à lire, sans rien dire que la
            grille ne dise déjà. */}
      </button>
    </li>
  );
}
