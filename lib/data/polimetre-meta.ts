// Client-safe view types and labels for the Polimètre+ section.
//
// Kept separate from polimetre.ts (which imports node:fs) so the client
// component can import these without dragging server-only modules into the
// browser bundle.

export type VerdictSlug =
  | "realisee"
  | "partielle"
  | "en-cours"
  | "en-suspens"
  | "rompue";

export type Trend = { dir: "up" | "down" | "flat"; delta: number };

export type RangeKey = "week" | "month";

export const RANGE_TAB_LABELS: Record<RangeKey, string> = {
  week: "Depuis une semaine",
  month: "Depuis un mois",
};

// The issue category IS its full French name (Polimètre `Catégorie` = the gold
// standard `capp_category`). No English slug is ever used. This list only fixes
// the dropdown display order; the values themselves come from the data.
export const CATEGORY_ORDER: string[] = [
  "Économie et travail",
  "Santé et politiques sociales",
  "Éducation",
  "Environnement et énergie",
  "Gouvernements et gouvernance",
  "Droits, libertés, minorités et discrimination",
  "Culture et nationalisme",
  "Immigration",
  "Terres publiques et agriculture",
  "Technologie",
  "Affaires internationales et défense",
  "Loi et crime",
];

export type PromiseView = {
  pledgeNumber: string;
  title: string; // short, unique display label derived from the pledge text
  fullTitle: string; // full pledge text, cleaned — used as tooltip
  summary: string | null; // résumé (AI-generated, eventually) — null for now
  verdict: VerdictSlug | null;
  verdictLabel: string;
  category: string | null; // full French category name
  salienceIndex: number;
  nMentions: number;
  url: string;
  trend: Trend;
};

export type PolimetreData = {
  weekEndDate: string;
  // One ranked promise list per range. "week" = latest weekly snapshot;
  // "month" = rollup of the most recent ~4 weekly snapshots.
  ranges: Record<RangeKey, PromiseView[]>;
};
