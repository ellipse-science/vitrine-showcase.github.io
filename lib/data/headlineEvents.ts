// Build-time loader for Une des unes, Deux solitudes, and Treemap sections.
//
// Reads /public/data/headline-events.json, deduplicates by event_id
// (preferring QC target_region), filters US-only events, and pre-computes
// every value the UI needs.

import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import { editionLabel } from "@/lib/editions";
import {
  formatDateFr,
  lastUpdatedLabel,
  publicationDateFromInterval,
  publicationHourFromInterval,
} from "@/lib/dates";
import {
  SALIENCE_CUTOVER,
  NEW_INDEX_SCALE,
  NEW_SUM_QC_THRESHOLDS,
  NEW_BLOCK_QC_THRESHOLDS,
  NEW_SUM_ROC_THRESHOLDS,
  NEW_BLOCK_ROC_THRESHOLDS,
  scaleThresholds,
} from "@/lib/data/salienceCutover";

// VITRINE_DATA_PATH : échappatoire réservée au BANC DE VALIDATION (#430). Elle
// permet de servir un instantané recomposé — par exemple avec les valeurs de la
// spec v1 recalculées depuis le JSON `articles` — sans jamais toucher à
// public/data/, qui est écrasé par fetch_data.R. Absente en production.
const DATA_PATH = process.env.VITRINE_DATA_PATH ?? path.resolve(
  process.cwd(),
  "public",
  "data",
  "headline-events.json",
);

// ── Raw JSON shape ──────────────────────────────────────────────────────────

export type RawEvent = {
  country_id: string | null;
  date_utc: string;
  time_interval_utc: string;
  date_montreal_tz: string | null;
  time_interval_montreal_tz: string | null;
  event_id: string;
  event_label: string | null;
  representative_url: string | null;
  representative_media_id: string | null;
  score_saillance: number | null;
  score_qc: number | null;
  extracted_objects: string | null;
  media_ids: string;
  outlets_qc: number | null;
  total_outlets_qc: number | null;
  intensity_tier: string | null;
  title: string | null;
  text?: string | null;
  main_issue: string | null;
  main_issue_text_fr: string | null;
  target_region: string | null;
  interval_convergence_score: number | null;
  top_objects_divergence: string | null;
  articles: string | null;
  // Deux solitudes — breakdown régional par événement (radar). Optionnels :
  // score_saillance = score_qc + score_roc + score_us (vérifié empiriquement,
  // cf. #143) — ne jamais dériver le ROC par soustraction, sinon le côté
  // Canada absorbe les USA. Publiés par le refiner #211, avec coverage_* et
  // media_ids_qc/roc ; lus directement depuis le #272 (plus de repli).
  score_roc?: number | null;
  score_us?: number | null;
  coverage_qc_in_can?: number | null;
  coverage_can_in_qc?: number | null;
  media_ids_qc?: string | null;
  media_ids_roc?: string | null;
  // Agrégats 24h par storyline (aws-refiners#195 phase B, PR #199) — optionnels :
  // absents des lignes publiées avant le 2026-07-10 (Athena renvoie null).
  storyline_id?: string | null;
  media_ids_24h?: string | null;
  articles_24h?: string | null;
  score_qc_peak_24h?: number | null;
  first_seen_utc?: string | null;
  n_blocks_24h?: number | null;
  // Indice de saillance spec v1 (aws-refiners#287, tag `spec-v1`), publié en
  // shadow par le raffineur et lu SEULEMENT quand SALIENCE_CUTOVER est vrai.
  // Optionnels : absents des lignes publiées avant le 2026-07-14 (Athena rend
  // null), et absents du snapshot tant que tables.json ne les projette pas.
  // Unité de stockage : [0,1] — le ×100 d'affichage est appliqué par qcScore/
  // rocScore, jamais ici (cf. lib/data/salienceCutover.ts).
  salience_index_qc?: number | null;
  salience_index_roc?: number | null;
};

// Pré-filtre COMMUN à tous les consommateurs du snapshot : une seule ligne par
// événement (on garde la variante `target_region = "QC"` quand elle existe),
// puis on écarte les événements purement américains.
//
// Exporté parce que `scripts/select_hero.ts` s'en sert pour désigner la Une n°1
// à `generate_art.py` : l'illustration DOIT représenter la même histoire que le
// hero, et la seule façon de le garantir est que les deux passent par ce code-ci
// (issue #259). Cette fonction était recopiée trois fois dans ce fichier et une
// quatrième en Python — c'est cette duplication qui a laissé les sélecteurs
// diverger.
export function uniqueQcEvents(all: RawEvent[]): RawEvent[] {
  const byId = new Map<string, RawEvent>();
  for (const e of all) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") byId.set(e.event_id, e);
  }
  return Array.from(byId.values()).filter((e) => e.country_id !== "USA");
}

type ExtractedObject = { object: string; score: number };

const ISSUE_COLORS: Record<string, string> = {
  economy_and_labour: "#94781B",
  governments_and_governance: "#234E78",
  health_and_social_services: "#852244",
  environment_and_energy: "#3D6B3A",
  rights_liberties_minorities_discrimination: "#553278",
  culture_and_nationalism: "#384873",
  education: "#752373",
  international_affairs_and_defense: "#1F5E66",
  law_and_crime: "#993322",
  public_lands_and_agriculture: "#5E731F",
  immigration: "#9E541B",
  technology: "#997018",
};

const ISSUE_LABELS_SHORT: Record<string, string> = {
  economy_and_labour: "Économie et travail",
  governments_and_governance: "Gouvernements et gouvernance",
  health_and_social_services: "Santé et politiques sociales",
  environment_and_energy: "Environnement et énergie",
  rights_liberties_minorities_discrimination: "Droits, libertés, minorités et discrimination",
  culture_and_nationalism: "Culture et nationalisme",
  education: "Éducation",
  international_affairs_and_defense: "Affaires internationales et défense",
  law_and_crime: "Loi et crime",
  public_lands_and_agriculture: "Terres publiques et agriculture",
  immigration: "Immigration",
  technology: "Technologie",
};

const MEDIA_NAMES: Record<string, string> = {
  LED: "Le Devoir",
  LAP: "La Presse",
  RCI: "Radio-Canada",
  TVA: "TVA Nouvelles",
  JDM: "Journal de Montréal",
  MG: "Montreal Gazette",
  CBC: "CBC",
  CTV: "CTV News",
  GN: "Global News",
  TTS: "Toronto Star",
  GAM: "The Globe and Mail",
  NP: "National Post",
  VS: "Vancouver Sun",
  // Médias américains — rencontrés sur les lignes `target_region = US`, qui ne
  // servent qu'à la résonance (#230). La table reste un confort d'affichage :
  // un sigle inconnu retombe sur lui-même (`MEDIA_NAMES[id] ?? id`).
  CNN: "CNN",
  FXN: "Fox News",
};

// Sigle court affiché dans le badge carré du radar (Deux solitudes).
const MEDIA_BADGE: Record<string, string> = {
  LED: "LD", LAP: "LP", RCI: "RC", TVA: "TVA", JDM: "JdM", MG: "MG",
  CBC: "CBC", CTV: "CTV", GN: "GN", TTS: "TS", GAM: "GM", NP: "NP", VS: "VS",
};

const QC_MEDIA = ["LED", "LAP", "RCI", "TVA", "JDM", "MG"];
// Médias canadiens-anglais suivis par le pipeline. Sert à l'ORDRE d'affichage
// de la résonance canadienne (#230) ; un sigle hors liste est affiché à la
// suite plutôt qu'écarté — on ne perd jamais un média inconnu.
const CAN_MEDIA = ["CBC", "CTV", "GN", "TTS", "GAM", "NP", "VS"];
// Roster canadien complet = QC + ROC. Sur une ligne `target_region = US`, la
// liste d'articles mêle les deux pays : le sujet est américain, mais des médias
// d'ici l'ont parfois repris. On identifie donc les médias AMÉRICAINS par
// complément de ce roster — jamais par une liste blanche de sigles US, qui
// laisserait tomber en silence tout média américain pas encore rencontré.
// (Le sens de la soustraction compte : le bug #272 devinait le côté CANADIEN
// en retranchant une liste US codée en dur, et classait « canadien » n'importe
// quel média américain absent de cette liste. Ici, l'inconnu part du côté
// américain — celui de la ligne qu'on est en train de lire.)
const CANADIAN_MEDIA = new Set([...QC_MEDIA, ...CAN_MEDIA]);
// ── Deux solitudes — calibration de la JAUGE de convergence (échelle relative) ─
// L'axe du radar utilise une part d'attention 24 h (voir buildSolitudes), pas de
// calibration. Seule la jauge « plus/moins que d'habitude » a besoin d'une
// distribution : CAL_CONV mappe l'indice de convergence (0-100) vers son
// percentile.
//
// CAL_CONV est le REPLI seulement : la jauge se cale sur `metrics.convergence`
// de la calibration glissante publiée (salience_calibration.json), présente et
// peuplée depuis le 2026-07-27 (n = 399 sur 365 jours). Voir calConvFrom.
//
// Recalibré au #272 sur cette distribution publiée, en appliquant la même règle
// d'ancrage que calConvFrom (p5 = p20 = 0 → écrasés dans l'ancre de départ) :
// p50 = 6, p80 = 37, p95 = 69,1. L'ancien prototype (bandes 13 mois du red-team,
// médiane 14) plaçait la médiane à 14 — plus du double de la vraie, ce qui
// faisait lire « plus convergent que d'habitude » à des blocs parfaitement
// ordinaires quand le fichier manquait. Suivi refiner = aws-refiners#212.
const CAL_CONV: [number, number][] = [[0, 0], [6, 50], [37, 80], [69.1, 95], [100, 100]];

// Repère « habituel » de la jauge = convergence EVENT-level MÉDIANE (là où se
// place le marqueur en temps normal). ATTENTION : c'est la médiane du score au
// niveau HISTOIRE (windowEventConvergence), PAS la métrique `convergence` de la
// calibration glissante, qui reste l'ancienne convergence OBJET (interval_convergence_score,
// médiane ≈ 3 %). Mesuré le 2026-07-15 en rejouant le VRAI code du loader
// (dédup par event_id avec préférence QC + filtre country_id≠USA, puis
// storiesFrom24h + windowEventConvergence) sur chaque fenêtre glissante 24 h de
// l'historique DEV (headline_events_4h, 2026-05-14 → 2026-07-15, 323 fenêtres) :
// p50 = 31 % (p20=16, p80=42).
//
// CONFIRMÉ au #272 : `metrics.event_convergence` est désormais publiée
// (n = 394 sur 365 jours) et son p50 vaut **31** — exactement la constante
// mesurée à la main. Le loader préfère la valeur publiée ; celle-ci n'est plus
// qu'un repli, et on sait maintenant qu'il est juste.
//
// Le « 41 % au lieu de 31 » qui était noté ici appartenait au repli
// `saillance − qc` retiré au #272, lequel réabsorbait les USA du côté canadien.
const HABITUAL_EVENT_CONV = 31;
// Bandes du score RELATIF (#258, demande Yannick « plus/moins que d'habitude,
// et de combien ») : au-delà de p80 (ou sous p20) de la même distribution de
// 323 fenêtres 24 h, l'écart n'est plus « un peu » mais « nettement ». Repli
// codé ; la calibration publiée (event_convergence.p20/p80) prime quand
// présente et monotone.
const HABITUAL_EVENT_CONV_P20 = 16;
const HABITUAL_EVENT_CONV_P80 = 42;

function pctile(v: number, cal: [number, number][]): number {
  if (!(v > 0)) return 0;
  for (let i = 1; i < cal.length; i++) {
    if (v <= cal[i][0]) {
      const [x0, y0] = cal[i - 1], [x1, y1] = cal[i];
      return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 100;
}

// ── Calibration glissante publiée (suivi aws-refiners#212) ────────────────────────────────
// scripts/fetch_data.R publie public/data/salience_calibration.json à chaque
// refresh : percentiles de score_qc / score_roc / interval_convergence_score sur
// une fenêtre glissante (≈ 12 mois). Quand il est présent, on en dérive les
// seuils de saillance (Module 1) et la calibration de la jauge (Module 2) — sinon
// on retombe silencieusement sur les valeurs codées ci-dessous. Donne enfin un
// « plus/moins que d'habitude » ancré sur une vraie distribution (demande Yannick).
type CalMetric = { region?: string | null; n?: number; p5: number; p20: number; p50: number; p80: number; p95: number };
// `convergence` = convergence OBJET (interval_convergence_score) — calibre la
// table de percentiles CAL_CONV. `event_convergence` = convergence au niveau
// HISTOIRE (windowEventConvergence) — publiée depuis le 2026-07-27 ; son p50
// prime sur HABITUAL_EVENT_CONV pour le repère « habituel ».
// Les clés `salience_index_*` sont les homologues des `score_*` pour le NOUVEL
// indice (cf. build_salience_calibration dans scripts/fetch_data.R). Elles sont
// publiées sur une fenêtre plancherée au déploiement de la spec v1, donc
// homogènes par construction — mais restent NULL tant que n < CAL_MIN_N, d'où
// les grilles de repli de lib/data/salienceCutover.ts. En unités BRUTES [0,1] :
// c'est `scaleThresholds` qui les passe à l'échelle d'affichage.
type Calibration = { window_days?: number; computed_utc?: string; metrics?: { score_qc?: CalMetric; score_qc_peak_24h?: CalMetric; score_qc_sum_24h?: CalMetric; score_roc?: CalMetric; score_roc_sum_24h?: CalMetric; convergence?: CalMetric; event_convergence?: CalMetric; salience_index_qc?: CalMetric; salience_index_qc_sum_24h?: CalMetric; salience_index_roc?: CalMetric; salience_index_roc_sum_24h?: CalMetric } };

const CALIBRATION_PATH = path.resolve(process.cwd(), "public", "data", "salience_calibration.json");

const loadCalibration = cache(async (): Promise<Calibration | null> => {
  try {
    return JSON.parse(await fs.readFile(CALIBRATION_PATH, "utf8")) as Calibration;
  } catch {
    return null; // fichier absent (pas encore publié) → repli sur les seuils codés
  }
});

// Seuils de saillance depuis les percentiles publiés (p5→faible … p95→extreme).
// null si la métrique manque ou n'est pas monotone croissante (repli).
function salThresholdsFrom(m: CalMetric | undefined): typeof SAL_QC_THRESHOLDS | null {
  if (!m) return null;
  const vals = [m.p5, m.p20, m.p50, m.p80, m.p95];
  if (!vals.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  for (let i = 1; i < vals.length; i++) if (!(vals[i] >= vals[i - 1])) return null;
  return { faible: m.p5, moyenne: m.p20, eleve: m.p50, tresEleve: m.p80, extreme: m.p95 };
}

// Table de calibration de la jauge depuis les percentiles de convergence.
// Construit des ancres (valeur → percentile) STRICTEMENT croissantes : le bas de
// la distribution est souvent dégénéré (beaucoup de blocs à 0 → p5=p20=0), on
// écrase alors ces ex æquo dans l'ancre de départ [0,0]. null si trop plat.
function calConvFrom(m: CalMetric | undefined): [number, number][] | null {
  if (!m) return null;
  const pts: [number, number][] = [[m.p5, 5], [m.p20, 20], [m.p50, 50], [m.p80, 80], [m.p95, 95]];
  const anchors: [number, number][] = [[0, 0]];
  for (const [x, y] of pts) {
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    const cx = Math.max(0, Math.min(100, x));
    const last = anchors[anchors.length - 1];
    // cx < 100 : un percentile qui plafonne à 100 (ex. p95 = 100) ne doit pas
    // occuper l'ancre terminale, sinon pctile(100) rendrait 95 au lieu de 100.
    if (cx > last[0] && cx < 100 && y > last[1]) anchors.push([cx, y]);
  }
  anchors.push([100, 100]); // ancre terminale systématique : l'échelle atteint p100
  return anchors.length >= 3 ? anchors : null; // besoin d'≥ 1 point interne
}

// Saillance ROC (Canada hors Québec, sans les USA) : lue directement dans la
// colonne publiée (aws-refiners#211). Le repli par soustraction
// `saillance − qc − us` a été retiré au #272 — il était devenu inerte
// (score_roc non nul sur 184/184 lignes le 2026-07-27) et il faisait absorber
// les USA du côté canadien quand score_us manquait.
function rocScore(e: RawEvent, cutover: boolean = SALIENCE_CUTOVER): number {
  return cutover ? (e.salience_index_roc ?? 0) * NEW_INDEX_SCALE : (e.score_roc ?? 0);
}

// LE point de bascule du cutover, côté québécois — et le SEUL endroit du loader
// qui décide quelle colonne est « la saillance d'un bloc ». Tout le reste
// (cumuls pondérés, sommets, classement, badge, parts d'attention, trajectoire,
// radar) se sert de cette valeur sans savoir d'où elle vient, si bien que la
// bascule ne peut pas laisser un module derrière.
//
// Le ×100 est appliqué ICI, à la lecture, pas à l'affichage : voir la note
// d'échelle dans lib/data/salienceCutover.ts.
function qcScore(e: RawEvent, cutover: boolean = SALIENCE_CUTOVER): number {
  return cutover ? (e.salience_index_qc ?? 0) * NEW_INDEX_SCALE : (e.score_qc ?? 0);
}

// Positions [GAUCHE, DROITE] des symboles sur l'axe : collés au centre
// quand ça converge, aux extrémités quand ça diverge. gap min 18 % pour ne
// pas les superposer.
function symbolPositions(convPct: number): [number, number] {
  const div = 100 - convPct;
  const gap = 18 + 72 * Math.pow(div / 100, 1.4);
  return [50 - gap / 2, 50 + gap / 2];
}

// 4 niveaux symétriques sur la convergence (seuils 25/50/75). Le mot et la
// couleur pilotent le grand chiffre. Cf. red-team + design de la maquette.
function convMode(convPct: number): { word: string; cls: string } {
  if (convPct < 25) return { word: "Divergence", cls: "mode-div" };
  if (convPct < 50) return { word: "Divergence partielle", cls: "mode-divp" };
  if (convPct < 75) return { word: "Convergence partielle", cls: "mode-convp" };
  return { word: "Convergence", cls: "mode-con" };
}

// Score RELATIF en hero (#258, demande Yannick « plus/moins divergent que
// d'habitude, et de combien ») : le grand chiffre devient l'écart entre la
// convergence du moment et l'habituel. Écart affiché en « % » (décision
// Adrien 2026-08-01 : « points de pourcentage » ne parle pas au grand
// public). « nettement » quand le marqueur sort de la bande p20-p80 de la
// distribution historique, « un peu » sinon.
function relScore(convPct: number, hab: number, p20: number, p80: number): {
  relDiffPct: number; relLabel: string; relCls: string; relInfo: string;
} {
  const diff = convPct - hab;
  const conv = diff > 0;
  const strong = conv ? convPct >= p80 : convPct <= p20;
  const intensity = strong ? "nettement" : "un peu";
  // Le libellé à l'écran reste sobre (direction seulement) ; l'intensité
  // (« un peu / nettement ») vit dans la bulle ⓘ (décision Adrien 2026-08-01).
  const relLabel = Math.abs(diff) < 1
    ? "aussi convergent que d'habitude"
    : `plus ${conv ? "convergent" : "divergent"} que d'habitude`;
  // Couleur du grand chiffre = direction de l'écart (bleu convergent / rouge
  // divergent), nuancée par l'intensité. À écart nul : la teinte douce du camp
  // divergent, où « habituel » réside (la divergence est la norme).
  const relCls = Math.abs(diff) < 1
    ? "mode-divp"
    : conv ? (strong ? "mode-con" : "mode-convp") : (strong ? "mode-div" : "mode-divp");
  const qual = Math.abs(diff) < 1 ? "autant" : `${intensity} ${conv ? "plus" : "moins"}`;
  const relInfo =
    `Règle générale, les médias du Québec et du Canada consacrent ${hab} % de leur attention ` +
    `aux mêmes histoires. En ce moment : ${convPct} %, ${qual} que d'habitude.`;
  return { relDiffPct: Math.abs(diff), relLabel, relCls, relInfo };
}

// Phrase éditoriale : GABARITS FINIS choisis par règles (aucun LLM en prod),
// conformes au skill redaction-editoriale (mêmes « sujets », pas de tiret
// cadratin, formulation honnête). `shared` = nb de sujets du radar couverts
// des deux côtés.
function solitudesEdito(convPct: number, shared: number): string {
  if (convPct < 25) {
    return shared === 0
      ? "Aucun sujet ne figure à la fois parmi les Unes québécoises et canadiennes des 24 dernières heures. Deux conversations parallèles."
      : "Sur les 24 dernières heures, les médias québécois et canadiens ont mis l'accent sur des sujets presque entièrement différents.";
  }
  if (convPct < 50) {
    return "Quelques grandes histoires traversent la frontière ; le reste des deux agendas se croise à peine.";
  }
  if (convPct < 75) {
    return "Une bonne partie de l'actualité est suivie des deux côtés, chacun avec ses propres mots.";
  }
  return "Fait rare : les deux espaces médiatiques mettent de l'avant surtout les mêmes sujets.";
}

// Clé de bloc triable (date + heure de début du créneau 4h).
function blockKey(e: RawEvent): string {
  const start = (e.time_interval_utc ?? "").split("-")[0].padStart(2, "0");
  return `${e.date_utc}T${start}`;
}

// Signature de titre pour la dédup cross-langue (stopgap aws-refiners#213) :
// tokens significatifs (sans accents, stopwords FR/EN, mots courts).
const TITLE_STOP = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "et", "ou", "en",
  "sur", "pour", "dans", "par", "avec", "sans", "sous", "vers", "chez", "que", "qui",
  "the", "and", "for", "with", "from", "that", "this", "into", "over", "after",
]);
function titleTokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !TITLE_STOP.has(w)),
  );
}
// Deux titres décrivent la même histoire s'ils partagent AU MOINS 3 tokens
// significatifs ET un Jaccard ≥ 0,4. Le minimum de 3 évite de fusionner deux
// sujets sans rapport qui partageraient un seul mot commun.
function sameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 3 || b.size < 3) return false;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (inter < 3) return false;
  return inter / (a.size + b.size - inter) >= 0.4;
}

