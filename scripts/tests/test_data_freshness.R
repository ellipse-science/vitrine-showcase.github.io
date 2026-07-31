source("scripts/data_freshness.R")

expect_error <- function(expr, pattern) {
  message <- tryCatch({ force(expr); "" }, error = conditionMessage)
  stopifnot(grepl(pattern, message, fixed = TRUE))
}

now <- as.POSIXct("2026-07-31T12:00:00Z", format = "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
policy <- list(column = "computed_at", max_age_hours = 12)

recent <- data.frame(computed_at = c("2026-07-01T00:00:00Z", "2026-07-31T06:00:00Z"))
stopifnot(identical(assert_fresh(recent, policy, "recent", now), recent))
stopifnot(identical(assert_fresh(recent, NULL, "unconfigured", now), recent))

expect_error(assert_fresh(data.frame(computed_at = character()), policy, "empty", now),
             "returned no rows")
expect_error(assert_fresh(data.frame(other = "x"), policy, "missing", now),
             "missing freshness column")
expect_error(assert_fresh(data.frame(computed_at = "invalid"), policy, "invalid", now),
             "invalid computed_at timestamp")
expect_error(assert_fresh(data.frame(computed_at = "2026-07-30T23:59:00Z"), policy, "stale", now),
             "is stale")
expect_error(assert_fresh(data.frame(computed_at = "2026-07-31T14:00:00Z"), policy, "future", now),
             "future computed_at timestamp")

message("data freshness tests passed")
