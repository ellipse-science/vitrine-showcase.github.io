"use client";

import React, { useEffect, useRef, useState } from "react";

import type { SolitudeData } from "@/lib/data/headlineEvents";

// Radar « Deux solitudes » : axes = événements saillants du bloc, deux
// polygones QC (bleu) / CAN (rouge). Composant CLIENT car l'infobulle des
// points suit le curseur (état React). Toute la géométrie est déterministe :
// aucune donnée n'est chargée ici, elle arrive en props depuis le server
// component DeuxSolitudesSection.

const W = 840, H = 680, CX = W / 2, CY = H / 2, R = 160, R0 = 6;
// Distance radiale des libellés selon l'orientation de l'axe. cosA ∈ [-1, 1] est
// le cosinus de l'angle de l'axe : |cosA| ≈ 0 = axe vertical (haut/bas), |cosA| ≈ 1
// = axe horizontal (côtés). Le seuil 0.35 (≈ 20° de part et d'autre de la verticale)
// sépare les deux régimes : en haut/bas on rapproche le libellé (R+58) car le bloc
// titre s'empile verticalement et déborderait sinon ; sur les côtés on l'éloigne
// (R+152) pour profiter de la place horizontale et ne pas chevaucher le radar.
// Offsets fixés visuellement à ce viewBox (840×680) — à revoir s'il change.
const labelR = (cosA: number) => (Math.abs(cosA) < 0.35 ? R + 58 : R + 152);

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

// Coupe un titre en lignes étroites (~26 caractères) : 2-3 lignes centrées,
// comme la maquette, pour que le bloc ne déborde pas sur le radar.
function wrapLabel(s: string): string[] {
  const words = s.split(" ");
  const maxLen = 26;
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxLen) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

type Tip = { x: number; y: number; side: "qc" | "can"; k: string; body: string };

