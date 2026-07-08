// Build-time loader for Une des unes, Deux solitudes, and Treemap sections.
//
// Reads /public/data/headline-events.json, deduplicates by event_id
// (preferring QC target_region), filters US-only events, and pre-computes
// every value the UI needs.

import fs from "node:fs/promises";
import path from "node:path";

import { editionLabel } from "@/lib/editions";

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
};

type DivergenceEntry = {
  event_label: string;
  event_title_raw: string;
  score_qc: number;
  score_roc: number;
  divergence_score: number;
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
  CTV: "CTV",
  GN: "Global News",
  TTS: "Toronto Star",
};

const QC_MEDIA = ["LED", "LAP", "RCI", "TVA", "JDM", "MG"];

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function formatDateFr(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const d = new Date(year, month - 1, day);
  return `${DAYS_FR[d.getDay()]} ${day} ${MONTHS_FR[month - 1]} ${year}`;
}

// Étiquette de saillance par percentiles SYMÉTRIQUES du score_qc (cf. #35) :
// autant de « Très faible » que d'« Extrême », le gros au centre (courbe en
// cloche sur échelle log). Bandes p5/p20/p50/p80/p95 = 5/15/30/30/15/5 %.
// Labels : Très faible, Faible, Modérée, Élevée, Très élevée, Extrême
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
function saillanceTierFromScore(scoreQc: number | null): { label: string; cls: string; rank: number; hint: string } {
  const s = scoreQc ?? 0;
  if (s >= SAL_QC_THRESHOLDS.extreme)   return { label: "Extrême",     cls: "s-extreme",     rank: 6, hint: "Plus saillante que 95 % des nouvelles à la Une." };
  if (s >= SAL_QC_THRESHOLDS.tresEleve) return { label: "Très élevée", cls: "s-tres-eleve",  rank: 5, hint: "Plus saillante qu’environ 85 % des nouvelles à la Une." };
  if (s >= SAL_QC_THRESHOLDS.eleve)     return { label: "Élevée",      cls: "s-eleve",       rank: 4, hint: "Plus saillante qu’environ 65 % des nouvelles à la Une." };
  // « Modérée » (et non « Moyenne ») : cette bande (p20-p50) est ENTIÈREMENT sous
  // la médiane ; avec 6 bandes paires, aucune n'EST le centre. Éviter « Moyenne »,
  // qui laisse croire à tort que c'est le niveau typique (retour M-A Martel, #35).
  // Le `cls` reste s-moyenne (le CSS s'appuie dessus, label ≠ classe).
  if (s >= SAL_QC_THRESHOLDS.moyenne)   return { label: "Modérée",     cls: "s-moyenne",     rank: 3, hint: "Environ 65 % des nouvelles à la Une sont plus saillantes que celle-ci." };
  if (s >= SAL_QC_THRESHOLDS.faible)    return { label: "Faible",      cls: "s-faible",      rank: 2, hint: "Environ 85 % des nouvelles à la Une sont plus saillantes que celle-ci." };
  return { label: "Très faible", cls: "s-tres-faible", rank: 1, hint: "95 % des nouvelles à la Une sont plus saillantes que celle-ci." };
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

// « ce matin, 8 h » (#126) : estime le début de saillance à partir du bloc 4h
// courant (heure Montréal) et de la durée en Une, arrondi à l'édition la plus
// proche. Approximatif tant que le refiner ne fournit pas l'instant exact.
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
  /** Rang de saillance 1–6 (Très faible→1 … Extrême→6) — pilote la taille du titre. */
  saillanceRank: number;
  saillanceLabel: string;
  saillanceCls: string;
  /** Explication relative du niveau, en pourcentage (cf. saillanceTierFromScore). */
  saillanceHint: string;
  timeMtl: string;
  headlineHours: number | null;
  /** « ce matin, 8 h » — moment depuis lequel l'événement est saillant (#126). */
  saillantSince: string | null;
  representativeUrl: string | null;
  mediaPresent: { name: string; url: string | null }[];
  mediaAbsent: string[];
  qcOutletCount: number;
  totalQcOutlets: number;
};

