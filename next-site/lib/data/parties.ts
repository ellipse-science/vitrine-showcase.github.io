// Build-time loader for the partis-couverture section.
//
// Reads /public/data/refined/day/provincial_parties_score_day.json from disk,
// runs the same dedup + aggregation pipeline as the legacy
// public/js/partis-couverture.js, and returns one RangeView per time window
// (today / week / month) ready to be rendered by React.
//
// All numbers — bar widths, reference markers, tone-dot positions, sparkline
// polyline points, sampled circle positions — are pre-computed here so the
// runtime React component does no math.

import fs from "node:fs/promises";
import path from "node:path";

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

const PASS_ORDER: Record<string, number> = { pm: 3, noon: 2, am: 1 };
const SHADOW_THRESHOLD = 0.05;
const SPARK_W = 100;
const SPARK_H = 30;
// Raw tone scores from the refiner are tiny (typically |tone| < 0.05); a linear
// [-1,+1] mapping clusters every dot at the centre. Amplify (then clamp) so
// day-to-day differences read visually.
const TONE_AMPLIFY = 15;

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
  today: { barKey: "today", refKey: "week", toneKey: "today", refLabel: "moyenne 7 jours" },
  week: { barKey: "week", refKey: "month", toneKey: "week", refLabel: "moyenne du mois" },
  month: { barKey: "month", refKey: "year", toneKey: "month", refLabel: "moyenne de l'année" },
};

const TAB_LABELS: Record<RangeKey, string> = {
  today: "Aujourd'hui",
  week: "Depuis une semaine",
  month: "Depuis un mois",
};

export type Sov = { today: number; week: number; month: number; year: number };
export type Tone = { today: number; week: number; month: number; year: number };

type Row = {
  party: string;
  date_utc: string;
  weighted_mentions: number;
  weighted_tone: number;
  pass: string;
};

type DayEntry = { mentions: number; tone: number };
type DayLookup = Record<string, Record<string, DayEntry>>;

type Stat = {
  key: PartyKey;
  sov: Sov;
  tone: Tone;
  history: { week: number[]; weekly: number[]; month: number[]; monthly: number[] };
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
  toneLeftPct: number;
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
};

function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

function buildDayLookup(rows: Row[]): DayLookup {
  // Athena rows have duplicate (date, party, pass); keep the row with highest
  // weighted_mentions per (date, partyUpper, pass), then pick the best
  // available pass (pm > noon > am, preferring nonzero mentions).
  const passBest: Record<string, Row & { partyUpper: string }> = Object.create(null);
  for (const row of rows) {
    const partyUpper = row.party.toUpperCase();
    const key = `${row.date_utc}|${partyUpper}|${row.pass}`;
    const existing = passBest[key];
    if (!existing || row.weighted_mentions > existing.weighted_mentions) {
      passBest[key] = { ...row, partyUpper };
    }
  }

  const grouped: Record<string, Record<string, (typeof passBest)[string][]>> = Object.create(null);
  for (const k of Object.keys(passBest)) {
    const row = passBest[k];
    if (!grouped[row.date_utc]) grouped[row.date_utc] = Object.create(null);
    if (!grouped[row.date_utc][row.partyUpper]) grouped[row.date_utc][row.partyUpper] = [];
    grouped[row.date_utc][row.partyUpper].push(row);
  }

  const result: DayLookup = Object.create(null);
  for (const date of Object.keys(grouped)) {
    result[date] = Object.create(null);
    const parties = grouped[date];
    for (const party of Object.keys(parties)) {
      const passes = parties[party].slice().sort(
        (a, b) => (PASS_ORDER[b.pass] || 0) - (PASS_ORDER[a.pass] || 0),
      );
      const best = passes.find((r) => r.weighted_mentions > 0) || passes[0];
      result[date][party] = { mentions: best.weighted_mentions, tone: best.weighted_tone };
    }
  }
  return result;
}

