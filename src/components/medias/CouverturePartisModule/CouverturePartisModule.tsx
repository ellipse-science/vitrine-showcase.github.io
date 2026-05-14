import React, { memo, ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CouverturePartisModule.scss';

// ── Types ─────────────────────────────────────────────────────────────────────
type TrendKey = 'upStrong' | 'up' | 'stable' | 'down' | 'downStrong';

type PartyEntry = {
  key: string;
  label: string;
  color: string;
  sov: number;
  tone: number;
  trend: TrendKey;
  inShadow: boolean;
  logoUrl: string;
  history: number[];
};

type Scope = 'provincial' | 'federal';
type TimeRange = 'today' | '7days' | 'month';

type HistoryByRange = Record<TimeRange, number[]>;
type SovByRange = Record<TimeRange, number>;
type PartyData = Omit<PartyEntry, 'history'> & { histories: HistoryByRange; sovByRange: SovByRange };

// ── Design constants (colors / logos / display labels) ────────────────────────
const partyConfig: Record<string, { color: string; logoUrl: string; label: string }> = {
  LPC: { color: '#D71920', logoUrl: '/logos/parties/lpc.png', label: 'PLC' },
  CPC: { color: '#1A4782', logoUrl: '/logos/parties/cpc.png', label: 'PCC' },
  NDP: { color: '#F37021', logoUrl: '/logos/parties/ndp.png', label: 'NPD' },
  BQ:  { color: '#0D4E8A', logoUrl: '/logos/parties/bq.png',  label: 'BQ'  },
  GPC: { color: '#3D9B35', logoUrl: '/logos/parties/gpc.png', label: 'PVC' },
  PPC: { color: '#8B0000', logoUrl: '/logos/parties/ppc.png', label: 'PPC' },
  CAQ: { color: '#002855', logoUrl: '/logos/parties/caq.png', label: 'CAQ' },
  PLQ: { color: '#CD202C', logoUrl: '/logos/parties/plq.png', label: 'PLQ' },
  QS:  { color: '#FF5A36', logoUrl: '/logos/parties/qs.png',  label: 'QS'  },
  PQ:  { color: '#003DA5', logoUrl: '/logos/parties/pq.png',  label: 'PQ'  },
  PCQ: { color: '#5B2D8E', logoUrl: '/logos/parties/pcq.png', label: 'PCQ' },
};

const passOrder: Record<string, number> = { pm: 3, noon: 2, am: 1 };

// ── Raw data types ────────────────────────────────────────────────────────────
type RawPartyRow = {
  party: string;
  date_utc: string;
  pass: string;
  weighted_mentions: number;
  weighted_tone: number;
};

// Weekly and monthly tables have no `pass` column
type RawAggRow = {
  party: string;
  date_utc: string;
  weighted_mentions: number;
  weighted_tone: number;
};

type DaySnapshot = { mentions: number; tone: number };

// ── Data transformation ───────────────────────────────────────────────────────

const buildDayLookup = (rawRows: RawPartyRow[]): Record<string, Record<string, DaySnapshot>> => {
  const passBest: Record<string, RawPartyRow> = {};
  rawRows.forEach((row) => {
    const key = `${row.date_utc}|${row.party.toUpperCase()}|${row.pass}`;
    const ex = passBest[key];
    if (!ex || row.weighted_mentions > ex.weighted_mentions) {
      passBest[key] = { ...row, party: row.party.toUpperCase() };
    }
  });

  const grouped: Record<string, Record<string, RawPartyRow[]>> = {};
  Object.values(passBest).forEach((row) => {
    if (!grouped[row.date_utc]) grouped[row.date_utc] = {};
    if (!grouped[row.date_utc][row.party]) grouped[row.date_utc][row.party] = [];
    grouped[row.date_utc][row.party].push(row);
  });

  const result: Record<string, Record<string, DaySnapshot>> = {};
  Object.entries(grouped).forEach(([date, parties]) => {
    result[date] = {};
    Object.entries(parties).forEach(([party, passes]) => {
      const sorted = passes.sort((a, b) => (passOrder[b.pass] ?? 0) - (passOrder[a.pass] ?? 0));
      const best = sorted.find((r) => r.weighted_mentions > 0) ?? sorted[0];
      result[date][party] = { mentions: best.weighted_mentions, tone: best.weighted_tone };
    });
  });

  return result;
};

const computeDaySov = (
  dayLookup: Record<string, Record<string, DaySnapshot>>,
  date: string,
  parties: string[]
): Record<string, number> => {
  const dayData = dayLookup[date] ?? {};
  const total = parties.reduce((s, p) => s + (dayData[p]?.mentions ?? 0), 0) || 1;
  return parties.reduce<Record<string, number>>((acc, party) => {
    acc[party] = (dayData[party]?.mentions ?? 0) / total;
    return acc;
  }, {});
};

// Build normalized SOV history from pre-aggregated weekly or monthly rows.
const buildAggSovHistory = (rows: RawAggRow[], parties: string[]): Record<string, number[]> => {
  if (rows.length === 0) return parties.reduce((acc, p) => ({ ...acc, [p]: [] }), {});

  const byDate: Record<string, Record<string, number>> = {};
  rows.forEach((row) => {
    const party = row.party.toUpperCase();
    if (!parties.includes(party)) return;
    if (!byDate[row.date_utc]) byDate[row.date_utc] = {};
    byDate[row.date_utc][party] = Math.max(byDate[row.date_utc][party] ?? 0, row.weighted_mentions);
  });

  const dates = Object.keys(byDate).sort();
  const sovByDate: Record<string, Record<string, number>> = {};
  dates.forEach((date) => {
    const total = parties.reduce((s, p) => s + (byDate[date]?.[p] ?? 0), 0) || 1;
    sovByDate[date] = {};
    parties.forEach((p) => {
      sovByDate[date][p] = (byDate[date]?.[p] ?? 0) / total;
    });
  });

  return parties.reduce<Record<string, number[]>>((acc, p) => {
    acc[p] = dates.map((d) => sovByDate[d][p] ?? 0);
    return acc;
  }, {});
};

const computeTrend = (history: number[]): TrendKey => {
  if (history.length < 2) return 'stable';
  const recent = history[history.length - 1];
  const prevSlice = history.slice(0, Math.max(1, history.length - 2));
  const baseline = prevSlice.reduce((s, v) => s + v, 0) / prevSlice.length;
  if (baseline === 0) return recent > 0 ? 'up' : 'stable';
  const change = (recent - baseline) / baseline;
  if (change > 0.2) return 'upStrong';
  if (change > 0.05) return 'up';
  if (change < -0.2) return 'downStrong';
  if (change < -0.05) return 'down';
  return 'stable';
};

const buildPartyData = (
  rawRows: RawPartyRow[],
  weeklyRows: RawAggRow[],
  monthlyRows: RawAggRow[]
): PartyData[] => {
  if (rawRows.length === 0) return [];

  const dayLookup = buildDayLookup(rawRows);
  const allDates = Object.keys(dayLookup).sort();
  const latestDate = allDates[allDates.length - 1];

  const knownParties = Object.keys(dayLookup[latestDate] ?? {}).filter((p) => partyConfig[p]);
  if (knownParties.length === 0) return [];

  const last7Dates  = allDates.slice(-7);
  const last30Dates = allDates.slice(-30);

  const sovCache: Record<string, Record<string, number>> = {};
  last30Dates.forEach((date) => {
    sovCache[date] = computeDaySov(dayLookup, date, knownParties);
  });

  const weeklySovHistory  = buildAggSovHistory(weeklyRows,  knownParties);
  const monthlySovHistory = buildAggSovHistory(monthlyRows, knownParties);

  const avg = (arr: number[]): number => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

  return knownParties
    .map((party) => {
      const cfg = partyConfig[party];
      const sovToday    = sovCache[latestDate]?.[party] ?? 0;
      const history7days  = last7Dates.map((d)  => sovCache[d]?.[party]  ?? 0);
      const historyMonth  = last30Dates.map((d) => sovCache[d]?.[party]  ?? 0);

      return {
        key:      party.toLowerCase(),
        label:    cfg.label,
        color:    cfg.color,
        logoUrl:  cfg.logoUrl,
        sov:      sovToday,
        tone:     dayLookup[latestDate]?.[party]?.tone ?? 0,
        trend:    computeTrend(history7days),
        inShadow: sovToday < 0.05,
        histories: {
          // today: last 7 daily values (shows "Les derniers jours" context)
          today:   history7days,
          // 7days: weekly pre-computed history (shows "Les dernières semaines")
          '7days': weeklySovHistory[party]  ?? [],
          // month: monthly pre-computed history (shows "Les derniers mois")
          month:   monthlySovHistory[party] ?? [],
        },
        sovByRange: {
          today:   sovToday,
          '7days': avg(history7days),
          month:   avg(historyMonth),
        },
      };
    })
    .sort((a, b) => b.sov - a.sov);
};

// ── Resolve history and SOV for the active time range ─────────────────────────
const resolveParties = (data: PartyData[], range: TimeRange): PartyEntry[] =>
  data.map((d) => ({ ...d, history: d.histories[range], sov: d.sovByRange[range] }));

// ── Helpers ───────────────────────────────────────────────────────────────────
const trendGlyph: Record<TrendKey, string> = {
  upStrong: '↑↑',
  up: '↑',
  stable: '→',
  down: '↓',
  downStrong: '↓↓',
};

const toneToRgb = (tone: number): [number, number, number] => {
  const neg: [number, number, number] = [215, 25, 32];
  const neu: [number, number, number] = [160, 160, 160];
  const pos: [number, number, number] = [36, 176, 62];
  if (tone <= 0) {
    const t = tone + 1;
    return neg.map((c, j) => Math.round(c + (neu[j] - c) * t)) as [number, number, number];
  }
  return neu.map((c, j) => Math.round(c + (pos[j] - c) * tone)) as [number, number, number];
};

const sparkPoints = (history: number[], w: number, h: number): string => {
  if (history.length < 2) return '';
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 0.001;
  return history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - ((v - min) / range) * (h * 0.8) - h * 0.1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
};

// ── Party row ─────────────────────────────────────────────────────────────────
const sparkW = 72;
const sparkH = 28;

const PartyRow = ({ party, maxSov }: { party: PartyEntry; maxSov: number }): ReactElement => {
  const sovPct = Math.round(party.sov * 100);
  const barPct = (party.sov / maxSov) * 100;
  const dotPct = ((party.tone + 1) / 2) * 100;
  const [tr, tg, tb] = toneToRgb(party.tone);
  const toneColor = `rgb(${tr},${tg},${tb})`;
  const pts = sparkPoints(party.history, sparkW, sparkH);

  const hasHistory = pts !== '';
  const lastX = sparkW;
  const lastY = hasHistory
    ? (() => {
        const min = Math.min(...party.history);
        const max = Math.max(...party.history);
        const range = max - min || 0.001;
        return sparkH - ((party.history[party.history.length - 1] - min) / range) * (sparkH * 0.8) - sparkH * 0.1;
      })()
    : sparkH / 2;

  return (
    <div className={`CouvPartis-row${party.inShadow ? ' is-shadow' : ''}`}>
      <div className="CouvPartis-row-logo" style={{ borderColor: party.color }}>
        <img src={party.logoUrl} alt={party.label} draggable={false} />
      </div>

      <div className="CouvPartis-row-identity">
        <span className="CouvPartis-row-name has-font-secondary">{party.label}</span>
        <div className="CouvPartis-row-sovbar">
          <div className="CouvPartis-row-sovfill" style={{ width: `${barPct}%`, backgroundColor: party.color }} />
        </div>
      </div>

      <div className="CouvPartis-row-sov">
        <span className="CouvPartis-row-sovpct has-font-secondary">{sovPct}%</span>
        <span className="CouvPartis-row-trend has-font-secondary" style={{ color: toneColor }}>
          {trendGlyph[party.trend]}
        </span>
      </div>

      <div className="CouvPartis-row-tonescale" aria-label="Ton de la couverture médiatique">
        <div className="CouvPartis-row-tonebar">
          <div
            className="CouvPartis-row-tonedot"
            style={{ left: `${dotPct}%`, borderColor: toneColor, backgroundColor: toneColor }}
          />
        </div>
      </div>

      <svg className="CouvPartis-row-spark" width={sparkW} height={sparkH} aria-hidden="true">
        {hasHistory && (
          <>
            <polyline
              points={`0,${sparkH} ${pts} ${sparkW},${sparkH}`}
              fill={party.color}
              fillOpacity={0.12}
              stroke="none"
            />
            <polyline
              points={pts}
              fill="none"
              stroke={party.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={lastX} cy={lastY} r={2.5} fill={party.color} />
          </>
        )}
      </svg>
    </div>
  );
};

// ── Module ────────────────────────────────────────────────────────────────────
const CouverturePartisModule = (): ReactElement => {
  const { t } = useTranslation('CouverturePartisModule');
  const [titleLead, titleAccent, titleBridge, ...titleTail] = t('title').split(' ');
  const [scope, setScope]         = useState<Scope>('provincial');
  const [timeRange, setTimeRange] = useState<TimeRange>('7days');
  const [federalData, setFederalData]       = useState<PartyData[]>([]);
  const [provincialData, setProvincialData] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    const ts = Date.now();
    const get = (path: string): Promise<unknown[]> =>
      fetch(`${path}?ts=${ts}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);

    Promise.all([
      get('/data/refined/day/federal_parties_score_day.json'),
      get('/data/refined/day/provincial_parties_score_day.json'),
      get('/data/refined/week/federal_parties_score_week.json'),
      get('/data/refined/week/provincial_parties_score_week.json'),
      get('/data/refined/month/federal_parties_score_month.json'),
      get('/data/refined/month/provincial_parties_score_month.json'),
    ])
      .then(([federalDay, provincialDay, federalWeek, provincialWeek, federalMonth, provincialMonth]) => {
        setFederalData(buildPartyData(
          federalDay   as RawPartyRow[],
          federalWeek  as RawAggRow[],
          federalMonth as RawAggRow[],
        ));
        setProvincialData(buildPartyData(
          provincialDay   as RawPartyRow[],
          provincialWeek  as RawAggRow[],
          provincialMonth as RawAggRow[],
        ));
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const rawData    = scope === 'provincial' ? provincialData : federalData;
  const allParties = resolveParties(rawData, timeRange);
  const active     = allParties.filter((p) => !p.inShadow).sort((a, b) => b.sov - a.sov);
  const shadows    = allParties.filter((p) => p.inShadow).sort((a, b) => b.sov - a.sov);
  const maxSov     = active[0]?.sov ?? 1;

  const titleEl = (
    <h2 className="CouverturePartisModule-title">
      {titleLead}
      {titleAccent && (
        <> <span className="has-font-secondary">{titleAccent}</span></>
      )}
      {titleBridge && ` ${titleBridge}`}
      {titleTail.length > 0 && (
        <> <span className="has-font-secondary">{titleTail.join(' ')}</span></>
      )}
    </h2>
  );

  if (loading) {
    return (
      <div className="CouverturePartisModule CouverturePartisModule--state">
        <div className="CouverturePartisModule-header">
          <div className="CouverturePartisModule-header-row">
            <div className="CouverturePartisModule-header-text">
              <span className="CouverturePartisModule-eyebrow">{t('eyebrow')}</span>
              {titleEl}
            </div>
          </div>
        </div>
        <p className="CouverturePartisModule-status">Chargement…</p>
      </div>
    );
  }

  if (error || rawData.length === 0) {
    return (
      <div className="CouverturePartisModule CouverturePartisModule--state">
        <div className="CouverturePartisModule-header">
          <div className="CouverturePartisModule-header-row">
            <div className="CouverturePartisModule-header-text">
              <span className="CouverturePartisModule-eyebrow">{t('eyebrow')}</span>
              {titleEl}
            </div>
          </div>
        </div>
        <p className="CouverturePartisModule-status">Données indisponibles.</p>
      </div>
    );
  }

  const sparkLabel: Record<TimeRange, string> = {
    today:   'Les derniers jours',
    '7days': 'Les dernières semaines',
    month:   'Les derniers mois',
  };

  return (
    <div className="CouverturePartisModule">
      <div className="CouverturePartisModule-header">
        <div className="CouverturePartisModule-header-row">
          <div className="CouverturePartisModule-header-text">
            <span className="CouverturePartisModule-eyebrow">{t('eyebrow')}</span>
            {titleEl}
          </div>
          <div className="CouverturePartisModule-tabGroup">
            <div className="CouverturePartisModule-tabs">
              {(['provincial', 'federal'] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`CouverturePartisModule-tab${scope === s ? ' is-active' : ''}`}
                  onClick={() => setScope(s)}
                >
                  {t(`scopes.${s}`)}
                </button>
              ))}
            </div>
            <div className="CouverturePartisModule-tabs CouverturePartisModule-tabs--range">
              {(['today', '7days', 'month'] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`CouverturePartisModule-tab${timeRange === r ? ' is-active' : ''}`}
                  onClick={() => setTimeRange(r)}
                >
                  {{ today: "Aujourd'hui", '7days': '7 jours', month: 'Ce mois-ci' }[r]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="CouverturePartisModule-desc">{t('description')}</p>
      </div>

      <div className="CouvPartis-colheads">
        <span className="CouvPartis-colhead-party">Parti</span>
        <span className="CouvPartis-colhead-sov">Part&nbsp;de&nbsp;voix&nbsp;·&nbsp;Tendance</span>
        <span className="CouvPartis-colhead-tone">Ton de la couverture</span>
        <span className="CouvPartis-colhead-spark">{sparkLabel[timeRange]}</span>
      </div>

      <div className="CouvPartis-list">
        {active.map((p) => (
          <PartyRow key={p.key} party={p} maxSov={maxSov} />
        ))}
        {shadows.length > 0 && <div className="CouvPartis-shadowdivider">Dans l&apos;ombre médiatique</div>}
        {shadows.map((p) => (
          <PartyRow key={p.key} party={p} maxSov={maxSov} />
        ))}
      </div>

      <div className="CouverturePartisModule-footer">
        <span className="CouverturePartisModule-source">{t('source')}</span>
      </div>
    </div>
  );
};

export default memo(CouverturePartisModule);
