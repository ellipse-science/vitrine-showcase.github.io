"use client";

import { useState, useRef } from "react";
import type { PartiesData, RangeKey, RangeView, RowView, ChartView } from "@/lib/data/parties";
import { ELECTION_LABEL } from "@/lib/election";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { DoomGame } from "@/components/interactive/DoomGame";

const RANGES: RangeKey[] = ["today", "week", "overall"];

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
  return `${leader.label} domine la couverture (${leader.sovPct} %) : ${tone}`;
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
          <Countdown days={data.daysToElection} />
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

      <Podium rows={view.rows} onPcqTap={handlePcqTap} />

      <section className="partis-course">
        <Course chart={view.chart} headLabel={view.sparkHeadLabel} />

        <div className="course-legende">
          {visibleRows.map((row) => (
            <LegendeParti
              key={row.key}
              row={row}
              onPcqTap={row.key === "pcq" ? handlePcqTap : undefined}
            />
          ))}
        </div>

        {shadowRows.length > 0 && (
          <div className="course-ombre">
            <span className="course-ombre-label">
              Dans l'ombre médiatique
              <InfoTip size="sm" label="Ombre médiatique">
                Ces partis obtiennent moins de 2&nbsp;% de la part de voix médiatique sur la période
                sélectionnée. Leur présence dans les médias est trop faible pour être significative.
              </InfoTip>
            </span>
            {shadowRows.map((row) => (
              <LegendeParti
                key={row.key}
                row={row}
                shadow
                onPcqTap={row.key === "pcq" ? handlePcqTap : undefined}
              />
            ))}
          </div>
        )}
      </section>

      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

const RANGS = ["1er", "2e", "3e"];

/**
 * Le podium — qui mène, d'un coup d'œil.
 *
 * Il suit l'onglet sélectionné plutôt que d'être figé sur la journée : un
 * podium qui annoncerait un classement pendant que la courbe juste en dessous
 * en montre un autre serait la même incohérence que celle déjà corrigée entre
 * la légende et le bout de courbe.
 *
 * Hauteur des marches : PROPORTIONNELLE à la part de voix, la première
 * remplissant le bloc. Les rapports entre marches restent donc exacts (une
 * marche deux fois plus haute vaut deux fois plus), et la base est à zéro —
 * c'est une mise à l'échelle, pas une déformation.
 *
 * Ordre du DOM : 1er, 2e, 3e — c'est celui qu'entend un lecteur d'écran. Le CSS
 * les réarrange en 2-1-3 pour la lecture visuelle, sans toucher au balisage.
 */
