"use client";

import { useState } from "react";
import type { AssembleeData, AssembleeRow, PeriodKey, PeriodView } from "@/lib/data/assemblee";

const PERIODS: PeriodKey[] = ["last_pdq", "session", "legislature"];

export function AssembleeClient({ data }: { data: AssembleeData }) {
  const [period, setPeriod] = useState<PeriodKey>("last_pdq");
  const view: PeriodView = data.periods[period];

  const visibleRows = view.rows.filter((r) => !r.inShadow);
  const shadowRows = view.rows.filter((r) => r.inShadow);

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Que dit-on à l&apos;Assemblée&nbsp;?</h2>
          <div className="period-subtitle">{view.subtitle}</div>
        </div>
        <div className="control-block">
          <div className="legend-toggle inline">
            {PERIODS.map((p) => (
              <span
                key={p}
                className={p === period ? "active" : undefined}
                onClick={() => setPeriod(p)}
                style={{ cursor: "pointer" }}
              >
                {data.periods[p].tabLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="assemblee">
        <div className="ass-row header">
          <div></div>
          <div>Répartition des mots par enjeu</div>
          <div>Ton en chambre</div>
          <div style={{ textAlign: "right" }}>Mots prononcés</div>
          <div style={{ textAlign: "center" }}>Richesse lexicale</div>
        </div>

        {visibleRows.map((row) => (
          <ActiveRow key={row.key} row={row} />
        ))}

        {shadowRows.length > 0 && (
          <div className="in-shadow">
            <div className="label">Hors chambre</div>
            {shadowRows.map((row) => (
              <ShadowRow key={row.key} row={row} />
            ))}
          </div>
        )}
      </section>
      <div className="partis-footer">
        <span></span>
      </div>
    </>
  );
}

function ActiveRow({ row }: { row: AssembleeRow }) {
  return (
    <div className="ass-row">
      <span className={`parti-name-box ${row.key}`}>{row.label}</span>
      <div className="ass-issue">
        <div className="enjeu-stack">
          {row.enjeuStack?.map((seg, i) => (
            <span
              key={i}
              className={seg.isReste ? "seg reste" : "seg"}
              style={
                seg.isReste
                  ? { width: `${seg.widthPct}%` }
                  : { background: seg.color, width: `${seg.widthPct}%` }
              }
              title={seg.title}
            >
              {seg.label}
            </span>
          ))}
        </div>
        {row.editorialAngle && <span className="ass-angle">{row.editorialAngle}</span>}
      </div>
      <div className="ass-tone">
        <div className="ass-tone-dot" style={{ left: `${row.toneLeftPct}%` }} />
      </div>
      <div className="ass-words">{row.wordsFormatted}</div>
      <div className="ass-richness">
        <RichnessDots level={row.richnessLevel || 1} />
      </div>
    </div>
  );
}

function ShadowRow({ row }: { row: AssembleeRow }) {
  return (
    <div className="ass-row" style={{ borderBottom: "none" }}>
      <span className={`parti-name-box ${row.key}`} style={{ opacity: 0.5 }}>
        {row.label}
      </span>
      <div className="ass-empty" style={{ gridColumn: "2 / -1" }}>
        Aucun député élu à l&apos;Assemblée nationale en cette législature.
      </div>
    </div>
  );
}

function RichnessDots({ level }: { level: number }) {
  const dots = [];
  for (let i = 1; i <= 5; i++) {
    if (i <= level) {
      dots.push(<span key={i}>●</span>);
    } else {
      dots.push(
        <span key={i} className="empty">
          ○
        </span>,
      );
    }
  }
  return <>{dots}</>;
}
