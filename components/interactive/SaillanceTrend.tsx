"use client";

import { useState } from "react";
import type { SalienceTrend } from "@/lib/data/headlineEvents";

// Trajectoire de saillance sous le badge (#274) : flèche de tendance, libellé en
// clair (+ ampleur chiffrée depuis #304), puis mini-courbe des 6 derniers blocs.
// Chaque point est survolable (tap sur mobile) et révèle le NIVEAU qu'affichait
// la nouvelle à ce bloc — le badge, lui, reste au pic 24 h. La trajectoire est
// TOUJOURS rendue, y compris « stable » (elle ne l'était pas avant #304) ; seul
// le chiffre d'ampleur s'efface à l'état stable.
// Boîte volontairement basse : une sparkline trop haute lit « en dessous » du
// texte (sa masse — les blocs au plancher — s'enfonce sous la ligne de base).
// Compacte, elle s'aligne optiquement avec le libellé.
const W = 124, H = 24, PADX = 5, PADY = 4;

// Diamètre d'un point = PALIER DE SAILLANCE de ce bloc (demande Adrien) : la
// courbe dit la part d'attention par sa hauteur, la grosseur dit à quel niveau
// la nouvelle se trouvait. Écart volontairement marqué — 1,9 px à 4,8 px entre
// « Très faible » et « Exceptionnelle » — pour que la différence se voie à cette
// échelle. Un bloc sans Une garde un petit anneau creux, lisible mais discret.
// Les repères sommet / maintenant passent par la COULEUR (cf. CSS), pas par la
// taille, pour que le diamètre n'encode qu'une seule chose.
function rayon(p: { rank: number; isAbsent: boolean }, survol: boolean) {
  const base = p.isAbsent ? 2 : 1.9 + (Math.max(1, p.rank) - 1) * 0.58;
  return Number((survol ? base + 1.8 : base).toFixed(2));
}

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
  // La courbe trace la PART D'ATTENTION, pas le score (essai #304) : une seule
  // grandeur dans toute la boîte — courbe, flèche et chiffre disent la même chose.
  const max = Math.max(1, ...pts.map((p) => p.share));
  const xs = (i: number) => PADX + i * ((W - 2 * PADX) / Math.max(1, pts.length - 1));
  const ys = (v: number) => H - PADY - (v / max) * (H - 2 * PADY);
  const line = pts.map((p, i) => `${xs(i).toFixed(1)},${ys(p.share).toFixed(1)}`).join(" ");

  const active = hover !== null ? pts[hover] : null;

  // Les nombres vivent maintenant DANS la phrase (part actuelle + part au
  // sommet), pas dans une parenthèse séparée : « −40 % » était ambigu (points
  // de part ou chute relative?). Deux valeurs nommées ne peuvent pas se lire de
  // travers.

  // ORDRE : courbe → flèche → libellé (+ ampleur entre parenthèses). La courbe
  // vient en TÊTE, donc ANCRÉE (sa position ne dépend pas du texte ; les
  // trajectoires de plusieurs Unes s'alignent verticalement). La flèche garde sa
  // place devant le libellé ; le chiffre d'ampleur suit le libellé, entre
  // parenthèses (demande Yannick #304, placement ajusté avec Adrien).
  // <span> et non <div> : la trajectoire vit maintenant DANS la bande de
  // saillance, elle-même un <span> (un div y serait un imbriquement invalide).
  return (
    <span className={`saillance-trend trend-${trend.dir}`}>
      <span className="trend-spark-wrap">
        <svg className="trend-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          role="img" aria-label={`Part de l’attention médiatique sur 24 heures : ${trend.capLabel.toLowerCase()}`}>
          <polyline points={line} fill="none" className="trend-line" strokeWidth="1.9" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle
              key={i}
              className={`trend-pt${p.isAbsent ? " is-absent" : ""}${p.isPeak ? " is-peak" : ""}${p.isNow ? " is-now" : ""}${i === hover ? " is-hover" : ""}`}
              cx={xs(i).toFixed(1)} cy={ys(p.share).toFixed(1)}
              r={rayon(p, i === hover)}
              tabIndex={0}
              role="img"
              aria-label={p.isAbsent
                ? `${p.timeLabel} : hors du radar`
                : `${p.timeLabel} : saillance ${p.level}, ${p.share} % de l’attention`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
            />
          ))}
        </svg>
      </span>
      {/* Flèche et libellé dans le MÊME bloc de retour à la ligne : en mobile, la
          phrase passe sous la courbe, et une flèche laissée seule au bout de la
          première ligne se lit comme un défaut d'affichage. */}
      <span className="trend-say"><Arrow dir={trend.dir} />
      {/* Le libellé fait double emploi : tendance + ampleur au repos, lecture du
          bloc pointé au survol. Au survol on donne la PART du bloc pointé — plus
          le niveau (« Très faible »), qui parlait l'échelle du badge et créait la
          contradiction relevée par Laurence-Olivier. L'ampleur ne s'affiche QUE
          si ça bouge — stable = « Stable » seul, sans chiffre. */}
      <span className="trend-cap" aria-live="polite">
        {active
          ? (active.isAbsent
            ? <>{active.timeLabel} · <b>hors du radar</b></>
            // Le NIVEAU que la nouvelle affichait à ce bloc (demande Adrien, #274),
            // puis la part qui explique la hauteur du point sur la courbe.
            : <>{active.timeLabel} · <b>{active.level}</b> · {active.share}&nbsp;% de l’attention</>)
          : trend.capLabel}
      </span>
      </span>
    </span>
  );
}
