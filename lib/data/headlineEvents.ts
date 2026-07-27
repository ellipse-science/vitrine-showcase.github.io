// Build-time loader for Une des unes, Deux solitudes, and Treemap sections.
//
// Reads /public/data/headline-events.json, deduplicates by event_id
// (preferring QC target_region), filters US-only events, and pre-computes
// every value the UI needs.

import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import { editionLabel } from "@/lib/editions";
import { formatDateFr, lastUpdatedLabel, publicationHourFromInterval } from "@/lib/dates";

const DATA_PATH = path.resolve(
  process.cwd(),
  "public",
  "data",
  "headline-events.json",
);

// ── Raw JSON shape ──────────────────────────────────────────────────────────

type RawEvent = {
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
  // Canada absorbe les USA. Le repli transitoire soustrait tant que score_roc
  // n'est pas publié (≤ 1 rafraîchissement de 4 h après le déploiement de
  // #237). coverage_* et media_ids_qc/roc arrivent avec le refiner #211.
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
};

type ExtractedObject = { object: string; score: number };

const ISSUE_COLORS: Record<string, string> = {
  economy_and_labour: "#742630",
  governments_and_governance: "#6F5828",
  health_and_social_services: "#7D5358",
  environment_and_energy: "#5F6E36",
  rights_liberties_minorities_discrimination: "#5F4E78",
  culture_and_nationalism: "#35604E",
  education: "#7A5A23",
  international_affairs_and_defense: "#304860",
  law_and_crime: "#463E3E",
  public_lands_and_agriculture: "#7D5132",
  immigration: "#8B6914",
  technology: "#3A5F70",
};

const ISSUE_LABELS_SHORT: Record<string, string> = {
  economy_and_labour: "Économie et travail",
  governments_and_governance: "Gouvernements",
  health_and_social_services: "Santé",
  environment_and_energy: "Environnement",
  rights_liberties_minorities_discrimination: "Droits et libertés",
  culture_and_nationalism: "Culture",
  education: "Éducation",
  international_affairs_and_defense: "Aff. internationales",
  law_and_crime: "Loi et crime",
  public_lands_and_agriculture: "Terres publiques",
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
};

// Sigle court affiché dans le badge carré du radar (Deux solitudes).
const MEDIA_BADGE: Record<string, string> = {
  LED: "LD", LAP: "LP", RCI: "RC", TVA: "TVA", JDM: "JdM", MG: "MG",
  CBC: "CBC", CTV: "CTV", GN: "GN", TTS: "TS", GAM: "GM", NP: "NP", VS: "VS",
};

const QC_MEDIA = ["LED", "LAP", "RCI", "TVA", "JDM", "MG"];
// Médias US — exclus du côté « Canada » dans le repli transitoire (avant que
// media_ids_roc soit publié par le refiner #211) pour ne pas afficher une
// source américaine comme canadienne.
const US_MEDIA = ["FXN", "CNN", "NYT", "WAP", "FOX"];

// ── Deux solitudes — calibration de la JAUGE de convergence (échelle relative) ─
// L'axe du radar utilise une part d'attention 24 h (voir buildSolitudes), pas de
// calibration. Seule la jauge « plus/moins que d'habitude » a besoin d'une
// distribution : CAL_CONV mappe l'indice de convergence (0-100) vers son
// percentile. PROVISOIRE — dérivée des bandes 13 mois du red-team (Divergence
// 63 % · Div. part. 17 % · Conv. part. 13 % · Convergence 7 %, médiane 14) :
// conv=14→p50, 25→p63, 50→p80, 75→p93.
// Depuis cette PR, CAL_CONV n'est plus que le REPLI : quand la calibration
// glissante publiée (salience_calibration.json) est présente, la jauge se cale
// sur sa vraie distribution (cf. bloc « Calibration glissante publiée » ci-dessous
// et calConvFrom). Le prototype 13 mois reste le défaut tant que le fichier
// manque ou qu'une métrique est absente. Suivi refiner = aws-refiners#212.
const CAL_CONV: [number, number][] = [[0, 0], [14, 50], [25, 63], [50, 80], [75, 93], [100, 100]];