// Construit tout l'état du module « Deux solitudes » (radar + jauge + édito).
// `latest` = événements du bloc courant (pour l'indice de convergence) ;
// `allEvents` = tous les blocs publiés (3 jours), pour agréger la part
// d'attention sur la fenêtre glissante de 24 h.
// Une histoire agrégée sur la fenêtre glissante de 24 h (6 blocs de 4 h les
// plus récents). SOURCE COMMUNE aux deux modules : la Une des Unes (top QC) et
// Deux solitudes (top QC + top CAN) sélectionnent depuis la MÊME liste → ils
// montrent les mêmes histoires.
type Story = {
  rep: RawEvent;           // occurrence du bloc le plus récent (titre, médias, articles frais)
  repKey: string;
  label: string;
  // Σ de l'indice de bloc (qcScore : `score_qc`, ou `salience_index_qc` ×100
  // après le cutover) pondérée par récence (demi-vie HALF_LIFE_H) — CLASSEMENT.
  sumQc: number;
  sumRoc: number;
  peakQc: number;          // max de l'indice de bloc, BRUT, sur la fenêtre
  peakRoc: number;         // (même échelle que l'indice de bloc → seuils cohérents)
  qcMedia: Set<string>;
  canMedia: Set<string>;
  urlByMedia: Record<string, string>;
  tok: Set<string>;
  // Score QC BRUT (non pondéré) par bloc 4 h de la fenêtre — sert à la
  // trajectoire de saillance (#274). max par bloc, comme peakQc mais conservé
  // bloc par bloc. Rempli pendant l'agrégation, sérialisé en `series` à la fin.
  byBlock: Map<string, number>;
  /** 6 blocs de la fenêtre, du plus ANCIEN au plus récent ; qc = 0 si la
   *  storyline était absente de ce bloc. `present` distingue « pas à la Une »
   *  (absente) d'une faible saillance réelle. Alimente la sparkline + le survol.
   *  `share` = PART d'attention QC de l'histoire dans ce bloc, en % (qc de
   *  l'histoire / qc total du bloc × 100), donc dans [0, 100] et 0 quand le bloc
   *  n'a aucune saillance QC. Sert à chiffrer la tendance (#304) — le `qc` brut,
   *  lui, reste la base de la courbe et du niveau au survol. */
  series: { blockUtc: string; qc: number; present: boolean; share: number; cumul: number }[];
};

function parseIdList(json: string | null | undefined): string[] {
  try {
    const p = JSON.parse(json ?? "[]");
    return Array.isArray(p) ? (p as string[]) : [];
  } catch { return []; }
}

// Pondération de récence du CLASSEMENT (vitrine #274, arbitrage d'Adrien sur le
// banc d'essai #282 du 2026-07-20) : à l'intérieur de la fenêtre 24 h, le poids
// d'un bloc décroît exponentiellement avec son âge — demi-vie de 10 h, donc une
// Une d'il y a 10 h pèse moitié moins qu'une Une en cours. Ne touche QUE les
// sommes (sumQc/sumRoc → classement, parts d'attention, convergence) ; le pic
// (peakQc → pastille) reste BRUT : l'étiquette décrit ce que l'histoire a été à
// son sommet sur 24 h, le rang décrit ce qui domine l'attention maintenant.
// Chiffres du banc (juin 2026) : âge moyen du pic du n°1 10,1 h → 5,5 h, churn
// 37 % (cible < 35-40 %), convergence Deux solitudes quasi inchangée (Δp50 ≤ 1).
const HALF_LIFE_H = 10;
const blockStartMs = (bk: string) => Date.parse(`${bk}:00:00Z`);

function storiesFrom24h(allEvents: RawEvent[], cutover: boolean = SALIENCE_CUTOVER): Story[] {
  type RawArticle = { media_id: string; url: string };
  const blocks = Array.from(new Set(allEvents.map(blockKey))).sort().reverse();
  const window24h = new Set(blocks.slice(0, 6));
  // Référence de la décroissance = bloc le plus récent de la fenêtre (âge 0).
  const newestMs = blocks.length ? blockStartMs(blocks[0]) : 0;
  // Blocs récents d'abord : l'ordre du JSON n'est pas garanti, et le « premier
  // URL conservé » par média (ci-dessous) doit venir du bloc le plus frais.
  const windowEvents = allEvents
    .filter((e) => window24h.has(blockKey(e)))
    .sort((a, b) => (blockKey(a) < blockKey(b) ? 1 : blockKey(a) > blockKey(b) ? -1 : 0));

  const byStory = new Map<string, Story>();
  for (const e of windowEvents) {
    if (!e.title) continue;
    const key = e.storyline_id ?? e.event_label ?? e.event_id;
    const bk = blockKey(e);
    // Poids de récence : 1 pour le bloc le plus frais, ~0,5 à 10 h d'âge, etc.
    const w = Math.pow(2, (blockStartMs(bk) - newestMs) / 3.6e6 / HALF_LIFE_H);
    const qc = qcScore(e, cutover);
    const roc = rocScore(e, cutover);
    // Listes de médias par région, publiées par le refiner (#211). Le repli qui
    // re-triait `media_ids` à la main a été retiré au #272 : il devinait le côté
    // canadien par soustraction d'une liste de médias US codée en dur, ce qui
    // classait « canadien » tout média américain absent de cette liste.
    const qcIds = parseIdList(e.media_ids_qc);
    const canIds = parseIdList(e.media_ids_roc);
    let cur = byStory.get(key);
    if (!cur) {
      cur = { rep: e, repKey: bk, label: e.title ?? "", sumQc: 0, sumRoc: 0, peakQc: 0, peakRoc: 0,
        qcMedia: new Set(), canMedia: new Set(), urlByMedia: {}, tok: titleTokens(e.title ?? ""),
        byBlock: new Map(), series: [] };
      byStory.set(key, cur);
    }
    cur.sumQc += qc * w; cur.sumRoc += roc * w;
    cur.peakQc = Math.max(cur.peakQc, qc); cur.peakRoc = Math.max(cur.peakRoc, roc);
    cur.byBlock.set(bk, Math.max(cur.byBlock.get(bk) ?? 0, qc)); // score BRUT par bloc (trajectoire)
    qcIds.forEach((id) => cur!.qcMedia.add(id));
    canIds.forEach((id) => cur!.canMedia.add(id));
    for (const k of ["articles_24h", "articles"] as const) {
      try {
        const parsed = JSON.parse((e[k] as string) ?? "[]");
        if (Array.isArray(parsed)) for (const a of parsed as RawArticle[]) {
          if (a.media_id && a.url && !cur.urlByMedia[a.media_id]) cur.urlByMedia[a.media_id] = a.url;
        }
      } catch { /* champ absent ou malformé */ }
    }
    if (bk > cur.repKey) { cur.rep = e; cur.repKey = bk; cur.label = e.title ?? ""; cur.tok = titleTokens(e.title ?? ""); }
  }

  // Dédup cross-langue (STOPGAP aws-refiners#213) : fusionne les storylines
  // d'une même histoire scindée FR/EN (titres très proches). Sommes additionnées,
  // pics au max, médias en union ; représentant = celui de la storyline la PLUS
  // SAILLANTE (host), délibérément NON réévalué à la fusion : basculer vers la
  // jumelle (souvent l'autre langue) ferait changer la langue du titre affiché.
  // À l'intérieur d'une storyline, rep = bloc le plus récent (boucle ci-dessus).
  const merged: Story[] = [];
  for (const a of Array.from(byStory.values()).sort((x, y) => y.sumQc + y.sumRoc - (x.sumQc + x.sumRoc))) {
    const host = merged.find((m) => sameStory(m.tok, a.tok));
    if (host) {
      host.sumQc += a.sumQc; host.sumRoc += a.sumRoc;
      host.peakQc = Math.max(host.peakQc, a.peakQc); host.peakRoc = Math.max(host.peakRoc, a.peakRoc);
      a.qcMedia.forEach((id) => host.qcMedia.add(id));
      a.canMedia.forEach((id) => host.canMedia.add(id));
      for (const [id, url] of Object.entries(a.urlByMedia)) if (!host.urlByMedia[id]) host.urlByMedia[id] = url;
      for (const [b, v] of a.byBlock) host.byBlock.set(b, Math.max(host.byBlock.get(b) ?? 0, v));
    } else {
      merged.push(a);
    }
  }
  // Série par bloc sur les 6 blocs de la fenêtre, du plus ANCIEN au plus récent
  // (0 quand la storyline était absente du bloc) — pour la trajectoire #274.
  const windowBlocksAsc = blocks.slice(0, 6).slice().reverse();
  // Total QC par bloc (toutes histoires du bloc) → part d'attention QC de chaque
  // histoire, bloc par bloc. Sert à la tendance #304 : « combien d'espace média
  // occupe cette histoire, et comment ça bouge d'un bloc à l'autre ». Même base
  // que Deux solitudes (part = qc de l'histoire / qc total du bloc).
  const blockTotalQc = new Map<string, number>();
  for (const b of windowBlocksAsc) {
    let tot = 0;
    for (const s of merged) tot += s.byBlock.get(b) ?? 0;
    blockTotalQc.set(b, tot);
  }
  for (const s of merged) {
    s.series = windowBlocksAsc.map((b, idx) => {
      const qc = s.byBlock.get(b) ?? 0;
      const tot = blockTotalQc.get(b) ?? 0;
      // `present` = « un média QUÉBÉCOIS l'avait-il en Une dans ce bloc ? »,
      // et NON « ce bloc a-t-il une entrée pour cette histoire ? ».
      //
      // La nuance n'est pas théorique : une entrée existe dès qu'un événement
      // apparaît dans le bloc, y compris quand seuls des médias canadiens ou
      // américains le couvraient — la saillance québécoise est alors nulle.
      // Avec l'ancien test (`byBlock.has`), ces points échappaient à
      // « Hors du radar » et affichaient le niveau du BADGE (cumul 24 h) suivi
      // de « 0 % de l'attention médiatique ». Les deux moitiés étaient vraies,
      // l'ensemble illisible — signalé par Adrien captures à l'appui, mesuré à
      // **229 points sur 2 086 (11 %)** du snapshot déployé.
      //
      // Vérifié : le défaut ne vient PAS de l'indice — il se reproduit à
      // l'identique flag allumé (vitrine#430).
      //
      // `cumul` = l'attention cumulée 24 h « as-of » ce bloc — LA grandeur du
      // badge, donc celle que la courbe trace depuis #430 B3. Repli seulement :
      // le loader passe les cumuls exacts du rejeu d'éditions (badgeSums), qui
      // voient aussi les blocs antérieurs à la fenêtre affichée. Ici on ne peut
      // regarder que les 6 blocs de la fenêtre, donc les premiers points sont
      // légèrement sous-estimés.
      let cumul = 0;
      for (let j = Math.max(0, idx - 5); j <= idx; j++) {
        const bj = windowBlocksAsc[j];
        const qj = s.byBlock.get(bj) ?? 0;
        if (qj <= 0) continue;
        cumul += qj * Math.pow(2, (blockStartMs(bj) - blockStartMs(b)) / 3.6e6 / HALF_LIFE_H);
      }
      return { blockUtc: b, qc, present: qc > 0, share: tot > 0 ? (qc / tot) * 100 : 0, cumul };
    });
  }
  return merged.filter((s) => s.sumQc + s.sumRoc > 0);
}

// ── Résonance cross-région (#230) ────────────────────────────────────────────
// Une histoire québécoise « résonne » quand le MÊME sujet est aussi en Une
// ailleurs. Deux libellés distincts plutôt qu'un seul « internationale » :
// mesuré sur les 4 derniers jours (16 fenêtres, 36 Unes), la résonance
// canadienne touche 44 % des Unes et l'américaine 19 % — les fondre aurait
// affiché « internationale » sur une fusillade à Toronto, aplatissant la
// distinction QC/CAN ↔ US que la demande d'origine (Shannon, 2026-07-03)
// cherchait justement à faire voir.
//
// Ce qu'on montre d'une résonance : la PART D'ATTENTION que la région a
// accordée à cette histoire, et les médias qui l'ont mise en Une — cliquables
// vers leur article. La part est calculée sur la MÊME base que le radar Deux
// solitudes (part de l'attention 24 h de la région, cf. canShareOf) : une même
// histoire affiche donc le même pourcentage dans les deux modules.
export type RegionEcho = {
  /** Part de l'attention 24 h des Unes de la région, en % (arrondi). */
  share: number;
  /** Médias de la région ayant mis l'histoire en Une + lien vers leur article. */
  media: { name: string; url: string | null }[];
};

// Ordonne des sigles selon un roster, les inconnus à la suite (ordre stable).
function orderMedia(ids: Iterable<string>, roster: string[]): string[] {
  const set = new Set(ids);
  const known = roster.filter((id) => set.has(id));
  const rest = [...set].filter((id) => !roster.includes(id)).sort();
  return [...known, ...rest];
}

// Côté CANADIEN, rien à détecter : storiesFrom24h fusionne déjà les lignes CAN
// dans l'histoire (union des médias du ROC publiée par le refiner #211), donc
// `canMedia` EST la résonance. Vérifié : sur ces 36 Unes, ce critère et un
// appariement ligne à ligne (storyline_id ou titres proches) donnent exactement
// le même verdict, 0 désaccord.
function canResonance(s: Story, totalRoc: number): RegionEcho | null {
  if (s.canMedia.size === 0) return null;
  return {
    share: totalRoc > 0 ? Math.round((s.sumRoc / totalRoc) * 100) : 0,
    media: orderMedia(s.canMedia, CAN_MEDIA).map((id) => ({
      name: MEDIA_NAMES[id] ?? id,
      url: s.urlByMedia[id] ?? null,
    })),
  };
}

