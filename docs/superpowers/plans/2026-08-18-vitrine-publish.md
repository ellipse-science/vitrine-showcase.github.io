# Plan d'implémentation : raffineur vitrine-publish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortir GitHub Actions et cron-job.org du chemin critique du rafraîchissement : un raffineur R dans AWS lit Athena, écrit dans Neon, puis déclenche les builds Cloudflare.

**Architecture:** Reprise de l'ébauche existante `origin/feat/vitrine-pg-sync` (aws-refiners `f78a112`, aws-infra `ceb8a1c`, non fusionnées), renommée `vitrine-publish`, corrigée (3 bogues bloquants) et complétée (filtres de rétention, formatage des dates, règle tout-ou-rien, hooks de déploiement, alerte Slack). Secrets via SSM Parameter Store : le rôle raffineur a déjà `ssm:GetParameter`, donc la PR aws-infra ne touche que `refiners.ts`.

**Tech Stack:** R 4.5.3 (image Lambda `base-r-refiner-image`), tube (Athena), RPostgres/DBI (Neon), paws (SSM), httr (hooks + Slack), lambdr ; CDK TypeScript (aws-infra) ; Cloudflare Pages (builds Git + Deploy Hooks).

**Spec :** `docs/superpowers/specs/2026-08-18-vitrine-publish-design.md` (approuvé). Écart assumé vs le spec : SSM Parameter Store remplace Secrets Manager (mécanisme déjà accessible au rôle raffineur, zéro changement IAM) ; le nom des paramètres garde le préfixe `vitrine/`.

## Global Constraints

