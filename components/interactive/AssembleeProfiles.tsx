import type { AssembleeRow, DeputyRow } from "@/lib/data/assemblee";
import { facetResult } from "@/lib/data/assembleeInsights";

// Vue principale de « Que dit-on à l'Assemblée ? » : une fiche éditoriale par
// parti, pas un tableau. Chaque mesure garde son propre canal visuel (barre
// d'enjeux, jauge de ton, points de richesse) plutôt que d'être compressée
// dans une forme abstraite unique — la tentative précédente (nuage de points
// ton × richesse) avait été abandonnée pour cette raison précise (cf.
// AssembleeBilliard.tsx). Les phrases de comparaison viennent de la même
// fonction (facetResult) que les poches du jeu de billard : les deux vues
// racontent exactement la même chose, seulement mises en forme différemment.

function RichnessDots({ level }: { level: number }) {
  const dots = [];
  for (let i = 1; i <= 5; i++) {
    dots.push(
      i <= level
        ? <span key={i}>●</span>
        : <span key={i} className="empty">○</span>,
    );
  }
  return <>{dots}</>;
}

// Cartes satellites : chaque député pend d'un fil pointillé sous le dossier
// du parti, comme les pièces à conviction d'un tableau d'enquête. La taille
// de la carte (petite/moyenne/grande) suit son poids relatif en mots au sein
// du parti — pas de comparaison inter-partis, chaque dossier a sa propre
// échelle (même logique que la barre d'enjeux).
function DeputyCard({ deputy, color }: { deputy: DeputyRow; color: string }) {
  return (
    <div className={`ass-deputy-card size-${deputy.sizeLevel}`} style={{ ["--c" as string]: color }}>
      <span className="ass-deputy-name">{deputy.name}</span>
      <span className="ass-deputy-words">
        {deputy.wordsFormatted}
        <span className="unit" aria-hidden="true">mots</span>
      </span>
      <span className="ass-deputy-richness"><RichnessDots level={deputy.richnessLevel} /></span>
      {deputy.signatureWord && (
        <p className="ass-deputy-sigword">« {deputy.signatureWord} »</p>
      )}
    </div>
  );
}

function DeputyBoard({ deputies, color }: { deputies: DeputyRow[]; color: string }) {
  if (deputies.length === 0) return null;
  return (
    <div className="ass-card-block ass-deputies">
      <span className="stat-label">Par député</span>
      <div className="ass-deputies-rail">
        {deputies.map((d) => (
          <DeputyCard key={d.name} deputy={d} color={color} />
        ))}
      </div>
    </div>
  );
}

function PartyCard({ row, allRows }: { row: AssembleeRow; allRows: AssembleeRow[] }) {
  const issue = facetResult(row, "issue", allRows);
  const tone = facetResult(row, "tone", allRows);
  const richness = facetResult(row, "richness", allRows);

  return (
    <article className="ass-card" style={{ ["--c" as string]: row.color }}>
      <div className="ass-card-head">
        <span className={`parti-name-box ${row.key}`}>{row.label}</span>
        <span
          className="ass-card-figure"
          title={`${row.wordsFormatted ?? "0"} mots prononcés cette période`}
          aria-label={`${row.wordsFormatted ?? "0"} mots prononcés cette période`}
        >
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
          <div className="ass-tone" title={tone.body}>
            <div className="ass-tone-dot" style={{ left: `${row.toneLeftPct ?? 50}%` }} />
          </div>
          <p className="ass-card-caption">{tone.body}</p>
        </div>
        <div className="ass-card-block">
          <span className="stat-label">Richesse lexicale</span>
          <span className="ass-richness"><RichnessDots level={row.richnessLevel || 1} /></span>
          <p className="ass-card-caption">{richness.body}</p>
        </div>
      </div>

      {row.signatureWord && (
        <div className="ass-sigtag-wrap">
          <p className="ass-card-sigword ass-sigtag">
            <span className="stat-label">Mot distinctif</span>
            « {row.signatureWord} »{row.signatureWordContext ? ` (${row.signatureWordContext})` : ""}
          </p>
        </div>
      )}

      {row.deputies && <DeputyBoard deputies={row.deputies} color={row.color} />}
    </article>
  );
}

export function AssembleeProfiles({ rows, shadowRows }: { rows: AssembleeRow[]; shadowRows: AssembleeRow[] }) {
  return (
    <div className="ass-profiles">
      {rows.map((row) => (
        <PartyCard key={row.key} row={row} allRows={rows} />
      ))}

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
