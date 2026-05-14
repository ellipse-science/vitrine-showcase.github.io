import React, { memo, ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { ParoleAssembly, ParoleEnChambrePayload, PeriodSnapshot, PeriodType } from './paroleEnChambreData';
import './ParoleEnChambre.scss';

const partyLogoMap: Record<string, string> = {
  CAQ: 'caq', PLQ: 'plq', PQ: 'pq', QS: 'qs', PCQ: 'pcq',
  LPC: 'lpc', CPC: 'cpc', NDP: 'ndp', BQ: 'bq', GP: 'gpc', GPC: 'gpc',
};

const periodLabels: Record<PeriodType, string> = {
  last_pdq:    'Dernière période de questions',
  session:     'Cette session',
  legislature: 'Cette législature',
};

const getSaillanceLevel = (score: number): string => {
  if (score >= 0.75) return 'sature';
  if (score >= 0.50) return 'fort';
  if (score >= 0.25) return 'notable';
  return 'marginal';
};

const ParoleEnChambre = (): ReactElement => {
  const { t } = useTranslation('ParoleEnChambre');
  const navigate = useNavigate();
  const eyebrowWords = t('eyebrow').split(' ');
  const eyebrowLead = eyebrowWords[0];
  const eyebrowAccent = eyebrowWords[1];
  const eyebrowTail = eyebrowWords.slice(2).join(' ');

  const [payload, setPayload] = useState<ParoleEnChambrePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('last_pdq');

  useEffect(() => {
    fetch(`/data/parole-en-chambre.json?ts=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error('network');
        return res.json();
      })
      .then((data: ParoleEnChambrePayload) => {
        setPayload(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const handleDebatsLink = useCallback(() => {
    navigate('/categorie/agoraplus');
  }, [navigate]);

  const assembly: ParoleAssembly | null = useMemo(
    () => payload?.assemblies?.QC ?? null,
    [payload],
  );

  const data: PeriodSnapshot | null = useMemo(
    () => assembly?.periods?.[period] ?? null,
    [assembly, period],
  );

  const eyebrowEl = (
    <h2 className="ParoleEnChambre-eyebrow">
      {eyebrowLead}
      {eyebrowAccent && <> <span className="has-font-secondary">{eyebrowAccent}</span></>}
      {eyebrowTail && ` ${eyebrowTail}`}
    </h2>
  );

  if (loading) {
    return (
      <div className="ParoleEnChambre ParoleEnChambre--state">
        {eyebrowEl}
        <p className="ParoleEnChambre-status">{t('loading')}</p>
      </div>
    );
  }

  if (error || !assembly) {
    return (
      <div className="ParoleEnChambre ParoleEnChambre--state">
        {eyebrowEl}
        <p className="ParoleEnChambre-status">{t('error')}</p>
      </div>
    );
  }

  const availablePeriods = (['last_pdq', 'session', 'legislature'] as PeriodType[]).filter(
    (pt) => assembly.periods[pt] != null,
  );

  const saillanceLevel = data ? getSaillanceLevel(data.partyInterventions.reduce(
    (s, p) => s + p.interventions, 0) / 500) : 'marginal';

  return (
    <div className="ParoleEnChambre">

      {/* ── Left panel ─────────────────────────────────────────── */}
      <div className="ParoleEnChambre-panel">

        <div className="ParoleEnChambre-panel-header">
          {eyebrowEl}
          {data && (
            <p className="ParoleEnChambre-period-label">{data.periodLabel}</p>
          )}
          <div className="ParoleEnChambre-toggle" role="group" aria-label={t('periodToggle')}>
            {availablePeriods.map((pt) => (
              <button
                key={pt}
                type="button"
                className={`ParoleEnChambre-toggle-btn${period === pt ? ' is-active' : ''}`}
                onClick={() => setPeriod(pt)}
              >
                {periodLabels[pt]}
              </button>
            ))}
          </div>
        </div>

        {data ? (
          <>
            <div className="ParoleEnChambre-story">
              <p className="ParoleEnChambre-hook">{t('hook')}</p>
              <h2 className="ParoleEnChambre-title">
                &laquo;&nbsp;{data.title}&nbsp;&raquo;
              </h2>
            </div>

            <div className="ParoleEnChambre-bottom">
              <div className="ParoleEnChambre-saillance">
                <div className="ParoleEnChambre-saillance-track">
                  <div
                    className="ParoleEnChambre-saillance-fill"
                    style={{ width: `${Math.min(Math.round(
                      data.partyInterventions.reduce((s, p) => s + p.interventions, 0) / 5
                    ), 100)}%` }}
                  />
                </div>
                <span
                  className="ParoleEnChambre-saillance-level"
                  data-level={saillanceLevel}
                >
                  {t(`saillance.${saillanceLevel}`)}
                </span>
              </div>

              <button
                type="button"
                className="ParoleEnChambre-debats-link"
                onClick={handleDebatsLink}
              >
                {t('debatsLink')}
              </button>
            </div>
          </>
        ) : (
          <p className="ParoleEnChambre-status">{t('noData')}</p>
        )}

      </div>

      {/* ── Party panel ─────────────────────────────────────────── */}
      <div className="ParoleEnChambre-parties">
        {assembly.monitoredParties.map((partyCode) => {
          const row = data?.partyInterventions.find((p) => p.party === partyCode);
          const score = row?.score ?? 0;
          const interventions = row?.interventions ?? 0;
          const isActive = interventions > 0;

          return (
            <div
              key={partyCode}
              className={`ParoleEnChambre-party${isActive ? ' ParoleEnChambre-party--active' : ' ParoleEnChambre-party--silent'}`}
            >
              <div className="ParoleEnChambre-party-logo-col">
                {partyLogoMap[partyCode] ? (
                  <img
                    className="ParoleEnChambre-party-logo"
                    src={`/logos/parties-black/${partyLogoMap[partyCode]}.png`}
                    alt={row?.fullName ?? partyCode}
                  />
                ) : (
                  <span className="ParoleEnChambre-party-code">{partyCode}</span>
                )}
              </div>
              <div className="ParoleEnChambre-party-content">
                {isActive && (
                  <span className="ParoleEnChambre-party-count">
                    {interventions}&nbsp;{t('interventions')}
                  </span>
                )}
                {isActive && (
                  <div className="ParoleEnChambre-party-track">
                    <div
                      className="ParoleEnChambre-party-fill"
                      style={{ width: `${Math.round(score * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <span
                className="ParoleEnChambre-party-indicator"
                data-active={isActive}
              >
                {isActive ? 'o' : 'x'}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      {data && (
        <div className="ParoleEnChambre-footer">
          <span>{data.startDate} – {data.endDate}</span>
        </div>
      )}

    </div>
  );
};

export default memo(ParoleEnChambre);
