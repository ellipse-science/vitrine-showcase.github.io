// GÉNÉRÉ par scripts/generate_column_types.mjs depuis sql/schema.sql.
// NE PAS ÉDITER À LA MAIN. Régénérer : node scripts/generate_column_types.mjs
//
// Types des colonnes que le pilote Postgres rend AUTREMENT qu'en chaîne. Sert
// à l'instantané R2 (src/snapshot.ts), écrit depuis les lignes Athena — qui
// sont toutes des chaînes — pour qu'il soit interchangeable avec la réponse
// de /v1/datasets. Les colonnes absentes restent des chaînes : c'est le cas
// de `text`, mais AUSSI de `bigint` (rendu en chaîne par le pilote) et de
// `timestamptz`.
//
// UNE TABLE ABSENTE DE CETTE LISTE A DES TYPES INCONNUS, et n'est donc PAS
// mise en instantané (cf. hasColumnTypes) : le build continue de la lire dans
// son fichier publié. Une table sans colonne à convertir apparaît, elle, avec
// un objet vide — la distinction est délibérée.

export type ColumnKind = 'number' | 'boolean'

export const COLUMN_TYPES: Record<string, Record<string, ColumnKind>> = {
  provincial_parties_score_day: {
    weighted_mentions: "number",
    weighted_tone: "number"
  },
  agora_decideurs_qc: {
    n_interventions: "number",
    word_count: "number",
    lexical_richness: "number",
    tone_score: "number",
    economy_and_labour: "number",
    rights_liberties_minorities_discrimination: "number",
    health_and_social_services: "number",
    public_lands_and_agriculture: "number",
    immigration: "number",
    education: "number",
    environment_and_energy: "number",
    law_and_crime: "number",
    international_affairs_and_defense: "number",
    technology: "number",
    governments_and_governance: "number",
    culture_and_nationalism: "number"
  },
  agora_decideurs_qc_deputes: {
    n_interventions: "number",
    word_count: "number",
    lexical_richness: "number",
    tone_score: "number",
    economy_and_labour: "number",
    rights_liberties_minorities_discrimination: "number",
    health_and_social_services: "number",
    public_lands_and_agriculture: "number",
    immigration: "number",
    education: "number",
    environment_and_energy: "number",
    law_and_crime: "number",
    international_affairs_and_defense: "number",
    technology: "number",
    governments_and_governance: "number",
    culture_and_nationalism: "number"
  },
  agora_decideurs_qc_affiliations: {},
  federal_parties_score_week: {
    weighted_mentions: "number",
    weighted_tone: "number"
  },
  provincial_parties_score_week: {
    weighted_mentions: "number",
    weighted_tone: "number"
  },
  federal_parties_score_month: {
    weighted_mentions: "number",
    weighted_tone: "number"
  },
  provincial_parties_score_month: {
    weighted_mentions: "number",
    weighted_tone: "number"
  },
  provincial_parties_salient_shadow_day: {
    weighted_mentions: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  provincial_parties_salient_shadow_week: {
    weighted_mentions: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  provincial_parties_salient_shadow_month: {
    weighted_mentions: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  provincial_parties_salient_shadow_by_media_day: {
    weighted_mentions: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  provincial_parties_salient_shadow_by_media_week: {
    weighted_mentions: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  provincial_parties_salient_shadow_by_media_month: {
    weighted_mentions: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  issues_score_day: {
    economy_and_labour: "number",
    rights_liberties_minorities_discrimination: "number",
    health_and_social_services: "number",
    public_lands_and_agriculture: "number",
    immigration: "number",
    education: "number",
    environment_and_energy: "number",
    law_and_crime: "number",
    international_affairs_and_defense: "number",
    technology: "number",
    governments_and_governance: "number",
    culture_and_nationalism: "number"
  },
  issues_score_week: {
    economy_and_labour: "number",
    rights_liberties_minorities_discrimination: "number",
    health_and_social_services: "number",
    public_lands_and_agriculture: "number",
    immigration: "number",
    education: "number",
    environment_and_energy: "number",
    law_and_crime: "number",
    international_affairs_and_defense: "number",
    technology: "number",
    governments_and_governance: "number",
    culture_and_nationalism: "number"
  },
  issues_score_month: {
    economy_and_labour: "number",
    rights_liberties_minorities_discrimination: "number",
    health_and_social_services: "number",
    public_lands_and_agriculture: "number",
    immigration: "number",
    education: "number",
    environment_and_energy: "number",
    law_and_crime: "number",
    international_affairs_and_defense: "number",
    technology: "number",
    governments_and_governance: "number",
    culture_and_nationalism: "number"
  },
  headline_events_4h: {
    event_rank: "number",
    score_saillance: "number",
    score_qc: "number",
    score_roc: "number",
    score_us: "number",
    cluster_confidence: "number",
    article_count: "number",
    outlet_count: "number",
    outlets_qc: "number",
    total_outlets_qc: "number",
    coverage_qc_in_can: "number",
    coverage_can_in_qc: "number",
    event_rank_in_region: "number",
    interval_convergence_score: "number",
    score_qc_peak_24h: "number",
    n_blocks_24h: "number",
    salience_index_qc: "number",
    salience_index_roc: "number"
  },
  polimetre_plus: {
    salience_index: "number",
    previous_salience_index: "number",
    delta_index: "number"
  },
  provincial_parties_salient_shadow_intraday: {
    block_hour: "number",
    weighted_mentions: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  parties_issues_salient_shadow_day: {
    issue_share: "number",
    total_raw_score: "number",
    weighted_tone: "number"
  },
  radar_annotated: {}
}
