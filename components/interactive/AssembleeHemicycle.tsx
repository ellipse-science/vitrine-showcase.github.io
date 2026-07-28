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
const ROW_RADII = [90, 124, 158, 192];
const LABEL_RADIUS = 224;
const FRAME_RADIUS = 246;
const DIVIDER_INNER_RADIUS = 60;
const SEAT_MIN_R = 5.5;
const SEAT_MAX_R = 14;

const SEAT_GAP = 3; // écart minimal (unités viewBox) entre les bords de deux sièges

function polar(r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

// Demi-largeur angulaire qu'occupe un siège de rayon `r` sur un anneau de
// rayon `ringRadius` (arc ≈ rayon × angle, en radians, converti en degrés).
function seatHalfAngleDeg(r: number, ringRadius: number): number {
  return ((r + SEAT_GAP / 2) / ringRadius) * (180 / Math.PI);
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

  // Plancher (jamais un quartier invisible) PUIS renormalisation : appliquer
  // le plancher à plusieurs petits partis à la fois peut pousser la somme
  // au-delà de 180°, ce qui faisait déborder le dernier quartier sous la
  // ligne de base. La renormalisation garantit que la somme fait toujours
  // exactement 180°, quel que soit le nombre de partis au plancher.
  const floorWidth = 180 / (rows.length * 3);
  const flooredWidths = rows.map((row) => Math.max(((row.wordsRaw || 0) / totalWords) * 180, floorWidth));
  const flooredSum = flooredWidths.reduce((s, w) => s + w, 0) || 1;
  const widths = flooredWidths.map((w) => (w / flooredSum) * 180);

  const wedges: Wedge[] = [];
  const seats: Seat[] = [];
  let cursor = 180;

  rows.forEach((row, rowIdx) => {
    const width = widths[rowIdx];
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
    const sized = deputies.map((d) => {
      const sizeFrac = maxDeputyWords > 0 ? d.wordsRaw / maxDeputyWords : 0;
      return { d, r: SEAT_MIN_R + sizeFrac * (SEAT_MAX_R - SEAT_MIN_R) };
    });
    const availableWidthDeg = innerStart - innerEnd;

    // Empile les sièges anneau par anneau (le plus prolixe au premier anneau,
    // le plus près du centre) : un anneau ne reçoit un siège de plus que si sa
    // largeur angulaire cumulée tient encore dans le quartier — sinon on
    // passe à l'anneau suivant. Ça garantit qu'aucun siège ne chevauche son
    // voisin, même quand le quartier est étroit ou compte beaucoup de députés.
    const rings: (typeof sized)[] = [[]];
    let usedDeg = 0;
    for (const item of sized) {
      let ringIdx = rings.length - 1;
      let ringRadius = ROW_RADII[Math.min(ringIdx, ROW_RADII.length - 1)];
      let needed = seatHalfAngleDeg(item.r, ringRadius) * 2;
      if (usedDeg + needed > availableWidthDeg && rings[ringIdx].length > 0 && ringIdx < ROW_RADII.length - 1) {
        rings.push([]);
        ringIdx++;
        ringRadius = ROW_RADII[Math.min(ringIdx, ROW_RADII.length - 1)];
        needed = seatHalfAngleDeg(item.r, ringRadius) * 2;
        usedDeg = 0;
      }
      rings[ringIdx].push(item);
      usedDeg += needed;
    }

    rings.forEach((ring, ringIdx) => {
      if (ring.length === 0) return;
      const ringRadius = ROW_RADII[Math.min(ringIdx, ROW_RADII.length - 1)];
      let halfDegs = ring.map((it) => seatHalfAngleDeg(it.r, ringRadius));
      let totalSpan = halfDegs.reduce((s, h) => s + 2 * h, 0);

      // Dernier anneau : plus de place pour en ouvrir un nouveau. Si même là
      // ça déborde, on rétrécit les sièges de CET anneau juste assez pour
      // qu'ils tiennent — jamais de débordement hors du quartier, même dans
      // les cas extrêmes (parti étroit avec beaucoup de députés loquaces).
      let ringSeatR = ring.map((it) => it.r);
      if (totalSpan > availableWidthDeg) {
        // Rétrécit jusqu'à ce que ça tienne (ou jusqu'au plancher de lisibilité) :
        // deux passes suffisent en pratique, l'écart fixe (SEAT_GAP) entre
        // sièges ne rétrécit pas proportionnellement au rayon.
        for (let pass = 0; pass < 4 && totalSpan > availableWidthDeg; pass++) {
          const shrink = availableWidthDeg / totalSpan;
          ringSeatR = ringSeatR.map((r) => Math.max(2, r * shrink));
          halfDegs = ringSeatR.map((r) => seatHalfAngleDeg(r, ringRadius));
          totalSpan = halfDegs.reduce((s, h) => s + 2 * h, 0);
        }
      }

      const startPad = Math.max(0, (availableWidthDeg - totalSpan) / 2);
      let angleCursor = innerStart - startPad;
      ring.forEach((item, i) => {
        angleCursor -= halfDegs[i];
        // Filet de sécurité final : même si le rétrécissement ci-dessus n'a
        // pas suffi (trop de sièges pour l'espace, même au plancher), un
        // siège ne sort JAMAIS de son propre quartier — il peut au pire se
        // superposer à un autre siège du MÊME parti, jamais à celui d'un
        // parti voisin. Les sièges en trop sont plutôt repoussés vers
        // l'extérieur (en éventail depuis la bordure) plutôt que de
        // s'empiler exactement au même point.
        const clampedAngle = Math.min(innerStart, Math.max(innerEnd, angleCursor));
        const overflowDeg = Math.abs(angleCursor - clampedAngle);
        const { x, y } = polar(ringRadius + overflowDeg * 2.5, clampedAngle);
        angleCursor -= halfDegs[i];
        seats.push({ deputy: item.d, partyKey: row.key, color: row.color, x, y, r: ringSeatR[i] });
      });
    });
  });

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
          const a = polar(DIVIDER_INNER_RADIUS, w.angleStart);
          const b = polar(FRAME_RADIUS - 4, w.angleStart);
          return (
            <line
              key={`div-${w.row.key}`}
              x1={a.x}
              y1={a.y}
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
