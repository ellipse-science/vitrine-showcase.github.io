import React, { memo, ReactElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HeadlineEvent } from './headlineOfHeadlinesData';
import { getIssueMeta } from '../../../helpers/issues';
import { getMediaName } from '../../../helpers/media';
import './UneDesUnes.scss';

const UneDesUnes = (): ReactElement => {
  const { t } = useTranslation('UneDesUnes');
  const [events, setEvents] = useState<HeadlineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/data/headline-events.json?ts=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error('network');
        return res.json();
      })
      .then((data: HeadlineEvent[]) => {
        const withTitles = data.filter(e => e.title !== null);
        if (withTitles.length > 0) {
          // Find most recent block
          const sortedByDate = [...withTitles].sort((a, b) => {
            const dateA = `${a.date_utc}T${a.time_interval_utc.split('-')[0]}:00Z`;
            const dateB = `${b.date_utc}T${b.time_interval_utc.split('-')[0]}:00Z`;
            return dateB.localeCompare(dateA);
          });

          const latestDate = sortedByDate[0].date_utc;
          const latestInterval = sortedByDate[0].time_interval_utc;

          const latestEvents = sortedByDate
            .filter(e => e.date_utc === latestDate && e.time_interval_utc === latestInterval)
            .sort((a, b) => (b.score_saillance || 0) - (a.score_saillance || 0));

          setEvents(latestEvents);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const top3 = useMemo(() => events.slice(0, 3), [events]);

  if (loading) {
    return (
      <div className="UneDesUnes UneDesUnes--state">
        <p className="UneDesUnes-status">{t('loading')}</p>
      </div>
    );
  }

  if (error || top3.length === 0) {
    return (
      <div className="UneDesUnes UneDesUnes--state">
        <p className="UneDesUnes-status">{t('error')}</p>
      </div>
    );
  }

  const renderDots = (score: number) => {
    const total = 6;
    const filled = Math.round((score / 100) * total);
    return (
      <span className="saillance-dots">
        {/* eslint-disable-next-line react/no-array-index-key */}
        {Array.from({ length: total }).map((_, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} className={`d ${i < filled ? 'filled' : 'empty'}`} />
        ))}
      </span>
    );
  };

  const getIntensityLabel = (score: number) => {
    if (score >= 80) return 'Saturé';
    if (score >= 60) return 'Majeur';
    if (score >= 40) return 'Fort';
    if (score >= 20) return 'Notable';
    return 'Marginal';
  };

  const main = top3[0];
  const sideLeft = top3[1];
  const sideRight = top3[2];

  const mainIssue = getIssueMeta(main.main_issue);
  const sideLeftIssue = getIssueMeta(sideLeft?.main_issue);
  const sideRightIssue = getIssueMeta(sideRight?.main_issue);

  const parseMedia = (jsonStr: string) => {
    try {
      return JSON.parse(jsonStr) as string[];
    } catch {
      return [];
    }
  };

  const allMedias = ['LED', 'LAP', 'RCI', 'TVA', 'JDM', 'MG'];

  return (
    <div className="UneDesUnes">
      <div className="section-label">
        <span>{t('sectionLabel') || 'Les unes du jour'}</span>
        <span className="section-date">{main.date_montreal_tz || main.date_utc}</span>
      </div>

      <section className="hero-trio">
        {/* Main story */}
        <div className="une-main">
          <span className="une-enjeu" style={{ '--c': mainIssue?.color } as any}>
            {main.main_issue_text_fr || mainIssue?.title}
          </span>
          <span className="saillance-tag major">
            {getIntensityLabel(main.score_saillance || 0)} · {Math.round(((main.score_saillance || 0) / 100) * 6)} / 6
          </span>
          <h1 data-saillance={Math.round(((main.score_saillance || 0) / 100) * 6)}>
            {main.title}
          </h1>
          
          <div className="saillance-row">
            <span className="region-label">{t('regionLabel') || 'Québec'}</span>
            {renderDots(main.score_saillance || 0)}
            <span className="time">{main.time_interval_montreal_tz || main.time_interval_utc} {t('timeLabel') || 'en manchette'}</span>
          </div>

          <div className="byline">
            {parseMedia(main.media_ids).map((mid, i, arr) => (
              <React.Fragment key={mid}>
                <span className="source">{getMediaName(mid)}</span>
                {i < arr.length - 1 && <span className="sep">·</span>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Side story left */}
        {sideLeft && (
          <div className="une-side une-side-left">
            <span className="une-enjeu" style={{ '--c': sideLeftIssue?.color } as any}>
              {sideLeft.main_issue_text_fr || sideLeftIssue?.title}
            </span>
            <span className="saillance-tag">
              {getIntensityLabel(sideLeft.score_saillance || 0)} · {Math.round(((sideLeft.score_saillance || 0) / 100) * 6)} / 6
            </span>
            <h2 data-saillance={Math.round(((sideLeft.score_saillance || 0) / 100) * 6)}>
              {sideLeft.title}
            </h2>
            
            <div className="saillance-row">
              <span className="region-label">{t('regionLabel') || 'Québec'}</span>
              {renderDots(sideLeft.score_saillance || 0)}
              <span className="time">{sideLeft.time_interval_montreal_tz || sideLeft.time_interval_utc} {t('timeLabel') || 'en manchette'}</span>
            </div>

            <div className="byline">
              {parseMedia(sideLeft.media_ids).map((mid, i, arr) => (
                <React.Fragment key={mid}>
                  <span className="source">{getMediaName(mid)}</span>
                  {i < arr.length - 1 && <span className="sep">·</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Side story right */}
        {sideRight && (
          <div className="une-side une-side-right">
            <span className="une-enjeu" style={{ '--c': sideRightIssue?.color } as any}>
              {sideRight.main_issue_text_fr || sideRightIssue?.title}
            </span>
            <span className="saillance-tag">
              {getIntensityLabel(sideRight.score_saillance || 0)} · {Math.round(((sideRight.score_saillance || 0) / 100) * 6)} / 6
            </span>
            <h2 data-saillance={Math.round(((sideRight.score_saillance || 0) / 100) * 6)}>
              {sideRight.title}
            </h2>
            
            <div className="saillance-row">
              <span className="region-label">{t('regionLabel') || 'Québec'}</span>
              {renderDots(sideRight.score_saillance || 0)}
              <span className="time">{sideRight.time_interval_montreal_tz || sideRight.time_interval_utc} {t('timeLabel') || 'en manchette'}</span>
            </div>

            <div className="byline">
              {(() => {
                const mids = parseMedia(sideRight.media_ids);
                const absent = allMedias.filter(m => !mids.includes(m));
                return (
                  <>
                    <div className="byline-present">
                      {mids.map((mid, i, arr) => (
                        <React.Fragment key={mid}>
                          <span className="source">{getMediaName(mid)}</span>
                          {i < arr.length - 1 && <span className="sep">·</span>}
                        </React.Fragment>
                      ))}
                    </div>
                    {absent.length > 0 && (
                      <div className="byline-absent">
                        {t('absentFrom') || 'Absent de'} {absent.map(m => getMediaName(m)).join(' · ')}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default memo(UneDesUnes);
