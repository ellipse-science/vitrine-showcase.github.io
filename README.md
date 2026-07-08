# La Vitrine démocratique

A media-focused data showcase by [CLESSN](https://clessn.com/) (Université Laval). Tracks Quebec political coverage and parliamentary discourse, refreshed every four hours from AWS Athena.

**Live:** https://ellipse.science/vitrine-showcase.github.io/

## Stack

- **Next.js 16** (App Router) with **static export** — produces a plain `out/` directory served by GitHub Pages
- **React 19** Server Components for build-time data hydration; Client Components for interactive bits (tab switchers, the live countdown)
- **TypeScript** (strict)
- The maquette's CSS lives verbatim in `app/globals.css` — no CSS framework
- Data pipeline in `scripts/fetch_data.R` (separate cron, see below)

## Quick start

```bash
npm install
npm run dev    # http://localhost:3000
```

## Build for production

```bash
npm run build  # → out/   (next build + scripts/postbuild.mjs copies /presentation)
```

## Project layout

```
app/                          Next.js App Router
  layout.tsx                  <html><head> + Google Fonts + globals.css
  page.tsx                    Home page composition
  globals.css                 Maquette CSS, lifted verbatim
components/
  sections/                   Async Server Components — load data, render shells
    PartisCouvertureSection.tsx
    AssembleeSection.tsx
    RawMaquette.tsx           Inlines static-content/*.html via dangerouslySetInnerHTML
  interactive/                Client Components — React state + behavior
    PartisCouvertureClient.tsx
    AssembleeClient.tsx
    PulseCountdown.tsx
lib/
  data/
    parties.ts                Loader + transformations for provincial_parties_score_day.json
    assemblee.ts              Loader + transformations for agora_decideurs_qc.json
static-content/               Verbatim HTML chunks for non-data sections (masthead, treemap,
                              partners, footer). Edit as plain HTML.
public/                       Static assets — written to by the data refresher
  data/                       JSON snapshots (build-time source of truth)
  logos/                      Political party logos
  methodologie/               Static methodology page
  favicon*, manifest*, etc.
scripts/                      Data pipeline (R) + build helpers (Node)
  fetch_data.R                AWS Athena → /public/data/ refresher
  tables.json                 Whitelist of Athena tables to publish
  discover_tables.R           Auto-discovers new tables published by upstream refiners
  postbuild.mjs               Copies /presentation into out/
presentation/                 RevealJS slide deck (served at /presentation/)
docs/                         Operational docs (Cloudflare migration plan, etc.)
llm_context/                  Long-form architecture / design references
```

## Deployment

Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm run build` and publishes `out/` to GitHub Pages. Deploy is typically live within ~2 minutes of merge.

PRs trigger `.github/workflows/ci.yml` which runs the type-checker and full build — no flaky regressions reach `main`.

## Data pipeline

Data is pulled from AWS Athena every 4 hours by `scripts/fetch_data.R`, run via `.github/workflows/refresh-data.yml` triggered externally by [cron-job.org](https://cron-job.org/). The script reads the whitelist in `scripts/tables.json` and commits JSON to `public/data/`. The build then bakes those values into the page at build time — no runtime fetch.

To add a new dataset, see [docs/reference/architecture.md § Data pipeline](./docs/reference/architecture.md#data-pipeline).

## Adding a new data-bound section

1. Enable the table in `scripts/tables.json` (or wait for one to appear via `Rscript scripts/discover_tables.R`)
2. Add a typed loader in `lib/data/`
3. Add an async Server Component in `components/sections/`
4. If interactive (tabs, filters), add a `'use client'` component in `components/interactive/`
5. Wire into `app/page.tsx`

See `lib/data/parties.ts` + `components/sections/PartisCouvertureSection.tsx` + `components/interactive/PartisCouvertureClient.tsx` as the canonical example.

## Editing static (non-data) sections

The masthead, sub-nav, pulse-band, headlines, treemap, partners, and footer live as raw HTML in `static-content/{top,middle,bottom}.html`. Edit them as plain HTML — they're inlined verbatim. To make a chunk interactive, JSX-convert it into a proper component (move markup into a `.tsx`, replace `class` → `className`, etc.) and remove the chunk.

## Further reading

- [`CLAUDE.md`](./CLAUDE.md) — detailed architecture for AI / new contributors
- [`AGENTS.md`](./AGENTS.md) — short rules for AI agents touching this repo
- [`design_language.md`](./design_language.md) — visual design specification
- [`docs/cloudflare-pages-migration.md`](./docs/cloudflare-pages-migration.md) — deferred plan to move off GitHub Pages
- [`llm_context/`](./llm_context/) — long-form references (vision, narrative, UI guidelines)

## License

CLESSN, Université Laval. Internal project — see `app/globals.css` for licensed font notes.