// Côté AMÉRICAIN, il faut relire la source : uniqueQcEvents() écarte les lignes
// USA du pipeline et elles NE DOIVENT PAS y revenir — c'est ce filtre qui tient
// l'indice de convergence à sa valeur publiée (#211/#237). D'où cette lecture
// séparée, en LECTURE SEULE : les lignes US ne servent qu'à répondre « ce sujet
// est-il aussi en Une aux États-Unis ? », jamais à alimenter un score.
//
// Appariement : storyline_id identique OU titres très proches (sameStory). Le
// stopgap par titre est nécessaire tant que le regroupement cross-langue n'est
// pas livré (aws-refiners#213) — l'appariement par identifiant seul
// sous-détecte massivement (mesuré au repérage du 2026-07-15). Les titres
// comparés sont les titres FR normalisés par le raffineur, des deux côtés :
// c'est la même clé que la dédup FR/EN de storiesFrom24h.
type UsEcho = {
  storylineId: string | null;
  tok: Set<string>;
  /** score_us du bloc, PONDÉRÉ par récence — même demi-vie que sumQc/sumRoc,
   *  sans quoi la part américaine ne serait pas sur la même échelle que la
   *  part canadienne à laquelle elle est montrée côte à côte. */
  scoreUs: number;
  blockUtc: string;
  articles: { media_id: string; url: string }[];
};
function usEchoes(allRaw: RawEvent[], windowBlocks: Set<string>): UsEcho[] {
  const newestMs = windowBlocks.size
    ? Math.max(...[...windowBlocks].map(blockStartMs))
    : 0;
  return allRaw
    .filter((e) => e.country_id === "USA" && windowBlocks.has(blockKey(e)) && e.title)
    .map((e) => {
      const bk = blockKey(e);
      const w = Math.pow(2, (blockStartMs(bk) - newestMs) / 3.6e6 / HALF_LIFE_H);
      let articles: { media_id: string; url: string }[] = [];
      try {
        const parsed = JSON.parse(e.articles ?? "[]");
        if (Array.isArray(parsed)) articles = parsed as { media_id: string; url: string }[];
      } catch { /* champ absent ou malformé */ }
      return {
        storylineId: e.storyline_id ?? null,
        tok: titleTokens(e.title ?? ""),
        scoreUs: (e.score_us ?? 0) * w,
        blockUtc: bk,
        articles,
      };
    });
}

function usResonance(s: Story, echoes: UsEcho[], totalUs: number): RegionEcho | null {
  const matched = echoes.filter(
    (u) =>
      (u.storylineId != null && u.storylineId === s.rep.storyline_id) ||
      sameStory(u.tok, s.tok),
  );
  if (matched.length === 0) return null;

  // Un lien par média : celui du bloc le plus RÉCENT où il a couvert le sujet.
  const urlByMedia: Record<string, string> = {};
  for (const u of [...matched].sort((a, b) => (a.blockUtc < b.blockUtc ? 1 : -1))) {
    for (const a of u.articles) {
      // Les articles d'une ligne américaine mêlent les deux pays : le sujet est
      // américain, mais Radio-Canada ou CBC l'ont parfois repris. Seuls les
      // médias hors roster canadien comptent ici (cf. CANADIAN_MEDIA).
      if (!a?.media_id || !a.url || CANADIAN_MEDIA.has(a.media_id)) continue;
      if (!urlByMedia[a.media_id]) urlByMedia[a.media_id] = a.url;
    }
  }
  const sumUs = matched.reduce((acc, u) => acc + u.scoreUs, 0);
  return {
    share: totalUs > 0 ? Math.round((sumUs / totalUs) * 100) : 0,
    media: orderMedia(Object.keys(urlByMedia), []).map((id) => ({
      name: MEDIA_NAMES[id] ?? id,
      url: urlByMedia[id] ?? null,
    })),
  };
}

// Les 6 blocs de 4 h de la fenêtre glissante — MÊME définition que
// storiesFrom24h, pour que la résonance se mesure exactement sur la fenêtre des
// histoires affichées.
function window24hBlocks(events: RawEvent[]): Set<string> {
  const blocks = Array.from(new Set(events.map(blockKey))).sort().reverse();
  return new Set(blocks.slice(0, 6));
}

// Convergence OBJET sur la fenêtre glissante 24 h (mêmes 6 blocs que
// storiesFrom24h) : moyenne des indices de convergence des blocs, PONDÉRÉE par
// l'attention de chaque bloc (Σ score_qc + ROC) — un bloc creux ne pèse pas
// autant qu'un bloc chargé. Comme le radar et la Une, le grand chiffre couvre
// donc les 24 h, plus un seul bloc de 4 h (décision d'équipe 2026-07-14, Y3).
// null si aucun bloc de la fenêtre n'a d'indice publié → repli en aval.
// PROVISOIRE : la convergence glissante « officielle » viendra du refiner (aws-refiners#212).
function windowConvergence(allEvents: RawEvent[], cutover: boolean = SALIENCE_CUTOVER): number | null {
  const blocks = Array.from(new Set(allEvents.map(blockKey))).sort().reverse();
  const window24h = new Set(blocks.slice(0, 6));
  const byBlock = new Map<string, { idx: number | null; wt: number }>();
  for (const e of allEvents) {
    const bk = blockKey(e);
    if (!window24h.has(bk)) continue;
    let b = byBlock.get(bk);
    if (!b) { b = { idx: null, wt: 0 }; byBlock.set(bk, b); }
    // Même valeur d'indice pour toutes les lignes d'un bloc : on prend la 1re.
    if (b.idx === null && e.interval_convergence_score != null) {
      b.idx = Math.max(0, Math.min(100, e.interval_convergence_score));
    }
    // Les deux régions DOIVENT être lues sur la même échelle : mélanger un QC
    // en ancien indice et un ROC en nouveau donnerait un poids de bloc dominé
    // par le seul côté à grande échelle.
    b.wt += qcScore(e, cutover) + rocScore(e, cutover);
  }
  let num = 0, den = 0, plainNum = 0, plainCount = 0;
  for (const { idx, wt } of byBlock.values()) {
    if (idx === null) continue;
    const w = wt > 0 ? wt : 0;
    num += idx * w; den += w;
    plainNum += idx; plainCount += 1;
  }
  if (plainCount === 0) return null;
  // Repli sur la moyenne simple si tous les blocs à indice sont sans saillance.
  return den > 0 ? num / den : plainNum / plainCount;
}

// Score du module = convergence au niveau HISTOIRE (décision ratifiée 2026-07-15 :
// event-level plutôt que cosinus-objet, plus lisible et cohérent avec le radar).
// « De combien d'attention des deux régions va aux MÊMES histoires ? »
// Une histoire est bilatérale si elle a de la saillance des deux côtés
// (sumQc>0 ET sumRoc>0) sur la fenêtre 24 h. Convergence = moyenne des deux
// parts (QC couvert par CAN, CAN couvert par QC). null si un côté est vide.
function windowEventConvergence(stories: Story[]): number | null {
  const totalQc = stories.reduce((s, a) => s + a.sumQc, 0);
  const totalRoc = stories.reduce((s, a) => s + a.sumRoc, 0);
  if (totalQc <= 0 || totalRoc <= 0) return null;
  const bi = stories.filter((a) => a.sumQc > 0 && a.sumRoc > 0);
  const biQc = bi.reduce((s, a) => s + a.sumQc, 0);
  const biRoc = bi.reduce((s, a) => s + a.sumRoc, 0);
  return Math.round(((biQc / totalQc) + (biRoc / totalRoc)) / 2 * 100);
}

function buildSolitudes(
  latest: RawEvent[],
  stories: Story[],
  conv24h: number | null,
  habitualConvPct: number = HABITUAL_EVENT_CONV,
  habBands: { p20: number; p80: number } = { p20: HABITUAL_EVENT_CONV_P20, p80: HABITUAL_EVENT_CONV_P80 },
  // Niveau de saillance du bout de ligne (#383). Chaque camp est situé dans
  // les Unes de SA région — un sujet mené par le ROC se compare aux Unes
  // canadiennes, sinon le module comparerait deux solitudes avec une seule
  // règle. Optionnel : les tests appellent buildSolitudes sans lui, et le
  // radar se contente alors de la part d'attention (aucune étiquette inventée).
  //
  // Les deux côtés utilisent la MÊME construction depuis aws-refiners#273
  // (livrée le 2026-08-07) : le cumul 24 h pondéré par récence du sujet, situé
  // dans la distribution 365 j des cumuls de SA région (`score_qc_sum_24h` /
  // `score_roc_sum_24h`).
  //   · QC  → le rang du badge de la Une des Unes (cumul + hystérésis, #314),
  //           repris TEL QUEL. Non négociable : sans ça, la même histoire
  //           affichait deux niveaux différents sur la même page (mesuré le
  //           2026-08-03 : « Téhéran » Faible au module 1, Élevée au radar).
  //   · ROC → rawRank(sumRoc) contre `score_roc_sum_24h`. Sans hystérésis :
  //           le badge du module 1 n'existe pas pour ces sujets et le radar
  //           n'a pas de mémoire d'édition en édition côté canadien.
  // REPLI transitoire (`roc`) : tant que `score_roc_sum_24h` n'est pas dans le
  // JSON déployé, l'ancien compromis s'applique — le pic 24 h contre la
  // distribution ROC des scores de bloc. La population reste NOMMÉE dans la
  // phrase dans les deux cas.
  sal?: {
    badgeRanks: Map<string, { rank: number }>;
    sumThresholds: typeof SUM_QC_THRESHOLDS;
    sumRocThresholds?: typeof SUM_QC_THRESHOLDS | null;
    roc: typeof SAL_QC_THRESHOLDS | null;
  },
): SolitudeData {
  // Convergence OBJET sur la fenêtre 24 h (moyenne pondérée des blocs, cf.
  // windowConvergence). Repli sur l'exclusivité pondérée des histoires 24 h
  // tant qu'aucun bloc de la fenêtre n'a d'indice publié par le refiner (#211).
  const qcRow = latest.find((e) => e.country_id === "QC" || e.country_id === "CAN");
  let convPct: number;
  if (conv24h !== null) {
    // Moyenne pondérée = flottant → arrondi pour un pourcentage entier à l'écran.
    convPct = Math.round(Math.max(0, Math.min(100, conv24h)));
  } else {
    const total = stories.reduce((s, a) => s + a.sumQc + a.sumRoc, 0);
    const excl = stories.reduce((s, a) => {
      const q = a.sumQc, tot = a.sumQc + a.sumRoc;
      return s + tot * Math.abs((tot > 0 ? q / tot : 0) - 0.5) * 2;
    }, 0);
    convPct = total > 0 ? Math.round(100 - (excl / total) * 100) : 0;
  }
  const divPct = Math.max(0, Math.min(100, 100 - convPct));
  // NB : plus de `relPct`/`calConv` ici. La jauge est passée à une échelle
  // ABSOLUE (marqueur = convPct, repère = habitualConvPct), donc le percentile
  // pctile(convPct, calConv) n'a plus lieu d'être : calConv est calibré sur la
  // convergence OBJET (interval_convergence_score), alors que convPct vient
  // désormais de windowEventConvergence (niveau HISTOIRE) — les mélanger donnait
  // une position fausse. calConvFrom reste pour la calibration Module 2 « objet »
  // si on la ré-expose un jour ; la saillance (Module 1) passe par salThresholds.
  const mode = convMode(convPct);
  // Québec à DROITE, Canada à GAUCHE (#395, retour Shannon + Adrien) :
  // inversé par rapport à l'intuition, mais aligné sur ce que le radar fait
  // déjà STRUCTURELLEMENT plus bas dans cette même fonction. `picked` met
  // toujours le top-3 québécois (par sumQc) avant le top-3 canadien (par
  // sumRoc), et les axes se posent en partant du haut, sens horaire — donc
  // les axes 0-2 (québécois) tombent en haut/à droite, et 3-5 (canadiens)
  // en bas/à gauche. Le bandeau du haut disait jusqu'ici « Québec = gauche »,
  // l'inverse de ce que montre le radar juste en dessous.
  const [canSymbolPos, qcSymbolPos] = symbolPositions(convPct);

  // Histoires 24 h déjà agrégées + dédupliquées en amont (storiesFrom24h),
  // partagées avec la Une des Unes. Ici : sélection + rendu seulement.
  const totalQc = stories.reduce((s, a) => s + a.sumQc, 0);
  const totalRoc = stories.reduce((s, a) => s + a.sumRoc, 0);

  // Sélection ÉQUILIBRÉE : union du top-3 québécois et du top-3 canadien, pour
  // que les deux agendas soient représentés (sinon le Canada, à l'échelle 2,8×
  // plus grande, monopolise les 6 axes — cf. observation d'Adrien 2026-07-14).
  const topQc = [...stories].sort((a, b) => b.sumQc - a.sumQc).slice(0, 3);
  const topRoc = [...stories].sort((a, b) => b.sumRoc - a.sumRoc).slice(0, 3);
  const picked: Story[] = [];
  for (const a of [...topQc, ...topRoc]) if (!picked.includes(a)) picked.push(a);
  for (const a of [...stories].sort((x, y) => y.sumQc + y.sumRoc - (x.sumQc + x.sumRoc))) {
    if (picked.length >= 6) break;
    if (!picked.includes(a)) picked.push(a);
  }

  const buildMediaFor = (a: Story): SolitudeAxis["media"] => {
    const mk = (id: string, region: "qc" | "can") => ({
      id, name: MEDIA_NAMES[id] ?? id, badge: MEDIA_BADGE[id] ?? id,
      url: a.urlByMedia[id] ?? null, region,
    });
    return [
      ...[...a.qcMedia].map((id) => mk(id, "qc" as const)),
      ...[...a.canMedia].map((id) => mk(id, "can" as const)),
    ];
  };

  // Le rayon = la VRAIE part d'attention de la région (% de son total 24h),
  // pour que les anneaux étiquetés « 5 % / 10 %… » aient un sens. Échelle
  // commune adaptative : plafond arrondi au multiple de 5 supérieur au plus
  // gros sujet affiché (min 10 %), pour que le plus gros remplisse le radar.
  const qcShareOf = (a: Story) => (totalQc > 0 ? (a.sumQc / totalQc) * 100 : 0);
  const canShareOf = (a: Story) => (totalRoc > 0 ? (a.sumRoc / totalRoc) * 100 : 0);
  const maxShare = Math.max(...picked.flatMap((a) => [qcShareOf(a), canShareOf(a)]), 1);
  const axisScale = Math.max(10, Math.ceil(maxShare / 5) * 5);

  const axes: SolitudeAxis[] = picked.map((a) => {
    const qs = qcShareOf(a), cs = canShareOf(a);
    // Niveau de saillance du camp qui MÈNE l'axe, situé parmi les Unes de SA
    // région. Même grandeur des deux côtés : le cumul 24 h pondéré par récence
    // (`sumQc`/`sumRoc`), contre la distribution 365 j des cumuls de sa région
    // (`score_qc_sum_24h` / `score_roc_sum_24h`). C'est ce qui rend les
    // niveaux des deux côtés du radar comparables entre eux — l'objet même du
    // module (et la fin du compromis mesuré le 2026-08-03 sur « Téhéran »).
    const mene = qs >= cs ? "qc" : "can";
    let tier: { label: string; cls: string; hint: string } | null = null;
    if (sal) {
      if (mene === "qc") {
        // Rang du badge du module 1, tel quel (même clé, même repli).
        const rank = sal.badgeRanks.get(a.rep.storyline_id ?? a.label)?.rank
          ?? rawRank(a.sumQc, sal.sumThresholds);
        tier = { ...TIER_BY_RANK[rank], hint: hintFromCentile(a.sumQc, sal.sumThresholds, POP_QC) };
      } else if (sal.sumRocThresholds) {
        const rank = rawRank(a.sumRoc, sal.sumRocThresholds);
        tier = { ...TIER_BY_RANK[rank], hint: hintFromCentile(a.sumRoc, sal.sumRocThresholds, POP_ROC) };
      } else if (sal.roc) {
        // Repli transitoire : calibration ROC cumulée absente du JSON → pic
        // 24 h contre la distribution des scores de bloc.
        tier = saillanceTierFromScore(a.peakRoc, sal.roc, POP_ROC);
      }
    }
    return {
      label: a.label,
      eyebrow: ISSUE_LABELS_SHORT[a.rep.main_issue ?? ""] ?? null,
      salienceLabel: tier?.label ?? null,
      salienceCls: tier?.cls ?? null,
      salienceHint: tier?.hint ?? null,
      qcRadial: Math.min(100, Math.round((qs / axisScale) * 100)),
      canRadial: Math.min(100, Math.round((cs / axisScale) * 100)),
      qcShare: Math.round(qs),
      canShare: Math.round(cs),
      side: (qs >= cs ? "qc" : "can") as "qc" | "can",
      media: buildMediaFor(a),
    };
  });

  const shared = axes.filter((a) => a.qcRadial > 0 && a.canRadial > 0).length;

  return {
    divPct, convPct,
    modeWord: mode.word, modeCls: mode.cls,
    habitualConvPct,
    ...relScore(convPct, habitualConvPct, habBands.p20, habBands.p80),
    // Le niveau absolu recule d'un rang : il vit au survol du marqueur de la
    // jauge. Il est dit en CONVERGENCE, comme tout le module : le marqueur est
    // posé à `convPct` sur la piste, donc l'annoncer en divergence chiffrerait
    // le point là où il n'est pas.
    markerTitle:
      `Aujourd'hui : ${convPct} % de convergence. Habituel : ${habitualConvPct} %.`,
    coverageQcInCan: qcRow?.coverage_qc_in_can ?? null,
    coverageCanInQc: qcRow?.coverage_can_in_qc ?? null,
    edito: solitudesEdito(convPct, shared),
    qcSymbolPos, canSymbolPos,
    axisScale,
    axes,
  };
}

