# Reference — AWS backend

How the data this site renders is produced upstream. **No AWS infrastructure lives in this repo** — this is context for diagnosing data problems and for changes made in the `aws-refiners` / `aws-infra` repos. See [`AGENTS.md`](../../AGENTS.md) for the hard rules.

**Diagrammes vivants du pipeline** (copies canoniques, hébergées par CE repo sous `public/docs/`, éditables par PR → en ligne ~2 min après merge) :
- [Plan de réforme des horaires 2026](https://ellipse.science/vitrine-showcase.github.io/docs/horaire-refiners-2026.html) — la vision cible (grille 3-7, cascade Mtl) + bandeau « état réel »
- [Swimlanes du pipeline](https://ellipse.science/vitrine-showcase.github.io/docs/workflow-vitrine-2025-swimlanes.html) — vue d'ensemble des raffineurs
- Chantier fraîcheur + suivi 24 h de la Une : [aws-refiners#195](https://github.com/ellipse-science/aws-refiners/issues/195)

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
| **`radar-event-salience`** | **`headline_events_4h`** — LA source de la Une des Unes + Deux solitudes (clustering en événements, `storyline_id` cross-blocs) | 6×/day :51 | `refiners/radar-event-salience/` |
| `radar-headlines-issues` | `headlines_issues_day/week/month` — ⚠️ **plus consommées par le site** (servent au reflet → Slack seulement). Ne produit PAS `headline_events_4h` (erreur historique de cette doc, corrigée 2026-07-09). | Day: 3×/day 11:46, 15:46, 19:46 · Week: daily 19:17 · Month: daily 19:20 | `refiners/radar-headlines-issues/` |
| `radar-party-score` | `provincial_parties_score_day/week/month`, `federal_parties_score_day/week/month` | Day: 6×/day :46 · Week: daily 19:35 · Month: daily 19:39 | `refiners/radar-party-score/` |
| `radar-party-score-salient-shadow` | `provincial_parties_score_salient_shadow_*` | Day: 6×/day :31 · Week: daily 19:35 · Month: daily 19:39 | `refiners/radar-party-score-salient-shadow/` |
| `radar-reflet-daily-weekly` | `reflet_day`, `reflet_week` | Day: 3×/day 11:46, 15:46, 19:46 · Week: daily 19:37 | `refiners/radar-reflet-daily-weekly/` |
| `radar-reflet-monthly` | `reflet_month` | Daily 19:40 | `refiners/radar-reflet-monthly/` |
| `radar-headline-of-headlines` | `headline_of_headlines` — ⚠️ **plus consommée par le site** (remplacée par `headline_events_4h` d'event-salience) | 6×/day :46 | `refiners/radar-headline-of-headlines/` |
| `radar-hot-20` | hot-20 data | Fridays 12:00 | `refiners/radar-hot-20/` |
| `vitrine-graph-data` | graph data tables | 6×/day :57 | `refiners/vitrine-graph-data/` |
| `agora-decideurs-qc-phrases` | `agora_decideurs_qc_phrases` (intermédiaire) | Tuesdays 05:00 | `refiners/agora-decideurs-qc-phrases/` |
| `agora-decideurs-qc` | `agora_decideurs_qc` | Tuesdays 06:00 | `refiners/agora-decideurs-qc/` |
| `polimetre-plus` | `polimetre_plus` | Fridays 12:30 | `refiners/polimetre-plus/` |

### Pipeline Agora en deux raffineurs (split du 2026-07-02)

Le module « Que dit-on à l'Assemblée ? » est produit par **deux raffineurs à exécuter dans l'ordre** (mardis, après l'extracteur `qc-parliament-debates` du lundi 22:00) :

1. **`agora-decideurs-qc-phrases`** (05:00) — lit `a-qc-parliament-debates` (datawarehouse PROD), apparie locuteur→parti via `pplmatch`, segmente en phrases (WTPSPLIT) et classe chaque phrase (thèmes CAP + sentiment) via l'**API INFER**, puis **persiste les phrases annotées individuelles** dans `agora_datamart.agora_decideurs_qc_phrases`.
2. **`agora-decideurs-qc`** (06:00) — lit cette table de phrases et agrège par `event_date × parti` puis par période (`last_pdq` / `session` / `legislature`), génère les angles éditoriaux LLM, et publie le snapshot `agora_decideurs_qc` consommé par `vitrine-graph-data`.

Le but du split : conserver les phrases annotées comme **source pérenne** (échantillons de validation des classifieurs, réutilisation pour articles/thèses/mémoires) sans avoir à ré-appeler l'API INFER à chaque fois. Incrémental : chaque run ne traite que `event_date > max(event_date)` déjà publié (fenêtre initiale `initial_days = 30` si la table est absente). Ne **pas** injecter manuellement des lignes dans `agora_decideurs_qc_phrases` : ça fausserait cette fenêtre incrémentale et l'agrégation. Pour un tirage de validation ponctuel, voir `aws-refiners/tools/export_agora_validation_sample.R` (échantillon depuis la table existante) et `annotate_agora_validation_sample.R` (annotation locale d'un échantillon stratifié d'interventions brutes).

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
