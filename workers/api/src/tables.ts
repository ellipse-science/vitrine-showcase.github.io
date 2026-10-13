// GENERE depuis scripts/tables.json (copie du filet) le 2026-08-19.
// La whitelist vit DANS le Worker : aucun fetch GitHub a l'execution
// (directive emancipation). Toute modification de scripts/tables.json doit
// etre repercutee ici tant que le filet existe.
export interface TableSpec {
  name: string
  athena: string
  cols: string[]
  filter: string | null
  /** Datamart lu pour CETTE table, quand il diffère de DATAMART_ENV. Les
   *  tables agora_social_* et polimetre_promesses_neuves n'existent qu'en DEV
   *  (collecte et raffineurs DEV seulement) : fetch_data.R les y lit déjà
   *  (`"env": "DEV"` dans scripts/tables.json). Absent = DATAMART_ENV. */
  env?: 'DEV' | 'PROD'
  /** INSTANTANÉ SEULEMENT (#944) : la table va dans l'instantané R2, jamais
   *  dans Postgres ni dans l'API payante (`"api": false` reste vrai). Sert à
   *  sortir du dépôt GitHub les jeux que le build lit encore en fichiers. Son
   *  échec ne retient PAS les Deploy Hooks : absente du manifeste, la table
   *  est lue dans son fichier publié, soit exactement le comportement
   *  d'avant. Le pendant côté build est `"instantane": true` dans
   *  scripts/tables.json. */
  instantaneSeul?: boolean
}

export const TABLES: TableSpec[] = [
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
      "deputy_id",
      "district_id",
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
    "name": "provincial_parties_salient_shadow_day",
    "athena": "vitrine_datamart-provincial_parties_salient_shadow_day",
    "cols": [
      "party",
      "date_utc",
      "date_montreal_tz",
      "weighted_mentions",
      "total_raw_score",
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
      "total_raw_score",
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
      "total_raw_score",
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
      "total_raw_score",
      "weighted_tone",
      "representative_url",
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
      "total_raw_score",
      "weighted_tone",
      "representative_url",
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
      "total_raw_score",
      "weighted_tone",
      "representative_url",
      "computed_at"
    ],
    "filter": null
  },
  {
    "name": "parties_issues_salient_shadow_day",
    "athena": "vitrine_datamart-parties_issues_salient_shadow_day",
    "cols": [
      "party",
      "theme",
      "issue_share",
      "total_raw_score",
      "weighted_tone",
      "date_utc",
      "date_montreal_tz",
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
      "total_raw_score",
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
  },
  {
    "name": "agora_social_comptes",
    "athena": "agora_datamart-social_comptes",
    "cols": [
      "compte",
      "plateforme",
      "pseudo",
      "candidat",
      "parti",
      "circonscription",
      "type",
      "abonnes",
      "releve",
      "calcule_le",
      "candidatures_parti",
      "publications_7j",
      "jaime_7j",
      "publications_campagne",
      "jaime_campagne",
      "derniere_publication"
    ],
    "filter": null,
    "env": "DEV",
    "instantaneSeul": true
  },
  {
    "name": "agora_social_publications_jour",
    "athena": "agora_datamart-social_publications_jour",
    "cols": [
      "jour",
      "parti",
      "plateforme",
      "type",
      "publications",
      "jaime",
      "commentaires",
      "jaime_median"
    ],
    "filter": null,
    "env": "DEV",
    "instantaneSeul": true
  },
  {
    "name": "agora_social_palmares",
    "athena": "agora_datamart-social_palmares",
    "cols": [
      "jour",
      "plateforme",
      "parti",
      "type",
      "candidat",
      "pseudo",
      "post_id",
      "url",
      "texte",
      "jaime",
      "commentaires",
      "media_type",
      "nature",
      "texte_origine",
      "vignette"
    ],
    "filter": null,
    "env": "DEV",
    "instantaneSeul": true
  },
  {
    "name": "agora_social_fil",
    "athena": "agora_datamart-social_fil",
    "cols": [
      "circonscription",
      "jour",
      "compte",
      "candidat",
      "parti",
      "plateforme",
      "pseudo",
      "post_id",
      "url",
      "texte",
      "jaime",
      "commentaires",
      "media_type",
      "nature",
      "texte_origine",
      "vignette"
    ],
    "filter": null,
    "env": "DEV",
    "instantaneSeul": true
  },
  {
    "name": "agora_social_comptes_jour",
    "athena": "agora_datamart-social_comptes_jour",
    "cols": [
      "compte",
      "jour",
      "publications",
      "jaime",
      "commentaires"
    ],
    "filter": null,
    "env": "DEV",
    "instantaneSeul": true
  },
  {
    "name": "agora_social_candidats",
    "athena": "agora_datamart-social_candidats",
    "cols": [
      "circonscription",
      "parti",
      "candidat"
    ],
    "filter": null,
    "env": "DEV",
    "instantaneSeul": true
  }
]