export type SolitudeStory = {
  label: string;
  qcWidth: number;
  caWidth: number;
  qcZero: boolean;
  caZero: boolean;
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
};

export type TreemapAllPeriods = {
  day: TreemapPeriodData;
  week: TreemapPeriodData;
  month: TreemapPeriodData;
};

export type HeadlineData = {
  dateLabel: string;
  snapshotInterval: string;
  /** « de la soirée », « du matin »… selon le bloc 4h (#125). */
  periodLabel: string;
  top3: UneEvent[];
  solitudesQcPos: number;
  solitudesRocPos: number;
  solitudesDivPct: number;
  solitudesStories: SolitudeStory[];
  treemapTier1: TreemapTile[];
  treemapTier2: TreemapTile[];
  treemapTier3: TreemapTile[];
  treemapTier4: TreemapTile[];
  treemapMobile: (TreemapTile & { relWidth: number })[];
};

export async function loadHeadlineEvents(): Promise<HeadlineData | null> {
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

  const withTitles = latest
    .filter((e) => e.title)
    .sort((a, b) =>
      (b.score_qc ?? 0) - (a.score_qc ?? 0) ||
      (b.score_saillance ?? 0) - (a.score_saillance ?? 0),
    );

  const top3: UneEvent[] = withTitles.slice(0, 3).map((e) => {
    const { label: saillanceLabel, cls: saillanceCls, rank: saillanceRank, hint: saillanceHint } = saillanceTierFromScore(e.score_qc);
    const qcOutletCount = e.outlets_qc ?? 0;
    const totalQcOutlets = e.total_outlets_qc ?? 6;
    let mediaIds: string[] = [];
    try { mediaIds = JSON.parse(e.media_ids) as string[]; } catch { }
    type RawArticle = { media_id: string; url: string; headline_minutes?: number | null };
    const mediaIdToUrl: Record<string, string> = {};
    let totalHeadlineMinutes = 0;
    try {
      const arts = JSON.parse(e.articles ?? "[]") as RawArticle[];
      for (const art of arts) {
        if (art.media_id && art.url && !mediaIdToUrl[art.media_id]) {
          mediaIdToUrl[art.media_id] = art.url;
        }
        const mins = Number(art.headline_minutes ?? 0);
        if (Number.isFinite(mins) && mins > 0) {
          totalHeadlineMinutes += mins;
        }
      }
    } catch { }
    const excerpt = e.text?.trim() || null;
    const headlineHours =
      totalHeadlineMinutes > 0
        ? Math.max(1, Math.round(totalHeadlineMinutes / 60))
        : null;
    const saillantSince = saillantSinceLabel(e.time_interval_montreal_tz ?? null, headlineHours);
    // QC media seulement (Shannon: "Médias Qc seulement", "Supprimer ROC, US pour les deux")
    const mediaPresent = mediaIds
      .filter((id) => QC_MEDIA.includes(id))
      .map((id) => ({ name: MEDIA_NAMES[id] ?? id, url: mediaIdToUrl[id] ?? null }));
    const mediaAbsent = QC_MEDIA.filter((id) => !mediaIds.includes(id)).map(
      (id) => MEDIA_NAMES[id] ?? id,
    );
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
      mediaPresent,
      mediaAbsent,
      qcOutletCount,
      totalQcOutlets,
    };
  });

  const qcRow = latest.find((e) => e.country_id === "QC" || e.country_id === "CAN");
  const rawConvergence = qcRow?.interval_convergence_score ?? null;
  const rawDivergenceJson =
    qcRow?.top_objects_divergence && qcRow.top_objects_divergence !== "NA"
      ? qcRow.top_objects_divergence
      : null;

  let divergenceEntries: DivergenceEntry[] = [];
  if (rawDivergenceJson) {
    try { divergenceEntries = JSON.parse(rawDivergenceJson) as DivergenceEntry[]; } catch { }
  }

  let divPct: number;
  if (rawConvergence !== null) {
    divPct = Math.max(0, Math.min(100, 100 - rawConvergence));
  } else {
    const eventsWithScore = latest.filter((e) => (e.score_saillance ?? 0) > 0);
    const totalSaillance = eventsWithScore.reduce((sum, e) => sum + (e.score_saillance ?? 0), 0);
    const totalExclusivity = eventsWithScore.reduce((sum, e) => {
      const s = e.score_saillance ?? 0;
      const q = e.score_qc ?? 0;
      const ratio = s > 0 ? q / s : 0;
      return sum + s * Math.abs(ratio - 0.5) * 2;
    }, 0);
    divPct = totalSaillance > 0 ? Math.round((totalExclusivity / totalSaillance) * 100) : 0;
  }

  const maxScoreForBars = Math.max(
    ...divergenceEntries.map((d) => Math.max(d.score_qc, d.score_roc)),
    ...latest.map((e) => e.score_saillance ?? 0),
    1,
  );

  let solitudesStories: SolitudeStory[];
  if (divergenceEntries.length > 0) {
    // event_label → French event title (les events ont déjà le titre traduit dans `title`)
    const labelToTitle = new Map<string, string>();
    for (const e of unique) {
      if (e.event_label && e.title && !labelToTitle.has(e.event_label)) {
        labelToTitle.set(e.event_label, e.title);
      }
    }
    // Dédupliquer par event_label (garder le score de divergence le plus élevé par label)
    const dedupedByLabel = new Map<string, DivergenceEntry>();
    for (const d of divergenceEntries) {
      const existing = dedupedByLabel.get(d.event_label);
      if (!existing || d.divergence_score > existing.divergence_score) {
        dedupedByLabel.set(d.event_label, d);
      }
    }
    const uniqueEntries = Array.from(dedupedByLabel.values())
      .sort((a, b) => b.divergence_score - a.divergence_score);
    solitudesStories = uniqueEntries.slice(0, 3).map((d) => {
      const fr = labelToTitle.get(d.event_label);
      const label = fr && fr.length > 0
        ? fr
        : (d.event_title_raw && d.event_title_raw.length > 0
            ? d.event_title_raw
            : d.event_label.charAt(0).toUpperCase() + d.event_label.slice(1));
      const qcW = Math.round((d.score_qc / maxScoreForBars) * 100);
      const caW = Math.round((d.score_roc / maxScoreForBars) * 100);
      return { label, qcWidth: Math.min(100, qcW), caWidth: Math.min(100, caW), qcZero: qcW <= 2, caZero: caW <= 2 };
    });
  } else {
    const eventsWithScore = latest.filter((e) => (e.score_saillance ?? 0) > 0);
    const ranked = eventsWithScore
      .filter((e) => e.title)
      .map((e) => {
        const s = e.score_saillance ?? 0;
        const q = e.score_qc ?? 0;
        const qcRatio = s > 0 ? q / s : 0;
        return { e, q, divergence: Math.abs(qcRatio - 0.5) * 2 };
      })
      .sort((a, b) => b.divergence - a.divergence);
    solitudesStories = ranked.slice(0, 3).map(({ e, q }) => {
      const s = e.score_saillance ?? 0;
      const qcW = Math.round((q / maxScoreForBars) * 100);
      const caW = Math.round(((s - q) / maxScoreForBars) * 100);
      return { label: e.title ?? "", qcWidth: Math.min(100, qcW), caWidth: Math.min(100, caW), qcZero: qcW <= 2, caZero: caW <= 2 };
    });
  }

  const spread = Math.round(divPct * 0.4);
  const solitudesQcPos = Math.max(5, 20 - spread);
  const solitudesRocPos = Math.min(95, 80 + spread);

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

  return { dateLabel, snapshotInterval, periodLabel, top3, solitudesQcPos, solitudesRocPos, solitudesDivPct: divPct, solitudesStories, treemapTier1: tier1, treemapTier2: tier2, treemapTier3: tier3, treemapTier4: tier4, treemapMobile };
}

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
    return { tiles, dateLabel };
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
};
