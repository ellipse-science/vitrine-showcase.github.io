# AGENTS.md

This repository is the **single source of truth** for the website.

## Stack

- **Next.js 16** (App Router) with **static export** in `next-site/`
- **React 19** — Server Components for build-time data, Client Components for interactivity
- **TypeScript strict**
- Site assets (data, logos, favicons) live at `/public/` and are copied into `next-site/out/` by `next-site/scripts/postbuild.mjs`

The legacy CRA app (formerly in `src/`) and the static maquette HTML (formerly `public/index.html` + `public/js/*`) were removed in the Next.js migration — see git history.

## What to edit

- **All UI code:** `next-site/`
- **Static (non-data) HTML chunks:** `next-site/static-content/*.html` — edit as plain HTML
- **Data loaders:** `next-site/lib/data/*.ts`
- **Maquette CSS:** `next-site/app/globals.css`
- **Data pipeline:** `scripts/fetch_data.R`, `scripts/tables.json`
- **JSON data outputs:** never edit by hand; they're refreshed by the R script

## Deployment

- Deployment is **GitHub Pages only**
- Pushing to `main` triggers `.github/workflows/deploy.yml`
- The workflow does `cd next-site && npm ci && npm run build`, then publishes `next-site/out/` to GitHub Pages
- There is **no AWS deployment path** in this repo

## AWS safety rule

- Do **not** add or restore any AWS deployment workflow
- Do **not** add `aws-actions/configure-aws-credentials`
- Do **not** add S3, CloudFront, or AWS secrets for deployment
- If old docs mention AWS, treat that as historical context only

## Verification

- Local dev: `cd next-site && npm run dev`
- Production build: `cd next-site && npm run build`
- CI deploy target: GitHub Pages
