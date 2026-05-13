#!/usr/bin/env Rscript
# Fetches refined Athena tables and writes static JSON to public/data/.
# Runs in GitHub Actions every 4h via workflow_dispatch triggered by cron-job.org.
# WHITELIST-ONLY: raw tables (salient_headlines_objects, radar_annotated, etc.) are
# never queried — only derivative/aggregated datamarts are published.

suppressPackageStartupMessages({
  library(tube)
  library(dplyr)
  library(jsonlite)
})

NOW_UTC  <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
LOOKBACK <- as.character(Sys.time() - as.difftime(30, units = "days"))

# ── Whitelist ─────────────────────────────────────────────────────────────────
# Each entry: name (for meta.json), athena table key, output path, columns.
# Adding a new table requires editing this list — a deliberate governance gate.

PARTY_COLS    <- c("party", "date_utc", "date_montreal_tz",
                   "weighted_mentions", "weighted_tone", "pass")
PARTY_COLS_WM <- c("party", "date_utc", "date_montreal_tz",
                   "weighted_mentions", "weighted_tone")   # week/month have no pass

ISSUE_COLS    <- c("date_utc", "date_montreal_tz", "pass",
                   "economy_and_labour",
                   "rights_liberties_minorities_discrimination",
                   "health_and_social_services",
                   "public_lands_and_agriculture",
                   "immigration", "education",
                   "environment_and_energy", "law_and_crime",
                   "international_affairs_and_defense",
                   "technology", "governments_and_governance",
                   "culture_and_nationalism")
ISSUE_COLS_WM <- ISSUE_COLS[ISSUE_COLS != "pass"]

REFLET_COLS   <- c("date_utc", "pass", "issue", "summary")
REFLET_COLS_WM <- c("date_utc", "issue", "summary")

HOH_COLS      <- c("country_id", "date_utc", "time_interval_utc",
                   "date_montreal_tz", "time_interval_montreal_tz",
                   "main_issue", "main_issue_text_fr", "main_issue_text_en",
                   "title", "text", "objects")

EVENTS_COLS   <- c("block_start_utc", "block_end_utc", "time_interval_utc",
                   "event_id", "event_rank", "event_label", "event_title",
                   "top_entities", "top_themes",
                   "composite_score", "saliency_velocity",
                   "saliency_breadth", "saliency_prominence",
                   "saliency_persistence", "saliency_depth",
                   "outlet_count", "article_count",
                   "cluster_confidence", "media_ids")

PUBLISHABLE_TABLES <- list(
  # Party scores
  list(name = "federal_parties_score_day",
       athena = "vitrine_datamart-federal_parties_score_day",
       out    = "public/data/refined/day/federal_parties_score_day.json",
       cols   = PARTY_COLS),
  list(name = "provincial_parties_score_day",
       athena = "vitrine_datamart-provincial_parties_score_day",
       out    = "public/data/refined/day/provincial_parties_score_day.json",
       cols   = PARTY_COLS),
  list(name = "federal_parties_score_week",
       athena = "vitrine_datamart-federal_parties_score_week",
       out    = "public/data/refined/week/federal_parties_score_week.json",
       cols   = PARTY_COLS_WM),
  list(name = "provincial_parties_score_week",
       athena = "vitrine_datamart-provincial_parties_score_week",
       out    = "public/data/refined/week/provincial_parties_score_week.json",
       cols   = PARTY_COLS_WM),
  list(name = "federal_parties_score_month",
       athena = "vitrine_datamart-federal_parties_score_month",
       out    = "public/data/refined/month/federal_parties_score_month.json",
       cols   = PARTY_COLS_WM),
  list(name = "provincial_parties_score_month",
       athena = "vitrine_datamart-provincial_parties_score_month",
       out    = "public/data/refined/month/provincial_parties_score_month.json",
       cols   = PARTY_COLS_WM),

  # Issues scores
  list(name = "issues_score_day",
       athena = "vitrine_datamart-issues_score_day",
       out    = "public/data/refined/day/issues_score_day.json",
       cols   = ISSUE_COLS),
  list(name = "issues_score_week",
       athena = "vitrine_datamart-issues_score_week",
       out    = "public/data/refined/week/issues_score_week.json",
       cols   = ISSUE_COLS_WM),
  list(name = "issues_score_month",
       athena = "vitrine_datamart-issues_score_month",
       out    = "public/data/refined/month/issues_score_month.json",
       cols   = ISSUE_COLS_WM),

  # LLM summaries
  list(name = "reflet_day",
       athena = "vitrine_datamart-reflet_day",
       out    = "public/data/refined/day/reflet_day.json",
       cols   = REFLET_COLS),
  list(name = "reflet_week",
       athena = "vitrine_datamart-reflet_week",
       out    = "public/data/refined/week/reflet_week.json",
       cols   = REFLET_COLS_WM),
  list(name = "reflet_month",
       athena = "vitrine_datamart-reflet_month",
       out    = "public/data/refined/month/reflet_month.json",
       cols   = REFLET_COLS_WM),

  # Headline of headlines (raw array — used by future components)
  list(name = "headline_of_headlines",
       athena = "vitrine_datamart-headline_of_headlines",
       out    = "public/data/refined/day/headline_of_headlines.json",
       cols   = HOH_COLS),

  # Event salience (new — 3-day rolling window)
  list(name = "headline_events_4h",
       athena = "vitrine_datamart-headline_events_4h",
       out    = "public/data/headline-events.json",
       cols   = EVENTS_COLS)
)

