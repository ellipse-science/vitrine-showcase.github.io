-- Généré par scripts/generate_pg_schema.mjs — NE PAS ÉDITER À LA MAIN.
-- Source de vérité : scripts/tables.json (contrat de schéma public).
-- Régénérer : node scripts/generate_pg_schema.mjs > sql/schema.sql

CREATE SCHEMA IF NOT EXISTS vitrine;

-- provincial_parties_score_day  (Athena : vitrine_datamart-provincial_parties_score_day)
-- consommé par lib/data/parties.ts + components/sections/PartisCouvertureSection.tsx
CREATE TABLE IF NOT EXISTS vitrine."provincial_parties_score_day" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision,
  "pass" text
);
CREATE INDEX IF NOT EXISTS "provincial_parties_score_day_party_idx" ON vitrine."provincial_parties_score_day" ("party");
CREATE INDEX IF NOT EXISTS "provincial_parties_score_day_date_utc_idx" ON vitrine."provincial_parties_score_day" ("date_utc");
CREATE INDEX IF NOT EXISTS "provincial_parties_score_day_date_montreal_tz_idx" ON vitrine."provincial_parties_score_day" ("date_montreal_tz");

-- agora_decideurs_qc  (Athena : agora_datamart-agora_decideurs_qc)
-- consommé par lib/data/assemblee.ts + components/sections/AssembleeSection.tsx
CREATE TABLE IF NOT EXISTS vitrine."agora_decideurs_qc" (
  "period_type" text,
  "period_start_date" text,
  "period_end_date" text,
  "party" text,
  "n_interventions" integer,
  "word_count" integer,
  "lexical_richness" double precision,
  "tone_score" double precision,
  "economy_and_labour" double precision,
  "rights_liberties_minorities_discrimination" double precision,
  "health_and_social_services" double precision,
  "public_lands_and_agriculture" double precision,
  "immigration" double precision,
  "education" double precision,
  "environment_and_energy" double precision,
  "law_and_crime" double precision,
  "international_affairs_and_defense" double precision,
  "technology" double precision,
  "governments_and_governance" double precision,
  "culture_and_nationalism" double precision,
  "editorial_angle" text,
  "signature_word" text,
  "signature_word_context" text
);
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_period_type_idx" ON vitrine."agora_decideurs_qc" ("period_type");
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_period_start_date_idx" ON vitrine."agora_decideurs_qc" ("period_start_date");
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_period_end_date_idx" ON vitrine."agora_decideurs_qc" ("period_end_date");
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_party_idx" ON vitrine."agora_decideurs_qc" ("party");

-- agora_decideurs_qc_deputes  (Athena : agora_datamart-agora_decideurs_qc_deputes)
-- consommé par lib/data/assemblee.ts + components/sections/AssembleeSection.tsx
CREATE TABLE IF NOT EXISTS vitrine."agora_decideurs_qc_deputes" (
  "period_type" text,
  "period_start_date" text,
  "period_end_date" text,
  "party" text,
  "deputy" text,
  "n_interventions" integer,
  "word_count" integer,
  "lexical_richness" double precision,
  "tone_score" double precision,
  "economy_and_labour" double precision,
  "rights_liberties_minorities_discrimination" double precision,
  "health_and_social_services" double precision,
  "public_lands_and_agriculture" double precision,
  "immigration" double precision,
  "education" double precision,
  "environment_and_energy" double precision,
  "law_and_crime" double precision,
  "international_affairs_and_defense" double precision,
  "technology" double precision,
  "governments_and_governance" double precision,
  "culture_and_nationalism" double precision,
  "signature_word" text,
  "signature_word_context" text
);
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_deputes_period_type_idx" ON vitrine."agora_decideurs_qc_deputes" ("period_type");
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_deputes_period_start_date_idx" ON vitrine."agora_decideurs_qc_deputes" ("period_start_date");
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_deputes_period_end_date_idx" ON vitrine."agora_decideurs_qc_deputes" ("period_end_date");
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_deputes_party_idx" ON vitrine."agora_decideurs_qc_deputes" ("party");
CREATE INDEX IF NOT EXISTS "agora_decideurs_qc_deputes_deputy_idx" ON vitrine."agora_decideurs_qc_deputes" ("deputy");

