"use client";

import React, { useEffect, useRef, useState } from "react";
import type { AssembleeRow } from "@/lib/data/assemblee";

// Mini-jeu de billard : chaque parti est une bille texturée de son logo.
// On vise en glissant depuis la bille (comme un lance-pierre : on tire vers
// l'arrière, on relâche pour tirer dans la direction opposée), avec une
// vraie physique simplifiée (frottement, rebonds sur les bandes, collisions
// bille-bille). Chaque poche représente une facette différente de la donnée
// du parti (enjeu, ton, richesse lexicale, mots prononcés, ou une poche
// bonus) — l'empocher ouvre une fenêtre avec le profil du parti selon CETTE
// facette. Le popup reste ouvert tant que l'utilisateur ne le ferme pas
// lui-même (bouton ✕) ; c'est CE geste qui remet la bille en jeu, à un
// emplacement libre — pas de minuteur automatique (retour utilisateur du
// 2026-07-24 : l'utilisateur doit décider du rythme). Remplace l'ancien
// nuage de points (ton × richesse) : trop peu lisible, perdait de l'info
// sans repères clairs — retour utilisateur du 2026-07-23.
//
// Pas de lib de physique/jeu : boucle requestAnimationFrame maison, assez
// simple pour rester lisible.

// plq.svg est un lockup complet (écusson + texte empilé, cadre non carré) ;
// plq.png et pcq.png sont des icônes carrées déjà cadrées, comme les autres
// partis n'ont besoin d'aucun recadrage particulier.
const LOGO_EXT: Partial<Record<string, "png">> = { pcq: "png", plq: "png" };
function logoSrc(key: string): string {
  const ext = LOGO_EXT[key] ?? "svg";
  return `logos/parties/${key}.${ext}`;
}

const W = 900, H = 560;
// Les partis sans siège (ex. PCQ) n'ont aucune donnée de présence à jouer —
// gamifier leur absence donnerait la même non-réponse à chaque poche, ce qui
// casse la mécanique de récompense. Ils restent hors jeu mais visibles, sur
// un « banc » sous la table (bille en pointillé, hors du rectangle de jeu) —
// retour utilisateur du 2026-07-24.
const BENCH_H = 130;
const TABLE = { x: 60, y: 70, w: 780, h: 380 };
const BALL_R = 24;
const POCKET_R = 28; // plus grand que la bille : sinon on dirait qu'elle ne peut pas y entrer
const CATCH_R = 38; // rayon de capture généreux — le jeu doit rester jouable, pas un test d'adresse pointu
// Poches de coin décalées vers l'intérieur : le centre d'une bille ne peut
// jamais s'approcher du coin géométrique exact à moins de BALL_R*racine(2)
// (~34) à cause des rebonds sur les deux bandes, ce qui rendait ces poches
// mathématiquement impossibles à empocher (CATCH_R=30 < 34) — retour
// utilisateur du 2026-07-23.
const CORNER_INSET = 16;
const MAX_ENTRY_SPEED = 7.5; // trop vite = ça ne rentre pas, ça continue
const FRICTION = 0.965; // décélération plus franche : la bille redevient « capturable » plus vite
const BOUNCE_DAMPING = 0.72;
const BALL_RESTITUTION = 0.92; // collisions bille-bille : quasi élastique, un peu de perte
const STOP_EPSILON = 0.04;
const MAX_DRAG = 170; // px de glissement pour la puissance maximale
const MAX_SPEED = 12; // plafonné : au-delà, le pas par frame dépassait le rayon de capture et « sautait » par-dessus les poches

type PocketKind = "issue" | "tone" | "richness" | "words" | "bonus-angle" | "bonus-word";

type Pocket = { x: number; y: number; kind: PocketKind; label: string };

const POCKETS: Pocket[] = [
  { x: TABLE.x + CORNER_INSET, y: TABLE.y + CORNER_INSET, kind: "richness", label: "Richesse lexicale" },
  { x: TABLE.x + TABLE.w / 2, y: TABLE.y, kind: "words", label: "Mots prononcés" },
  { x: TABLE.x + TABLE.w - CORNER_INSET, y: TABLE.y + CORNER_INSET, kind: "tone", label: "Ton en chambre" },
  { x: TABLE.x + CORNER_INSET, y: TABLE.y + TABLE.h - CORNER_INSET, kind: "bonus-angle", label: "Angle éditorial" },
  { x: TABLE.x + TABLE.w / 2, y: TABLE.y + TABLE.h, kind: "issue", label: "Enjeu dominant" },
  { x: TABLE.x + TABLE.w - CORNER_INSET, y: TABLE.y + TABLE.h - CORNER_INSET, kind: "bonus-word", label: "Mot distinctif" },
];

