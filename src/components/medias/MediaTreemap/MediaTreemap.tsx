import React, {
  memo,
  ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
  MediaTreemapHeadline,
  MediaTreemapIssue,
  MediaTreemapPayload,
  MediaTreemapPeriod,
  MediaTreemapPeriodData,
} from './mediaTreemapData';
import { HeadlineEvent } from '../UneDesUnes/headlineOfHeadlinesData';
import { ISSUE_META } from '../../../helpers/issues';

import './MediaTreemap.scss';

type TreemapRect = {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const periodOrder: MediaTreemapPeriod[] = ['day', 'week', 'month'];

const squarify = (items: MediaTreemapIssue[], x: number, y: number, w: number, h: number): TreemapRect[] => {
  if (!items.length) return [];
  if (items.length === 1) return [{ key: items[0].key, x, y, w, h }];

  const total = items.reduce((sum, item) => sum + item.score, 0) || 1;
  const sorted = [...items].sort((a, b) => b.score - a.score);

  let bestSplit = 1;
  let bestDiff = Number.POSITIVE_INFINITY;
  let runningSum = 0;

  sorted.slice(0, -1).forEach((item, index) => {
    runningSum += item.score;
    const diff = Math.abs(runningSum / total - 0.5);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = index + 1;
    }
  });

  const group1 = sorted.slice(0, bestSplit);
  const group2 = sorted.slice(bestSplit);
  const ratio1 = group1.reduce((sum, item) => sum + item.score, 0) / total;

  if (w >= h) {
    const width1 = w * ratio1;
    return [
      ...squarify(group1, x, y, width1, h),
      ...squarify(group2, x + width1, y, w - width1, h),
    ];
  }

  const height1 = h * ratio1;
  return [
    ...squarify(group1, x, y, w, height1),
    ...squarify(group2, x, y + height1, w, h - height1),
  ];
};

const MediaTreemap = (): ReactElement | null => {
  const { t } = useTranslation('MediaTreemap');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<MediaTreemapPayload>();
  const [activePeriod] = useState<MediaTreemapPeriod>('day');
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    fetch(`/data/headline-events.json?ts=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error('network');
        return res.json();
      })
      .then((data: HeadlineEvent[]) => {
        const withTitles = data.filter(e => e.title !== null);
        if (withTitles.length === 0) {
          setStatus('error');
          return;
        }

        // Find latest block
        const sortedByDate = [...withTitles].sort((a, b) => {
          const dateA = a.date_utc + 'T' + a.time_interval_utc.split('-')[0] + ':00Z';
          const dateB = b.date_utc + 'T' + b.time_interval_utc.split('-')[0] + ':00Z';
          return dateB.localeCompare(dateA);
        });

        const latestDate = sortedByDate[0].date_utc;
        const latestInterval = sortedByDate[0].time_interval_utc;

        const currentEvents = sortedByDate.filter(
          e => e.date_utc === latestDate && e.time_interval_utc === latestInterval
        );

        // Group by issue
        const issuesMap = new Map<string, HeadlineEvent[]>();
        currentEvents.forEach(e => {
          if (!e.main_issue) return;
          if (!issuesMap.has(e.main_issue)) issuesMap.set(e.main_issue, []);
          issuesMap.get(e.main_issue)!.push(e);
        });

        const issues: MediaTreemapIssue[] = ISSUE_META.map(meta => {
          const events = issuesMap.get(meta.key) || [];
          const topEvent = events.sort((a, b) => (b.score_saillance || 0) - (a.score_saillance || 0))[0];
          const totalScore = events.reduce((sum, e) => sum + (e.score_saillance || 0), 0);
          
          const headlines: MediaTreemapHeadline[] = topEvent ? [{
            title: topEvent.title || topEvent.event_title_raw || '',
            source: JSON.parse(topEvent.media_ids || '[]')[0] || '',
            time: topEvent.time_interval_utc,
            url: '#'
          }] : [];

          return {
            key: meta.key,
            tag: meta.label,
            label: meta.title,
            color: meta.color,
            score: totalScore || 1, // small score if no events to keep 12 tiles
            prevScore: totalScore,
            velocity: 0,
            headlines
          };
        });

        const mockPayload: MediaTreemapPayload = {
          generatedAt: new Date().toISOString(),
          source: { env: 'dev', table: 'headline_events', language: 'fr', country: 'QC' },
          periods: {
            day: {
              period: 'day',
              label: 'Aujourd\'hui',
              snapshotLabel: `${latestDate} ${latestInterval}`,
              nextLabel: '',
              issues,
              history: []
            },
            week: { period: 'week', label: 'Semaine', snapshotLabel: '', nextLabel: '', issues: [], history: [] },
            month: { period: 'month', label: 'Mois', snapshotLabel: '', nextLabel: '', issues: [], history: [] }
          }
        };

        setPayload(mockPayload);
        setStatus('ready');
      })
      .catch(() => {
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [status]);

  const periodData = payload?.periods?.[activePeriod] as MediaTreemapPeriodData | undefined;

  let canvasHeight = 680; // Match mockup height
  const layout = useMemo(
    () => squarify(periodData?.issues || [], 0, 0, Math.max(width - 24, 280), canvasHeight),
    [periodData, width, canvasHeight],
  );

  if (status === 'loading') return <div className="MediaTreemap-status">{t('loading')}</div>;
  if (status === 'error') return <div className="MediaTreemap-status is-error">{t('error')}</div>;

  return (
    <section className="MediaTreemap">
      <header className="MediaTreemap-header">
        <h3 className="MediaTreemap-title">{t('title') || 'De quoi parle-t-on ?'}</h3>
        <div className="legend-toggle">
          {periodOrder.map((p) => (
            <span key={p} className={activePeriod === p ? 'active' : ''}>
              {t(`controls.${p}`)}
            </span>
          ))}
        </div>
      </header>

      <div className="MediaTreemap-surface" ref={surfaceRef}>
        <div className="MediaTreemap-canvas" style={{ height: `${canvasHeight}px` }}>
          {layout.map((rect) => {
            const item = periodData?.issues.find(({ key }) => key === rect.key);
            if (!item) return null;

            return (
              <div
                key={item.key}
                className="MediaTreemap-cell"
                style={{
                  left: `${rect.x}px`,
                  top: `${rect.y}px`,
                  width: `${rect.w - 2}px`,
                  height: `${rect.h - 2}px`,
                  backgroundColor: item.color,
                }}
              >
                <div className="tm-enjeu">{item.tag}</div>
                <div className="tm-context">
                  {item.headlines[0]?.title || '...'}
                </div>
                <div className="tm-name">
                  {item.headlines[0]?.source}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default memo(MediaTreemap);
