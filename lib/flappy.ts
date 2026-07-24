// lib/flappy.ts — pure, DOM-free game logic (testable).

export const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a",
];

export function matchKonami(recent: string[]): boolean {
  if (recent.length < KONAMI.length) return false;
  const tail = recent.slice(-KONAMI.length);
  return tail.every((k, i) => k.toLowerCase() === KONAMI[i].toLowerCase());
}

export const CFG = {
  width: 640,
  height: 360,
  birdX: 120,
  birdR: 14,       // demi-taille de collision de l'oiseau
  gravity: 0.0016, // px / ms^2
  flapV: -0.42,    // px / ms
  maxVy: 0.7,
  pipeW: 62,
  gap: 130,        // hauteur de l'ouverture
  pipeSpeed: 0.18, // px / ms
  spawnEveryMs: 1500,
  margin: 60,      // marge haute/basse pour le centre du gap
};

export type Bird = { y: number; vy: number };
export type Pipe = { x: number; gapY: number; issueIndex: number; passed: boolean };
export type GameState = { bird: Bird; pipes: Pipe[]; score: number; over: boolean; t: number };

export function stepPhysics(s: GameState, dtMs: number, flap: boolean, nIssues: number): GameState {
  const dt = Math.min(dtMs, 40); // borne anti-saut (onglet en arrière-plan)
  let vy = flap ? CFG.flapV : s.bird.vy + CFG.gravity * dt;
  vy = Math.max(-CFG.maxVy, Math.min(CFG.maxVy, vy));
  const bird = { y: s.bird.y + vy * dt, vy };

  const prevT = s.t;
  const t = prevT + dt;
  const pipes = s.pipes
    .map((p) => ({ ...p, x: p.x - CFG.pipeSpeed * dt }))
    .filter((p) => p.x + CFG.pipeW > 0);

  // spawn déterministe basé sur le temps (pas de Math.random pour rester testable/pur)
  const spawnsBefore = Math.floor(prevT / CFG.spawnEveryMs);
  const spawnsAfter = Math.floor(t / CFG.spawnEveryMs);
  if (spawnsAfter > spawnsBefore && nIssues > 0) {
    const seq = spawnsAfter;
    const gapY = CFG.margin + ((seq * 97) % (CFG.height - 2 * CFG.margin));
    pipes.push({ x: CFG.width, gapY, issueIndex: seq % nIssues, passed: false });
  }

  // score : franchissement de birdX
  let score = s.score;
  for (const p of pipes) {
    if (!p.passed && p.x + CFG.pipeW < CFG.birdX) {
      p.passed = true;
      score += 1;
    }
  }
  return { bird, pipes, score, over: s.over, t };
}

export function hitTest(s: GameState): boolean {
  const { y } = s.bird;
  if (y - CFG.birdR < 0 || y + CFG.birdR > CFG.height) return true;
  for (const p of s.pipes) {
    const overlapX = CFG.birdX + CFG.birdR > p.x && CFG.birdX - CFG.birdR < p.x + CFG.pipeW;
    if (!overlapX) continue;
    const inGap = y - CFG.birdR > p.gapY - CFG.gap / 2 && y + CFG.birdR < p.gapY + CFG.gap / 2;
    if (!inGap) return true;
  }
  return false;
}

export type ScoreEntry = { initials: string; score: number; date: string };

export function insertScore(board: ScoreEntry[], e: ScoreEntry): ScoreEntry[] {
  return [...board, e].sort((a, b) => b.score - a.score).slice(0, 10);
}

const BLOCK = new Set(["ASS", "FUK", "FUC", "SEX", "FAG", "CUL", "PD"]);

export function sanitizeInitials(raw: string): string {
  const up = (raw || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  return BLOCK.has(up) ? "AAA" : up;
}
