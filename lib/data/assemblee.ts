// Build-time loader for the "Que dit-on à l'Assemblée ?" section.
//
// Reads /public/data/agora/agora_decideurs_qc.json from disk, applies the
// same transformations as the legacy public/js/assemblee-qc.js (enjeu stack
// truncation, lexical-richness scaling, tone amplification, French date
// formatting), and returns one PeriodView per tab (last_pdq / session /
// legislature) ready for React.

import fs from "node:fs/promises";
import path from "node:path";
import { PARTY_KEYS, PARTY_LABELS, type PartyKey } from "@/lib/data/parties";
import { lastUpdatedLabel } from "@/lib/dates";

const TONE_AMPLIFY = 10;

export type IssueKey =
  | "economy_and_labour"
  | "governments_and_governance"
  | "health_and_social_services"
  | "environment_and_energy"
  | "rights_liberties_minorities_discrimination"
  | "culture_and_nationalism"
  | "education"
  | "international_affairs_and_defense"
  | "law_and_crime"
  | "public_lands_and_agriculture"
  | "immigration"
  | "technology";

export type IssueMeta = {
  key: IssueKey;
  color: string;
  label: string;
  title: string;
};

export const ISSUE_META: IssueMeta[] = [
  { key: "economy_and_labour", color: "#742630", label: "Économie", title: "Économie et travail" },
  { key: "governments_and_governance", color: "#6F5828", label: "Gouv.", title: "Gouvernements et gouvernance" },
  { key: "health_and_social_services", color: "#7D5358", label: "Santé", title: "Santé et services sociaux" },
  { key: "environment_and_energy", color: "#5F6E36", label: "Environ.", title: "Environnement et énergie" },
  { key: "rights_liberties_minorities_discrimination", color: "#5F4E78", label: "Droits", title: "Droits, libertés, minorités" },
  { key: "culture_and_nationalism", color: "#35604E", label: "Culture", title: "Culture et nationalisme" },
  { key: "education", color: "#7A5A23", label: "Éduc.", title: "Éducation" },
  { key: "international_affairs_and_defense", color: "#304860", label: "Aff. int.", title: "Affaires internationales" },
  { key: "law_and_crime", color: "#463E3E", label: "Loi", title: "Loi et crime" },
  { key: "public_lands_and_agriculture", color: "#7D5132", label: "Terres", title: "Terres publiques, agri." },
  { key: "immigration", color: "#8B6914", label: "Immig.", title: "Immigration" },
  { key: "technology", color: "#3A5F70", label: "Tech.", title: "Technologie" },
];

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export type PeriodKey = "last_pdq" | "session" | "legislature";

const PERIOD_TAB_LABELS: Record<PeriodKey, string> = {
  last_pdq: "Dernière période de questions",
  session: "Cette session",
  legislature: "Cette législature",
};

type IssueShares = Partial<Record<IssueKey, number>>;

type AgoraRow = IssueShares & {
  period_type: PeriodKey;
  period_start_date: string;
  period_end_date: string;
  party: string;
  n_interventions: number;
  word_count: number;
  lexical_richness: number;
  tone_score: number;
  editorial_angle: string;
};

export type EnjeuSegment = {
  color: string;
  widthPct: number;
  label: string;
  title: string;
  isReste?: boolean;
};

export type AssembleeRow = {
  key: PartyKey;
  label: string;
  inShadow: boolean;
  // Active-row fields (when not in shadow):
  enjeuStack?: EnjeuSegment[];
  editorialAngle?: string;
  toneLeftPct?: number;
  wordsFormatted?: string;
  richnessLevel?: number;
};

export type PeriodView = {
  period: PeriodKey;
  tabLabel: string;
  subtitle: string;
  /** « Dernière mise à jour : jeudi 4 juin 2026 » — date de la dernière séance
   *  (period_end_date). NB : la publication des transcriptions peut prendre
   *  plusieurs semaines (cf. SourceTip) — la date reflète la séance, pas le fetch. */
  lastUpdated: string;
  rows: AssembleeRow[];
};

export type AssembleeData = {
  periods: Record<PeriodKey, PeriodView>;
};

function fmtDateFr(dateStr: string): string {
  const parts = String(dateStr || "").split("-");
  if (parts.length < 3) return dateStr || "";
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  return `${day} ${MONTHS_FR[month]} ${parts[0]}`;
}

function fmtWords(n: number): string {
  // Non-breaking space thousands separator (12840 → "12 840"), matches the
  // legacy renderer.
  const s = String(Math.round(n || 0));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += " ";
    out += s[i];
  }
  return out;
}

function computeRichnessLevels(mattrs: Record<string, number>): Record<string, number> {
  // Normalize MATTR values across active parties → 1–5 levels (relative
  // scaling). Within 0.01 of each other → all 3.
  const keys = Object.keys(mattrs);
  if (keys.length === 0) return {};
  const values = keys.map((k) => mattrs[k]);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal;
  const result: Record<string, number> = {};
  for (const k of keys) {
    result[k] = range < 0.01
      ? 3
      : Math.max(1, Math.round(1 + ((mattrs[k] - minVal) / range) * 4));
  }
  return result;
}

