"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TreemapIssueTile } from "@/lib/data/headlineEvents";
import {
  FIELD, newGame, difficultyFor, stepPhysics, hitTest, nextTarget, comboPoints,
  insertScore, sanitizeInitials, type GameState, type ScoreEntry,
} from "@/lib/flappy";
import { fetchLeaderboard, submitScoreToLeaderboard } from "@/lib/flappyLeaderboard";

const INK = "#1C1917";
const CREAM = "#F3ECDD";
const CORDOVAN = "#6B1E2A";

function headlineOf(t: TreemapIssueTile | undefined): string {
  if (!t) return "";
  const h = (t.context && t.context.trim()) || (t.topObject && t.topObject.trim()) || t.issueFr;
  return h.length > 78 ? h.slice(0, 77) + "…" : h;
}
// couleur de texte lisible (aplat) sur une pastille de couleur
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return CREAM;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? INK : CREAM;
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number };

export function FlappyEnjeux({ tiles, onExit }: { tiles: TreemapIssueTile[]; onExit: () => void }) {
  const weights = useMemo(() => tiles.map((t) => Math.max(1, t.relScore || 1)), [tiles]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(newGame());
  const flapRef = useRef(false);
  const awardedRef = useRef<Set<number>>(new Set());
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const targetRef = useRef(0);
  const partRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);

  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [targetIdx, setTargetIdx] = useState(0);
  const [scoop, setScoop] = useState<{ label: string; head: string } | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [board, setBoard] = useState<ScoreEntry[]>([]);
  const [isGlobalBoard, setIsGlobalBoard] = useState(false);
  const [initials, setInitials] = useState("");
  const [saved, setSaved] = useState(false);
  const scoopTimer = useRef<number | null>(null);

  // Charger le classement (global ou local) au montage
  useEffect(() => {
    fetchLeaderboard().then(({ board: b, isGlobal }) => {
      setBoard(b);
      setIsGlobalBoard(isGlobal);
    });
  }, []);

  const startTarget = useCallback(() => {
    const t = nextTarget(weights, Math.floor(performance.now()) || 1, -1);
    targetRef.current = t; setTargetIdx(t);
  }, [weights]);

  const reset = useCallback(() => {
    stateRef.current = newGame(); awardedRef.current = new Set();
    scoreRef.current = 0; comboRef.current = 0; partRef.current = [];
    shakeRef.current = 0; setScore(0); setCombo(0); setScoop(null); startTarget();
  }, [startTarget]);

  const burst = (x: number, y: number, color: string) => {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.1 + Math.random() * 0.35;
      partRef.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.1,
        life: 1, c: i % 3 === 0 ? CORDOVAN : (i % 3 === 1 ? color : CREAM), r: 2 + Math.random() * 3 });
    }
  };

  const draw = useCallback((s: GameState) => {
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const diff = difficultyFor(scoreRef.current);
    ctx.save();
    if (shakeRef.current > 0) ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current);
    // fond plat
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // colonnes d'enjeu — aplats de couleur, contour net, aucun effet
    for (const p of s.pipes) {
      const tile = tiles[p.issueIndex % Math.max(tiles.length, 1)];
      const col = tile?.color ?? "#463E3E";
      const ink = readableOn(col);
      const topH = p.gapY - diff.gap / 2;
      const botY = p.gapY + diff.gap / 2;
      const drawCol = (yTop: number, h: number) => {
        if (h <= 0) return;
        ctx.fillStyle = col; ctx.fillRect(p.x, yTop, FIELD.pipeW, h);
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(p.x + 1, yTop + 1, FIELD.pipeW - 2, h - 2);
      };
      drawCol(0, topH);
      drawCol(botY, FIELD.height - botY);
      // nom de l'enjeu, imprimé verticalement sur la colonne pleine, hors de l'ouverture
      const label = (tile?.issueFr ?? "").toUpperCase();
      ctx.fillStyle = ink;
      ctx.font = "700 15px 'Playfair Display', Georgia, serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const putLabel = (cy: number, avail: number) => {
        if (avail < 90) return;
        ctx.save(); ctx.translate(p.x + FIELD.pipeW / 2, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, 0); ctx.restore();
      };
      putLabel(topH / 2, topH);
      putLabel(botY + (FIELD.height - botY) / 2, FIELD.height - botY);
    }

    // oiseau — aplat, sans ombre ni traînée
    ctx.save(); ctx.translate(FIELD.birdX, s.bird.y);
    ctx.rotate(Math.max(-0.5, Math.min(0.7, s.bird.vy * 0.9)));
    ctx.font = "34px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("📰", 0, 0);
    ctx.restore();

    // confettis (aplats) sur un scoop
    for (const q of partRef.current) {
      ctx.globalAlpha = Math.max(0, q.life);
      ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.r, q.r);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }, [tiles]);

  const flashScoop = useCallback((tile: TreemapIssueTile | undefined) => {
    setScoop({ label: tile?.issueFr ?? "", head: headlineOf(tile) });
    if (scoopTimer.current) window.clearTimeout(scoopTimer.current);
    scoopTimer.current = window.setTimeout(() => setScoop(null), 1100);
  }, []);

  // boucle rAF
  useEffect(() => {
    let raf = 0; let last = 0;
    const loop = (ts: number) => {
      const dt = last ? ts - last : 16; last = ts;
      const diff = difficultyFor(scoreRef.current);
      if (phaseRef.current === "playing" && !document.hidden) {
        const next = stepPhysics(stateRef.current, dt, flapRef.current, diff, weights);
        flapRef.current = false;
        // scoring des tuyaux nouvellement franchis
        for (const p of next.pipes) {
          if (p.passed && !awardedRef.current.has(p.id)) {
            awardedRef.current.add(p.id);
            if (p.issueIndex === targetRef.current) {
              scoreRef.current += comboPoints(comboRef.current); comboRef.current += 1;
              const tile = tiles[p.issueIndex]; flashScoop(tile);
              burst(FIELD.birdX + 40, stateRef.current.bird.y, tile?.color ?? CORDOVAN);
              targetRef.current = nextTarget(weights, p.id * 2246822519, targetRef.current);
              setTargetIdx(targetRef.current);
            } else {
              scoreRef.current += 1; comboRef.current = 0;
            }
            setScore(scoreRef.current); setCombo(comboRef.current);
          }
        }
        if (hitTest(next, diff)) {
          shakeRef.current = 14;
          setFinalScore(scoreRef.current);
          fetchLeaderboard().then(({ board: b, isGlobal }) => {
            setBoard(b);
            setIsGlobalBoard(isGlobal);
          });
          setSaved(false); setInitials("");
          setPhase("over");
        } else {
          stateRef.current = next;
        }
      }
      // particules + shake decay (toujours)
      partRef.current = partRef.current.filter((q) => q.life > 0);
      for (const q of partRef.current) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.0016 * dt; q.life -= 0.02; }
      if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - 0.6);
      draw(stateRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, weights, tiles, flashScoop]);

  const flap = useCallback(() => {
    if (phaseRef.current === "ready") { reset(); setPhase("playing"); }
    if (phaseRef.current === "playing") flapRef.current = true;
  }, [reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onExit(); return; }
      if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, onExit]);

  const restart = () => { reset(); setPhase("ready"); };
  const qualifies = insertScore(board, { initials: "___", score: finalScore, date: "" })
    .some((e) => e.initials === "___" && e.score === finalScore) && finalScore > 0;
  const save = () => {
    const entry: ScoreEntry = {
      initials: sanitizeInitials(initials) || "AAA",
      score: finalScore,
      date: new Date().toISOString().slice(0, 10),
    };
    submitScoreToLeaderboard(entry).then(({ board: b, isGlobal }) => {
      setBoard(b);
      setIsGlobalBoard(isGlobal);
      setSaved(true);
    });
  };

  const targetTile = tiles[targetIdx];

  return (
    <div className="flappy-cabinet" role="group" aria-label="Jeu caché : Flappy Enjeux — chasse à la une">
      <div className="flappy-masthead">
        <span className="flappy-brand">LA VITRINE · ÉDITION SPÉCIALE</span>
        <span className="flappy-score-hud">Score <b>{score}</b>{combo > 1 && <em> · Combo ×{combo}</em>}</span>
        <button type="button" className="flappy-quit" onClick={onExit} aria-label="Quitter le jeu">✕</button>
      </div>

      <div className="flappy-target" aria-live="polite">
        <span className="flappy-target-kicker">À LA UNE ▸ <b style={{ color: targetTile?.color }}>{targetTile?.issueFr}</b></span>
        <span className="flappy-target-head">« {headlineOf(targetTile)} »</span>
      </div>

      <div className="flappy-stage">
        <canvas
          ref={canvasRef} width={FIELD.width} height={FIELD.height} className="flappy-canvas"
          role="img" aria-label={`Flappy Enjeux, score ${score}`}
          onPointerDown={(e) => { e.preventDefault(); flap(); }}
        />
        {scoop && (
          <div className="flappy-scoop" key={scoop.head + score}>
            <span className="flappy-scoop-stamp">SCOOP !</span>
            <span className="flappy-scoop-issue">{scoop.label}</span>
          </div>
        )}
        {phase === "ready" && (
          <div className="flappy-overlay">
            <p className="flappy-title">Chasse à la une</p>
            <p className="flappy-hint">Fais voler le journal 📰 (Espace / ↑ / touchez l&apos;écran) et franchis l&apos;enjeu <b>à la une</b> pour décrocher le scoop. Ça accélère avec le score. Échap ou ✕ pour quitter.</p>
            <button type="button" className="flappy-cta" onClick={flap}>Commencer</button>
          </div>
        )}
        {phase === "over" && (
          <div className="flappy-overlay">
            <p className="flappy-title">Édition bouclée</p>
            <p className="flappy-score">Score : <b>{finalScore}</b></p>
            {qualifies && !saved && (
              <div className="flappy-initials">
                <label htmlFor="fi">Signe l&apos;édition</label>
                <input id="fi" value={initials} maxLength={3} autoComplete="off"
                  onChange={(e) => setInitials(sanitizeInitials(e.target.value))} />
                <button type="button" onClick={save}>Publier</button>
              </div>
            )}
            {(saved || !qualifies) && board.length > 0 && (
              <div className="flappy-board-wrap">
                <span className="flappy-board-title">{isGlobalBoard ? "CLASSEMENT GLOBAL 🌐" : "CLASSEMENT LOCAL"}</span>
                <ol className="flappy-board">
                  {board.map((e, i) => (
                    <li key={i} className={saved && e.initials === (sanitizeInitials(initials) || "AAA") && e.score === finalScore ? "is-new" : undefined}>
                      <span>{i + 1}</span><span>{e.initials}</span><span>{e.score}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="flappy-actions">
              <button type="button" className="flappy-cta" onClick={restart}>Rejouer</button>
              <button type="button" onClick={onExit}>Quitter ✕</button>
            </div>
          </div>
        )}
      </div>
      <p className="flappy-foot">Chaque tuyau est un enjeu réel du mois · largeur des colonnes = maquette, écart = difficulté</p>
    </div>
  );
}
