assert_fresh <- function(df, freshness, table_name, now = Sys.time()) {
  if (is.null(freshness)) return(invisible(df))

  column <- as.character(freshness$column)
  max_age_hours <- suppressWarnings(as.numeric(freshness$max_age_hours))
  future_tolerance_hours <- if (is.null(freshness$future_tolerance_hours)) {
    1
  } else {
    suppressWarnings(as.numeric(freshness$future_tolerance_hours))
  }
  if (length(column) != 1L || !nzchar(column) || length(max_age_hours) != 1L ||
      !is.finite(max_age_hours) || max_age_hours <= 0 ||
      length(future_tolerance_hours) != 1L || !is.finite(future_tolerance_hours) ||
      future_tolerance_hours < 0) {
    stop("Invalid freshness policy for ", table_name, call. = FALSE)
  }
  if (nrow(df) == 0L) stop(table_name, " returned no rows", call. = FALSE)
  if (!column %in% names(df)) {
    stop(table_name, " is missing freshness column ", column, call. = FALSE)
  }

  raw <- as.character(df[[column]])
  parsed <- as.POSIXct(strptime(raw, format = "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"))
  if (length(parsed) != length(raw) || any(is.na(parsed))) {
    stop(table_name, " contains an invalid ", column, " timestamp", call. = FALSE)
  }

  newest <- max(parsed)
  age_hours <- as.numeric(difftime(as.POSIXct(now, tz = "UTC"), newest, units = "hours"))
  if (age_hours < -future_tolerance_hours) {
    stop(table_name, " has a future ", column, " timestamp", call. = FALSE)
  }
  if (age_hours > max_age_hours) {
    stop(sprintf("%s is stale: newest %s is %.1f hours old (maximum %.1f)",
                 table_name, column, age_hours, max_age_hours), call. = FALSE)
  }
  invisible(df)
}