-- federal_parties_score_week  (Athena : vitrine_datamart-federal_parties_score_week)
CREATE TABLE IF NOT EXISTS vitrine."federal_parties_score_week" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision
);
CREATE INDEX IF NOT EXISTS "federal_parties_score_week_party_idx" ON vitrine."federal_parties_score_week" ("party");
CREATE INDEX IF NOT EXISTS "federal_parties_score_week_date_utc_idx" ON vitrine."federal_parties_score_week" ("date_utc");
CREATE INDEX IF NOT EXISTS "federal_parties_score_week_date_montreal_tz_idx" ON vitrine."federal_parties_score_week" ("date_montreal_tz");

-- provincial_parties_score_week  (Athena : vitrine_datamart-provincial_parties_score_week)
CREATE TABLE IF NOT EXISTS vitrine."provincial_parties_score_week" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision
);
CREATE INDEX IF NOT EXISTS "provincial_parties_score_week_party_idx" ON vitrine."provincial_parties_score_week" ("party");
CREATE INDEX IF NOT EXISTS "provincial_parties_score_week_date_utc_idx" ON vitrine."provincial_parties_score_week" ("date_utc");
CREATE INDEX IF NOT EXISTS "provincial_parties_score_week_date_montreal_tz_idx" ON vitrine."provincial_parties_score_week" ("date_montreal_tz");

-- federal_parties_score_month  (Athena : vitrine_datamart-federal_parties_score_month)
CREATE TABLE IF NOT EXISTS vitrine."federal_parties_score_month" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision
);
CREATE INDEX IF NOT EXISTS "federal_parties_score_month_party_idx" ON vitrine."federal_parties_score_month" ("party");
CREATE INDEX IF NOT EXISTS "federal_parties_score_month_date_utc_idx" ON vitrine."federal_parties_score_month" ("date_utc");
CREATE INDEX IF NOT EXISTS "federal_parties_score_month_date_montreal_tz_idx" ON vitrine."federal_parties_score_month" ("date_montreal_tz");

-- provincial_parties_score_month  (Athena : vitrine_datamart-provincial_parties_score_month)
CREATE TABLE IF NOT EXISTS vitrine."provincial_parties_score_month" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision
);
CREATE INDEX IF NOT EXISTS "provincial_parties_score_month_party_idx" ON vitrine."provincial_parties_score_month" ("party");
CREATE INDEX IF NOT EXISTS "provincial_parties_score_month_date_utc_idx" ON vitrine."provincial_parties_score_month" ("date_utc");
CREATE INDEX IF NOT EXISTS "provincial_parties_score_month_date_montreal_tz_idx" ON vitrine."provincial_parties_score_month" ("date_montreal_tz");

-- provincial_parties_salient_shadow_day  (Athena : vitrine_datamart-provincial_parties_salient_shadow_day)
-- consommé par components/interactive/PartisCouvertureClient.tsx
CREATE TABLE IF NOT EXISTS vitrine."provincial_parties_salient_shadow_day" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision,
  "computed_at" text
);
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_day_party_idx" ON vitrine."provincial_parties_salient_shadow_day" ("party");
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_day_date_utc_idx" ON vitrine."provincial_parties_salient_shadow_day" ("date_utc");
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_day_date_montreal_tz_idx" ON vitrine."provincial_parties_salient_shadow_day" ("date_montreal_tz");

