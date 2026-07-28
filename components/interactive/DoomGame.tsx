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
    <div className="doom-seamless-wrap" role="group" aria-label="DOOM — Knee-Deep in the Media">
      <div className="doom-editorial-header">
        <div className="doom-header-titles">
          <span className="doom-header-brand">LA VITRINE · ÉDITION SPÉCIALE 💥</span>
          <span className="doom-header-sub">« KNEE-DEEP IN THE MEDIA » · ÉRIC DUHAIME VS THE PRESS</span>
        </div>
        <button
          type="button"
          className="doom-close-badge"
          onClick={onExit}
          aria-label="Fermer DOOM"
        >
          ✕ Fermer (Échap)
        </button>
      </div>

      <div className="doom-stage-container">
        <iframe
          src="https://raz0red.github.io/webprboom/"
          className="doom-iframe-seamless"
          title="DOOM — Knee-Deep in the Media"
          allow="autoplay; keyboard; fullscreen; gamepad"
          allowFullScreen
        />
      </div>
    </div>
  );
}
