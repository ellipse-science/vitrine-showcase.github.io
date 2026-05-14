import React, { memo, ReactElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './PartisModule.scss';

type PartyRow = {
  party: string;
  date_utc: string;
  pass: string;
  weighted_mentions: number;
  weighted_tone: number;
};

type Data = {
  federal: PartyRow[];
  provincial: PartyRow[];
};

const partyNames: Record<string, string> = {
  CAQ: 'Coalition Avenir Québec',
  PCQ: 'Parti conservateur du Québec',
  PLQ: 'Parti libéral du Québec',
  QS: 'Québec solidaire',
  PQ: 'Parti Québécois',
  LPC: 'Parti libéral du Canada',
  CPC: 'Parti conservateur du Canada',
  NDP: 'Nouveau Parti démocratique',
  BQ: 'Bloc Québécois',
  GPC: 'Parti vert du Canada',
  PPC: 'Parti populaire du Canada',
};

const PASS_ORDER: Record<string, number> = { pm: 3, noon: 2, am: 1 };

const getLatestSnapshot = (rows: PartyRow[]): PartyRow[] => {
  if (rows.length === 0) return [];

  const latestDate = rows.reduce((max, r) => (r.date_utc > max ? r.date_utc : max), '');
  const dateRows = rows.filter((r) => r.date_utc === latestDate);

  const passes = Array.from(new Set(dateRows.map((r) => r.pass))).sort(
    (a, b) => (PASS_ORDER[b] ?? 0) - (PASS_ORDER[a] ?? 0)
  );
  const bestPass =
    passes.find((p) => dateRows.some((r) => r.pass === p && r.weighted_mentions > 0)) ?? passes[0];
  const passRows = dateRows.filter((r) => r.pass === bestPass);

  const byParty = new Map<string, PartyRow>();
  for (const row of passRows) {
    const key = row.party.toUpperCase();
    const existing = byParty.get(key);
    if (!existing || row.weighted_mentions > existing.weighted_mentions) {
      byParty.set(key, { ...row, party: key });
    }
  }

  return Array.from(byParty.values())
    .filter((r) => r.weighted_mentions > 0)
    .sort((a, b) => b.weighted_mentions - a.weighted_mentions);
};

const toneChip = (tone: number): { label: string; cls: string } => {
  if (tone > 0.01) return { label: '↑ positif', cls: 'is-positive' };
  if (tone < -0.01) return { label: '↓ négatif', cls: 'is-negative' };
  return { label: '→ neutre', cls: 'is-neutral' };
};

const PartyList = ({ rows, max }: { rows: PartyRow[]; max: number }): ReactElement => (
  <ul className="PartisModule-list">
    {rows.map((row) => {
      const pct = Math.round(row.weighted_mentions * 100);
      const barWidth = max > 0 ? (row.weighted_mentions / max) * 100 : 0;
      const chip = toneChip(row.weighted_tone);
      return (
        <li key={row.party} className="PartisModule-row">
          <div className="PartisModule-row-head">
            <span className="PartisModule-party-code">{row.party}</span>
            <span className="PartisModule-party-name">{partyNames[row.party] ?? row.party}</span>
            <span className={`PartisModule-tone ${chip.cls}`}>{chip.label}</span>
            <span className="PartisModule-pct">{pct}%</span>
          </div>
          <div className="PartisModule-bar-track">
            <div className="PartisModule-bar-fill" style={{ width: `${barWidth}%` }} />
          </div>
        </li>
      );
    })}
  </ul>
);

const PartisModule = (): ReactElement => {
  const { t } = useTranslation('PartisModule');
  const [titleLead, titleAccent, ...titleTail] = t('title').split(' ');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/data/refined/day/federal_parties_score_day.json?ts=${Date.now()}`).then((r) => r.json()),
      fetch(`/data/refined/day/provincial_parties_score_day.json?ts=${Date.now()}`).then((r) => r.json()),
    ])
      .then(([federal, provincial]) => {
        setData({
          federal: getLatestSnapshot(federal),
          provincial: getLatestSnapshot(provincial),
        });
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const maxMention = useMemo(() => {
    if (!data) return 1;
    const all = [...data.federal, ...data.provincial];
    return Math.max(...all.map((r) => r.weighted_mentions));
  }, [data]);

  const dateLabel = data?.provincial[0]?.date_utc
    ? new Date(data.provincial[0].date_utc).toLocaleDateString('fr-CA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  const titleEl = (
    <h2 className="PartisModule-title">
      {titleLead}
      {titleAccent && <> <span className="has-font-secondary">{titleAccent}</span></>}
      {titleTail.length > 0 && ` ${titleTail.join(' ')}`}
    </h2>
  );

  if (loading) {
    return (
      <div className="PartisModule PartisModule--state">
        {titleEl}
        <p className="PartisModule-status">{t('loading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="PartisModule PartisModule--state">
        {titleEl}
        <p className="PartisModule-status">{t('error')}</p>
      </div>
    );
  }

  return (
    <div className="PartisModule">
      <div className="PartisModule-header">
        {titleEl}
        <span className="PartisModule-date">{dateLabel}</span>
      </div>

      <div className="PartisModule-body">
        <section className="PartisModule-group">
          <h3 className="PartisModule-group-label">{t('provincial')}</h3>
          <PartyList rows={data.provincial} max={maxMention} />
        </section>

        <div className="PartisModule-divider" />

        <section className="PartisModule-group">
          <h3 className="PartisModule-group-label">{t('federal')}</h3>
          <PartyList rows={data.federal} max={maxMention} />
        </section>
      </div>

      <div className="PartisModule-footer">
        <span>{t('source')}</span>
      </div>
    </div>
  );
};

export default memo(PartisModule);
