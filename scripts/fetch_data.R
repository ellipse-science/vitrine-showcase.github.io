#!/usr/bin/env Rscript
# Fetches refined Athena tables and writes static JSON to public/data/.
# Runs in GitHub Actions every 4h via workflow_dispatch triggered by cron-job.org.
#
# WHITELIST-ONLY: every Athena table and post-processed file is defined in
# scripts/tables.json. To add a table: append an object to that config and
# set "enabled": true. Raw upstream tables are never queried here.

suppressPackageStartupMessages({
  library(tube)
  library(dplyr)
  library(jsonlite)
})

NOW_UTC      <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
CONFIG_PATH  <- "scripts/tables.json"

# ── Config ────────────────────────────────────────────────────────────────────

load_config <- function(path) {
  if (!file.exists(path)) {
    stop("Config not found at ", path,
         " — run this script from the repo root.")
  }
  jsonlite::fromJSON(path, simplifyVector = FALSE)
}

CONFIG          <- load_config(CONFIG_PATH)
ENABLED_TABLES  <- Filter(function(t) isTRUE(t$enabled), CONFIG$tables)
ENABLED_POSTS   <- Filter(function(p) isTRUE(p$enabled), CONFIG$post_process)

# ── Helpers ───────────────────────────────────────────────────────────────────

write_json_file <- function(df, path) {
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(df, path,
    auto_unbox = TRUE, pretty = FALSE, na = "null",
    dataframe = "rows")
}

# Per-table optional filtering, keyed by entry$filter.
# Add a new branch here when a new table needs row-level trimming.
apply_filter <- function(df, filter_id) {
  if (is.null(filter_id) || !nzchar(filter_id)) return(df)

  if (filter_id == "headline_events_3day") {
    if ("block_start_utc" %in% names(df)) {
      cutoff <- format(Sys.time() - as.difftime(3, units = "days"),
                       "%Y-%m-%d %H:%M:%S", tz = "UTC")
      df <- dplyr::filter(df, block_start_utc >= cutoff)
    }
    return(df)
  }

  message("  !! Unknown filter id: ", filter_id, " — passing through")
  df
}

fetch_table <- function(conn, entry) {
  # Project only whitelisted columns in the SQL so Athena never reads columns
  # that have type mismatches in the underlying Parquet files.
  # Double-quoted identifiers handle hyphens in table names safely.
  # as.data.frame() normalises noctua's output (data.table when data.table is
  # installed) so column subsetting with [, cols, drop=FALSE] works correctly.
  cols     <- unlist(entry$cols)
  col_list <- paste(sprintf('"%s"', cols), collapse = ", ")
  sql      <- sprintf('SELECT %s FROM "%s"', col_list, entry$athena)
  df       <- as.data.frame(DBI::dbGetQuery(conn, sql))
  df       <- df[, intersect(cols, names(df)), drop = FALSE]
  df       <- apply_filter(df, entry$filter)
  df
}

# ── Post-processing builders ──────────────────────────────────────────────────
# Each builder is invoked by name from the post_process config entry; it reads
# the file produced by its `source` table and writes a derived JSON.

build_period_snapshot <- function(rows, party_full_names) {
  if (nrow(rows) == 0) return(NULL)

  period_start <- as.character(rows$period_start_date[1])
  period_end   <- as.character(rows$period_end_date[1])
  period_type  <- as.character(rows$period_type[1])

  period_label <- switch(period_type,
    last_pdq    = paste0("Période de questions du ", period_end),
    session     = paste0("Session ", format(as.Date(period_start), "%Y"),
                         " – ", format(as.Date(period_end), "%Y")),
    legislature = paste0("Législature ", format(as.Date(period_start), "%Y"),
                         " – ", format(as.Date(period_end), "%Y")),
    period_end
  )

  max_int <- max(rows$n_interventions, na.rm = TRUE)
  if (!is.finite(max_int) || max_int == 0) max_int <- 1L

  party_rows <- lapply(seq_len(nrow(rows)), function(i) {
    row         <- rows[i, ]
    party_lower <- tolower(as.character(row$party))
    party_upper <- toupper(as.character(row$party))
    full_name   <- party_full_names[[party_lower]]
    if (is.null(full_name)) full_name <- party_upper
    list(
      party         = party_upper,
      fullName      = full_name,
      interventions = as.integer(row$n_interventions),
      score         = round(as.numeric(row$n_interventions) / max_int, 4)
    )
  })

  title <- tryCatch({
    top   <- rows[which.max(rows$n_interventions), ]
    angle <- as.character(top$editorial_angle)
    if (length(angle) == 1L && !is.na(angle) && nzchar(angle)) angle
    else period_label
  }, error = function(e) period_label)

  list(
    periodLabel        = period_label,
    startDate          = period_start,
    endDate            = period_end,
    title              = title,
    partyInterventions = party_rows
  )
}

