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

// Coupure de l'étiquette de rubrique (#381). Elle n'était PAS coupée du tout,
// alors que le titre l'est à 26 caractères : « DROITS, LIBERTÉS, MINORITÉS ET
// DISCRIMINATION » (44 car.) débordait sur la colonne de l'axe voisin.
// 28 est mesuré, pas deviné : l'étiquette est en IBM Plex Mono avec un
// letter-spacing fixe, donc de largeur strictement proportionnelle — 8,19 px
// par caractère au rendu. 28 × 8,19 = 229 px, juste sous les 233 px du bloc
// titre le plus large (26 caractères de Source Serif 4). Les deux colonnes ont
// donc la même emprise, quelle que soit la rubrique.
export const EYEBROW_MAX_CHARS = 28;
/** Largeur mesurée d'un caractère de `.radar-eyebrow` (IBM Plex Mono 10,5 px,
 *  letter-spacing 0.18em) et largeur du bloc titre le plus large. Exportées
 *  pour que le test verrouille la CALIBRATION, pas seulement la coupure. */
export const EYEBROW_PX_PER_CHAR = 8.19;
export const AXIS_BLOCK_MAX_PX = 233;

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

// Angle des labels % de l'échelle radiale (#394) : l'écart entre le dernier
// axe (i = n-1, angle -π/2 - 2π/n) et le premier (i = 0, angle -π/2), donc à
// mi-chemin des deux, -π/2 - π/n. Aucun axe n'a jamais cet angle exact (les n
// axes sont à -π/2 + i·2π/n pour i entier) : l'écart entre deux axes voisins
// contient toujours ce point médian sans jamais coïncider avec l'un d'eux,
// quel que soit n. Un label sur cet angle ne peut donc jamais retomber sur la
// colonne d'un axe — et donc jamais sur un point de données, qui n'existe que
// sur un axe (cf. `pt`). Exportée pour que le test verrouille la preuve
// géométrique, pas seulement le rendu.
export function ringLabelAngle(n: number): number {
  return -Math.PI / 2 - Math.PI / n;
}

// Coupe un titre en lignes étroites (~26 caractères) : 2-3 lignes centrées,
// comme la maquette, pour que le bloc ne déborde pas sur le radar.
export function wrapLabel(s: string, maxLen = 26): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxLen) { lines.push(cur); cur = w; }
    else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Deux infobulles, deux questions — jamais la même réponse (retour Adrien) :
//  · point INTÉRIEUR (sommet d'un polygone) = « combien cette région
//    accorde-t-elle à ce sujet ? » → une PART, chiffre en tête.
//  · point EXTÉRIEUR (bout de la ligne de rappel) = « à quel point ce sujet
//    est-il saillant ? » → un RANG parmi les Unes, avec ce qu'il signifie.
// Ni l'une ni l'autre ne répète le titre : il est déjà écrit à côté, au bout
// de la ligne (et en mobile, le numéro d'axe renvoie à la légende).
// `side` porte aussi la couleur : bleu/rouge pour une mesure de région,
// neutre (« story ») pour la saillance, qui n'appartient à aucune des deux.
type Tip = {
  x: number; y: number;
  side: "qc" | "can" | "story";
  k: string;
  /** Classe de niveau (`s-eleve`…) quand le chapeau doit être la PASTILLE de la
   *  Une des Unes plutôt qu'un simple sur-titre : même composant visuel, mêmes
   *  couleurs de bande, pour qu'on reconnaisse le niveau d'un module à l'autre
   *  sans le relire. */
  tagCls?: string;
  lead?: string;
  body: string;
};

