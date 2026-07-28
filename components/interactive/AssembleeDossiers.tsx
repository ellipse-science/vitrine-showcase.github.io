"use client";

import { useState } from "react";
import type { AssembleeRow, DeputyRow } from "@/lib/data/assemblee";
import type { PartyKey } from "@/lib/data/parties";
import { facetResult } from "@/lib/data/assembleeInsights";

// Tableau d'enquête : une étagère de dossiers, un par parti actif. Ouvrir un
// dossier révèle la chemise du parti (toutes ses mesures) et une fiche
// satellite par député, reliée au dossier par un fil pointillé et
// dimensionnée selon sa contribution en mots au sein du parti. Cliquer une
// fiche dévoile le ton et la richesse lexicale du député. Les phrases de
// comparaison viennent de facetResult — même source que le jeu de billard.

function RichnessDots({ level }: { level: number }) {
  const dots = [];
  for (let i = 1; i <= 5; i++) {
    dots.push(i <= level ? <span key={i}>●</span> : <span key={i} className="empty">○</span>);
  }
  return <>{dots}</>;
}

function ToneGauge({ pct, title }: { pct: number; title?: string }) {
  // Rendu en <span> (display block via CSS) : le composant vit aussi à
  // l'intérieur de <button> (fiches de député), où un <div> serait du HTML
  // invalide (contenu de phrasé seulement).
  return (
    <span className="ass-tone" title={title}>
      <span className="ass-tone-dot" style={{ left: `${pct}%` }} />
    </span>
  );
}

// Palier de taille d'une fiche satellite, relatif au député le plus prolixe
// DU parti (chaque dossier a sa propre échelle, comme la barre d'enjeux).
function deputyTier(wordsRaw: number, maxWords: number): 1 | 2 | 3 {
  if (maxWords <= 0) return 1;
  const ratio = wordsRaw / maxWords;
  if (ratio >= 0.66) return 3;
  if (ratio >= 0.33) return 2;
  return 1;
}

function DeputyFiche({ deputy, color, tier, expanded, onToggle }: {
  deputy: DeputyRow;
  color: string;
  tier: 1 | 2 | 3;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`ass-fiche tier-${tier}`}
      style={{ ["--c" as string]: color }}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${deputy.name} · ${deputy.wordsFormatted} mots, voir le ton et la richesse lexicale`}
    >
      <span className="ass-fiche-pin" aria-hidden="true" />
      <span className="ass-fiche-name">{deputy.name}</span>
      <span className="ass-fiche-words">
        {deputy.wordsFormatted}
        <span className="unit" aria-hidden="true">mots</span>
      </span>
      {deputy.signatureWord && <span className="ass-fiche-sigword">« {deputy.signatureWord} »</span>}
      {expanded && (
        <span className="ass-fiche-more">
          <span className="stat-label">Ton en chambre</span>
          <ToneGauge pct={deputy.toneLeftPct} />
          <span className="stat-label">Richesse lexicale</span>
          <span className="ass-richness"><RichnessDots level={deputy.richnessLevel} /></span>
        </span>
      )}
    </button>
  );
}

function DossierCard({ row, allRows }: { row: AssembleeRow; allRows: AssembleeRow[] }) {
  const issue = facetResult(row, "issue", allRows);
  const tone = facetResult(row, "tone", allRows);
  const richness = facetResult(row, "richness", allRows);

  return (
    <div className="ass-dossier" style={{ ["--c" as string]: row.color }}>
      <div className="ass-dossier-tab">Dossier — {row.label}</div>
      <article className="ass-dossier-card">
        <span className="ass-card-figure">
          {row.wordsFormatted ?? "0"}
          <span className="unit" aria-hidden="true">mots</span>
        </span>

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

        {row.signatureWord && (
          <p className="ass-card-sigword">
            <span className="stat-label">Mot distinctif</span>
            <span className="ass-sigword-quote">« {row.signatureWord} »{row.signatureWordContext ? ` (${row.signatureWordContext})` : ""}</span>
          </p>
        )}
      </article>
    </div>
  );
}

function DossierBoard({ row, allRows }: { row: AssembleeRow; allRows: AssembleeRow[] }) {
  const [expandedDeputy, setExpandedDeputy] = useState<string | null>(null);
  const deputies = row.deputies ?? [];
  const maxWords = deputies.reduce((m, d) => Math.max(m, d.wordsRaw), 0);
  // Alternance gauche/droite (les députés arrivent triés par mots décroissants
  // du loader) : les plus prolixes se répartissent des deux côtés du dossier.
  const left = deputies.filter((_, i) => i % 2 === 0);
  const right = deputies.filter((_, i) => i % 2 === 1);

  const fiche = (d: DeputyRow) => (
    <DeputyFiche
      key={d.name}
      deputy={d}
      color={row.color}
      tier={deputyTier(d.wordsRaw, maxWords)}
      expanded={expandedDeputy === d.name}
      onToggle={() => setExpandedDeputy((cur) => (cur === d.name ? null : d.name))}
    />
  );

  return (
    <div className="ass-board">
      {left.length > 0 && <div className="ass-board-col left">{left.map(fiche)}</div>}
      <DossierCard row={row} allRows={allRows} />
      {right.length > 0 && <div className="ass-board-col right">{right.map(fiche)}</div>}
    </div>
  );
}

export function AssembleeDossiers({ rows, shadowRows }: { rows: AssembleeRow[]; shadowRows: AssembleeRow[] }) {
  const [openKey, setOpenKey] = useState<PartyKey | null>(rows[0]?.key ?? null);

  if (rows.length === 0) {
    return <p className="ass-empty">Aucune donnée disponible pour cette période.</p>;
  }

  const openRow = rows.find((r) => r.key === openKey);

  return (
    <div className="ass-dossiers">
      <div className="ass-shelf">
        {rows.map((row) => {
          const isOpen = row.key === openKey;
          return (
            <button
              key={row.key}
              type="button"
              className={`ass-folder${isOpen ? " active" : ""}`}
              style={{ ["--c" as string]: row.color }}
              onClick={() => setOpenKey(row.key)}
              aria-expanded={isOpen}
              aria-label={`${row.label} · ${row.wordsFormatted ?? "0"} mots, ${isOpen ? "dossier ouvert" : "ouvrir le dossier"}`}
            >
              <span className="ass-folder-tab">{row.label}</span>
              <span className="ass-folder-cover">
                <span className="ass-folder-words">
                  {row.wordsFormatted ?? "0"}
                  <span className="unit" aria-hidden="true">mots</span>
                </span>
                <span className="ass-folder-hint">{isOpen ? "Dossier ouvert" : "Ouvrir le dossier"}</span>
              </span>
            </button>
          );
        })}
      </div>

      {openRow && <DossierBoard key={openRow.key} row={openRow} allRows={rows} />}

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