-- provincial_parties_salient_shadow_week  (Athena : vitrine_datamart-provincial_parties_salient_shadow_week)
-- consommé par components/interactive/PartisCouvertureClient.tsx
CREATE TABLE IF NOT EXISTS vitrine."provincial_parties_salient_shadow_week" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision,
  "computed_at" text
);
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_week_party_idx" ON vitrine."provincial_parties_salient_shadow_week" ("party");
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_week_date_utc_idx" ON vitrine."provincial_parties_salient_shadow_week" ("date_utc");
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_week_date_montreal_tz_idx" ON vitrine."provincial_parties_salient_shadow_week" ("date_montreal_tz");

-- provincial_parties_salient_shadow_month  (Athena : vitrine_datamart-provincial_parties_salient_shadow_month)
-- consommé par components/interactive/PartisCouvertureClient.tsx
CREATE TABLE IF NOT EXISTS vitrine."provincial_parties_salient_shadow_month" (
  "party" text,
  "date_utc" text,
  "date_montreal_tz" text,
  "weighted_mentions" double precision,
  "weighted_tone" double precision,
  "computed_at" text
);
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_month_party_idx" ON vitrine."provincial_parties_salient_shadow_month" ("party");
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_month_date_utc_idx" ON vitrine."provincial_parties_salient_shadow_month" ("date_utc");
CREATE INDEX IF NOT EXISTS "provincial_parties_salient_shadow_month_date_montreal_tz_idx" ON vitrine."provincial_parties_salient_shadow_month" ("date_montreal_tz");

-- issues_score_day  (Athena : vitrine_datamart-issues_score_day)
-- consommé par lib/data/headlineEvents.ts + components/sections/TreemapSection.tsx
CREATE TABLE IF NOT EXISTS vitrine."issues_score_day" (
  "date_montreal_tz" text,
  "date_utc" text,
  "economy_and_labour" double precision,
  "rights_liberties_minorities_discrimination" double precision,
  "health_and_social_services" double precision,
  "public_lands_and_agriculture" double precision,
  "immigration" double precision,
  "education" double precision,
  "environment_and_energy" double precision,
  "law_and_crime" double precision,
  "international_affairs_and_defense" double precision,
  "technology" double precision,
  "governments_and_governance" double precision,
  "culture_and_nationalism" double precision,
  "pass" text,
  "issues_meta" text,
  "tag" text
);
CREATE INDEX IF NOT EXISTS "issues_score_day_date_montreal_tz_idx" ON vitrine."issues_score_day" ("date_montreal_tz");
CREATE INDEX IF NOT EXISTS "issues_score_day_date_utc_idx" ON vitrine."issues_score_day" ("date_utc");

-- issues_score_week  (Athena : vitrine_datamart-issues_score_week)
-- consommé par lib/data/headlineEvents.ts + components/sections/TreemapSection.tsx
CREATE TABLE IF NOT EXISTS vitrine."issues_score_week" (
  "date_montreal_tz" text,
  "date_utc" text,
  "economy_and_labour" double precision,
  "rights_liberties_minorities_discrimination" double precision,
  "health_and_social_services" double precision,
  "public_lands_and_agriculture" double precision,
  "immigration" double precision,
  "education" double precision,
  "environment_and_energy" double precision,
  "law_and_crime" double precision,
  "international_affairs_and_defense" double precision,
  "technology" double precision,
  "governments_and_governance" double precision,
  "culture_and_nationalism" double precision,
  "issues_meta" text,
  "tag" text
);
CREATE INDEX IF NOT EXISTS "issues_score_week_date_montreal_tz_idx" ON vitrine."issues_score_week" ("date_montreal_tz");
CREATE INDEX IF NOT EXISTS "issues_score_week_date_utc_idx" ON vitrine."issues_score_week" ("date_utc");

