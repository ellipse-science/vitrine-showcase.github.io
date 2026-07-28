"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export function DoomGame({ onExit }: { onExit: () => void }) {
  const [faceState, setFaceState] = useState<"normal" | "lookLeft" | "lookRight" | "grin">("normal");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
      }
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "q") {
        setFaceState("lookLeft");
      } else if (e.key === "ArrowRight" || e.key === "d") {
        setFaceState("lookRight");
      } else if (e.key === "Control" || e.key === " ") {
        setFaceState("grin");
      }
    };

    const onKeyUp = () => {
      setTimeout(() => setFaceState("normal"), 400);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [onExit]);

  return (
    <div className="doom-seamless-wrap" role="group" aria-label="Jeu DUHAIME — Mode Spécial PCQ">
      {/* Header Banner avec le logo personnalisé DUHAIME */}
      <div className="duhaime-header">
        <div className="duhaime-logo-box">
          <Image
            src="/images/doom/duhaime_logo.jpg"
            alt="DUHAIME — Retro Game Logo"
            width={180}
            height={50}
            className="duhaime-logo-img"
            priority
          />
        </div>
        <span className="duhaime-subtitle">« KNEE-DEEP IN THE MEDIA » · ÉRIC DUHAIME VS THE PRESS 💥</span>
        <button
          type="button"
          className="doom-close-badge"
          onClick={onExit}
          aria-label="Fermer le jeu DUHAIME"
        >
          ✕ Fermer (Échap)
        </button>
      </div>

      <div className="doom-stage-container">
        {/* Wasm DOOM Engine WebPrBoom */}
        <iframe
          src="https://raz0red.github.io/webprboom/"
          className="doom-iframe-seamless"
          title="DUHAIME — Open Source Game Engine"
          allow="autoplay; keyboard; fullscreen; gamepad"
          allowFullScreen
        />

        {/* Visage Pixel Art d'Éric Duhaime intégré sur la Status Bar du HUD */}
        <div className={`duhaime-hud-face duhaime-hud-face--${faceState}`} title="Éric Duhaime (Status Bar HUD)">
          <Image
            src="/images/doom/duhaime_face.jpg"
            alt="Éric Duhaime Pixel Art Face"
            width={40}
            height={44}
            className="duhaime-face-img"
          />
        </div>
      </div>
    </div>
  );
}
