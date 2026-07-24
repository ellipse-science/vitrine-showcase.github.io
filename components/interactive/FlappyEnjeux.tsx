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
