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

// Flèche directionnelle (↘ / ↗) — un chemin SVG, colorée par la classe parente.
function Arrow({ dir }: { dir: SalienceTrend["dir"] }) {
  const d = dir === "down" ? "M3,3 L14,14 M14,14 L14,7.5 M14,14 L7.5,14"
    : dir === "up" ? "M3,14 L14,3 M14,3 L7.5,3 M14,3 L14,9.5"
    : "M3,8.5 L14,8.5 M14,8.5 L9.5,4.5 M14,8.5 L9.5,12.5";
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

  // Tendance « stable » : rien à raconter, on n'affiche pas la ligne (garde le
  // hero épuré ; la trajectoire ne sert qu'à signaler un déclin ou une montée).
  if (trend.dir === "flat") return null;

  // Réserve juste assez de largeur pour le PLUS LONG texte que CE libellé
  // affichera (tendance au repos OU lecture d'un bloc au survol) : la courbe
  // reste collée au texte sans trou, et ne se décale pas au survol. Calculé par
  // ligne (≠ largeur fixe globale, qui gonflait l'espace pour les libellés courts).
  const capCh = Math.max(
    trend.capLabel.length,
    ...pts.map((p) => `${p.timeLabel} · ${p.level}`.length),
  );

  return (
    <div className={`saillance-trend trend-${trend.dir}`}>
      <Arrow dir={trend.dir} />
      <span className="trend-cap" aria-live="polite" style={{ minWidth: `${capCh}ch` }}>
        {active
          ? <>{active.timeLabel} · <b>{active.level}</b></>
          : trend.capLabel}
      </span>
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
    </div>
  );
}