export function DeuxSolitudesRadar({ solitudes: s }: { solitudes: SolitudeData }) {
  const [tip, setTip] = useState<Tip | null>(null);
  // « Légende améliorée » (#308) : survoler une zone colorée fait suivre au
  // curseur le symbole de sa région (fleur = QC, érable = CAN).
  //
  // Seul le CÔTÉ survolé est dans le state (il change à l'entrée/sortie d'une
  // zone, pas en continu). La position suit le curseur par écriture directe
  // sur le nœud : ce composant ne mémoïse rien, donc un setState par
  // `mousemove` re-rendrait tout le SVG (polygones, axes, étiquettes) des
  // dizaines de fois par seconde sur une grande surface.
  const [zone, setZone] = useState<"qc" | "can" | null>(null);
  const zonePos = useRef({ x: 0, y: 0 });
  const glyphRef = useRef<HTMLDivElement>(null);
  const moveGlyph = (e: React.MouseEvent) => {
    zonePos.current = { x: e.clientX, y: e.clientY };
    const g = glyphRef.current;
    if (g) {
      g.style.left = `${e.clientX}px`;
      g.style.top = `${e.clientY}px`;
    }
  };

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

  // Sous 768 px, les titres accrochés aux axes ne peuvent PAS tenir : un libellé
  // latéral fait ~186 px et le radar 320 px de diamètre, soit ~720 px minimum
  // pour ~326 px disponibles. Le défilement horizontal (avec fondu aux bords,
  // #251) n'a pas suffi — les signalements #302 et #309 sont postérieurs. On
  // détache donc les titres : le radar ne porte plus que des pastilles
  // numérotées, et les six histoires se lisent dans une légende sous le radar.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    // Même borne que le bloc mobile du radar dans globals.css : au-delà, les
    // libellés d'axes tiennent encore.
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    // addEventListener sur un MediaQueryList n'existe qu'à partir de Safari 14
    // (iOS 14). Sans le repli, un iOS plus ancien lève « addEventListener is not
    // a function » DANS l'effet, ce qui casse tout le module — précisément en
    // mobile, le cas que cette version sert.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
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

  const place = (e: React.MouseEvent, t: Omit<Tip, "x" | "y">) =>
    setTip({ ...t, x: e.clientX, y: e.clientY });
  // Focus clavier : positionne l'infobulle sur le point lui-même.
  const placeAtRect = (el: SVGGElement, t: Omit<Tip, "x" | "y">) => {
    const r = el.getBoundingClientRect();
    setTip({ ...t, x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const [qp, rp] = [s.qcSymbolPos, s.canSymbolPos];

  return (
    <div className="sol-body">
      {/* Axe fleur/érable : les symboles se rapprochent quand ça converge et
          s'éloignent quand ça diverge — la distance encode la convergence.
          Sans flèches (#399, retour Martel) : elles donnaient à cette bande
          l'air d'un axe reporté dans le radar plus bas, qui n'en a pourtant
          aucun (ses axes sont des SUJETS, positionnés par ordre/saillance,
          sans notion de gauche/droite régionale) — mais leur ORDRE, lui,
          penche structurellement QC à droite / CAN à gauche (#395, voir
          `symbolPositions` dans lib/data/headlineEvents.ts), d'où le sens
          Québec=droite / Canada=gauche choisi ici pour matcher le radar. */}
      <div className="sol-viz">
        <div className="sol-axis" />
        <span className="sol-axis-tick" aria-hidden />
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
      <div className={`sol-radar${narrow ? " compact" : ""}`} ref={radarRef}>
        <svg
          viewBox={narrow ? `${CX - R - 46} ${CY - R - 46} ${2 * (R + 46)} ${2 * (R + 46)}` : `0 0 ${W} ${H}`}
          role="group"
          aria-label={narrow
            ? "Part de l’attention médiatique de chaque histoire au Québec et au Canada. Les six histoires sont numérotées et détaillées sous le radar."
            : "Part de l’attention médiatique de chaque histoire au Québec et au Canada."}
        >
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
          {/* Labels % pâles, dans l'écart angulaire entre le dernier axe et
              le premier (#394) — jamais SUR un axe. Ils étaient plaqués sur
              l'axe vertical du haut (x=CX), la colonne exacte que suit aussi
              le point de données de cet axe (pt(0, v) retombe sur x=CX quel
              que soit v) : dès que sa valeur approchait un palier (25/50/75/
              100 %), le label venait recouvrir le point. Le rayon reste
              identique (part d'attention 24h de la région, le bord =
              axisScale %) ; seul l'angle change, vers l'écart entre deux
              axes où aucun spoke ni aucun point ne peut jamais tomber. */}
          {[0.25, 0.5, 0.75, 1].map((f) => {
            const ringAng = ringLabelAngle(n);
            const r = R0 + f * (R - R0);
            const rx = CX + r * Math.cos(ringAng);
            const ry = CY + r * Math.sin(ringAng);
            return (
              <text key={f} className="radar-ring-lab" x={rx.toFixed(1)} y={(ry + 3).toFixed(1)}>
                {Math.round(s.axisScale * f)}&nbsp;%
              </text>
            );
          })}
          {axes.map((_, i) => {
            const [x, y] = pt(i, 100);
            return <line key={i} className="radar-spoke" x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)} />;
          })}
          {/* Leaders en COUDE (2 segments) pointillés colorés : du point de données,
              une diagonale puis un court segment horizontal qui rentre dans le libellé,
              avec un point au coude et au bout. Axes haut/bas = ligne droite. */}
          {!narrow && axes.map((a, i) => {
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
            // Bout de la ligne de rappel (#383) : plus gros, avec le même pouls
            // « live » que le marqueur de la jauge en bas du module — c'est le
            // repère du moment, pas une décoration. En SVG le box-shadow de
            // solLivePulse n'existe pas : l'anneau est un second cercle dont
            // le rayon et l'opacité s'animent, même langage visuel.
            // Il porte l'étiquette de saillance du sujet — et RIEN de ce que
            // disent les points de données : ni titre, ni part d'attention.
            //
            // Aucune mention de région non plus, et c'est une question
            // d'exactitude, pas seulement de style : l'échelle de saillance est
            // QUÉBÉCOISE (`sumQc` contre SUM_QC_THRESHOLDS, cf. le badge de la
            // Une des Unes). Écrire « Au Canada : saillance faible » sur un axe
            // mené par le ROC attribuerait à une région une mesure qui n'est
            // pas la sienne. Le niveau appartient au SUJET, pas à un camp — le
            // ton neutre de la bulle le dit aussi visuellement.
            const bulleSal = a.salienceLabel && a.salienceHint && a.salienceCls
              ? {
                side: "story" as const,
                // Libellé EXACT du module 1 (« Saillance Élevée »), pas une
                // variante en minuscules : c'est la même pastille, elle doit
                // se lire pareil.
                k: `Saillance ${a.salienceLabel}`,
                tagCls: a.salienceCls,
                body: a.salienceHint,
              }
              : null;
            return (
              <g key={`ldr-${i}`} className={`radar-leader side-${a.side}`}>
                <polyline points={pts} />
                {!mid && <circle className="ldr-dot" cx={e1x.toFixed(1)} cy={e1y.toFixed(1)} r={2.2} />}
                <g
                  className="ldr-end"
                  tabIndex={bulleSal ? 0 : undefined}
                  role={bulleSal ? "img" : undefined}
                  aria-label={bulleSal ? `${a.label} — saillance ${a.salienceLabel!.toLowerCase()}. ${a.salienceHint}` : undefined}
                  onMouseEnter={bulleSal ? (e) => place(e, bulleSal) : undefined}
                  onMouseMove={bulleSal ? (e) => place(e, bulleSal) : undefined}
                  onMouseLeave={bulleSal ? () => setTip(null) : undefined}
                  onFocus={bulleSal ? (e) => placeAtRect(e.currentTarget, bulleSal) : undefined}
                  onBlur={bulleSal ? () => setTip(null) : undefined}
                >
                  <circle className="ldr-halo" cx={e2x.toFixed(1)} cy={e2y.toFixed(1)} r={4.2} />
                  <circle className="hit" cx={e2x.toFixed(1)} cy={e2y.toFixed(1)} r={13} />
                  <circle className="ldr-dot is-end" cx={e2x.toFixed(1)} cy={e2y.toFixed(1)} r={4.2} />
                </g>
              </g>
            );
          })}
          <polygon
            className="radar-can"
            points={polyPts("vcan")}
            onMouseEnter={(e) => { moveGlyph(e); setZone("can"); }}
            onMouseMove={moveGlyph}
            onMouseLeave={() => setZone(null)}
          />
          <polygon
            className="radar-qc"
            points={polyPts("vqc")}
            onMouseEnter={(e) => { moveGlyph(e); setZone("qc"); }}
            onMouseMove={moveGlyph}
            onMouseLeave={() => setZone(null)}
          />
          {/* Points : bleu = QC, rouge = CAN, survolables (infobulle) */}
          {(["vcan", "vqc"] as const).map((key) =>
            vals.map((v, i) => {
              if (!(v[key] > 0)) return null;
              const [x, y] = pt(i, v[key]);
              const isQc = key === "vqc";
              const share = isQc ? axes[i].qcShare : axes[i].canShare;
              // Le titre ne va PAS dans la bulle : il est déjà écrit au bout de
              // la ligne de rappel. En mobile il n'y est pas, mais les axes sont
              // numérotés et la légende suit — le numéro suffit à relier.
              const kk = (isQc ? "Au Québec" : "Au Canada") + (narrow ? ` · sujet ${i + 1}` : "");
              const sideKey = isQc ? "qc" : "can";
              const bulle = {
                side: sideKey as "qc" | "can",
                k: kk,
                lead: `${share} %`,
                body: "de l'attention médiatique des 24 dernières heures.",
              };
              return (
                <g
                  key={`${key}-${i}`}
                  className={`dot ${isQc ? "radar-dot-qc" : "radar-dot-can"}`}
                  tabIndex={0}
                  role="img"
                  /* Le lecteur d'écran, lui, n'a pas le titre sous les yeux :
                     l'étiquette accessible reste complète. */
                  aria-label={`${kk} : ${axes[i].label} — ${share} % de l'attention médiatique des 24 dernières heures.`}
                  onMouseEnter={(e) => place(e, bulle)}
                  onMouseMove={(e) => place(e, bulle)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => placeAtRect(e.currentTarget, bulle)}
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
          {/* Écran étroit : une pastille numérotée au bout de chaque axe, le
              titre part dans la légende sous le radar. */}
          {narrow && axes.map((a, i) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const px = CX + (R + 26) * Math.cos(ang);
            const py = CY + (R + 26) * Math.sin(ang);
            return (
              <g key={`num-${i}`} className={`radar-axnum side-${a.side}`}>
                <circle cx={px.toFixed(1)} cy={py.toFixed(1)} r={13} />
                <text x={px.toFixed(1)} y={(py + 5).toFixed(1)} textAnchor="middle">{i + 1}</text>
              </g>
            );
          })}
          {!narrow && axes.map((a, i) => {
            const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const cosA = Math.cos(ang), sinA = Math.sin(ang);
            const lx = CX + labelR(cosA) * cosA;
            const ly = CY + labelR(cosA) * sinA;
            const strong = Math.max(vals[i].vqc, vals[i].vcan) === maxVal;
            const side = a.side;
            const BW = 26, CHGAP = 6, LINE_H = 20, EYE_GAP = 16, TB_GAP = 15;
            // EYE_LINE_H : interligne d'une rubrique qui passe sur 2 lignes.
            // 13 px pour une police de 10,5 px — assez serré pour que le bloc
            // reste un « sur-titre » et ne concurrence pas le titre.
            const EYE_LINE_H = 13;
            const eyeLines = a.eyebrow ? wrapLabel(a.eyebrow.toUpperCase(), EYEBROW_MAX_CHARS) : [];
            const eyeH = a.eyebrow ? EYE_GAP + (eyeLines.length - 1) * EYE_LINE_H : 0;
            // Rien ne doit jamais chevaucher le disque du radar (#394, extension
            // demandée par Adrien : « on veut plus jamais que ça arrive nulle
            // part » — #394 ne couvrait que les labels % vs le point de l'axe 0).
            // Sur les axes haut/bas, le budget vertical entre le bord du
            // canevas (y=2) et le bord du halo est FIXE et étroit — sur les
            // côtés, il est énorme (labelR y est bien plus grand) et jamais
            // serré en pratique. Ce plafond protège donc les deux seuls axes à
            // risque ; recalculé à partir des mêmes constantes que le clamp de
            // `top` plus bas (R+10 = halo, labelR(0) = ancre de l'axe) plutôt
            // que codé en dur, pour rester juste si l'une d'elles bouge.
            const vertical = Math.abs(cosA) < 0.35;
            // -4 : marge de sécurité visible plutôt qu'un plafond pile au
            // bord du halo (0px d'écart se lirait encore comme un contact).
            const maxBlockH = vertical ? (labelR(0) - (R + 10)) + (CY - labelR(0) - 2) - 4 : Infinity;
            // Plafond du TITRE (constaté : un titre long, sans même de badge,
            // peut à lui seul dépasser le budget — les vrais titres scrapés
            // n'ont pas de longueur maximale garantie, contrairement à la
            // rubrique qui vient d'un dictionnaire fixe de 12 entrées, déjà
            // vérifiées ≤ 2 lignes par le test #381). Rarement atteint en
            // pratique (~5-6 lignes dispo une fois la rubrique déduite) — filet
            // de sécurité, pas un comportement normal. Ellipse sur la dernière
            // ligne gardée plutôt que de laisser le titre continuer à pousser.
            const rawLines = wrapLabel(a.label);
            const maxTitleLines = vertical
              ? Math.max(1, Math.floor((maxBlockH - eyeH - TB_GAP - 20) / LINE_H))
              : Infinity;
            const lines = rawLines.length <= maxTitleLines ? rawLines : [
              ...rawLines.slice(0, maxTitleLines - 1),
              `${rawLines[maxTitleLines - 1].replace(/.{1,3}$/, "")}…`,
            ];
            const titleH = lines.length * LINE_H;
            // Les badges s'enroulent sur plusieurs rangées : une histoire très
            // couverte (11 médias = 346 px sur une ligne) débordait sur les
            // libellés des axes voisins. 6 par rangée ≈ 186 px, soit la largeur
            // d'un titre (wrapLabel plafonne à 26 caractères). Les rangées sont
            // ÉQUILIBRÉES : on fixe d'abord le NOMBRE de rangées, puis on
            // répartit uniformément — 7 médias → 4+3 (pas 6+1), 11 → 6+5 —
            // pour que chaque rangée reste centrée sous le titre.
            const MAX_PER_ROW = 6, ROW_H = 34;
            const media = a.media;
            const rowsCount = Math.ceil(media.length / MAX_PER_ROW); // 0 si aucun badge
            const perRow = rowsCount > 0 ? Math.ceil(media.length / rowsCount) : 0;
            const allRows = Array.from({ length: rowsCount }, (_, r) =>
              media.slice(r * perRow, (r + 1) * perRow),
            ).filter((r) => r.length > 0);
            // Plafond des RANGÉES DE BADGES (#394, retour Adrien) : un
            // sujet très couvert (10+ médias → 2 rangées) pousse le bloc au-delà
            // du budget une fois le titre/rubrique déjà comptés — constaté en
            // direct sur « Carney et Trump s'affrontent… » (2 rangées, titre 4
            // lignes, rubrique 2 lignes : bloc de 178px pour un budget de 168px,
            // 10px dans le halo). Le clamp de `top` plus bas protège le bord du
            // DESSIN, pas le bord du DISQUE — il faut limiter le CONTENU lui-même.
            const nonBadgeH = eyeH + titleH + TB_GAP + 20;
            const maxExtraRows = Math.max(0, Math.floor((maxBlockH - nonBadgeH) / ROW_H));
            // Toujours au moins 1 rangée affichée (même si ça déborde légèrement) :
            // perdre TOUS les badges d'un coup serait pire que quelques px de trop
            // dans un cas déjà extrême (titre très long ET rubrique sur 2 lignes).
            const allowedRowsCount = Math.min(allRows.length, Math.max(1, 1 + maxExtraRows));
            const hiddenMediaCount = media.length - allRows.slice(0, allowedRowsCount).flat().length;
            const mediaRows = allRows.slice(0, allowedRowsCount);
            // Hauteur du bloc = eyebrow + titres + TOUTES les rangées de badges
            // GARDÉES (après troncature ci-dessus) : sans ça, le positionnement
            // vertical (top) ignorerait les rangées supplémentaires et les axes
            // du bas mordraient sur le radar. Math.max(0, …) : un axe SANS badge
            // garde la hauteur d'avant (la rangée vide était déjà comptée 20 px)
            // au lieu de perdre 34 px et de remonter sur le radar.
            const blockH = eyeH + titleH + TB_GAP + 20 + Math.max(0, mediaRows.length - 1) * ROW_H;
            // Haut du bloc selon la position de l'axe, borné dans la zone de
            // dessin (#299). Le bloc grandit vers le HAUT sur l'axe du haut :
            // un titre qui passe à 4 lignes le fait sortir par le dessus
            // (mesuré : étiquette de catégorie à y = -9 pour un viewBox qui
            // commence à 0), et sous 768 px le conteneur rogne en Y — la
            // catégorie était coupée en deux. Symétrique en bas. La marge
            // regagnée reste très inférieure à l'espace libre entre le bloc et
            // le disque, donc rien ne vient mordre sur le radar : cet espace
            // vaut labelR(0) − (R + 10) = 218 − 170 = 48 px sur l'axe du haut
            // (le bas du bloc est à ly = CY − labelR(0), le halo commence à
            // CY − (R + 10)). Écrit sous forme de calcul et non de constante :
            // si labelR ou R bougent, l'écart se recalcule à la lecture.
            const rawTop = sinA < -0.35 ? ly - blockH : sinA > 0.35 ? ly : ly - blockH / 2;
            const top = Math.max(2, Math.min(rawTop, H - blockH - 2));
            const eyebrowY = top + 11;
            const title1Y = top + eyeH + 14;                 // 1re ligne de titre
            const rowY = title1Y + (lines.length - 1) * LINE_H + TB_GAP;
            return (
              <g key={`lab-${i}`}>
                {eyeLines.map((ey, k) => (
                  <text
                    key={`eye-${k}`}
                    className={`radar-eyebrow side-${side}`}
                    x={lx.toFixed(1)}
                    y={(eyebrowY + k * EYE_LINE_H).toFixed(1)}
                    textAnchor="middle"
                  >
                    {ey}
                  </text>
                ))}
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
                  // Rangées de badges tronquées (voir plus haut) : la dernière
                  // rangée GARDÉE porte un chip « +N » plutôt que de perdre les
                  // médias en trop en silence — même largeur qu'un chip normal,
                  // compté dans le centrage de la rangée.
                  const isLastKeptRow = r === mediaRows.length - 1;
                  const showMore = isLastKeptRow && hiddenMediaCount > 0;
                  const slots = row.length + (showMore ? 1 : 0);
                  // Chaque rangée est centrée sur l'axe indépendamment.
                  const tot = slots * BW + (slots - 1) * CHGAP;
                  const rowX = lx - tot / 2;
                  const ry = rowY + r * ROW_H;
                  const moreChip = showMore ? (
                    <g key="more" className="m-chip chip-more" role="img" aria-label={`Et ${hiddenMediaCount} autre${hiddenMediaCount > 1 ? "s" : ""} média${hiddenMediaCount > 1 ? "s" : ""} ayant couvert : ${a.label}`}>
                      <text className="m-code" x={(rowX + row.length * (BW + CHGAP) + BW / 2).toFixed(1)} y={(ry + 16).toFixed(1)} textAnchor="middle">
                        {`+${hiddenMediaCount}`}
                      </text>
                    </g>
                  ) : null;
                  return [...row.map((m, k) => {
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
                  }), moreChip].filter(Boolean);
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Légende des six histoires (écran étroit uniquement) : ce que les
          libellés d'axes disent en desktop, en pleine largeur et lisible. */}
      {narrow && (
        <ol className="radar-legend">
          {axes.map((a, i) => (
            <li key={`lg-${i}`} className={`side-${a.side}`}>
              <span className="lg-num" aria-hidden>{i + 1}</span>
              <div className="lg-body">
                {a.eyebrow && <p className="lg-eyebrow">{a.eyebrow.toUpperCase()}</p>}
                <p className="lg-title">{a.label}</p>
                <p className="lg-shares">
                  {/* Sur écran étroit il n'y a ni ligne de rappel ni survol :
                      sans cette mention, l'étiquette de saillance (#383) serait
                      simplement absente en mobile. Elle vit donc dans la
                      légende, à la même place que les parts d'attention. */}
                  {a.salienceLabel && <span className="sal">Saillance {a.salienceLabel.toLowerCase()}</span>}
                  <span className="qc">Québec {a.qcShare}&nbsp;%</span>
                  <span className="can">Canada {a.canShare}&nbsp;%</span>
                </p>
                {a.media.length > 0 && (
                  <p className="lg-media">
                    {a.media.map((m) => m.url ? (
                      <a key={m.id} className={`chip-${m.region}`} href={m.url} target="_blank" rel="noopener noreferrer"
                        aria-label={`Dernier article de ${m.name} sur ${a.label}`}>{m.badge}</a>
                    ) : (
                      <span key={m.id} className={`chip-${m.region}`} aria-label={`${m.name} a couvert : ${a.label}`}>{m.badge}</span>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Score signature RELATIF (#258, demande Yannick) : le grand chiffre =
          l'écart à l'habituel, le libellé donne direction et intensité. Le
          score absolu s'est replié au survol du marqueur de la jauge. */}
      <div className="sol-stat">
        <span className={`score-num ${s.relCls}`}>
          {s.relDiffPct}
          <sup>%</sup>
        </span>
        <span className="score-lab">
          {s.relLabel}
          <span className="info-dot" tabIndex={0}>
            {"ⓘ"}
            <span className="info-bubble">{s.relInfo}</span>
          </span>
        </span>
        {/* Échelle absolue de CONVERGENCE, graduée 0 % (gauche) → 100 % (droite),
            comme la position du marqueur (`left: convPct%`). Les deux bornes
            portaient « 100 % » de chaque côté : le lecteur ne pouvait pas savoir
            que la piste mesure une seule grandeur. Les mots divergent/convergent
            restent aux deux bouts comme repères de sens. Marqueur = convergence
            sur la fenêtre glissante 24 h (s.convPct), pas un bloc 4 h. Le repère
            « habituel » = convergence event-level médiane des derniers mois. */}
        <div className="rel-strip" aria-hidden>
          <span className="lbl l">divergent</span>
          <span className="lbl r">convergent</span>
          <div className="track" />
          <div
            className="hab"
            style={{ left: `${s.habitualConvPct}%` }}
            title={`« Habituel » = la convergence médiane des derniers mois (~${s.habitualConvPct} %). En temps normal, les deux agendas se recoupent peu : la divergence est la règle.`}
          />
          <div className="marker" style={{ left: `${s.convPct}%` }}>
            <span className="marker-bubble">
              <span className="mb-now">{s.markerTitle}</span>
              {/* Ce que valent les deux bouts de l'échelle. Texte invariant, donc
                  il vit ici avec la jauge qu'il décrit, et non dans le loader :
                  c'est la graduation 0-100 qu'il explique, pas une donnée. */}
              <span className="mb-scale">
                À 100&nbsp;%, toutes les histoires couvertes au Québec et au Canada sont
                les mêmes. À 0&nbsp;%, tout est différent.
              </span>
            </span>
          </div>
          <span className="grad g0">0&nbsp;%</span>
          <span className="grad gm" style={{ left: `${s.habitualConvPct}%` }}>habituel</span>
          <span className="grad g1">100&nbsp;%</span>
        </div>
      </div>

      {tip && (
        <div className={`dot-tip on ${tip.side}`} style={{ left: tipX(tip.x), top: tipY(tip.y) }}>
          {tip.tagCls
            ? <span className={`saillance-tag ${tip.tagCls}`}>{tip.k}</span>
            : <span className="k">{tip.k}</span>}
          {tip.lead && <span className="lead">{tip.lead}</span>}
          {tip.body}
        </div>
      )}

      {/* Glyphe-légende qui suit le curseur au-dessus des zones (#308). Les
          points restent au-dessus des polygones : survoler un point masque le
          glyphe (mouseleave du polygone) au profit de l'infobulle. */}
      {zone && !tip && (
        <div
          ref={glyphRef}
          className={`zone-glyph ${zone}`}
          style={{ left: zonePos.current.x, top: zonePos.current.y }}
          aria-hidden
        >
          {zone === "qc" ? <Fleur /> : <span className="maple">🍁</span>}
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
