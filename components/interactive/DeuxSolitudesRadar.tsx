"use client";

import React, { useState } from "react";

import type { SolitudeData } from "@/lib/data/headlineEvents";

// Radar « Deux solitudes » : axes = événements saillants du bloc, deux
// polygones QC (bleu) / CAN (rouge). Composant CLIENT car l'infobulle des
// points suit le curseur (état React). Toute la géométrie est déterministe :
// aucune donnée n'est chargée ici, elle arrive en props depuis le server
// component DeuxSolitudesSection.

const W = 640, H = 470, CX = W / 2, CY = H / 2, R = 150, R0 = 6;

// Secteur du balayage radar (~48°, en tête vers le haut). Géométrie statique ;
// la rotation est en CSS.
const SWEEP = (() => {
  const a1 = -Math.PI / 2;
  const a2 = a1 + (Math.PI * 48) / 180;
  const x1 = CX + R * Math.cos(a1), y1 = CY + R * Math.sin(a1);
  const x2 = CX + R * Math.cos(a2), y2 = CY + R * Math.sin(a2);
  return {
    x1: +x1.toFixed(1), y1: +y1.toFixed(1), x2: +x2.toFixed(1), y2: +y2.toFixed(1),
    d: `M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`,
  };
})();

// Fleur-de-lys inline (fill = couleur QC), même tracé que public/images/
// fleur-de-lys.svg — inline pour la teinter sans bundler l'asset en CSS.
const FLEUR_D = "M297.69,147.804c-47.642-5.459-97.763,27.791-107.192,94.289c-0.329,2.318-0.605,4.685-0.824,7.076h-2.81c4.056-45.102,22.727-76.399,33.905-97.214c14.49-26.98,2.729-53.559-2.997-65.452C211.276,73.013,181.848,18.486,174.354,0c-7.494,18.486-36.702,73.013-43.198,86.503c-5.728,11.893-17.488,38.472-2.998,65.452c11.103,20.673,29.87,52.316,34.226,97.214h-3.208c-0.219-2.392-0.495-4.758-0.824-7.076c-9.43-66.499-59.551-99.748-107.192-94.289c-53.284,6.105-81.882,90.319,0.496,110.666c-13.399-24.813,7.443-69.477,55.583-44.167c15.656,8.232,26.561,21.383,31.072,34.866h-8.065c-7.608,0-13.776,4.469-13.776,9.983c0,5.514,6.168,9.983,13.776,9.983h9.817c-0.803,4.348-2.456,8.464-5.034,12.162c-11.416,16.377-49.649,7.444-28.31-28.286c-36.065-4.747-45.649,29.279-35.228,47.641c11.453,23.411,61.479,30.428,80.41-2.978c4.54-8.012,6.819-18.047,7.555-28.539h3.864c-0.033,7.932-0.53,16.224-1.59,24.887c-12.647,8.146-7.717,25.725-23.735,36.234c10.062,0.265,18.271-1.708,20.92-5.415c0,10.75,9.617,19.812,15.886,32.858c5.824-13.119,15.208-24.094,15.208-32.858c2.648,3.707,10.857,5.68,20.92,5.415c-14.687-9.01-8.898-25.516-23.261-37.306c-1.015-8.293-1.508-16.22-1.589-23.815h3.312c0.735,10.492,3.016,20.527,7.555,28.539c18.931,33.405,68.957,26.389,80.41,2.978c10.422-18.361,0.838-52.388-35.228-47.641c21.34,35.73-16.894,44.663-28.31,28.286c-2.577-3.698-4.23-7.814-5.033-12.162h10.572c7.608,0,13.776-4.47,13.776-9.983c0-5.515-6.168-9.983-13.776-9.983h-8.821c4.512-13.483,15.416-26.634,31.072-34.866c48.14-25.31,68.982,19.354,55.583,44.167C379.573,238.124,350.974,153.91,297.69,147.804z";
function Fleur() {
  return (
    <svg viewBox="-0.864 -0.333 350 359" aria-hidden focusable="false">
      <path d={FLEUR_D} fill="var(--bleu)" />
    </svg>
  );
}

// Coupe un libellé long en 2 lignes au séparateur le plus proche du milieu.
function wrapLabel(s: string): string[] {
  if (s.length <= 19) return [s];
  const mid = Math.floor(s.length / 2);
  let best = -1;
  for (let j = 0; j < s.length; j++) {
    if (s[j] === " " && (best < 0 || Math.abs(j - mid) < Math.abs(best - mid))) best = j;
  }
  return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
}

type Tip = { x: number; y: number; side: "qc" | "can"; k: string; body: string };

