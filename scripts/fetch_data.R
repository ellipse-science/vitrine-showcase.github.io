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
    # date_utc is stored as integer days since 1970-01-01; keep last 3 days
    if ("date_utc" %in% names(df)) {
      cutoff_day <- as.integer(Sys.Date() - 3L)
      df <- dplyr::filter(df, date_utc >= cutoff_day)
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

# ── Calibration glissante (suivi aws-refiners#212) ────────────────────────────────────────
# Publie les percentiles de score_qc / score_roc / interval_convergence_score sur
# une fenêtre glissante, pour que le frontend cesse de hardcoder ses seuils
# (SAL_QC_THRESHOLDS, CAL_CONV) et affiche un « plus/moins que d'habitude » stable
# (demande Yannick, 2026-06-08). Interroge l'historique COMPLET de
# headline_events_4h (pas le filtre 3 jours). Chaque métrique est requêtée
# séparément et tolère une colonne absente (score_roc n'arrive qu'avec le refiner
# #211) : une métrique manquante est simplement omise → repli frontend sur les
# valeurs codées. PROVISOIRE : à terme le refiner publiera ces bornes (aws-refiners#212).
CAL_TABLE       <- "vitrine_datamart-headline_events_4h"
CAL_WINDOW_DAYS <- 365L
CAL_MIN_N       <- 60L
CAL_PROBS       <- c(p5 = 0.05, p20 = 0.20, p50 = 0.50, p80 = 0.80, p95 = 0.95)

# Percentiles d'un vecteur ; NULL si trop peu de points (repli frontend).
# keep_zero : 0 est une vraie valeur pour la convergence (bloc pleinement
# divergent) — on la garde ; pour score_qc/roc, 0 = « pas une Une de la région »,
# on l'exclut.
calibration_pctiles <- function(x, keep_zero = FALSE) {
  x <- x[is.finite(x)]
  x <- if (keep_zero) x[x >= 0] else x[x > 0]
  if (length(x) < CAL_MIN_N) return(NULL)
  qs  <- as.numeric(stats::quantile(x, probs = CAL_PROBS, names = FALSE, type = 7))
  out <- as.list(round(qs, 2)); names(out) <- names(CAL_PROBS)
  c(list(n = length(x)), out)
}

# Requête gardée d'UNE métrique. distinct_block : dédup par bloc (la convergence
# est une valeur par bloc, pas par événement). Colonne absente → NULL (pas d'échec).
# `date_utc` est de type DATE dans Athena → littéral DATE 'AAAA-MM-JJ' (pas un
# entier ; l'entier ne sert qu'au filtre côté R après fetch, cf. apply_filter).
calibration_metric <- function(conn, col, cut_date, keep_zero = FALSE, distinct_block = FALSE) {
  tryCatch({
    sel <- if (distinct_block) {
      sprintf('SELECT DISTINCT date_utc, time_interval_utc, "%s" AS v', col)
    } else {
      sprintf('SELECT "%s" AS v', col)
    }
    sql <- sprintf("%s FROM \"%s\" WHERE date_utc >= DATE '%s'", sel, CAL_TABLE, cut_date)
    df  <- as.data.frame(DBI::dbGetQuery(conn, sql))
    calibration_pctiles(df$v, keep_zero = keep_zero)
  }, error = function(e) {
    message("   (calibration: colonne « ", col, " » indisponible — ", conditionMessage(e), ")")
    NULL
  })
}

# La pastille de saillance étiquette le PIC 24 h d'une histoire (peakQc côté
# frontend), pas un score de bloc — il faut donc calibrer sur la distribution des
# PICS, un par storyline (sinon les blocs répétés d'une même histoire pèsent en
# double). Fenêtre POST-FUSION uniquement (aws-refiners#227, 2026-07-17) : la
# fusion a nettement remonté les scores en agrégeant la couverture des fragments,
# donc mélanger le pré-fusion abaisserait faussement les seuils (#281). NULL si
# trop peu de storylines → repli frontend sur les seuils codés post-fusion.
SAL_PEAK_CAL_FROM <- "2026-07-17"  # déploiement de la fusion prominence
calibration_peak <- function(conn, from) {
  tryCatch({
    sql <- sprintf(paste(
      "SELECT max(score_qc_peak_24h) AS v FROM \"%s\"",
      "WHERE date_utc >= DATE '%s' AND storyline_id IS NOT NULL GROUP BY storyline_id"),
      CAL_TABLE, from)
    df <- as.data.frame(DBI::dbGetQuery(conn, sql))
    calibration_pctiles(df$v)  # exclut les storylines jamais Une QC (pic 0)
  }, error = function(e) {
    message("   (calibration: score_qc_peak_24h indisponible — ", conditionMessage(e), ")")
    NULL
  })
}

# Convergence EVENT-level (au niveau HISTOIRE) — calibre le repère « habituel »
# de la jauge du module Deux solitudes. Reproduit windowEventConvergence du
# frontend (lib/data/headlineEvents.ts) : pour CHAQUE bloc « as-of » de
# l'historique on reconstruit la fenêtre glissante de 6 blocs (24 h), on agrège la
# saillance par histoire (storyline_id ?? event_label ?? event_id) avec la MÊME
# pondération de récence que le frontend (demi-vie 10 h, vitrine #274), on garde les
# histoires bilatérales (sumQc>0 ET sumRoc>0) et on prend la moyenne des deux parts
# d'attention. La distribution de ces valeurs `as-of` = exactement les nombres que
# la jauge aurait affichés à chaque rafraîchissement de 4 h → son p50 remplace la
# constante de repli HABITUAL_EVENT_CONV côté frontend (calibration.metrics
# .event_convergence.p50). Applique les mêmes filtres que le frontend (dédup event_id
# préf-QC + exclusion USA) ; ne reproduit PAS la dédup cross-langue par titre
# (STOPGAP aws-refiners#213) → légère SOUS-estimation résiduelle. p50 mesuré sur DEV
# = 28 % (cf. measure_event_convergence). Colonne absente / échec → NULL (repli frontend).
calibration_event_convergence <- function(conn, cut_date) {
  tryCatch({
    sql <- sprintf(paste(
      "SELECT date_utc, time_interval_utc, storyline_id, event_label, event_id,",
      "target_region, country_id,",
      "title, score_qc, score_roc, score_saillance, score_us",
      "FROM \"%s\" WHERE date_utc >= DATE '%s'"), CAL_TABLE, cut_date)
    df <- as.data.frame(DBI::dbGetQuery(conn, sql))

    num <- function(x) suppressWarnings(as.numeric(x))
    # Mêmes filtres que le frontend AVANT toute agrégation, pour une distribution
    # comparable (sans eux la médiane est sur-estimée, ~39 % vs 28 %) :
    #  (1) dédup par event_id en préférant la ligne target_region=="QC" et
    #  (2) exclusion des Unes américaines (country_id=="USA") — comme la dédup de
    #      loadHeadlineEvents (byId + filter country_id !== "USA") ;
    #  (3) exclusion des lignes sans titre — comme storiesFrom24h qui saute
    #      `if (!e.title) continue` avant d'agréger une histoire.
    df <- df %>%
      mutate(qc_pref = ifelse(!is.na(target_region) & target_region == "QC", 0L, 1L)) %>%
      arrange(event_id, qc_pref) %>%
      distinct(event_id, .keep_all = TRUE) %>%
      filter(is.na(country_id) | country_id != "USA") %>%
      filter(!is.na(title), title != "") %>%
      mutate(
        qc  = ifelse(is.na(num(score_qc)),        0, num(score_qc)),
        sal = ifelse(is.na(num(score_saillance)), 0, num(score_saillance)),
        us  = ifelse(is.na(num(score_us)),        0, num(score_us)),
        # score_roc publié (refiner #211) sinon repli par soustraction, comme
        # rocScore côté frontend : max(0, saillance - QC - US).
        roc = ifelse(is.na(num(score_roc)), pmax(0, sal - qc - us), num(score_roc)),
        # Zero-pad de l'heure de début du bloc pour un tri lexical correct.
        # NB : sprintf("%02s", ...) NE zero-pad PAS en R (le flag 0 est ignoré
        # pour %s → " 4"), ce qui casserait l'ordre des blocs. On parse l'heure en
        # entier et on utilise %02d.
        block = paste0(date_utc, "T",
                       sprintf("%02d", suppressWarnings(as.integer(
                               sub("-.*$", "",
                                   ifelse(is.na(time_interval_utc), "", time_interval_utc)))))),
        # Clé d'histoire = storyline_id ?? event_label ?? event_id (frontend).
        story = dplyr::coalesce(
          ifelse(storyline_id == "", NA, storyline_id),
          ifelse(event_label  == "", NA, event_label),
          event_id))
    if (nrow(df) == 0) return(NULL)

    # Pré-agrégation UNE seule fois par (block, story) : la saillance QC/ROC de
    # chaque histoire dans chaque bloc. Le rolling 24 h se fait ensuite sur cette
    # table réduite (au lieu de re-grouper tout `df` à chaque fenêtre → évitait
    # un coût O(n_fenêtres × n_lignes) et un risque de timeout CI sur 365 j).
    by_bs <- df %>% group_by(block, story) %>%
      summarise(sumQc = sum(qc), sumRoc = sum(roc), .groups = "drop") %>%
      filter(sumQc + sumRoc > 0)

    # Convergence event-level d'UNE fenêtre : somme par histoire sur les 6 blocs,
    # puis moyenne des deux parts d'attention bilatérales. `rowsum` (base R) est
    # bien plus léger qu'un group_by dplyr répété ~2 000 fois.
    # Pondération de récence (vitrine #274, banc #282) : comme storiesFrom24h,
    # le poids d'un bloc décroît en 2^(-âge/10 h) par rapport au bloc le plus
    # récent de la fenêtre — sans elle, le p50 publié dériverait du module.
    HALF_LIFE_H <- 10
    block_ms <- function(b) as.numeric(as.POSIXct(paste0(b, ":00:00"),
                                                  format = "%Y-%m-%dT%H:%M:%S", tz = "UTC"))
    # Chaque bloc est parsé UNE seule fois : les mêmes blocs reviennent dans
    # ~2 000 fenêtres glissantes, re-parser à chaque fenêtre coûterait cher
    # (même souci de timeout CI que la pré-agrégation ci-dessus).
    block_ms_tab <- vapply(unique(df$block), block_ms, numeric(1))
    window_conv <- function(win_blocks) {
      w <- by_bs[by_bs$block %in% win_blocks, , drop = FALSE]
      if (nrow(w) == 0) return(NA_real_)
      newest <- max(block_ms_tab[win_blocks], na.rm = TRUE)
      wt <- 2^((block_ms_tab[w$block] - newest) / 3600 / HALF_LIFE_H)
      qc  <- rowsum(w$sumQc  * wt, w$story)[, 1]
      roc <- rowsum(w$sumRoc * wt, w$story)[, 1]
      totalQc <- sum(qc); totalRoc <- sum(roc)
      if (totalQc <= 0 || totalRoc <= 0) return(NA_real_)
      bi <- qc > 0 & roc > 0
      round(((sum(qc[bi]) / totalQc) + (sum(roc[bi]) / totalRoc)) / 2 * 100)
    }

    # Une lecture « as-of » par bloc : fenêtre = ce bloc + les 5 précédents (6 blocs
    # = 24 h pleines). On ignore les fenêtres partielles du début de l'historique.
    blocks_desc <- sort(unique(df$block), decreasing = TRUE)
    n <- length(blocks_desc)
    if (n < 6) return(NULL)
    convs <- vapply(seq_len(n - 5L),
                    function(i) window_conv(blocks_desc[i:(i + 5L)]), numeric(1))
    # 0 est une vraie valeur (fenêtre sans histoire bilatérale) → keep_zero.
    calibration_pctiles(convs, keep_zero = TRUE)
  }, error = function(e) {
    message("   (calibration: event_convergence indisponible — ", conditionMessage(e), ")")
    NULL
  })
}

# Saillance CUMULÉE 24 h par histoire (sumQc du frontend, storiesFrom24h) —
# calibre le BADGE de la Une des Unes (vitrine#314). Le badge décrivait le PIC
# 24 h (score_qc_peak_24h, ci-dessus) ; il décrit maintenant l'attention
# cumulée pondérée par récence, qui décroît d'elle-même quand une histoire
# s'éteint. Reproduit EXACTEMENT storiesFrom24h côté frontend : mêmes filtres
# que calibration_event_convergence (dédup event_id préf-QC, exclusion USA,
# titre requis), fenêtre glissante de 6 blocs, pondération de récence demi-vie
# 10 h (HALF_LIFE_H, vitrine #274). Convention de calibration_peak : UN POINT
# PAR STORYLINE — son SOMMET cumulé sur toute la fenêtre, sinon une histoire
# longue (beaucoup de fenêtres as-of) pèserait en double dans la distribution.
#
# Même plancher POST-FUSION que calibration_peak (`from`, aws-refiners#227) :
# vérifié empiriquement sur l'historique DEV, mélanger le pré-fusion tire les
# seuils vers le bas (p50 mesuré 20,2 mélangé contre 22,1 post-fusion seul,
# écart croissant sur les hauts percentiles, là où la fusion pèse le plus).
#
# Colonne/table indisponible ou trop peu de storylines → NULL (repli frontend
# sur SUM_QC_THRESHOLDS codés en dur).
calibration_sum_qc <- function(conn, from) {
  tryCatch({
    sql <- sprintf(paste(
      "SELECT date_utc, time_interval_utc, storyline_id, event_label, event_id,",
      "target_region, country_id, title, score_qc, media_ids_qc",
      "FROM \"%s\" WHERE date_utc >= DATE '%s'"), CAL_TABLE, from)
    df <- as.data.frame(DBI::dbGetQuery(conn, sql))

    num <- function(x) suppressWarnings(as.numeric(x))
    # Nombre de médias QC distincts, comme `qcMedia` côté frontend : sert au
    # seuil éditorial des manchettes secondaires (MIN_QC_MEDIA_SECONDARY = 2).
    n_media_qc <- function(s) {
      if (is.na(s) || s == "") return(0L)
      length(unique(trimws(strsplit(gsub("\\[|\\]|\"", "", s), ",")[[1]])))
    }
    df <- df %>%
      mutate(qc_pref = ifelse(!is.na(target_region) & target_region == "QC", 0L, 1L)) %>%
      arrange(event_id, qc_pref) %>%
      distinct(event_id, .keep_all = TRUE) %>%
      filter(is.na(country_id) | country_id != "USA") %>%
      filter(!is.na(title), title != "") %>%
      mutate(
        qc = ifelse(is.na(num(score_qc)), 0, num(score_qc)),
        nmed = vapply(media_ids_qc, n_media_qc, integer(1)),
        block = paste0(date_utc, "T",
                       sprintf("%02d", suppressWarnings(as.integer(
                               sub("-.*$", "",
                                   ifelse(is.na(time_interval_utc), "", time_interval_utc)))))),
        story = dplyr::coalesce(
          ifelse(storyline_id == "", NA, storyline_id),
          ifelse(event_label  == "", NA, event_label),
          event_id))
    if (nrow(df) == 0) return(NULL)

    by_bs <- df %>% group_by(block, story) %>%
      summarise(sumQc = sum(qc), nmed = max(nmed), .groups = "drop") %>%
      filter(sumQc > 0)

    HALF_LIFE_H <- 10
    block_ms <- function(b) as.numeric(as.POSIXct(paste0(b, ":00:00"),
                                                  format = "%Y-%m-%dT%H:%M:%S", tz = "UTC"))
    block_ms_tab <- vapply(unique(df$block), block_ms, numeric(1))

    blocks_desc <- sort(unique(df$block), decreasing = TRUE)
    n <- length(blocks_desc)
    if (n < 6) return(NULL)

    # Somme pondérée de CHAQUE fenêtre as-of, puis SÉLECTION comme selectTopUnes
    # (qcMedia>0 & sumQc>0, tri par sumQc, top-3, secondaires ≥ 2 médias QC).
    #
    # Calibrer sur TOUTES les storylines au lieu des seules AFFICHÉES reproduit
    # exactement le défaut qu'on corrige : mesuré sur l'historique DEV, 93 % des
    # cartes tomberaient dans les 3 bandes du haut et 0 % dans les 2 du bas —
    # le même 93 % que l'ancien badge au pic. Le tassement ne venait donc pas du
    # « pic » mais de la population de référence. Sur les affichées : 43 % dans
    # les 3 bandes du haut, 25 % dans les 2 du bas.
    all_vals <- vector("list", n - 5L)
    for (i in seq_len(n - 5L)) {
      win_blocks <- blocks_desc[i:(i + 5L)]
      w <- by_bs[by_bs$block %in% win_blocks, , drop = FALSE]
      if (nrow(w) == 0) next
      newest <- max(block_ms_tab[win_blocks], na.rm = TRUE)
      wt <- 2^((block_ms_tab[w$block] - newest) / 3600 / HALF_LIFE_H)
      sums <- rowsum(w$sumQc * wt, w$story)[, 1]
      nmed <- tapply(w$nmed, w$story, max)
      sel <- data.frame(story = names(sums), sumQc = as.numeric(sums),
                        nmed = as.numeric(nmed[names(sums)]),
                        stringsAsFactors = FALSE)
      sel <- sel[sel$sumQc > 0 & sel$nmed > 0, , drop = FALSE]
      if (nrow(sel) == 0) next
      sel <- head(sel[order(-sel$sumQc), , drop = FALSE], 3)
      keep <- seq_len(nrow(sel)) == 1L | sel$nmed >= 2
      sel <- sel[keep, , drop = FALSE]
      if (nrow(sel) == 0) next
      all_vals[[i]] <- setNames(sel$sumQc, sel$story)
    }
    combined <- unlist(all_vals)
    if (length(combined) == 0) return(NULL)
    # UN POINT PAR STORYLINE : son sommet cumulé, sinon une histoire affichée sur
    # beaucoup de fenêtres pèserait en double (convention de calibration_peak).
    peak_by_story <- tapply(combined, names(combined), max)
    calibration_pctiles(unname(peak_by_story))
  }, error = function(e) {
    message("   (calibration: score_qc_sum_24h indisponible — ", conditionMessage(e), ")")
    NULL
  })
}

build_salience_calibration <- function(conn, out_path) {
  cut_date <- format(Sys.Date() - CAL_WINDOW_DAYS, "%Y-%m-%d")
  metrics <- list()
  qc  <- calibration_metric(conn, "score_qc", cut_date)
  if (!is.null(qc))  metrics$score_qc  <- c(list(region = "QC"),  qc)
  # Pics 24 h par storyline (post-fusion) — réfèrent la pastille de saillance (#281).
  # Plancher post-fusion, mais jamais avant le début de la fenêtre 365 j : `since`
  # annonce la vraie borne utilisée (quand la fenêtre dépassera 2026-07-17, elle
  # deviendra cut_date).
  peak_from <- max(cut_date, SAL_PEAK_CAL_FROM)
  pk  <- calibration_peak(conn, peak_from)
  if (!is.null(pk))  metrics$score_qc_peak_24h <- c(list(region = "QC", since = peak_from), pk)
  # Cumul 24 h pondéré — calibre le badge (vitrine#314). MÊME plancher
  # post-fusion que le pic ci-dessus (vérifié empiriquement dans
  # calibration_sum_qc : mélanger le pré-fusion tire les seuils vers le bas).
  sq  <- calibration_sum_qc(conn, peak_from)
  if (!is.null(sq))  metrics$score_qc_sum_24h <- c(list(region = "QC", since = peak_from), sq)
  roc <- calibration_metric(conn, "score_roc", cut_date)
  if (!is.null(roc)) metrics$score_roc <- c(list(region = "ROC"), roc)
  cv  <- calibration_metric(conn, "interval_convergence_score", cut_date,
                            keep_zero = TRUE, distinct_block = TRUE)
  if (!is.null(cv))  metrics$convergence <- c(list(region = NA), cv)
  # Convergence au niveau HISTOIRE (fenêtre glissante 24 h) — repère « habituel »
  # de la jauge du module Deux solitudes (frontend : event_convergence.p50).
  ev  <- calibration_event_convergence(conn, cut_date)
  if (!is.null(ev))  metrics$event_convergence <- c(list(region = NA), ev)

  payload <- list(window_days = CAL_WINDOW_DAYS, computed_utc = NOW_UTC, metrics = metrics)
  dir.create(dirname(out_path), recursive = TRUE, showWarnings = FALSE)
  jsonlite::write_json(payload, out_path, auto_unbox = TRUE, pretty = TRUE, na = "null")
  list(n_metrics = length(metrics), path = out_path)
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

  # Calibration glissante (suivi aws-refiners#212) — nécessite `conn` (ce n'est pas un post-process
  # sur fichier). Résiliente : un échec n'empêche pas le commit des autres données ;
  # le frontend retombe sur ses seuils codés si le fichier manque ou est partiel.
  # `optional = TRUE` : reste dans meta.json (page /status) mais est EXCLU du
  # comptage ok/err qui pilote le heartbeat Healthchecks — un échec de calibration
  # ne doit pas marquer le refresh comme partiellement en échec (le frontend
  # retombe proprement sur ses seuils codés).
  cal_res <- tryCatch({
    r <- build_salience_calibration(conn, "public/data/salience_calibration.json")
    message("[", format(Sys.time(), "%H:%M:%S"), "] Calibration: ",
            r$n_metrics, " métrique(s) -> ", r$path)
    list(name = "salience_calibration", status = "ok", optional = TRUE,
         metrics = r$n_metrics, generatedAt = NOW_UTC, path = r$path)
  }, error = function(e) {
    message("  !! Calibration FAILED: ", conditionMessage(e))
    list(name = "salience_calibration", status = "error", optional = TRUE,
         error = conditionMessage(e), generatedAt = NOW_UTC)
  })
  results[[length(results) + 1]] <- cal_res

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

  # Comptage sur les tables CORE seulement (les entrées `optional = TRUE`, ex.
  # calibration glissante, sont dans meta.json mais ne pilotent pas le heartbeat).
  core_results <- Filter(function(r) !isTRUE(r$optional), results)
  ok_count  <- sum(sapply(core_results, function(r) identical(r$status, "ok")))
  err_count <- length(core_results) - ok_count
  message("\nDone: ", ok_count, " ok, ", err_count, " failed out of ", length(core_results), " core tables.")

  # Ping Healthchecks.io heartbeat (only on full success)
  hc_url <- Sys.getenv("HEALTHCHECKS_URL", "")
  if (nzchar(hc_url) && err_count == 0) {
    system2("curl", c("-fsS", "--retry", "3", "--max-time", "10", hc_url),
            stdout = FALSE, stderr = FALSE)
    message("Healthchecks ping sent.")
  } else if (err_count > 0) {
    message("Skipping Healthchecks ping — ", err_count, " table(s) failed.")
  }

  # Résilience : une défaillance par table (ex. une colonne whitelistée pas encore
  # publiée par son refiner → COLUMN_NOT_FOUND) ne doit PAS bloquer le refresh de
  # toutes les autres tables. Chaque table est déjà isolée (tryCatch ci-dessus) et
  # les tables OK sont écrites sur disque ; on n'échoue (exit 1 → alerte Slack) que
  # si AUCUNE n'a réussi (ex. connexion perdue). Sinon on laisse le workflow committer
  # les données fraîches obtenues. Les erreurs par table restent visibles dans meta.json.
  if (ok_count == 0) quit(status = 1)
}

run()
