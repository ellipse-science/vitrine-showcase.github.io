// Build-time loader for Une des unes, Deux solitudes, and Treemap sections.
//
// Reads /public/data/headline-events.json, deduplicates by event_id
// (preferring QC target_region), filters US-only events, and pre-computes
// every value the UI needs.

import fs from "node:fs/promises";
import path from "node:path";

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
  score_saillance: number | null;
  score_qc: number | null;
  extracted_objects: string | null;
  media_ids: string; // JSON string e.g. '["LED","LAP"]'
  intensity_tier: string | null;
  title: string | null;
  main_issue: string | null;
  main_issue_text_fr: string | null;
  target_region: string | null;
};

type ExtractedObject = { object: string; score: number };

// ── Issue metadata ──────────────────────────────────────────────────────────

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
  law_and_crime: "Droit et criminalité",
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

// ── Date helpers ────────────────────────────────────────────────────────────

const DAYS_FR = [
  "Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi",
];
const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function formatDateFr(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? 2026;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const d = new Date(year, month - 1, day);
  return `${DAYS_FR[d.getDay()]} ${day} ${MONTHS_FR[month - 1]} ${year}`;
}

// ── Saillance helpers ───────────────────────────────────────────────────────

function getSaillance(
  scoreQc: number | null,
  maxScore: number,
): { filled: number; label: string; cls: string } {
  const s = scoreQc ?? 0;
  const normalized = maxScore > 0 ? (s / maxScore) * 100 : 0;
  if (normalized >= 85) return { filled: 6, label: "Majeur", cls: "major" };
  if (normalized >= 65) return { filled: 5, label: "Majeur", cls: "major" };
  if (normalized >= 45) return { filled: 4, label: "Fort", cls: "fort" };
  if (normalized >= 28) return { filled: 3, label: "Fort", cls: "fort" };
  if (normalized >= 12) return { filled: 2, label: "Notable", cls: "notable" };
  return { filled: 1, label: "Notable", cls: "notable" };
}

// ── Exported types ──────────────────────────────────────────────────────────

export type UneEvent = {
  title: string;
  issueFr: string;
  issueColor: string;
  saillanceFilled: number;
  saillanceLabel: string;
  saillanceCls: string;
  timeMtl: string;
  mediaPresent: string[]; // readable names
  mediaAbsent: string[]; // readable names from QC_MEDIA that are absent
};

export type SolitudeStory = {
  label: string;
  qcWidth: number; // 0–100
  caWidth: number; // 0–100
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
  score: number;      // raw from issues_score_*.json
  relScore: number;   // 0–100 relative to max tile
  topObject: string;  // top extracted object name, or ""
  context: string;    // event title snippet, or ""
};

export type TreemapPeriodData = {
  tiles: TreemapIssueTile[]; // 12 issues, sorted by score desc
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
  top3: UneEvent[];
  solitudesQcPos: number;
  solitudesRocPos: number;
  solitudesDivPct: number;
  solitudesStories: SolitudeStory[];
  treemapTier1: TreemapTile[]; // 4 tiles
  treemapTier2: TreemapTile[]; // 5 tiles
  treemapTier3: TreemapTile[]; // 5 tiles
  treemapTier4: TreemapTile[]; // 4 tiles (no context shown)
  treemapMobile: (TreemapTile & { relWidth: number })[]; // all, sorted
};

// ── Core loader ─────────────────────────────────────────────────────────────