# ── Helpers ───────────────────────────────────────────────────────────────────

write_json_file <- function(df, path) {
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(df, path,
    auto_unbox = TRUE, pretty = FALSE, na = "null",
    dataframe = "rows")
}

fetch_table <- function(conn, entry) {
  # DBI::dbGetQuery with double-quoted table name handles hyphens safely,
  # avoiding the noctua/dplyr::tbl incompatibility with hyphenated Athena tables.
  # as.data.frame() normalises noctua's output (data.table when data.table is
  # installed) so column subsetting with [, cols, drop=FALSE] works correctly.
  sql <- sprintf('SELECT * FROM "%s"', entry$athena)
  df  <- as.data.frame(DBI::dbGetQuery(conn, sql))
  df  <- df[, intersect(entry$cols, names(df)), drop = FALSE]

  if (entry$name == "headline_events_4h" && "block_start_utc" %in% names(df)) {
    cutoff <- format(Sys.time() - as.difftime(3, units = "days"),
                     "%Y-%m-%d %H:%M:%S", tz = "UTC")
    df <- dplyr::filter(df, block_start_utc >= cutoff)
  }

  df
}

# Build the rich headline-of-headlines.json that UneDesUnes expects.
build_hoh_rich <- function(df) {
  if (nrow(df) == 0) return(NULL)

  # Get most recent entry per country
  latest <- df |>
    dplyr::group_by(country_id) |>
    dplyr::slice_max(order_by = date_utc, n = 1, with_ties = FALSE) |>
    dplyr::ungroup()

  build_country <- function(row) {
    objects_parsed <- tryCatch(
      jsonlite::fromJSON(row$objects[[1]]),
      error = function(e) list()
    )
    # Normalise to [{label, score}] list — handle both named list and data.frame
    if (is.data.frame(objects_parsed)) {
      objects_list <- lapply(seq_len(nrow(objects_parsed)), function(i) {
        list(label = as.character(objects_parsed$label[[i]]),
             score = as.numeric(objects_parsed$score[[i]]))
      })
    } else if (is.list(objects_parsed) && length(objects_parsed) > 0) {
      objects_list <- objects_parsed
    } else {
      objects_list <- list()
    }

    # Derive a human-readable snapshot label from the time interval
    snapshot_label <- tryCatch(
      format(lubridate::ymd_hms(row$date_utc[[1]], quiet = TRUE),
             "%Y-%m-%d %H:%M UTC", tz = "UTC"),
      error = function(e) as.character(row$time_interval_utc[[1]])
    )

    list(
      countryId          = row$country_id[[1]],
      dateUtc            = row$date_utc[[1]],
      timeIntervalUtc    = row$time_interval_utc[[1]],
      mainIssue          = row$main_issue[[1]],
      mainIssueLabelFr   = row$main_issue_text_fr[[1]],
      mainIssueLabelEn   = row$main_issue_text_en[[1]],
      title              = row$title[[1]],
      score              = 0.5,       # not stored in Athena — placeholder
      prevScore          = 0.5,
      velocity           = 0,
      objects            = objects_list,
      monitoredSources   = list(),    # would require join with salient_headlines_objects
      headlines          = list(),
      snapshotLabel      = snapshot_label,
      nextLabel          = NULL
    )
  }

  countries <- list()
  for (i in seq_len(nrow(latest))) {
    row    <- latest[i, , drop = FALSE]
    cid    <- row$country_id[[1]]
    # Map "CAN" → "CA" for the frontend toggle; keep "QC" as-is
    key    <- if (cid == "CAN") "CA" else cid
    countries[[key]] <- build_country(row)
  }

  list(generatedAt = NOW_UTC, countries = countries)
}

