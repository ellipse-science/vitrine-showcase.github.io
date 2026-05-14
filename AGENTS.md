# AGENTS.md

This repository is the **single source of truth** for the website.

## Stack

- **Next.js 16** (App Router) with **static export** at the repo root
- **React 19** — Server Components for build-time data, Client Components for interactivity
- **TypeScript strict**
- Static assets live in `/public/`; Next.js copies them into `out/` automatically. `scripts/postbuild.mjs` copies `/presentation/` (which lives outside `/public/`).

The legacy CRA app (formerly in `src/`) and the static maquette HTML (formerly `public/index.html` + `public/js/*`) were removed in the Next.js migration — see git history.

## What to edit

- **All UI code:** repo root (`app/`, `components/`, `lib/`)
- **Static (non-data) HTML chunks:** `static-content/*.html` — edit as plain HTML
- **Data loaders:** `lib/data/*.ts`
- **Maquette CSS:** `app/globals.css`
- **Data pipeline:** `scripts/fetch_data.R`, `scripts/tables.json`
- **JSON data outputs:** never edit by hand; they're refreshed by the R script

## Deployment

- Deployment is **GitHub Pages only**
- Push to `main` → `.github/workflows/deploy.yml` runs `npm ci && npm run build` and publishes `out/` to GitHub Pages
- Pull requests → `.github/workflows/ci.yml` runs type-check + build (no deploy)
- There is **no AWS deployment path** in this repo

## AWS safety rule

- Do **not** add or restore any AWS deployment workflow
- Do **not** add `aws-actions/configure-aws-credentials`
- Do **not** add S3, CloudFront, or AWS secrets for deployment
- If old docs mention AWS, treat that as historical context only

## Verification

- Local dev: `npm run dev`
- Type-check: `npm run type-check`
- Production build: `npm run build`
- CI deploy target: GitHub Pages