export async function loadHeadlineEvents(): Promise<HeadlineData | null> {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_PATH, "utf8");
  } catch {
    return null;
  }

  const all = JSON.parse(raw) as RawEvent[];

  // Deduplicate by event_id, keep QC target_region when available
  const byId = new Map<string, RawEvent>();
  for (const e of all) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") {
      byId.set(e.event_id, e);
    }
  }
  const unique = Array.from(byId.values()).filter(
    (e) => e.country_id !== "USA",
  );

  if (unique.length === 0) return null;

  // Find most recent time block
  const sorted = unique.slice().sort((a, b) => {
    const dA = `${a.date_utc}T${a.time_interval_utc.split("-")[0]}:00Z`;
    const dB = `${b.date_utc}T${b.time_interval_utc.split("-")[0]}:00Z`;
    return dB.localeCompare(dA);
  });
  const latestDate = sorted[0].date_utc;
  const latestInterval = sorted[0].time_interval_utc;
  const latest = sorted.filter(
    (e) =>
      e.date_utc === latestDate && e.time_interval_utc === latestInterval,
  );

  const dateLabel = formatDateFr(
    sorted[0].date_montreal_tz ?? sorted[0].date_utc,
  );
  const snapshotInterval =
    sorted[0].time_interval_montreal_tz ?? sorted[0].time_interval_utc;

  // ── Top 3 for Une des unes ────────────────────────────────────────────────

  const withTitles = latest
    .filter((e) => e.title)
    .sort(
      (a, b) =>
        (b.score_qc ?? 0) - (a.score_qc ?? 0) ||
        (b.score_saillance ?? 0) - (a.score_saillance ?? 0),
    );

  const maxScore = withTitles[0]?.score_qc ?? 1;

  const top3: UneEvent[] = withTitles.slice(0, 3).map((e) => {
    const saillance = getSaillance(e.score_qc, maxScore);
    let mediaIds: string[] = [];
    try {
      mediaIds = JSON.parse(e.media_ids) as string[];
    } catch {
      // ignore
    }
    const mediaPresent = mediaIds
      .filter((id) => MEDIA_NAMES[id])
      .map((id) => MEDIA_NAMES[id] ?? id);
    const mediaAbsent = QC_MEDIA.filter((id) => !mediaIds.includes(id)).map(
      (id) => MEDIA_NAMES[id] ?? id,
    );

    return {
      title: e.title ?? "",
      issueFr:
        e.main_issue_text_fr ??
        ISSUE_LABELS_SHORT[e.main_issue ?? ""] ??
        "Actualité",
      issueColor: ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E",
      saillanceFilled: saillance.filled,
      saillanceLabel: saillance.label,
      saillanceCls: saillance.cls,
      timeMtl: e.time_interval_montreal_tz ?? e.time_interval_utc,
      mediaPresent,
      mediaAbsent,
    };
  });

  // ── Deux solitudes ────────────────────────────────────────────────────────

  // Pick 3 most divergent events (largest |qcRatio - 0.5|)
  const eventsWithScore = latest.filter((e) => (e.score_saillance ?? 0) > 0);
  const maxSaillance =
    Math.max(...eventsWithScore.map((e) => e.score_saillance ?? 0)) || 1;

  const ranked = eventsWithScore
    .filter((e) => e.title)
    .map((e) => {
      const s = e.score_saillance ?? 0;
      const q = e.score_qc ?? 0;
      const qcRatio = s > 0 ? q / s : 0;
      return { e, s, q, qcRatio, divergence: Math.abs(qcRatio - 0.5) * 2 };
    })
    .sort((a, b) => b.divergence - a.divergence);

  // Overall divergence: weighted average exclusivity
  const totalSaillance = eventsWithScore.reduce(
    (sum, e) => sum + (e.score_saillance ?? 0),
    0,
  );
  const totalExclusivity = eventsWithScore.reduce((sum, e) => {
    const s = e.score_saillance ?? 0;
    const q = e.score_qc ?? 0;
    const ratio = s > 0 ? q / s : 0;
    return sum + s * Math.abs(ratio - 0.5) * 2;
  }, 0);
  const divPct =
    totalSaillance > 0
      ? Math.round((totalExclusivity / totalSaillance) * 100)
      : 0;

  const solitudesStories: SolitudeStory[] = ranked.slice(0, 3).map(({ e, q }) => {
    const s = e.score_saillance ?? 0;
    const qcW = Math.round((q / maxSaillance) * 100);
    const caW = Math.round(((s - q) / maxSaillance) * 100);
    return {
      label: e.title ?? "",
      qcWidth: Math.min(100, qcW),
      caWidth: Math.min(100, caW),
      qcZero: qcW <= 2,
      caZero: caW <= 2,
    };
  });

  // Symbol positions: spread based on divergence
  const spread = Math.round(divPct * 0.4);
  const solitudesQcPos = Math.max(5, 20 - spread);
  const solitudesRocPos = Math.min(95, 80 + spread);

  // ── Treemap objects ───────────────────────────────────────────────────────

  // Aggregate all extracted_objects across events, weighted by score_qc
  const objMap = new Map<
    string,
    { score: number; issue: string; color: string; context: string }
  >();

  for (const e of latest) {
    if (!e.extracted_objects) continue;
    let objects: ExtractedObject[] = [];
    try {
      objects = JSON.parse(e.extracted_objects) as ExtractedObject[];
    } catch {
      continue;
    }
    const eventWeight = e.score_qc ?? e.score_saillance ?? 0;
    const issueColor = ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E";
    const context = e.title ?? "";

    // Top 8 objects per event to avoid dilution
    for (const obj of objects.slice(0, 8)) {
      const name = obj.object.trim();
      if (!name || name.length < 3) continue;
      const weighted = obj.score * eventWeight;
      const existing = objMap.get(name);
      if (!existing || weighted > existing.score) {
        objMap.set(name, {
          score: existing ? existing.score + weighted : weighted,
          issue: existing?.issue ?? e.main_issue ?? "",
          color: issueColor,
          context: context.length > 0 ? context : existing?.context ?? "",
        });
      } else {
        existing.score += weighted;
      }
    }
  }

  const allObjects = Array.from(objMap.entries())
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      enjeu: ISSUE_LABELS_SHORT[data.issue] ?? "Actualité",
      color: data.color,
      context: data.context,
      score: data.score,
    }))
    .sort((a, b) => b.score - a.score);

  // Truncate context to ~50 chars for tile display
  const withTruncContext = allObjects.map((o) => ({
    ...o,
    context:
      o.context.length > 55 ? o.context.slice(0, 52) + "…" : o.context,
  }));

  const tier1 = withTruncContext.slice(0, 4);
  const tier2 = withTruncContext.slice(4, 9);
  const tier3 = withTruncContext.slice(9, 14);
  const tier4 = withTruncContext.slice(14, 18);

  const topScore = allObjects[0]?.score ?? 1;
  const treemapMobile = withTruncContext.slice(0, 14).map((o) => ({
    ...o,
    relWidth: Math.round((o.score / topScore) * 100),
  }));

  return {
    dateLabel,
    snapshotInterval,
    top3,
    solitudesQcPos,
    solitudesRocPos,
    solitudesDivPct: divPct,
    solitudesStories,
    treemapTier1: tier1,
    treemapTier2: tier2,
    treemapTier3: tier3,
    treemapTier4: tier4,
    treemapMobile,
  };
}