-- issues_score_month  (Athena : vitrine_datamart-issues_score_month)
-- consommé par lib/data/headlineEvents.ts + components/sections/TreemapSection.tsx
CREATE TABLE IF NOT EXISTS vitrine."issues_score_month" (
  "date_montreal_tz" text,
  "date_utc" text,
  "economy_and_labour" double precision,
  "rights_liberties_minorities_discrimination" double precision,
  "health_and_social_services" double precision,
  "public_lands_and_agriculture" double precision,
  "immigration" double precision,
  "education" double precision,
  "environment_and_energy" double precision,
  "law_and_crime" double precision,
  "international_affairs_and_defense" double precision,
  "technology" double precision,
  "governments_and_governance" double precision,
  "culture_and_nationalism" double precision,
  "issues_meta" text,
  "tag" text
);
CREATE INDEX IF NOT EXISTS "issues_score_month_date_montreal_tz_idx" ON vitrine."issues_score_month" ("date_montreal_tz");
CREATE INDEX IF NOT EXISTS "issues_score_month_date_utc_idx" ON vitrine."issues_score_month" ("date_utc");

-- headline_events_4h  (Athena : vitrine_datamart-headline_events_4h)
-- consommé par lib/data/headlineEvents.ts + components/sections/UneDesUnesSection.tsx + components/sections/DeuxSolitudesSection.tsx + app/edition/[key]/page.tsx
CREATE TABLE IF NOT EXISTS vitrine."headline_events_4h" (
  "country_id" text,
  "date_utc" text,
  "time_interval_utc" text,
  "date_montreal_tz" text,
  "time_interval_montreal_tz" text,
  "event_id" text,
  "event_rank" integer,
  "event_label" text,
  "event_title_raw" text,
  "representative_url" text,
  "representative_media_id" text,
  "score_saillance" double precision,
  "score_qc" double precision,
  "score_roc" double precision,
  "score_us" double precision,
  "extracted_objects" text,
  "cluster_confidence" double precision,
  "article_count" integer,
  "outlet_count" integer,
  "outlets_qc" integer,
  "total_outlets_qc" integer,
  "media_ids" text,
  "media_ids_qc" text,
  "media_ids_roc" text,
  "coverage_qc_in_can" integer,
  "coverage_can_in_qc" integer,
  "intensity_tier" text,
  "title" text,
  "text" text,
  "main_issue" text,
  "main_issue_text_fr" text,
  "main_issue_text_en" text,
  "target_region" text,
  "event_rank_in_region" integer,
  "interval_convergence_score" integer,
  "top_objects_divergence" text,
  "articles" text,
  "tag" text,
  "storyline_id" text,
  "media_ids_24h" text,
  "articles_24h" text,
  "score_qc_peak_24h" double precision,
  "first_seen_utc" text,
  "n_blocks_24h" integer,
  "salience_index_qc" double precision,
  "salience_index_roc" double precision
);
CREATE INDEX IF NOT EXISTS "headline_events_4h_date_utc_idx" ON vitrine."headline_events_4h" ("date_utc");
CREATE INDEX IF NOT EXISTS "headline_events_4h_date_montreal_tz_idx" ON vitrine."headline_events_4h" ("date_montreal_tz");

-- polimetre_plus  (Athena : vitrine_datamart-polimetre_plus)
-- consommé par lib/data/polimetre.ts
CREATE TABLE IF NOT EXISTS vitrine."polimetre_plus" (
  "country_id" text,
  "week_end_date" text,
  "pledge_number" text,
  "pledge_text_fr" text,
  "verdict" text,
  "category" text,
  "salience_index" double precision,
  "previous_salience_index" double precision,
  "delta_index" double precision,
  "titles" text,
  "urls" text,
  "articles" text,
  "pledge_short_fr" text,
  "coverage_summary_week" text,
  "coverage_summary_month" text
);

-- Fraîcheur : une ligne par table, écrite en fin de synchro. C'est ce
-- que l'API expose comme date de dernière mise à jour, et ce qui permet
-- de détecter une synchro muette (le pire des cas : des données figées
-- qui ont l'air vivantes).
CREATE TABLE IF NOT EXISTS vitrine.sync_state (
  "table_name" text PRIMARY KEY,
  "synced_at"  timestamptz NOT NULL,
  "row_count"  bigint NOT NULL,
  "source"     text NOT NULL DEFAULT 'athena'
);
