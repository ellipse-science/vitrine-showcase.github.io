# vitrine-showcase.github.io -- CLAUDE.md

## Project purpose

Self-contained repository for **La Vitrine démocratique** — a media-focused data showcase by CLESSN (Université Laval). Source code and deployment configuration in one place. Hosted free on **GitHub Pages**, no AWS infrastructure.

The site is a single-page editorial dashboard rendered from a designer's maquette (Playfair Display / Source Serif / IBM Plex Mono, paper/ink palette), with two data-bound sections (`partis-couverture`, `assemblee-qc`) hydrated at **build time** from JSON snapshots committed to the repo by an external R script.

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

## Architecture

```
app/                          Next.js App Router
  layout.tsx                  <html><head> + Google Fonts + globals.css
  page.tsx                    Home page composition
  globals.css                 Maquette CSS, lifted verbatim
components/
  sections/                   Async Server Components — load data at build time, render shells
    PartisCouvertureSection.tsx
    AssembleeSection.tsx
    RawMaquette.tsx           Reads a static-content/*.html chunk and inlines it
  interactive/                'use client' components — React state + behavior
    PartisCouvertureClient.tsx    today / week / month tab switcher
    AssembleeClient.tsx           last_pdq / session / legislature tab switcher
    PulseCountdown.tsx            live countdown to next data refresh
lib/
  data/
    parties.ts                Loader + transformations for provincial_parties_score_day.json
    assemblee.ts              Loader + transformations for agora_decideurs_qc.json
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

## Data

Data is pulled from AWS Athena every 4 hours by `scripts/fetch_data.R`, run via `.github/workflows/refresh-data.yml` triggered externally by [cron-job.org](https://cron-job.org/). The script reads a whitelist of Athena tables from `scripts/tables.json` and writes JSON to `public/data/`.

**Currently consumed by the build:**
- `refined/day/provincial_parties_score_day.json` → `lib/data/parties.ts` → partis-couverture section
- `agora/agora_decideurs_qc.json` → `lib/data/assemblee.ts` → assemblée section
- `meta.json` → freshness metadata (no UI binding yet)

**To add a new table:** edit `scripts/tables.json` — append a new entry under `tables` (or flip an existing `enabled: false` to `true`). Each entry declares the Athena source, output path, and the column whitelist. Re-fetching happens on the next 4h cron tick (or manually via the `refresh-data.yml` workflow_dispatch). For tables that need a derived/aggregated output, add a `post_process` entry pointing at one of the builders registered in `scripts/fetch_data.R`'s `POST_PROCESSORS` map.

**To auto-discover new tables published by a refiner:** run `Rscript scripts/discover_tables.R` locally. It connects to Athena, lists tables matching `_discover.match_regex` in `scripts/tables.json`, and appends disabled stub entries for any not already in the config. Existing entries are never modified. AWS creds come from the local `.Renviron` (same `AWS_*_DEV` variables `refresh-data.yml` uses).

Several table definitions sit dormant in `scripts/tables.json` with `enabled: false` — the inventory of what's available to switch on when a new section is built (federal partis, issues, reflet summaries, headline events).

**Note:** `scripts/fetch_data.R` currently appends `[skip ci]` to its commit messages to keep the GitHub Pages deploy from rebuilding on every 4h refresh. Whether to remove this is tied to the hosting decision; see `docs/cloudflare-pages-migration.md`.

## How to add a new data-bound section

1. Add the table to `scripts/tables.json` if not already there. Wait for it to refresh into `/public/data/...`.
2. In `lib/data/`, add a typed loader (`fs.readFile` from `path.resolve(cwd, 'public', 'data', ...)`). Pre-compute every value the UI will display.
3. In `components/sections/`, add an async Server Component that calls the loader.
4. If the section has interactive bits (tabs, filters, etc.), add a Client Component (`'use client'`) in `components/interactive/` that receives the pre-computed data as props.
5. Wire into `app/page.tsx`.

Use `lib/data/parties.ts` + `components/sections/PartisCouvertureSection.tsx` + `components/interactive/PartisCouvertureClient.tsx` as the canonical example.

## How to edit a static (non-data) section

The masthead, sub-nav, pulse-band, headlines, treemap, partners, and footer live as raw HTML in `static-content/{top,middle,bottom}.html`. Edit them as plain HTML — they're inlined verbatim via `dangerouslySetInnerHTML`. No JSX gotchas. To make a chunk interactive, JSX-convert it into a proper component (move the markup into a `.tsx`, replace `class` → `className`, etc.) and remove the chunk from `static-content/`.

## Context references

- [`design_language.md`](./design_language.md) — design language specification
- [`llm_context/vision_design_maquette.md`](./llm_context/vision_design_maquette.md) — visual design principles
- [`llm_context/architecture_narrative_accueil.md`](./llm_context/architecture_narrative_accueil.md) — homepage narrative flow
- [`llm_context/architecture_donnees_raffineurs.md`](./llm_context/architecture_donnees_raffineurs.md) — data pipeline overview (historical)
- [`llm_context/best_practices_ui_ux.md`](./llm_context/best_practices_ui_ux.md) — UI/UX guidelines
- [`docs/cloudflare-pages-migration.md`](./docs/cloudflare-pages-migration.md) — deferred plan to migrate from GitHub Pages to Cloudflare Pages
