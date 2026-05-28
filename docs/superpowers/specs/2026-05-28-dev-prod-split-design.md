# Design: dev/prod deployment split

**Date:** 2026-05-28
**Status:** code changes implemented + build-verified on branch `feat/dev-prod-deploy`; human setup steps (Cloudflare, DNS, prod branch) pending.
**Supersedes:** the *cutover* framing in [`docs/cloudflare-pages-migration.md`](../../cloudflare-pages-migration.md). This is a permanent two-environment split, not a migration off GitHub Pages.

---

## Goal

Two long-lived environments off one repo:

| Env | Branch | Host | URL | Audience |
|-----|--------|------|-----|----------|
| **dev** | `main` | GitHub Pages | `ellipse.science/vitrine-showcase.github.io` | Internal — test "shenanigans", share with team for review |
| **prod** | `prod` | Cloudflare Pages | `vitrinedemocratique.com` | Public, official, must absorb heavy traffic |

**Promotion model:** code reaches prod only by a deliberate `main → prod` merge. Data reaches *both* every 4h automatically.

## Why Cloudflare Pages for prod

The discriminating requirement is "massive traffic, free." Cloudflare Pages is the only mainstream static host with **truly unlimited bandwidth** on its free tier. Netlify free caps at 100 GB/mo (the same wall as GitHub Pages); Vercel free is bandwidth-limited and non-commercial. GitHub has no paid "Pages Pro" bandwidth tier — paying more there isn't an option. Cloudflare it is, at $0.

## The core architectural decision: code gated, data continuous (Approach A)

The tension: code is gated behind manual promotion, but JSON/audio data refreshes every 4h via `refresh-data.yml`. If prod only updated on code promotion, the public site's data would go stale.

**Resolution:** `refresh-data.yml` keeps committing the fresh payload to `main` (rebuilds dev), then runs one extra step that copies **only the data payload** (`public/data/` + `public/audio/`) onto `prod` and pushes (rebuilds prod). Code never travels in that step.

Rejected alternatives:
- **B — `prod` auto-merges `main` on a schedule:** drags un-reviewed code to the public site; defeats gating.
- **C — prod fetches its own data at Cloudflare build time:** needs AWS prod creds + the R/`tube`/Athena toolchain inside Cloudflare's sandbox; slow, fragile, spreads secrets to a third platform.

**Known coupling (accepted):** the data-sync pushes the *latest data shape* onto whatever *code* prod currently runs, so data can briefly get ahead of prod code between promotions. Safe because the `lib/data/*.ts` loaders tolerate missing/extra fields, and any schema-breaking refiner change is promoted together with its matching frontend code.

---

## Code changes (implemented on `feat/dev-prod-deploy`)

### 1. `next.config.ts` — env-driven basePath

`next build` sets `NODE_ENV=production` on *both* hosts, so the old `isProd ? repoBasePath : ""`
would force the `/vitrine-showcase.github.io` prefix on Cloudflare too — every asset would 404
at the domain root. Fixed:

```ts
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (isProd ? repoBasePath : "");
```

`??` (not `||`) because `""` is a meaningful value (root). Set per host:
- GitHub Pages → `/vitrine-showcase.github.io`
- Cloudflare → `""`
- Local (unset) → unchanged fallback

**Verified by build:** with `NEXT_PUBLIC_BASE_PATH=""`, `out/index.html` emits root-relative
`/_next/...` (0 subpath references); with the subpath value, assets are prefixed as before.

### 2. `.github/workflows/deploy.yml` — pin dev's basePath

Build step gains `NEXT_PUBLIC_BASE_PATH: /vitrine-showcase.github.io` so dev stays identical
after change 1.

### 3. `.github/workflows/refresh-data.yml` — data-only sync to prod

New step after "Commit updated data files", guarded by `steps.commit.outputs.changed == 'true'`:

```yaml
- name: Sync fresh data to prod branch
  if: steps.commit.outputs.changed == 'true'
  run: |
    if ! git ls-remote --exit-code --heads origin prod >/dev/null 2>&1; then
      echo "No prod branch yet — skipping prod data sync."; exit 0
    fi
    git fetch origin prod
    git checkout -B prod FETCH_HEAD                    # FETCH_HEAD, not origin/prod (see note)
    git checkout main -- public/data/ public/audio/   # replace, never merge → no conflicts
    git add public/data/ public/audio/
    if git diff --cached --quiet; then
      echo "prod data already current — nothing to sync."
    else
      git commit -m "data: refresh $(date -u +%Y-%m-%dT%H:%MZ) [prod data sync]"
      git push origin prod
    fi
```

Properties:
- **Self-guarding:** no-op until `prod` exists, so this branch is safe to merge to `main`
  *before* Cloudflare/prod are set up.
- **No new secrets:** reuses the existing `REFRESH_DATA_DEPLOY_KEY` (origin is already the SSH
  URL by this point in the job).
- **Mirrors both payload dirs** (`public/data/` + `public/audio/`) — matches what the commit
  step stages, so prod gets the full refresh (JSON + AI art + ambient music).