function buildEnjeuStack(row: AgoraRow): EnjeuSegment[] {
  const segments = ISSUE_META
    .map((meta) => ({ meta, val: Number(row[meta.key] || 0) }))
    .filter((s) => s.val >= 0.04)
    .sort((a, b) => b.val - a.val);

  let cumul = 0;
  const kept: typeof segments = [];
  for (const seg of segments) {
    if (cumul < 0.8) {
      kept.push(seg);
      cumul += seg.val;
    }
  }

  const stack: EnjeuSegment[] = kept.map((seg) => {
    const pct = Math.round(seg.val * 100);
    return {
      color: seg.meta.color,
      widthPct: pct,
      label: seg.meta.label,
      title: `${seg.meta.title} · ${pct} %`,
    };
  });

  const reste = Math.max(0, 1 - cumul);
  if (reste > 0.02) {
    const pct = Math.round(reste * 100);
    stack.push({
      color: "",
      widthPct: pct,
      label: "Reste",
      title: `Autres enjeux · ${pct} %`,
      isReste: true,
    });
  }
  return stack;
}

function buildSubtitle(periodType: PeriodKey, endDate: string): string {
  if (periodType === "last_pdq") {
    return `Période de questions du ${fmtDateFr(endDate)} · Salon bleu`;
  }
  if (periodType === "session") {
    return `Session ${String(endDate || "").slice(0, 4)} · Salon bleu`;
  }
  return `Législature ${String(endDate || "").slice(0, 4)} · Salon bleu`;
}

function buildPeriodView(allRows: AgoraRow[], period: PeriodKey): PeriodView {
  const rows = allRows.filter((r) => r.period_type === period);
  const endDate = rows[0]?.period_end_date || "";

  // Map party → row, preserving the static PARTY_KEYS order then re-sorting
  // by interventions descending.
  type WithData = { key: PartyKey; data: AgoraRow | null; interventions: number };
  const sorted: WithData[] = PARTY_KEYS.map((key) => {
    const partyData = rows.find((r) => r.party && r.party.toLowerCase() === key) || null;
    return { key, data: partyData, interventions: partyData?.n_interventions || 0 };
  });
  sorted.sort((a, b) => b.interventions - a.interventions);

  const mattrs: Record<string, number> = {};
  for (const item of sorted) {
    if (item.interventions > 0 && item.data) {
      mattrs[item.key] = Number(item.data.lexical_richness || 0);
    }
  }
  const richnessLevels = computeRichnessLevels(mattrs);

  const builtRows: AssembleeRow[] = sorted.map((item): AssembleeRow => {
    const isShadow = !(item.interventions > 0 && item.data);
    if (isShadow || !item.data) {
      return { key: item.key, label: PARTY_LABELS[item.key], inShadow: true };
    }
    const d = item.data;
    const amplified = Math.max(-1, Math.min(1, Number(d.tone_score || 0) * TONE_AMPLIFY));
    return {
      key: item.key,
      label: PARTY_LABELS[item.key],
      inShadow: false,
      enjeuStack: buildEnjeuStack(d),
      editorialAngle: d.editorial_angle && d.editorial_angle !== "NA" ? d.editorial_angle : "",
      toneLeftPct: Number((((amplified + 1) / 2) * 100).toFixed(1)),
      wordsFormatted: fmtWords(d.word_count),
      richnessLevel: richnessLevels[item.key] || 1,
    };
  });

  return {
    period,
    tabLabel: PERIOD_TAB_LABELS[period],
    subtitle: buildSubtitle(period, endDate),
    lastUpdated: lastUpdatedLabel(endDate),
    rows: builtRows,
  };
}

const ASSEMBLEE_JSON_PATH = path.resolve(
  process.cwd(),
  "public",
  "data",
  "agora",
  "agora_decideurs_qc.json",
);

export async function loadAssemblee(): Promise<AssembleeData | null> {
  const raw = await fs.readFile(ASSEMBLEE_JSON_PATH, "utf8");
  const allRows = JSON.parse(raw) as AgoraRow[];
  if (!Array.isArray(allRows) || allRows.length === 0) return null;
  return {
    periods: {
      last_pdq: buildPeriodView(allRows, "last_pdq"),
      session: buildPeriodView(allRows, "session"),
      legislature: buildPeriodView(allRows, "legislature"),
    },
  };
}

// Exports réservés aux tests unitaires (pipeline interne ; pas l'API publique).
export const __test__ = {
  fmtDateFr,
  fmtWords,
  computeRichnessLevels,
  buildEnjeuStack,
  buildSubtitle,
  buildPeriodView,
};