// Étiquette de saillance par percentiles SYMÉTRIQUES du score_qc (cf. #35) :
// autant de « Très faible » que d'« Exceptionnelle », le gros au centre (courbe en
// cloche sur échelle log). Bandes p5/p20/p50/p80/p95 = 5/15/30/30/15/5 %.
// Labels : Très faible, Faible, Modérée, Élevée, Très élevée, Exceptionnelle
// (la médiane tombe entre Modérée et Élevée ; aucune bande ne prétend être
// « la moyenne »).
// La pastille étiquette le PIC de saillance 24 h de l'histoire (peakQc, #231),
// donc les seuils doivent venir de la distribution des PICS, pas des scores par
// bloc — et sur la période POST-FUSION (aws-refiners#227, déployée 2026-07-17),
// qui a nettement remonté les scores en agrégeant la couverture des fragments.
// Recalibrage 2026-07-20 (#281) sur les pics 24 h par storyline QC depuis le
// 2026-07-17 (n=44) : p5/p20/p50/p80/p95 = 8/11/19/48/95. L'ancien 5/10/19/36/71
// (recalibrage 2026-06-03, événements fragmentés, distribution PAR BLOC) faisait
// dépasser p95 à presque toutes les Unes affichées → « Exceptionnelle » en
// continu. Repli seulement : la valeur vive vient de la calibration glissante
// `metrics.score_qc_peak_24h` (fetch_data.R) dès qu'elle a assez de points.
// Illustration pédago régénérée dans public/methodologie/ (et docs/).
const SAL_QC_THRESHOLDS = { faible: 8, moyenne: 11, eleve: 19, tresEleve: 48, extreme: 95 };

// `rank` (1–6) pilote aussi la taille du titre (data-saillance) : la hiérarchie
// visuelle reflète la saillance, plus le nombre de médias.
// `hint` : explication relative du niveau. Le cadrage BASCULE à la médiane pour
// garder un % toujours grand et parlant : sous la médiane on compte ce qui
// DÉPASSE la nouvelle (« X % … sont plus saillantes que celle-ci »), au-dessus on
// compte ce qu'elle dépasse (« Plus saillante que X % … »). Toutes les nouvelles
// ici ont fait la Une. Affiché en infobulle sur chaque tag + visible sous le hero.
// `pop` = population de référence, pour que la phrase nomme l'ensemble de médias
// dans lequel la nouvelle est située. Défaut québécois : c'est la Une des Unes.
// « Modérée » (et non « Moyenne ») : cette bande (p20-p50) est ENTIÈREMENT sous
// la médiane ; avec 6 bandes paires, aucune n'EST le centre. Éviter « Moyenne »,
// qui laisse croire à tort que c'est le niveau typique (retour M-A Martel, #35).
// Le `cls` reste s-moyenne (le CSS s'appuie dessus, label ≠ classe).
function saillanceTierFromScore(
  score: number | null,
  thresholds: typeof SAL_QC_THRESHOLDS = SAL_QC_THRESHOLDS,
  pop: string = POP_QC,
): { label: string; cls: string; rank: number; hint: string } {
  const s = score ?? 0;
  const rank = s >= thresholds.extreme ? 6
    : s >= thresholds.tresEleve ? 5
      : s >= thresholds.eleve ? 4
        : s >= thresholds.moyenne ? 3
          : s >= thresholds.faible ? 2
            : 1;
  const { label, cls } = TIER_BY_RANK[rank];
  return { label, cls, rank, hint: HINT_BY_RANK[rank](pop) };
}

// ── Badge de saillance CUMULÉE 24 h (essai) ─────────────────────────────────
// Le badge ne décrit plus le SOMMET (figé, ne redescend jamais) ni le BLOC
// COURANT (absent 38 % du temps pour la manchette principale, mesuré sur
// l'historique DEV) : il décrit la saillance cumulée sur 24 h pondérée par
// récence — `sumQc`, la grandeur qui décide DÉJÀ de l'ordre des cartes. Elle
// existe toujours, elle décroît d'elle-même avec les heures, et le badge dit
// enfin la même chose que le classement.
//
// GRILLE « B » mesurée sur l'historique DEV (2026-05-14 → 2026-07-26, 206
// histoires, un point par storyline comme la calibration des pics).
//
// REPLI seulement : `fetch_data.R` publie désormais `metrics.score_qc_sum_24h`
// (calibration_sum_qc) et le loader le préfère quand il est là. La métrique
// reste NULL tant que la fenêtre POST-FUSION ne contient pas assez de Unes
// distinctes (CAL_MIN_N = 60 ; ~23 au 2026-07-27) — d'ici là ces valeurs
// servent, et le basculement se fera tout seul.
//
// Population de référence = les Unes AFFICHÉES, pas toutes les storylines.
// Mesuré : calibrer sur toutes les storylines mettrait 93 % des cartes dans les
// 3 bandes du haut et 0 % dans les 2 du bas — exactement le tassement de
// l'ancien badge au pic. Sur les affichées : 43 % / 25 %.
const SUM_QC_THRESHOLDS = { faible: 21.4, moyenne: 31.0, eleve: 47.9, tresEleve: 102.4, extreme: 192.8 };

// PLUS D'HYSTÉRÉSIS depuis vitrine#430 (décision A4, Adrien, 2026-08-09).
//
// Une marge de 8 % retenait le libellé tant que la valeur n'avait pas dépassé
// la frontière franchement. L'intention était bonne — éviter qu'un cumul qui
// flotte autour d'une ligne fasse clignoter l'étiquette — mais elle avait un
// défaut rédhibitoire pour un score qui se veut OFFICIEL et COMPARABLE :
//
//   le niveau n'était pas une FONCTION de la valeur.
//
// Deux Unes au cumul identique pouvaient afficher deux niveaux différents,
// selon ce qu'elles affichaient à l'édition précédente. Cette dépendance au
// chemin interdit de dire « ce niveau correspond à cette valeur » — et c'est
// précisément la promesse que Radar+ doit tenir pour des analyses
// longitudinales (cf. A0 : référence gelée, datée, versionnée).
//
// L'amortisseur masquait par ailleurs le bruit d'une échelle MOUVANTE. Une fois
// la référence ancrée, ce bruit-là disparaît : franchir une frontière redevient
// un événement réel, et le public a le droit de le voir au moment où il arrive.
//
// Prix mesuré et assumé : 11 % des cartes changent d'étiquette, et 13,7 % des
// triplets d'éditions montrent un aller-retour A→B→A. En contrepartie
// l'infobulle annonce désormais le VRAI centile (A7), donc un lecteur qui
// s'étonne d'un mouvement en voit le chiffre.

/** Population de référence d'un niveau de saillance. Un niveau n'existe JAMAIS
 *  dans l'absolu : il situe une nouvelle parmi les Unes d'un ensemble de médias.
 *  Nommer cet ensemble n'est pas une précision de style — sans lui, « saillance
 *  faible » sur un sujet mené par le ROC laisse croire qu'on compare les deux
 *  régions dans le même panier, ce que « Deux solitudes » cherche justement à
 *  ne pas faire. */
const POP_QC = "des médias québécois";
const POP_ROC = "des médias canadiens";

/** Une seule rédaction pour les six niveaux, la population en paramètre. Ces
 *  phrases existaient en double (ici et dans saillanceTierFromScore), mot pour
 *  mot : la moindre retouche devait être faite deux fois. */
const HINT_BY_RANK: Record<number, (pop: string) => string> = {
  6: (p) => `Plus saillante que 95 % des nouvelles à la Une ${p}.`,
  5: (p) => `Plus saillante qu’environ 85 % des nouvelles à la Une ${p}.`,
  4: (p) => `Plus saillante qu’environ 65 % des nouvelles à la Une ${p}.`,
  3: (p) => `Environ 65 % des nouvelles à la Une ${p} sont plus saillantes que celle-ci.`,
  2: (p) => `Environ 85 % des nouvelles à la Une ${p} sont plus saillantes que celle-ci.`,
  1: (p) => `95 % des nouvelles à la Une ${p} sont plus saillantes que celle-ci.`,
};

// ── Le VRAI centile, plutôt qu'un centile arrondi à six paliers (#430, A7) ───
//
// L'échelle publique approuvée avec Yannick (vitrine#258) dit « le niveau se dit
// en centile ». Les phrases ci-dessus en donnaient bien un — mais il n'en
// existait que SIX, un par bande, alors que les bandes couvrent 5, 15, 30, 30,
// 15 et 5 points de centile. Une Une au 22e centile et une autre au 49e
// recevaient donc le même mot ET la même phrase. Écart moyen mesuré entre le
// centile annoncé et le vrai : 6,5 points, jusqu'à 14, avec 27 % des cartes
// fausses de plus de 10 points.
//
// On ne publie que 5 percentiles (p5/p20/p50/p80/p95), donc le centile est
// INTERPOLÉ entre eux — même patron que la jauge de convergence (pctile /
// calConvFrom). Mesuré sur les mêmes cartes : erreur moyenne 1,9 point, jamais
// plus de 6, et plus aucune carte fausse de plus de 10 points. L'erreur est
// divisée par 3,4 sans rien publier de nouveau.
//
// Ancre haute à 2 × p95 → 100 : même convention que la figure du ⓘ, qui trace
// son axe jusqu'au double du p95.
function centileFrom(v: number, t: typeof SUM_QC_THRESHOLDS): number {
  const anchors: [number, number][] = [
    [0, 0], [t.faible, 5], [t.moyenne, 20], [t.eleve, 50],
    [t.tresEleve, 80], [t.extreme, 95], [t.extreme * 2, 100],
  ];
  return Math.round(pctile(v, anchors));
}

/** La phrase de l'infobulle, sur le centile RÉEL.
 *
 *  Formulation arrêtée avec Adrien (2026-08-09) : « environ 73 % des Unes sont
 *  moins saillantes que celle-ci » — le registre public, pas celui de la métho
 *  (« au 73e centile » a été explicitement écarté).
 *
 *  Le cadrage BASCULE à la médiane, comme avant : sous 50 on compte ce qui
 *  DÉPASSE la nouvelle, au-dessus on compte ce qu'elle dépasse. Le chiffre reste
 *  ainsi toujours grand et parlant. Borné à [1, 99] : « moins saillante que
 *  100 % des Unes » serait faux (elle fait partie du lot) et « 0 % » ne dit rien.
 */
function hintFromCentile(v: number, t: typeof SUM_QC_THRESHOLDS, pop: string): string {
  const c = Math.max(1, Math.min(99, centileFrom(v, t)));
  return c >= 50
    ? `Environ ${c} % des nouvelles à la Une ${pop} sont moins saillantes que celle-ci.`
    : `Environ ${100 - c} % des nouvelles à la Une ${pop} sont plus saillantes que celle-ci.`;
}

const TIER_BY_RANK: Record<number, { label: string; cls: string; hint: string }> = {
  6: { label: "Exceptionnelle", cls: "s-extreme", hint: HINT_BY_RANK[6](POP_QC) },
  5: { label: "Très élevée", cls: "s-tres-eleve", hint: HINT_BY_RANK[5](POP_QC) },
  4: { label: "Élevée", cls: "s-eleve", hint: HINT_BY_RANK[4](POP_QC) },
  3: { label: "Modérée", cls: "s-moyenne", hint: HINT_BY_RANK[3](POP_QC) },
  2: { label: "Faible", cls: "s-faible", hint: HINT_BY_RANK[2](POP_QC) },
  1: { label: "Très faible", cls: "s-tres-faible", hint: HINT_BY_RANK[1](POP_QC) },
};

// Bornes basses des bandes, du rang 1 au rang 6 (rang 1 = pas de borne basse).
const bandLow = (t: typeof SUM_QC_THRESHOLDS) =>
  [-Infinity, -Infinity, t.faible, t.moyenne, t.eleve, t.tresEleve, t.extreme];

function rawRank(v: number, t: typeof SUM_QC_THRESHOLDS): number {
  const low = bandLow(t);
  for (let r = 6; r >= 2; r--) if (v >= low[r]) return r;
  return 1;
}

// Le rejeu des éditions reste nécessaire — non plus pour lisser le badge, mais
// pour le SOMMET (la plus haute valeur atteinte, montrée dans la bulle ⓘ), pour
// les CUMULS édition par édition (la courbe de trajectoire) et pour
// l'HISTORIQUE des niveaux (l'étiquette de chaque point). Le site est rebâti à
// neuf toutes les 4 h sans état persistant : on rejoue donc les éditions du
// snapshot, du plus ancien au plus récent. Déterministe.
function badgeRanks(
  events: RawEvent[],
  sumThresholds: typeof SUM_QC_THRESHOLDS,
  cutover: boolean = SALIENCE_CUTOVER,
): Map<string, { rank: number; peakSum: number; peakBlock: string; history: Map<string, number>; sums: Map<string, number> }> {
  const blocks = Array.from(new Set(events.map(blockKey))).sort();
  const byBlock = new Map<string, RawEvent[]>();
  for (const e of events) {
    const b = blockKey(e);
    if (!byBlock.has(b)) byBlock.set(b, []);
    byBlock.get(b)!.push(e);
  }
  const out = new Map<string, { rank: number; peakSum: number; peakBlock: string; history: Map<string, number>; sums: Map<string, number> }>();
  for (let i = 0; i < blocks.length; i++) {
    const rows = blocks.slice(Math.max(0, i - 5), i + 1).flatMap((b) => byBlock.get(b) ?? []);
    if (rows.length === 0) continue;
    for (const s of storiesFrom24h(rows, cutover)) {
      const key = s.rep.storyline_id ?? s.label;
      const prev = out.get(key);
      // La même passe sert au SOMMET de l'indice cumulé : la plus haute valeur
      // que ce badge ait atteinte, et l'édition où c'est arrivé. Elle vit sur la
      // MÊME échelle que la valeur courante — donc plaçable sur la même figure.
      const peakSum = Math.max(prev?.peakSum ?? 0, s.sumQc);
      const peakBlock = !prev || s.sumQc > prev.peakSum ? blocks[i] : prev.peakBlock;
      const rank = rawRank(s.sumQc, sumThresholds);
      // …et à l'HISTORIQUE du badge, édition par édition : c'est lui qu'affiche
      // le survol de la trajectoire, pour que le niveau lu sur un point soit le
      // niveau que le badge portait à ce moment-là — même grandeur, même échelle.
      const history = prev?.history ?? new Map<string, number>();
      history.set(blocks[i], rank);
      // …et à la COURBE : le cumul lui-même, édition par édition. C'est lui que
      // la trajectoire trace depuis vitrine#430, pour que la hauteur d'un point
      // et le niveau annoncé à côté soient la même grandeur.
      const sums = prev?.sums ?? new Map<string, number>();
      sums.set(blocks[i], s.sumQc);
      out.set(key, { rank, peakSum, peakBlock, history, sums });
    }
  }
  return out;
}

// Dédup storyline-aware (#231, ancien signalement #211 « la 1re et la 2e
// nouvelle sont la même ») : le clustering amont peut scinder une même histoire
// en deux événements du même bloc, et la garantie « 3 cartes par bloc/pays » du
// refiner peut réintroduire un quasi-doublon pourtant détecté. On garde la
// première occurrence (la plus saillante — la liste arrive triée par score_qc
// décroissant). Un storyline_id absent (lignes antérieures au 2026-07-10)
// n'est jamais traité comme doublon : deux lignes sans storyline sont gardées.
function dedupeByStoryline<T extends { storyline_id?: string | null }>(events: T[]): T[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.storyline_id) return true;
    if (seen.has(e.storyline_id)) return false;
    seen.add(e.storyline_id);
    return true;
  });
}

// Seuil éditorial (#273) : le module affiche 1 à 3 Unes, pas toujours 3.
// La position héros revient toujours à l'histoire la plus saillante, mais une
// PLUS DE FILTRE D'AFFICHAGE depuis vitrine#430 (décision A2, 2026-08-09).
//
// Une carte secondaire portée par un seul média était cachée : avec l'ANCIEN
// indice, qui ne voyait pas la largeur de couverture, elle pouvait monter haut
// et se présenter à tort à côté de vraies convergences. Le nouvel indice met la
// Visibilité comme une jambe d'une moyenne géométrique non compensatoire : il la
// classe lui-même, honnêtement, tout en bas. Mesuré : le seuil cachait 69 cartes
// sur 210 places — un tiers des places secondaires restaient vides — et 93 %
// d'entre elles tombent d'elles-mêmes dans les deux bandes du bas.
//
// La règle était en plus incohérente : le héros est gardé quel que soit son
// nombre de médias. On acceptait donc un mono-média EN TÊTE du module, mais pas
// en deuxième position.
//
// ⚠️ CE QUI NE CHANGE PAS, ET C'EST LE POINT DÉLICAT : la population de
// CALIBRATION reste « top-3 avec ≥ 2 médias » (scripts/fetch_data.R,
// min_media_secondary = 2). Le niveau affiché est une POSITION dans un groupe :
// si le groupe de référence suivait l'affichage, élargir l'affichage ferait
// monter tout le monde — mesuré, 79 % des cartes gagneraient au moins une bande,
// +0,82 en moyenne, sans que l'actualité ait bougé. On décroche donc la
// référence de l'affichage, ce qui préfigure exactement la décision A0 : la
// référence sera FIGÉE sur une année, versionnée, une fois le corpus réparé et
// l'historique rejoué.
//
// MIN_QC_MEDIA_SECONDARY ne décrit donc plus ce qu'on MONTRE, mais ce à quoi on
// COMPARE — et il doit rester en phase avec fetch_data.R.
// Une SECONDAIRE devait être portée par au moins MIN_QC_MEDIA_SECONDARY médias
// QC sur la fenêtre 24 h. Critère « nombre de médias » plutôt que niveau de
// saillance : tant que la formule amont gonfle la durée-en-Une d'un seul média
// (aws-refiners#205), la pastille peut afficher « Très élevée » pour une
// histoire vue chez un seul média (constat live du 16-17 juillet, cf. #273).
// On tronque le top-3 SANS repêcher d'histoire moins saillante : les modules 1
// et 2 puisent dans le même pool d'histoires 24 h (storiesFrom24h), si bien que
// chaque manchette retenue ici figure aussi parmi les axes du radar « Deux
// solitudes » — le radar peut en revanche montrer des histoires de plus (top
// canadien, jusqu'à 6 axes) qui ne passent jamais en Une.
const MIN_QC_MEDIA_SECONDARY = 2;