// Repère « habituel » de la jauge = convergence EVENT-level MÉDIANE (là où se
// place le marqueur en temps normal). ATTENTION : c'est la médiane du score au
// niveau HISTOIRE (windowEventConvergence), PAS la métrique `convergence` de la
// calibration glissante, qui reste l'ancienne convergence OBJET (interval_convergence_score,
// médiane ≈ 3 %). Mesuré le 2026-07-15 en rejouant le VRAI code du loader
// (dédup par event_id avec préférence QC + filtre country_id≠USA, puis
// storiesFrom24h + windowEventConvergence) sur chaque fenêtre glissante 24 h de
// l'historique DEV (headline_events_4h, 2026-05-14 → 2026-07-15, 323 fenêtres) :
// p50 = 31 % (p20=16, p80=42 ; fenêtre la plus récente = 37). NB : sans la dédup
// event_id ni le filtre USA, on obtient 41 % — c'est ce que la PROD affiche
// aujourd'hui (le JSON prod n'a pas encore score_roc/score_us, donc roc=saillance−qc
// inclut les USA, bug #237/#211) ; le marqueur live s'alignera sur l'échelle
// « propre » quand #211 sera déployé. PROVISOIRE jusqu'à ce que la calibration
// glissante publie `event_convergence` (suivi backend) : dès qu'elle existe, on
// prend son p50 (cf. loader) ; ce p50 doit être calculé AVEC la dédup + le filtre
// USA, sinon il vaudra ~41 au lieu de ~31.
const HABITUAL_EVENT_CONV = 31;

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
// HISTOIRE (windowEventConvergence) — PAS ENCORE publiée par fetch_data.R ;
// quand elle le sera, son p50 remplacera HABITUAL_EVENT_CONV pour le repère
// « habituel » (suivi backend).
type Calibration = { window_days?: number; computed_utc?: string; metrics?: { score_qc?: CalMetric; score_qc_peak_24h?: CalMetric; score_roc?: CalMetric; convergence?: CalMetric; event_convergence?: CalMetric } };

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

// Saillance ROC (Canada hors Québec, sans les USA). Repli par soustraction
// UNIQUEMENT tant que la colonne score_roc n'est pas publiée (≤ 1 rafraîchissement
// de 4 h après #237) : on soustrait score_qc ET score_us (quand dispo) pour ne
// PAS réabsorber les USA côté Canada. À retirer une fois score_roc publié.
function rocScore(e: RawEvent): number {
  return e.score_roc ?? Math.max(0, (e.score_saillance ?? 0) - (e.score_qc ?? 0) - (e.score_us ?? 0));
}

// Positions des symboles sur l'axe : collés au centre quand ça converge,
// aux extrémités quand ça diverge. gap min 18 % pour ne pas les superposer.
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
  sumQc: number;           // Σ score_qc pondérée par récence (demi-vie HALF_LIFE_H) — sert au CLASSEMENT
  sumRoc: number;
  peakQc: number;          // max score_qc BRUT sur la fenêtre — sert à la PASTILLE de saillance
  peakRoc: number;         // (même échelle que le score de bloc → seuils inchangés)
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
  series: { blockUtc: string; qc: number; present: boolean; share: number }[];
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

function storiesFrom24h(allEvents: RawEvent[]): Story[] {
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
    const qc = e.score_qc ?? 0;
    const roc = rocScore(e);
    const qcIds = e.media_ids_qc !== undefined
      ? parseIdList(e.media_ids_qc)
      : parseIdList(e.media_ids).filter((id) => QC_MEDIA.includes(id));
    const canIds = e.media_ids_roc !== undefined
      ? parseIdList(e.media_ids_roc)
      : parseIdList(e.media_ids).filter((id) => !QC_MEDIA.includes(id) && !US_MEDIA.includes(id));
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
    s.series = windowBlocksAsc.map((b) => {
      const qc = s.byBlock.get(b) ?? 0;
      const tot = blockTotalQc.get(b) ?? 0;
      return { blockUtc: b, qc, present: s.byBlock.has(b), share: tot > 0 ? (qc / tot) * 100 : 0 };
    });
  }
  return merged.filter((s) => s.sumQc + s.sumRoc > 0);
}

