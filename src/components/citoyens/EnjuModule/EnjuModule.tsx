import React, { memo, ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HeadlineEvent } from '../../medias/UneDesUnes/headlineOfHeadlinesData';
import { ISSUE_META } from '../../../helpers/issues';
import './EnjuModule.scss';

type IssueBar = {
  key: string;
  label: string;
  color: string;
  score: number;
  topTitle: string | null;
};

const EnjuModule = (): ReactElement => {
  const { t } = useTranslation('EnjuModule');
  const [issues, setIssues] = useState<IssueBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');

  useEffect(() => {
    fetch(`/data/headline-events.json?ts=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error('network');
        return res.json();
      })
      .then((data: HeadlineEvent[]) => {
        const withIssues = data.filter(e => e.main_issue !== null);
        if (withIssues.length === 0) {
          setError(true);
          setLoading(false);
          return;
        }

        // Deduplicate by event_id, preferring QC target_region
        const byId = new Map<string, HeadlineEvent>();
        withIssues.forEach(e => {
          const existing = byId.get(e.event_id);
          if (!existing || e.target_region === 'QC') {
            byId.set(e.event_id, e);
          }
        });
        const unique = Array.from(byId.values()).filter(e => e.country_id !== 'USA');

        // Find latest block
        const sorted = [...unique].sort((a, b) => {
          const dA = `${a.date_utc}T${a.time_interval_utc.split('-')[0]}:00Z`;
          const dB = `${b.date_utc}T${b.time_interval_utc.split('-')[0]}:00Z`;
          return dB.localeCompare(dA);
        });
        const latestDate = sorted[0].date_utc;
        const latestInterval = sorted[0].time_interval_utc;
        const latest = sorted.filter(
          e => e.date_utc === latestDate && e.time_interval_utc === latestInterval
        );

        setSnapshotLabel(`${latestDate} · ${latestInterval}h`);

        // Aggregate score per issue
        const issueMap = new Map<string, { score: number; topTitle: string | null }>();
        latest.forEach(e => {
          if (!e.main_issue) return;
          const cur = issueMap.get(e.main_issue) || { score: 0, topTitle: null };
          const s = (e.score_qc || 0) > 0 ? (e.score_qc || 0) : (e.score_saillance || 0);
          issueMap.set(e.main_issue, { score: cur.score + s, topTitle: cur.topTitle || e.title });
        });

        const ranked: IssueBar[] = [];
        ISSUE_META.forEach(meta => {
          const val = issueMap.get(meta.key);
          if (!val) return;
          ranked.push({ key: meta.key, label: meta.title, color: meta.color, score: val.score, topTitle: val.topTitle });
        });
        ranked.sort((a, b) => b.score - a.score);

        const maxScore = ranked[0]?.score || 1;
        setIssues(ranked.map(i => ({ ...i, score: Math.round((i.score / maxScore) * 100) })));
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="EnjuModule EnjuModule--state">
        <p className="EnjuModule-status">{t('loading')}</p>
      </div>
    );
  }

  if (error || issues.length === 0) {
    return (
      <div className="EnjuModule EnjuModule--state">
        <p className="EnjuModule-status">{t('error')}</p>
      </div>
    );
  }

  return (
    <div className="EnjuModule">
      <div className="EnjuModule-header">
        <span className="EnjuModule-eyebrow">{t('eyebrow')}</span>
        <span className="EnjuModule-snapshot">{snapshotLabel}</span>
      </div>

      <div className="EnjuModule-bars">
        {issues.map(issue => (
          <div key={issue.key} className="EnjuModule-bar-row">
            <div className="EnjuModule-bar-meta">
              <span className="EnjuModule-bar-label" style={{ color: issue.color }}>
                {issue.label}
              </span>
              {issue.topTitle && (
                <span className="EnjuModule-bar-title">{issue.topTitle}</span>
              )}
            </div>
            <div className="EnjuModule-bar-track">
              <div
                className="EnjuModule-bar-fill"
                style={{ width: `${issue.score}%`, backgroundColor: issue.color }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="EnjuModule-footer">
        <span>{t('source')}</span>
      </div>
    </div>
  );
};

export default memo(EnjuModule);
