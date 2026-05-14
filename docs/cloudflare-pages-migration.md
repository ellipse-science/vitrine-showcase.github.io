# Migration plan: GitHub Pages → Cloudflare Pages

Status: **proposed, not executed.** Document drafted 2026-05-13 in response to a capacity question (target: ~10 000 concurrent visitors).

## Why move

GitHub Pages free tier has a **100 GB/month soft bandwidth cap** and no SLA. The site is static and CDN-cacheable, so it can absorb a lot of traffic at the edge — but the JSON payload on first visit is currently ~5 MB (and bigger files like `headline_of_headlines.json` at 20 MB are loaded by some sections), which makes 10 000 visitors a single-spike risk for that cap. Cloudflare Pages has **unlimited bandwidth** on the free tier and gives us actual headroom.

Paying GitHub more does not solve this. There is no "GitHub Pages Pro" tier; GitHub Pro / Team are about private repos and orgs, not Pages limits. To pay for static hosting we have to change provider.

## Architecture (unchanged data pipeline)

```
cron-job.org ──▶ refresh-data.yml ──▶ scripts/fetch_data.R ──▶ git commit JSON to main
                                                                       │
                                                                       ▼ push notification
                                                       ┌───────────────┴───────────────┐
                                                       ▼                               ▼
                                          GitHub Actions: deploy.yml      Cloudflare Pages auto-deploy
                                          (keep during cutover,           (new path)
                                           disable after switchover)
                                                       │                               │
                                                       ▼                               ▼
                                                vitrine-showcase.               vitrine-showcase.
                                                github.io                       pages.dev
                                                                                (or custom domain)
```

The data pipeline — cron-job.org webhook → GitHub Actions → R script → Athena → commit JSON — is completely unchanged. Cloudflare Pages just becomes a second consumer of the same repo. Both deploy targets watch `main` and rebuild on every push.

## Prerequisites

- Cloudflare account (free tier is fine). Whoever owns it needs admin on the GitHub repo to authorize the GitHub App for Cloudflare Pages.
- Decision about a **custom domain**. Current URL `vitrine-showcase.github.io` is a GitHub-owned subdomain; we can't carry it over. Options:
  - Stay on the auto-assigned `vitrine-showcase.pages.dev` (free, immediate)
  - Bring a custom domain we own (e.g., `vitrine.clessn.com` or similar) and point its DNS at Cloudflare

## Setup steps

1. Cloudflare dashboard → **Workers & Pages → Create application → Pages → Connect to Git**.
2. Authorize the Cloudflare GitHub App and pick the `vitrine-showcase/vitrine-showcase.github.io` repo.
3. Configure build:
   - Production branch: `main`
   - Build command: `yarn build`
   - Build output directory: `build`
   - Root directory: `/` (default)
   - Environment variables:
     - `NODE_VERSION=20` (matches what `deploy.yml` uses; CRA needs `--openssl-legacy-provider` which only the package script sets, no extra env var needed)
4. Click **Save and Deploy**. First build runs immediately. Cloudflare emits a `*.pages.dev` URL.
5. (Optional) Settings → Custom domains → add the domain we picked above. Cloudflare walks you through DNS records.

That's the whole installation. No code change required.

## Decision: `[skip ci]` on data-refresh commits

`scripts/fetch_data.R` currently writes commits with `[skip ci]` in the message:

```r
# scripts/fetch_data.R (excerpt)
system2("git", c("commit", "-m", paste0("data: refresh ", iso_z, " [skip ci]")))
```

This was originally added so GitHub Actions' `deploy.yml` would not redeploy on every 4-hour data refresh.

**Cloudflare Pages honors `[skip ci]` too** (also `[ci skip]`, `[skip-cf-pages]`, etc.). So as-is, Cloudflare Pages will *not* redeploy on data-refresh commits — same behavior as today.

The tradeoff:

