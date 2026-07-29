// Build-time loader for the Polimètre+ section.
//
// Reads /public/data/refined/week/polimetre_plus.json (produced by the
// `polimetre-plus` refiner → vitrine_datamart.polimetre_plus). The refiner
// publishes one weekly snapshot per run; here we derive two views:
//   - "week"  = the latest weekly snapshot
//   - "month" = a rollup of the most recent ~4 weekly snapshots (salience and
//               mentions summed, then re-ranked) — the "past month".
//
// Each promise carries everything the UI needs pre-computed: a short unique
// display title (shortened pledge text), the full pledge text (tooltip), a
// résumé placeholder (AI-generated later), verdict slug, the full French issue
// category, a polimeter.org link, and the rank movement vs the previous window
// (trend arrow — positions gained/lost).
//
// Returns null when the JSON is absent (refiner not yet run) so the section can
// fall back to the static maquette chunk without breaking the build.

import fs from "node:fs/promises";
import path from "node:path";
import { lastUpdatedLabel } from "@/lib/dates";
import type {
  ArticleRef,
  PolimetreData,
  PromiseView,
  RangeKey,
  Trend,
  VerdictSlug,
} from "@/lib/data/polimetre-meta";

export type {
  ArticleRef,
  PolimetreData,
  PromiseView,
  RangeKey,
  Trend,
  VerdictSlug,
} from "@/lib/data/polimetre-meta";

const POLIMETRE_JSON_PATH = path.resolve(
  process.cwd(),
  "public",
  "data",
  "refined",
  "week",
  "polimetre_plus.json",
);

// Number of weekly snapshots rolled up into the "month" view.
const MONTH_WEEKS = 4;

// French verdict label (from mastersheet_Promesses) → CSS/aria slug.
const VERDICT_SLUG: Record<string, VerdictSlug> = {
  "Réalisée": "realisee",
  "Partiellement réalisée": "partielle",
  "En cours": "en-cours",
  "En suspens": "en-suspens",
  "Rompue": "rompue",
};

// Canonical QC francophone outlets — the exact set the refiner ingests
// (QC_FRENCH_MEDIA in polimetre-plus/runtime.R). media_id → display name.
const MEDIA_BY_ID: Record<string, string> = {
  LAP: "La Presse",
  LED: "Le Devoir",
  JDM: "Le Journal de Montréal",
  TVA: "TVA Nouvelles",
  RCI: "Radio-Canada",
};

// Canonical display order of the outlets in the byline. Used to order outlets
// deterministically across the coverage list, since recency keys are only
// comparable within a single outlet. Unknown outlets sort last (alphabetically).
const MEDIA_ORDER: string[] = Object.values(MEDIA_BY_ID);
function mediaRank(media: string): number {
  const i = MEDIA_ORDER.indexOf(media);
  return i === -1 ? MEDIA_ORDER.length : i;
}

// Fallback only: derive the outlet from a URL host, for the transitional period
// before the refiner republishes the `articles` column. Same five outlets.
const MEDIA_BY_HOST: Record<string, string> = {
  "lapresse.ca": "La Presse",
  "ledevoir.com": "Le Devoir",
  "journaldemontreal.com": "Le Journal de Montréal",
  "tvanouvelles.ca": "TVA Nouvelles",
  "radio-canada.ca": "Radio-Canada",
};

function mediaFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [h, name] of Object.entries(MEDIA_BY_HOST)) {
      if (host === h || host.endsWith(`.${h}`)) return name;
    }
    return host;
  } catch {
    return null;
  }
}

// Headlines sometimes carry a trailing " | <Média>" attribution — either the
// display name ("| La Presse") or the outlet code ("| JDM"). Drop it (the outlet
// is shown separately), along with the usual quoting artefacts. Only the final
// pipe segment is removed, and only when it exactly matches a known outlet, so
// La Presse's internal " | …" subtitles are preserved.
const TRAILING_MEDIA = [...Object.keys(MEDIA_BY_ID), ...Object.values(MEDIA_BY_ID)].join("|");
function cleanArticleTitle(s: string | null | undefined): string {
  return cleanText(s)
    .replace(new RegExp(`\\s*\\|\\s*(?:${TRAILING_MEDIA})\\s*$`), "")
    .trim();
}

// Recency key derived from an article URL. QC outlets encode the publication
// order in the path: La Presse / TVA / JDM carry a "/YYYY-MM-DD/" (or
// "/YYYY/MM/DD/") date; Le Devoir and Radio-Canada carry a monotonically
// increasing numeric article id. `date` (YYYYMMDD) sorts lexically; `id` is the
// largest path number. Outlets use one scheme consistently, so the comparison
// only ever runs within a single outlet's coverage.
type Recency = { date: string | null; id: number };