/** Part de l'attention du meneur qu'une manchette secondaire doit atteindre pour
 *  s'afficher (#430, B6). Voir selectTopUnes pour le raisonnement et la mesure. */
const MIN_PART_DU_MENEUR = 0.5;

// Sélection des Unes : classement PUR par saillance QC cumulée 24 h (sumQc,
// demi-vie w10), depuis le MÊME pool que le radar Deux solitudes → les deux modules
// montrent exactement le même classement (le héros de la Une = la nouvelle #1 du
// radar). Aucun plancher de récence : la moyenne pondérée fait déjà décroître une
// histoire en douceur à mesure qu'elle vieillit et que de plus grosses émergent,
// comme un vrai journal. Une histoire qui a culminé pendant la nuit reste donc à la
// Une le lendemain matin, puis glisse d'elle-même en #2, #3, puis sort.
//
// Historique : un plancher `isStaleForUne` (arbitrage 2026-07-20) excluait toute
// histoire absente du bloc courant dont le pic datait de ≥ 8 h. RETIRÉ 2026-07-23
// (arbitrage Adrien) : un banc de mesure interne sur 10 semaines (427 blocs)
// montre qu'il DÉSACCORDAIT la Une
// du radar (cohérence 67 % → 100 % sans lui), appauvrissait les fronts (jours à
// 1 seule Une 52 % → 23 %) et AUGMENTAIT le churn du héros (60 % → 35 % sans lui —
// il éjectait le leader d'un coup à chaque bloc raté). Le seul coût — quelques
// « héros retombés » les nuits creuses — est assumé : c'est aussi ce que font les
// médias quand rien de neuf n'émerge. Déclencheur : cas Oliver Jones (mort culturelle
// de la nuit, pic ~record, exclue à tort de la Une du midi le 2026-07-23).
function selectTopUnes(stories: Story[], max = 3): Story[] {
  // Top-3 par saillance cumulée, sans repêchage (le pool est partagé avec le
  // radar) et SANS filtre de nombre de médias depuis #430 A2 : l'indice
  // hiérarchise lui-même, et le badge dit honnêtement où chaque carte se situe.
  const eligible = stories.filter((s) => s.qcMedia.size > 0 && s.sumQc > 0);
  const top = eligible.sort((a, b) => b.sumQc - a.sumQc).slice(0, max);
  if (top.length === 0) return top;
  // RÈGLE DE DOMINATION (#430, B6, décision d'Adrien du 2026-08-09).
  //
  // Le nombre de manchettes n'est pas un réglage : c'est une AFFIRMATION.
  // Trois cartes disent « voici les trois histoires du moment » ; une seule dit
  // « aujourd'hui, une seule compte ». C'est la journée qui doit décider
  // laquelle est vraie.
  //
  // La règle est RELATIVE, jamais un plancher absolu. Un plancher pourrait vider
  // le module un jour creux où rien n'atteint le seuil — or trois nouvelles
  // également faibles sont comparables ENTRE ELLES et méritent leurs trois
  // cartes, chacune portant honnêtement son « Très faible ». À l'inverse, une
  // histoire qui écrase les autres doit rester seule. Le meneur passe toujours :
  // le module ne peut pas se vider.
  //
  // Seuil à 50 % — mesuré sur 105 éditions : trois cartes 49 % du temps, deux
  // 23 %, une seule 29 %. La 2e histoire est à 69 % du meneur en médiane, mais
  // sous 48 % dans un quart des éditions : les deux régimes de journées existent
  // vraiment. Et le seuil se dit en une phrase publique.
  //
  // ⚠️ C'est une règle d'AFFICHAGE, pas de mesure (précision d'Adrien) : l'indice
  // est calculé et publié pour TOUTES les histoires, elles restent disponibles
  // en base pour l'analyse, et Radar+ les montrera toutes. La Vitrine choisit
  // seulement ce qu'elle met en avant.
  const meneur = top[0].sumQc;
  return top.filter((s, i) => i === 0 || s.sumQc >= meneur * MIN_PART_DU_MENEUR);
}

/** Identité de la Une n°1 telle que le site la rendra, pour les consommateurs
 *  hors rendu (aujourd'hui `scripts/select_hero.ts` → `generate_art.py`). */
export type HeroSelection = {
  event_id: string;
  storyline_id: string | null;
  title: string | null;
  main_issue: string | null;
  date_utc: string;
  time_interval_utc: string;
  /** Traces de contrôle : permettent de voir, dans le JSON produit, que le hero
   *  vient d'un bloc antérieur au bloc courant — le cas fréquent (38 %). */
  sum_qc: number;
  peak_qc: number;
};

// API PUBLIQUE et stable de la sélection du hero. Le script d'illustration
// passait par `__test__`, qui est explicitement documenté comme réservé aux
// tests : un simple renommage interne du loader aurait cassé la synchro
// illustration ↔ hero sans que rien ne le signale (retour Copilot). Le contrat
// vit désormais ici, avec les autres exports du module.
export function selectHeroFromRawEvents(all: RawEvent[]): HeroSelection | null {
  const stories = storiesFrom24h(uniqueQcEvents(all));
  const hero = selectTopUnes(stories)[0];
  if (!hero) return null;
  // `rep` = l'occurrence de l'histoire dans le bloc le plus récent où elle est
  // présente ; c'est elle qui porte le titre et les articles que le site affiche.
  const rep = hero.rep;
  return {
    event_id: rep.event_id,
    storyline_id: rep.storyline_id ?? null,
    title: rep.title ?? null,
    main_issue: rep.main_issue ?? null,
    date_utc: rep.date_utc,
    time_interval_utc: rep.time_interval_utc,
    sum_qc: Number(hero.sumQc.toFixed(3)),
    peak_qc: Number(hero.peakQc.toFixed(3)),
  };
}

const UPDATE_HOURS_MTL = [0, 4, 8, 12, 16, 20];
const SAILLANT_TODAY: Record<number, string> = {
  0: "cette nuit", 4: "tôt ce matin", 8: "ce matin",
  12: "ce midi", 16: "cet après-midi", 20: "ce soir",
};
const SAILLANT_YESTERDAY: Record<number, string> = {
  0: "cette nuit", 4: "hier, avant l’aube", 8: "hier matin",
  12: "hier midi", 16: "hier après-midi", 20: "hier soir",
};

// Conversion UTC → Montréal sans dépendance : Intl gère EDT/EST.
const MTL_DATE_HOUR_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montreal",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});

