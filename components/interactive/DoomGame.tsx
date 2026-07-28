"use client";

import { useEffect } from "react";

export function DoomGame({ onExit }: { onExit: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div
      className="doom-cabinet"
      role="group"
      aria-label="Jeu caché : DOOM — Mode Spécial PCQ"
    >
      <div className="doom-masthead">
        <div className="doom-title-block">
          <span className="doom-brand">LA VITRINE · ÉDITION SPÉCIALE DOOM 💥</span>
          <span className="doom-subtitle">« KNEE-DEEP IN THE MEDIA » · ÉRIC DUHAIME VS THE PRESS</span>
        </div>
        <button
          type="button"
          className="doom-quit"
          onClick={onExit}
          aria-label="Quitter le jeu DOOM"
        >
          Quitter ✕
        </button>
      </div>

      <div className="doom-hint-bar">
        <span>🎮 <b>COMMANDES :</b> [Flèches / ZQSD] Déplacer · [Ctrl / Clic] Tirer · [Espace] Ouvrir portes · [1-7] Armes · [Échap] Fermer</span>
      </div>

      <div className="doom-stage">
        <iframe
          src="https://dos.zone/player/?bundleUrl=https%3A%2F%2Fcdn.dos.zone%2Fcustom%2Fdos%2Fdoom.jsdos&anonymous=1"
          className="doom-iframe"
          title="DOOM — Open Source Game Player"
          allow="autoplay; keyboard; fullscreen"
          allowFullScreen
        />
      </div>

      <p className="doom-foot">
        Easter Egg Déverrouillé (3 Taps sur PCQ) · DOOM Shareware (id Software 1993, Open Source engine)
      </p>
    </div>
  );
}
