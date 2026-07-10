# Reference — AWS backend

How the data this site renders is produced upstream. **No AWS infrastructure lives in this repo** — this is context for diagnosing data problems and for changes made in the `aws-refiners` / `aws-infra` repos. See [`AGENTS.md`](../../AGENTS.md) for the hard rules.

## Local clone paths (typical)

| Repo | GitHub | Local clone path (typical) |
|------|--------|----------------------------|
| `vitrine-showcase.github.io` | [ellipse-science/vitrine-showcase.github.io](https://github.com/ellipse-science/vitrine-showcase.github.io) | `~/Dropbox/travail/CLESSN/Projets/vitrine-showcase.github.io/` |
| `aws-refiners` | [ellipse-science/aws-refiners](https://github.com/ellipse-science/aws-refiners) | `~/Documents/aws-refiners/` |
| `aws-infra` | [ellipse-science/aws-infra](https://github.com/ellipse-science/aws-infra) | `~/Documents/aws-infra/` |

## Two AWS accounts

- **PROD** (account `767398150629`): raw ingested data → Athena `datamarts` database
- **DEV** (account `097610011506`): refined / published data → Athena `datamarts` database → S3 → consumed by `scripts/fetch_data.R` in this repo

## How a refiner runs

1. R source lives in `aws-refiners/refiners/<refiner-name>/runtime.R`
2. `aws-infra/lib/data-stacks/refiners/refiners.ts` registers each refiner: ECR image name, EventBridge schedule(s), payload(s)
3. EventBridge triggers the Lambda on schedule → Lambda writes output rows to Athena DEV `datamarts` tables
4. `scripts/fetch_data.R` (in this repo) reads those Athena tables via the `tube` R package and writes JSON to `public/data/`
5. Next.js build reads `public/data/` JSON at build time → static HTML/JS

## How to deploy a refiner change (DEV)

The deployment mechanism is **not** merging to `main`. Instead:

1. Push your branch in `aws-refiners`
2. Open (or update) **PR #102 "Keep open (never merge)"** — a permanent PR from `develop` → `main`
3. Merging your branch **into `develop`** triggers `pr.yml` → ECR push → EventBridge auto-redeploy
4. The CDK construct `RedeployServiceOnNewImagePushedToEcr` (in `aws-infra/lib/construct/redeploy-lambda-image-on-push-ecr-stack.ts`) watches ECR pushes and calls `UpdateFunctionCode` automatically

Never merge PR #102. It exists only to keep the `pr.yml` CI pipeline runnable.

## Schedule times

**All schedule times in `aws-infra/lib/data-stacks/refiners/refiners.ts` are Montreal local time (EDT/EST), NOT UTC.** The comment at the top of that file says so explicitly. EDT = UTC−4, EST = UTC−5. A cron `{ hour: '19', minute: '31' }` fires at 19:31 EDT = 23:31 UTC in summer.

## Active refiners

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

## Inspecting Athena data directly from R

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
