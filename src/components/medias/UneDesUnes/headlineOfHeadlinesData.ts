export type HeadlineEvent = {
  country_id: string | null;
  date_utc: string;
  date_montreal_tz: string | null;
  time_interval_utc: string;
  time_interval_montreal_tz: string | null;
  event_id: string;
  event_rank: number;
  event_label: string;
  event_title_raw: string | null;
  score_saillance: number | null;
  score_qc: number | null;
  extracted_objects: string | null; // JSON string
  cluster_confidence: number;
  article_count: number;
  outlet_count: number;
  media_ids: string; // JSON string like '["LED"]'
  intensity_tier: string | null;
  title: string | null;
  main_issue: string | null;
  main_issue_text_fr: string | null;
  main_issue_text_en: string | null;
  tag: string;
}

export type SalientObject = {
  label: string;
  score: number; // 0–1, relative weight — drives bar width
}

export type HotHeadline = {
  source: string;
  title: string;
  url: string;
  time: string;
}

export type HeadlineOfHeadlines = {
  countryId: 'QC' | 'CA';
  dateUtc: string;
  timeIntervalUtc: string;
  mainIssue: string;
  mainIssueLabelFr: string;
  mainIssueLabelEn: string;
  title: string;           // computed by aws-refiners from salient objects
  score: number;           // absolute_normalized_index (0–1)
  prevScore: number;
  velocity: number;        // % change vs previous snapshot
  objects: SalientObject[];
  monitoredSources: string[]; // all sources tracked (covering + not covering)
  headlines: HotHeadline[];   // subset: sources that cover this issue
  snapshotLabel: string;
  nextLabel: string;
}

export type HeadlineOfHeadlinesPayload = {
  generatedAt: string;
  countries: {
    QC: HeadlineOfHeadlines;
    CA: HeadlineOfHeadlines;
  };
}