function recencyKey(url: string): Recency {
  const d = url.match(/\/(20\d{2})[-/](\d{2})[-/](\d{2})\//);
  if (d) return { date: `${d[1]}${d[2]}${d[3]}`, id: 0 };
  const ids = [...url.matchAll(/\/(\d{5,})/g)].map((m) => Number(m[1]));
  return { date: null, id: ids.length ? Math.max(...ids) : 0 };
}

// True when `a` is more recent than `b` (same outlet → same scheme).
function isNewer(a: Recency, b: Recency): boolean {
  if (a.date && b.date) return a.date > b.date;
  if (a.date) return true;
  if (b.date) return false;
  return a.id > b.id;
}

// List one article per outlet that covered the promise — the most recent piece
// from each. Within an outlet the recency key is reliable (one URL scheme), so
// the chosen article is genuinely the latest. Across outlets the keys are NOT
// comparable (date-based vs id-based schemes), so the outlets themselves are
// ordered by the canonical QC outlet order (MEDIA_ORDER), not by recency —
// stable and meaningful rather than implying a false cross-outlet chronology.
//
// Preferred source: the `articles` column — an aligned array of
// {media_id, title, url} where outlet, headline and link are solidary. Falls
// back to the legacy parallel `titles`/`urls` arrays (independently de-duped, so
// only loosely aligned) when `articles` is absent, deriving the outlet from the
// URL host. Either way the coverage is grouped by outlet and the URL with the
// most recent recency key wins within that outlet — deterministic across
// rebuilds, never random.
function pickArticlesByMedia(row: Row): ArticleRef[] {
  type Candidate = { media: string; title: string; url: string };
  const candidates: Candidate[] = [];

  let articles: { media_id?: string; title?: string; url?: string }[] = [];
  try {
    articles = JSON.parse(row.articles || "[]") as typeof articles;
  } catch {
    /* leave empty */
  }
  for (const a of articles) {
    const url = (a?.url ?? "").trim();
    const title = cleanArticleTitle(a?.title);
    if (!url || !title) continue;
    const media = (a.media_id && MEDIA_BY_ID[a.media_id]) || mediaFromUrl(url) || "Source";
    candidates.push({ media, title, url });
  }

  if (candidates.length === 0) {
    // Legacy fallback: zip titles/urls over their common length.
    let titles: string[] = [];
    let urls: string[] = [];
    try {
      titles = JSON.parse(row.titles || "[]") as string[];
    } catch {
      /* leave empty */
    }
    try {
      urls = JSON.parse(row.urls || "[]") as string[];
    } catch {
      /* leave empty */
    }
    const n = Math.min(titles.length, urls.length);
    for (let i = 0; i < n; i++) {
      const url = (urls[i] ?? "").trim();
      const title = cleanArticleTitle(titles[i]);
      if (!url || !title) continue;
      candidates.push({ media: mediaFromUrl(url) ?? "Source", title, url });
    }
  }

  // Keep the most recent candidate per outlet.
  const byMedia = new Map<string, { article: ArticleRef; rec: Recency }>();
  for (const c of candidates) {
    const rec = recencyKey(c.url);
    const cur = byMedia.get(c.media);
    if (!cur || isNewer(rec, cur.rec)) {
      byMedia.set(c.media, { article: { media: c.media, title: c.title, url: c.url }, rec });
    }
  }

  // Order outlets by the canonical byline order. Recency keys are not comparable
  // across outlets, so they are not used here; ties (e.g. unknown outlets) fall
  // back to outlet name for a stable order.
  return [...byMedia.values()]
    .sort(
      (x, y) =>
        mediaRank(x.article.media) - mediaRank(y.article.media) ||
        x.article.media.localeCompare(y.article.media, "fr"),
    )
    .map((e) => e.article);
}

type Row = {
  country_id: string;
  week_end_date: string;
  pledge_number: string;
  pledge_text_fr: string;
  verdict: string;
  category: string; // full French category name
  salience_index: number;
  previous_salience_index: number;
  delta_index: number;
  // rank_current, rank_delta et n_mentions sont ABSENTES à dessein : le raffineur
  // les sérialise en INT32 alors que le catalogue Glue les déclare double, ce qui
  // rend la table illisible pour toute requête qui les projette (HIVE_BAD_DATA).
  // Aucune n'était lue — les rangs sont recalculés ici (indispensable : la vue
  // « mois » agrège plusieurs snapshots et reclasse), et n_mentions n'était
  // affichée nulle part. Les exclure met la Vitrine à l'abri de cette dérive de
  // façon permanente, indépendamment de l'état du raffineur. Cf. tables.json.
  titles: string;
  urls: string;
  pledge_short_fr?: string; // AI short label; literal "NA" when LLM unavailable
  coverage_summary_week?: string; // AI weekly summary; literal "NA" when unavailable
  coverage_summary_month?: string; // AI monthly summary; literal "NA" when unavailable
  articles?: string; // JSON array of {media_id, title, url}; absent pre-redeploy
};

type Agg = { salience: number; row: Row };

// Strip Polimètre quoting artefacts («», [], surrounding quotes).
function cleanText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[«»“”]/g, "")
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

