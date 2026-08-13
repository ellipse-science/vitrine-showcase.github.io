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

      <Podium rows={view.rows} refLabel={view.refLabel} onPcqTap={handlePcqTap} />

      <section className="partis-course">
        <Course chart={data.chart} headLabel="La course jusqu'au scrutin, jour par jour" />
      </section>

      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

const RANGS = ["1er", "2e", "3e", "4e", "5e"];

/**
 * Position visuelle d'une marche, pour que le vainqueur soit AU CENTRE.
 *
 * Les rangs pairs vont à gauche en s'éloignant, les impairs à droite : avec
 * cinq partis, l'ordre lu est 4-2-1-3-5. Le HTML, lui, reste dans l'ordre du
 * classement (1er, 2e, 3e…) — c'est celui qu'énonce un lecteur d'écran, et
 * seul `order` déplace les blocs.
 */
function positionVisuelle(rang: number, total: number): number {
  if (rang === 1) return 0;
  return rang % 2 === 0 ? -Math.ceil(rang / 2) : Math.ceil((rang - 1) / 2) + total;
}

/**
 * Le podium — la pièce maîtresse du module.
 *
 * Il montre la MOYENNE de la période choisie (jour, semaine, ou toute la
 * fenêtre), pas la dernière valeur. Aucun pourcentage n'est écrit : la hauteur
 * des marches porte l'information, et deux chiffres différents entre le podium
 * et la courbe — qui montre le dernier jour — n'auraient pas pu s'expliquer.
 *
 * Tous les partis y montent, SAUF ceux dans l'ombre médiatique (moins de 2 %
 * de part de voix), qui sont posés à part, en dessous : leur place n'est pas
 * une dernière marche, c'est le hors-jeu.
 */
function Podium({
  rows,
  refLabel,
  onPcqTap,
}: {
  rows: RowView[];
  refLabel: string;
  onPcqTap: () => void;
}) {
  const surPodium = rows.filter((r) => !r.inShadow);
  const dansLOmbre = rows.filter((r) => r.inShadow);
  const tete = surPodium[0];

  if (!tete || tete.sovPct <= 0) {
    return (
      <p className="podium-vide">
        Aucune couverture mesurée sur cette période — pas de classement à afficher.
      </p>
    );
  }

  return (
    <section className="podium" aria-label="Classement de la couverture médiatique">
      <p className="podium-chapo">{refLabel}</p>

      <ol className="podium-marches" style={{ ["--n" as string]: surPodium.length }}>
        {surPodium.map((row, i) => (
          <li
            key={row.key}
            className={`podium-marche${i === 0 ? " tete" : ""}`}
            style={{
              ["--h" as string]: `${Math.max(9, (row.sovPct / tete.sovPct) * 100)}%`,
              ["--ordre" as string]: positionVisuelle(i + 1, surPodium.length),
              ["--party" as string]: row.color,
            }}
          >
            <div className="podium-bloc">
              <span
                className="podium-parti"
                onClick={row.key === "pcq" ? onPcqTap : undefined}
                style={row.key === "pcq" ? { cursor: "pointer", userSelect: "none" } : undefined}
                title={row.key === "pcq" ? "PCQ (Touchez 3 fois pour une surprise !)" : undefined}
              >
                {row.label}
              </span>
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

      <VictoireDouteuse tete={tete} />

      {dansLOmbre.length > 0 && (
        <p className="podium-ombre">
          <span className="podium-ombre-label">
            Dans l&apos;ombre médiatique
            <InfoTip size="sm" label="Ombre médiatique">
              Moins de 2&nbsp;% de la part de voix sur la période. Trop peu pour qu&apos;on puisse
              parler d&apos;une présence médiatique — ces partis ne montent donc pas sur le podium.
            </InfoTip>
          </span>
          {dansLOmbre.map((row) => (
            <span key={row.key} className="podium-ombre-item">
              <i className="podium-puce" style={{ background: row.color }} aria-hidden="true" />
              <span
                onClick={row.key === "pcq" ? onPcqTap : undefined}
                style={row.key === "pcq" ? { cursor: "pointer", userSelect: "none" } : undefined}
                title={row.key === "pcq" ? "PCQ (Touchez 3 fois pour une surprise !)" : undefined}
              >
                {row.label}
              </span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/**
 * Le vainqueur a-t-il vraiment gagné ?
 *
 * Quand le parti le plus couvert l'est en mal, la première marche devient
 * ambiguë. On ne tranche pas — personne ne peut trancher — mais on pose la
 * question, parce que la taire ferait lire le podium comme un palmarès.
 */
function VictoireDouteuse({ tete }: { tete: RowView }) {
  if (tete.toneDirection !== "negative") return null;
  return (
    <p className="podium-doute">
      <span className="podium-doute-marque" aria-hidden="true">
        ?
      </span>
      <span>
        <b>{tete.label}</b>{" "}
        occupe le plus de place — mais on en parle en mal. Première marche, ou mauvaise
        passe&nbsp;?
        <InfoTip size="sm" label="Gagner ou perdre ?">
          Le podium classe le VOLUME de couverture, pas sa faveur. Un parti peut dominer parce
          qu&apos;on le critique. L&apos;adage veut qu&apos;il n&apos;y ait pas de mauvaise
          publicité — cette page ne prétend pas savoir s&apos;il a raison.
        </InfoTip>
      </span>
    </p>
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

  // Le dégradé est ancré sur des PARTS DE VOIX ABSOLUES, pas sur la hauteur du
  // cadre : l'axe étant tronqué au maximum observé, se caler dessus ferait
  // désigner à la même bande de couleur 40 % un jour et 25 % le lendemain.
  // Ici, 30 % de couverture donne toujours exactement la même teinte.
  const arret = (sovPct: number) => `${Math.min(100, (sovPct / chart.topPct) * 100)}%`;
  const fond = [
    `transparent 0%`,
    `color-mix(in srgb, var(--amber) 7%, transparent) ${arret(12)}`,
    `color-mix(in srgb, var(--amber) 15%, transparent) ${arret(28)}`,
    `color-mix(in srgb, var(--red) 22%, transparent) ${arret(50)}`,
  ].join(", ");

  return (
    <figure className="course-figure">
      <figcaption className="course-tete">
        {headLabel}
        <span className="course-echelle" aria-hidden="true">
          <i className="course-echelle-barre" />
          du silence à la saturation
        </span>
      </figcaption>

      <div className="course-cadre" style={{ ["--fond-db" as string]: `linear-gradient(to top, ${fond})` }}>
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

