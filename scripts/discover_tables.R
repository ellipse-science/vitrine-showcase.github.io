#!/usr/bin/env Rscript
# Discovers Athena tables that match the configured prefix and aren't already
# listed in scripts/tables.json. For each new table, appends a disabled stub
# entry (with default name, default output path, and all columns inlined).
# Existing entries are never modified.
#
# Run locally after a refiner publishes a new table:
#
#   Rscript scripts/discover_tables.R
#
# Requires AWS_ACCESS_KEY_ID_DEV / AWS_SECRET_ACCESS_KEY_DEV / AWS_REGION
# in the environment or .Renviron (same vars used by scripts/fetch_data.R).
#
# Then review the new stub entries in scripts/tables.json, trim `cols` and
# set `used_by` and `enabled` as appropriate, and commit.

suppressPackageStartupMessages({
  library(tube)
  library(jsonlite)
  library(DBI)
})

CONFIG_PATH <- "scripts/tables.json"

# ── Helpers ───────────────────────────────────────────────────────────────────

# Strip the "<group>_datamart-" prefix from an Athena table name to get a
# short canonical name for use in the config and output filename.
canonical_name <- function(athena_name) {
  sub("^[^-]+-", "", athena_name)
}

# Default output path based on Athena table-name conventions:
#   *_day  → public/data/refined/day/<name>.json
#   *_week → public/data/refined/week/<name>.json
#   *_month→ public/data/refined/month/<name>.json
# everything else → public/data/<group>/<name>.json
# where <group> is the prefix before "_datamart-" (e.g. "agora", "vitrine").
default_out_path <- function(athena_name) {
  short <- canonical_name(athena_name)
  if (grepl("_day$",   short)) return(paste0("public/data/refined/day/",   short, ".json"))
  if (grepl("_week$",  short)) return(paste0("public/data/refined/week/",  short, ".json"))
  if (grepl("_month$", short)) return(paste0("public/data/refined/month/", short, ".json"))
  group <- sub("_datamart.*$", "", athena_name)
  paste0("public/data/", group, "/", short, ".json")
}

# Read schema by selecting zero rows. Works on Athena via noctua even when the
# table is empty.
list_columns <- function(conn, athena_name) {
  sql <- sprintf('SELECT * FROM "%s" LIMIT 0', athena_name)
  df  <- as.data.frame(DBI::dbGetQuery(conn, sql))
  names(df)
}

# ── Main ──────────────────────────────────────────────────────────────────────

main <- function() {
  if (!file.exists(CONFIG_PATH)) {
    stop("Config not found at ", CONFIG_PATH,
         " — run this script from the repo root.")
  }
  config <- jsonlite::fromJSON(CONFIG_PATH, simplifyVector = FALSE)

  match_regex <- config$`_discover`$match_regex
  if (is.null(match_regex) || !nzchar(match_regex)) {
    stop("_discover.match_regex missing from ", CONFIG_PATH)
  }

  existing_athena <- vapply(config$tables, function(t) t$athena, character(1))

  Sys.setenv(AWS_ACCESS_KEY_ID     = Sys.getenv("AWS_ACCESS_KEY_ID_DEV"))
  Sys.setenv(AWS_SECRET_ACCESS_KEY = Sys.getenv("AWS_SECRET_ACCESS_KEY_DEV"))

  conn <- tube::ellipse_connect("DEV", "datamarts")
  on.exit(tube::ellipse_disconnect(conn), add = TRUE)

  message("[", format(Sys.time(), "%H:%M:%S"), "] Listing tables in Athena datamart …")
  all_tables <- DBI::dbListTables(conn)
  message("  found ", length(all_tables), " total table(s) in the connection")

  candidates <- all_tables[grepl(match_regex, all_tables)]
  message("  ", length(candidates), " match _discover.match_regex=", match_regex)

  new_tables     <- setdiff(candidates,       existing_athena)
  missing_tables <- setdiff(existing_athena,  candidates)

  if (length(missing_tables) > 0) {
    message("\nWARNING: ", length(missing_tables),
            " entry/entries in tables.json no longer exist in Athena (left untouched):")
    for (t in missing_tables) message("  - ", t)
  }

  if (length(new_tables) == 0) {
    message("\nNo new tables. Nothing to do.")
    return(invisible(NULL))
  }

  message("\nFound ", length(new_tables), " new table(s) to add as disabled stubs:")
  for (t in new_tables) message("  + ", t)

  new_entries <- lapply(new_tables, function(athena_name) {
    cols <- tryCatch(
      list_columns(conn, athena_name),
      error = function(e) {
        message("    !! couldn't fetch columns for ", athena_name, ": ", conditionMessage(e))
        character(0)
      })

    list(
      name    = canonical_name(athena_name),
      athena  = athena_name,
      out     = default_out_path(athena_name),
      cols    = as.list(cols),
      enabled = FALSE,
      used_by = NULL
    )
  })

  config$tables <- c(config$tables, new_entries)

  # Pretty-print so the diff is readable in PR/commit views. jsonlite emits
  # snake_case key order; we don't reorder.
  jsonlite::write_json(config, CONFIG_PATH,
    auto_unbox = TRUE, pretty = TRUE, na = "null", null = "null")

  message("\nWrote ", length(new_entries), " new entry/entries to ", CONFIG_PATH, ".")
  message("All new entries are enabled=false. Before flipping them on:")
  message("  - confirm the default 'out' path matches your convention")
  message("  - trim 'cols' to what your hydrator actually needs (smaller JSON)")
  message("  - fill 'used_by' with the JS file that will consume the data")
}

main()
