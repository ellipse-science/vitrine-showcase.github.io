// lib/flappy.ts — pure, DOM-free game logic (testable).
// « Chasse à la une » : flappy classique à une ouverture, qui durcit avec le score ;
// chaque tuyau est un enjeu, on marque un SCOOP en franchissant l'enjeu cible.

export const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a",
];

export function matchKonami(recent: string[]): boolean {
  if (recent.length < KONAMI.length) return false;
  const tail = recent.slice(-KONAMI.length);
  return tail.every((k, i) => k.toLowerCase() === KONAMI[i].toLowerCase());
}

// Espace de coordonnées interne fixe (le canvas est mis à l'échelle par le CSS).
export const FIELD = { width: 900, height: 600, birdX: 220, birdR: 17, pipeW: 104, pad: 46 };
export const PHYS = { gravity: 0.0019, flapV: -0.62, maxVy: 1.0 };

export type Bird = { y: number; vy: number };
export type Pipe = { id: number; x: number; gapY: number; issueIndex: number; passed: boolean };
export type GameState = { bird: Bird; pipes: Pipe[]; t: number; seq: number };

export function newGame(): GameState {
  return { bird: { y: FIELD.height / 2, vy: 0 }, pipes: [], t: 0, seq: 0 };
}

export type Diff = { gap: number; speed: number; spawnMs: number };

// Durcit avec le score (comme le Flappy Bird original) : l'ouverture rétrécit,
// la vitesse et la cadence d'apparition montent.
export function difficultyFor(score: number): Diff {
  const s = Math.max(0, score);
  return {
    gap: Math.max(155, 250 - s * 2.4),        // 250 -> 155
    speed: Math.min(0.46, 0.22 + s * 0.007),  // 0.22 -> 0.46
    spawnMs: Math.max(950, 1650 - s * 26),    // 1650 -> 950
  };
}

// LCG déterministe -> [0,1)
function rand(seed: number): number {
  return ((Math.imul(seed ^ 0x9e3779b9, 1103515245) + 12345) >>> 0) / 0x100000000;
}

// Choix pondéré (par saillance) déterministe depuis un seed, en évitant `avoid`.
export function nextTarget(weights: number[], seed: number, avoid: number): number {
  const n = weights.length;
  if (n === 0) return 0;
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0.0001));
  const total = w.reduce((a, b) => a + b, 0);
  let x = rand(seed) * total;
  let pick = n - 1;
  for (let i = 0; i < n; i++) { x -= w[i]; if (x <= 0) { pick = i; break; } }
  if (pick === avoid && n > 1) pick = (pick + 1) % n;
  return pick;
}

// Points d'un SCOOP selon le combo courant (avant incrément) : 2, 3, 4 … plafonné.
export function comboPoints(combo: number): number {
  return 2 + Math.min(Math.max(combo, 0), 7);
}

export function stepPhysics(s: GameState, dtMs: number, flap: boolean, diff: Diff, weights: number[]): GameState {
  const nIssues = weights.length;
  const dt = Math.min(dtMs, 40); // borne anti-saut (onglet en arrière-plan)
  let vy = flap ? PHYS.flapV : s.bird.vy + PHYS.gravity * dt;
  vy = Math.max(-PHYS.maxVy, Math.min(PHYS.maxVy, vy));
  const bird = { y: s.bird.y + vy * dt, vy };

  const prevT = s.t; const t = prevT + dt;
  let seq = s.seq;
  const pipes = s.pipes
    .map((p) => ({ ...p, x: p.x - diff.speed * dt }))
    .filter((p) => p.x + FIELD.pipeW > 0);

  const spawnsBefore = Math.floor(prevT / diff.spawnMs);
  const spawnsAfter = Math.floor(t / diff.spawnMs);
  if (spawnsAfter > spawnsBefore && nIssues > 0) {
    seq += 1;
    const lo = diff.gap / 2 + FIELD.pad;
    const hi = FIELD.height - diff.gap / 2 - FIELD.pad;
    const gapY = lo + rand(seq * 2654435761) * Math.max(1, hi - lo);
    const issueIndex = nextTarget(weights, seq * 40503, -1);
    pipes.push({ id: seq, x: FIELD.width, gapY, issueIndex, passed: false });
  }

  // marque « passé » quand le tuyau franchit la ligne de l'oiseau (le score est géré au-dessus)
  for (const p of pipes) if (!p.passed && p.x + FIELD.pipeW < FIELD.birdX) p.passed = true;

  return { bird, pipes, t, seq };
}

export function hitTest(s: GameState, diff: Diff): boolean {
  const { y } = s.bird;
  if (y - FIELD.birdR < 0 || y + FIELD.birdR > FIELD.height) return true;
  for (const p of s.pipes) {
    const overlapX = FIELD.birdX + FIELD.birdR > p.x && FIELD.birdX - FIELD.birdR < p.x + FIELD.pipeW;
    if (!overlapX) continue;
    const inGap = y - FIELD.birdR > p.gapY - diff.gap / 2 && y + FIELD.birdR < p.gapY + diff.gap / 2;
    if (!inGap) return true;
  }
  return false;
}

export type ScoreEntry = { initials: string; score: number; date: string };

export function insertScore(board: ScoreEntry[], e: ScoreEntry): ScoreEntry[] {
  return [...board, e].sort((a, b) => b.score - a.score).slice(0, 10);
}

const BLOCK = ["ASS", "FUK", "FUC", "SEX", "FAG", "CUL", "PD"];

// Par SOUS-CHAÎNE, pas par égalité : l'égalité bloquait « ASS » mais laissait
// passer « ASSHOLE » (7 caractères, une requête). Tant que l'écriture était
// révoquée (#491), c'était théorique ; depuis que la soumission est rouverte à
// tous (issue #499), ce filtre est la seule barrière d'un tableau public —
// revue d'AdriClout sur #545. Sur-bloquer un pseudo innocent coûte « PLAYER » ;
// laisser passer une grossièreté coûte la page d'accueil.
export function sanitizeInitials(raw: string): string {
  const up = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  return BLOCK.some((w) => up.includes(w)) ? "PLAYER" : up;
}