function computeStats(rows: Row[]): Stat[] | null {
  const dayLookup = buildDayLookup(rows);
  const allDates = Object.keys(dayLookup).sort();
  if (allDates.length === 0) return null;

  const latestDate = allDates[allDates.length - 1];
  const knownParties = PARTY_KEYS.map((k) => k.toUpperCase());
  const last7 = allDates.slice(-7);
  const last30 = allDates.slice(-30);

  function sovOnDate(date: string): Record<string, number> {
    const day = dayLookup[date] || {};
    const total =
      knownParties.reduce((s, p) => s + ((day[p] && day[p].mentions) || 0), 0) || 1;
    const out: Record<string, number> = Object.create(null);
    for (const p of knownParties) {
      out[p] = ((day[p] && day[p].mentions) || 0) / total;
    }
    return out;
  }

  const sovCache: Record<string, Record<string, number>> = Object.create(null);
  for (const d of last30) sovCache[d] = sovOnDate(d);

  const allDatesSovCache: Record<string, Record<string, number>> = Object.create(null);
  for (const d of allDates) allDatesSovCache[d] = sovOnDate(d);

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  const weekBuckets: Record<string, string[]> = Object.create(null);
  for (const d of last30) {
    const wk = isoWeekStart(d);
    if (!weekBuckets[wk]) weekBuckets[wk] = [];
    weekBuckets[wk].push(d);
  }
  const weekKeys = Object.keys(weekBuckets).sort();

  const monthBuckets: Record<string, string[]> = Object.create(null);
  for (const d of allDates) {
    const mo = d.slice(0, 7);
    if (!monthBuckets[mo]) monthBuckets[mo] = [];
    monthBuckets[mo].push(d);
  }
  const monthKeys = Object.keys(monthBuckets).sort();

  function weightedToneAvg(dates: string[], party: string): number {
    let toneSum = 0;
    let mentionSum = 0;
    for (const d of dates) {
      const entry = dayLookup[d] && dayLookup[d][party];
      if (!entry) continue;
      toneSum += (entry.tone || 0) * (entry.mentions || 0);
      mentionSum += entry.mentions || 0;
    }
    return mentionSum > 0 ? toneSum / mentionSum : 0;
  }

  return knownParties.map((party): Stat => {
    const hist7 = last7.map((d) => (sovCache[d] && sovCache[d][party]) || 0);
    const hist30 = last30.map((d) => (sovCache[d] && sovCache[d][party]) || 0);
    const histYear = allDates.map(
      (d) => (allDatesSovCache[d] && allDatesSovCache[d][party]) || 0,
    );
    const todayTone =
      (dayLookup[latestDate] && dayLookup[latestDate][party] && dayLookup[latestDate][party].tone) || 0;

    const histWeekly = weekKeys.map((wk) => {
      const days = weekBuckets[wk];
      const vals = days.map((d) => (sovCache[d] && sovCache[d][party]) || 0);
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    });

    const histMonthly = monthKeys.map((mo) => {
      const days = monthBuckets[mo];
      const vals = days.map((d) => (allDatesSovCache[d] && allDatesSovCache[d][party]) || 0);
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    });

    return {
      key: party.toLowerCase() as PartyKey,
      sov: {
        today: (sovCache[latestDate] && sovCache[latestDate][party]) || 0,
        week: avg(hist7),
        month: avg(hist30),
        year: avg(histYear),
      },
      tone: {
        today: todayTone,
        week: weightedToneAvg(last7, party),
        month: weightedToneAvg(last30, party),
        year: weightedToneAvg(allDates, party),
      },
      history: { week: hist7, weekly: histWeekly, month: hist30, monthly: histMonthly },
    };
  });
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

const SPARK_CIRCLE_COUNT = 7;

function buildRangeView(stats: Stat[], range: RangeKey): RangeView {
  const cfg = RANGE_CONFIG[range];
  const sorted = stats.slice().sort((a, b) => b.sov[cfg.barKey] - a.sov[cfg.barKey]);

  // Bar lengths normalize against the highest non-shadow value so the leader
  // fills the track. Fall back to absolute max if everything is in shadow.
  let visibleLead = 0;
  for (const s of sorted) {
    if (s.sov[cfg.barKey] >= SHADOW_THRESHOLD && s.sov[cfg.barKey] > visibleLead) {
      visibleLead = s.sov[cfg.barKey];
    }
  }
  if (visibleLead === 0 && sorted[0]) visibleLead = sorted[0].sov[cfg.barKey];

  const rows: RowView[] = sorted.map((stat, idx) => {
    const sov = stat.sov[cfg.barKey];
    const sovPct = Math.round(sov * 100);
    const barWidthPct = visibleLead > 0 ? Math.min(100, (sov / visibleLead) * 100) : 0;

    const refSov = stat.sov[cfg.refKey];
    const refLeftPct = visibleLead > 0 ? Math.min(100, (refSov / visibleLead) * 100) : 0;
    const refTitle = `${cfg.refLabel} : ${Math.round(refSov * 100)} %`;

    const rawTone = stat.tone[cfg.toneKey] || 0;
    const amplified = Math.max(-1, Math.min(1, rawTone * TONE_AMPLIFY));
    const toneLeftPct = ((amplified + 1) / 2) * 100;

    const rawHistory =
      range === "month" ? stat.history.monthly : range === "week" ? stat.history.weekly : stat.history.week;
    const pts = sparkPoints(rawHistory, SPARK_W, SPARK_H);
    const polyline = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

    const sampled = samplePoints(pts, SPARK_CIRCLE_COUNT);
    const circles = sampled.map((p, i) => ({
      cx: Number(p[0].toFixed(1)),
      cy: Number(p[1].toFixed(1)),
      r: i === sampled.length - 1 ? 3.5 : 2.5,
    }));

    const inShadow = sov < SHADOW_THRESHOLD;
    const isLeader = idx === 0 && !inShadow;

    return {
      key: stat.key,
      label: PARTY_LABELS[stat.key],
      inShadow,
      color: PARTY_COLORS[stat.key],
      sovPct,
      barWidthPct: Number(barWidthPct.toFixed(1)),
      barTitle: `${sovPct} % de part de voix`,
      refLeftPct: Number(refLeftPct.toFixed(1)),
      refTitle,
      showLeaderLabel: isLeader,
      toneLeftPct: Number(toneLeftPct.toFixed(1)),
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

// Read from the repo's /public/data, not from next-site/public (which is a
// symlink). Turbopack refuses to follow symlinks that exit its filesystem
// root, so we walk up from next-site/ and into the parent public/.
const PARTIES_JSON_PATH = path.resolve(
  process.cwd(),
  "..",
  "public",
  "data",
  "refined",
  "day",
  "provincial_parties_score_day.json",
);

export async function loadParties(): Promise<PartiesData | null> {
  const raw = await fs.readFile(PARTIES_JSON_PATH, "utf8");
  const rows = JSON.parse(raw) as Row[];
  const stats = computeStats(rows);
  if (!stats) return null;
  return {
    ranges: {
      today: buildRangeView(stats, "today"),
      week: buildRangeView(stats, "week"),
      month: buildRangeView(stats, "month"),
    },
  };
}