export function DeuxSolitudesRadar({ solitudes: s }: { solitudes: SolitudeData }) {
  const [tip, setTip] = useState<Tip | null>(null);

  // Sur écran étroit, le radar garde une largeur plancher (CSS) et son conteneur
  // devient scrollable horizontalement. Le radar étant symétrique (QC à gauche,
  // CAN à droite), on centre le défilement pour que les deux solitudes soient
  // équidistantes du regard, plutôt que de n'en montrer qu'une par défaut. Aucun
  // effet quand tout tient à l'écran (extra <= 0). Un ResizeObserver sur le
  // conteneur couvre montage, rotation d'écran et tout relayout — plus fiable que
  // window.resize (qui rate certains changements de dimension du conteneur seul).
  const radarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = radarRef.current;
    if (!el) return;
    const center = () => {
      const extra = el.scrollWidth - el.clientWidth;
      if (extra > 0) el.scrollLeft = extra / 2;
    };
    center();
    const ro = new ResizeObserver(center);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  return (
    <div className="sol-body">
      {/* Axe fleur/érable : les symboles se rapprochent quand ça converge et
          s'éloignent quand ça diverge — la distance encode la convergence. */}
      <div className="sol-viz">
        <div className="sol-axis" />
        <span className="sol-arrowhead left" aria-hidden />
        <span className="sol-axis-tick" aria-hidden />
        <span className="sol-arrowhead right" aria-hidden />
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
      <div className="sol-radar" ref={radarRef}>
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
              {Math.round(s.axisScale * f)}&nbsp;%
            </text>
          ))}
          {axes.map((_, i) => {
            const [x, y] = pt(i, 100);
            return <line key={i} className="radar-spoke" x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />;
          })}
          {/* Leaders en COUDE (2 segments) pointillés colorés : du point de données,
              une diagonale puis un court segment horizontal qui rentre dans le libellé,
              avec un point au coude et au bout. Axes haut/bas = ligne droite. */}
          {axes.map((a, i) => {
            const mv = Math.max(vals[i].vqc, vals[i].vcan);
            if (!(mv > 0)) return null;
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const cosA = Math.cos(ang), sinA = Math.sin(ang);
            const [dx, dy] = pt(i, mv);
            const or = labelR(cosA) - 42;              // arrivée, près du libellé (radial)
            const e2x = CX + or * cosA, e2y = CY + or * sinA;
            const mid = Math.abs(cosA) < 0.35;         // axes du haut / du bas
            const dir = cosA >= 0 ? 1 : -1;
            const e1x = e2x - dir * 30, e1y = e2y;     // coude : 30 px horizontaux avant le bout
            const pts = mid
              ? `${dx.toFixed(1)},${dy.toFixed(1)} ${e2x.toFixed(1)},${e2y.toFixed(1)}`
              : `${dx.toFixed(1)},${dy.toFixed(1)} ${e1x.toFixed(1)},${e1y.toFixed(1)} ${e2x.toFixed(1)},${e2y.toFixed(1)}`;
            return (
              <g key={`ldr-${i}`} className={`radar-leader side-${a.side}`}>
                <polyline points={pts} />
                {!mid && <circle className="ldr-dot" cx={e1x.toFixed(1)} cy={e1y.toFixed(1)} r={2.2} />}
                <circle className="ldr-dot" cx={e2x.toFixed(1)} cy={e2y.toFixed(1)} r={2.8} />
              </g>
            );
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
          {/* Libellés d'événements + badges — TOUT centré sur l'axe. Le bloc se
              place au-dessus du point (axe du haut), en dessous (axe du bas) ou
              centré verticalement (côtés). */}
          {axes.map((a, i) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const cosA = Math.cos(ang), sinA = Math.sin(ang);
            const lx = CX + labelR(cosA) * cosA;
            const ly = CY + labelR(cosA) * sinA;
            const lines = wrapLabel(a.label);
            const strong = Math.max(vals[i].vqc, vals[i].vcan) === maxVal;
            const side = a.side;
            const BW = 26, CHGAP = 6, LINE_H = 20, EYE_GAP = 16, TB_GAP = 15;
            // Les badges s'enroulent sur plusieurs rangées : une histoire très
            // couverte (11 médias = 346 px sur une ligne) débordait sur les
            // libellés des axes voisins. 6 par rangée ≈ 186 px, soit la largeur
            // d'un titre (wrapLabel plafonne à 26 caractères). Les rangées sont
            // ÉQUILIBRÉES (11 → 6+5, pas 6+5 déséquilibré en 6+1+4) pour rester
            // centrées sous le titre.
            const MAX_PER_ROW = 6, ROW_H = 34;
            const media = a.media;
            const rowsCount = Math.max(1, Math.ceil(media.length / MAX_PER_ROW));
            const perRow = Math.ceil(media.length / rowsCount);
            const mediaRows = Array.from({ length: rowsCount }, (_, r) =>
              media.slice(r * perRow, (r + 1) * perRow),
            ).filter((r) => r.length > 0);
            const eyeH = a.eyebrow ? EYE_GAP : 0;
            const titleH = lines.length * LINE_H;
            // Hauteur du bloc = eyebrow + titres + TOUTES les rangées de badges :
            // sans ça, le positionnement vertical (top) ignorerait les rangées
            // supplémentaires et les axes du bas mordraient sur le radar.
            const blockH = eyeH + titleH + TB_GAP + 20 + (mediaRows.length - 1) * ROW_H;
            // Haut du bloc selon la position de l'axe.
            const top = sinA < -0.35 ? ly - blockH : sinA > 0.35 ? ly : ly - blockH / 2;
            const eyebrowY = top + 11;
            const title1Y = top + eyeH + 14;                 // 1re ligne de titre
            const rowY = title1Y + (lines.length - 1) * LINE_H + TB_GAP;
            return (
              <g key={`lab-${i}`}>
                {a.eyebrow && (
                  <text
                    className={`radar-eyebrow side-${side}`}
                    x={lx.toFixed(1)}
                    y={eyebrowY.toFixed(1)}
                    textAnchor="middle"
                  >
                    {a.eyebrow.toUpperCase()}
                  </text>
                )}
                {lines.map((ln, k) => (
                  <text
                    key={k}
                    className={`radar-lab${strong ? " strong" : ""} side-${side}`}
                    x={lx.toFixed(1)}
                    y={(title1Y + k * LINE_H).toFixed(1)}
                    textAnchor="middle"
                  >
                    {ln}
                  </text>
                ))}
                {mediaRows.flatMap((row, r) => {
                  // Chaque rangée est centrée sur l'axe indépendamment.
                  const tot = row.length * BW + (row.length - 1) * CHGAP;
                  const rowX = lx - tot / 2;
                  const ry = rowY + r * ROW_H;
                  return row.map((m, k) => {
                  const cx0 = rowX + k * (BW + CHGAP);
                  const cxm = cx0 + BW / 2;
                  const inner = (
                    <>
                      <g>
                        <text className="m-code" x={cxm.toFixed(1)} y={(ry + 11).toFixed(1)} textAnchor="middle">{m.badge}</text>
                        <line className="m-underline" x1={(cx0 + BW * 0.14).toFixed(1)} y1={(ry + 16).toFixed(1)} x2={(cx0 + BW * 0.86).toFixed(1)} y2={(ry + 16).toFixed(1)} />
                      </g>
                      <text className="m-name" x={cxm.toFixed(1)} y={(ry + 30).toFixed(1)} textAnchor="middle">
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
                  });
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
          title={"Convergence des priorités sur les 24 dernières heures. 0\u00A0% = aucun sujet saillant partagé · 100\u00A0% = mêmes priorités des deux côtés. Mesure\u00A0: les mêmes sujets saillants, pas les mêmes articles."}
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
        {/* Échelle absolue graduée : 100 % divergence (gauche) → habituel
            → 100 % convergence (droite). Marqueur = convergence sur la fenêtre
            glissante 24 h (s.convPct), pas un bloc 4 h. Le repère « habituel »
            = convergence event-level médiane des derniers mois (s.habitualConvPct). */}
        <div className="rel-strip" aria-hidden>
          <span className="lbl l">divergent</span>
          <span className="lbl r">convergent</span>
          <div className="track" />
          <div
            className="hab"
            style={{ left: `${s.habitualConvPct}%` }}
            title={`« Habituel » = la convergence médiane des derniers mois (~${s.habitualConvPct} %). En temps normal, les deux agendas se recoupent peu : la divergence est la règle.`}
          />
          <div className="marker" style={{ left: `${s.convPct}%` }} />
          <span className="grad g0">100&nbsp;%</span>
          <span className="grad gm" style={{ left: `${s.habitualConvPct}%` }}>habituel</span>
          <span className="grad g1">100&nbsp;%</span>
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