function Podium({ rows, onPcqTap }: { rows: RowView[]; onPcqTap: () => void }) {
  const podium = rows.slice(0, 3);
  const reste = rows.slice(3);
  const tete = podium[0]?.sovPct ?? 0;

  // Aucune couverture mesurée : un podium de marches nulles serait absurde, et
  // surtout il donnerait l'apparence d'un résultat là où il n'y a pas de donnée.
  if (tete <= 0) {
    return (
      <p className="podium-vide">
        Aucune couverture mesurée sur cette période — pas de classement à afficher.
      </p>
    );
  }

  return (
    <section className="podium" aria-label="Classement de la couverture médiatique">
      <ol className="podium-marches">
        {podium.map((row, i) => (
          <li
            key={row.key}
            className={`podium-marche rang-${i + 1}${row.inShadow ? " shadow" : ""}`}
            style={{ ["--h" as string]: `${Math.max(8, (row.sovPct / tete) * 100)}%` }}
          >
            <div className="podium-bloc" style={{ ["--party" as string]: row.color }}>
              <span className="podium-parti">{row.label}</span>
              <span className="podium-pct">{row.sovPct}&nbsp;%</span>
            </div>
            <span className="podium-rang">{RANGS[i]}</span>
            <span
              className={`tone-streak tone-streak--${row.toneDirection}`}
              title={row.toneTitle}
            >
              {row.toneLabel}
            </span>
          </li>
        ))}
      </ol>

      {reste.length > 0 && (
        <p className="podium-reste">
          <span className="podium-reste-label">Hors podium</span>
          {reste.map((row) => (
            <span key={row.key} className={`podium-reste-item${row.inShadow ? " shadow" : ""}`}>
              <i className="podium-puce" style={{ background: row.color }} aria-hidden="true" />
              <span
                onClick={row.key === "pcq" ? onPcqTap : undefined}
                style={row.key === "pcq" ? { cursor: "pointer", userSelect: "none" } : undefined}
                title={row.key === "pcq" ? "PCQ (Touchez 3 fois pour une surprise !)" : undefined}
              >
                {row.label}
              </span>{" "}
              {row.sovPct}&nbsp;%
              {row.inShadow && <em>dans l&apos;ombre</em>}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/** « J-53 avant le scrutin ». Le jour même, puis après, le libellé change —
 *  un « J-0 » ou un compte négatif ne veut rien dire pour un lecteur. */
function Countdown({ days }: { days: number }) {
  if (days < 0) return null;
  const label = days === 0 ? "Scrutin aujourd'hui" : `J-${days} avant le scrutin`;
  return (
    <span className="partis-countdown" title={`Élections générales québécoises — ${ELECTION_LABEL}`}>
      {label}
    </span>
  );
}

/**
 * La course : toutes les lignes sur une seule échelle verticale.
 *
 * Le SVG ne porte QUE la géométrie (grille + lignes), étiré en largeur via
 * preserveAspectRatio="none" — c'est pourquoi les traits portent
 * vectorEffect="non-scaling-stroke", sans quoi l'étirement les épaissirait.
 * Tout le texte est en HTML positionné par-dessus : dans un SVG étiré, il
 * serait déformé.
 */
function Course({ chart, headLabel }: { chart: ChartView; headLabel: string }) {
  if (chart.tooShort) {
    return (
      <p className="course-vide">
        Une seule journée de données disponible — pas encore de quoi tracer une évolution.
      </p>
    );
  }

  const pct = (v: number, max: number) => `${(v / max) * 100}%`;

  return (
    <figure className="course-figure">
      <figcaption className="course-tete">
        {headLabel}
        <span className="course-echelle" aria-hidden="true">
          <i className="course-echelle-barre" />
          du silence à la saturation
        </span>
      </figcaption>

      <div className="course-cadre">
        <svg
          className="course-svg"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {chart.gridLines.map((g) => (
            <line
              key={g.pct}
              x1="0"
              x2={chart.width}
              y1={g.y}
              y2={g.y}
              className={g.pct === 0 ? "course-axe" : "course-grille"}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {chart.series.map((s) => (
            <polyline
              key={s.key}
              points={s.polyline}
              fill="none"
              stroke={s.color}
              strokeWidth={s.inShadow ? 1 : 1.6}
              strokeDasharray={s.inShadow ? "2 2" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={s.inShadow ? 0.5 : 1}
            />
          ))}

          {chart.election && (
            <line
              x1={chart.election.x}
              x2={chart.election.x}
              y1="0"
              y2={chart.height}
              className="course-scrutin"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {chart.election && (
          <span className="course-scrutin-label" style={{ left: pct(chart.election.x, chart.width) }}>
            Scrutin
            <b>{chart.election.label}</b>
          </span>
        )}

        {/* Le point terminal est en HTML, pas en SVG : dans un viewBox étiré en
            largeur, un <circle> devient une ellipse démesurée. Il marque la
            donnée exacte (lastY), là où l'étiquette peut avoir été déplacée. */}
        {chart.series.map((s) => (
          <i
            key={s.key}
            className={`course-point${s.inShadow ? " shadow" : ""}`}
            style={{ top: pct(s.lastY, chart.height), left: pct(s.lastX, chart.width), background: s.color }}
            aria-hidden="true"
          />
        ))}

        {chart.gridLines.map((g) => (
          <span key={g.pct} className="course-y-label" style={{ top: pct(g.y, chart.height) }}>
            {g.pct} %
          </span>
        ))}

        {chart.series.map((s) => (
          <span
            key={s.key}
            className={`course-bout${s.inShadow ? " shadow" : ""}`}
            style={{ top: pct(s.labelY, chart.height), left: pct(s.lastX, chart.width), color: s.color }}
          >
            {s.label} <b>{s.lastPct}&nbsp;%</b>
          </span>
        ))}
      </div>

      <div className="course-x">
        {chart.xLabels.map((l) => (
          <span key={l.label} style={{ left: pct(l.x, chart.width) }}>
            {l.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Une entrée de légende : pastille de couleur, parti, part de voix, ton. */
function LegendeParti({
  row,
  shadow,
  onPcqTap,
}: {
  row: RowView;
  shadow?: boolean;
  onPcqTap?: () => void;
}) {
  const isPcq = row.key === "pcq";
  return (
    <span className={`course-legende-item${shadow ? " shadow" : ""}`}>
      <i className="course-puce" style={{ background: row.color }} aria-hidden="true" />
      <span
        className={`course-parti ${row.key}`}
        onClick={isPcq ? onPcqTap : undefined}
        style={isPcq ? { cursor: "pointer", userSelect: "none" } : undefined}
        title={isPcq ? "PCQ (Touchez 3 fois pour une surprise !)" : undefined}
      >
        {row.label}
      </span>
      <span className="course-pct" title={row.barTitle}>
        {row.sovPct}&nbsp;%
      </span>
      <span className={`tone-streak tone-streak--${row.toneDirection}`} title={row.toneTitle}>
        {row.toneLabel}
      </span>
    </span>
  );
}
