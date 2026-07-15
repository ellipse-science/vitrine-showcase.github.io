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
type Calibration = { window_days?: number; computed_utc?: string; metrics?: { score_qc?: CalMetric; score_roc?: CalMetric; convergence?: CalMetric; event_convergence?: CalMetric } };

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
  sumQc: number;           // Σ score_qc sur la fenêtre — sert au CLASSEMENT (attention cumulée)
  sumRoc: number;
  peakQc: number;          // max score_qc sur la fenêtre — sert à la PASTILLE de saillance
  peakRoc: number;         // (même échelle que le score de bloc → seuils inchangés)
  qcMedia: Set<string>;
  canMedia: Set<string>;
  urlByMedia: Record<string, string>;
  tok: Set<string>;
};

function parseIdList(json: string | null | undefined): string[] {
  try {
    const p = JSON.parse(json ?? "[]");
    return Array.isArray(p) ? (p as string[]) : [];
  } catch { return []; }
}

function storiesFrom24h(allEvents: RawEvent[]): Story[] {
  type RawArticle = { media_id: string; url: string };
  const blocks = Array.from(new Set(allEvents.map(blockKey))).sort().reverse();
  const window24h = new Set(blocks.slice(0, 6));
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
        qcMedia: new Set(), canMedia: new Set(), urlByMedia: {}, tok: titleTokens(e.title ?? "") };
      byStory.set(key, cur);
    }
    cur.sumQc += qc; cur.sumRoc += roc;
    cur.peakQc = Math.max(cur.peakQc, qc); cur.peakRoc = Math.max(cur.peakRoc, roc);
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
    } else {
      merged.push(a);
    }
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

// PROTOTYPE — convergence au niveau HISTOIRE (au lieu du cosinus-objet).
// « De combien de l'attention des deux régions va aux MÊMES histoires ? »
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
// Seuils recalibrés sur TOUTE la donnée disponible (table headline_events_4h
// depuis le 2026-05-14, fenêtre qui s'étend). Recalibrage du 2026-06-03 sur
// 406 Unes : p5/p20/p50/p80/p95 = 5/10/19/36/71. Illustration pédago dans
// public/methodologie/ (et docs/). TODO(#122) : calcul glissant dans le
// refiner pour ne plus hardcoder ici.
const SAL_QC_THRESHOLDS = { faible: 5, moyenne: 10, eleve: 19, tresEleve: 36, extreme: 71 };

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
  mediaAbsent: string[];
  qcOutletCount: number;
  totalQcOutlets: number;
  /** Identifiant de suivi cross-blocs (Jaccard 0.30, lookback 24h). */
  storylineId: string | null;
  /** Pic de score_qc sur la fenêtre 24h — base de l'étiquette phase C (#122). */
  scoreQcPeak24h: number | null;
  /** Nombre de blocs 4h (≤ 7) où la storyline figurait parmi les Unes. */
  nBlocks24h: number | null;
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
};

export type TreemapPeriodData = {
  tiles: TreemapIssueTile[];
  dateLabel: string;
  /** « Dernière mise à jour : mercredi 8 juillet 2026 » — table journalière, pas d'heure. */
  lastUpdated: string;
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
  const salThresholds = salThresholdsFrom(calibration?.metrics?.score_qc) ?? SAL_QC_THRESHOLDS;
  // Repère « habituel » = médiane event-level. Dérivé de la calibration glissante
  // dès qu'elle publiera `event_convergence` (p50) ; d'ici là, constante mesurée.
  const evConvP50 = calibration?.metrics?.event_convergence?.p50;
  const habitualConvPct =
    typeof evConvP50 === "number" && Number.isFinite(evConvP50)
      ? Math.round(Math.max(0, Math.min(100, evConvP50)))
      : HABITUAL_EVENT_CONV;

  const stories = storiesFrom24h(unique);
  const qcStories = stories
    .filter((s) => s.qcMedia.size > 0 && s.sumQc > 0)
    .sort((a, b) => b.sumQc - a.sumQc)
    .slice(0, 3);

  const top3: UneEvent[] = qcStories.map((s) => {
    const e = s.rep; // occurrence du bloc le plus récent (titre, enjeu, articles frais)
    // Pastille de saillance sur le PIC 24 h : même échelle que le score de bloc
    // (c'est un score_qc), donc les seuils SAL_QC_THRESHOLDS restent valides.
    const { label: saillanceLabel, cls: saillanceCls, rank: saillanceRank, hint: saillanceHint } = saillanceTierFromScore(s.peakQc, salThresholds);

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
    const mediaAbsent = QC_MEDIA.filter((id) => !s.qcMedia.has(id)).map((id) => MEDIA_NAMES[id] ?? id);

    return {
      title: e.title ?? "",
      excerpt,
      issueFr: e.main_issue_text_fr ?? ISSUE_LABELS_SHORT[e.main_issue ?? ""] ?? "Actualité",
      issueColor: ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E",
      saillanceRank,
      saillanceLabel,
      saillanceCls,
      saillanceHint,
      timeMtl: e.time_interval_montreal_tz ?? e.time_interval_utc,
      headlineHours,
      saillantSince,
      representativeUrl: e.representative_url ?? null,
      mediaToday,
      mediaAbsent,
      qcOutletCount: qcCovering.length,
      totalQcOutlets: QC_MEDIA.length,
      storylineId: e.storyline_id ?? null,
      scoreQcPeak24h: s.peakQc,
      nBlocks24h: e.n_blocks_24h ?? null,
    };
  });

  // PROTOTYPE : score = convergence au niveau HISTOIRE (windowEventConvergence)
  // au lieu du cosinus-objet (windowConvergence). Le reste du module est inchangé.
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

export async function loadTreemap(): Promise<TreemapAllPeriods | null> {
  const [dayRows, weekRows, monthRows, fallbackContent] = await Promise.all([
    loadIssueScores("day"),
    loadIssueScores("week"),
    loadIssueScores("month"),
    loadFallbackIssueContent(),
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
      return { issueKey, issueFr: ISSUE_LABELS_SHORT[issueKey] ?? issueKey, color: ISSUE_COLORS[issueKey] ?? "#463E3E", score, relScore: Math.round((score / maxScore) * 100), topObject, context, url };
    });
    return { tiles, dateLabel, lastUpdated };
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
  windowConvergence,
  windowEventConvergence,
  salThresholdsFrom,
  calConvFrom,
  SAL_QC_THRESHOLDS,
  blockKey,
  titleTokens,
  sameStory,
  CAL_CONV,
};
