"use client";

import { useState } from "react";
import type { AssembleeRow, DeputyRow } from "@/lib/data/assemblee";
import type { PartyKey } from "@/lib/data/parties";
import { facetResult } from "@/lib/data/assembleeInsights";

// Hémicycle stylisé : chaque parti est un quartier du demi-cercle, largeur
// proportionnelle à son poids en mots pour la période (donnée réelle qu'on a
// — PAS un vrai décompte de sièges, qu'on n'a pas). Chaque siège est un
// député, rayon = son poids en mots à l'échelle de toute la chambre, halo =
// son ton. Cliquer un quartier ou un siège ouvre le détail complet en dessous
// — un seul récit affiché à la fois, plutôt que quatre fiches empilées.

const CX = 450;
const CY = 360;
const ROW_RADII = [105, 148, 190];
const LABEL_RADIUS = 224;
const FRAME_RADIUS = 246;
const SEAT_MIN_R = 4.5;
const SEAT_MAX_R = 12;
const WEDGE_GAP_DEG = 1.4;

function polar(r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

type Selection =
  | { type: "party"; partyKey: PartyKey }
  | { type: "deputy"; deputyName: string; partyKey: PartyKey };

type Seat = {
  deputy: DeputyRow;
  partyKey: PartyKey;
  color: string;
  x: number;
  y: number;
  r: number;
};

type Wedge = {
  row: AssembleeRow;
  angleStart: number;
  angleEnd: number;
  labelX: number;
  labelY: number;
};

function buildLayout(rows: AssembleeRow[]) {
  const totalWords = rows.reduce((s, r) => s + (r.wordsRaw || 0), 0) || 1;
  const allDeputyWords = rows.flatMap((r) => (r.deputies || []).map((d) => d.wordsRaw));
  const maxDeputyWords = allDeputyWords.length > 0 ? Math.max(...allDeputyWords) : 1;

  const wedges: Wedge[] = [];
  const seats: Seat[] = [];
  let cursor = 180;

  for (const row of rows) {
    const rawWidth = ((row.wordsRaw || 0) / totalWords) * 180;
    const width = Math.max(rawWidth, 180 / (rows.length * 3)); // plancher : jamais un quartier invisible
    const angleStart = cursor;
    const angleEnd = cursor - width;
    cursor = angleEnd;

    const inset = Math.min(width * 0.12, 5);
    const innerStart = width > inset * 2.4 ? angleStart - inset : angleStart;
    const innerEnd = width > inset * 2.4 ? angleEnd + inset : angleEnd;

    const mid = (angleStart + angleEnd) / 2;
    const label = polar(LABEL_RADIUS, mid);
    wedges.push({ row, angleStart, angleEnd, labelX: label.x, labelY: label.y });

    const deputies = row.deputies || [];
    const rowCount = deputies.length <= 4 ? 1 : deputies.length <= 10 ? 2 : 3;
    const chunkSize = Math.ceil(deputies.length / rowCount);

    deputies.forEach((d, i) => {
      const rowIdx = Math.floor(i / chunkSize);
      const chunkStart = rowIdx * chunkSize;
      const chunkLen = Math.min(chunkSize, deputies.length - chunkStart);
      const posInChunk = i - chunkStart;
      const frac = chunkLen === 1 ? 0.5 : posInChunk / (chunkLen - 1);
      const angle = innerStart - frac * (innerStart - innerEnd);
      const radius = ROW_RADII[rowIdx] ?? ROW_RADII[ROW_RADII.length - 1];
      const { x, y } = polar(radius, angle);
      const sizeFrac = maxDeputyWords > 0 ? d.wordsRaw / maxDeputyWords : 0;
      const r = SEAT_MIN_R + sizeFrac * (SEAT_MAX_R - SEAT_MIN_R);
      seats.push({ deputy: d, partyKey: row.key, color: row.color, x, y, r });
    });
  }

  return { wedges, seats };
}

function RichnessDots({ level }: { level: number }) {
  const dots = [];
  for (let i = 1; i <= 5; i++) {
    dots.push(i <= level ? <span key={i}>●</span> : <span key={i} className="empty">○</span>);
  }
  return <>{dots}</>;
}

function ToneGauge({ pct, title }: { pct: number; title?: string }) {
  return (
    <div className="ass-tone" title={title}>
      <div className="ass-tone-dot" style={{ left: `${pct}%` }} />
    </div>
  );
}

function PartyDetail({ row, allRows }: { row: AssembleeRow; allRows: AssembleeRow[] }) {
  const issue = facetResult(row, "issue", allRows);
  const tone = facetResult(row, "tone", allRows);
  const richness = facetResult(row, "richness", allRows);

  return (
    <div className="ass-hemi-detail">
      <div className="ass-hemi-detail-head">
        <span className={`parti-name-box ${row.key}`}>{row.label}</span>
        <span className="ass-card-figure">
          {row.wordsFormatted ?? "0"}
          <span className="unit" aria-hidden="true">mots</span>
        </span>
      </div>

      {row.editorialAngle && <p className="ass-card-angle">{row.editorialAngle}</p>}

      <div className="ass-card-block">
        <span className="stat-label">Répartition par enjeu</span>
        <div className="enjeu-stack">
          {row.enjeuStack?.map((seg, i) => (
            <span
              key={i}
              className={seg.isReste ? "seg reste" : "seg"}
              style={seg.isReste ? { width: `${seg.widthPct}%` } : { background: seg.color, width: `${seg.widthPct}%` }}
              title={seg.title}
            >
              {seg.label}
            </span>
          ))}
        </div>
        <p className="ass-card-caption">{issue.body}</p>
      </div>

      <div className="ass-card-stats">
        <div className="ass-card-block">
          <span className="stat-label">Ton en chambre</span>
          <ToneGauge pct={row.toneLeftPct ?? 50} title={tone.body} />
          <p className="ass-card-caption">{tone.body}</p>
        </div>
        <div className="ass-card-block">
          <span className="stat-label">Richesse lexicale</span>
          <span className="ass-richness"><RichnessDots level={row.richnessLevel || 1} /></span>
          <p className="ass-card-caption">{richness.body}</p>
        </div>
      </div>

      {row.signatureWord && (
        <p className="ass-card-sigword">
          <span className="stat-label">Mot distinctif</span>
          <span className="ass-sigword-quote">« {row.signatureWord} »{row.signatureWordContext ? ` (${row.signatureWordContext})` : ""}</span>
        </p>
      )}
    </div>
  );
}

function DeputyDetail({ deputy, row }: { deputy: DeputyRow; row: AssembleeRow }) {
  return (
    <div className="ass-hemi-detail">
      <div className="ass-hemi-detail-head">
        <span className={`parti-name-box ${row.key}`}>{row.label}</span>
        <span className="ass-card-figure">
          {deputy.wordsFormatted}
          <span className="unit" aria-hidden="true">mots</span>
        </span>
      </div>
      <p className="ass-card-angle">{deputy.name}</p>
      <div className="ass-card-stats">
        <div className="ass-card-block">
          <span className="stat-label">Ton en chambre</span>
          <ToneGauge pct={deputy.toneLeftPct} />
        </div>
        <div className="ass-card-block">
          <span className="stat-label">Richesse lexicale</span>
          <span className="ass-richness"><RichnessDots level={deputy.richnessLevel} /></span>
        </div>
      </div>
      {deputy.signatureWord && (
        <p className="ass-card-sigword">
          <span className="stat-label">Mot distinctif</span>
          <span className="ass-sigword-quote">« {deputy.signatureWord} »{deputy.signatureWordContext ? ` (${deputy.signatureWordContext})` : ""}</span>
        </p>
      )}
    </div>
  );
}

export function AssembleeHemicycle({ rows, shadowRows }: { rows: AssembleeRow[]; shadowRows: AssembleeRow[] }) {
  const [selected, setSelected] = useState<Selection | null>(
    rows.length > 0 ? { type: "party", partyKey: rows[0].key } : null,
  );

  if (rows.length === 0) {
    return <p className="ass-empty">Aucune donnée disponible pour cette période.</p>;
  }

  const { wedges, seats } = buildLayout(rows);
  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  const selectedRow = selected ? rowByKey.get(selected.partyKey) : undefined;
  const selectedDeputy = selected?.type === "deputy" && selectedRow
    ? (selectedRow.deputies || []).find((d) => d.name === selected.deputyName)
    : undefined;

  return (
    <div className="ass-hemi">
      <svg
        className="ass-hemi-svg"
        viewBox="0 0 900 380"
        role="group"
        aria-label="Hémicycle stylisé de l'Assemblée nationale : la largeur de chaque quartier suit le poids en mots du parti, la taille de chaque siège suit le poids en mots du député"
      >
        <path
          d={`M ${CX - FRAME_RADIUS} ${CY} A ${FRAME_RADIUS} ${FRAME_RADIUS} 0 0 1 ${CX + FRAME_RADIUS} ${CY}`}
          className="ass-hemi-frame"
        />
        <line x1={CX - FRAME_RADIUS} y1={CY} x2={CX + FRAME_RADIUS} y2={CY} className="ass-hemi-baseline" />

        {wedges.map((w, i) => {
          if (i === 0) return null;
          const b = polar(FRAME_RADIUS - 4, w.angleStart);
          return (
            <line
              key={`div-${w.row.key}`}
              x1={CX}
              y1={CY}
              x2={b.x}
              y2={b.y}
              className="ass-hemi-divider"
            />
          );
        })}

        {wedges.map((w) => {
          const isSelected = selected?.type === "party" && selected.partyKey === w.row.key;
          return (
            <g
              key={w.row.key}
              role="button"
              tabIndex={0}
              aria-label={`${w.row.label} · ${w.row.wordsFormatted ?? "0"} mots, voir le détail du parti`}
              className={`ass-hemi-label${isSelected ? " selected" : ""}`}
              onClick={() => setSelected({ type: "party", partyKey: w.row.key })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected({ type: "party", partyKey: w.row.key }); }
              }}
              style={{ ["--c" as string]: w.row.color }}
            >
              <rect x={w.labelX - 26} y={w.labelY - 11} width={52} height={22} className="ass-hemi-label-bg" />
              <text x={w.labelX} y={w.labelY + 4} textAnchor="middle" className="ass-hemi-label-text">
                {w.row.label}
              </text>
            </g>
          );
        })}

        {seats.map((seat) => {
          const isSelected = selected?.type === "deputy" && selected.deputyName === seat.deputy.name;
          const favorable = seat.deputy.toneLeftPct >= 55;
          const defavorable = seat.deputy.toneLeftPct <= 45;
          return (
            <g
              key={`${seat.partyKey}-${seat.deputy.name}`}
              role="button"
              tabIndex={0}
              aria-label={`${seat.deputy.name} · ${seat.deputy.wordsFormatted} mots`}
              className="ass-hemi-seat"
              onClick={() => setSelected({ type: "deputy", deputyName: seat.deputy.name, partyKey: seat.partyKey })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected({ type: "deputy", deputyName: seat.deputy.name, partyKey: seat.partyKey }); }
              }}
            >
              {favorable && <circle cx={seat.x} cy={seat.y} r={seat.r + 9} className="ass-hemi-halo favorable" />}
              {favorable && <circle cx={seat.x} cy={seat.y} r={seat.r + 5} className="ass-hemi-halo favorable strong" />}
              {defavorable && <circle cx={seat.x} cy={seat.y} r={seat.r + 9} className="ass-hemi-halo defavorable" />}
              {defavorable && <circle cx={seat.x} cy={seat.y} r={seat.r + 5} className="ass-hemi-halo defavorable strong" />}
              <circle cx={seat.x} cy={seat.y} r={14} className="ass-hemi-hit" />
              <circle
                cx={seat.x}
                cy={seat.y}
                r={seat.r}
                fill={seat.color}
                className={`ass-hemi-seat-dot${isSelected ? " selected" : ""}`}
              />
            </g>
          );
        })}
      </svg>

      {selected?.type === "party" && selectedRow && <PartyDetail row={selectedRow} allRows={rows} />}
      {selected?.type === "deputy" && selectedRow && selectedDeputy && (
        <DeputyDetail deputy={selectedDeputy} row={selectedRow} />
      )}

      {shadowRows.length > 0 && (
        <div className="in-shadow">
          <div className="in-shadow-label">Hors chambre</div>
          {shadowRows.map((row) => (
            <div key={row.key} className="ass-card ass-card-shadow">
              <span className={`parti-name-box ${row.key}`}>{row.label}</span>
              <p className="ass-empty">Aucun député élu à l&apos;Assemblée nationale en cette législature.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
