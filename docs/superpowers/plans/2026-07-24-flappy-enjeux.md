# Flappy Enjeux Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden Flappy-Bird easter egg to the « De quoi parle-t-on? » module: the Konami code turns the "Ce mois" panel into a game whose obstacles are the 12 issues, with a local 3-initials leaderboard.

**Architecture:** Pure, testable game logic in `lib/flappy.ts`; a `useKonamiCode` hook; a self-contained `FlappyEnjeux` client component (canvas + rAF loop + game-over + initials + leaderboard); a minimal graft into `TreemapClient`; `.flappy-*` CSS. No new dependencies, local-only persistence.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, `<canvas>` + `requestAnimationFrame`, `localStorage`, vitest.

## Global Constraints

- No new npm dependencies.
- Client-only APIs (`window`, `document`, `localStorage`, canvas) guarded for SSR (touched only inside effects/handlers, never at module top level or render).
- Commits: no `Co-Authored-By`; provenance trailer `Assisted-by: Claude Code (Opus 4.8)` only (repo hard rule #8).
- French UI copy; no em-dash; non-breaking spaces before `:` `;` `?` `!` `%`.
- Renders game only under secret mode; default views + backfilled month data unaffected.
- Reuse `TreemapIssueTile` from `lib/data/headlineEvents.ts` (`issueFr: string`, `color: string`).

---

### Task 1: Pure game logic + tests (`lib/flappy.ts`)

**Files:**
- Create: `lib/flappy.ts`
- Test: `tests/flappy.test.ts`

**Interfaces:**
- Produces:
  - `KONAMI: string[]` — the sequence of `KeyboardEvent.key` values.
  - `matchKonami(recent: string[]): boolean` — true if the tail of `recent` equals `KONAMI`.
  - `type Bird = { y: number; vy: number }`
  - `type Pipe = { x: number; gapY: number; issueIndex: number; passed: boolean }`
  - `type GameState = { bird: Bird; pipes: Pipe[]; score: number; over: boolean; t: number }`
  - `const CFG` — tuning constants (see code).
  - `stepPhysics(s: GameState, dtMs: number, flap: boolean, nIssues: number): GameState` — advances one frame (pure; returns new state).
  - `hitTest(s: GameState): boolean` — collision with a pipe, floor, or ceiling.
  - `type ScoreEntry = { initials: string; score: number; date: string }`
  - `insertScore(board: ScoreEntry[], e: ScoreEntry): ScoreEntry[]` — sorted desc, capped at 10.
  - `sanitizeInitials(raw: string): string` — up to 3 chars, A–Z uppercased, profanity → `"AAA"`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/flappy.test.ts
import { describe, it, expect } from "vitest";
import {
  KONAMI, matchKonami, stepPhysics, hitTest, insertScore, sanitizeInitials,
  CFG, type GameState,
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
    let b: any[] = [];
    b = insertScore(b, { initials: "AAA", score: 5, date: "" });
    b = insertScore(b, { initials: "BBB", score: 9, date: "" });
    expect(b.map((x) => x.score)).toEqual([9, 5]);
  });
  it("caps at 10", () => {
    let b: any[] = [];
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/flappy.test.ts`
Expected: FAIL (`Cannot find module '../lib/flappy'`).

- [ ] **Step 3: Implement `lib/flappy.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/flappy.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/flappy.ts tests/flappy.test.ts
git commit -m "feat: pure Flappy Enjeux game logic + tests

Assisted-by: Claude Code (Opus 4.8)"
```

---

### Task 2: Konami hook (`useKonamiCode`)

**Files:**
- Create: `components/interactive/useKonamiCode.ts`

**Interfaces:**
- Consumes: `matchKonami`, `KONAMI` from `lib/flappy`.
- Produces: `useKonamiCode(onUnlock: () => void): void` — attaches a `window` keydown listener; calls `onUnlock` once the sequence completes.

- [ ] **Step 1: Implement the hook**

```ts
// components/interactive/useKonamiCode.ts
import { useEffect, useRef } from "react";
import { KONAMI, matchKonami } from "@/lib/flappy";

export function useKonamiCode(onUnlock: () => void): void {
  const buf = useRef<string[]>([]);
  const cb = useRef(onUnlock);
  cb.current = onUnlock;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      buf.current = [...buf.current, e.key].slice(-KONAMI.length);
      if (matchKonami(buf.current)) {
        buf.current = [];
        cb.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from the new file).

- [ ] **Step 3: Commit**

```bash
git add components/interactive/useKonamiCode.ts
git commit -m "feat: useKonamiCode hook

Assisted-by: Claude Code (Opus 4.8)"
```

---

### Task 3: Game component (`FlappyEnjeux.tsx`)

**Files:**
- Create: `components/interactive/FlappyEnjeux.tsx`

**Interfaces:**
- Consumes: `CFG`, `stepPhysics`, `hitTest`, `insertScore`, `sanitizeInitials`, types `GameState`, `ScoreEntry` from `lib/flappy`; `TreemapIssueTile` from `lib/data/headlineEvents`.
- Produces: `export function FlappyEnjeux({ tiles, onExit }: { tiles: TreemapIssueTile[]; onExit: () => void }): JSX.Element`
- Behaviour contract:
  - Phases: `"ready" | "playing" | "over"`.
  - rAF loop drives `stepPhysics`; on `hitTest` → phase `"over"`, freeze.
  - Flap on Space / ArrowUp / pointer-down on the canvas; from `"ready"` first flap starts play; from `"over"`, "Rejouer" resets. Space/ArrowUp/Escape call `e.preventDefault()` while playing to avoid scrolling; Escape → `onExit()`.
  - Pipes drawn with `tiles[issueIndex].color`; label `tiles[issueIndex].issueFr` rotated on the pipe. Bird = `ctx.fillText("📰", …)`.
  - localStorage key `"vitrine-flappy-scores"`, read/write wrapped in try/catch; `loadBoard()` returns `[]` on any failure.
  - On game over: if `insertScore(board, {score,…})` would place the run in the list, show a 3-letter `<input maxLength={3}>` (value passed through `sanitizeInitials` on change); "Enregistrer" persists and shows the ranked board with the new row highlighted. If not a top score, show the board read-only.

- [ ] **Step 1: Implement the component**

```tsx
// components/interactive/FlappyEnjeux.tsx
"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TreemapIssueTile } from "@/lib/data/headlineEvents";
import {
  CFG, stepPhysics, hitTest, insertScore, sanitizeInitials,
  type GameState, type ScoreEntry,
} from "@/lib/flappy";

const KEY = "vitrine-flappy-scores";
const initial = (): GameState => ({ bird: { y: CFG.height / 2, vy: 0 }, pipes: [], score: 0, over: false, t: 0 });

function loadBoard(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveBoard(b: ScoreEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* quota / privé : on ignore */ }
}

export function FlappyEnjeux({ tiles, onExit }: { tiles: TreemapIssueTile[]; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(initial());
  const flapRef = useRef(false);
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [finalScore, setFinalScore] = useState(0);
  const [board, setBoard] = useState<ScoreEntry[]>([]);
  const [initials, setInitials] = useState("");
  const [saved, setSaved] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const draw = useCallback((s: GameState) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CFG.width, CFG.height);
    ctx.fillStyle = "#F7F4EF"; ctx.fillRect(0, 0, CFG.width, CFG.height);
    for (const p of s.pipes) {
      const tile = tiles[p.issueIndex % Math.max(tiles.length, 1)];
      ctx.fillStyle = tile?.color ?? "#463E3E";
      ctx.fillRect(p.x, 0, CFG.pipeW, p.gapY - CFG.gap / 2);
      ctx.fillRect(p.x, p.gapY + CFG.gap / 2, CFG.pipeW, CFG.height - (p.gapY + CFG.gap / 2));
      ctx.save();
      ctx.translate(p.x + CFG.pipeW / 2, p.gapY - CFG.gap / 2 - 8);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#2b2b2b"; ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(tile?.issueFr ?? "", 0, 4);
      ctx.restore();
    }
    ctx.font = "24px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("📰", CFG.birdX, s.bird.y);
    ctx.fillStyle = "#463E3E"; ctx.font = "600 16px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(String(s.score), 12, 24);
  }, [tiles]);

  // boucle rAF
  useEffect(() => {
    let raf = 0; let last = 0;
    const loop = (ts: number) => {
      const dt = last ? ts - last : 16; last = ts;
      if (phaseRef.current === "playing" && !document.hidden) {
        let s = stepPhysics(stateRef.current, dt, flapRef.current, tiles.length);
        flapRef.current = false;
        if (hitTest(s)) {
          s = { ...s, over: true };
          stateRef.current = s;
          setFinalScore(s.score);
          setBoard(loadBoard());
          setSaved(false); setInitials("");
          setPhase("over");
        } else {
          stateRef.current = s;
        }
      }
      draw(stateRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, tiles.length]);

  const flap = useCallback(() => {
    if (phaseRef.current === "ready") { stateRef.current = initial(); setPhase("playing"); }
    if (phaseRef.current === "playing") flapRef.current = true;
  }, []);

  // clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onExit(); return; }
      if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, onExit]);

  const restart = () => { stateRef.current = initial(); setPhase("ready"); };
  const qualifies = insertScore(board, { initials: "___", score: finalScore, date: "" })
    .some((e) => e.initials === "___" && e.score === finalScore);

  const save = () => {
    const nb = insertScore(board, { initials: sanitizeInitials(initials) || "AAA", score: finalScore, date: new Date().toISOString().slice(0, 10) });
    saveBoard(nb); setBoard(nb); setSaved(true);
  };

  return (
    <div className="flappy" role="group" aria-label="Jeu caché : Flappy Enjeux">
      <div className="flappy-stage">
        <canvas
          ref={canvasRef} width={CFG.width} height={CFG.height} className="flappy-canvas"
          role="img" aria-label={`Flappy Enjeux, score ${stateRef.current.score}`}
          onPointerDown={(e) => { e.preventDefault(); flap(); }}
        />
        {phase === "ready" && (
          <div className="flappy-overlay">
            <p className="flappy-title">Flappy Enjeux</p>
            <p className="flappy-hint">Espace / ↑ / toucher pour voler. Franchis les enjeux. Échap pour quitter.</p>
          </div>
        )}
        {phase === "over" && (
          <div className="flappy-overlay">
            <p className="flappy-title">Partie terminée</p>
            <p className="flappy-score">Score : {finalScore}</p>
            {qualifies && !saved && (
              <div className="flappy-initials">
                <label htmlFor="fi">Tes initiales</label>
                <input id="fi" value={initials} maxLength={3}
                  onChange={(e) => setInitials(sanitizeInitials(e.target.value))} autoComplete="off" />
                <button type="button" onClick={save}>Enregistrer</button>
              </div>
            )}
            {(saved || !qualifies) && (
              <ol className="flappy-board">
                {board.map((e, i) => (
                  <li key={i} className={saved && e.initials === (sanitizeInitials(initials) || "AAA") && e.score === finalScore ? "is-new" : undefined}>
                    <span>{i + 1}</span><span>{e.initials}</span><span>{e.score}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="flappy-actions">
              <button type="button" onClick={restart}>Rejouer</button>
              <button type="button" onClick={onExit}>Quitter ✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/interactive/FlappyEnjeux.tsx
git commit -m "feat: FlappyEnjeux game component (canvas + leaderboard)

Assisted-by: Claude Code (Opus 4.8)"
```

---

### Task 4: Integrate into `TreemapClient` + styles

**Files:**
- Modify: `components/interactive/TreemapClient.tsx` (imports; `secret` state + hook; conditional render at the month branch ~line 410-412)
- Modify: `app/globals.css` (append `.flappy-*` block)

**Interfaces:**
- Consumes: `useKonamiCode`, `FlappyEnjeux`.

- [ ] **Step 1: Add imports + hook + state in `TreemapClient`**

At the top of the file, after the existing React import, add:

```tsx
import { useKonamiCode } from "./useKonamiCode";
import { FlappyEnjeux } from "./FlappyEnjeux";
```

Inside `TreemapClient`, after `const [period, setPeriod] = useState<...>("day");` add:

```tsx
  const [secret, setSecret] = useState(false);
  useKonamiCode(() => { setPeriod("month"); setSecret(true); });
```

- [ ] **Step 2: Swap the month view for the game when secret is on**

Replace the else-branch that renders the chart:

```tsx
      ) : (
        <IssuesRankChart tiles={tiles} history={current.history} period={period} />
      )}
```

with:

```tsx
      ) : secret && period === "month" ? (
        <FlappyEnjeux tiles={tiles} onExit={() => setSecret(false)} />
      ) : (
        <IssuesRankChart tiles={tiles} history={current.history} period={period} />
      )}
```

- [ ] **Step 3: Append `.flappy-*` CSS to `app/globals.css`**

```css
/* ===== Easter egg : Flappy Enjeux ===== */
.flappy { display: flex; justify-content: center; }
.flappy-stage { position: relative; width: 100%; max-width: 640px; }
.flappy-canvas {
  width: 100%; height: auto; display: block; border-radius: 8px;
  border: 1px solid rgba(70, 62, 62, 0.25); touch-action: none; cursor: pointer;
}
.flappy-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column; gap: 8px;
  align-items: center; justify-content: center; text-align: center;
  background: rgba(247, 244, 239, 0.82); border-radius: 8px; padding: 16px;
}
.flappy-title { font-weight: 700; font-size: 1.25rem; margin: 0; }
.flappy-hint, .flappy-score { margin: 0; font-size: 0.9rem; }
.flappy-initials { display: flex; gap: 8px; align-items: center; }
.flappy-initials input {
  width: 4rem; text-transform: uppercase; text-align: center; letter-spacing: 0.3em;
  font-size: 1.1rem; padding: 4px; border: 1px solid #463E3E; border-radius: 4px;
}
.flappy-board { list-style: none; padding: 0; margin: 4px 0; width: 200px; }
.flappy-board li { display: grid; grid-template-columns: 2rem 1fr 3rem; gap: 8px; padding: 2px 0; }
.flappy-board li.is-new { font-weight: 700; color: #B00020; }
.flappy-actions { display: flex; gap: 8px; }
.flappy-actions button, .flappy-initials button {
  padding: 4px 12px; border: 1px solid #463E3E; border-radius: 4px; background: #fff; cursor: pointer;
}
@media (prefers-color-scheme: dark) {
  .flappy-canvas { border-color: rgba(255,255,255,0.2); }
}
```

- [ ] **Step 4: Verify build + full test suite**

Run: `npx tsc --noEmit && npx vitest run && npx next build`
Expected: all PASS; build succeeds.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev` (Node/yarn per repo). In the module: type ↑↑↓↓←→←→ B A → view jumps to "Ce mois" and shows the canvas; Space/click flaps; hitting a pipe → game over → enter 3 letters → board shows entry; "Quitter ✕" restores the bump chart. Check mobile width (tap flaps).

- [ ] **Step 6: Commit**

```bash
git add components/interactive/TreemapClient.tsx app/globals.css
git commit -m "feat: wire Flappy Enjeux easter egg into « De quoi parle-t-on? »

Konami code turns the Ce mois panel into the game; Esc/Quitter restores it.

Assisted-by: Claude Code (Opus 4.8)"
```

---

### Task 5: PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Open PR** to `main` with body covering: what (hidden easter egg), how to trigger, isolation (only under secret mode), no data/metho impact, `semver:patch` (hidden, no visible change to normal users), AI provenance. No `Co-Authored-By`.

## Notes for the implementer

- The spawn is time-deterministic (no `Math.random`) so `stepPhysics` stays pure/testable; visual variety comes from the `* 97 % range` gap placement and issue cycling.
- `stateRef`/`flapRef` hold live game data to avoid re-rendering React every frame; React state changes only on phase transitions.
- Everything touching `window`/`localStorage`/canvas is inside effects/handlers → SSR-safe for the static export.