# ── Main ──────────────────────────────────────────────────────────────────────

run <- function() {
  results <- list()

  # noctua requires the standard (un-suffixed) env vars to be set for query
  # execution, even though ellipse_connect() uses the _DEV suffixed vars.
  # Pattern from vitrine-graph-data/runtime.R.
  Sys.setenv(AWS_ACCESS_KEY_ID     = Sys.getenv("AWS_ACCESS_KEY_ID_DEV"))
  Sys.setenv(AWS_SECRET_ACCESS_KEY = Sys.getenv("AWS_SECRET_ACCESS_KEY_DEV"))

  conn <- tube::ellipse_connect("DEV", "datamarts")
  on.exit(tube::ellipse_disconnect(conn), add = TRUE)

  for (entry in PUBLISHABLE_TABLES) {
    message("[", format(Sys.time(), "%H:%M:%S"), "] Fetching: ", entry$name)

    res <- tryCatch({
      df <- fetch_table(conn, entry)
      write_json_file(df, entry$out)
      message("  -> ", nrow(df), " rows -> ", entry$out)
      list(name = entry$name, status = "ok", rowCount = nrow(df),
           generatedAt = NOW_UTC, path = entry$out)
    }, error = function(e) {
      message("  !! FAILED: ", conditionMessage(e))
      list(name = entry$name, status = "error",
           error = conditionMessage(e), generatedAt = NOW_UTC)
    })

    results[[length(results) + 1]] <- res
  }

  # Write rich headline-of-headlines.json for UneDesUnes component
  message("[", format(Sys.time(), "%H:%M:%S"), "] Building headline-of-headlines.json...")
  tryCatch({
    hoh_raw <- jsonlite::fromJSON(
      "public/data/refined/day/headline_of_headlines.json",
      simplifyDataFrame = TRUE
    )
    hoh_rich <- build_hoh_rich(as.data.frame(hoh_raw))
    if (!is.null(hoh_rich)) {
      jsonlite::write_json(hoh_rich, "public/data/headline-of-headlines.json",
        auto_unbox = TRUE, pretty = TRUE, na = "null")
      message("  -> written public/data/headline-of-headlines.json")
    }
  }, error = function(e) {
    message("  !! Could not build headline-of-headlines.json: ", conditionMessage(e))
  })

  # Write meta.json for the /status page
  run_url <- paste0(
    Sys.getenv("GITHUB_SERVER_URL", "https://github.com"), "/",
    Sys.getenv("GITHUB_REPOSITORY", ""),
    "/actions/runs/",
    Sys.getenv("GITHUB_RUN_ID", "")
  )

  meta <- list(
    generatedAt    = NOW_UTC,
    workflowRunUrl = run_url,
    tables         = results
  )
  jsonlite::write_json(meta, "public/data/meta.json",
    auto_unbox = TRUE, pretty = TRUE, na = "null")
  message("[", format(Sys.time(), "%H:%M:%S"), "] Written public/data/meta.json")

  ok_count  <- sum(sapply(results, function(r) identical(r$status, "ok")))
  err_count <- length(results) - ok_count
  message("\nDone: ", ok_count, " ok, ", err_count, " failed out of ", length(results), " tables.")

  # Ping Healthchecks.io heartbeat (only on full success)
  hc_url <- Sys.getenv("HEALTHCHECKS_URL", "")
  if (nzchar(hc_url) && err_count == 0) {
    system2("curl", c("-fsS", "--retry", "3", "--max-time", "10", hc_url),
            stdout = FALSE, stderr = FALSE)
    message("Healthchecks ping sent.")
  } else if (err_count > 0) {
    message("Skipping Healthchecks ping — ", err_count, " table(s) failed.")
  }

  if (err_count > 0) quit(status = 1)
}

run()
