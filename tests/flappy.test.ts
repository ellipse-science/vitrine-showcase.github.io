import { describe, it, expect } from "vitest";
import {
  KONAMI, matchKonami, stepPhysics, hitTest, insertScore, sanitizeInitials,
  CFG, type GameState, type ScoreEntry,
} from "../lib/flappy";

const fresh = (): GameState => ({ bird: { y: 100, vy: 0 }, pipes: [], score: 0, over: false, t: 0 });

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

describe("stepPhysics", () => {
  it("applies gravity when not flapping", () => {
    const s = stepPhysics(fresh(), 16, false, 12);
    expect(s.bird.vy).toBeGreaterThan(0);
    expect(s.bird.y).toBeGreaterThan(100);
  });
  it("flap sets an upward velocity", () => {
    const s = stepPhysics(fresh(), 16, true, 12);
    expect(s.bird.vy).toBe(CFG.flapV);
  });
  it("spawns pipes over time and scrolls them left", () => {
    let s = fresh();
    for (let i = 0; i < 120; i++) s = stepPhysics(s, 16, false, 12);
    expect(s.pipes.length).toBeGreaterThan(0);
    const x0 = s.pipes[0].x;
    s = stepPhysics(s, 16, false, 12);
    expect(s.pipes[0].x).toBeLessThan(x0);
  });
  it("does not mutate the input state", () => {
    const s = fresh(); const y = s.bird.y;
    stepPhysics(s, 16, true, 12);
    expect(s.bird.y).toBe(y);
  });
});

describe("hitTest", () => {
  it("is false when the bird is in open space", () => {
    expect(hitTest(fresh())).toBe(false);
  });
  it("is true when the bird hits the floor", () => {
    const s = fresh(); s.bird.y = CFG.height + 10;
    expect(hitTest(s)).toBe(true);
  });
  it("is true when overlapping a pipe outside its gap", () => {
    const s = fresh();
    s.bird.y = 5; // near ceiling, above any reasonable gap
    s.pipes = [{ x: CFG.birdX, gapY: 200, issueIndex: 0, passed: false }];
    expect(hitTest(s)).toBe(true);
  });
  it("is false when passing through the gap", () => {
    const s = fresh();
    s.pipes = [{ x: CFG.birdX, gapY: s.bird.y, issueIndex: 0, passed: false }];
    expect(hitTest(s)).toBe(false);
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
  it("uppercases and keeps only letters, max 3", () => {
    expect(sanitizeInitials("ab3c")).toBe("ABC");
    expect(sanitizeInitials("z")).toBe("Z");
  });
  it("replaces blocked words", () => {
    expect(sanitizeInitials("ass")).toBe("AAA");
  });
});