function mtlDateAndHour(d: Date): { dateIso: string; hour: number } {
  const parts = MTL_DATE_HOUR_FMT.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    dateIso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

// Jour UTC entier d'une date ISO « YYYY-MM-DD » — pour compter des écarts de
// jours calendaires sans passer par le fuseau de la machine de build.
function isoDay(dateIso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso ?? "");
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

// « ce matin, 8 h » (#126) — version EXACTE : `first_seen_utc` (début du premier
// bloc 4h où la storyline figurait parmi les Unes saillantes, cf.
// aws-refiners#195 phase B) converti en heure de Montréal. « aujourd'hui/hier »
// est relatif à la DATE DU BLOC affiché (date_montreal_tz), pas à l'heure du
// build — le libellé reste juste même si le site est reconstruit en retard.
// Au-delà d'hier : date en toutes lettres. L'heure est arrondie à l'édition la
// plus proche (les blocs tombent pile sur les éditions en EDT, à 1 h près en EST).
function firstSeenSaillantLabel(firstSeenUtc: string | null | undefined, blockDateMtl: string | null): string | null {
  if (!firstSeenUtc || !blockDateMtl) return null;
  const t = new Date(firstSeenUtc);
  if (Number.isNaN(t.getTime())) return null;
  const { dateIso, hour } = mtlDateAndHour(t);
  const seenDay = isoDay(dateIso);
  const blockDay = isoDay(blockDateMtl);
  if (seenDay === null || blockDay === null) return null;
  const snapped = UPDATE_HOURS_MTL.reduce(
    (p, c) => (Math.abs(c - hour) <= Math.abs(p - hour) ? c : p),
    UPDATE_HOURS_MTL[0],
  );
  const dayDiff = blockDay - seenDay;
  // Pas d'espace avant « h » : « 20h », règle typographique retenue par Adrien
  // (2026-07-26) pour tout le module — les heures sont des repères, pas du texte.
  if (dayDiff <= 0) return `${SAILLANT_TODAY[snapped]}, ${snapped}h`;
  if (dayDiff === 1) return `${SAILLANT_YESTERDAY[snapped]}, ${snapped}h`;
  const dateFr = formatDateFr(dateIso);
  return `le ${dateFr.charAt(0).toLowerCase()}${dateFr.slice(1)}`;
}

// Estimation historique (#126) : début de saillance déduit du bloc 4h courant
// et de la durée en Une. Conservée en SECOURS pour les lignes sans
// `first_seen_utc` (données antérieures au 2026-07-10).
function saillantSinceLabel(timeIntervalMtl: string | null, headlineHours: number | null): string | null {
  if (!headlineHours || headlineHours <= 0) return null;
  const blockStart = parseInt((timeIntervalMtl ?? "").split("-")[0] ?? "", 10);
  if (Number.isNaN(blockStart)) return null;
  const raw = blockStart - headlineHours;
  const yesterday = raw < 0;
  const start = ((raw % 24) + 24) % 24;
  const snapped = UPDATE_HOURS_MTL.reduce(
    (p, c) => (Math.abs(c - start) <= Math.abs(p - start) ? c : p),
    UPDATE_HOURS_MTL[0],
  );
  const part = (yesterday ? SAILLANT_YESTERDAY : SAILLANT_TODAY)[snapped];
  // Pas d'espace avant « h » : « 20h », règle typographique retenue par Adrien
  // (2026-07-26) pour tout le module — les heures sont des repères, pas du texte.
  return `${part}, ${snapped}h`;
}

// Label de période pour la section (#125) : change selon le bloc 4h courant.
// « Les Unes saillantes de la soirée / du matin / … ».
function periodLabelFromInterval(intervalMtl: string): string {
  const start = parseInt((intervalMtl ?? "").split("-")[0] ?? "", 10);
  if (Number.isNaN(start)) return "du jour";
  // Table partagée avec PulseCountdown (client) — cf. lib/editions.ts.
  return editionLabel(start);
}

// ── Trajectoire de saillance (#274) ─────────────────────────────────────────
// Un point de la courbe des 6 derniers blocs : l'heure, le NIVEAU de saillance
// qu'affichait la nouvelle à ce moment (pas le score brut — décision Adrien) et
// des repères (première apparition / sommet / en ce moment).
export type SalienceTrendPoint = {
  timeLabel: string;   // « hier 19 h »
  level: string;       // « Exceptionnelle »
  /** Palier de saillance du bloc, 1 (Très faible) → 6 (Exceptionnelle) ; 0 si la
   *  nouvelle n'était pas à la Une. Pilote le DIAMÈTRE du point sur la courbe. */
  rank: number;
  score: number;       // score_qc du bloc, arrondi
  /** Attention cumulée 24 h à cette édition — CE QUE TRACE LA COURBE depuis
   *  vitrine#430 : la même grandeur que le badge, pour que la hauteur du point
   *  et le mot posé à côté ne puissent plus se contredire. */
  cumul: number;
  /** Variation relative du cumul depuis le bloc précédent, en % (demande
   *  d'Adrien) : « +12 % » dit ce que le point a fait, là où la seule hauteur
   *  demande de comparer deux positions à l'œil. null au premier point, et null
   *  quand le précédent valait zéro — une histoire qui apparaît ne « croît » pas
   *  de 100 %, elle arrive, et la phrase de tendance dit déjà « Nouveau ». */
  delta: number | null;
  /** Heure du bloc auquel la variation se compare — « 4h », « hier 20h ». Même
   *  grammaire que la phrase juste au-dessus (« depuis 12h »), pour que la bande
   *  parle d'une seule voix. */
  deltaDepuis: string | null;
  /** Part de l'attention QC du bloc, en % — CE QUE TRACE LA COURBE (essai #304).
   *  Toute la boîte de trajectoire parle désormais de part d'attention : courbe,
   *  flèche et chiffre. Le vocabulaire de NIVEAU (« Très faible »…) redevient
   *  exclusif au badge — c'est la contradiction relevée par Laurence-Olivier
   *  (deux échelles, un seul encadré) qui disparaît par construction. */
  share: number;
  isFirst: boolean;    // premier bloc où la nouvelle est apparue en Une
  isPeak: boolean;     // bloc du sommet
  isNow: boolean;      // bloc courant
  isAbsent: boolean;   // la nouvelle n'était PAS à la Une à ce bloc (≠ faible)
};
export type SalienceTrend = {
  dir: "up" | "down" | "flat";
  // « En déclin depuis hier soir » / « En progression depuis ce midi » / « Stable »
  capLabel: string;
  /** Ampleur du mouvement (#304, décision Adrien) : variation de la PART
   *  d'attention QC entre le bloc précédent et le bloc courant, en POINTS de
   *  pourcentage (ex. 25 %→15 % = −10). Signé : hausse > 0, baisse < 0, 0 =
   *  stable. Affiché UNIQUEMENT quand ça bouge — à l'état stable, le symbole « = »
   *  et le mot « Stable » suffisent, un « 0 % » serait redondant (décision Adrien).
   *  Bornée [−100, +100], cohérente avec la part d'attention de Deux solitudes. */
  deltaPct: number;
  /** Situation de l'histoire à cette édition — pilote la phrase. Fréquences
   *  mesurées sur l'historique DEV (708 cartes) : retombee 46 %, baisse 18 %,
   *  nouvelle 14 %, sommet 14 %, remonte 5 %, stable 2 %, retour 1 %. */
  situation: "nouvelle" | "sommet" | "baisse" | "remonte" | "retour" | "retombee" | "stable";
  points: SalienceTrendPoint[];
};

// Jour de PUBLICATION d'un bloc, en heure de Montréal (« YYYY-MM-DD »), et
// heure publique associée. C'est LE repère commun : le jour d'un bloc et le
// jour de l'édition courante doivent se calculer avec la même règle, sinon
// « aujourd'hui » ne veut plus dire la même chose des deux côtés.
function blockAnchor(blockUtc: string): { anchorIso: string; pubHour: number } | null {
  const t = new Date(`${blockUtc}:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  // Jour ET heure affichés AU PUBLIC = l'instant de PUBLICATION du bloc = fin
  // (+4 h) + 1 h (réforme #195, même règle que publicationHourFromInterval / le
  // pied de module). JAMAIS le début : un bloc 03-07 Mtl est PUBLIÉ à 8 h, pas
  // « 3 h ». Le JOUR doit suivre la publication, pas le début : sinon un bloc de
  // nuit 23-03 (publié à 4 h LE LENDEMAIN) s'étiquette « hier 4 h » (retour Copilot).
  const { dateIso: pubDateIso, hour: pubHourReal } = mtlDateAndHour(new Date(t.getTime() + 5 * 3_600_000));
  // Publication pile à minuit (bloc du soir 19-23) : affichée « minuit » (24 h) et
  // rattachée au jour qui vient de finir (celui du bloc), pas au petit matin du
  // lendemain — le « moment » reste « cette nuit ».
  const isMidnight = pubHourReal === 0;
  return {
    anchorIso: isMidnight ? mtlDateAndHour(t).dateIso : pubDateIso,
    pubHour: isMidnight ? 24 : pubHourReal,   // {8,12,16,20,minuit,4}
  };
}

// Étiquette d'un bloc en heure de Montréal, relative au jour de l'ÉDITION
// courante. Renvoie le mot-jour, le moment de la journée et l'heure de
// PUBLICATION du bloc (fin + 1 h, réforme #195).
//
// `refDayIso` = jour de publication de l'édition affichée (blockAnchor du bloc
// le plus récent du snapshot), PAS la date de la storyline. On passait avant
// `e.date_montreal_tz`, la date du dernier bloc où CETTE histoire était à la
// Une : pour une histoire retombée du radar, ce repère est en retard d'un jour
// et tous ses blocs s'étiquetaient « aujourd'hui ». Mesuré le 2026-07-27 à
// l'édition de 12h : les six mêmes blocs se lisaient « hier 16h / hier 20h /
// hier minuit… » sur la 1re Une et « aujourd'hui 16h / 20h / minuit… » sur la
// 3e, qui annonçait un « Sommet à 20h » encore à venir dans la journée.
function blockLabelParts(blockUtc: string, refDayIso: string | null):
  { dayWord: string; moment: string; hour: number } | null {
  if (!refDayIso) return null;
  const anchor = blockAnchor(blockUtc);
  if (!anchor) return null;
  const { anchorIso, pubHour } = anchor;
  const blockDay = isoDay(anchorIso), refDay = isoDay(refDayIso);
  if (blockDay === null || refDay === null) return null;
  const dayDiff = refDay - blockDay;
  // Les heures de PUBLICATION tombent PILE sur la grille d'éditions {0,4,8,12,16,20}
  // (minuit → 0) : plus besoin de « snapper » comme le faisait l'heure de début.
  const momentHour = pubHour % 24;
  if (dayDiff <= 0) return { dayWord: "aujourd’hui", moment: SAILLANT_TODAY[momentHour], hour: pubHour };
  if (dayDiff === 1) return { dayWord: "hier", moment: SAILLANT_YESTERDAY[momentHour], hour: pubHour };
  const dateFr = formatDateFr(anchorIso);
  const asDate = `le ${dateFr.charAt(0).toLowerCase()}${dateFr.slice(1)}`;
  return { dayWord: asDate, moment: asDate, hour: pubHour };
}

// Construit la trajectoire à partir de la série 6 blocs. La mini-courbe et le
// niveau par bloc (survol) restent basés sur le score de saillance (comme la
// pastille). La TENDANCE (#304, décision Adrien) chiffre la variation de la PART
// d'attention QC entre le bloc précédent et le bloc courant, en points de %
// (ex. 25 %→15 % = −10) : baisse (↘ −X), hausse (↗ +X) ou stable (= 0), toujours
// affichée. null seulement s'il n'y a pas 2 blocs à comparer ou aucune saillance.
function buildSalienceTrend(
  series: { blockUtc: string; qc: number; present: boolean; share: number; cumul: number }[],
  thresholds: typeof SAL_QC_THRESHOLDS,
  /** Jour de publication de l'ÉDITION courante (cf. blockLabelParts) — c'est
   *  lui qui décide de « aujourd'hui » vs « hier », pas la date de l'histoire. */
  refDayIso: string | null,
  /** Niveau du BADGE édition par édition. Quand il est fourni, c'est lui qui
   *  étiquette les points — sinon le survol annoncerait un niveau calculé sur
   *  une autre grandeur (le score du bloc) et une autre échelle que la pastille,
   *  et les deux se contrediraient à l'écran. */
  badgeHistory?: Map<string, number>,
  /** Cumul 24 h du badge, édition par édition — la grandeur que la courbe trace.
   *  Fourni par le loader depuis le rejeu d'éditions, qui voit aussi les blocs
   *  antérieurs à la fenêtre affichée. Absent → repli sur `series[].cumul`, qui
   *  ne regarde que les 6 blocs visibles et sous-estime les premiers points. */
  badgeSums?: Map<string, number>,
): SalienceTrend | null {
  if (series.length < 2 || series.every((p) => p.qc <= 0)) return null;
  const vals = series.map((p) => p.qc);
  // ── LA grandeur de la bande, depuis vitrine#430 (décision B3, 2026-08-09) ──
  // La courbe traçait la PART d'attention du bloc (une fraction : l'histoire
  // divisée par tout ce qui se passait dans ces 4 h) pendant que le mot posé à
  // côté disait le niveau du CUMUL 24 h (une quantité absolue). Deux natures
  // différentes sur la même ligne : une fraction monte quand son dénominateur
  // baisse, c'est-à-dire quand le RESTE de l'actualité se calme. Résultat, un
  // point pouvait monter pendant que son niveau descendait — mesuré à 39 % des
  // mouvements, et signalé par Adrien qui butait dessus.
  //
  // La courbe trace désormais le CUMUL, la grandeur même du badge : hauteur et
  // mot ne peuvent plus se contredire, et le « Sommet » de la phrase devient le
  // même repère que le « Plus haut niveau » de la bulle ⓘ (les deux sommets
  // tombaient à des heures différentes 45,6 % du temps).
  const valeur = (i: number) => badgeSums?.get(series[i].blockUtc) ?? series[i].cumul;
  const niveaux = series.map((_, i) => valeur(i));
  let peakIdx = 0;
  for (let i = 1; i < series.length; i++) if (niveaux[i] > niveaux[peakIdx]) peakIdx = i;
  const firstIdx = series.findIndex((p) => p.qc > 0);
  // Tendance = variation de la part d'attention QC depuis le bloc précédent
  // (bloc courant − bloc précédent, en points). Bornée [−100, +100], cohérente
  // avec Deux solitudes ; toujours affichée (0 = stable, avec symbole =).
  // Variation RELATIVE du cumul depuis l'édition précédente, en % — et non plus
  // un écart en points de part. Sur une quantité absolue, « −40 points » ne veut
  // rien dire au lecteur ; « a perdu 40 % de son attention » se comprend seul.
  const relatif = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0));
  const deltaPct = relatif(niveaux[niveaux.length - 1], niveaux[niveaux.length - 2]);

  // ── Situation, et phrase qui la dit ────────────────────────────────────────
  // RÈGLE : ne JAMAIS nier le présent. Le mot « Une » désigne deux choses à
  // l'écran — la sélection éditoriale 24 h (ce que la carte EST) et la présence
  // en manchette dans le bloc de 4 h. Une phrase du type « plus à la Une » sur
  // une carte affichée COMME une Une est incompréhensible (retour Adrien). On
  // parle donc toujours de l'ATTENTION, jamais de l'appartenance.
  // Grammaire unique, arrêtée avec Adrien :
  //     [quand elle a culminé] · [ce que l'attention fait depuis]
  // Un SEUL écart chiffré, et seulement quand il dit quelque chose (cas 2 et 4).
  // Citer aussi la part courante ET celle du sommet allongeait chaque phrase
  // d'une demi-ligne pour un gain de précision que la courbe donne déjà.
  const last = series.length - 1;
  const presents = series.map((p) => p.present);
  const firstPresent = presents.indexOf(true);
  // Sommet évalué sur la PART, pas sur le score : c'est la part que la courbe
  // trace et que la phrase cite (« sommet cette nuit à 65 % »). Mélanger les
  // deux ferait dire « au plus haut du jour » à une histoire dont la part n'a
  // pas bougé, simplement parce que son score brut a monté.
  const maxShare = Math.max(...niveaux);
  const maxAvant = Math.max(...niveaux.slice(0, last));
  const shares = niveaux;

  // Heure d'un bloc. Deux formes, selon la préposition qui précède (Adrien) :
  //   avecA = true  → « à 16 h », « hier à minuit »   (après « Sommet », « arrivée »)
  //   avecA = false → « 16 h », « hier 20 h »          (après « depuis »)
  // TOUJOURS une heure, jamais le moment de la journée : « depuis cet
  // après-midi » était plus vague que « depuis 16 h » pour le même nombre de
  // signes, et la grille d'éditions est déjà horaire.
  const heure = (i: number, avecA = true) => {
    const p = blockLabelParts(series[i].blockUtc, refDayIso);
    if (!p) return null;
    const h = p.hour >= 24 ? "minuit" : `${p.hour}h`;
    if (p.dayWord.startsWith("le ")) return p.dayWord;          // date lointaine
    const jour = p.dayWord === "aujourd’hui" ? "" : `${p.dayWord} `;
    return avecA ? `${jour}à ${h}` : `${jour}${h}`;
  };
  const hSommet = heure(peakIdx);
  const ancre = hSommet ? `Sommet ${hSommet}` : "Sommet du jour";
  const hCourant = heure(last);
  const hPrec = heure(last - 1, false);
  // Écart au sommet, en points de part, mais NOTÉ en % — même notation que le
  // module des enjeux de Laurence-Olivier (décision Adrien), pour que les deux
  // modules parlent pareil.
  // Recul depuis le sommet, en % de ce sommet — même logique relative.
  const reculSommet = Math.max(0, -relatif(niveaux[last], niveaux[peakIdx]));
  // Depuis quand l'attention est retombée = début de la série d'absences finale.
  let debutAbsence = last;
  while (debutAbsence > 0 && !presents[debutAbsence - 1]) debutAbsence--;
  const hRetombee = heure(debutAbsence, false);

  let situation: SalienceTrend["situation"];
  if (!presents[last]) situation = "retombee";
  else if (firstPresent === last) situation = "nouvelle";
  else if (shares[last] === maxShare && shares[last] > maxAvant) situation = "sommet";
  else if (!presents[last - 1]) situation = "retour";
  else if (deltaPct > 0) situation = "remonte";
  else if (deltaPct < 0) situation = "baisse";
  else situation = "stable";

  // ORDRE (décision Adrien) : le MOUVEMENT en tête, l'ancre au sommet en incise
  // entre parenthèses. Le lecteur reçoit d'abord ce qui se passe, puis le
  // repère qui le situe — et non l'inverse.
  const incise = `(${ancre})`;
  const capLabel =
    situation === "nouvelle" ? (hCourant ? `Nouveau (arrivée ${hCourant})` : "Nouveau")
      : situation === "sommet" ? (hPrec
        ? `Nouveau sommet aujourd’hui (+${Math.abs(deltaPct)} % depuis ${hPrec})`
        : "Nouveau sommet aujourd’hui")
        : situation === "retombee" ? (hRetombee
          ? `L’attention est retombée depuis ${hRetombee} ${incise}`
          : `L’attention est retombée ${incise}`)
          : situation === "retour" ? `Retour ${incise}`
            : situation === "remonte" ? (hPrec
              ? `Remonte depuis ${hPrec} ${incise}`
              : `Remonte ${incise}`)
              : situation === "stable" ? `Se maintient ${incise}`
                : `En recul de ${reculSommet} % ${incise}`;

  // La FLÈCHE suit le dernier mouvement de la courbe, pas la position vis-à-vis
  // du sommet : une histoire qui revient (0 → 25 %) monte visiblement à l'écran,
  // une flèche rouge à côté d'un segment qui grimpe se lit comme une erreur.
  // L'écart au sommet, lui, est dit par les mots.
  const dir: SalienceTrend["dir"] = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
  const points: SalienceTrendPoint[] = series.map((p, i) => {
    const parts = blockLabelParts(p.blockUtc, refDayIso);
    // Bloc où la nouvelle n'a PAS fait la Une : « Hors du radar » (point creux),
    // pas « Très faible ». Ne pas peindre l'absence comme une saillance faible
    // mais réelle — sinon on laisse croire qu'elle était là (retour Adrien).
    // « Pas à la Une » plutôt qu'« Absente » (moins abrupt, cohérent « À la Une… »).
    const badgeRank = badgeHistory?.get(p.blockUtc);
    const tier = !p.present ? null
      : badgeRank ? TIER_BY_RANK[badgeRank]
        : saillanceTierFromScore(p.qc, thresholds);
    // « hier 19 h » ; pour une date lointaine le mot-jour est déjà « le 18 juillet ».
    const timeLabel = !parts ? "" : parts.dayWord.startsWith("le ") ? parts.dayWord
      : `${parts.dayWord} ${parts.hour >= 24 ? "minuit" : `${parts.hour}h`}`;
    return {
      timeLabel,
      // « Hors du radar » plutôt que « Pas à la Une » (Adrien) : le clin d'œil à
      // Radar+ dit l'absence de couverture sans nier que la carte EST une Une.
      level: tier ? tier.label : "Hors du radar",
      rank: tier ? (badgeRank ?? (tier as { rank?: number }).rank ?? 0) : 0,
      score: Math.round(p.qc),
      share: Math.round(p.share),
      // Ce que la courbe trace désormais (cf. la note sur `valeur` plus haut).
      cumul: Math.round(valeur(i) * 10) / 10,
      delta: i === 0 || niveaux[i - 1] <= 0 ? null : relatif(niveaux[i], niveaux[i - 1]),
      deltaDepuis: i === 0 || niveaux[i - 1] <= 0 ? null : heure(i - 1, false),
      isFirst: i === firstIdx, isPeak: i === peakIdx, isNow: i === vals.length - 1,
      isAbsent: !p.present,
    };
  });
  return { dir, capLabel, deltaPct, situation, points };
}

export type UneEvent = {
  title: string;
  /** Lead synthétique généré par le refiner (colonne `text`) — affiché sous la 1re Une. */
  excerpt: string | null;
  issueFr: string;
  issueColor: string;
  /** Rang de saillance 1–6 (Très faible→1 … Exceptionnelle→6) — pilote la taille du titre. */
  saillanceRank: number;
  saillanceLabel: string;
  saillanceCls: string;
  /** Centile réel dans la distribution de référence (#430, A7). La bulle ⓘ s'en
   *  sert pour dire la même chose que l'infobulle du badge — elle parlait encore
   *  par paliers (« dans le cinquième le plus marquant »), ce qui contredisait
   *  la phrase voisine dès qu'on a eu le vrai chiffre. */
  saillanceCentile: number;
  timeMtl: string;
  headlineHours: number | null;
  /** « ce matin, 8 h » — moment depuis lequel l'événement est saillant (#126).
   *  Exact (first_seen_utc) quand la donnée 24h existe, sinon estimation. */
  saillantSince: string | null;
  representativeUrl: string | null;
  /** Union 24h des médias QC ayant mis la storyline en Une (media_ids_24h,
   *  #213/#215/#51) — remplace l'ancienne liste limitée au bloc courant ;
   *  retombe sur les médias du bloc courant si la donnée 24h manque
   *  (lignes antérieures au 2026-07-10). */
  mediaToday: { name: string; url: string | null }[];
  qcOutletCount: number;
  totalQcOutlets: number;
  /** Identifiant de suivi cross-blocs (Jaccard 0.30, lookback 24h). */
  storylineId: string | null;
  /** Pic de score_qc sur la fenêtre 24h — base de l'étiquette phase C (#122). */
  scoreQcPeak24h: number | null;
  /** Saillance CUMULÉE 24 h pondérée par récence — la grandeur du badge. */
  scoreQcSum24h: number | null;
  /** Plus haute valeur atteinte par cet indice cumulé, et l'édition où elle l'a
   *  été (« à minuit », « hier à 20 h »). null si l'histoire est à son sommet. */
  sommetSum: number | null;
  sommetLabel: string | null;
  /** Centile et bande du SOMMET (#430, A8) : c'est le sommet qui situe la
   *  nouvelle dans l'année, pas sa valeur du moment. null quand le sommet est
   *  l'instant présent — la bulle utilise alors `saillanceCentile`. */
  sommetCentile: number | null;
  sommetTier: string | null;
  /** Nombre de blocs 4h (≤ 7) où la storyline figurait parmi les Unes. */
  nBlocks24h: number | null;
  /** Trajectoire de saillance sur 24 h (#274) : flèche + libellé de tendance +
   *  courbe survolable. null si rien à raconter (un seul bloc actif). */
  salienceTrend: SalienceTrend | null;
  /** Seuils de saillance en vigueur [p5, p20, p50, p80, p95] — pour situer la
   *  nouvelle sur la courbe de distribution dans la bulle ⓘ (#274). */
  salThresholds: number[];
  /** Résonance cross-région (#230) : le même sujet vu ailleurs — part
   *  d'attention de la région + médias qui l'ont mise en Une (cliquables).
   *  null quand il n'y a pas de résonance. Deux champs distincts, jamais fondus
   *  en un seul « international » : c'est la distinction QC/CAN ↔ US qui était
   *  demandée. Voir canResonance / usResonance. */
  resonanceCan: RegionEcho | null;
  resonanceUs: RegionEcho | null;
};

/** Un axe du radar « Deux solitudes » = une histoire saillante du jour. */
export type SolitudeAxis = {
  /** Titre FR de l'histoire (storyline). */
  label: string;
  /** Étiquette « rubrique » au-dessus du titre : catégorie d'enjeu (FR, toujours
   *  exacte). null si l'enjeu est inconnu. */
  eyebrow: string | null;
  /** Valeur radiale de dessin (0-100) : part de l'attention 24h de la région
   *  rapportée au sujet le plus couvert de cette région (le plus gros sujet du
   *  jour touche le bord). Rend les deux formes comparables malgré l'écart
   *  d'échelle QC/ROC. */
  qcRadial: number;
  canRadial: number;
  /** Part réelle de l'attention 24h de la région (%), pour l'infobulle. */
  qcShare: number;
  canShare: number;
  /** Camp dominant (couleur du libellé). */
  side: "qc" | "can";
  /** Étiquette de saillance du moment (#383), prise à la MÊME source que le
   *  badge de la Une des Unes — `badgeRanks` (cumul 24 h + hystérésis, #314)
   *  puis `TIER_BY_RANK`. Surtout pas un calcul parallèle : la même histoire
   *  porte le même niveau dans les deux modules, sinon on retombe sur deux
   *  vérités pour une seule mesure. null quand le suivi n'est pas fourni. */
  salienceLabel: string | null;
  salienceCls: string | null;
  /** Ce que le niveau VEUT DIRE, en percentiles (« Environ 85 % des nouvelles à
   *  la Une sont plus saillantes que celle-ci. »). Même phrase que l'infobulle
   *  du badge de la Une des Unes. C'est elle qui rend le bout de ligne utile
   *  plutôt que redondant : le point INTÉRIEUR donne une part d'attention, le
   *  point EXTÉRIEUR donne un rang parmi les Unes. */
  salienceHint: string | null;
  /** Médias couvrants + lien vers leur dernier article sur le sujet.
   *  `region` colore la pastille (bleu QC / rouge CAN) : un sujet couvert des
   *  deux côtés montre les deux couleurs. */
  media: { id: string; name: string; badge: string; url: string | null; region: "qc" | "can" }[];
};

export type SolitudeData = {
  /** Divergence affichée (0-100) = 100 − convergence. */
  divPct: number;
  convPct: number;
  /** Niveau + classe de couleur (4 seuils 25/50/75 sur la convergence). */
  modeWord: string;
  modeCls: string;
  /** Position du repère « habituel » sur l'échelle absolue (= convergence
   *  event-level médiane, en %). Le marqueur live est à `convPct` ; sa position
   *  vs `habitualConvPct` dit si aujourd'hui est plus/moins convergent que d'ordinaire. */
  habitualConvPct: number;
  /** Score RELATIF en hero (#258) : écart |convPct − habitualConvPct| en %,
   *  libellé de direction/intensité, couleur, texte du ⓘ et survol du marqueur
   *  (où le niveau absolu s'est replié).
   *
   *  TOUT le module chiffre la CONVERGENCE — hero, ⓘ, bulle du marqueur, jauge
   *  et partage. `divPct` reste calculé pour l'axe, mais aucun libellé public ne
   *  doit l'afficher : deux vocabulaires pour une seule mesure obligent le
   *  lecteur à faire la soustraction lui-même. */
  relDiffPct: number;
  relLabel: string;
  relCls: string;
  relInfo: string;
  markerTitle: string;
  /** Mesure asymétrique « qui suit qui » (refiner #211) — null tant que non déployé. */
  coverageQcInCan: number | null;
  coverageCanInQc: number | null;
  /** Phrase éditoriale (gabarit fini, choisi par règles — pas de LLM). */
  edito: string;
  /** Positions de la fleur-de-lys et de l'érable sur l'axe (%). */
  qcSymbolPos: number;
  canSymbolPos: number;
  /** Part d'attention représentée par le bord du radar (%). Les anneaux
   *  valent 25/50/75/100 % de cette échelle → labels 1/4, 1/2… de axisScale. */
  axisScale: number;
  axes: SolitudeAxis[];
};

export type TreemapTile = {
  name: string;
  enjeu: string;
  color: string;
  context: string;
};

export type TreemapIssueTile = {
  issueKey: string;
  issueFr: string;
  color: string;
  score: number;
  relScore: number;
  topObject: string;
  context: string;
  url: string | null;
  /** -1 (baisse), 0 (stable), 1 (hausse) de la saillance vs le bloc (tag) précédent. */
  velocity: number;
  /** Croissance relative de la saillance vs le bloc précédent, en % ; null si score précédent nul (enjeu nouveau). */
  growth: number | null;
  /** Actualités récentes liées à l'enjeu, avec les médias propres à chaque actualité. */
  articles: {
    title: string;
    url: string | null;
    outlets: { name: string; url: string | null }[];
  }[];
};

/** Un point d'historique : le rang (1 = plus saillant) de chaque enjeu à une date. */
export type TreemapHistoryPoint = { date: string; ranks: Record<string, number> };

export type TreemapPeriodData = {
  tiles: TreemapIssueTile[];
  dateLabel: string;
  /** « Dernière mise à jour : mercredi 8 juillet 2026 » — table journalière, pas d'heure. */
  lastUpdated: string;
  /** Classement des 12 enjeux dans le temps (un point par tag), pour le graphique de rang. */
  history: TreemapHistoryPoint[];
};

export type TreemapAllPeriods = {
  day: TreemapPeriodData;
  week: TreemapPeriodData;
  month: TreemapPeriodData;
};

export type HeadlineData = {
  dateLabel: string;
  /** « Dernière mise à jour : mercredi 8 juillet 2026, 16 h » — date + fin du
   *  bloc 4h de la donnée la plus récente (cf. lib/dates.ts). Affiché en bas à
   *  droite des modules Une des unes ET Deux solitudes (même table). */
  lastUpdated: string;
  snapshotInterval: string;
  /** « de la soirée », « du matin »… selon le bloc 4h (#125). */
  periodLabel: string;
  top3: UneEvent[];
  solitudes: SolitudeData;
  treemapTier1: TreemapTile[];
  treemapTier2: TreemapTile[];
  treemapTier3: TreemapTile[];
  treemapTier4: TreemapTile[];
  treemapMobile: (TreemapTile & { relWidth: number })[];
};

// cache() : le snapshot est lu par plusieurs consommateurs du même rendu
// (Home pour periodLabel, UneDesUnesSection pour le contenu) — une seule
// lecture/parse par build au lieu d'une par appel.
export const loadHeadlineEvents = cache(async (
  /** Bloc « as-of » (« AAAA-MM-JJTHH ») : reconstruit le module tel qu'il était à
   *  cette édition, en ne gardant que les blocs qui la précèdent. Sert à naviguer
   *  dans les éditions passées (vitrine#434) — et, ici, à valider à l'œil le
   *  comportement des règles du dossier #430 sur plusieurs éditions d'affilée.
   *  Absent → l'édition courante, comportement inchangé. */
  asOf?: string,
): Promise<HeadlineData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_PATH, "utf8");
  } catch {
    return null;
  }

  const tout = JSON.parse(raw) as RawEvent[];
  // Voyage dans le temps : on coupe le snapshot au bloc demandé. Tout le reste
  // de la chaîne (fenêtre de 6 blocs, rejeu des éditions, badge, trajectoire)
  // travaille alors exactement comme il l'aurait fait à ce moment-là.
  const all = asOf ? tout.filter((e) => blockKey(e) <= asOf) : tout;
  const unique = uniqueQcEvents(all);

  if (unique.length === 0) return null;

  // GARDE DU JOUR J. Le mode d'échec redouté de la bascule n'est pas un mauvais
  // calcul, c'est un snapshot MUET : si `salience_index_qc` n'a pas encore été
  // projeté par un refresh (scripts/tables.json), qcScore rend 0 partout, toutes
  // les histoires tombent au filtre `sumQc + sumRoc > 0`, et le site se déploie
  // avec une Une des Unes VIDE — sans une seule erreur. On préfère casser le
  // build, bruyamment : un déploiement raté se voit, une page vide passe pour
  // une accalmie de l'actualité.
  // Ordre correct : merger cette PR éteinte → laisser tourner un refresh (la
  // colonne entre dans le snapshot) → flipper le flag.
  if (SALIENCE_CUTOVER && !unique.some((e) => (e.salience_index_qc ?? 0) > 0)) {
    throw new Error(
      "SALIENCE_CUTOVER est allumé mais aucune ligne du snapshot ne porte de " +
      "`salience_index_qc` non nul. Le snapshot date d'avant l'ajout de la colonne " +
      "à scripts/tables.json : lancez un refresh (gh workflow run refresh-data.yml), " +
      "vérifiez public/data/headline-events.json, puis rebâtissez.",
    );
  }

  const sorted = unique.slice().sort((a, b) => {
    const dA = `${a.date_utc}T${a.time_interval_utc.split("-")[0]}:00Z`;
    const dB = `${b.date_utc}T${b.time_interval_utc.split("-")[0]}:00Z`;
    return dB.localeCompare(dA);
  });
  const latestDate = sorted[0].date_utc;
  const latestInterval = sorted[0].time_interval_utc;
  const latest = sorted.filter(
    (e) => e.date_utc === latestDate && e.time_interval_utc === latestInterval,
  );

  // Jour de publication de l'ÉDITION affichée : le seul repère de « aujourd'hui »
  // pour TOUTES les trajectoires. Une histoire retombée du radar n'a plus de bloc
  // récent à elle ; si on lui laissait sa propre date comme repère, ses points
  // s'étiquetteraient « aujourd'hui » un jour trop tard (cf. blockLabelParts).
  const editionRefDayIso = blockAnchor(blockKey(sorted[0]))?.anchorIso ?? null;

  const dateLabel = formatDateFr(sorted[0].date_montreal_tz ?? sorted[0].date_utc);
  const snapshotInterval = sorted[0].time_interval_montreal_tz ?? sorted[0].time_interval_utc;
  const periodLabel = periodLabelFromInterval(snapshotInterval);
  // Le tag public affiche l'HEURE DE PUBLICATION, pas la fin du bloc de données.
  // Réforme #195 : le bloc de données 15-19 est servi à 20h (après ~1 h de
  // pipeline), donc heure de publication = fin du bloc + 1 h (cf.
  // publicationHourFromInterval + ses tests pour la normalisation du bord à 24).
  const publicationHour = publicationHourFromInterval(snapshotInterval);
  const lastUpdated = lastUpdatedLabel(
    publicationDateFromInterval(sorted[0].date_montreal_tz ?? sorted[0].date_utc, snapshotInterval),
    publicationHour,
  );

  // ── Sélection 24 h (partagée avec Deux solitudes) ─────────────────────────
  // La Une des Unes montre le top-3 des histoires QUÉBÉCOISES des 24 dernières
  // heures, classées par saillance QC CUMULÉE (sumQc), depuis la MÊME liste que
  // le radar → les deux modules montrent les mêmes histoires. Filtre : au moins
  // un média QC a couvert l'histoire sur la fenêtre.
  // Calibration glissante publiée (suivi aws-refiners#212) : seuils de saillance + jauge dérivés de
  // la vraie distribution ≈ 12 mois quand le fichier existe, sinon valeurs codées.
  const calibration = await loadCalibration();
  // Niveau d'un BLOC (lecture au survol de la trajectoire) : calibré sur la
  // distribution des scores PAR BLOC — sa vraie population de référence, la
  // mieux fournie du fichier (n≈1500 sur un an, contre 106 pour les sommets).
  // Deux échelles cohabitent donc, mais sans jamais pouvoir se contredire : le
  // badge parle du CUMUL 24 h, le survol d'un BLOC — deux objets distincts, à
  // deux endroits distincts. (C'était impossible du temps des deux badges
  // côte à côte, où « en ce moment » pouvait dépasser « sommet 24 h ».)
  //
  // CUTOVER : chaque grille a son homologue calibré sur le nouvel indice, à la
  // MÊME convention (même fonction dans fetch_data.R, même population). On ne
  // mélange jamais les deux familles — une valeur du nouvel indice classée avec
  // les bornes de l'ancien serait à un ordre de grandeur de la vérité.
  const blockThresholds = SALIENCE_CUTOVER
    ? scaleThresholds(salThresholdsFrom(calibration?.metrics?.salience_index_qc)) ?? NEW_BLOCK_QC_THRESHOLDS
    : salThresholdsFrom(calibration?.metrics?.score_qc) ?? SAL_QC_THRESHOLDS;
  // Grille du BADGE (cumul 24 h pondéré). Publiée par calibration_sum_24h dans
  // fetch_data.R ; repli sur les valeurs mesurées tant qu'elle manque.
  const sumThresholds = SALIENCE_CUTOVER
    ? scaleThresholds(salThresholdsFrom(calibration?.metrics?.salience_index_qc_sum_24h)) ?? NEW_SUM_QC_THRESHOLDS
    : salThresholdsFrom(calibration?.metrics?.score_qc_sum_24h) ?? SUM_QC_THRESHOLDS;
  // Repère « habituel » = médiane event-level. Dérivé de la calibration glissante
  // dès qu'elle publiera `event_convergence` (p50) ; d'ici là, constante mesurée.
  const evConv = calibration?.metrics?.event_convergence;
  const evConvP50 = evConv?.p50;
  const habitualConvPct =
    typeof evConvP50 === "number" && Number.isFinite(evConvP50)
      ? Math.round(Math.max(0, Math.min(100, evConvP50)))
      : HABITUAL_EVENT_CONV;
  // Bandes « un peu / nettement » du score relatif (#258) : p20/p80 publiés,
  // exigés finis et strictement encadrants de p50 (sinon repli codé 16/42).
  const habBands =
    evConv && [evConv.p20, evConv.p80].every((v) => typeof v === "number" && Number.isFinite(v)) &&
    evConv.p20 < habitualConvPct && habitualConvPct < evConv.p80
      ? { p20: Math.round(evConv.p20), p80: Math.round(evConv.p80) }
      : undefined;

  // Niveaux de badge lissés, reconstitués en rejouant les éditions du snapshot.
  const badgeRanksByStory = badgeRanks(unique, sumThresholds);

  const stories = storiesFrom24h(unique);
  // Seuil éditorial #273 : héros toujours affiché, secondaires seulement si
  // portées par ≥ MIN_QC_MEDIA_SECONDARY médias QC → 1 à 3 Unes.
  const qcStories = selectTopUnes(stories);

  // Résonance (#230). Côté américain, lecture sur `all` (AVANT uniqueQcEvents),
  // la seule source où les lignes USA existent encore ; fenêtre calée sur
  // `unique`, c'est-à-dire sur les blocs qui ont produit les histoires ci-dessus.
  // Les deux totaux sont les DÉNOMINATEURS des parts d'attention : total de la
  // région sur la fenêtre, même construction que le radar Deux solitudes.
  const echoesUs = usEchoes(all, window24hBlocks(unique));
  const totalUs = echoesUs.reduce((acc, u) => acc + u.scoreUs, 0);
  const totalRoc = stories.reduce((acc, s) => acc + s.sumRoc, 0);

  const top3: UneEvent[] = qcStories.map((s) => {
    const e = s.rep; // occurrence du bloc le plus récent (titre, enjeu, articles frais)
    // Pastille de saillance sur le PIC 24 h (peakQc). Les seuils viennent de la
    // distribution des PICS (salThresholds ci-dessus) : le max d'une histoire sur
    // ~6 blocs est plus haut qu'un score de bloc, donc les étiqueter avec des
    // seuils par bloc surclasserait tout le monde (#281).
    // Badge = saillance CUMULÉE 24 h pondérée par récence, lissée par hystérésis
    // (cf. SUM_QC_THRESHOLDS). Le sommet ne pilote plus le badge : il est nommé
    // dans la phrase de trajectoire, sous le badge.
    const storyKey = s.rep.storyline_id ?? s.label;
    const suivi = badgeRanksByStory.get(storyKey);
    const saillanceRank = suivi?.rank ?? rawRank(s.sumQc, sumThresholds);
    const { label: saillanceLabel, cls: saillanceCls } = TIER_BY_RANK[saillanceRank];
    const saillanceCentile = Math.max(1, Math.min(99, centileFrom(s.sumQc, sumThresholds)));
    // Sommet de l'indice cumulé + l'édition où il a été atteint — posés sur la
    // figure du ⓘ à côté du repère « CETTE UNE », sur la même échelle.
    const sommetSum = suivi && suivi.peakSum > s.sumQc ? suivi.peakSum : null;
    const sommetLabel = sommetSum != null && suivi
      ? (() => {
        const p = blockLabelParts(suivi.peakBlock, editionRefDayIso);
        if (!p) return null;
        if (p.dayWord.startsWith("le ")) return p.dayWord;
        // « à 4h ce matin », pas « à 4h » (demande d'Adrien, 2026-08-09). L'heure
        // nue oblige le lecteur à deviner de quelle demi-journée on parle, alors
        // que le module dispose déjà du vocabulaire de moment (SAILLANT_TODAY).
        // Table EXPLICITE plutôt que dérivée : c'est un libellé public, et deux
        // cas s'y refusent — « à minuit cette nuit » et « à midi ce midi » sont
        // des pléonasmes, et « à 4h tôt ce matin » est illisible.
        const MOMENT_AUJ: Record<number, string> = {
          0: "à minuit", 4: "à 4h ce matin", 8: "à 8h ce matin",
          12: "à midi", 16: "à 16h cet après-midi", 20: "à 20h ce soir",
        };
        const MOMENT_HIER: Record<number, string> = {
          0: "hier à minuit", 4: "hier à 4h", 8: "hier matin à 8h",
          12: "hier midi", 16: "hier à 16h", 20: "hier soir à 20h",
        };
        const hh = p.hour % 24;
        if (p.dayWord === "aujourd’hui") return MOMENT_AUJ[hh] ?? `à ${hh}h`;
        if (p.dayWord === "hier") return MOMENT_HIER[hh] ?? `hier à ${hh}h`;
        return `${p.dayWord} à ${hh}h`;
      })()
      : null;
    // A8 (#430) — CE QUI SITUE LA NOUVELLE DANS L'ANNÉE, C'EST SON SOMMET.
    // La valeur du moment ne dit que l'instant : une histoire retombée à 68,4
    // pts (57e centile) reste celle qui a atteint 157,3 pts (96e centile), et
    // c'est ce sommet que le palmarès hebdomadaire classera (aws-refiners#283).
    // Parler du rang de la nouvelle avec le chiffre du moment était FAUX, pas
    // seulement mal cadré. Quand le sommet EST le moment présent, `sommetSum`
    // vaut null et la bulle se rabat sur le centile courant — qui est alors le
    // même nombre, au présent.
    const sommetCentile = sommetSum != null
      ? Math.max(1, Math.min(99, centileFrom(sommetSum, sumThresholds)))
      : null;
    const sommetTier = sommetSum != null
      ? TIER_BY_RANK[rawRank(sommetSum, sumThresholds)].label
      : null;
    // Trajectoire 24 h (#274) : la courbe trace la part d'attention et chaque
    // point porte le niveau que le BADGE affichait à cette édition-là.
    const salienceTrend = buildSalienceTrend(s.series, blockThresholds, editionRefDayIso, suivi?.history, suivi?.sums);

    type RawArticle = { media_id: string; headline_minutes?: number | null };
    let totalHeadlineMinutes = 0;
    try {
      const arts = JSON.parse(e.articles ?? "[]") as RawArticle[];
      for (const art of arts) {
        const mins = Number(art.headline_minutes ?? 0);
        if (Number.isFinite(mins) && mins > 0) totalHeadlineMinutes += mins;
      }
    } catch { }
    const excerpt = e.text?.trim() || null;
    const headlineHours =
      totalHeadlineMinutes > 0 ? Math.max(1, Math.round(totalHeadlineMinutes / 60)) : null;
    const saillantSince =
      firstSeenSaillantLabel(e.first_seen_utc, e.date_montreal_tz) ??
      saillantSinceLabel(e.time_interval_montreal_tz ?? null, headlineHours);

    // Médias QC (Shannon : « médias Qc seulement ») sur toute la fenêtre 24 h,
    // depuis l'agrégat de la story ; lien = dernier article du média (#129).
    const qcCovering = QC_MEDIA.filter((id) => s.qcMedia.has(id));
    const mediaToday = qcCovering.map((id) => ({ name: MEDIA_NAMES[id] ?? id, url: s.urlByMedia[id] ?? null }));

    return {
      title: e.title ?? "",
      excerpt,
      // ISSUE_LABELS_SHORT d'abord : c'est l'orthographe canonique du Polimètre
      // (« Loi et crime », « Santé et politiques sociales »). Le libellé FR du
      // datamart n'est qu'un repli, car l'historique de headline_events_4h porte
      // encore les reformulations écrites par le raffineur avant
      // aws-refiners#258 (« Droit et criminalité »…) : sans cette priorité, une
      // même catégorie s'affiche sous deux noms selon l'âge de l'événement.
      issueFr: ISSUE_LABELS_SHORT[e.main_issue ?? ""] ?? e.main_issue_text_fr ?? "Actualité",
      issueColor: ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E",
      saillanceRank,
      saillanceLabel,
      saillanceCls,
      saillanceCentile,
      timeMtl: e.time_interval_montreal_tz ?? e.time_interval_utc,
      headlineHours,
      saillantSince,
      representativeUrl: e.representative_url ?? null,
      mediaToday,
      qcOutletCount: qcCovering.length,
      totalQcOutlets: QC_MEDIA.length,
      storylineId: e.storyline_id ?? null,
      scoreQcPeak24h: s.peakQc,
      scoreQcSum24h: s.sumQc,
      sommetSum,
      sommetLabel,
      sommetCentile,
      sommetTier,
      nBlocks24h: e.n_blocks_24h ?? null,
      salienceTrend,
      // Grille du BADGE (cumul 24 h) : c'est elle que la figure du ⓘ doit
      // représenter, puisque le repère « CETTE UNE » s'y pose désormais.
      salThresholds: [sumThresholds.faible, sumThresholds.moyenne, sumThresholds.eleve, sumThresholds.tresEleve, sumThresholds.extreme],
      resonanceCan: canResonance(s, totalRoc),
      resonanceUs: usResonance(s, echoesUs, totalUs),
    };
  });

  // Score = convergence au niveau HISTOIRE (windowEventConvergence) — décision
  // ratifiée 2026-07-15 vs cosinus-objet (windowConvergence, conservé pour tests).
  const conv24h = windowEventConvergence(stories);
  // Les deux côtés du radar situent le sujet dans la distribution des cumuls
  // 24 h de SA région (aws-refiners#273, livrée 2026-08-07) ; `roc` reste le
  // repli transitoire si la calibration cumulée manque au JSON.
  const solitudes = buildSolitudes(latest, stories, conv24h, habitualConvPct, habBands, {
    badgeRanks: badgeRanksByStory,
    sumThresholds,
    // Côté ROC aussi, les deux familles ne se mélangent pas. Après le cutover,
    // la grille cumulée a un repli codé (NEW_SUM_ROC_THRESHOLDS) qu'elle n'avait
    // pas avant : sans lui, le radar canadien retomberait sur `roc` — le pic par
    // bloc — donc sur une AUTRE grandeur que le côté québécois, ce qui est
    // exactement le compromis que aws-refiners#273 a fermé.
    sumRocThresholds: SALIENCE_CUTOVER
      ? scaleThresholds(salThresholdsFrom(calibration?.metrics?.salience_index_roc_sum_24h)) ?? NEW_SUM_ROC_THRESHOLDS
      : salThresholdsFrom(calibration?.metrics?.score_roc_sum_24h),
    roc: SALIENCE_CUTOVER
      ? scaleThresholds(salThresholdsFrom(calibration?.metrics?.salience_index_roc)) ?? NEW_BLOCK_ROC_THRESHOLDS
      : salThresholdsFrom(calibration?.metrics?.score_roc),
  });

  const objMap = new Map<string, { score: number; issue: string; color: string; context: string }>();
  for (const e of latest) {
    if (!e.extracted_objects) continue;
    let objects: ExtractedObject[] = [];
    try { objects = JSON.parse(e.extracted_objects) as ExtractedObject[]; } catch { continue; }
    // HORS PÉRIMÈTRE DU CUTOVER, volontairement : ce poids ne sert qu'à ORDONNER
    // et dimensionner les tuiles d'objets entre elles (module 3), jamais à
    // afficher un niveau. Le basculer changerait le classement du Hot 20 sans
    // qu'aucune grille ne l'ait calibré — et ce module a son propre dossier
    // (aws-refiners#283, migration de l'extracteur #206). `score_qc` reste donc
    // projeté par tables.json après la bascule, précisément pour cette ligne.
    const eventWeight = e.score_qc ?? e.score_saillance ?? 0;
    const issueColor = ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E";
    const context = e.title ?? "";
    for (const obj of objects.slice(0, 8)) {
      const name = obj.object.trim();
      if (!name || name.length < 3) continue;
      const weighted = obj.score * eventWeight;
      const existing = objMap.get(name);
      if (!existing || weighted > existing.score) {
        objMap.set(name, { score: existing ? existing.score + weighted : weighted, issue: existing?.issue ?? e.main_issue ?? "", color: issueColor, context: context.length > 0 ? context : existing?.context ?? "" });
      } else { existing.score += weighted; }
    }
  }

  const allObjects = Array.from(objMap.entries())
    .map(([name, data]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), enjeu: ISSUE_LABELS_SHORT[data.issue] ?? "Actualité", color: data.color, context: data.context, score: data.score }))
    .sort((a, b) => b.score - a.score);

  const withTruncContext = allObjects;

  const tier1 = withTruncContext.slice(0, 4);
  const tier2 = withTruncContext.slice(4, 9);
  const tier3 = withTruncContext.slice(9, 14);
  const tier4 = withTruncContext.slice(14, 18);
  const topScore = allObjects[0]?.score ?? 1;
  const treemapMobile = withTruncContext.slice(0, 14).map((o) => ({ ...o, relWidth: Math.round((o.score / topScore) * 100) }));

  return { dateLabel, lastUpdated, snapshotInterval, periodLabel, top3, solitudes, treemapTier1: tier1, treemapTier2: tier2, treemapTier3: tier3, treemapTier4: tier4, treemapMobile };
});

const ISSUE_KEYS = Object.keys(ISSUE_COLORS);
const PASS_ORDER: Record<string, number> = { am: 0, noon: 1, pm: 2 };

async function loadIssueScores(period: "day" | "week" | "month"): Promise<Array<Record<string, unknown>> | null> {
  const filePath = path.resolve(process.cwd(), "public", "data", "refined", period, `issues_score_${period}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Array<Record<string, unknown>>;
  } catch { return null; }
}

function latestIssueRow(rows: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => {
    const tA = (a.tag as string) ?? "";
    const tB = (b.tag as string) ?? "";
    if (tB !== tA) return tB.localeCompare(tA);
    const dA = (a.date_utc as string) ?? "";
    const dB = (b.date_utc as string) ?? "";
    if (dB !== dA) return dB.localeCompare(dA);
    const passDiff = (PASS_ORDER[b.pass as string] ?? 0) - (PASS_ORDER[a.pass as string] ?? 0);
    if (passDiff !== 0) return passDiff;
    const metaA = (a.issues_meta as string) ?? "{}";
    const metaB = (b.issues_meta as string) ?? "{}";
    if (metaB !== "{}" && metaA === "{}") return 1;
    if (metaA !== "{}" && metaB === "{}") return -1;
    return 0;
  })[0] ?? null;
}