type Ball = { key: string; row: AssembleeRow; x: number; y: number; vx: number; vy: number; sunk: boolean };

// Distance d'un point (la poche) au segment parcouru par la bille pendant
// une frame — un simple test au point d'arrivée laissait une bille rapide
// « sauter » par-dessus une poche sans jamais être échantillonnée dedans.
function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Position de départ : petit triangle centré, comme un rack — plus de sens
// à « scatter » sur des axes puisque la position n'encode plus de donnée.
function rackPositions(n: number): [number, number][] {
  const cx = TABLE.x + TABLE.w / 2, cy = TABLE.y + TABLE.h / 2;
  const spacing = BALL_R * 2.8;
  const out: [number, number][] = [];
  let row = 0, col = 0, idx = 0;
  while (out.length < n) {
    const rowCount = row + 1;
    const rowStartX = cx - ((rowCount - 1) * spacing) / 2;
    out.push([rowStartX + col * spacing, cy - row * spacing * (Math.sqrt(3) / 2)]);
    col++;
    idx++;
    if (col > row) { row++; col = 0; }
    if (idx > 20) break;
  }
  return out.slice(0, n);
}

// Position des billes « hors jeu » sur le banc, centrées sous la table.
function benchPositions(n: number, cy: number): [number, number][] {
  const cx = W / 2;
  const spacing = BALL_R * 2.8;
  const startX = cx - ((n - 1) * spacing) / 2;
  return Array.from({ length: n }, (_, i) => [startX + i * spacing, cy] as [number, number]);
}

// Mélange les places du rack (Fisher-Yates) : on ne veut pas que la
// disposition de départ soit identique à chaque changement d'onglet
// (dernière PdQ / session / législature) — retour utilisateur du 2026-07-23.
function shuffledRackPositions(n: number): [number, number][] {
  const positions = rackPositions(n);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions;
}

function formatWords(n: number): string {
  const s = String(Math.round(n || 0));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += " ";
    out += s[i];
  }
  return out;
}

// Chaque chiffre du popup doit rester lisible seul (l'absolu) tout en
// situant le parti par rapport aux autres (le relatif) — les deux doivent
// toujours être présents, pas seulement pour les partis en tête ou en queue
// de peloton — retour utilisateur du 2026-07-24.
function averageCompare(
  otherValues: number[],
  own: number,
  tolerance: number,
  above: (avg: number) => string,
  below: (avg: number) => string,
  similar: (avg: number) => string,
): string {
  if (otherValues.length === 0) return "";
  const avg = otherValues.reduce((s, v) => s + v, 0) / otherValues.length;
  const diff = own - avg;
  if (Math.abs(diff) < tolerance) return similar(avg);
  return diff > 0 ? above(avg) : below(avg);
}