- **`FETCH_HEAD`, not `origin/prod`:** `actions/checkout` sets a narrow fetch refspec scoped
  to `main`, so the remote-tracking ref `origin/prod` may be absent after `git fetch origin
  prod`. `FETCH_HEAD` always points at the freshly-fetched tip. (Not build-testable here;
  confirm with a manual `workflow_dispatch` once `prod` exists — runbook step 6.)
- **Add/update only, no delete:** `git checkout main -- <paths>` brings over new/changed files
  but won't remove a data file that `main` deleted. Stale-copy risk only if a table is ever
  retired (filenames are otherwise stable); revisit if that happens.

No change to the data pipeline itself, the cron-job.org webhook (still targets `main`), or
`deploy.yml`/`ci.yml` triggers (both fire on `main` only — pushes to `prod` don't trigger
GitHub Pages or PR CI).

---

## Build budget (Cloudflare free tier: 500 builds/month)

| Source | Builds/month |
|--------|--------------|
| Data sync to `prod`, 6×/day × 30 | ~180 |
| Code promotions `main → prod` | ~10–30 |
| **Total** | **~200 — well under 500** |

Dev (GitHub Pages) builds don't count against Cloudflare's quota.

---

## Runbook — steps that require human/account access

These can't be scripted from here; do them in order. Steps 1–2 are zero-risk (the merged
workflow no-ops until `prod` exists).

1. **Review + merge `feat/dev-prod-deploy` into `main`** (normal PR; `ci.yml` will type-check
   + build it). Dev behavior is unchanged after this.
2. **Create the `prod` branch from `main`:**
   ```bash
   git fetch origin && git checkout -b prod origin/main && git push -u origin prod
   ```
3. **Create the Cloudflare Pages project:** Cloudflare dashboard → Workers & Pages → Create →
   Pages → Connect to Git → `ellipse-science/vitrine-showcase.github.io`.
   - Production branch: **`prod`**
   - Build command: `npm run build`
   - Build output directory: `out`
   - Environment variables:
     - `NODE_VERSION` = `22`
     - `NEXT_PUBLIC_BASE_PATH` = `` (empty string — must be set explicitly, not omitted)
     - `NEXT_PUBLIC_DISPATCH_TOKEN` = (copy the value of the `DISPATCH_TOKEN` GitHub secret;
       the issue-reporter component reads it at build time)
   - Save and Deploy → confirm the `*.pages.dev` URL renders correctly first.
4. **Attach the domain:** Cloudflare Pages project → Custom domains → add
   `vitrinedemocratique.com` (and `www.` if wanted). Follow Cloudflare's DNS instructions:
   - If the domain's nameservers are already on Cloudflare → it wires automatically.
   - Otherwise → either move the nameservers to Cloudflare, or add the CNAME/records
     Cloudflare displays at the current DNS provider.
5. **Smoke-test prod** at `vitrinedemocratique.com`:
   - All sections render; period tabs (jour/semaine/mois) work; mobile breakpoints OK.
   - DevTools console: no 404s on `/_next/...` assets (this is what the basePath fix guards).
   - `curl -I https://vitrinedemocratique.com/` shows `cf-cache-status: HIT` after warm-up.
6. **Confirm the data loop:** after the next `refresh-data.yml` run, check Actions logs show
   "Sync fresh data to prod branch" pushing a `[prod data sync]` commit, and that Cloudflare
   rebuilds prod from it.

## Rollback

GitHub Pages (dev) is untouched and independent. To back out: revert the `feat/dev-prod-deploy`
merge (or just leave it — it's inert without a `prod` branch), and optionally delete the
Cloudflare project and the `prod` branch. No data is at risk; both hosts are read-only
consumers of the repo.

---

## Out of scope (worth doing next, not a blocker)

**Trim the JSON payloads.** First-visit data is ~5 MB, with some files reaching ~20 MB.
Slicing them in `fetch_data.R` to only displayed columns/rows (target < 500 KB/page) is the
single biggest scalability + UX lever and is independent of host — it improves dev too.
Deserves its own spec.

**Fix canonical / sharing URLs for the public domain.** The prod site will still emit some
URLs pointing at `vitrine-showcase.github.io` — e.g. the citation in
`public/methodologie/index.html` and any OG/social-card metadata. Harmless at launch, but
wrong for an official public site's SEO and link previews; sweep these to
`vitrinedemocratique.com` as a follow-up. (Leave `components/interactive/IssueReporter.tsx`'s
`REPO = 'ellipse-science/...'` — that's the GitHub repo slug for filing issues, not a URL.)

## Corrections to the older `cloudflare-pages-migration.md`

That doc predates the current `refresh-data.yml` and is stale on two points:
- It claims `fetch_data.R` adds `[skip ci]` to commits. The current commit message is
  `data: refresh <iso>` with **no `[skip ci]`** — data pushes already rebuild today.
- It says use `NODE_VERSION=20`. `deploy.yml`/`.nvmrc` use **22**; use 22.
