"use client";

import { useState } from "react";
import type { SalienceTrend } from "@/lib/data/headlineEvents";

// Trajectoire de saillance sous le badge (#274) : flèche de tendance, libellé en
// clair, puis mini-courbe des 6 derniers blocs. Chaque point est survolable (tap
// sur mobile) et révèle le NIVEAU qu'affichait la nouvelle à ce bloc — le badge,
// lui, reste au pic 24 h. Rien n'est rendu si la tendance est « stable ».
// Boîte volontairement basse : une sparkline trop haute lit « en dessous » du
// texte (sa masse — les blocs au plancher — s'enfonce sous la ligne de base).
// Compacte, elle s'aligne optiquement avec le libellé.
const W = 124, H = 24, PADX = 5, PADY = 4;

// Symbole de tendance — chemin SVG, coloré par la classe parente : flèche ↘
// (baisse) / ↗ (hausse) / « = » (stable, deux traits parallèles).
function Arrow({ dir }: { dir: SalienceTrend["dir"] }) {
  const d = dir === "down" ? "M3,3 L14,14 M14,14 L14,7.5 M14,14 L7.5,14"
    : dir === "up" ? "M3,14 L14,3 M14,3 L7.5,3 M14,3 L14,9.5"
    : "M3,6.3 L14,6.3 M3,10.7 L14,10.7";
  return (
    <svg className="trend-arrow" width="17" height="17" viewBox="0 0 17 17" aria-hidden="true"
      fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function SaillanceTrend({ trend }: { trend: SalienceTrend }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = trend.points;
  const max = Math.max(1, ...pts.map((p) => p.score));
  const xs = (i: number) => PADX + i * ((W - 2 * PADX) / Math.max(1, pts.length - 1));
  const ys = (v: number) => H - PADY - (v / max) * (H - 2 * PADY);
  const line = pts.map((p, i) => `${xs(i).toFixed(1)},${ys(p.score).toFixed(1)}`).join(" ");

  const active = hover !== null ? pts[hover] : null;

  // Ampleur chiffrée UNIQUEMENT quand ça bouge : baisse « −X », hausse « +X ».
  // Stable → aucun chiffre (le symbole = et le mot « Stable » suffisent ; un
  // « 0 % » serait redondant et se confondrait avec un niveau — décision Adrien #304).
  const pctText = `${trend.dir === "up" ? "+" : "−"}${Math.abs(trend.deltaPct)}`;

  // ORDRE : courbe → flèche → libellé (+ ampleur entre parenthèses). La courbe
  // vient en TÊTE, donc ANCRÉE (sa position ne dépend pas du texte ; les
  // trajectoires de plusieurs Unes s'alignent verticalement). La flèche garde sa
  // place devant le libellé ; le chiffre d'ampleur suit le libellé, entre
  // parenthèses (demande Yannick #304, placement ajusté avec Adrien).
  return (
    <div className={`saillance-trend trend-${trend.dir}`}>
      <span className="trend-spark-wrap">
        <svg className="trend-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          role="img" aria-label={`Trajectoire de la saillance sur 24 heures : ${trend.capLabel.toLowerCase()}`}>
          <polyline points={line} fill="none" className="trend-line" strokeWidth="1.9" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle
              key={i}
              className={`trend-pt${p.isAbsent ? " is-absent" : ""}${p.isPeak ? " is-peak" : ""}${p.isNow ? " is-now" : ""}${i === hover ? " is-hover" : ""}`}
              cx={xs(i).toFixed(1)} cy={ys(p.score).toFixed(1)}
              r={i === hover ? 5 : p.isPeak || p.isNow ? 3.4 : 2.4}
              tabIndex={0}
              role="img"
              aria-label={`${p.timeLabel} : ${p.level}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </svg>
      </span>
      <Arrow dir={trend.dir} />
      {/* Le libellé fait double emploi : tendance + ampleur au repos, lecture du
          bloc pointé au survol. L'ampleur (variation de la part d'attention depuis
          le bloc précédent) ne s'affiche QUE si ça bouge — stable = « Stable »
          seul, sans chiffre. Elle s'efface aussi au survol (décrit la tendance
          globale, pas le bloc pointé). */}
      <span className="trend-cap" aria-live="polite">
        {active
          ? <>{active.timeLabel} · <b>{active.level}</b></>
          : <>{trend.capLabel}{trend.dir !== "flat" && <> (<b className="trend-pct">{pctText}&nbsp;%</b>)</>}</>}
      </span>
    </div>
  );
}
