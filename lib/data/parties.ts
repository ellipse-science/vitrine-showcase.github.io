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

import { lastUpdatedLabel } from "@/lib/dates";

export const PARTY_KEYS = ["plq", "caq", "qs", "pq", "pcq"] as const;
export type PartyKey = (typeof PARTY_KEYS)[number];

export const PARTY_LABELS: Record<PartyKey, string> = {
  plq: "PLQ",
  caq: "CAQ",
  qs: "QS",
  pq: "PQ",
  pcq: "PCQ",
};

export const PARTY_COLORS: Record<PartyKey, string> = {
  plq: "#A03440",
  caq: "#2B5C7C",
  qs: "#B85A2C",
  pq: "#1E3A5F",
  pcq: "#5A3B6E",
};

const SHADOW_THRESHOLD = 0.02; // éclipse médiatique : < 2 % SOV (seuil du raffineur)
const SPARK_W = 100;
const SPARK_H = 30;

export type RangeKey = "today" | "week" | "month";

const SPARK_HEAD_LABELS: Record<RangeKey, string> = {
  today: "Les derniers jours",
  week: "Les dernières semaines",
  month: "Les derniers mois",
};

const RANGE_CONFIG: Record<
  RangeKey,
  { barKey: keyof Sov; refKey: keyof Sov; toneKey: keyof Tone; refLabel: string }
> = {
  today: { barKey: "today", refKey: "week",  toneKey: "today", refLabel: "moyenne depuis lundi" },
  week:  { barKey: "week",  refKey: "month", toneKey: "week",  refLabel: "moyenne du mois" },
  month: { barKey: "month", refKey: "year",  toneKey: "month", refLabel: "moyenne de l'année" },
};

const TAB_LABELS: Record<RangeKey, string> = {
  today: "Aujourd'hui",
  week: "Depuis une semaine",
  month: "Depuis un mois",
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
};

type Entry = { mentions: number; tone: number };
type Lookup = Record<string, Record<string, Entry>>; // date → party_lower → entry

type Stat = {
  key: PartyKey;
  sov: Sov;
  tone: Tone;
  history: { week: number[]; weekly: number[]; month: number[]; monthly: number[] };
  toneHistory: { daily: number[]; weekly: number[]; monthly: number[] };
};

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
  sparkPolyline: string;
  sparkCircles: { cx: number; cy: number; r: number }[];
};

export type RangeView = {
  range: RangeKey;
  tabLabel: string;
  sparkHeadLabel: string;
  refLabel: string;
  rows: RowView[];
};

export type PartiesData = {
  ranges: Record<RangeKey, RangeView>;
  lastDate: string; // ISO date de la dernière donnée disponible
  /** « Dernière mise à jour : mardi 30 juin 2026 » — table journalière, pas d'heure. */
  lastUpdated: string;
};

const TONE_THRESHOLD = 0.002;
const SPARK_CIRCLE_COUNT = 7;

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
function buildLookup(rows: ShadowRow[]): Lookup {
  const result: Lookup = Object.create(null);
  for (const row of rows) {
    const pKey = row.party.toLowerCase();
    if (!result[row.date_utc]) result[row.date_utc] = Object.create(null);
    const existing = result[row.date_utc][pKey];
    if (!existing) {
      result[row.date_utc][pKey] = { mentions: row.weighted_mentions, tone: row.weighted_tone };
    }
  }
  return result;
}

function computeStats(
  dayRows: ShadowRow[],
  weekRows: ShadowRow[],
  monthRows: ShadowRow[],
): Stat[] | null {
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

  return PARTY_KEYS.map((pKey): Stat => {
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
}

function buildRangeView(stats: Stat[], range: RangeKey): RangeView {
  const cfg = RANGE_CONFIG[range];
  const sorted = stats.slice().sort((a, b) => b.sov[cfg.barKey] - a.sov[cfg.barKey]);

  const rows: RowView[] = sorted.map((stat, idx) => {
    const sov = stat.sov[cfg.barKey];
    const sovPct = Math.round(sov * 100);
    const barWidthPct = Math.min(100, sov * 100);

    const refSov = stat.sov[cfg.refKey];
    const refLeftPct = Math.min(100, refSov * 100);
    const refTitle = `${cfg.refLabel} : ${Math.round(refSov * 100)} %`;

    const toneHist =
      range === "month"
        ? stat.toneHistory.monthly
        : range === "week"
          ? stat.toneHistory.weekly
          : stat.toneHistory.daily;
    const streak = computeToneStreak(toneHist);
    const unclamped = toneHist.length > 0 ? toneHist[toneHist.length - 1] : 0;
    const unit =
      range === "month" ? "mois" : range === "week" ? "sem." : streak.count > 1 ? "jours" : "jour";
    const arrow =
      streak.direction === "positive" ? "↑" : streak.direction === "negative" ? "↓" : "—";
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
    const toneTitle = `Ton de la couverture — ${toneLabel} (proportion nette de mots positifs : ${unclamped >= 0 ? "+" : ""}${(unclamped * 100).toFixed(2)} %)`;

    const rawHistory =
      range === "month"
        ? stat.history.monthly
        : range === "week"
          ? stat.history.weekly
          : stat.history.week;
    const pts = sparkPoints(rawHistory, SPARK_W, SPARK_H);
    const polyline = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

    const sampled = samplePoints(pts, SPARK_CIRCLE_COUNT);
    const circles = sampled.map((p, i) => ({
      cx: Number(p[0].toFixed(1)),
      cy: Number(p[1].toFixed(1)),
      r: i === sampled.length - 1 ? 3.5 : 2.5,
    }));

    return {
      key: stat.key,
      label: PARTY_LABELS[stat.key],
      inShadow: sov < SHADOW_THRESHOLD,
      color: PARTY_COLORS[stat.key],
      sovPct,
      barWidthPct: Number(barWidthPct.toFixed(1)),
      barTitle: `${sovPct} % de part de voix`,
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
  };
}

// Exports réservés aux tests unitaires (pipeline interne ; pas l'API publique).
export const __test__ = {
  buildLookup,
  computeStats,
  sparkPoints,
  samplePoints,
  buildRangeView,
};

const DATA_DIR = path.resolve(process.cwd(), "public", "data", "refined");

export async function loadParties(): Promise<PartiesData | null> {
  try {
    const [dayRaw, weekRaw, monthRaw] = await Promise.all([
      fs.readFile(path.join(DATA_DIR, "day",   "provincial_parties_salient_shadow_day.json"),   "utf8"),
      fs.readFile(path.join(DATA_DIR, "week",  "provincial_parties_salient_shadow_week.json"),  "utf8"),
      fs.readFile(path.join(DATA_DIR, "month", "provincial_parties_salient_shadow_month.json"), "utf8"),
    ]);

    const dayRows   = JSON.parse(dayRaw)   as ShadowRow[];
    const weekRows  = JSON.parse(weekRaw)  as ShadowRow[];
    const monthRows = JSON.parse(monthRaw) as ShadowRow[];

    const stats = computeStats(dayRows, weekRows, monthRows);
    if (!stats) return null;

    const lastDate = dayRows.reduce((max, r) => (r.date_utc > max ? r.date_utc : max), "");

    return {
      lastDate,
      lastUpdated: lastUpdatedLabel(lastDate),
      ranges: {
        today: buildRangeView(stats, "today"),
        week:  buildRangeView(stats, "week"),
        month: buildRangeView(stats, "month"),
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