// Chaque poche donne aussi de quoi situer le parti par rapport aux autres
// (pas seulement son chiffre isolé) — retour utilisateur du 2026-07-23.
function pocketResult(row: AssembleeRow, kind: PocketKind, allRows: AssembleeRow[]): { title: string; body: string } {
  const others = allRows.filter((r) => !r.inShadow && r.key !== row.key);
  switch (kind) {
    case "issue": {
      const top = row.enjeuStack?.[0];
      if (!top) return { title: "Enjeu dominant", body: "Aucun enjeu détecté cette période." };
      const sameTop = others.filter((r) => r.enjeuStack?.[0]?.label === top.label);
      const compare = sameTop.length === 0
        ? " Aucun autre parti actif ne place cet enjeu au premier rang."
        : ` ${sameTop.length} autre${sameTop.length > 1 ? "s" : ""} parti${sameTop.length > 1 ? "s" : ""} actif${sameTop.length > 1 ? "s" : ""} partage${sameTop.length > 1 ? "nt" : ""} aussi cette priorité.`;
      return { title: "Enjeu dominant", body: `${top.title}${compare}` };
    }
    case "tone": {
      const pct = row.toneLeftPct ?? 50;
      const dir = pct > 55 ? "plutôt positif" : pct < 45 ? "plutôt négatif" : "neutre";
      const compare = averageCompare(
        others.map((r) => r.toneLeftPct ?? 50),
        pct,
        3,
        (avg) => `Plus positif que la moyenne des autres partis actifs (${Math.round(avg)} % en moyenne).`,
        (avg) => `Plus négatif que la moyenne des autres partis actifs (${Math.round(avg)} % en moyenne).`,
        (avg) => `Comparable à la moyenne des autres partis actifs (${Math.round(avg)} % en moyenne).`,
      );
      return { title: "Ton en chambre", body: `${row.label} tient un ton ${dir} (${Math.round(pct)} % vers le pôle positif de l'échelle). ${compare}` };
    }
    case "richness": {
      const lvl = row.richnessLevel ?? 1;
      const compare = averageCompare(
        others.map((r) => r.richnessLevel ?? 1),
        lvl,
        0.4,
        (avg) => `Plus varié que la moyenne des autres partis actifs (${avg.toFixed(1)}/5 en moyenne).`,
        (avg) => `Moins varié que la moyenne des autres partis actifs (${avg.toFixed(1)}/5 en moyenne).`,
        (avg) => `Comparable à la moyenne des autres partis actifs (${avg.toFixed(1)}/5 en moyenne).`,
      );
      return { title: "Richesse lexicale", body: `Niveau ${lvl}/5 : diversité du vocabulaire employé cette période. ${compare}` };
    }
    case "words": {
      const raw = row.wordsRaw ?? 0;
      const compare = averageCompare(
        others.map((r) => r.wordsRaw ?? 0),
        raw,
        raw * 0.05 || 1,
        (avg) => `Plus loquace que la moyenne des autres partis actifs (${formatWords(avg)} mots en moyenne).`,
        (avg) => `Moins loquace que la moyenne des autres partis actifs (${formatWords(avg)} mots en moyenne).`,
        (avg) => `Comparable à la moyenne des autres partis actifs (${formatWords(avg)} mots en moyenne).`,
      );
      return { title: "Mots prononcés", body: `${row.wordsFormatted ?? "0"} mots prononcés cette période. ${compare}` };
    }
    case "bonus-angle":
      return { title: "Angle éditorial", body: row.editorialAngle || "Aucun angle éditorial généré pour cette période." };
    case "bonus-word":
      return row.signatureWord
        ? { title: "Mot distinctif", body: `« ${row.signatureWord} »${row.signatureWordContext ? ` (${row.signatureWordContext})` : ""}. Le mot qui distingue le plus ${row.label} des autres partis cette période.` }
        : { title: "Mot distinctif", body: "Calcul en cours, bientôt disponible." };
  }
}

type Popup = { row: AssembleeRow; kind: PocketKind };
type Aim = { key: string; startX: number; startY: number; curX: number; curY: number };