| Keep `[skip ci]` | Remove `[skip ci]` |
|---|---|
| Pages do not redeploy on data refresh. Users see stale data until the next manual deploy (or until the CDN's max-age expires, currently 10 min). Build budget low. | Pages redeploys every 4h. Users always see fresh data within seconds of a refresh. Burns ~180 builds/month (still 64% under the 500/mo free quota). |

**Recommendation**: remove `[skip ci]` from `fetch_data.R` once on Cloudflare Pages. Cloudflare builds are fast (~1m20s), the budget headroom is large, and the cache-bust benefit on every refresh is the whole point of having fresh data every 4h. If we ever need to slow it down we can add it back.

The change is one line in `scripts/fetch_data.R`. Hold off until the cutover is complete so we don't accidentally double-rebuild on both deploy targets in the meantime.

## Build budget math (Cloudflare Pages free tier: 500 builds / month)

| Source | Per month |
|---|---|
| Data refresh every 4h (6×/day, 30 days) | 180 builds (only if we remove `[skip ci]`) |
| Manual commits / merges (recent average) | ~20–40 |
| **Total estimated** | **~220 builds/month** — well under 500 |

Headroom is comfortable. If we ever blow through it, Pages Pro is $20/month for 5 000 builds.

## Migration order (zero-risk cutover)

1. **Add Cloudflare Pages alongside GitHub Pages.** Run both for at least a week. Same source, two deploy targets, two URLs.
2. Smoke-test the `*.pages.dev` URL:
   - All sections render (partis, treemap, assemblée, parole en chambre, etc.)
   - Live data loads (the partis-couverture.js fetch hits `/data/refined/day/*.json`)
   - Timeline tabs work
   - Mobile breakpoints render correctly
3. Verify Cloudflare cache headers on a few assets:
   - `curl -I https://vitrine-showcase.pages.dev/` (expect `cf-cache-status: HIT` after warm-up)
   - `curl -I https://vitrine-showcase.pages.dev/data/refined/day/provincial_parties_score_day.json`
4. Decide on the public domain. If using a custom domain:
   - Add it in Cloudflare Pages → Custom domains
   - Update DNS at the registrar to the records Cloudflare displays
   - Wait for propagation (typically minutes, occasionally hours)
5. Update every place that hard-codes `vitrine-showcase.github.io`:
   - Cron-job.org webhook URL **stays as-is** (still pointing at the GitHub Actions REST API, not the public site)
   - Any documentation, READMEs, link previews, social-card metadata, etc.
   - Search the repo: `grep -rIn 'vitrine-showcase\.github\.io' .` and audit each hit
6. Once stable on Cloudflare Pages, optionally **disable** `deploy.yml`:
   - Rename `.github/workflows/deploy.yml` → `deploy.yml.disabled` (preserves history), OR
   - Comment out the `on: push:` trigger and add an `on: workflow_dispatch:` so it's runnable manually but doesn't auto-fire
   - Do **not** delete — we want a clean revert path

## Rollback

Cloudflare Pages and GitHub Pages are independent. Either can serve from the same repo at any time. To revert:

1. Re-enable `deploy.yml` if it was disabled (revert step 6 above).
2. Point DNS back at GitHub Pages if a custom domain was switched.
3. Optionally delete the Cloudflare Pages project (or just leave it running as a backup).

No data is at risk because both targets are read-only consumers of the same repo. There is nothing in Cloudflare Pages that doesn't also exist in the repo.

## Things to verify before declaring done

- [ ] Cloudflare Pages build green
- [ ] All partis section tabs work (Aujourd'hui / Depuis une semaine / Depuis un mois)
- [ ] `curl -I` shows `cf-cache-status: HIT` on cached assets
- [ ] `meta.json` `generatedAt` updates after a `refresh-data.yml` run
- [ ] Mobile layouts work in Chrome and Safari
- [ ] No console errors in DevTools
- [ ] Bandwidth dashboard (Cloudflare Pages → Analytics) shows reasonable numbers after first day of dual-running

## Out of scope here (but worth doing later)

- **Trim the JSON payloads.** The single biggest scalability lever is independent of host: `headline_of_headlines.json` at 20 MB is excessive for a homepage. Slice it server-side in `fetch_data.R` to only the columns and rows the maquette actually shows. Goal: total assets per page load under 500 KB. This is more important than which CDN serves it.
- **Verify gzip / brotli is on.** Cloudflare Pages serves brotli automatically for text content — confirm with `curl -I -H 'Accept-Encoding: br' https://vitrine-showcase.pages.dev/data/refined/day/provincial_parties_score_day.json` and look for `content-encoding: br`.
- **Set explicit cache headers** for `/data/` assets if we want a tighter or looser refresh rhythm than Cloudflare's defaults. Done via a `_headers` file in `public/`.

## Open questions for whoever owns the Cloudflare account

1. Do we want a custom domain, and if so, which one?
2. Who has admin access on the GitHub repo to authorize the Cloudflare GitHub App?
3. Do we keep GitHub Pages alive indefinitely as a backup, or decommission after one stable week on Cloudflare?