export function DeuxSolitudesRadar({ solitudes: s }: { solitudes: SolitudeData }) {
  const [tip, setTip] = useState<Tip | null>(null);

  const axes = s.axes;
  const n = Math.max(axes.length, 1);
  const vals = axes.map((a) => ({ vqc: a.qcRadial, vcan: a.canRadial }));
  const maxVal = Math.max(...vals.flatMap((v) => [v.vqc, v.vcan]), 1);

  const pt = (i: number, v: number): [number, number] => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = R0 + (v / 100) * (R - R0);
    return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)];
  };
  const ringPts = (f: number) =>
    axes.map((_, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const r = R0 + f * (R - R0);
      return `${(CX + r * Math.cos(ang)).toFixed(1)},${(CY + r * Math.sin(ang)).toFixed(1)}`;
    }).join(" ");
  const polyPts = (key: "vqc" | "vcan") =>
    vals.map((v, i) => pt(i, v[key]).map((c) => c.toFixed(1)).join(",")).join(" ");

  const place = (e: React.MouseEvent, side: "qc" | "can", k: string, body: string) =>
    setTip({ x: e.clientX, y: e.clientY, side, k, body });
  // Focus clavier : positionne l'infobulle sur le point lui-même.
  const placeAtRect = (el: SVGGElement, side: "qc" | "can", k: string, body: string) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top + r.height / 2, side, k, body });
  };

  const [qp, rp] = [s.qcSymbolPos, s.canSymbolPos];
  const diverge = s.convPct < 50;

  return (
    <div className="sol-body">
      {/* Axe fleur/érable : les symboles se rapprochent quand ça converge, les
          flèches montrent le mouvement */}
      <div className="sol-viz">
        <div className="sol-axis" />
        <span className={`sol-arrow qc ${diverge ? "dL" : "dR"}`} style={{ left: `calc(${qp}% - 54px)` }} aria-hidden>
          {diverge ? "←" : "→"}
        </span>
        <span className={`sol-arrow can ${diverge ? "dR" : "dL"}`} style={{ left: `calc(${rp}% + 54px)` }} aria-hidden>
          {diverge ? "→" : "←"}
        </span>
        <div className="sol-symbol qc" style={{ left: `${qp}%` }}>
          <span className="glyph fleur" aria-label="Québec"><Fleur /></span>
          <span className="caption">Québec</span>
        </div>
        <div className="sol-symbol roc" style={{ left: `${rp}%` }}>
          <span className="glyph maple" aria-label="Canada">🍁</span>
          <span className="caption">Canada</span>
        </div>
      </div>

      {/* Radar */}
      <div className="sol-radar">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Saillance de chaque événement au Québec et au Canada, en percentile de sa région">
          <circle className="radar-halo" cx={CX} cy={CY} r={R + 10} />
          {/* Balayage radar discret (clin d'œil radarplus.org) : un secteur
              qui tourne lentement, dégradé bleu très léger, sous la grille. */}
          <defs>
            <linearGradient id="solSweep" gradientUnits="userSpaceOnUse"
              x1={SWEEP.x1} y1={SWEEP.y1} x2={SWEEP.x2} y2={SWEEP.y2}>
              <stop offset="0%" stopColor="var(--bleu)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--bleu)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="radar-sweep" style={{ transformOrigin: `${CX}px ${CY}px` }}>
            <path d={SWEEP.d} fill="url(#solSweep)" />
            <line x1={CX} y1={CY} x2={SWEEP.x1} y2={SWEEP.y1} stroke="var(--bleu)" strokeOpacity="0.22" strokeWidth="1" />
          </g>
          {[1, 0.75, 0.5, 0.25].map((f) => (
            <polygon key={f} className="radar-grid" points={ringPts(f)} />
          ))}
          {/* Labels % pâles sur l'axe vertical du haut : le rayon = part
              d'attention 24h de la région (le bord = axisScale %). */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} className="radar-ring-lab" x={CX + 4} y={CY - (R0 + f * (R - R0)) + 3}>
              {Math.round(s.axisScale * f)}%
            </text>
          ))}
          {axes.map((_, i) => {
            const [x, y] = pt(i, 100);
            return <line key={i} className="radar-spoke" x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />;
          })}
          <polygon className="radar-can" points={polyPts("vcan")} />
          <polygon className="radar-qc" points={polyPts("vqc")} />
          {/* Points : bleu = QC, rouge = CAN, survolables (infobulle) */}
          {(["vcan", "vqc"] as const).map((key) =>
            vals.map((v, i) => {
              if (!(v[key] > 0)) return null;
              const [x, y] = pt(i, v[key]);
              const isQc = key === "vqc";
              const region = isQc ? "québécoise" : "canadienne";
              const share = isQc ? axes[i].qcShare : axes[i].canShare;
              const body = `${axes[i].label} : ${share} % de l'attention médiatique ${region} des 24 dernières heures.`;
              const kk = isQc ? "Au Québec" : "Au Canada";
              const sideKey = isQc ? "qc" : "can";
              return (
                <g
                  key={`${key}-${i}`}
                  className={`dot ${isQc ? "radar-dot-qc" : "radar-dot-can"}`}
                  tabIndex={0}
                  role="img"
                  aria-label={`${kk} : ${body}`}
                  onMouseEnter={(e) => place(e, sideKey, kk, body)}
                  onMouseMove={(e) => place(e, sideKey, kk, body)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => placeAtRect(e.currentTarget, sideKey, kk, body)}
                  onBlur={() => setTip(null)}
                >
                  <circle className="hit" cx={x.toFixed(1)} cy={y.toFixed(1)} r={13} />
                  <circle className="pip" cx={x.toFixed(1)} cy={y.toFixed(1)} r={2.8} />
                </g>
              );
            }),
          )}
          {/* Libellés d'événements + badges des médias couvrants */}
          {axes.map((a, i) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const lx = CX + (R + 15) * Math.cos(ang);
            const ly = CY + (R + 15) * Math.sin(ang);
            const anchor = Math.abs(Math.cos(ang)) < 0.35 ? "middle" : Math.cos(ang) > 0 ? "start" : "end";
            const dyBase = Math.abs(Math.sin(ang)) < 0.35 ? 4 : Math.sin(ang) > 0 ? 12 : -6;
            const lines = wrapLabel(a.label);
            const strong = Math.max(vals[i].vqc, vals[i].vcan) === maxVal;
            const side = a.side;
            const BW = 20, CHGAP = 5;
            const media = a.media;
            const tot = media.length * BW + (media.length - 1) * CHGAP;
            const rowX = anchor === "middle" ? lx - tot / 2 : anchor === "start" ? lx : lx - tot;
            const topSide = Math.sin(ang) < -0.35;
            const labH = (lines.length - 1) * 14;
            const labY = topSide ? ly + dyBase - (labH + 8 + BW) : ly + dyBase;
            const rowY = labY + labH + 8;
            return (
              <g key={`lab-${i}`}>
                {lines.map((ln, k) => (
                  <text
                    key={k}
                    className={`radar-lab${strong ? " strong" : ""} side-${side}`}
                    x={lx.toFixed(1)}
                    y={(labY + k * 14).toFixed(1)}
                    textAnchor={anchor}
                  >
                    {ln}
                  </text>
                ))}
                {media.map((m, k) => {
                  const cx0 = rowX + k * (BW + CHGAP);
                  const inner = (
                    <>
                      <g>
                        <rect x={cx0.toFixed(1)} y={rowY.toFixed(1)} width={BW} height={BW} rx={2} />
                        <text x={(cx0 + BW / 2).toFixed(1)} y={(rowY + BW / 2 + 2.8).toFixed(1)}>{m.badge}</text>
                      </g>
                      <text className="m-name" x={(cx0 + BW / 2).toFixed(1)} y={(rowY + BW + 13).toFixed(1)} textAnchor="middle">
                        {m.name.toUpperCase()}
                      </text>
                    </>
                  );
                  // Cliquable seulement s'il y a un article ; sinon un simple
                  // groupe (pas de href="#" qui ferait sauter la page).
                  return m.url ? (
                    <a key={m.id} className={`m-chip chip-${m.region}`} href={m.url} target="_blank" rel="noopener noreferrer"
                      aria-label={`Dernier article de ${m.name} sur ${a.label}`}>
                      {inner}
                    </a>
                  ) : (
                    <g key={m.id} className={`m-chip chip-${m.region}`} role="img" aria-label={`${m.name} a couvert : ${a.label}`}>
                      {inner}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Score signature + jauge relative + bulle éditoriale */}
      <div className="sol-stat">
        <span
          className={`score-num ${s.modeCls}`}
          title="0 % = aucun sujet saillant partagé · 100 % = mêmes priorités des deux côtés. Mesure : les mêmes sujets saillants, pas les mêmes articles."
        >
          {s.scoreValue}
          <sup>%</sup>
        </span>
        <span className="score-lab">
          de {s.verb}
          <span className="info-dot" tabIndex={0}>
            {"ⓘ"}
            <span className="info-bubble">{s.edito}</span>
          </span>
        </span>
        <div className="rel-strip" aria-hidden>
          <span className="lbl l">plus divergent</span>
          <span
            className="lbl m"
            title="Échelle en percentiles des six derniers mois : le centre est la médiane, un bloc « habituel ». La divergence reste la règle, même à un niveau habituel."
          >
            habituel
          </span>
          <span className="lbl r">plus convergent</span>
          <div className="track" />
          <div className="tick" style={{ left: "50%" }} />
          <div className="marker" style={{ left: `${s.relPct}%` }} />
        </div>
      </div>

      {tip && (
        <div className={`dot-tip on ${tip.side}`} style={{ left: tipX(tip.x), top: tipY(tip.y) }}>
          <span className="k">{tip.k}</span>
          {tip.body}
        </div>
      )}
    </div>
  );
}

// Décale l'infobulle du curseur et la garde dans le viewport.
function tipX(x: number): number {
  if (typeof window === "undefined") return x + 16;
  return Math.min(Math.max(14, x + 16), window.innerWidth - 274);
}
function tipY(y: number): number {
  if (typeof window === "undefined") return y + 16;
  return Math.max(14, y + 16);
}
