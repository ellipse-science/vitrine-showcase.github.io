# Reference — Data schemas

Schemas for the Athena tables consumed by the build. See [`architecture.md`](./architecture.md) for the data flow and [`aws-backend.md`](./aws-backend.md) for how these tables are produced.

## `issues_score_day` schema and `issues_meta`

The `radar-issues-score` refiner produces rows in **wide format** — one row per `(date_utc, tag, pass)`, with one numeric column per issue. Consumed by `loadTreemap()` in `lib/data/headlineEvents.ts`.

| Column | Type | Notes |
|--------|------|-------|
| `date_utc` | string `YYYY-MM-DD` | UTC date of the articles scored |
| `date_montreal_tz` | string `YYYY-MM-DD` | Same date in Montreal timezone |
| `tag` | string | Run tag (e.g. `2026-05-14T19:31`) — latest tag = most recent run |
| `pass` | string | `"am"`, `"noon"`, or `"pm"` — article window scored |
| `issues_meta` | JSON string | `{"issue_key": {"label": "...", "obj": "..."}}` — top article info per issue |
| *(one column per issue key)* | numeric | Salience score for that issue on that date/pass |

`issues_meta` is a JSON string. An empty run produces `"{}"`. `parseIssuesMeta()` decodes it; if empty/null, `loadFallbackIssueContent()` cross-references `headline-events.json` to build fallback topObject and context.

`loadTreemap()` selects all rows sharing the latest `tag`, sums each issue column across those rows, and sorts descending to produce the period ranking (week = sum over 7 days in the latest tag's window, month = sum over ~29 days).

### ISSUE_KEYS — English column names (as in JSON and Athena) with French display labels

| Column / key | French label (UI) |
|-------------|------------------|
| `economy_and_labour` | Économie et travail |
| `governments_and_governance` | Gouvernements |
| `health_and_social_services` | Santé |
| `environment_and_energy` | Environnement |
| `rights_liberties_minorities_discrimination` | Droits et libertés |
| `culture_and_nationalism` | Culture |
| `education` | Éducation |
| `international_affairs_and_defense` | Aff. internationales |
| `law_and_crime` | Loi et crime |
| `public_lands_and_agriculture` | Terres publiques |
| `immigration` | Immigration |
| `technology` | Technologie |

These match `ISSUE_COLORS` and `ISSUE_LABELS_SHORT` in `lib/data/headlineEvents.ts` exactly. The `ISSUE_KEYS` constant is `Object.keys(ISSUE_COLORS)`.

## `headline_events_4h` schema

The `radar-event-salience` refiner produces `headline_events_4h` (clustering des articles du bloc 4h en événements, `storyline_id` cross-blocs — corrigé 2026-07-09, ce doc disait `radar-headlines-issues` à tort) — one row per event per time interval per region. Published as `public/data/headline-events.json`. Consumed by `loadHeadlineEvents()` for `UneDesUnesSection`.

Key columns used by the frontend:

| Column | Notes |
|--------|-------|
| `event_id` | Deduplicated — QC `target_region` row preferred over others |
| `country_id` | `"QC"`, `"CAN"`, `"USA"` — USA rows filtered out |
| `date_utc`, `date_montreal_tz` | Date of the interval |
| `time_interval_utc`, `time_interval_montreal_tz` | e.g. `"19-23"` |
| `title` | Event headline |
| `main_issue` | English issue key (e.g. `"economy_and_labour"`) |
| `main_issue_text_fr` | French label from refiner |
| `score_saillance` | Overall salience score |
| `score_qc` | QC-specific salience |
| `outlets_qc` | Number of QC outlets covering this event (drives dot count, 1–6) |
| `total_outlets_qc` | Total QC outlets in panel |
| `intensity_tier` | `"Majeur"`, `"Fort"`, `"Moyen"`, `"Faible"` |
| `representative_url` | URL of the most representative article |
| `media_ids` | JSON array of outlet IDs (e.g. `["LED","LAP","RCI"]`) |
| `articles` | JSON array of `{media_id, url, title, ...}` — used for byline links |
| `extracted_objects` | JSON array of `{object, score}` — used for treemap object tiles |
| `interval_convergence_score` | Cosine similarity QC vs ROC (for Deux solitudes) |
| `top_objects_divergence` | JSON array of divergence entries per event label |