build_parole_en_chambre <- function(source_path, out_path) {
  if (!file.exists(source_path)) {
    message("  !! source not found: ", source_path)
    return(invisible(NULL))
  }
  raw <- jsonlite::fromJSON(source_path, simplifyDataFrame = TRUE)
  df  <- as.data.frame(raw)
  if (nrow(df) == 0) return(invisible(NULL))

  party_full_names <- c(
    caq = "Coalition Avenir Québec",
    plq = "Parti libéral du Québec",
    pq  = "Parti Québécois",
    qs  = "Québec solidaire",
    pcq = "Parti conservateur du Québec"
  )

  periods <- list()
  for (pt in c("last_pdq", "session", "legislature")) {
    rows <- df[df$period_type == pt, ]
    snap <- build_period_snapshot(rows, party_full_names)
    if (!is.null(snap)) periods[[pt]] <- snap
  }
  if (length(periods) == 0) return(invisible(NULL))

  payload <- list(
    generatedAt = NOW_UTC,
    assemblies  = list(QC = list(
      assemblyId       = "QC",
      chambre          = "Assemblée nationale du Québec",
      monitoredParties = c("CAQ", "PLQ", "PQ", "QS", "PCQ"),
      periods          = periods
    ))
  )
  jsonlite::write_json(payload, out_path,
    auto_unbox = TRUE, pretty = TRUE, na = "null")
  message("  -> written ", out_path)
}

build_headline_of_headlines_rich <- function(source_path, out_path) {
  if (!file.exists(source_path)) {
    message("  !! source not found: ", source_path)
    return(invisible(NULL))
  }
  raw <- jsonlite::fromJSON(source_path, simplifyDataFrame = TRUE)
  df  <- as.data.frame(raw)
  if (nrow(df) == 0) return(invisible(NULL))

  # Most recent entry per country
  latest <- df |>
    dplyr::group_by(country_id) |>
    dplyr::slice_max(order_by = date_utc, n = 1, with_ties = FALSE) |>
    dplyr::ungroup()

  build_country <- function(row) {
    objects_parsed <- tryCatch(
      jsonlite::fromJSON(row$objects[[1]]),
      error = function(e) list()
    )
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

    snapshot_label <- tryCatch(
      format(lubridate::ymd_hms(row$date_utc[[1]], quiet = TRUE),
             "%Y-%m-%d %H:%M UTC", tz = "UTC"),
      error = function(e) as.character(row$time_interval_utc[[1]])
    )

    list(
      countryId        = row$country_id[[1]],
      dateUtc          = row$date_utc[[1]],
      timeIntervalUtc  = row$time_interval_utc[[1]],
      mainIssue        = row$main_issue[[1]],
      mainIssueLabelFr = row$main_issue_text_fr[[1]],
      mainIssueLabelEn = row$main_issue_text_en[[1]],
      title            = row$title[[1]],
      score            = 0.5,
      prevScore        = 0.5,
      velocity         = 0,
      objects          = objects_list,
      monitoredSources = list(),
      headlines        = list(),
      snapshotLabel    = snapshot_label,
      nextLabel        = NULL
    )
  }

  countries <- list()
  for (i in seq_len(nrow(latest))) {
    row <- latest[i, , drop = FALSE]
    cid <- row$country_id[[1]]
    key <- if (cid == "CAN") "CA" else cid
    countries[[key]] <- build_country(row)
  }

  payload <- list(generatedAt = NOW_UTC, countries = countries)
  jsonlite::write_json(payload, out_path,
    auto_unbox = TRUE, pretty = TRUE, na = "null")
  message("  -> written ", out_path)
}

# Dispatcher — looks up a builder by post-process entry name.
POST_PROCESSORS <- list(
  parole_en_chambre          = build_parole_en_chambre,
  headline_of_headlines_rich = build_headline_of_headlines_rich
)

dispatch_post_process <- function(entry, table_outputs) {
  fn <- POST_PROCESSORS[[entry$name]]
  if (is.null(fn)) {
    message("  !! no builder registered for: ", entry$name)
    return(invisible(NULL))
  }
  source_path <- table_outputs[[entry$source]]
  if (is.null(source_path)) {
    message("  !! source table '", entry$source,
            "' is not enabled — cannot build ", entry$name)
    return(invisible(NULL))
  }
  fn(source_path, entry$out)
}

# ── Main ──────────────────────────────────────────────────────────────────────

run <- function() {
  message("[", format(Sys.time(), "%H:%M:%S"), "] Loaded ",
          length(ENABLED_TABLES), " enabled table(s), ",
          length(ENABLED_POSTS),  " enabled post-processor(s) from ", CONFIG_PATH)

  results       <- list()
  table_outputs <- list()  # name -> output path, populated as tables succeed

  # noctua requires the standard (un-suffixed) env vars to be set for query
  # execution, even though ellipse_connect() uses the _DEV suffixed vars.
  # Pattern from vitrine-graph-data/runtime.R.
  Sys.setenv(AWS_ACCESS_KEY_ID     = Sys.getenv("AWS_ACCESS_KEY_ID_DEV"))
  Sys.setenv(AWS_SECRET_ACCESS_KEY = Sys.getenv("AWS_SECRET_ACCESS_KEY_DEV"))

  conn <- tube::ellipse_connect("DEV", "datamarts")
  on.exit(tube::ellipse_disconnect(conn), add = TRUE)

  for (entry in ENABLED_TABLES) {
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
    if (identical(res$status, "ok")) {
      table_outputs[[entry$name]] <- entry$out
    }
  }

  for (pp in ENABLED_POSTS) {
    message("[", format(Sys.time(), "%H:%M:%S"), "] Post-processing: ", pp$name)
    tryCatch(dispatch_post_process(pp, table_outputs),
      error = function(e) {
        message("  !! Could not build ", pp$name, ": ", conditionMessage(e))
      })
  }

  # Always write meta.json for the /status page
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
