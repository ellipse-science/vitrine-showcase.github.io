# vitrine-showcase.github.io -- CLAUDE.md

## Project purpose

This is the self-contained repository for **La Vitrine** -- a media-focused data showcase produced by CLESSN (Universite Laval). It contains both the source code and the deployment configuration. The site is hosted for free on **GitHub Pages** -- no AWS infrastructure is involved.

The site focuses on the **MEDIA** data module, displaying media coverage visualizations based on static JSON data snapshots.

## Start the dev server

```bash
yarn install   # if node_modules missing
yarn start     # dev server on http://localhost:3000
```

## Build for production

```bash
yarn build     # builds into build/ using .env.production
               # postbuild copies index.html to 404.html for SPA routing
```

## Deployment

Deployment is fully automated via GitHub Actions:
- **Push to `main`** triggers `.github/workflows/deploy.yml`
- The workflow builds the app, includes the `presentation/` folder, and deploys to GitHub Pages
- The site is served at `https://vitrine-showcase.github.io/`
- **No AWS credentials, no S3, no CloudFront** -- zero cost

To enable GitHub Pages (one-time setup):
- Go to repo Settings > Pages > Source: set to "GitHub Actions"

## Design language

- **Background:** White (`#fff`) -- no dark mode
- **Fonts:** `Superpose` (body), `Superdot` (headings/accents) -- licensed, see `src/assets/styles/fonts/EULA_Web-License_Julien-Hebert.pdf`
- **Color palette:** Defined in `src/assets/styles/variables.module.scss`
  - accent2 (yellow `#feec20`) / accent2-dark (`#d2be17`) = MEDIA category color
- **Design principles:** Edward Tufte data density, bento grids, Scrollytelling -- see `llm_context/vision_design_maquette.md`

## Architecture

```
src/
  components/
    shared/        -- nav, footer, buttons, reusable UI (App, Home, MainNavbar, etc.)
    citoyens/      -- Citoyens section modules (EnjuModule)
    decideurs/     -- Decideurs section modules (PartisModule, ParoleEnChambre)
    medias/        -- Medias section modules (MediaTreemap, UneDesUnes, ConstellationModule, CouverturePartisModule)
  api/             -- Axios clients (chartClient, blogClient) -- currently inactive (no API URLs configured)
  context/         -- React context providers (DataContext, ArticlesContext) -- gracefully degrade without APIs
  assets/styles/   -- SCSS variables, fonts, global styles
  plugins/i18n/    -- FR/EN translations (fr.ts, en.ts)
public/
  data/            -- Static JSON data files (media-treemap, ticker, headlines, parties, etc.)
  logos/           -- Canadian political party logos
presentation/      -- RevealJS slide deck (served at /presentation/)
```

## Data

Data is pulled from AWS Athena every 4h by `scripts/fetch_data.R`, run via
`refresh-data.yml` triggered externally by cron-job.org. The script reads a
whitelist of Athena tables and post-processed files from `scripts/tables.json`
and writes JSON to `public/data/`.

**Currently in production:**
- `refined/day/provincial_parties_score_day.json` -- consumed by `public/js/partis-couverture.js`
- `agora/agora_decideurs_qc.json` -- consumed by `public/js/assemblee-qc.js`
- `meta.json` -- status / freshness for the `/status` page

**To add a new table:** edit `scripts/tables.json` -- append a new entry under
`tables` (or flip an existing `enabled: false` to `true`). Each entry declares
the Athena source, output path, and the column whitelist. Re-fetching happens
on the next 4h cron tick (or manually via the `refresh-data.yml`
workflow_dispatch). For tables that need a derived/aggregated output, add a
`post_process` entry pointing at one of the builders registered in
`scripts/fetch_data.R`'s `POST_PROCESSORS` map.

**To auto-discover new tables published by a refiner:** run
`Rscript scripts/discover_tables.R` locally. It connects to Athena, lists
tables matching `_discover.match_regex` in `scripts/tables.json`, and appends
disabled stub entries for any that aren't already in the config. Existing
entries are never modified. After the script runs you review the stubs
(default output paths, full column lists), edit `used_by` to point at the
hydrator that will consume the data, and flip `enabled: true` on what you
want to publish. Commit when done. AWS creds for the script come from the
local `.Renviron` (same `AWS_*_DEV` variables `refresh-data.yml` uses).

13 additional table definitions sit dormant in `scripts/tables.json` with
`enabled: false` -- the inventory of what's available to switch on when a new
hydrator is built (federal partis, issues, reflet summaries, headline of
headlines, headline events).

## Feature flags (.env.production)

| Flag | Value | Effect |
|------|-------|--------|
| `REACT_APP_ENABLE_MEDIA_TREEMAP` | `"true"` | Shows MediaTreemap for MEDIA section |
| `REACT_APP_ENABLE_PROTOTYPE_PLACEHOLDERS` | `"true"` | Shows placeholder cards for disabled modules |

## External APIs (inactive)

The codebase contains two Axios clients (`chartClient`, `blogClient`) that previously connected to AWS-hosted APIs. These are no longer configured:
- `chartClient` -- orphaned, no component renders its data
- `blogClient` -- used for article pages, but gracefully degrades (empty content) without a URL

Both have `.catch()` handlers so they fail silently.

## Context references

- `llm_context/vision_design_maquette.md` -- visual design principles
- `llm_context/architecture_narrative_accueil.md` -- homepage narrative flow
- `llm_context/architecture_donnees_raffineurs.md` -- data pipeline overview (historical)
- `llm_context/best_practices_ui_ux.md` -- UI/UX guidelines
- `design_language.md` -- design language specification