type IssueMetaEntry = { label: string; obj: string; url?: string };
type IssuesMeta = Record<string, IssueMetaEntry>;

function parseIssuesMeta(raw: unknown): IssuesMeta | null {
  if (!raw || typeof raw !== "string" || raw === "{}") return null;
  try { return JSON.parse(raw) as IssuesMeta; } catch { return null; }
}

// Les objets extraits (ex: « accord états-unis-iran ») sont en minuscules et
// désignent presque toujours une entité nommée (pays, personne, organisation).
// Une simple capitalisation de la première lettre laissait « Accord
// états-unis-iran » — on met en majuscule chaque mot (espace ou tiret) (#161).
function capitalizeObject(s: string): string {
  if (s.length === 0) return s;
  return s.replace(/(^|[\s-])(\p{Ll})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

type FallbackEntry = { topObject: string; context: string; url: string | null };

async function loadFallbackIssueContent(): Promise<Map<string, FallbackEntry>> {
  const map = new Map<string, FallbackEntry>();
  let rawEvents: string;
  try { rawEvents = await fs.readFile(DATA_PATH, "utf8"); } catch { return map; }
  const allRaw = JSON.parse(rawEvents) as RawEvent[];

  const unique = uniqueQcEvents(allRaw);

  const bestByIssue = new Map<string, RawEvent>();
  for (const e of unique) {
    const key = e.main_issue ?? "";
    const existing = bestByIssue.get(key);
    if (!existing || (e.score_qc ?? 0) > (existing.score_qc ?? 0)) bestByIssue.set(key, e);
  }
  for (const [issueKey, e] of bestByIssue) {
    let topObject = "";
    if (e.extracted_objects) {
      try {
        const objs = JSON.parse(e.extracted_objects) as ExtractedObject[];
        const raw = objs[0]?.object?.trim() ?? "";
        if (raw.length >= 2) topObject = capitalizeObject(raw);
      } catch { }
    }
    map.set(issueKey, { topObject, context: e.title ?? "", url: e.representative_url ?? null });
  }
  return map;
}

// Actualités récentes par enjeu (storylines distinctes). Chaque actualité conserve
// ses propres médias et URLs : une union au niveau de l'enjeu attribuerait à tort
// des médias d'une autre actualité à la manchette affichée.
type IssueMedia = {
  articles: TreemapIssueTile["articles"];
};

const QC_MEDIA_DOMAINS: Record<string, string> = {
  "lapresse.ca": "La Presse",
  "ledevoir.com": "Le Devoir",
  "radio-canada.ca": "Radio-Canada",
  "tvanouvelles.ca": "TVA Nouvelles",
  "journaldemontreal.com": "Journal de Montréal",
  "montrealgazette.com": "Montreal Gazette",
};

type RawIssueArticle = { media_id?: string; url?: string };

function parseIssueArticles(raw: string | null | undefined): RawIssueArticle[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed as RawIssueArticle[] : [];
  } catch {
    return [];
  }
}

function outletFromUrl(url: string | null): { name: string; url: string } | null {
  if (!url) return null;
  for (const [domain, name] of Object.entries(QC_MEDIA_DOMAINS)) {
    if (url.includes(domain)) return { name, url };
  }
  return null;
}

function buildIssueMedia(allRaw: RawEvent[]): Map<string, IssueMedia> {
  const map = new Map<string, IssueMedia>();
  const unique = uniqueQcEvents(allRaw);
  const byIssue = new Map<string, RawEvent[]>();
  for (const e of unique) {
    const key = e.main_issue ?? "";
    if (!key) continue;
    if (!byIssue.has(key)) byIssue.set(key, []);
    byIssue.get(key)!.push(e);
  }

  for (const [issueKey, events] of byIssue) {
    const sorted = [...events].sort((a, b) => (b.score_qc ?? 0) - (a.score_qc ?? 0));
    const seen = new Set<string>();
    const list: TreemapIssueTile["articles"] = [];
    for (const e of sorted) {
      const title = (e.title ?? "").trim();
      if (!title) continue;

      const dedupKey = e.storyline_id ?? e.representative_url ?? title;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const rawArticles = [
        ...parseIssueArticles(e.articles_24h),
        ...parseIssueArticles(e.articles),
      ];
      const urlByMedia = new Map<string, string>();
      for (const article of rawArticles) {
        if (article.media_id && article.url && QC_MEDIA.includes(article.media_id) && !urlByMedia.has(article.media_id)) {
          urlByMedia.set(article.media_id, article.url);
        }
      }

      let ids = parseIdList(e.media_ids_24h).filter((id) => QC_MEDIA.includes(id));
      if (ids.length === 0) ids = parseIdList(e.media_ids_qc).filter((id) => QC_MEDIA.includes(id));
      if (ids.length === 0) ids = parseIdList(e.media_ids).filter((id) => QC_MEDIA.includes(id));
      if (ids.length === 0) ids = [...urlByMedia.keys()];
      const idSet = new Set(ids);
      let outlets = QC_MEDIA
        .filter((id) => idSet.has(id))
        .map((id) => ({ name: MEDIA_NAMES[id] ?? id, url: urlByMedia.get(id) ?? null }));

      const url = e.representative_url ?? outlets.find((outlet) => outlet.url)?.url ?? null;
      if (outlets.length === 0) {
        const fallbackOutlet = outletFromUrl(url);
        if (fallbackOutlet) outlets = [fallbackOutlet];
      }
      list.push({ title, url, outlets });
    }
    map.set(issueKey, { articles: list });
  }
  return map;
}

async function loadArticlesByIssue(): Promise<Map<string, IssueMedia>> {
  let rawEvents: string;
  try { rawEvents = await fs.readFile(DATA_PATH, "utf8"); } catch { return new Map(); }
  return buildIssueMedia(JSON.parse(rawEvents) as RawEvent[]);
}

export async function loadTreemap(): Promise<TreemapAllPeriods | null> {
  const [dayRows, weekRows, monthRows, fallbackContent, articlesByIssue] = await Promise.all([
    loadIssueScores("day"),
    loadIssueScores("week"),
    loadIssueScores("month"),
    loadFallbackIssueContent(),
    loadArticlesByIssue(),
  ]);

  function buildPeriodData(rows: Array<Record<string, unknown>> | null): TreemapPeriodData | null {
    if (!rows) return null;
    const latest = latestIssueRow(rows);
    if (!latest) return null;
    const dateStr = (latest.date_montreal_tz as string) ?? (latest.date_utc as string) ?? "";
    const dateLabel = formatDateFr(dateStr);
    const lastUpdated = lastUpdatedLabel(dateStr);
    const meta = parseIssuesMeta(latest.issues_meta);

    const latestTag = (latest.tag as string) ?? "";
    const periodRows = latestTag
      ? rows.filter((r) => (r.tag as string) === latestTag)
      : [latest];
    const aggregated = ISSUE_KEYS.reduce<Record<string, number>>((acc, key) => {
      acc[key] = periodRows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
      return acc;
    }, {});

    // Bloc (tag) précédent, pour la croissance de saillance (vue Aujourd'hui).
    const prevRows = latestTag ? rows.filter((r) => (r.tag as string) !== latestTag) : [];
    const prevLatest = prevRows.length > 0 ? latestIssueRow(prevRows) : null;
    const prevTag = prevLatest ? ((prevLatest.tag as string) ?? "") : "";
    const prevPeriodRows = prevTag ? prevRows.filter((r) => (r.tag as string) === prevTag) : [];
    const prevAggregated = ISSUE_KEYS.reduce<Record<string, number>>((acc, key) => {
      acc[key] = prevPeriodRows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
      return acc;
    }, {});

    const scored = ISSUE_KEYS.map((issueKey) => ({ issueKey, score: aggregated[issueKey] ?? 0 })).sort((a, b) => b.score - a.score);
    const maxScore = scored[0]?.score || 1;
    const tiles: TreemapIssueTile[] = scored.map(({ issueKey, score }) => {
      let topObject = ""; let context = "";
      const metaEntry = meta?.[issueKey];
      const hasMetaContent = metaEntry && (metaEntry.obj?.length > 0 || metaEntry.label?.length > 0);
      const fb = fallbackContent.get(issueKey);
      let url: string | null = null;
      if (hasMetaContent) {
        const obj = metaEntry.obj ?? "";
        topObject = obj.length > 0 ? capitalizeObject(obj) : "";
        context = metaEntry.label ?? "";
        url = metaEntry.url ?? null;
      } else {
        topObject = fb?.topObject ?? "";
        context = fb?.context ?? "Aucune actualité saillante sur cette période.";
        url = fb?.url ?? null;
      }
      let articles = articlesByIssue.get(issueKey)?.articles ?? [];
      if (articles.length === 0 && context) {
        const fallbackOutlet = outletFromUrl(url);
        articles = [{ title: context, url, outlets: fallbackOutlet ? [fallbackOutlet] : [] }];
      }
      const prevScore = prevAggregated[issueKey] ?? 0;
      const velocity = score > prevScore ? 1 : score < prevScore ? -1 : 0;
      const growth = prevScore > 0 ? ((score - prevScore) / prevScore) * 100 : null;
      return { issueKey, issueFr: ISSUE_LABELS_SHORT[issueKey] ?? issueKey, color: ISSUE_COLORS[issueKey] ?? "#463E3E", score, relScore: Math.round((score / maxScore) * 100), topObject, context, url, velocity, growth, articles };
    });

    // Historique du rang de chaque enjeu, un point par tag (pour le graphique de rang).
    const groupedByTag: Record<string, typeof rows> = {};
    for (const r of rows) {
      const tag = (r.tag as string) ?? "";
      if (!tag) continue;
      if (!groupedByTag[tag]) groupedByTag[tag] = [];
      groupedByTag[tag].push(r);
    }
    const history: TreemapHistoryPoint[] = Object.keys(groupedByTag)
      .sort((a, b) => a.localeCompare(b))
      .map((tag) => {
        const tagRows = groupedByTag[tag];
        const date = (tagRows[0].date_montreal_tz as string) ?? (tagRows[0].date_utc as string) ?? "";
        const ranked = ISSUE_KEYS.map((key) => ({
          key,
          score: tagRows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0),
        })).sort((a, b) => b.score - a.score);
        const ranks: Record<string, number> = {};
        ranked.forEach((e, i) => { ranks[e.key] = i + 1; });
        return { date, ranks };
      });

    return { tiles, dateLabel, lastUpdated, history };
  }

  const day = buildPeriodData(dayRows);
  if (!day) return null;
  return { day, week: buildPeriodData(weekRows) ?? day, month: buildPeriodData(monthRows) ?? day };
}

// Exports réservés aux tests unitaires (pipeline interne ; pas l'API publique).
export const __test__ = {
  ISSUE_LABELS_SHORT,
  latestIssueRow,
  parseIssuesMeta,
  capitalizeObject,
  firstSeenSaillantLabel,
  dedupeByStoryline,
  pctile,
  rocScore,
  qcScore,
  convMode,
  relScore,
  solitudesEdito,
  symbolPositions,
  buildSolitudes,
  storiesFrom24h,
  buildSalienceTrend,
  selectTopUnes,
  MIN_QC_MEDIA_SECONDARY,
  MIN_PART_DU_MENEUR,
  windowConvergence,
  windowEventConvergence,
  salThresholdsFrom,
  centileFrom,
  hintFromCentile,
  calConvFrom,
  SAL_QC_THRESHOLDS,
  SUM_QC_THRESHOLDS,
  rawRank,
  badgeRanks,
  uniqueQcEvents,
  canResonance,
  usResonance,
  usEchoes,
  window24hBlocks,
  blockKey,
  titleTokens,
  sameStory,
  buildIssueMedia,
  CAL_CONV,
};