// ── Treemap by issue loader ──────────────────────────────────────────────────

const ISSUE_KEYS = Object.keys(ISSUE_COLORS);
const PASS_ORDER: Record<string, number> = { am: 0, noon: 1, pm: 2 };

async function loadIssueScores(period: "day" | "week" | "month"): Promise<Array<Record<string, unknown>> | null> {
  const filePath = path.resolve(
    process.cwd(),
    "public",
    "data",
    "refined",
    period,
    `issues_score_${period}.json`,
  );
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Array<Record<string, unknown>>;
  } catch {
    return null;
  }
}

function latestIssueRow(rows: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => {
    const dA = (a.date_utc as string) ?? "";
    const dB = (b.date_utc as string) ?? "";
    if (dB !== dA) return dB.localeCompare(dA);
    return (PASS_ORDER[b.pass as string] ?? 0) - (PASS_ORDER[a.pass as string] ?? 0);
  })[0] ?? null;
}

export async function loadTreemap(): Promise<TreemapAllPeriods | null> {
  // Load headline events to build per-issue content (topObject + context)
  let rawEvents: string;
  try {
    rawEvents = await fs.readFile(DATA_PATH, "utf8");
  } catch {
    return null;
  }

  const allRaw = JSON.parse(rawEvents) as RawEvent[];

  // Deduplicate by event_id (prefer QC), filter USA
  const byId = new Map<string, RawEvent>();
  for (const e of allRaw) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") byId.set(e.event_id, e);
  }
  const unique = Array.from(byId.values()).filter((e) => e.country_id !== "USA");

  // Per-issue: pick event with highest score_qc, extract topObject + context
  const issueContent = new Map<string, { topObject: string; context: string }>();
  const byIssue = new Map<string, RawEvent>();
  for (const e of unique) {
    const key = e.main_issue ?? "";
    const existing = byIssue.get(key);
    if (!existing || (e.score_qc ?? 0) > (existing.score_qc ?? 0)) {
      byIssue.set(key, e);
    }
  }
  for (const [issueKey, e] of byIssue) {
    let topObject = "";
    if (e.extracted_objects) {
      try {
        const objs = JSON.parse(e.extracted_objects) as ExtractedObject[];
        const raw = objs[0]?.object?.trim() ?? "";
        if (raw.length >= 2) {
          const capped = raw.charAt(0).toUpperCase() + raw.slice(1);
          topObject = capped.length > 22 ? capped.slice(0, 20) + "…" : capped;
        }
      } catch { /* ignore */ }
    }
    const title = e.title ?? "";
    const context = title.length > 55 ? title.slice(0, 52) + "…" : title;
    issueContent.set(issueKey, { topObject, context });
  }

  // Load all three score files in parallel
  const [dayRows, weekRows, monthRows] = await Promise.all([
    loadIssueScores("day"),
    loadIssueScores("week"),
    loadIssueScores("month"),
  ]);

  function buildPeriodData(rows: Array<Record<string, unknown>> | null): TreemapPeriodData | null {
    if (!rows) return null;
    const latest = latestIssueRow(rows);
    if (!latest) return null;

    const dateStr = (latest.date_montreal_tz as string) ?? (latest.date_utc as string) ?? "";
    const dateLabel = formatDateFr(dateStr);

    const scored = ISSUE_KEYS.map((issueKey) => ({
      issueKey,
      score: (latest[issueKey] as number) ?? 0,
    })).sort((a, b) => b.score - a.score);

    const maxScore = scored[0]?.score || 1;

    const tiles: TreemapIssueTile[] = scored.map(({ issueKey, score }) => {
      const content = issueContent.get(issueKey) ?? { topObject: "", context: "" };
      return {
        issueKey,
        issueFr: ISSUE_LABELS_SHORT[issueKey] ?? issueKey,
        color: ISSUE_COLORS[issueKey] ?? "#463E3E",
        score,
        relScore: Math.round((score / maxScore) * 100),
        topObject: content.topObject,
        context: content.context,
      };
    });

    return { tiles, dateLabel };
  }

  const day = buildPeriodData(dayRows);
  if (!day) return null;

  return {
    day,
    week: buildPeriodData(weekRows) ?? day,
    month: buildPeriodData(monthRows) ?? day,
  };
}