// Convergence OBJET sur la fenêtre glissante 24 h (mêmes 6 blocs que
// storiesFrom24h) : moyenne des indices de convergence des blocs, PONDÉRÉE par
// l'attention de chaque bloc (Σ score_qc + ROC) — un bloc creux ne pèse pas
// autant qu'un bloc chargé. Comme le radar et la Une, le grand chiffre couvre
// donc les 24 h, plus un seul bloc de 4 h (décision d'équipe 2026-07-14, Y3).
// null si aucun bloc de la fenêtre n'a d'indice publié → repli en aval.
// PROVISOIRE : la convergence glissante « officielle » viendra du refiner (aws-refiners#212).
function windowConvergence(allEvents: RawEvent[]): number | null {
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
    b.wt += (e.score_qc ?? 0) + rocScore(e);
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

function buildSolitudes(latest: RawEvent[], stories: Story[], conv24h: number | null, habitualConvPct: number = HABITUAL_EVENT_CONV): SolitudeData {
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
  const [qcSymbolPos, canSymbolPos] = symbolPositions(convPct);

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
    return {
      label: a.label,
      eyebrow: ISSUE_LABELS_SHORT[a.rep.main_issue ?? ""] ?? null,
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
    // Le grand chiffre = le camp qui gagne (divergence si divPct l'emporte, sinon
    // convergence). Cohérent avec les flèches/logos et avec l'échelle absolue : le
    // marqueur à gauche du milieu = divergent, sa position vs « habituel » nuance.
    scoreValue: convPct < 50 ? divPct : convPct,
    verb: convPct < 50 ? "divergence" : "convergence",
    modeWord: mode.word, modeCls: mode.cls,
    habitualConvPct,
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
function saillanceTierFromScore(scoreQc: number | null, thresholds: typeof SAL_QC_THRESHOLDS = SAL_QC_THRESHOLDS): { label: string; cls: string; rank: number; hint: string } {
  const s = scoreQc ?? 0;
  if (s >= thresholds.extreme)   return { label: "Exceptionnelle",     cls: "s-extreme",     rank: 6, hint: "Plus saillante que 95 % des nouvelles à la Une." };
  if (s >= thresholds.tresEleve) return { label: "Très élevée", cls: "s-tres-eleve",  rank: 5, hint: "Plus saillante qu’environ 85 % des nouvelles à la Une." };
  if (s >= thresholds.eleve)     return { label: "Élevée",      cls: "s-eleve",       rank: 4, hint: "Plus saillante qu’environ 65 % des nouvelles à la Une." };
  // « Modérée » (et non « Moyenne ») : cette bande (p20-p50) est ENTIÈREMENT sous
  // la médiane ; avec 6 bandes paires, aucune n'EST le centre. Éviter « Moyenne »,
  // qui laisse croire à tort que c'est le niveau typique (retour M-A Martel, #35).
  // Le `cls` reste s-moyenne (le CSS s'appuie dessus, label ≠ classe).
  if (s >= thresholds.moyenne)   return { label: "Modérée",     cls: "s-moyenne",     rank: 3, hint: "Environ 65 % des nouvelles à la Une sont plus saillantes que celle-ci." };
  if (s >= thresholds.faible)    return { label: "Faible",      cls: "s-faible",      rank: 2, hint: "Environ 85 % des nouvelles à la Une sont plus saillantes que celle-ci." };
  return { label: "Très faible", cls: "s-tres-faible", rank: 1, hint: "95 % des nouvelles à la Une sont plus saillantes que celle-ci." };
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
// PROVISOIRE : à publier par fetch_data.R (metrics.score_qc_sum_24h) au même
// titre que score_qc_peak_24h — ici en dur le temps de l'essai.
const SUM_QC_THRESHOLDS = { faible: 21.4, moyenne: 31.0, eleve: 47.9, tresEleve: 102.4, extreme: 192.8 };

// Hystérésis : sans elle le badge change de bande une édition sur deux (mesuré :
// 52 % des transitions, dont 5,6 % de sauts de 2 bandes). Il faut dépasser la
// frontière de HYST_MARGIN pour que le libellé bouge ; sinon on garde le niveau
// de l'édition précédente. Les allers-retours de frontière disparaissent, la
// vraie décroissance passe.
const HYST_MARGIN = 0.08;

const TIER_BY_RANK: Record<number, { label: string; cls: string; hint: string }> = {
  6: { label: "Exceptionnelle", cls: "s-extreme", hint: "Plus saillante que 95 % des nouvelles à la Une." },
  5: { label: "Très élevée", cls: "s-tres-eleve", hint: "Plus saillante qu’environ 85 % des nouvelles à la Une." },
  4: { label: "Élevée", cls: "s-eleve", hint: "Plus saillante qu’environ 65 % des nouvelles à la Une." },
  3: { label: "Modérée", cls: "s-moyenne", hint: "Environ 65 % des nouvelles à la Une sont plus saillantes que celle-ci." },
  2: { label: "Faible", cls: "s-faible", hint: "Environ 85 % des nouvelles à la Une sont plus saillantes que celle-ci." },
  1: { label: "Très faible", cls: "s-tres-faible", hint: "95 % des nouvelles à la Une sont plus saillantes que celle-ci." },
};

// Bornes basses des bandes, du rang 1 au rang 6 (rang 1 = pas de borne basse).
const bandLow = (t: typeof SUM_QC_THRESHOLDS) =>
  [-Infinity, -Infinity, t.faible, t.moyenne, t.eleve, t.tresEleve, t.extreme];

function rawRank(v: number, t: typeof SUM_QC_THRESHOLDS): number {
  const low = bandLow(t);
  for (let r = 6; r >= 2; r--) if (v >= low[r]) return r;
  return 1;
}

// Niveau affiché = niveau brut, SAUF si le changement n'a pas franchi la
// frontière avec la marge — auquel cas on conserve le niveau précédent.
function hysteresisRank(prev: number | undefined, v: number, t: typeof SUM_QC_THRESHOLDS): number {
  const raw = rawRank(v, t);
  if (prev === undefined || raw === prev) return raw;
  const low = bandLow(t);
  if (raw > prev) {
    // Monte : il faut dépasser la borne basse de la bande visée d'une marge.
    return v >= low[raw] * (1 + HYST_MARGIN) ? raw : prev;
  }
  // Descend : il faut passer sous la borne basse de la bande QUITTÉE d'une marge.
  return v <= low[prev] * (1 - HYST_MARGIN) ? raw : prev;
}

// L'hystérésis a besoin du niveau de l'édition PRÉCÉDENTE. Le site est rebâti
// à neuf toutes les 4 h, sans état persistant — on le reconstitue donc en
// rejouant les éditions du snapshot (3 jours ≈ 18 fenêtres), du plus ancien au
// plus récent. Déterministe : même snapshot → même badge, sans fichier d'état.
function badgeRanksWithHysteresis(
  events: RawEvent[],
): Map<string, { rank: number; peakSum: number; peakBlock: string; history: Map<string, number> }> {
  const blocks = Array.from(new Set(events.map(blockKey))).sort();
  const byBlock = new Map<string, RawEvent[]>();
  for (const e of events) {
    const b = blockKey(e);
    if (!byBlock.has(b)) byBlock.set(b, []);
    byBlock.get(b)!.push(e);
  }
  const out = new Map<string, { rank: number; peakSum: number; peakBlock: string; history: Map<string, number> }>();
  for (let i = 0; i < blocks.length; i++) {
    const rows = blocks.slice(Math.max(0, i - 5), i + 1).flatMap((b) => byBlock.get(b) ?? []);
    if (rows.length === 0) continue;
    for (const s of storiesFrom24h(rows)) {
      const key = s.rep.storyline_id ?? s.label;
      const prev = out.get(key);
      // La même passe sert au SOMMET de l'indice cumulé : la plus haute valeur
      // que ce badge ait atteinte, et l'édition où c'est arrivé. Elle vit sur la
      // MÊME échelle que la valeur courante — donc plaçable sur la même figure.
      const peakSum = Math.max(prev?.peakSum ?? 0, s.sumQc);
      const peakBlock = !prev || s.sumQc > prev.peakSum ? blocks[i] : prev.peakBlock;
      const rank = hysteresisRank(prev?.rank, s.sumQc, SUM_QC_THRESHOLDS);
      // …et à l'HISTORIQUE du badge, édition par édition : c'est lui qu'affiche
      // le survol de la trajectoire, pour que le niveau lu sur un point soit le
      // niveau que le badge portait à ce moment-là — même grandeur, même échelle.
      const history = prev?.history ?? new Map<string, number>();
      history.set(blocks[i], rank);
      out.set(key, { rank, peakSum, peakBlock, history });
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
// Une SECONDAIRE doit être portée par au moins MIN_QC_MEDIA_SECONDARY médias
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
  // Héros toujours affiché ; une Une SECONDAIRE doit être portée par ≥
  // MIN_QC_MEDIA_SECONDARY médias QC (seuil éditorial #273 conservé). On tronque au
  // top-3 par saillance cumulée SANS repêcher (le pool est partagé avec le radar).
  const eligible = stories.filter((s) => s.qcMedia.size > 0 && s.sumQc > 0);
  return eligible
    .sort((a, b) => b.sumQc - a.sumQc)
    .slice(0, max)
    .filter((s, i) => i === 0 || s.qcMedia.size >= MIN_QC_MEDIA_SECONDARY);
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
  // Espace fine insécable avant « h » (norme typographique française).
  if (dayDiff <= 0) return `${SAILLANT_TODAY[snapped]}, ${snapped} h`;
  if (dayDiff === 1) return `${SAILLANT_YESTERDAY[snapped]}, ${snapped} h`;
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
  // Espace fine insécable avant « h » (norme typographique française).
  return `${part}, ${snapped} h`;
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
  levelCls: string;    // « s-extreme » (couleur de bande)
  /** Palier de saillance du bloc, 1 (Très faible) → 6 (Exceptionnelle) ; 0 si la
   *  nouvelle n'était pas à la Une. Pilote le DIAMÈTRE du point sur la courbe. */
  rank: number;
  score: number;       // score_qc du bloc, arrondi
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

// Étiquette d'un bloc en heure de Montréal, relative à la date du bloc affiché
// (même logique que firstSeenSaillantLabel). Renvoie le mot-jour, le moment de
// la journée et l'heure de PUBLICATION du bloc (fin + 1 h, réforme #195).
function blockLabelParts(blockUtc: string, blockDateMtl: string | null):
  { dayWord: string; moment: string; hour: number } | null {
  if (!blockDateMtl) return null;
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
  const pubHour = isMidnight ? 24 : pubHourReal;   // {8,12,16,20,minuit,4}
  const anchorIso = isMidnight ? mtlDateAndHour(t).dateIso : pubDateIso;
  const blockDay = isoDay(anchorIso), refDay = isoDay(blockDateMtl);
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
  series: { blockUtc: string; qc: number; present: boolean; share: number }[],
  thresholds: typeof SAL_QC_THRESHOLDS,
  blockDateMtl: string | null,
  /** Niveau du BADGE édition par édition. Quand il est fourni, c'est lui qui
   *  étiquette les points — sinon le survol annoncerait un niveau calculé sur
   *  une autre grandeur (le score du bloc) et une autre échelle que la pastille,
   *  et les deux se contrediraient à l'écran. */
  badgeHistory?: Map<string, number>,
): SalienceTrend | null {
  if (series.length < 2 || series.every((p) => p.qc <= 0)) return null;
  const vals = series.map((p) => p.qc);
  // Sommet marqué sur la courbe = sommet de la PART d'attention, puisque c'est
  // elle que la courbe trace (essai #304). Le badge, lui, reste au sommet du
  // SCORE : deux repères distincts, sur deux objets explicitement distincts.
  let peakIdx = 0;
  for (let i = 1; i < series.length; i++) if (series[i].share > series[peakIdx].share) peakIdx = i;
  const firstIdx = series.findIndex((p) => p.qc > 0);
  // Tendance = variation de la part d'attention QC depuis le bloc précédent
  // (bloc courant − bloc précédent, en points). Bornée [−100, +100], cohérente
  // avec Deux solitudes ; toujours affichée (0 = stable, avec symbole =).
  const deltaPct = Math.round(series[series.length - 1].share - series[series.length - 2].share);

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
  const shares = series.map((p) => p.share);
  const maxShare = Math.max(...shares);
  const maxAvant = Math.max(...shares.slice(0, last));
  const part = Math.round(series[last].share);

  // Heure d'un bloc. Deux formes, selon la préposition qui précède (Adrien) :
  //   avecA = true  → « à 16 h », « hier à minuit »   (après « Sommet », « arrivée »)
  //   avecA = false → « 16 h », « hier 20 h »          (après « depuis »)
  // TOUJOURS une heure, jamais le moment de la journée : « depuis cet
  // après-midi » était plus vague que « depuis 16 h » pour le même nombre de
  // signes, et la grille d'éditions est déjà horaire.
  const heure = (i: number, avecA = true) => {
    const p = blockLabelParts(series[i].blockUtc, blockDateMtl);
    if (!p) return null;
    const h = p.hour >= 24 ? "minuit" : `${p.hour} h`;
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
  const reculSommet = Math.round(Math.max(0, Math.round(series[peakIdx].share) - part));
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
    const parts = blockLabelParts(p.blockUtc, blockDateMtl);
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
      : `${parts.dayWord} ${parts.hour >= 24 ? "minuit" : `${parts.hour} h`}`;
    return {
      timeLabel,
      // « Hors du radar » plutôt que « Pas à la Une » (Adrien) : le clin d'œil à
      // Radar+ dit l'absence de couverture sans nier que la carte EST une Une.
      level: tier ? tier.label : "Hors du radar",
      levelCls: tier ? tier.cls : "s-absent",
      rank: tier ? (badgeRank ?? (tier as { rank?: number }).rank ?? 0) : 0,
      score: Math.round(p.qc),
      share: Math.round(p.share),
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
  /** Explication relative du niveau, en pourcentage (cf. saillanceTierFromScore). */
  saillanceHint: string;
  /** Poids visuel du badge selon l'écart au sommet 24 h (essai) : 0 = plein,
   *  1 = atténué, 2 = contour seul. Le libellé et la taille ne changent JAMAIS. */
  saillanceFade: 0 | 1 | 2;
  /** Badge « EN CE MOMENT » : niveau au bloc COURANT, sur la même règle que le
   *  badge « SOMMET 24 H » — il ne peut donc jamais le dépasser.
   *  « Pas à la Une » quand l'histoire est absente du bloc courant. */
  liveLabel: string;
  liveCls: string;
  liveRank: number;
  /** « nouveau » = première apparition de la fenêtre 24 h à ce bloc ; « retour » =
   *  absente au bloc précédent, déjà vue avant ; null = continuité. */
  freshness: "nouveau" | "retour" | null;
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
  /** Nombre de blocs 4h (≤ 7) où la storyline figurait parmi les Unes. */
  nBlocks24h: number | null;
  /** Trajectoire de saillance sur 24 h (#274) : flèche + libellé de tendance +
   *  courbe survolable. null si rien à raconter (un seul bloc actif). */
  salienceTrend: SalienceTrend | null;
  /** Seuils de saillance en vigueur [p5, p20, p50, p80, p95] — pour situer la
   *  nouvelle sur la courbe de distribution dans la bulle ⓘ (#274). */
  salThresholds: number[];
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
  /** Médias couvrants + lien vers leur dernier article sur le sujet.
   *  `region` colore la pastille (bleu QC / rouge CAN) : un sujet couvert des
   *  deux côtés montre les deux couleurs. */
  media: { id: string; name: string; badge: string; url: string | null; region: "qc" | "can" }[];
};

export type SolitudeData = {
  /** Divergence affichée (0-100) = 100 − convergence. */
  divPct: number;
  convPct: number;
  /** Le grand chiffre + son verbe (« divergence » / « convergence »). */
  scoreValue: number;
  verb: "divergence" | "convergence";
  /** Niveau + classe de couleur (4 seuils 25/50/75 sur la convergence). */
  modeWord: string;
  modeCls: string;
  /** Position du repère « habituel » sur l'échelle absolue (= convergence
   *  event-level médiane, en %). Le marqueur live est à `convPct` ; sa position
   *  vs `habitualConvPct` dit si aujourd'hui est plus/moins convergent que d'ordinaire. */
  habitualConvPct: number;
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
  /** Actualités récentes liées à l'enjeu (headline-events), pour le panneau « À la une ». */
  articles: { title: string; url: string | null }[];
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
export const loadHeadlineEvents = cache(async (): Promise<HeadlineData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_PATH, "utf8");
  } catch {
    return null;
  }

  const all = JSON.parse(raw) as RawEvent[];

  const byId = new Map<string, RawEvent>();
  for (const e of all) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") {
      byId.set(e.event_id, e);
    }
  }
  const unique = Array.from(byId.values()).filter((e) => e.country_id !== "USA");

  if (unique.length === 0) return null;

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

  const dateLabel = formatDateFr(sorted[0].date_montreal_tz ?? sorted[0].date_utc);
  const snapshotInterval = sorted[0].time_interval_montreal_tz ?? sorted[0].time_interval_utc;
  const periodLabel = periodLabelFromInterval(snapshotInterval);
  // Le tag public affiche l'HEURE DE PUBLICATION, pas la fin du bloc de données.
  // Réforme #195 : le bloc de données 15-19 est servi à 20h (après ~1 h de
  // pipeline), donc heure de publication = fin du bloc + 1 h (cf.
  // publicationHourFromInterval + ses tests pour la normalisation du bord à 24).
  const publicationHour = publicationHourFromInterval(snapshotInterval);
  const lastUpdated = lastUpdatedLabel(
    sorted[0].date_montreal_tz ?? sorted[0].date_utc,
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
  // La pastille étiquette le PIC 24 h (peakQc) → seuils calibrés sur la
  // distribution des PICS (metrics.score_qc_peak_24h), pas sur les scores par
  // bloc (metrics.score_qc, plus bas). Sans cette clé (calibration pas encore
  // assez fournie post-fusion), repli sur les seuils codés post-fusion (#281).
  const salThresholds = salThresholdsFrom(calibration?.metrics?.score_qc_peak_24h) ?? SAL_QC_THRESHOLDS;
  // Niveau d'un BLOC (lecture au survol de la trajectoire) : calibré sur la
  // distribution des scores PAR BLOC — sa vraie population de référence, la
  // mieux fournie du fichier (n≈1500 sur un an, contre 106 pour les sommets).
  // Deux échelles cohabitent donc, mais sans jamais pouvoir se contredire : le
  // badge parle du CUMUL 24 h, le survol d'un BLOC — deux objets distincts, à
  // deux endroits distincts. (C'était impossible du temps des deux badges
  // côte à côte, où « en ce moment » pouvait dépasser « sommet 24 h ».)
  const blockThresholds = salThresholdsFrom(calibration?.metrics?.score_qc) ?? SAL_QC_THRESHOLDS;
  // Repère « habituel » = médiane event-level. Dérivé de la calibration glissante
  // dès qu'elle publiera `event_convergence` (p50) ; d'ici là, constante mesurée.
  const evConvP50 = calibration?.metrics?.event_convergence?.p50;
  const habitualConvPct =
    typeof evConvP50 === "number" && Number.isFinite(evConvP50)
      ? Math.round(Math.max(0, Math.min(100, evConvP50)))
      : HABITUAL_EVENT_CONV;

  // Niveaux de badge lissés, reconstitués en rejouant les éditions du snapshot.
  const badgeRanks = badgeRanksWithHysteresis(unique);

  const stories = storiesFrom24h(unique);
  // Seuil éditorial #273 : héros toujours affiché, secondaires seulement si
  // portées par ≥ MIN_QC_MEDIA_SECONDARY médias QC → 1 à 3 Unes.
  const qcStories = selectTopUnes(stories);

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
    const suivi = badgeRanks.get(storyKey);
    const saillanceRank = suivi?.rank ?? rawRank(s.sumQc, SUM_QC_THRESHOLDS);
    const { label: saillanceLabel, cls: saillanceCls, hint: saillanceHint } = TIER_BY_RANK[saillanceRank];
    // Sommet de l'indice cumulé + l'édition où il a été atteint — posés sur la
    // figure du ⓘ à côté du repère « CETTE UNE », sur la même échelle.
    const sommetSum = suivi && suivi.peakSum > s.sumQc ? suivi.peakSum : null;
    const sommetLabel = sommetSum != null && suivi
      ? (() => {
        const p = blockLabelParts(suivi.peakBlock, e.date_montreal_tz);
        if (!p) return null;
        const h = p.hour >= 24 ? "minuit" : `${p.hour} h`;
        if (p.dayWord.startsWith("le ")) return p.dayWord;
        return p.dayWord === "aujourd’hui" ? `à ${h}` : `${p.dayWord} à ${h}`;
      })()
      : null;
    // Atténuation du badge en déclin (essai, demande de Jules) : le badge garde
    // son libellé et sa taille — c'est bien le sommet des 24 h qu'il décrit —
    // mais son poids visuel décroît quand l'histoire n'est plus à son sommet.
    // 0 = plein (au sommet ou proche), 1 = atténué, 2 = contour seul.
    const nowQc = s.series.length > 0 ? s.series[s.series.length - 1].qc : 0;
    const peakRatio = s.peakQc > 0 ? nowQc / s.peakQc : 0;
    const saillanceFade: 0 | 1 | 2 = peakRatio >= 0.7 ? 0 : peakRatio >= 0.3 ? 1 : 2;

    // ── Badge « EN CE MOMENT » : niveau du bloc COURANT, sur la MÊME règle que
    // le badge du sommet (cf. plus haut) — donc jamais au-dessus de lui.
    // Deux badges plutôt qu'un (demande Adrien) : le sommet dit ce que l'histoire
    // A ÉTÉ dans la journée, le second dit ce qu'elle EST à cette édition. Les
    // deux étaient déjà dans les données ; un seul était affiché, d'où l'écart
    // apparent entre le badge et la trajectoire.
    const nowPresent = s.series.length > 0 && s.series[s.series.length - 1].present;
    const liveTier = nowPresent ? saillanceTierFromScore(nowQc, salThresholds) : null;
    const liveLabel = liveTier ? liveTier.label : "Pas à la Une";
    const liveCls = liveTier ? liveTier.cls : "s-absent";
    const liveRank = liveTier ? liveTier.rank : 0;

    // Fraîcheur : « Nouveau » = l'histoire apparaît pour la première fois de la
    // fenêtre 24 h à ce bloc ; « De retour » = elle était absente au bloc
    // précédent mais avait déjà été à la Une avant. Sans ça, une histoire
    // réapparue s'annonce « En progression depuis ce midi » alors qu'elle
    // n'était tout simplement pas là à midi.
    const lastIdx = s.series.length - 1;
    const firstPresentIdx = s.series.findIndex((p) => p.present);
    const freshness: "nouveau" | "retour" | null =
      !nowPresent || lastIdx < 0 ? null
        : firstPresentIdx === lastIdx ? "nouveau"
          : lastIdx >= 1 && !s.series[lastIdx - 1].present ? "retour"
            : null;
    // Trajectoire 24 h (#274) : chaque bloc étiqueté à son propre niveau ; la
    // pastille (ci-dessus) reste au PIC, la courbe raconte le déclin/la montée.
    const salienceTrend = buildSalienceTrend(s.series, blockThresholds, e.date_montreal_tz, suivi?.history);

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
      issueFr: e.main_issue_text_fr ?? ISSUE_LABELS_SHORT[e.main_issue ?? ""] ?? "Actualité",
      issueColor: ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E",
      saillanceRank,
      saillanceLabel,
      saillanceCls,
      saillanceHint,
      saillanceFade,
      liveLabel,
      liveCls,
      liveRank,
      freshness,
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
      nBlocks24h: e.n_blocks_24h ?? null,
      salienceTrend,
      // Grille du BADGE (cumul 24 h) : c'est elle que la figure du ⓘ doit
      // représenter, puisque le repère « CETTE UNE » s'y pose désormais.
      salThresholds: [SUM_QC_THRESHOLDS.faible, SUM_QC_THRESHOLDS.moyenne, SUM_QC_THRESHOLDS.eleve, SUM_QC_THRESHOLDS.tresEleve, SUM_QC_THRESHOLDS.extreme],
    };
  });

  // Score = convergence au niveau HISTOIRE (windowEventConvergence) — décision
  // ratifiée 2026-07-15 vs cosinus-objet (windowConvergence, conservé pour tests).
  const conv24h = windowEventConvergence(stories);
  const solitudes = buildSolitudes(latest, stories, conv24h, habitualConvPct);

  const objMap = new Map<string, { score: number; issue: string; color: string; context: string }>();
  for (const e of latest) {
    if (!e.extracted_objects) continue;
    let objects: ExtractedObject[] = [];
    try { objects = JSON.parse(e.extracted_objects) as ExtractedObject[]; } catch { continue; }
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

  const byId = new Map<string, RawEvent>();
  for (const e of allRaw) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") byId.set(e.event_id, e);
  }
  const unique = Array.from(byId.values()).filter((e) => e.country_id !== "USA");

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

// Jusqu'à 5 actualités récentes par enjeu (événements distincts), pour le panneau « À la une »
// du graphique de rang. On regroupe les événements par main_issue, on trie par score_qc
// décroissant et on déduplique par URL/titre. Même source que loadFallbackIssueContent
// (headline-events.json), mais on garde une liste plutôt que le seul meilleur.
async function loadArticlesByIssue(): Promise<Map<string, { title: string; url: string | null }[]>> {
  const map = new Map<string, { title: string; url: string | null }[]>();
  let rawEvents: string;
  try { rawEvents = await fs.readFile(DATA_PATH, "utf8"); } catch { return map; }
  const allRaw = JSON.parse(rawEvents) as RawEvent[];

  const byId = new Map<string, RawEvent>();
  for (const e of allRaw) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") byId.set(e.event_id, e);
  }
  const unique = Array.from(byId.values()).filter((e) => e.country_id !== "USA");

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
    const list: { title: string; url: string | null }[] = [];
    for (const e of sorted) {
      const title = (e.title ?? "").trim();
      if (!title) continue;
      const url = e.representative_url ?? null;
      const dedupKey = url ?? title;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      list.push({ title, url });
      if (list.length >= 5) break;
    }
    map.set(issueKey, list);
  }
  return map;
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
      const prevScore = prevAggregated[issueKey] ?? 0;
      const velocity = score > prevScore ? 1 : score < prevScore ? -1 : 0;
      const growth = prevScore > 0 ? ((score - prevScore) / prevScore) * 100 : null;
      return { issueKey, issueFr: ISSUE_LABELS_SHORT[issueKey] ?? issueKey, color: ISSUE_COLORS[issueKey] ?? "#463E3E", score, relScore: Math.round((score / maxScore) * 100), topObject, context, url, velocity, growth, articles: articlesByIssue.get(issueKey) ?? [] };
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
  latestIssueRow,
  parseIssuesMeta,
  capitalizeObject,
  firstSeenSaillantLabel,
  dedupeByStoryline,
  pctile,
  rocScore,
  convMode,
  solitudesEdito,
  symbolPositions,
  buildSolitudes,
  storiesFrom24h,
  buildSalienceTrend,
  selectTopUnes,
  MIN_QC_MEDIA_SECONDARY,
  windowConvergence,
  windowEventConvergence,
  salThresholdsFrom,
  calConvFrom,
  SAL_QC_THRESHOLDS,
  SUM_QC_THRESHOLDS,
  rawRank,
  hysteresisRank,
  blockKey,
  titleTokens,
  sameStory,
  CAL_CONV,
};