export function AssembleeBilliard({ rows, shadowRows = [] }: { rows: AssembleeRow[]; shadowRows?: AssembleeRow[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const ballsRef = useRef<Ball[]>([]);
  const ballNodesRef = useRef<Record<string, SVGGElement | null>>({});
  const rafRef = useRef<number | null>(null);
  const [aim, setAim] = useState<Aim | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const positions = shuffledRackPositions(rows.length);
    ballsRef.current = rows.map((row, i) => ({
      key: row.key, row, x: positions[i][0], y: positions[i][1], vx: 0, vy: 0, sunk: false,
    }));
    forceTick((t) => t + 1);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function applyTransforms() {
    for (const b of ballsRef.current) {
      const node = ballNodesRef.current[b.key];
      if (node) {
        node.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
        node.style.display = b.sunk ? "none" : "";
      }
    }
  }

  // Remet une bille empochée en jeu, à un emplacement libre — appelé
  // uniquement quand l'utilisateur ferme le popup (bouton ✕) : c'est à
  // lui de décider quand, pas un minuteur automatique — retour utilisateur
  // du 2026-07-24. Les autres billes ne bougent pas.
  function respawnBall(b: Ball) {
    const idx = ballsRef.current.indexOf(b);
    if (idx === -1) return; // les billes ont été remontées entre-temps (changement d'onglet)
    // Une bille encore sur la table peut ne plus être à sa place de rack
    // d'origine (poussée par une collision) : piocher un emplacement
    // vraiment libre plutôt que par index, sinon la bille qui revient peut
    // réapparaître exactement superposée à une autre (le test de collision
    // ignore les chevauchements à distance nulle).
    const others = ballsRef.current.filter((o) => o !== b && !o.sunk);
    const candidates = shuffledRackPositions(ballsRef.current.length);
    const free = candidates.find((pos) =>
      others.every((o) => Math.hypot(o.x - pos[0], o.y - pos[1]) >= BALL_R * 2 + 6));
    const chosen = free ?? candidates[idx];
    b.sunk = false; b.x = chosen[0]; b.y = chosen[1]; b.vx = 0; b.vy = 0;
    applyTransforms();
  }

  function step() {
    let moving = false;
    for (const b of ballsRef.current) {
      if (b.sunk) continue;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed < STOP_EPSILON) { b.vx = 0; b.vy = 0; continue; }
      moving = true;

      const nx = b.x + b.vx, ny = b.y + b.vy;

      // Capture testée sur tout le segment parcouru cette frame (pas
      // seulement le point d'arrivée) — trop vite, ça ne rentre pas.
      let captured = false;
      if (speed < MAX_ENTRY_SPEED) {
        for (const p of POCKETS) {
          if (pointSegmentDistance(p.x, p.y, b.x, b.y, nx, ny) < CATCH_R) {
            b.sunk = true; b.vx = 0; b.vy = 0; captured = true;
            setPopup({ row: b.row, kind: p.kind });
            break;
          }
        }
      }
      if (captured) continue;

      b.x = nx; b.y = ny;
      b.vx *= FRICTION; b.vy *= FRICTION;

      if (b.x - BALL_R < TABLE.x) { b.x = TABLE.x + BALL_R; b.vx = Math.abs(b.vx) * BOUNCE_DAMPING; }
      if (b.x + BALL_R > TABLE.x + TABLE.w) { b.x = TABLE.x + TABLE.w - BALL_R; b.vx = -Math.abs(b.vx) * BOUNCE_DAMPING; }
      if (b.y - BALL_R < TABLE.y) { b.y = TABLE.y + BALL_R; b.vy = Math.abs(b.vy) * BOUNCE_DAMPING; }
      if (b.y + BALL_R > TABLE.y + TABLE.h) { b.y = TABLE.y + TABLE.h - BALL_R; b.vy = -Math.abs(b.vy) * BOUNCE_DAMPING; }
    }

    // Collisions bille-bille : masses égales, on échange la composante de
    // vitesse le long de la normale de contact (élastique, léger amortissement).
    const balls = ballsRef.current;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.sunk) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.sunk) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = BALL_R * 2;
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = minDist - dist;
          a.x -= (nx * overlap) / 2; a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2; b.y += (ny * overlap) / 2;
          const avn = a.vx * nx + a.vy * ny;
          const bvn = b.vx * nx + b.vy * ny;
          const diff = (bvn - avn) * BALL_RESTITUTION;
          a.vx += diff * nx; a.vy += diff * ny;
          b.vx -= diff * nx; b.vy -= diff * ny;
          moving = true;
        }
      }
    }

    applyTransforms();
    if (moving) rafRef.current = requestAnimationFrame(step);
    else rafRef.current = null;
  }

  function startAim(e: React.PointerEvent<SVGGElement>, ball: Ball) {
    if (ball.sunk) return;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > STOP_EPSILON) return; // bille encore en mouvement : pas touche
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toSvgPoint(e);
    setAim({ key: ball.key, startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y });
  }

  function moveAim(e: React.PointerEvent<SVGGElement>) {
    if (!aim) return;
    const pt = toSvgPoint(e);
    setAim({ ...aim, curX: pt.x, curY: pt.y });
  }

  function releaseAim() {
    if (!aim) return;
    const ball = ballsRef.current.find((b) => b.key === aim.key);
    if (ball) {
      // Lance-pierre : on tire vers l'arrière, la bille part dans le sens opposé.
      const dx = aim.startX - aim.curX, dy = aim.startY - aim.curY;
      const dragDist = Math.min(Math.hypot(dx, dy), MAX_DRAG);
      const power = (dragDist / MAX_DRAG) * MAX_SPEED;
      const norm = Math.hypot(dx, dy) || 1;
      ball.vx = (dx / norm) * power;
      ball.vy = (dy / norm) * power;
      if (!rafRef.current && power > 0.3) rafRef.current = requestAnimationFrame(step);
    }
    setAim(null);
  }

  function toSvgPoint(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(screenCTM.inverse());
    return { x: loc.x, y: loc.y };
  }

  const aimingBall = aim ? ballsRef.current.find((b) => b.key === aim.key) : null;
  const svgHeight = H + (shadowRows.length > 0 ? BENCH_H : 0);
  const benchCy = H + 55;
  const benchPos = benchPositions(shadowRows.length, benchCy);

  return (
    <div className="ass-billiard-wrap">
      <svg
        ref={svgRef}
        className="ass-billiard"
        viewBox={`0 0 ${W} ${svgHeight}`}
        role="group"
        aria-label="Jeu de billard : vise une bille vers une poche pour découvrir le profil du parti selon cette facette"
        onPointerMove={moveAim}
        onPointerUp={releaseAim}
        onPointerCancel={() => setAim(null)}
      >
        <rect className="billiard-table" x={TABLE.x} y={TABLE.y} width={TABLE.w} height={TABLE.h} />

        {POCKETS.map((p, i) => (
          <g key={i}>
            <circle className="billiard-pocket" cx={p.x} cy={p.y} r={POCKET_R} />
            <text
              className="billiard-pocket-lab"
              x={p.x}
              y={p.y > TABLE.y + TABLE.h / 2 ? p.y + POCKET_R + 12 : p.y - POCKET_R - 6}
              textAnchor="middle"
            >
              {p.label.toUpperCase()}
            </text>
          </g>
        ))}

        {aimingBall && aim && (
          <line
            className="billiard-aim-line"
            x1={aimingBall.x} y1={aimingBall.y}
            x2={aimingBall.x + (aimingBall.x - aim.curX)} y2={aimingBall.y + (aimingBall.y - aim.curY)}
          />
        )}

        <defs>
          {[...rows, ...shadowRows].map((row) => (
            <clipPath key={`clip-${row.key}`} id={`ball-clip-${row.key}`}>
              <circle cx={0} cy={0} r={BALL_R} />
            </clipPath>
          ))}
        </defs>

        {ballsRef.current.map((ball) => (
          <g
            key={ball.key}
            ref={(node) => { ballNodesRef.current[ball.key] = node; }}
            className="billiard-ball"
            style={{ transform: `translate(${ball.x}px, ${ball.y}px)` }}
            tabIndex={0}
            role="img"
            aria-label={`${ball.row.label} : glisser pour viser une poche`}
            onPointerDown={(e) => startAim(e, ball)}
          >
            <circle className="ball-shadow" cx={2} cy={4} r={BALL_R} />
            <circle className="ball-ring" cx={0} cy={0} r={BALL_R + 3} style={{ stroke: ball.row.color }} />
            <g clipPath={`url(#ball-clip-${ball.key})`}>
              <circle cx={0} cy={0} r={BALL_R} className="ball-bg" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <image href={logoSrc(ball.key)} x={-BALL_R} y={-BALL_R} width={BALL_R * 2} height={BALL_R * 2} preserveAspectRatio="xMidYMid meet" />
            </g>
          </g>
        ))}

        {shadowRows.length > 0 && (
          <g>
            <line className="billiard-bench-rule" x1={TABLE.x} y1={H + 15} x2={TABLE.x + TABLE.w} y2={H + 15} />
            <text className="billiard-bench-lab" x={W / 2} y={H + 5} textAnchor="middle">Hors chambre</text>
            {shadowRows.map((row, i) => {
              const [x, y] = benchPos[i];
              return (
                <g
                  key={row.key}
                  className="billiard-ghost-ball"
                  transform={`translate(${x}, ${y})`}
                  role="img"
                  aria-label={`${row.label} : aucun député élu à l'Assemblée nationale en cette législature`}
                >
                  <circle className="ghost-ring" cx={0} cy={0} r={BALL_R + 3} style={{ stroke: row.color }} />
                  <g clipPath={`url(#ball-clip-${row.key})`}>
                    <circle cx={0} cy={0} r={BALL_R} className="ghost-bg" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <image href={logoSrc(row.key)} x={-BALL_R} y={-BALL_R} width={BALL_R * 2} height={BALL_R * 2} preserveAspectRatio="xMidYMid meet" />
                  </g>
                  <text className="billiard-ghost-lab" y={BALL_R + 20} textAnchor="middle">{row.label}</text>
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {popup && (
        <div className="billiard-popup" role="dialog" aria-label={`Profil de ${popup.row.label}`}>
          <button
            type="button"
            className="billiard-popup-close"
            onClick={() => {
              const b = ballsRef.current.find((x) => x.key === popup.row.key);
              if (b) respawnBall(b);
              setPopup(null);
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
          <span className="k">{popup.row.label}</span>
          <p className="pocket-title">{pocketResult(popup.row, popup.kind, rows).title}</p>
          <p className="pocket-body">{pocketResult(popup.row, popup.kind, rows).body}</p>
        </div>
      )}
    </div>
  );
}
