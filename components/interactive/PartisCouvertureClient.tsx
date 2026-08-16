"use client";

import { useState, useRef } from "react";
import type { PartiesData, RangeKey, RangeView, RowView } from "@/lib/data/parties";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { DoomGame } from "@/components/interactive/DoomGame";

const RANGES: RangeKey[] = ["today", "week", "month"];

function shareTitle(data: PartiesData): string {
  const leader = data.ranges.today.rows[0];
  if (!leader || leader.sovPct === 0 || leader.inShadow) {
    return "Couverture médiatique des partis politiques";
  }
  const tone =
    leader.toneDirection === "positive"
      ? "on en parle en bien"
      : leader.toneDirection === "negative"
        ? "on en parle en mal"
        : "l'important, c'est qu'on en parle";
  return `${leader.label} domine la couverture (${leader.sovPct} %) : ${tone}`;
}

export function PartisCouvertureClient({ data }: { data: PartiesData }) {
  const [range, setRange] = useState<RangeKey>("today");
  const [showDoom, setShowDoom] = useState(false);
  const pcqTapRef = useRef({ count: 0, lastTime: 0 });

  const handlePcqTap = () => {
    const now = performance.now();
    if (now - pcqTapRef.current.lastTime < 1500) {
      pcqTapRef.current.count += 1;
    } else {
      pcqTapRef.current.count = 1;
    }
    pcqTapRef.current.lastTime = now;

    if (pcqTapRef.current.count >= 3) {
      pcqTapRef.current.count = 0;
      setShowDoom(true);
    }
  };

  const view: RangeView = data.ranges[range];
  const visibleRows = view.rows.filter((r) => !r.inShadow);
  const shadowRows = view.rows.filter((r) => r.inShadow);

  if (showDoom) {
    return <DoomGame onExit={() => setShowDoom(false)} />;
  }

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Couverture médiatique des partis politiques</h2>
        </div>
        <div className="control-block">
          <div className="control-row">
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
            <ShareButton title={shareTitle(data)} anchor="partis-et-couverture" />
          </div>
        </div>
      </div>

      <section className="partis">
        <div className="parti-row header">
          <div>Parti</div>
          <div>Saillance</div>
          <div>{view.sparkHeadLabel}</div>
          <div>Ton de la couverture</div>
        </div>

        {visibleRows.map((row) => (
          <PartiRow
            key={row.key}
            row={row}
            refLabel={view.refLabel}
            onPcqTap={row.key === "pcq" ? handlePcqTap : undefined}
          />
        ))}

        {shadowRows.length > 0 && (
          <>
            <div className="in-shadow-label">
              Dans l'ombre médiatique
              <InfoTip size="sm" label="Ombre médiatique">
                Ces partis obtiennent moins de 2&nbsp;% de la part de voix médiatique sur la période sélectionnée.
                Leur présence dans les médias est trop faible pour être significative.
              </InfoTip>
            </div>
            <div className="in-shadow">
              {shadowRows.map((row) => (
                <PartiRow
                  key={row.key}
                  row={row}
                  refLabel={view.refLabel}
                  shadow
                  onPcqTap={row.key === "pcq" ? handlePcqTap : undefined}
                />
              ))}
            </div>
          </>
        )}
      </section>
      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

function PartiRow({
  row,
  refLabel,
  shadow,
  onPcqTap,
}: {
  row: RowView;
  refLabel: string;
  shadow?: boolean;
  onPcqTap?: () => void;
}) {
  const isPcq = row.key === "pcq";
  const nameStyle = {
    ...(shadow ? { opacity: 0.35 } : {}),
    ...(isPcq ? { cursor: "pointer", userSelect: "none" as const } : {}),
  };

  return (
    <div className="parti-row">
      <span
        className={`parti-name-box ${row.key}`}
        style={nameStyle}
        onClick={isPcq ? onPcqTap : undefined}
        title={isPcq ? "PCQ (Touchez 3 fois pour une surprise!)" : undefined}
      >
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
              fill={i === row.sparkCircles.length - 1 ? "#AAA18E" : "#ECE3CF"}
              stroke="#C8BDA6"
              strokeWidth="0.5"
            />
          ))}
        </svg>
      </div>
      <div className="parti-ton-label">Ton de la couverture</div>
      <div className="parti-tone" title={row.toneTitle}>
        <span className={`tone-streak tone-streak--${row.toneDirection}`}>{row.toneLabel}</span>
      </div>
    </div>
  );
}