// The refiner writes the literal string "NA" (not null) when the LLM enrichment
// (AI short label, AI coverage summary) is unavailable — e.g. the infer-api is
// down during a run. Treat "NA"/empty as "no value" so the title and summary
// fall back gracefully instead of showing a literal "NA".
function realText(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t && t.toUpperCase() !== "NA" ? t : null;
}

// Build a short, unique display title from the full pledge text: drop the
// boilerplate "[Un gouvernement de la CAQ réélu…]" lead-in, then keep the first
// few content words. Each pledge is distinct, so the head is effectively unique.
function shortenPledge(s: string | null | undefined, maxWords = 9): string {
  let t = (s ?? "")
    .replace(/^\s*[«»“”"']*\s*/, "") // leading quotes
    .replace(/^\[[^\]]*\]\s*/, "") // leading bracketed boilerplate
    .replace(/[«»“”]/g, "")
    .replace(/[[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+/, "")
    .trim();
  const words = t.split(" ").filter(Boolean);
  const short = words.slice(0, maxWords).join(" ");
  const out = words.length > maxWords ? `${short}…` : short;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// Sum salience/mentions per promise over a set of weekly snapshots, keeping the
// most recent row as the representative for verdict/category/labels.
function aggregateWeeks(rows: Row[], weeks: Set<string>): Map<string, Agg> {
  const out = new Map<string, Agg>();
  for (const r of rows) {
    if (!weeks.has(r.week_end_date)) continue;
    const cur = out.get(r.pledge_number);
    if (!cur) {
      out.set(r.pledge_number, { salience: r.salience_index, row: r });
    } else {
      cur.salience += r.salience_index;
      if (r.week_end_date > cur.row.week_end_date) cur.row = r;
    }
  }
  return out;
}

function rankMap(agg: Map<string, Agg>): Map<string, number> {
  const sorted = [...agg.entries()].sort((a, b) => b[1].salience - a[1].salience);
  const ranks = new Map<string, number>();
  sorted.forEach(([key], i) => ranks.set(key, i + 1));
  return ranks;
}

function buildView(rows: Row[], currentWeeks: string[], prevWeeks: string[]): PromiseView[] {
  const current = aggregateWeeks(rows, new Set(currentWeeks));
  const currentRanks = rankMap(current);
  const prevRanks = rankMap(aggregateWeeks(rows, new Set(prevWeeks)));

  return [...current.entries()]
    .map(([num, a]): PromiseView => {
      const currRank = currentRanks.get(num) ?? 0;
      const before = prevRanks.get(num);
      const movement = before == null ? 0 : before - currRank; // up = gained positions
      const trend: Trend =
        movement > 0
          ? { dir: "up", delta: movement }
          : movement < 0
            ? { dir: "down", delta: -movement }
            : { dir: "flat", delta: 0 };

      const r = a.row;
      const category = (r.category ?? "").trim();

      return {
        pledgeNumber: num,
        title: realText(r.pledge_short_fr) ?? shortenPledge(r.pledge_text_fr),
        fullTitle: cleanText(r.pledge_text_fr),
        summary: realText(currentWeeks.length > 1 ? r.coverage_summary_month : r.coverage_summary_week),
        verdict: VERDICT_SLUG[r.verdict] ?? null,
        verdictLabel: r.verdict ?? "",
        category: category || null,
        salienceIndex: a.salience,
        url: `https://polimeter.org/fr/legault/${num}`,
        trend,
        articles: pickArticlesByMedia(r),
      };
    })
    .sort((x, y) => y.salienceIndex - x.salienceIndex);
}

// Exported for unit testing only — not part of the public API.
export const __test__ = { realText, shortenPledge, buildView };

export async function loadPolimetre(): Promise<PolimetreData | null> {
  let raw: string;
  try {
    raw = await fs.readFile(POLIMETRE_JSON_PATH, "utf8");
  } catch {
    return null; // refiner has not published yet
  }

  let rows: Row[];
  try {
    rows = (JSON.parse(raw) as Row[]).filter((r) => r && r.country_id === "QC");
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  const weeks = Array.from(new Set(rows.map((r) => r.week_end_date))).sort();
  const latestWeek = weeks[weeks.length - 1];

  const ranges: Record<RangeKey, PromiseView[]> = {
    week: buildView(rows, weeks.slice(-1), weeks.slice(-2, -1)),
    month: buildView(rows, weeks.slice(-MONTH_WEEKS), weeks.slice(-2 * MONTH_WEEKS, -MONTH_WEEKS)),
  };

  if (ranges.week.length === 0 && ranges.month.length === 0) return null;

  return { weekEndDate: latestWeek, lastUpdated: lastUpdatedLabel(latestWeek), ranges };
}
