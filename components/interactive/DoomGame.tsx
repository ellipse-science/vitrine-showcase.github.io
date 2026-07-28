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
    <div className="doom-seamless-wrap" role="group" aria-label="DOOM Easter Egg">
      <button
        type="button"
        className="doom-close-badge"
        onClick={onExit}
        aria-label="Fermer DOOM"
      >
        ✕ Fermer (Échap)
      </button>
      <iframe
        src="https://raz0red.github.io/webprboom/"
        className="doom-iframe-seamless"
        title="DUHAIME — Open Source Game"
        allow="autoplay; keyboard; fullscreen; gamepad"
        allowFullScreen
      />
    </div>
  );
}
