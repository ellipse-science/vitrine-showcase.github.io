"use client";

import { useState } from "react";
import type { PartiesData, RangeKey, RangeView, RowView } from "@/lib/data/parties";
import { ShareButton } from "@/components/interactive/ShareButton";

const RANGES: RangeKey[] = ["today", "week", "month"];

export function PartisCouvertureClient({ data }: { data: PartiesData }) {
  const [range, setRange] = useState<RangeKey>("today");
  const view: RangeView = data.ranges[range];

  const visibleRows = view.rows.filter((r) => !r.inShadow);
  const shadowRows = view.rows.filter((r) => r.inShadow);

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Couverture médiatique des partis politiques</h2>
        </div>
        <div className="control-block">
          <ShareButton
            title="Couverture médiatique des partis politiques"
            saillanceLabel={view.tabLabel}
            section="Couverture des partis"
            hashtags={["LaVitrineDémocratique", "Québec"]}
          />
          <div className="legend-toggle inline">
            {RANGES.map((r) => (
              <span
                key={r}
                className={r === range ? "active" : undefined}
                onClick={() => setRange(r)}
                style={{ cursor: "pointer" }}
              >
                {data.ranges[r].tabLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="partis">
        <div className="parti-row header">
          <div></div>
          <div>Saillance</div>
          <div>Ton de la couverture</div>
          <div style={{ textAlign: "right" }}>{view.sparkHeadLabel}</div>
        </div>

        {visibleRows.map((row) => (
          <PartiRow key={row.key} row={row} refLabel={view.refLabel} />
        ))}

        {shadowRows.length > 0 && (
          <div className="in-shadow">
            <div className="label">Dans l'ombre médiatique</div>
            {shadowRows.map((row) => (
              <PartiRow
                key={row.key}
                row={row}
                refLabel={view.refLabel}
                shadow
              />
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

function PartiRow({
  row,
  refLabel,
  shadow,
}: {
  row: RowView;
  refLabel: string;
  shadow?: boolean;
}) {
  const rowStyle = shadow ? { borderBottom: "none" } : undefined;
  const nameStyle = shadow ? { opacity: 0.7 } : undefined;
  return (
    <div className="parti-row" style={rowStyle}>
      <span className={`parti-name-box ${row.key}`} style={nameStyle}>
        {row.label}
      </span>
      <div className="parti-sail-label">Saillance</div>
      <div className="parti-bar-wrap">
        <div
          className="parti-bar"
          style={{ width: `${row.barWidthPct}%`, background: row.color }}
          title={row.barTitle}
        />
        <div
          className="parti-bar-avg"
          style={{ left: `${row.refLeftPct}%` }}
          title={row.refTitle}
        >
          {row.showLeaderLabel && <span className="avg-label">{refLabel}</span>}
        </div>
      </div>
      <div className="parti-ton-label">Ton de la couverture</div>
      <div className="parti-tone">
        <div className="ass-tone-dot" style={{ left: `${row.toneLeftPct}%` }} />
      </div>
      <div className="parti-spark">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none">
          <polyline
            points={row.sparkPolyline}
            fill="none"
            stroke={shadow ? "#6E685F" : "#1C1917"}
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          {row.sparkCircles.map((c, i) => (
            <circle
              key={i}
              cx={c.cx}
              cy={c.cy}
              r={c.r}
              fill="#C8BDA6"
              stroke={i === row.sparkCircles.length - 1 ? "#1C1917" : undefined}
              strokeWidth={i === row.sparkCircles.length - 1 ? 0.8 : undefined}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
