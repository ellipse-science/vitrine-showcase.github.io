"use client";

import { useEffect, useState } from "react";

export function DoomGame({ onExit }: { onExit: () => void }) {
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

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

  const triggerCheat = (code: string, label: string) => {
    setActiveNotice(label);
    setTimeout(() => setActiveNotice(null), 2500);

    // Dispatch keyboard sequence directly to active window
    const chars = code.split("");
    chars.forEach((char, index) => {
      setTimeout(() => {
        const eventDown = new KeyboardEvent("keydown", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
          cancelable: true,
        });
        const eventUp = new KeyboardEvent("keyup", {
          key: char,
          code: `Key${char.toUpperCase()}`,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(eventDown);
        window.dispatchEvent(eventUp);
      }, index * 80);
    });
  };

  return (
    <div className="doom-seamless-wrap" role="group" aria-label="DOOM&nbsp;: Knee-Deep in the Media">
      <div className="doom-editorial-header">
        <div className="doom-header-titles">
          <span className="doom-header-brand">LA VITRINE · ÉDITION SPÉCIALE 💥</span>
          <span className="doom-header-sub">&laquo;&nbsp;KNEE-DEEP IN THE MEDIA&nbsp;&raquo; · ÉRIC DUHAIME VS THE PRESS</span>
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

      {/* Episode & Cheats Bar for all 36 levels */}
      <div className="doom-episode-bar">
        <span className="doom-episode-label">🕹️ <b>Épisodes (36 Niveaux) :</b></span>
        <button
          type="button"
          className="doom-ep-btn"
          onClick={() => triggerCheat("idclev11", "Épisode 1 chargé (Niveau E1M1)")}
        >
          Épisode 1
        </button>
        <button
          type="button"
          className="doom-ep-btn"
          onClick={() => triggerCheat("idclev21", "Épisode 2 chargé (Niveau E2M1)")}
        >
          Épisode 2
        </button>
        <button
          type="button"
          className="doom-ep-btn"
          onClick={() => triggerCheat("idclev31", "Épisode 3 chargé (Niveau E3M1)")}
        >
          Épisode 3
        </button>
        <button
          type="button"
          className="doom-ep-btn"
          onClick={() => triggerCheat("idclev41", "Épisode 4 chargé (Niveau E4M1)")}
        >
          Épisode 4
        </button>
        <span className="doom-ep-sep">|</span>
        <button
          type="button"
          className="doom-ep-btn doom-ep-btn--cheat"
          onClick={() => triggerCheat("idkfa", "⚡ Toutes les armes & clés déverrouillées (IDKFA)")}
        >
          ⚡ Armes
        </button>
        <button
          type="button"
          className="doom-ep-btn doom-ep-btn--cheat"
          onClick={() => triggerCheat("iddqd", "🛡️ Mode Invincible activé (IDDQD)")}
        >
          🛡️ Invincible
        </button>

        {activeNotice && <span className="doom-notice-toast">{activeNotice}</span>}
      </div>

      <div className="doom-stage-container">
        <iframe
          src="https://raz0red.github.io/webprboom/"
          className="doom-iframe-seamless"
          title="DOOM&nbsp;: Knee-Deep in the Media"
          allow="autoplay; keyboard; fullscreen; gamepad"
          allowFullScreen
        />
      </div>
    </div>
  );
}
