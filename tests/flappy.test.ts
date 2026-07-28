import { describe, it, expect } from "vitest";
import {
  KONAMI, matchKonami, stepPhysics, hitTest, insertScore, sanitizeInitials,
  difficultyFor, nextTarget, comboPoints, newGame, FIELD, PHYS,
  type GameState, type ScoreEntry, type Diff,
} from "../lib/flappy";

const W = [1, 1, 1, 1]; // poids uniformes (4 enjeux)
const easy: Diff = difficultyFor(0);

describe("matchKonami", () => {
  it("matches the full sequence at the tail", () => {
    expect(matchKonami([...KONAMI])).toBe(true);
    expect(matchKonami(["x", "y", ...KONAMI])).toBe(true);
  });
  it("rejects wrong or partial sequences", () => {
    expect(matchKonami(KONAMI.slice(1))).toBe(false);
    expect(matchKonami(["a", "b"])).toBe(false);
  });
});

describe("difficultyFor", () => {
  it("narrows the gap and speeds up as score rises", () => {
    const a = difficultyFor(0), b = difficultyFor(50);
    expect(b.gap).toBeLessThan(a.gap);
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(b.spawnMs).toBeLessThan(a.spawnMs);
  });
  it("clamps to sane floors at very high score", () => {
    const d = difficultyFor(10000);
    expect(d.gap).toBeGreaterThanOrEqual(155);
    expect(d.speed).toBeLessThanOrEqual(0.46);
    expect(d.spawnMs).toBeGreaterThanOrEqual(950);
  });
});

describe("nextTarget", () => {
  it("returns an in-range index", () => {
    for (let seed = 0; seed < 20; seed++) {
      const t = nextTarget(W, seed, -1);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(W.length);
    }
  });
  it("avoids the given index", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(nextTarget(W, seed, 2)).not.toBe(2);
    }
  });
  it("is deterministic for a given seed", () => {
    expect(nextTarget(W, 7, -1)).toBe(nextTarget(W, 7, -1));
  });
});

describe("comboPoints", () => {
  it("grows with combo then caps", () => {
    expect(comboPoints(0)).toBe(2);
    expect(comboPoints(1)).toBe(3);
    expect(comboPoints(100)).toBe(9);
  });
});

describe("stepPhysics", () => {
  it("applies gravity when not flapping", () => {
    const s = stepPhysics(newGame(), 16, false, easy, W);
    expect(s.bird.vy).toBeGreaterThan(0);
    expect(s.bird.y).toBeGreaterThan(FIELD.height / 2);
  });
  it("flap sets an upward velocity", () => {
    const s = stepPhysics(newGame(), 16, true, easy, W);
    expect(s.bird.vy).toBe(PHYS.flapV);
  });
  it("spawns pipes over time (with valid issue index) and scrolls them left", () => {
    let s = newGame();
    for (let i = 0; i < 140; i++) s = stepPhysics(s, 16, false, easy, W);
    expect(s.pipes.length).toBeGreaterThan(0);
    expect(s.pipes[0].issueIndex).toBeGreaterThanOrEqual(0);
    expect(s.pipes[0].issueIndex).toBeLessThan(W.length);
    const x0 = s.pipes[0].x;
    s = stepPhysics(s, 16, false, easy, W);
    expect(s.pipes[0].x).toBeLessThan(x0);
  });
  it("keeps spawned gaps within the playable band", () => {
    let s = newGame();
    for (let i = 0; i < 400; i++) s = stepPhysics(s, 16, false, easy, W);
    for (const p of s.pipes) {
      expect(p.gapY - easy.gap / 2).toBeGreaterThanOrEqual(FIELD.pad - 1);
      expect(p.gapY + easy.gap / 2).toBeLessThanOrEqual(FIELD.height - FIELD.pad + 1);
    }
  });
  it("does not mutate the input state", () => {
    const s = newGame(); const y = s.bird.y;
    stepPhysics(s, 16, true, easy, W);
    expect(s.bird.y).toBe(y);
  });
});

describe("hitTest", () => {
  it("is false when the bird is in open space", () => {
    expect(hitTest(newGame(), easy)).toBe(false);
  });
  it("is true when the bird hits the floor", () => {
    const s = newGame(); s.bird.y = FIELD.height + 10;
    expect(hitTest(s, easy)).toBe(true);
  });
  it("is true when overlapping a pipe outside its gap", () => {
    const s = newGame();
    s.bird.y = 5;
    s.pipes = [{ id: 1, x: FIELD.birdX, gapY: 300, issueIndex: 0, passed: false }];
    expect(hitTest(s, easy)).toBe(true);
  });
  it("is false when passing through the gap", () => {
    const s = newGame();
    s.pipes = [{ id: 1, x: FIELD.birdX, gapY: s.bird.y, issueIndex: 0, passed: false }];
    expect(hitTest(s, easy)).toBe(false);
  });
});

describe("insertScore", () => {
  it("keeps entries sorted descending", () => {
    let b: ScoreEntry[] = [];
    b = insertScore(b, { initials: "AAA", score: 5, date: "" });
    b = insertScore(b, { initials: "BBB", score: 9, date: "" });
    expect(b.map((x) => x.score)).toEqual([9, 5]);
  });
  it("caps at 10", () => {
    let b: ScoreEntry[] = [];
    for (let i = 0; i < 15; i++) b = insertScore(b, { initials: "AAA", score: i, date: "" });
    expect(b.length).toBe(10);
    expect(b[0].score).toBe(14);
  });
});

describe("sanitizeInitials", () => {
  it("uppercases and keeps only letters and numbers, max 7", () => {
    expect(sanitizeInitials("ab3cdefgh")).toBe("AB3CDEF");
    expect(sanitizeInitials("z")).toBe("Z");
  });
  it("replaces blocked words", () => {
    expect(sanitizeInitials("ass")).toBe("PLAYER");
  });
});