- **Aucun credential AWS nouveau.** Le Lambda utilise son rôle d'exécution ; les tests locaux utilisent les clés DEV de `~/.Renviron`.
- **`refiners/<dossier>` == `ecrName`, caractère pour caractère** : `vitrine-publish`. Un écart produit un Lambda `ImageNotFound` sans erreur CI.
- **Ne PAS toucher `refiners/base-r-refiner-image/`** : tout changement y rebâtit et redéploie les ~23 images.
- **Horaires en heure de Montréal** dans `refiners.ts` (grille du cycle : {23, 03, 07, 11, 15, 19} ; publish tourne à l'heure suivante, :10). `weekDay` AWS : 1=dimanche…7=samedi (sans objet ici, cron quotidien).
- **Branches** : aws-refiners `feature/vitrine-publish` ; aws-infra `feature/deploy-vitrine-publish` (préfixe `feature/` obligatoire, jamais `feat/`, vérifié mécaniquement par `check-source-branch.yml`). Les deux partent de `origin/develop` (les checkouts locaux sont périmés : `git fetch` d'abord).
- **Commits** : convention `feat(vitrine-publish) : …` en français, corps expliquant le pourquoi ; trailer `Assisté par : Claude Code (Fable 5)` ; JAMAIS de `Co-Authored-By` vers une IA (bloqué par garde-attribution).
- **PR aws-refiners** : section `## Impact méthodologie` obligatoire (garde-metho), exactement une case cochée : « Métho mise à jour, PR vitrine liée » pointant la PR compagnon (tâche C1).
- **PR aws-infra** : garde-swimlanes bloque toute PR touchant `lib/data-stacks/refiners/**` si les swimlanes ne sont pas synchrones ; la PR compagnon (C1) doit être déclarée dans le corps.
- **R** : appels préfixés (`tube::`, `DBI::`, `logger::`), `logger::log_info/warn/error`, lint `.lintr` (120 col, indent 2), dernière ligne de `runtime.R` = `lambdr::start_lambda()`.
- **Pas de tiret cadratin** dans les documents et corps de PR du dépôt vitrine.

## Décisions héritées de l'exploration (ne pas re-découvrir)

1. `origin/feat/vitrine-pg-sync` contient 3 bogues à NE PAS hériter : `lambdr::start_lambda()` absent (Lambda 100 % non fonctionnel), `source_env` par défaut `"PROD"` (les tables sont dans les datamarts DEV), URL Postgres parsée à la main via httr2 avec une ligne morte. Corrections dans la tâche A3.
2. La connexion Postgres passe l'URI ENTIÈRE à libpq : `DBI::dbConnect(RPostgres::Postgres(), dbname = url)`. libpq parse `postgresql://…?sslmode=require` nativement ; httr2 disparaît.
3. `RPostgres` exige `libpq` : `RUN dnf -y install libpq-devel` dans le Dockerfile du raffineur (précédent : `v8-devel` dans `template-refiner`). C'est LE risque de build no 1 ; vérifié localement en tâche A4.
4. Les dates R (`Date`, `POSIXt`) doivent être formatées en chaînes ISO avant écriture : une colonne `Date` écrite dans une colonne `text` devient un nombre de jours (« 20678 ») en silence, et tout le contrat API (ordre lexicographique) casse.
5. `NA` ET chaînes vides deviennent NULL (les deux écrivains existants se défendent contre les `""` d'Athena).
6. `row_count` vient d'un `SELECT count(*)` post-insertion, jamais du pilote.
7. `sync_state.source = 'aws-refiner'` (arbitre de la phase d'ombre ; l'ébauche écrivait `'athena'`).
8. La table la plus en retard décide de la fraîcheur (`lib/data/source.ts`, 45 min) : le raffineur doit avancer les 15 lignes de `sync_state` à chaque cycle.
9. Payload EventBridge : le CDK enveloppe `{ event: {...} }` ; test manuel avec `--payload '{"event":{...}}'` (la forme plate du guide de déploiement est un piège documenté).
10. Après la bascule, le cron interne du Worker DOIT être coupé : il recopie les JSON de GitHub raw, qui ne seront plus frais qu'une fois par semaine ; le laisser écraserait les données du raffineur par des données vieilles. Trois fichiers couplés : `workers/api/wrangler.toml`, `workers/api/src/schedule.ts`, `tests/cron-schedule.test.ts`.

---

## Phase A : le raffineur (repo aws-refiners)

### Task A1 : squelette du raffineur

**Files:**
- Create: `refiners/vitrine-publish/Dockerfile`
- Create: `refiners/vitrine-publish/requirements.json`
- Create: `refiners/vitrine-publish/README.md` (rempli en A6)

**Interfaces:**
- Produces: l'image `pipeline-refiners-repository:vitrine-publish` (construite par deploy.yml au merge) ; le dossier que A2/A3 remplissent.

- [ ] **Step 1 : brancher depuis develop, à jour**

```bash
cd ~/Projects/vitrine/aws-refiners
git fetch origin
git checkout -b feature/vitrine-publish origin/develop
```

- [ ] **Step 2 : créer le dossier et le Dockerfile**

`refiners/vitrine-publish/Dockerfile` :

```dockerfile
ARG BASE_IMAGE=pipeline-refiners-repository:base-r-refiner-image
FROM ${BASE_IMAGE}

# RPostgres compile contre libpq : dépendance système absente de l'image de
# base (précédent : v8-devel dans template-refiner).
RUN dnf -y install libpq-devel

# Copy project files to lambda's home directory and set permissions
COPY . /lambda

# Install required CRAN R packages from requirements.json
RUN Rscript -e "reqs <- rjson::fromJSON(file='/lambda/requirements.json'); \
  cranDependencies <- reqs[[1]]; \
  if (length(cranDependencies) == 0) { \
    return \
  } else { \
    install.packages(cranDependencies, repos = 'https://cloud.r-project.org', INSTALL_opts = c('--no-help', '--no-html', '--no-docs')) \
  };"

# Install required non-CRAN R packages from requirements.json
RUN Rscript -e "reqs <- rjson::fromJSON(file='/lambda/requirements.json'); \
  nonCranDependencies <- reqs[[2]]; \
  if (length(nonCranDependencies) == 0) { \
    return \
  } else { \
    remotes::install_github(nonCranDependencies, INSTALL_opts = c('--no-help', '--no-html', '--no-docs')); \
  };"

RUN printf '#!/bin/sh\ncd /lambda\nRscript runtime.R' > /var/runtime/bootstrap \
  && chmod +x /var/runtime/bootstrap

CMD ["lambda_handler"]
```

- [ ] **Step 3 : requirements.json**

`refiners/vitrine-publish/requirements.json` :

```json
{
  "cranDependencies": ["RPostgres", "httr", "paws", "jsonlite"],
  "nonCranDependencies": []
}
```

(`tube`, `logger`, `DBI`, `dplyr` viennent de l'image de base ou transitivement ; on ne déclare que les dépendances nouvelles et dures.)

- [ ] **Step 4 : README.md vide pour l'instant, commit**

```bash
touch refiners/vitrine-publish/README.md
git add refiners/vitrine-publish
git commit -m "feat(vitrine-publish) : squelette du raffineur Athena vers Postgres

Reprend l'intention de la branche feat/vitrine-pg-sync (jamais fusionnée)
sous le nom du design approuvé (vitrine-showcase,
docs/superpowers/specs/2026-08-18-vitrine-publish-design.md).

Assisté par : Claude Code (Fable 5)"
```

### Task A2 : transformations pures + tests (TDD)

**Files:**
- Create: `refiners/vitrine-publish/transform.R`
- Create: `refiners/vitrine-publish/tests/run-tests.R`
- Create: `refiners/vitrine-publish/tests/testthat/test-transform.R`

**Interfaces:**
- Produces: `apply_filter(df, filter_id)`, `sort_rows_deterministically(df)`, `prepare_rows(df, cols)`, `assert_iso_dates(df, table_name)` ; constantes `HEADLINE_KEEP_DAYS = 14L`, `POLIMETRE_KEEP_DAYS = 70L`. Consommées par `runtime.R` (A3) via `source("transform.R")`.

- [ ] **Step 1 : écrire les tests (ils échouent : transform.R n'existe pas)**

`refiners/vitrine-publish/tests/run-tests.R` :

```r
# Point d'entree CI (pr.yml lance tous les */tests/run-tests.R). Aucun acces
# AWS ni reseau : transformations pures seulement.
`%||%` <- function(a, b) if (is.null(a)) b else a
this_file <- sys.frame(1)$ofile %||% "refiners/vitrine-publish/tests/run-tests.R"
testthat::test_dir(file.path(dirname(this_file), "testthat"))
```

`refiners/vitrine-publish/tests/testthat/test-transform.R` :

```r
source(file.path(dirname(dirname(getwd())), "transform.R"), chdir = TRUE)
# testthat::test_dir met le wd dans tests/testthat ; transform.R est deux
# niveaux plus haut, dans le dossier du raffineur.

test_that("headline_events_window garde 14 jours ancres sur l'horloge", {
  df <- data.frame(
    date_utc = as.Date(c(Sys.Date() - 1, Sys.Date() - 13, Sys.Date() - 15)),
    x = c("a", "b", "c")
  )
  out <- apply_filter(df, "headline_events_window")
  expect_equal(out$x, c("a", "b"))
})

test_that("polimetre_plus_recent est ancre sur la DONNEE, pas l'horloge", {
  old_max <- Sys.Date() - 200
  df <- data.frame(
    week_end_date = as.character(c(old_max, old_max - 69, old_max - 71)),
    y = 1:3
  )
  out <- apply_filter(df, "polimetre_plus_recent")
  expect_equal(out$y, c(1L, 2L))
})

test_that("filtre inconnu ou absent : passage tel quel", {
  df <- data.frame(a = 1:2)
  expect_identical(apply_filter(df, NULL), df)
  expect_identical(apply_filter(df, ""), df)
  expect_identical(nrow(apply_filter(df, "mystere")), 2L)
})

test_that("tri deterministe : meme ordre quel que soit l'ordre d'entree", {
  df1 <- data.frame(a = c("b", "a", "c"), n = c(2, 1, 3))
  df2 <- df1[c(3, 1, 2), ]
  expect_equal(sort_rows_deterministically(df1), sort_rows_deterministically(df2),
               ignore_attr = TRUE)
})

test_that("prepare_rows : colonnes manquantes creees NA, ordre du contrat", {
  df <- data.frame(b = 1:2)
  out <- prepare_rows(df, c("a", "b"))
  expect_equal(names(out), c("a", "b"))
  expect_true(all(is.na(out$a)))
})

test_that("prepare_rows : Date et POSIXct deviennent des chaines ISO", {
  df <- data.frame(date_utc = as.Date("2026-08-18"),
                   ts = as.POSIXct("2026-08-18 14:30:00", tz = "UTC"))
  out <- prepare_rows(df, c("date_utc", "ts"))
  expect_identical(out$date_utc, "2026-08-18")
  expect_identical(out$ts, "2026-08-18T14:30:00Z")
})

test_that("prepare_rows : chaines vides deviennent NA (futur NULL SQL)", {
  df <- data.frame(v = c("x", "", NA), stringsAsFactors = FALSE)
  out <- prepare_rows(df, "v")
  expect_identical(out$v, c("x", NA, NA))
})

test_that("assert_iso_dates refuse un nombre de jours deguise", {
  df <- data.frame(date_utc = "20678")
  expect_error(assert_iso_dates(df, "t"), "non ISO")
  ok <- data.frame(date_utc = c("2026-08-18", "2026-08-18T14:00:00Z", NA))
  expect_silent(assert_iso_dates(ok, "t"))
})
```

- [ ] **Step 2 : lancer, vérifier l'échec**

```bash
cd ~/Projects/vitrine/aws-refiners
Rscript refiners/vitrine-publish/tests/run-tests.R
```
Attendu : échec (« cannot open file … transform.R »).

- [ ] **Step 3 : écrire transform.R**

`refiners/vitrine-publish/transform.R` :

```r
# Transformations pures, sans AWS ni reseau : testees par tests/testthat.
#
# REPRISES DE scripts/fetch_data.R (repo vitrine-showcase.github.io), qui reste
# la copie du filet GitHub Actions. Toute modification ici doit etre repercutee
# la-bas tant que le filet existe ; la phase d'ombre compare les deux sorties.

# Fenetres de retention : memes valeurs et memes ancrages que fetch_data.R.
# headline : ancre sur l'horloge (archive publique de 14 jours).
# polimetre : ancre sur la DONNEE (dernier snapshot), pas sur Sys.Date() : si le
# raffineur amont cessait de publier, une fenetre horloge viderait la table
# ligne a ligne et le module disparaitrait du site sans bruit.
HEADLINE_KEEP_DAYS <- 14L
POLIMETRE_KEEP_DAYS <- 70L

sort_rows_deterministically <- function(df) {
  if (nrow(df) < 2L || ncol(df) == 0L) return(df)
  key <- do.call(paste, c(lapply(df, as.character), sep = ""))
  df[order(key, method = "radix"), , drop = FALSE]
}

apply_filter <- function(df, filter_id) {
  if (is.null(filter_id) || !nzchar(filter_id)) return(df)

  if (filter_id == "headline_events_window") {
    if ("date_utc" %in% names(df)) {
      cutoff_day <- as.integer(Sys.Date() - HEADLINE_KEEP_DAYS)
      df <- df[as.integer(as.Date(df$date_utc)) >= cutoff_day, , drop = FALSE]
    }
    return(df)
  }

  if (filter_id == "polimetre_plus_recent") {
    if ("week_end_date" %in% names(df) && nrow(df) > 0) {
      wed <- as.Date(df$week_end_date)
      if (any(!is.na(wed))) {
        cutoff <- max(wed, na.rm = TRUE) - POLIMETRE_KEEP_DAYS
        df <- df[!is.na(wed) & wed >= cutoff, , drop = FALSE]
      }
    }
    return(df)
  }

  message("  !! Filtre inconnu : ", filter_id, " ; passage tel quel")
  df
}

prepare_rows <- function(df, cols) {
  # Colonnes absentes creees vides plutot que d'echouer : le contrat declare
  # une colonne qu'un raffineur amont n'a pas encore produite, ce qui arrive
  # pendant un deploiement en deux temps.
  for (col in cols) if (!col %in% names(df)) df[[col]] <- NA
  df <- df[, cols, drop = FALSE]

  # Dates R en chaines ISO. Une colonne Date ecrite par RPostgres dans une
  # colonne text deviendrait un nombre de jours (« 20678 ») en silence, et le
  # contrat API (ordre lexicographique des dates) casserait partout.
  for (col in names(df)) {
    if (inherits(df[[col]], "Date")) {
      df[[col]] <- format(df[[col]], "%Y-%m-%d")
    } else if (inherits(df[[col]], "POSIXt")) {
      df[[col]] <- format(df[[col]], "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
    }
  }

  # NA et chaines vides deviennent NULL SQL : Athena a historiquement publie
  # des "" la ou la donnee manque, et une colonne numerique les refuse.
  for (col in names(df)) {
    if (is.character(df[[col]])) {
      vide <- !is.na(df[[col]]) & df[[col]] == ""
      df[[col]][vide] <- NA_character_
    }
  }
  df
}

DATE_COLS <- c("date_utc", "date_montreal_tz", "week_end_date",
               "period_start_date", "period_end_date")

assert_iso_dates <- function(df, table_name) {
  for (col in intersect(DATE_COLS, names(df))) {
    vals <- df[[col]][!is.na(df[[col]])]
    bad <- vals[!grepl("^\\d{4}-\\d{2}-\\d{2}", vals)]
    if (length(bad) > 0) {
      stop("Colonne ", col, " de ", table_name, " non ISO : ", bad[1])
    }
  }
  invisible(df)
}
```

- [ ] **Step 4 : lancer les tests, vérifier le succès**

```bash
Rscript refiners/vitrine-publish/tests/run-tests.R
```
Attendu : tous verts.

- [ ] **Step 5 : commit**

```bash
git add refiners/vitrine-publish/transform.R refiners/vitrine-publish/tests
git commit -m "feat(vitrine-publish) : transformations pures et tests

Retention, tri deterministe, formatage ISO des dates et normalisation
NA/chaine vide, repris de fetch_data.R et testes sans AWS.

Assisté par : Claude Code (Fable 5)"
```

### Task A3 : runtime.R complet

**Files:**
- Create: `refiners/vitrine-publish/runtime.R`

**Interfaces:**
- Consumes: `transform.R` (A2) : `apply_filter`, `sort_rows_deterministically`, `prepare_rows`, `assert_iso_dates`.
- Consumes (runtime) : paramètres SSM `/vitrine/api/database-url`, `/vitrine/publish/deploy-hook-prod`, `/vitrine/publish/deploy-hook-dev`, `/vitrine/publish/slack-webhook` (créés en B2).
- Produces: `lambda_handler(event, context)` avec payload `{source_env, trigger_deploys}` ; écrit `vitrine.<table>` + `vitrine.sync_state` (source `'aws-refiner'`).

- [ ] **Step 1 : écrire runtime.R**

```r
# vitrine-publish : Athena vers Postgres (Neon), puis builds Cloudflare.
#
# POURQUOI CE RAFFINEUR EXISTE. Jusqu'ici scripts/fetch_data.R (repo
# vitrine-showcase) interrogeait Athena depuis GitHub Actions, declenche par
# cron-job.org. Ce raffineur fait le meme travail DANS AWS, sous le role
# d'execution du Lambda, puis declenche lui-meme les builds : l'ordre
# « synchro avant build » est garanti par construction (regression du
# 2026-08-18). Design : vitrine-showcase,
# docs/superpowers/specs/2026-08-18-vitrine-publish-design.md.
#
# STRATEGIE : remplacement integral par table, une transaction par table
# (TRUNCATE puis append). Pas d'UPSERT : on relit les tables entieres, il n'y
# a aucun delta a exploiter. Un lecteur de l'API voit l'ancien jeu complet ou
# le nouveau, jamais une table a moitie vide.
#
# REGLE DES HOOKS : TOUT OU RIEN. Une seule table en echec = aucun deploiement
# (alerte Slack, le site garde son dernier build coherent). Les transactions
# par table restent independantes : les 14 autres tables sont bien ecrites,
# seul le declenchement des builds est retenu.

source("transform.R")

`%||%` <- function(a, b) if (is.null(a)) b else a

WHITELIST_URL <- paste0(
  "https://raw.githubusercontent.com/ellipse-science/",
  "vitrine-showcase.github.io/main/scripts/tables.json"
)

load_whitelist <- function() {
  logger::log_info("Lecture de la whitelist : ", WHITELIST_URL)
  config <- tryCatch(
    jsonlite::fromJSON(WHITELIST_URL, simplifyVector = FALSE),
    error = function(e) stop("tables.json illisible (", conditionMessage(e), ")")
  )
  enabled <- Filter(function(t) isTRUE(t$enabled), config$tables)
  logger::log_info("Whitelist : ", length(enabled), " tables activees.")
  enabled
}

#' Parametre SSM (SecureString dechiffre). Le role raffineur a deja
#' ssm:GetParameter : aucun changement IAM, aucun secret dans l'image.
get_ssm_param <- function(name) {
  ssm <- paws::ssm()
  res <- ssm$get_parameter(Name = name, WithDecryption = TRUE)
  val <- res$Parameter$Value
  if (is.null(val) || !nzchar(val)) stop("Parametre SSM ", name, " vide ou absent.")
  val
}

#' Connexion Neon : l'URI entiere part dans dbname, libpq la parse nativement
#' (y compris ?sslmode=require). Pas de parsing maison.
pg_connect <- function(url) {
  DBI::dbConnect(RPostgres::Postgres(), dbname = url)
}

#' Copie une table Athena vers Postgres. Renvoie le nombre de lignes ecrites,
#' recompte par SELECT count(*) (invariant herite de sync.ts : ne jamais se
#' fier au compte du pilote).
sync_one_table <- function(con_athena, con_pg, spec) {
  cols <- unlist(spec$cols)
  quoted <- paste0('"', cols, '"', collapse = ", ")
  query <- paste0('SELECT ', quoted, ' FROM "', spec$athena, '"')

  logger::log_info("Athena : ", spec$athena)
  rows <- as.data.frame(DBI::dbGetQuery(con_athena, query))
  logger::log_info("  ", nrow(rows), " lignes lues")

  rows <- apply_filter(rows, spec$filter)
  rows <- sort_rows_deterministically(rows)
  rows <- prepare_rows(rows, cols)
  assert_iso_dates(rows, spec$name)

  target <- DBI::Id(schema = "vitrine", table = spec$name)

  DBI::dbBegin(con_pg)
  n <- tryCatch({
    DBI::dbExecute(con_pg, paste0('TRUNCATE vitrine."', spec$name, '"'))
    if (nrow(rows) > 0) DBI::dbAppendTable(con_pg, target, rows)
    DBI::dbExecute(
      con_pg,
      paste0(
        "INSERT INTO vitrine.sync_state (table_name, synced_at, row_count, source) ",
        "VALUES ($1, now(), $2, 'aws-refiner') ",
        "ON CONFLICT (table_name) DO UPDATE SET ",
        "synced_at = EXCLUDED.synced_at, row_count = EXCLUDED.row_count, ",
        "source = EXCLUDED.source"
      ),
      params = list(spec$name, nrow(rows))
    )
    counted <- DBI::dbGetQuery(
      con_pg, paste0('SELECT count(*)::int AS n FROM vitrine."', spec$name, '"')
    )$n
    DBI::dbCommit(con_pg)
    logger::log_info("  ", counted, " lignes en base")
    counted
  }, error = function(e) {
    DBI::dbRollback(con_pg)
    logger::log_error("  ROLLBACK ", spec$name, " : ", conditionMessage(e))
    NA_integer_
  })
  n
}

notify_slack <- function(text) {
  tryCatch({
    url <- get_ssm_param("/vitrine/publish/slack-webhook")
    httr::POST(url,
      body = jsonlite::toJSON(list(text = text), auto_unbox = TRUE),
      httr::content_type_json(), httr::timeout(15))
    invisible(NULL)
  }, error = function(e) {
    logger::log_error("Alerte Slack impossible : ", conditionMessage(e))
  })
}

#' Declenche les rebuilds Cloudflare Pages. Appele SEULEMENT si les 15 tables
#' ont reussi (regle tout-ou-rien du design).
trigger_deploy_hooks <- function() {
  for (p in c("/vitrine/publish/deploy-hook-prod", "/vitrine/publish/deploy-hook-dev")) {
    url <- get_ssm_param(p)
    res <- httr::POST(url, httr::timeout(30))
    code <- httr::status_code(res)
    if (code >= 300) stop("Deploy hook ", p, " a repondu ", code)
    logger::log_info("Hook declenche : ", p)
  }
}

lambda_handler <- function(event, context) {
  logger::log_info("Demarrage de vitrine-publish.")

  # !!! KEEP THESE 3 LINES BEFORE DEPLOYING !!!
  # !!! COMMENT OUT FOR LOCAL TESTING !!!
  Sys.unsetenv("AWS_SESSION_TOKEN")
  Sys.unsetenv("AWS_SECRET_ACCESS_KEY")
  Sys.unsetenv("AWS_ACCESS_KEY_ID")

  # Les tables consommees par le site vivent dans les datamarts DEV
  # (docs/reference/aws-backend.md du repo vitrine) : DEV est le bon defaut.
  source_env <- event[["source_env"]] %||% "DEV"
  # FALSE pendant la phase d'ombre : on ecrit Neon sans toucher aux builds.
  trigger_deploys <- isTRUE(event[["trigger_deploys"]])
  logger::log_info("source_env=", source_env, " trigger_deploys=", trigger_deploys)

  whitelist <- load_whitelist()
  con_athena <- tube::ellipse_connect(env = source_env, database = "datamarts")
  con_pg <- pg_connect(get_ssm_param("/vitrine/api/database-url"))
  on.exit({
    try(DBI::dbDisconnect(con_athena), silent = TRUE)
    try(DBI::dbDisconnect(con_pg), silent = TRUE)
  })

  results <- list()
  for (spec in whitelist) {
    n <- tryCatch(
      sync_one_table(con_athena, con_pg, spec),
      error = function(e) {
        logger::log_error("Table ", spec$name, " en echec : ", conditionMessage(e))
        NA_integer_
      }
    )
    results[[spec$name]] <- n
  }

  failed <- names(Filter(is.na, results))
  synced <- length(results) - length(failed)
  logger::log_info("Synchronise ", synced, "/", length(results), " tables.")

  if (length(failed) > 0) {
    msg <- paste0("vitrine-publish : ", length(failed), " table(s) en echec (",
                  paste(failed, collapse = ", "), ") ; builds NON declenches.")
    logger::log_error(msg)
    notify_slack(msg)
    stop(msg)
  }

  if (trigger_deploys) {
    tryCatch(trigger_deploy_hooks(), error = function(e) {
      msg <- paste0("vitrine-publish : donnees ecrites mais hook en echec : ",
                    conditionMessage(e))
      notify_slack(msg)
      stop(msg)
    })
  } else {
    logger::log_info("Phase d'ombre : hooks non declenches.")
  }

  list(synced = synced, failed = failed)
}

lambdr::start_lambda()
```

- [ ] **Step 2 : lint**

```bash
Rscript -e "lintr::lint('refiners/vitrine-publish/runtime.R')"
Rscript -e "lintr::lint('refiners/vitrine-publish/transform.R')"
```
Attendu : aucune sortie.

- [ ] **Step 3 : relancer les tests A2 (transform.R n'a pas bougé, mais on vérifie)**

```bash
Rscript refiners/vitrine-publish/tests/run-tests.R
```

- [ ] **Step 4 : commit**

```bash
git add refiners/vitrine-publish/runtime.R
git commit -m "feat(vitrine-publish) : runtime Athena vers Neon puis hooks Cloudflare

Corrige les trois defauts de l'ebauche feat/vitrine-pg-sync : start_lambda()
manquant, source_env PROD au lieu de DEV, parsing d'URL maison (libpq recoit
l'URI entiere). Ajoute retention, formatage ISO, regle tout-ou-rien et
alerte Slack via SSM.

Assisté par : Claude Code (Fable 5)"
```

### Task A4 : vérifier que l'image se construit (RPostgres est LE risque)

**Files:** aucun nouveau ; validation.

- [ ] **Step 1 : récupérer l'image de base DEV et construire localement**

```bash
cd ~/Projects/vitrine/aws-refiners
aws ecr get-login-password --region ca-central-1 --profile dev-renviron 2>/dev/null \
  || echo "utiliser les clés .Renviron : AWS_ACCESS_KEY_ID=... docker login ..."
docker pull 097610011506.dkr.ecr.ca-central-1.amazonaws.com/pipeline-refiners-repository:base-r-refiner-image
docker build \
  --build-arg BASE_IMAGE=097610011506.dkr.ecr.ca-central-1.amazonaws.com/pipeline-refiners-repository:base-r-refiner-image \
  -t vitrine-publish:local refiners/vitrine-publish
```
Attendu : build complet ; l'étape `install.packages("RPostgres")` compile sans erreur `libpq-fe.h`. Si l'ECR n'est pas accessible avec les clés locales, cette validation se fait via le build de `pr.yml` à l'ouverture de la PR (il construit sans pousser) : ouvrir la PR en draft d'abord.

- [ ] **Step 2 : vérifier le chargement des paquets dans l'image**

```bash
docker run --rm --entrypoint Rscript vitrine-publish:local \
  -e "library(RPostgres); library(paws); library(httr); source('/lambda/transform.R'); cat('OK\n')"
```
Attendu : `OK`.

### Task A5 : test local de bout en bout contre une branche Neon

**Files:**
- Create: `refiners/vitrine-publish/test_local.R`

**Interfaces:**
- Consumes: clés `.Renviron` (`AWS_ACCESS_KEY_ID_DEV`...), une branche Neon jetable créée dans le dashboard Neon (URL de connexion copiée).

- [ ] **Step 1 : écrire test_local.R**

```r
# Test local de vitrine-publish contre une BRANCHE Neon jetable.
#
# AVANT : dans runtime.R, commenter lambdr::start_lambda() et les trois
# Sys.unsetenv(). NE PAS COMMITTER ces modifications.
# La branche Neon se cree dans le dashboard (Branches > Create branch) ;
# elle copie schema et donnees de main, parfait pour comparer avant/apres.

readRenviron("~/.Renviron")
Sys.setenv(
  AWS_ACCESS_KEY_ID = Sys.getenv("AWS_ACCESS_KEY_ID_DEV"),
  AWS_SECRET_ACCESS_KEY = Sys.getenv("AWS_SECRET_ACCESS_KEY_DEV"),
  AWS_REGION = "ca-central-1"
)

# URL de la branche Neon jetable, PAS celle de production.
NEON_BRANCH_URL <- Sys.getenv("NEON_BRANCH_URL")
stopifnot(nzchar(NEON_BRANCH_URL))

# Court-circuite SSM : on injecte l'URL de test.
get_ssm_param <- function(name) {
  if (name == "/vitrine/api/database-url") return(NEON_BRANCH_URL)
  stop("SSM court-circuite en local ; parametre inattendu : ", name)
}

setwd("refiners/vitrine-publish")
source("transform.R")
source("runtime.R")

# APRES le source : runtime.R definit son propre get_ssm_param, on l'ecrase
# ici pour injecter l'URL de la branche jetable sans toucher a SSM.
get_ssm_param <- function(name) {
  if (name == "/vitrine/api/database-url") return(NEON_BRANCH_URL)
  stop("SSM court-circuite en local ; parametre inattendu : ", name)
}

res <- lambda_handler(
  event = list(source_env = "DEV", trigger_deploys = FALSE),
  context = list()
)
print(res)
```

- [ ] **Step 2 : exécuter**

```bash
cd ~/Projects/vitrine/aws-refiners
NEON_BRANCH_URL='postgresql://...branche-jetable...?sslmode=require' Rscript refiners/vitrine-publish/test_local.R
```
Attendu : `synced = 15, failed = character(0)`.

- [ ] **Step 3 : comparer avec les JSON commités du dernier cycle**

Depuis le repo vitrine (`~/Projects/vitrine/vitrine-showcase.github.io`) :

```bash
python3 - <<'EOF'
import json, urllib.request
# Compare les comptes de lignes : JSON commite vs branche Neon (via psql).
# Les comptes peuvent differer legerement si un cycle Athena est passe entre
# les deux ; l'ordre de grandeur et les colonnes doivent correspondre.
with open('public/data/refined/day/issues_score_day.json') as f:
    print('issues_score_day JSON :', len(json.load(f)))
EOF
psql "$NEON_BRANCH_URL" -c 'SELECT table_name, row_count FROM vitrine.sync_state ORDER BY table_name;'
psql "$NEON_BRANCH_URL" -c "SELECT date_utc FROM vitrine.issues_score_day ORDER BY date_utc DESC LIMIT 3;"
```
Vérifications : 15 lignes dans sync_state, source `aws-refiner` ; `date_utc` au format `2026-…`, jamais un entier ; comptes du même ordre que les JSON.

- [ ] **Step 4 : restaurer runtime.R (start_lambda et Sys.unsetenv decommentes), commit de test_local.R seulement**

```bash
git diff refiners/vitrine-publish/runtime.R   # doit etre vide
git add refiners/vitrine-publish/test_local.R
git commit -m "feat(vitrine-publish) : test local contre une branche Neon

Assisté par : Claude Code (Fable 5)"
```

### Task A6 : README + PR aws-refiners

**Files:**
- Modify: `refiners/vitrine-publish/README.md`

- [ ] **Step 1 : README** : pipeline (Athena DEV -> filtres -> Neon -> hooks), tableau des 4 paramètres SSM, payload (`source_env`, `trigger_deploys`), schéma des tables (renvoyer à `sql/schema.sql` du repo vitrine), procédure de test local, changelog.
- [ ] **Step 2 : commit + push + PR draft vers develop**

```bash
git add refiners/vitrine-publish/README.md
git commit -m "docs(vitrine-publish) : README du raffineur

Assisté par : Claude Code (Fable 5)"
git push -u origin feature/vitrine-publish
gh pr create --draft --base develop --title "feat(vitrine-publish) : Athena vers Postgres et builds Cloudflare, depuis AWS"
```
Corps de PR : 4 puces ; section `## Impact méthodologie` avec « Métho mise à jour, PR vitrine liée : ellipse-science/vitrine-showcase.github.io#<PR C1> » ; ligne « 🤖 Assisté par : Claude Code (Fable 5) ». Vérifier que `pr.yml` construit l'image (valide RPostgres si A4 n'a pas pu tourner localement). Marquer prête après C1.

---

## Phase B : enregistrement (repo aws-infra) + paramètres

### Task B1 : enregistrer le raffineur, inactif d'abord

**Files:**
- Modify: `lib/data-stacks/refiners/refiners.ts` (seul fichier touché)

**Interfaces:**
- Consumes: image `vitrine-publish` (poussée au merge de A6), type `RefinerConfigProps` (payload `Record<string, any>[]` : les booléens passent).
- Produces: Lambda + 6 horaires EventBridge (heure de Montréal) + redéploiement auto sur push ECR.

- [ ] **Step 1 : brancher depuis develop à jour**

```bash
cd ~/Projects/vitrine/aws-infra
git fetch origin
git checkout -b feature/deploy-vitrine-publish origin/develop
```

- [ ] **Step 2 : ajouter au bloc d'en-tête des horaires** (grille Montréal existante) :

```ts
// VITRINE_PUBLISH runs:             00:10  04:10  08:10  12:10  16:10  20:10
```

- [ ] **Step 3 : membre d'enum**

```ts
  VITRINE_PUBLISH = 'vitrine-publish',
```

- [ ] **Step 4 : entrée de configuration** (après VITRINE_GRAPH_DATA) :

```ts
      {
        // vitrine-publish : Athena -> Postgres (Neon) -> Deploy Hooks
        // Cloudflare. Remplace la chaine cron-job.org -> GitHub Actions
        // (refresh-data.yml) comme chemin critique du rafraichissement du
        // site ; refresh-data.yml devient le filet hebdomadaire. Design :
        // vitrine-showcase, docs/superpowers/specs/
        // 2026-08-18-vitrine-publish-design.md.
        //
        // HORAIRE :10 de l'heure SUIVANT la fin du cycle {23,03,07,11,15,19} :
        // le dernier etage (event-salience :51) est termine, les tables sont
        // completes. trigger_deploys=false pendant la phase d'ombre : ecrit
        // Neon, ne declenche aucun build (bascule = passer a true).
        name: RefinerECRName.VITRINE_PUBLISH,
        timeout: Duration.minutes(15),
        cron: [
          { minute: '10', hour: '0', day: '*', month: '*', year: '*' },
          { minute: '10', hour: '4', day: '*', month: '*', year: '*' },
          { minute: '10', hour: '8', day: '*', month: '*', year: '*' },
          { minute: '10', hour: '12', day: '*', month: '*', year: '*' },
          { minute: '10', hour: '16', day: '*', month: '*', year: '*' },
          { minute: '10', hour: '20', day: '*', month: '*', year: '*' },
        ],
        payload: [
          { source_env: 'DEV', trigger_deploys: false },
          { source_env: 'DEV', trigger_deploys: false },
          { source_env: 'DEV', trigger_deploys: false },
          { source_env: 'DEV', trigger_deploys: false },
          { source_env: 'DEV', trigger_deploys: false },
          { source_env: 'DEV', trigger_deploys: false },
        ],
        memorySize: 4096, // meme gabarit que l'ebauche vitrine-pg-sync
        ephemeralStorageSize: 2048, // resultats de requetes Athena
        ecrName: 'vitrine-publish',
        active: false, // active apres creation des parametres SSM (B2)
      },
```

- [ ] **Step 5 : valider et committer**

```bash
yarn lint && npx tsc --noEmit
git add lib/data-stacks/refiners/refiners.ts
git commit -m "feat(vitrine-publish) : enregistre le raffineur Athena vers Postgres

Inactif tant que les parametres SSM n'existent pas. Aucun changement IAM :
le role raffineur lit deja SSM (contrairement a l'ebauche ceb8a1c qui
passait par Secrets Manager et exigeait une politique en plus).

Assisté par : Claude Code (Fable 5)"
git push -u origin feature/deploy-vitrine-publish
gh pr create --draft --base develop --title "feat(vitrine-publish) : enregistrement du raffineur (inactif)"
```
Corps de PR : déclarer la PR compagnon C1 (garde-swimlanes) et le fait qu'un seul fichier est touché.

### Task B2 : paramètres SSM + activation (nécessite un accès écriture AWS : équipe)

**Files:**
- Modify: `lib/data-stacks/refiners/refiners.ts` (une ligne : `active`)

- [ ] **Step 1 : runbook pour la personne avec accès admin DEV** (compte 097610011506, région ca-central-1) :

```bash
aws ssm put-parameter --name /vitrine/api/database-url --type SecureString \
  --value 'postgresql://...neon-production...?sslmode=require'
aws ssm put-parameter --name /vitrine/publish/deploy-hook-prod --type SecureString \
  --value 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...'
aws ssm put-parameter --name /vitrine/publish/deploy-hook-dev --type SecureString \
  --value 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...'
aws ssm put-parameter --name /vitrine/publish/slack-webhook --type SecureString \
  --value 'https://hooks.slack.com/services/...'
```
Les URLs des hooks viennent de D1 (créées dans le dashboard Cloudflare) ; en phase d'ombre, des valeurs factices `https://example.invalid/hook` suffisent (jamais appelées avec `trigger_deploys=false`). Le webhook Slack est celui de `refresh-data.yml` (`SLACK_WEBHOOK_URL` des secrets GitHub).

- [ ] **Step 2 : basculer `active`**

```ts
        active: !isProd(envName),
```

```bash
git commit -am "feat(vitrine-publish) : active le raffineur en DEV

Les parametres SSM existent ; l'image est dans l'ECR depuis le merge
aws-refiners. Demarre la phase d'ombre (trigger_deploys=false).

Assisté par : Claude Code (Fable 5)"
git push
```
Le déploiement CDK suit le pipeline habituel de l'équipe au merge.

---

## Phase C : PR compagnon vitrine (métho)

### Task C1 : swimlanes + horaire

**Files (repo vitrine-showcase.github.io, branche `docs/metho-vitrine-publish`):**
- Modify: `public/docs/workflow-vitrine-2025-swimlanes.html` (ajouter le couloir vitrine-publish : Athena -> Neon -> hooks, 6 fois/jour :10)
- Modify: `public/docs/horaire-refiners-2026.html` (ligne vitrine-publish 00:10/04:10/08:10/12:10/16:10/20:10, heure de Montréal, avec l'état « ombre » puis « actif »)

- [ ] **Step 1 :** éditer les deux documents (suivre `.claude/skills/synchro-methodologie/SKILL.md` du repo vitrine) ; marquer l'état EN COURS (phase d'ombre) conformément à la convention LIVRÉ / EN COURS.
- [ ] **Step 2 :** commit, push, PR vers main avec la case métho « Métho mise à jour dans cette PR » ; lier les PR A6 et B1. Le check `garde-swimlanes` d'aws-infra doit passer une fois cette PR fusionnée.

---

## Phase D : bascule (GATE : parité confirmée en phase d'ombre + accord humain)

Critère d'entrée : plusieurs jours de cycles où `/v1/health` montre `source='aws-refiner'` sur les 15 tables après chaque :10, des `row_count` cohérents avec les JSON commités, zéro alerte Slack.

### Task D1 : Cloudflare Pages en builds Git + hooks (manuel, dashboard)

Runbook (aucun fichier ; opérateur avec accès au compte Cloudflare) :

- [ ] **Step 1 :** projet Pages prod : Settings > Builds & deployments > connecter le repo GitHub, production branch `prod`, build command `npm run build`, output `out`. Variables (copier de `.github/workflows/deploy-prod.yml`) : `NEXT_PUBLIC_BASE_PATH` = vide (POSÉE, pas omise), `NEXT_PUBLIC_SITE_ENV=prod`, `NEXT_PUBLIC_SITE_ORIGIN=https://vitrinedemocratique.com`, `VITRINE_DATA_SOURCE=api`, `VITRINE_API_KEY`, `NEXT_PUBLIC_DISPATCH_URL`, `NEXT_PUBLIC_UPSTASH_REDIS_REST_URL`, `NEXT_PUBLIC_UPSTASH_REDIS_REST_READONLY_TOKEN`.
- [ ] **Step 2 :** idem projet dev, branche `main`, `NEXT_PUBLIC_SITE_ENV=dev`, `NEXT_PUBLIC_SITE_ORIGIN=https://dev.vitrinedemocratique.com`.
- [ ] **Step 3 :** créer un Deploy Hook par projet (Settings > Builds > Deploy hooks) ; tester au curl (`curl -X POST <url>` doit lancer un build visible) ; remplacer les valeurs factices SSM de B2 par les vraies.
- [ ] **Step 4 :** vérifier la parité : comparer le HTML de dev construit par Pages avec celui du dernier build GitHub Actions (mêmes sections, mêmes données).

### Task D2 : armer les hooks (aws-infra, une ligne par payload)

- [ ] **Step 1 :** `refiners.ts` : passer les 6 payloads à `trigger_deploys: true`. Commit `feat(vitrine-publish) : arme les deploy hooks (fin de la phase d'ombre)`, PR, merge, déploiement pipeline.
- [ ] **Step 2 :** observer un cycle complet : à :10, CloudWatch montre 15/15, deux builds Pages démarrent, prod sert les nouvelles données ~10 min plus tard.

### Task D3 : rétrograder GitHub Actions et couper le cron du Worker (repo vitrine)

**Files (branche `chore/demote-gh-actions`):**
- Modify: `.github/workflows/refresh-data.yml` : remplacer le déclenchement 4 h par un cron hebdomadaire GitHub + `workflow_dispatch` :

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: '0 12 * * 1'  # filet hebdomadaire, lundi 12:00 UTC
```

- Modify: `.github/workflows/deploy-prod.yml` et `.github/workflows/deploy-dev-cloudflare.yml` : ne garder que `workflow_dispatch:` comme déclencheur (OBLIGATOIRE avec les builds Git Pages, sinon double déploiement à chaque poussée).
- Modify: `workers/api/wrangler.toml` : supprimer le bloc `[triggers]` / `crons` (le cron recopierait des JSON devenus hebdomadaires par-dessus les données fraîches du raffineur : nuisible, pas redondant).
- Modify: `workers/api/src/schedule.ts` + `workers/api/src/index.ts` : retirer la gestion du cron (`scheduled`), ou la neutraliser en gardant l'export pour compatibilité ; `sync.ts` garde `/v1/sync` (utilisé par le filet hebdomadaire).
- Modify: `tests/cron-schedule.test.ts` : adapter (il couple wrangler.toml et schedule.ts ; il échouera si on retire l'un sans l'autre).

- [ ] **Step 1 :** faire les cinq modifications ci-dessus, `npm test`, `npm run build`.
- [ ] **Step 2 :** déployer le Worker (`cd workers/api && npx wrangler deploy`).
- [ ] **Step 3 :** PR (métho : aucune ; note de journal grand public : « le site se met a jour depuis notre infrastructure, plus vite et plus fiablement »).
- [ ] **Step 4 :** désactiver le cron sur cron-job.org (compte fermé seulement après deux semaines stables).

### Task D4 : vérification finale (critères d'acceptation du spec)

- [ ] 1. Un cycle complet sans AUCUN workflow GitHub : `gh run list --limit 10` ne montre rien au moment du cycle ; les builds Pages tournent.
- [ ] 2. `curl -s https://api.vitrinedemocratique.com/v1/health` : 15 tables, `source='aws-refiner'`, horodatages < 45 min après :10.
- [ ] 3. Échec simulé (renommer temporairement un paramètre SSM, invoquer le Lambda avec `--payload '{"event":{"source_env":"DEV","trigger_deploys":true}}'`) : alerte Slack reçue, AUCUN build déclenché, site inchangé. Restaurer le paramètre.
- [ ] 4. `git log origin/prod..origin/main -- app lib components` : toujours le test de promotion, inchangé.
- [ ] 5. Mettre à jour `docs/reference/environnements.md` et `docs/reference/aws-backend.md` (le chemin critique ne passe plus par GitHub Actions), et les statuts EN COURS -> LIVRÉ des documents métho.

## Hors périmètre (assumé, documenté dans le spec)

- `public/data/meta.json` et `salience_calibration.json` restent produits par le filet hebdomadaire (fenêtre 365 j : une semaine de retard est sans effet) ; ils ne sont pas dans l'API (documenté dans `lib/data/source.ts`).
- Les deux `post_process` de `tables.json` sont `enabled: false` : rien à porter.
- GitHub Pages (`deploy.yml`) reste tel quel jusqu'à décision d'équipe.
- La suppression définitive des workflows et l'arrêt des commits JSON : décision d'équipe après deux semaines stables.
