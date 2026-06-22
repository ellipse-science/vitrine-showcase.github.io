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

// Pick the representative article for a promise's coverage.
//
// Deterministic — like the enjeux treemap, which selects its representative item
// by ranking rather than at random. The published `articles` array carries no
// per-article score, so the stable equivalent is the first entry of the coverage
// (same JSON in → same article out, across rebuilds).
//
// Preferred source: the `articles` column — an aligned array of
// {media_id, title, url} where outlet, headline and link are solidary. Falls
// back to the legacy parallel `titles`/`urls` arrays (independently de-duped, so
// only loosely aligned) when `articles` is absent, deriving the outlet from the
// URL host.
function pickArticle(row: Row): ArticleRef | null {
  let articles: { media_id?: string; title?: string; url?: string }[] = [];
  try {
    articles = JSON.parse(row.articles || "[]") as typeof articles;
  } catch {
    /* leave empty */
  }
  const usable = articles.filter((a) => a && a.url && a.title);
  if (usable.length > 0) {
    const a = usable[0];
    const media = (a.media_id && MEDIA_BY_ID[a.media_id]) || mediaFromUrl(a.url!) || "Source";
    const title = cleanArticleTitle(a.title);
    if (title && a.url) return { media, title, url: a.url };
  }

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
  if (n === 0) return null;
  const url = (urls[0] ?? "").trim();
  const title = cleanArticleTitle(titles[0]);
  if (!url || !title) return null;
  return { media: mediaFromUrl(url) ?? "Source", title, url };
}

type Row = {
  country_id: string;
  week_end_date: string;
  pledge_number: string;
  pledge_text_fr: string;
  pledge_en: string;
  verdict: string;
  category: string; // full French category name
  salience_index: number;
  previous_salience_index: number;
  delta_index: number;
  rank_current: number;
  rank_delta: number;
  n_mentions: number;
  titles: string;
  urls: string;
  articles?: string; // JSON array of {media_id, title, url}; absent pre-redeploy
};

type Agg = { salience: number; nMentions: number; row: Row };

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
      out.set(r.pledge_number, { salience: r.salience_index, nMentions: r.n_mentions, row: r });
    } else {
      cur.salience += r.salience_index;
      cur.nMentions += r.n_mentions;
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
        title: shortenPledge(r.pledge_text_fr),
        fullTitle: cleanText(r.pledge_text_fr),
        summary: null, // résumé AI à venir
        verdict: VERDICT_SLUG[r.verdict] ?? null,
        verdictLabel: r.verdict ?? "",
        category: category || null,
        salienceIndex: a.salience,
        nMentions: a.nMentions,
        url: `https://polimeter.org/fr/legault/${num}`,
        trend,
        article: pickArticle(r),
      };
    })
    .sort((x, y) => y.salienceIndex - x.salienceIndex);
}

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

  return { weekEndDate: latestWeek, ranges };
}
