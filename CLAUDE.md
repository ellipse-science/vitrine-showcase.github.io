# vitrine-showcase.github.io -- CLAUDE.md

## Project purpose

Self-contained repository for **La Vitrine démocratique** -- a media-focused data showcase by CLESSN (Université Laval). Contains both the source code and the deployment configuration. Hosted free on **GitHub Pages**, no AWS infrastructure.

The site is a single-page editorial dashboard rendered from a designer's maquette (Playfair Display / Source Serif / IBM Plex Mono, paper/ink palette), with two data-bound sections (`partis-couverture`, `assemblee-qc`) hydrated at **build time** from JSON snapshots committed to the repo by an external R script.

## Stack

- **Next.js 16** (App Router) with **static export** (`output: 'export'`) → produces a plain `out/` directory of HTML/CSS/JS
- **React 19** Server Components for the data-bound sections, Client Components for interactive bits (tabs, countdown)
- **TypeScript strict**
- No CSS framework: the maquette's CSS lives verbatim in `next-site/app/globals.css`
- No backend, no API routes, no SSR — pure SSG

## Start the dev server

```bash
cd next-site
npm install   # if node_modules missing
npm run dev   # dev server on http://localhost:3000
```

## Build for production

```bash
cd next-site
npm run build   # next build → next-site/out/, then scripts/postbuild.mjs
                # copies /public/data, /public/logos, favicons, /presentation
                # into out/
```

## Deployment

Deployment is fully automated via GitHub Actions:
- **Push to `main`** triggers `.github/workflows/deploy.yml`
- The workflow runs `cd next-site && npm ci && npm run build`, then publishes `next-site/out/` to GitHub Pages
- Site served at `https://vitrine-showcase.github.io/`
- **No AWS credentials, no S3, no CloudFront** — zero cost
- Cloudflare Pages migration is a separate, deferred decision (see `docs/cloudflare-pages-migration.md`)

To enable GitHub Pages (one-time setup):
- Repo Settings → Pages → Source: "GitHub Actions"

## Architecture

```
next-site/                          # The Next.js project — all UI lives here
  next.config.ts                    # output: 'export', images.unoptimized, trailingSlash
  app/
    layout.tsx                      # <html><head> + Google Fonts + globals.css import
    page.tsx                        # Home page composition
    globals.css                     # Maquette CSS, lifted verbatim from the original HTML
  components/
    sections/                       # Server Components — load data, render shells
      PartisCouvertureSection.tsx
      AssembleeSection.tsx
      RawMaquette.tsx               # Reads a static-content/*.html chunk and inlines it
    interactive/                    # 'use client' components — React state + behavior
      PartisCouvertureClient.tsx    # today / week / month tab switcher
      AssembleeClient.tsx           # last_pdq / session / legislature tab switcher
      PulseCountdown.tsx            # Live countdown to next data refresh
  lib/
    data/
      parties.ts                    # Loader + transformations for provincial_parties_score_day.json
      assemblee.ts                  # Loader + transformations for agora_decideurs_qc.json
  static-content/                   # Verbatim HTML chunks (masthead, treemap, partners, footer)
                                    # Embedded via dangerouslySetInnerHTML; edit as plain HTML
  scripts/postbuild.mjs             # Copies /public + /presentation into out/
public/                             # Repo-root static assets — written to by the data refresher
  data/                             # Static JSON data files (source of truth for build-time loading)
  logos/                            # Canadian political party logos
  favicon*, manifest.json, etc.
presentation/                       # RevealJS slide deck (served at /presentation/)
scripts/                            # R data refresher (refresh-data.yml workflow uses this)
  fetch_data.R
  tables.json
  discover_tables.R
docs/                               # Operational docs (CF migration plan, etc.)
llm_context/                        # Long-form design + architecture references for LLMs
```

**Important:** the data loaders in `next-site/lib/data/*.ts` read from `path.resolve(cwd, '..', 'public', 'data', ...)` — i.e., they reach UP from `next-site/` into the repo's `/public/data/`. This decouples the data-pipeline path from the Next.js project path; the R refresher doesn't need to know about Next.js.

## Data

Data is pulled from AWS Athena every 4h by `scripts/fetch_data.R`, run via `refresh-data.yml` triggered externally by cron-job.org. The script reads a whitelist of Athena tables and post-processed files from `scripts/tables.json` and writes JSON to `public/data/`.

**Currently consumed by the build:**
- `refined/day/provincial_parties_score_day.json` → `lib/data/parties.ts` → partis-couverture section
- `agora/agora_decideurs_qc.json` → `lib/data/assemblee.ts` → assemblée section
- `meta.json` → freshness metadata (no UI binding yet)

**To add a new table:** edit `scripts/tables.json` — append a new entry under `tables` (or flip an existing `enabled: false` to `true`). Each entry declares the Athena source, output path, and the column whitelist. Re-fetching happens on the next 4h cron tick (or manually via the `refresh-data.yml` workflow_dispatch). For tables that need a derived/aggregated output, add a `post_process` entry pointing at one of the builders registered in `scripts/fetch_data.R`'s `POST_PROCESSORS` map.

**To auto-discover new tables published by a refiner:** run `Rscript scripts/discover_tables.R` locally. It connects to Athena, lists tables matching `_discover.match_regex` in `scripts/tables.json`, and appends disabled stub entries for any not already in the config. Existing entries are never modified. AWS creds come from the local `.Renviron` (same `AWS_*_DEV` variables `refresh-data.yml` uses).

13 additional table definitions sit dormant in `scripts/tables.json` with `enabled: false` — the inventory of what's available to switch on when a new section is built (federal partis, issues, reflet summaries, headline of headlines, headline events).

**Note:** `scripts/fetch_data.R` currently appends `[skip ci]` to its commit messages to keep the GitHub Pages deploy from rebuilding on every 4h refresh. Whether to remove this is tied to the hosting decision; see `docs/cloudflare-pages-migration.md`.

## How to add a new data-bound section

1. Add the table to `scripts/tables.json` if not already there. Wait for it to refresh into `/public/data/...`.
2. In `next-site/lib/data/`, add a typed loader (`fs.readFile` from `path.resolve(cwd, '..', 'public', 'data', ...)`). Pre-compute every value the UI will display.
3. In `next-site/components/sections/`, add an async Server Component that calls the loader.
4. If the section has interactive bits (tabs, filters, etc.), add a Client Component (`'use client'`) in `next-site/components/interactive/` that receives the pre-computed data as props.
5. Wire into `app/page.tsx`.

Use `lib/data/parties.ts` + `components/sections/PartisCouvertureSection.tsx` + `components/interactive/PartisCouvertureClient.tsx` as the canonical example.

## How to edit a static (non-data) section

The masthead, sub-nav, pulse-band, headlines, treemap, partners, and footer live as raw HTML chunks in `next-site/static-content/{top,middle,bottom}.html`. Edit them as plain HTML — they're inlined verbatim via `dangerouslySetInnerHTML`. No JSX gotchas. To make a chunk interactive, JSX-convert it into a proper component (move the markup into a `.tsx`, replace `class` → `className`, etc.) and remove the chunk from `static-content/`.

## Context references

- `design_language.md` — design language specification
- `llm_context/vision_design_maquette.md` — visual design principles
- `llm_context/architecture_narrative_accueil.md` — homepage narrative flow
- `llm_context/architecture_donnees_raffineurs.md` — data pipeline overview (historical)
- `llm_context/best_practices_ui_ux.md` — UI/UX guidelines
- `docs/cloudflare-pages-migration.md` — deferred plan to migrate from GitHub Pages to Cloudflare Pages
