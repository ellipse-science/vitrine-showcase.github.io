# Reference — Architecture & data flow

Directory layout, what-to-edit map, and the build-time data pipeline. See [`AGENTS.md`](../../AGENTS.md) for the rules and [`CLAUDE.md`](../../CLAUDE.md) for the reference index.

## What to edit (quick reference)

| What | Where |
|------|------|
| UI components and pages | `app/`, `components/`, `lib/` |
| Static non-data HTML chunks | `static-content/*.html` — plain HTML, no JSX |
| Maquette CSS | `app/globals.css` |
| Data loaders (TypeScript) | `lib/data/*.ts` |
| Data pipeline config | `scripts/fetch_data.R`, `scripts/tables.json` |
| JSON data files | **Never edit by hand** — refreshed by the R script |

The legacy CRA app (formerly `src/`) and the static maquette HTML (formerly `public/index.html` + `public/js/*`) were removed in the Next.js migration — see git history.

## Directory tree

```
app/                          Next.js App Router
  layout.tsx                  <html><head> + Google Fonts + globals.css
  page.tsx                    Home page composition
  globals.css                 Maquette CSS, lifted verbatim
components/
  sections/                   Async Server Components — load data at build time, render shells
    UneDesUnesSection.tsx     Une des unes + Deux solitudes (headline-events.json)
    PartisCouvertureSection.tsx
    TreemapSection.tsx        Treemap des enjeux par saillance (issues_score_*.json)
    AssembleeSection.tsx
    PolimetrePlusSection.tsx  Polimètre+ : couverture médiatique des promesses (polimetre_plus.json)
    RawMaquette.tsx           Reads a static-content/*.html chunk and inlines it
  interactive/                'use client' components — React state + behavior
    PartisCouvertureClient.tsx    today / week / month tab switcher
    AssembleeClient.tsx           last_pdq / session / legislature tab switcher
    TreemapClient.tsx             issues treemap today / week / month tab switcher
    PolimetrePlusClient.tsx       week / month tab switcher + filtres catégories/média
    PulseCountdown.tsx            live countdown to next data refresh
lib/
  data/
    parties.ts                Loader for provincial_parties_score_{day,week,month}.json
    assemblee.ts              Loader for agora_decideurs_qc.json
    polimetre.ts              Loader for polimetre_plus.json (week + month rollup)
    polimetre-meta.ts         Types + verdicts/catégories for the Polimètre+ section
    headlineEvents.ts         Two loaders: loadHeadlineEvents() (headline-events.json → UneDesUnesSection)
                              and loadTreemap() (issues_score_{day,week,month}.json → TreemapSection)
static-content/               Verbatim HTML chunks inlined by RawMaquette (chunk name = filename):
                              top.html (masthead), bottom.html (partners + footer),
                              polimeter_plus.html. Embedded via dangerouslySetInnerHTML. Edit as plain HTML.
public/                       Static assets — written to by the data refresher
  data/                       JSON snapshots (build-time source of truth)
  logos/                      Political party logos
  methodologie/               Static methodology page
  favicon*, manifest.json, etc.
scripts/                      R data refresher + Node build helpers
  fetch_data.R                AWS Athena → /public/data/ refresher
  tables.json                 Whitelist of Athena tables to publish
  discover_tables.R           Auto-discovers new tables published by upstream refiners
  postbuild.mjs               Copies /presentation into out/ after next build
presentation/                 RevealJS slide deck (served at /presentation/)
assets/                       art_images/ — style-reference PNGs ({issue}_generic{n}.png) read by
                              scripts/generate_art.py to seed the AI hero illustration. NOT web-served
                              (build/generation input, lives outside public/).
workers/                      report-issue/ — standalone Cloudflare Worker proxying the report-issue
                              dispatch (the target of NEXT_PUBLIC_DISPATCH_URL used by IssueReporter).
docs/                         Operational docs (Cloudflare migration plan, etc.)
llm_context/                  Long-form design + architecture references for LLMs
```

The data loaders in `lib/data/*.ts` read from `path.resolve(cwd, 'public', 'data', ...)` — Next.js's `public/` convention plus our own build-time `fs` reads. The R refresher writes to the same `/public/data/` and doesn't need to know anything about Next.js.

## Data pipeline

Data is pulled from AWS Athena every 4 hours by `scripts/fetch_data.R`, run via `.github/workflows/refresh-data.yml` triggered externally by [cron-job.org](https://cron-job.org/). The script reads a whitelist of Athena tables from `scripts/tables.json` and writes JSON to `public/data/`. The Next.js build reads `public/data/` at build time → static HTML/JS (no runtime fetch).

**Currently consumed by the build:**
- `headline-events.json` → `lib/data/headlineEvents.ts` → `UneDesUnesSection` (une des unes, deux solitudes) + fallback context for treemap tiles
- `refined/day/issues_score_day.json` + week + month → `lib/data/headlineEvents.ts` → `TreemapSection` (treemap des enjeux avec tabs jour/semaine/mois)
- `refined/day/provincial_parties_score_day.json` + week + month → `lib/data/parties.ts` → `PartisCouvertureSection`
- `agora/agora_decideurs_qc.json` → `lib/data/assemblee.ts` → `AssembleeSection`
- `meta.json` → freshness metadata (no UI binding yet)

**To add a new table:** edit `scripts/tables.json` — append a new entry under `tables` (or flip an existing `enabled: false` to `true`). Each entry declares the Athena source, output path, and the column whitelist. Re-fetching happens on the next 4h cron tick (or manually via the `refresh-data.yml` `workflow_dispatch`). For tables that need a derived/aggregated output, add a `post_process` entry pointing at one of the builders registered in `scripts/fetch_data.R`'s `POST_PROCESSORS` map.

**To auto-discover new tables published by a refiner:** run `Rscript scripts/discover_tables.R` locally. It connects to Athena, lists tables matching `_discover.match_regex` in `scripts/tables.json`, and appends disabled stub entries for any not already in the config. Existing entries are never modified. AWS creds come from the local `.Renviron` (same `AWS_*_DEV` variables `refresh-data.yml` uses).

Several table definitions sit dormant in `scripts/tables.json` with `enabled: false` — the inventory of what's available to switch on when a new section is built (federal partis, reflet summaries, headline events).

**Note:** the 4h data refresh is committed by `.github/workflows/refresh-data.yml` (message `data: refresh …`), not by `fetch_data.R` itself. `deploy.yml` triggers on every push to `develop` with no path filter, so each refresh currently triggers a full Pages rebuild. Reducing that (a path filter, or a `[skip ci]` convention) is tied to the hosting decision; see [`docs/cloudflare-pages-migration.md`](../cloudflare-pages-migration.md).
