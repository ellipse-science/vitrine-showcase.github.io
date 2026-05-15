# vitrine-showcase.github.io -- CLAUDE.md

## Project purpose

Self-contained repository for **La Vitrine démocratique** — a media-focused data showcase by CLESSN (Université Laval). Source code and deployment configuration in one place. Hosted free on **GitHub Pages**, no AWS infrastructure in this repo.

The site is a single-page editorial dashboard rendered from a designer's maquette (Playfair Display / Source Serif / IBM Plex Mono, paper/ink palette), with data-bound sections hydrated at **build time** from JSON snapshots committed to the repo by an external R script.

---

## Multi-repo ecosystem

This site sits at the end of a pipeline spanning three repositories. When something looks broken, check which layer owns it.

| Repo | GitHub org/URL | Purpose | Local clone path (typical) |
|------|---------------|---------|---------------------------|
| `vitrine-showcase.github.io` | [vitrine-showcase/vitrine-showcase.github.io](https://github.com/vitrine-showcase/vitrine-showcase.github.io) | **This repo.** Next.js static site + data fetch scripts. | `~/Dropbox/travail/CLESSN/Projets/vitrine-showcase.github.io/` |
| `aws-refiners` | [ellipse-science/aws-refiners](https://github.com/ellipse-science/aws-refiners) | R Lambda functions that compute scores, aggregations, issue metadata, etc. Each refiner is a subdirectory under `refiners/`. | `~/Documents/aws-refiners/` |
| `aws-infra` | [ellipse-science/aws-infra](https://github.com/ellipse-science/aws-infra) | AWS CDK infrastructure: EventBridge schedules, Lambda definitions, Athena databases, S3 buckets. Refiners are wired up in `lib/data-stacks/refiners/refiners.ts`. | `~/Documents/aws-infra/` |

A colleague may also have these repos cloned locally — check with them before changing shared infra.

---

## AWS backend architecture

Two AWS accounts:
- **PROD** (account `767398150629`): raw ingested data → Athena `datamarts` database
- **DEV** (account `097610011506`): refined / published data → Athena `datamarts` database → S3 → consumed by `scripts/fetch_data.R` in this repo

### How a refiner runs

1. R source lives in `aws-refiners/refiners/<refiner-name>/runtime.R`
2. `aws-infra/lib/data-stacks/refiners/refiners.ts` registers each refiner: ECR image name, EventBridge schedule(s), payload(s)
3. EventBridge triggers the Lambda on schedule → Lambda writes output rows to Athena DEV `datamarts` tables
4. `scripts/fetch_data.R` (in this repo) reads those Athena tables via the `tube` R package and writes JSON to `public/data/`
5. Next.js build reads `public/data/` JSON at build time → static HTML/JS

### How to deploy a refiner change (DEV)

The deployment mechanism is **not** merging to `main`. Instead:

1. Push your branch in `aws-refiners`
2. Open (or update) **PR #102 "Keep open (never merge)"** — a permanent PR from `develop` → `main`
3. Merging your branch **into `develop`** triggers `pr.yml` → ECR push → EventBridge auto-redeploy
4. The CDK construct `RedeployServiceOnNewImagePushedToEcr` (in `aws-infra/lib/construct/redeploy-lambda-image-on-push-ecr-stack.ts`) watches ECR pushes and calls `UpdateFunctionCode` automatically

Never merge PR #102. It exists only to keep the `pr.yml` CI pipeline runnable.

### Schedule times

**All schedule times in `aws-infra/lib/data-stacks/refiners/refiners.ts` are Montreal local time (EDT/EST), NOT UTC.** The comment at the top of that file says so explicitly. EDT = UTC−4, EST = UTC−5. A cron `{ hour: '19', minute: '31' }` fires at 19:31 EDT = 23:31 UTC in summer.

### Active refiners

All refiners have `active: !isProd(envName)` — they run in DEV, not PROD. The pipeline runs in cascade every ~4h; each stage depends on the previous one finishing.

**Pipeline infrastructure (no direct Athena output to site):**

| ECR name | Schedule (Mtl local) | Role |
|----------|---------------------|------|
| `radar-data-preparation` | 6×/day :06 | Prepares article data from PROD |
| `radar-salient-objects` | 6×/day :16 | Extracts salient objects |
| `radar-object-extraction` | 6×/day :24 | Extracts objects per article |
| `radar-salient-index` | 6×/day :42 | Builds salience index |
| `sonar` | Daily 07:00 | Sonar analysis |
| `sonar-heatmaps` | Wednesdays 07:30 | Heatmaps |

**Data refiners (produce Athena tables consumed by the site):**

| ECR name | Athena table(s) (DEV) | Schedule (Mtl local) | Source dir |
|----------|-----------------------|---------------------|-----------|
| `radar-issues-score` | `issues_score_day`, `issues_score_week`, `issues_score_month` | Day: 6×/day :31 · Week: daily 19:35 · Month: daily 19:39 | `refiners/radar-issues-score/` |
| `radar-headlines-issues` | `headline_events_4h` (and weekly/monthly variants) | Day: 3×/day 11:46, 15:46, 19:46 · Week: daily 19:17 · Month: daily 19:20 | `refiners/radar-headlines-issues/` |
| `radar-party-score` | `provincial_parties_score_day/week/month`, `federal_parties_score_day/week/month` | Day: 6×/day :46 · Week: daily 19:35 · Month: daily 19:39 | `refiners/radar-party-score/` |
| `radar-party-score-salient-shadow` | `provincial_parties_score_salient_shadow_*` | Day: 6×/day :31 · Week: daily 19:35 · Month: daily 19:39 | `refiners/radar-party-score-salient-shadow/` |
| `radar-reflet-daily-weekly` | `reflet_day`, `reflet_week` | Day: 3×/day 11:46, 15:46, 19:46 · Week: daily 19:37 | `refiners/radar-reflet-daily-weekly/` |
| `radar-reflet-monthly` | `reflet_month` | Daily 19:40 | `refiners/radar-reflet-monthly/` |
| `radar-headline-of-headlines` | `headline_of_headlines` | 6×/day :46 | `refiners/radar-headline-of-headlines/` |
| `radar-hot-20` | hot-20 data | Fridays 12:00 | `refiners/radar-hot-20/` |
| `vitrine-graph-data` | graph data tables | 6×/day :57 | `refiners/vitrine-graph-data/` |
| `agora-decideurs-qc` | `agora_decideurs_qc` | 6×/day :50 | `refiners/agora-decideurs-qc/` |

### Inspecting Athena data directly from R

If you need to verify what's actually in a DEV table, load credentials from the local `.Renviron` and query Athena directly:

```r
library(tube)
conn <- ellipse_connect(env = "DEV", database = "datamarts")
# Note: DEV table names use a dash — must be quoted
df <- DBI::dbGetQuery(conn, 'SELECT * FROM "vitrine_datamart-issues_score_day" LIMIT 10')
DBI::dbDisconnect(conn)
```

The `.Renviron` at `~/.Renviron` (or in the repo root) must contain:
```
AWS_ACCESS_KEY_ID_DEV=...
AWS_SECRET_ACCESS_KEY_DEV=...
AWS_REGION=ca-central-1
```

Never commit credentials. The same variable names are used as GitHub Actions secrets in `refresh-data.yml`.

---

## Stack

- **Next.js 16** (App Router) with **static export** (`output: 'export'`) → produces a plain `out/` directory of HTML/CSS/JS
- **React 19** Server Components for the data-bound sections, Client Components for interactive bits (tabs, countdown)
- **TypeScript strict**
- No CSS framework: the maquette's CSS lives verbatim in `app/globals.css`
- No backend, no API routes, no SSR — pure SSG

## Start the dev server

```bash
npm install   # if node_modules missing
npm run dev   # http://localhost:3000
```

## Build for production

```bash
npm run build   # next build → out/, then scripts/postbuild.mjs copies /presentation
```

## Deployment

- **Push to `main`** triggers `.github/workflows/deploy.yml` → publishes `out/` to GitHub Pages
- **Pull requests** trigger `.github/workflows/ci.yml` → type-check + build, no deploy
- Site at `https://vitrine-showcase.github.io/`
- **No AWS credentials, no S3, no CloudFront** — zero cost
- Cloudflare Pages migration is a separate, deferred decision (see [`docs/cloudflare-pages-migration.md`](./docs/cloudflare-pages-migration.md))

To enable GitHub Pages (one-time setup): Repo Settings → Pages → Source: "GitHub Actions"

### AWS safety rules (deployment only)

This repo has **no AWS deployment path**. Do not add or restore any of the following:
- `aws-actions/configure-aws-credentials` in any workflow
- S3, CloudFront, or AWS deployment secrets
- Any workflow that pushes `out/` to S3 or invalidates a CloudFront distribution

If old docs or git history mention AWS deployment, treat that as historical context — the site was migrated to GitHub Pages. AWS credentials in this repo are **read-only data fetching** (`refresh-data.yml`), never deployment.

---

## What to edit (quick reference)

| What | Where |
|------|-------|
| UI components and pages | `app/`, `components/`, `lib/` |
| Static non-data HTML chunks | `static-content/*.html` — plain HTML, no JSX |
| Maquette CSS | `app/globals.css` |
| Data loaders (TypeScript) | `lib/data/*.ts` |
| Data pipeline config | `scripts/fetch_data.R`, `scripts/tables.json` |
| JSON data files | **Never edit by hand** — refreshed by the R script |

The legacy CRA app (formerly in `src/`) and the static maquette HTML (formerly `public/index.html` + `public/js/*`) were removed in the Next.js migration — see git history.

---

## Architecture

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
    RawMaquette.tsx           Reads a static-content/*.html chunk and inlines it
  interactive/                'use client' components — React state + behavior
    PartisCouvertureClient.tsx    today / week / month tab switcher
    AssembleeClient.tsx           last_pdq / session / legislature tab switcher
    TreemapClient.tsx             issues treemap today / week / month tab switcher
    PulseCountdown.tsx            live countdown to next data refresh
lib/
  data/
    parties.ts                Loader for provincial_parties_score_{day,week,month}.json
    assemblee.ts              Loader for agora_decideurs_qc.json
    headlineEvents.ts         Two loaders: loadHeadlineEvents() (headline-events.json → UneDesUnesSection)
                              and loadTreemap() (issues_score_{day,week,month}.json → TreemapSection)
static-content/               Verbatim HTML chunks (masthead, treemap, partners, footer).
                              Embedded via dangerouslySetInnerHTML. Edit as plain HTML.
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
docs/                         Operational docs (Cloudflare migration plan, etc.)
llm_context/                  Long-form design + architecture references for LLMs
```

The data loaders in `lib/data/*.ts` read from `path.resolve(cwd, 'public', 'data', ...)` — Next.js's public/ convention plus our own build-time fs reads. The R refresher writes to the same `/public/data/` and doesn't need to know anything about Next.js.

---

## Data

Data is pulled from AWS Athena every 4 hours by `scripts/fetch_data.R`, run via `.github/workflows/refresh-data.yml` triggered externally by [cron-job.org](https://cron-job.org/). The script reads a whitelist of Athena tables from `scripts/tables.json` and writes JSON to `public/data/`.

**Currently consumed by the build:**
- `headline-events.json` → `lib/data/headlineEvents.ts` → `UneDesUnesSection` (une des unes, deux solitudes) + fallback context for treemap tiles
- `refined/day/issues_score_day.json` + `refined/week/issues_score_week.json` + `refined/month/issues_score_month.json` → `lib/data/headlineEvents.ts` → `TreemapSection` (treemap des enjeux avec tabs jour/semaine/mois)
- `refined/day/provincial_parties_score_day.json` + week + month → `lib/data/parties.ts` → `PartisCouvertureSection`
- `agora/agora_decideurs_qc.json` → `lib/data/assemblee.ts` → `AssembleeSection`
- `meta.json` → freshness metadata (no UI binding yet)

**To add a new table:** edit `scripts/tables.json` — append a new entry under `tables` (or flip an existing `enabled: false` to `true`). Each entry declares the Athena source, output path, and the column whitelist. Re-fetching happens on the next 4h cron tick (or manually via the `refresh-data.yml` workflow_dispatch). For tables that need a derived/aggregated output, add a `post_process` entry pointing at one of the builders registered in `scripts/fetch_data.R`'s `POST_PROCESSORS` map.

**To auto-discover new tables published by a refiner:** run `Rscript scripts/discover_tables.R` locally. It connects to Athena, lists tables matching `_discover.match_regex` in `scripts/tables.json`, and appends disabled stub entries for any not already in the config. Existing entries are never modified. AWS creds come from the local `.Renviron` (same `AWS_*_DEV` variables `refresh-data.yml` uses).

Several table definitions sit dormant in `scripts/tables.json` with `enabled: false` — the inventory of what's available to switch on when a new section is built (federal partis, reflet summaries, headline events).

**Note:** `scripts/fetch_data.R` currently appends `[skip ci]` to its commit messages to keep the GitHub Pages deploy from rebuilding on every 4h refresh. Whether to remove this is tied to the hosting decision; see `docs/cloudflare-pages-migration.md`.

---

## issues_score_day schema and `issues_meta`

The `radar-issues-score` refiner produces rows in **wide format** — one row per `(date_utc, tag, pass)`, with one numeric column per issue. Consumed by `loadTreemap()` in `lib/data/headlineEvents.ts`.

| Column | Type | Notes |
|--------|------|-------|
| `date_utc` | string `YYYY-MM-DD` | UTC date of the articles scored |
| `date_montreal_tz` | string `YYYY-MM-DD` | Same date in Montreal timezone |
| `tag` | string | Run tag (e.g. `2026-05-14T19:31`) — latest tag = most recent run |
| `pass` | string | `"am"`, `"noon"`, or `"pm"` — article window scored |
| `issues_meta` | JSON string | `{"issue_key": {"label": "...", "obj": "..."}}` — top article info per issue |
| *(one column per issue key)* | numeric | Salience score for that issue on that date/pass |

`issues_meta` is a JSON string. An empty run produces `"{}"`. `parseIssuesMeta()` decodes it; if empty/null, `loadFallbackIssueContent()` cross-references `headline-events.json` to build fallback topObject and context.

`loadTreemap()` selects all rows sharing the latest `tag`, sums each issue column across those rows, and sorts descending to produce the period ranking (week = sum over 7 days in the latest tag's window, month = sum over ~29 days).

**ISSUE_KEYS — English column names (as in JSON and Athena) with French display labels:**

| Column / key | French label (UI) |
|-------------|------------------|
| `economy_and_labour` | Économie et travail |
| `governments_and_governance` | Gouvernements |
| `health_and_social_services` | Santé |
| `environment_and_energy` | Environnement |
| `rights_liberties_minorities_discrimination` | Droits et libertés |
| `culture_and_nationalism` | Culture |
| `education` | Éducation |
| `international_affairs_and_defense` | Aff. internationales |
| `law_and_crime` | Loi et crime |
| `public_lands_and_agriculture` | Terres publiques |
| `immigration` | Immigration |
| `technology` | Technologie |

These match `ISSUE_COLORS` and `ISSUE_LABELS_SHORT` in `lib/data/headlineEvents.ts` exactly. The `ISSUE_KEYS` constant is `Object.keys(ISSUE_COLORS)`.

## headline_events_4h schema

The `radar-headlines-issues` refiner produces `headline_events_4h` — one row per event per time interval per region. Published as `public/data/headline-events.json`. Consumed by `loadHeadlineEvents()` for `UneDesUnesSection`.

Key columns used by the frontend:

| Column | Notes |
|--------|-------|
| `event_id` | Deduplicated — QC `target_region` row preferred over others |
| `country_id` | `"QC"`, `"CAN"`, `"USA"` — USA rows filtered out |
| `date_utc`, `date_montreal_tz` | Date of the interval |
| `time_interval_utc`, `time_interval_montreal_tz` | e.g. `"19-23"` |
| `title` | Event headline |
| `main_issue` | English issue key (e.g. `"economy_and_labour"`) |
| `main_issue_text_fr` | French label from refiner |
| `score_saillance` | Overall salience score |
| `score_qc` | QC-specific salience |
| `outlets_qc` | Number of QC outlets covering this event (drives dot count, 1–6) |
| `total_outlets_qc` | Total QC outlets in panel |
| `intensity_tier` | `"Majeur"`, `"Fort"`, `"Moyen"`, `"Faible"` |
| `representative_url` | URL of the most representative article |
| `media_ids` | JSON array of outlet IDs (e.g. `["LED","LAP","RCI"]`) |
| `articles` | JSON array of `{media_id, url, title, ...}` — used for byline links |
| `extracted_objects` | JSON array of `{object, score}` — used for treemap object tiles |
| `interval_convergence_score` | Cosine similarity QC vs ROC (for Deux solitudes) |
| `top_objects_divergence` | JSON array of divergence entries per event label |

---

## Diagnosing frontend vs backend problems

### "The treemap / section looks wrong or stale"

1. **Check `public/data/`**: Is the JSON file present and recent? `ls -la public/data/refined/day/`
2. **Check the last refresh run**: GitHub Actions → `refresh-data.yml` workflow history
3. **Check Athena directly** (see R snippet above): Does the table have recent rows with a recent `tag`?
4. **Is it a frontend transform bug?** Check `lib/data/headlineEvents.ts` — the `buildPeriodData` function aggregates rows. The treemap shows day/week/month tabs; if all three look identical with only a few days of data in the table, that's expected — divergence appears as history accumulates.
5. **Is it a refiner bug?** Check the Lambda logs in CloudWatch (AWS DEV account). Log group name matches the Lambda function name from `aws-infra/lib/data-stacks/refiners/refiners.ts`.

### "The section doesn't update when I click the tabs (day / week / month)"

The data for all three periods is fetched at **build time** and passed as props to the client component. If the tabs appear identical, it usually means:
- Only a few days of data exist yet (expected early on)
- The `tag` tiebreaker in `latestIssueRow()` is picking the wrong row
- The period aggregation in `buildPeriodData()` is summing fewer rows than expected

### "A refiner stopped publishing data"

1. Check AWS DEV CloudWatch for the Lambda log group
2. Check the ECR image was pushed (did `pr.yml` in `aws-refiners` succeed?)
3. Verify the schedule in `aws-infra/lib/data-stacks/refiners/refiners.ts` — remember times are **Montreal local**, not UTC
4. Run the R inspection snippet above to see what's actually in Athena

---

## How to add a new data-bound section

1. Add the table to `scripts/tables.json` if not already there. Wait for it to refresh into `/public/data/...`.
2. In `lib/data/`, add a typed loader (`fs.readFile` from `path.resolve(cwd, 'public', 'data', ...)`). Pre-compute every value the UI will display.
3. In `components/sections/`, add an async Server Component that calls the loader.
4. If the section has interactive bits (tabs, filters, etc.), add a Client Component (`'use client'`) in `components/interactive/` that receives the pre-computed data as props.
5. Wire into `app/page.tsx`.

Use `lib/data/parties.ts` + `components/sections/PartisCouvertureSection.tsx` + `components/interactive/PartisCouvertureClient.tsx` as the canonical example.

## How to modify a refiner

1. Edit `aws-refiners/refiners/<refiner-name>/runtime.R`
2. Test locally if possible (mock data or direct Athena query)
3. Commit and merge to `develop` in `aws-refiners` → ECR push → auto-redeploy to DEV Lambda (via PR #102 mechanism)
4. Inspect output in Athena DEV (R snippet above) or wait for next scheduled run
5. Once validated: open a PR to `main` in `aws-refiners` for production

## How to change a refiner schedule

1. Edit `aws-infra/lib/data-stacks/refiners/refiners.ts` — find the refiner entry, change the `cron` array
2. **Times are Montreal local (EDT/EST), not UTC**
3. Run `yarn lint:ts && yarn lint:eslint && yarn lint:prettier` in `aws-infra` before pushing — prettier is strict (no alignment spaces)
4. Open a PR to `develop` in `aws-infra`; CDK deploy propagates the new schedule

## How to edit a static (non-data) section

The masthead, sub-nav, pulse-band, headlines, treemap, partners, and footer live as raw HTML in `static-content/{top,middle,bottom}.html`. Edit them as plain HTML — they're inlined verbatim via `dangerouslySetInnerHTML`. No JSX gotchas. To make a chunk interactive, JSX-convert it into a proper component (move the markup into a `.tsx`, replace `class` → `className`, etc.) and remove the chunk from `static-content/`.

---

## Context references

- [`design_language.md`](./design_language.md) — palette, typographie, composants, règles visuelles (esthétique journal imprimé)
- [`docs/cloudflare-pages-migration.md`](./docs/cloudflare-pages-migration.md) — plan différé de migration de GitHub Pages vers Cloudflare Pages
