// GENERE depuis scripts/tables.json (copie du filet) le 2026-08-19.
// La whitelist vit DANS le Worker : aucun fetch GitHub a l'execution
// (directive emancipation). Toute modification de scripts/tables.json doit
// etre repercutee ici tant que le filet existe.
export interface TableSpec {
  name: string
  athena: string
  cols: string[]
  filter: string | null
}

export const TABLES: TableSpec[] = [
  {
    "name": "provincial_parties_score_day",
    "athena": "vitrine_datamart-provincial_parties_score_day",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone",
      "pass"
    ],
    "filter": null
  },
  {
    "name": "agora_decideurs_qc",
    "athena": "agora_datamart-agora_decideurs_qc",
    "cols": [
      "period_type",
      "period_start_date",
      "period_end_date",
      "party",
      "n_interventions",
      "word_count",
      "lexical_richness",
      "tone_score",
      "economy_and_labour",
      "rights_liberties_minorities_discrimination",
      "health_and_social_services",
      "public_lands_and_agriculture",
      "immigration",
      "education",
      "environment_and_energy",
      "law_and_crime",
      "international_affairs_and_defense",
      "technology",
      "governments_and_governance",
      "culture_and_nationalism",
      "editorial_angle",
      "signature_word",
      "signature_word_context"
    ],
    "filter": null
  },
  {
    "name": "agora_decideurs_qc_deputes",
    "athena": "agora_datamart-agora_decideurs_qc_deputes",
    "cols": [
      "period_type",
      "period_start_date",
      "period_end_date",
      "party",
      "deputy",
      "n_interventions",
      "word_count",
      "lexical_richness",
      "tone_score",
      "economy_and_labour",
      "rights_liberties_minorities_discrimination",
      "health_and_social_services",
      "public_lands_and_agriculture",
      "immigration",
      "education",
      "environment_and_energy",
      "law_and_crime",
      "international_affairs_and_defense",
      "technology",
      "governments_and_governance",
      "culture_and_nationalism",
      "signature_word",
      "signature_word_context"
    ],
    "filter": null
  },
  {
    "name": "agora_decideurs_qc_affiliations",
    "athena": "agora_datamart-agora_decideurs_qc_affiliations",
    "cols": [
      "deputy_id",
      "deputy",
      "district_id",
      "party",
      "affiliation_start_date",
      "affiliation_end_date",
      "start_reason",
      "end_reason"
    ],
    "filter": null
  },
  {
    "name": "federal_parties_score_week",
    "athena": "vitrine_datamart-federal_parties_score_week",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_score_week",
    "athena": "vitrine_datamart-provincial_parties_score_week",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone"
    ],
    "filter": null
  },
  {
    "name": "federal_parties_score_month",
    "athena": "vitrine_datamart-federal_parties_score_month",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_score_month",
    "athena": "vitrine_datamart-provincial_parties_score_month",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_salient_shadow_day",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_day",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_salient_shadow_week",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_week",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_salient_shadow_month",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_month",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_salient_shadow_by_media_day",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_by_media_day",
    "cols": [
      "party",
      "media_id",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_salient_shadow_by_media_week",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_by_media_week",
    "cols": [
      "party",
      "media_id",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_salient_shadow_by_media_month",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_by_media_month",
    "cols": [
      "party",
      "media_id",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "weighted_tone",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "provincial_parties_salient_shadow_intraday",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_intraday",
    "cols": [
      "party",
      "block_hour",
      "block_label",
      "weighted_mentions",
      "weighted_tone",
      "date_utc",
      "date_montreal_tz",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "issues_score_day",
    "athena": "vitrine_datamart-issues_score_day",
    "cols": [
      "date_montreal_tz",
      "date_utc",
      "economy_and_labour",
      "rights_liberties_minorities_discrimination",
      "health_and_social_services",
      "public_lands_and_agriculture",
      "immigration",
      "education",
      "environment_and_energy",
      "law_and_crime",
      "international_affairs_and_defense",
      "technology",
      "governments_and_governance",
      "culture_and_nationalism",
      "pass",
      "issues_meta",
      "tag"
    ],
    "filter": null
  },
  {
    "name": "issues_score_week",
    "athena": "vitrine_datamart-issues_score_week",
    "cols": [
      "date_montreal_tz",
      "date_utc",
      "economy_and_labour",
      "rights_liberties_minorities_discrimination",
      "health_and_social_services",
      "public_lands_and_agriculture",
      "immigration",
      "education",
      "environment_and_energy",
      "law_and_crime",
      "international_affairs_and_defense",
      "technology",
      "governments_and_governance",
      "culture_and_nationalism",
      "issues_meta",
      "tag"
    ],
    "filter": null
  },
  {
    "name": "issues_score_month",
    "athena": "vitrine_datamart-issues_score_month",
    "cols": [
      "date_montreal_tz",
      "date_utc",
      "economy_and_labour",
      "rights_liberties_minorities_discrimination",
      "health_and_social_services",
      "public_lands_and_agriculture",
      "immigration",
      "education",
      "environment_and_energy",
      "law_and_crime",
      "international_affairs_and_defense",
      "technology",
      "governments_and_governance",
      "culture_and_nationalism",
      "issues_meta",
      "tag"
    ],
    "filter": null
  },
  {
    "name": "headline_events_4h",
    "athena": "vitrine_datamart-headline_events_4h",
    "cols": [
      "country_id",
      "date_utc",
      "time_interval_utc",
      "date_montreal_tz",
      "time_interval_montreal_tz",
      "event_id",
      "event_rank",
      "event_label",
      "event_title_raw",
      "representative_url",
      "representative_media_id",
      "score_saillance",
      "score_qc",
      "score_roc",
      "score_us",
      "extracted_objects",
      "cluster_confidence",
      "article_count",
      "outlet_count",
      "outlets_qc",
      "total_outlets_qc",
      "media_ids",
      "media_ids_qc",
      "media_ids_roc",
      "coverage_qc_in_can",
      "coverage_can_in_qc",
      "intensity_tier",
      "title",
      "text",
      "main_issue",
      "main_issue_text_fr",
      "main_issue_text_en",
      "target_region",
      "event_rank_in_region",
      "interval_convergence_score",
      "top_objects_divergence",
      "articles",
      "tag",
      "storyline_id",
      "media_ids_24h",
      "articles_24h",
      "score_qc_peak_24h",
      "first_seen_utc",
      "n_blocks_24h",
      "salience_index_qc",
      "salience_index_roc"
    ],
    "filter": "headline_events_window"
  },
  {
    "name": "polimetre_plus",
    "athena": "vitrine_datamart-polimetre_plus",
    "cols": [
      "country_id",
      "week_end_date",
      "pledge_number",
      "pledge_text_fr",
      "verdict",
      "category",
      "salience_index",
      "previous_salience_index",
      "delta_index",
      "titles",
      "urls",
      "articles",
      "pledge_short_fr",
      "coverage_summary_week",
      "coverage_summary_month"
    ],
    "filter": "polimetre_plus_recent"
  }
]
