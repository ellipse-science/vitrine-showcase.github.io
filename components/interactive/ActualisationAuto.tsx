"use client";

import { useEffect, useState } from "react";

// Actualisation au rythme des données. Le site est statique et ses données
// sont inlinées au build ; chaque cycle de 4 h produit un nouveau déploiement.
// Ce composant consulte un mini-fichier écrit au build (build-id.json,
// ~100 octets, servi par le même CDN que la page — JAMAIS l'API, règle du
// coût nul sous afflux) et, quand l'identifiant change :
//   - recharge la page au RETOUR d'onglet (l'utilisateur ne lisait pas) ;
//   - affiche sinon un bandeau discret (jamais de rechargement sous les yeux
//     de quelqu'un en pleine lecture).
// Design : docs/superpowers/specs/2026-08-19-actualisation-auto-design.md
const INTERVALLE_MS = 10 * 60 * 1000;

export default function ActualisationAuto() {
  const [nouvelleVersion, setNouvelleVersion] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    let baseline: string | null = null;
    let arrete = false;

    const lireId = async (): Promise<string | null> => {
      try {
        const res = await fetch(`${base}/build-id.json`, { cache: "no-store" });
        if (!res.ok) return null;
        const body = (await res.json()) as { id?: unknown };
        return typeof body.id === "string" ? body.id : null;
      } catch {
        // Hors ligne, bloqueur, fichier absent (vieux déploiement) : la sonde
        // se tait et le site fonctionne comme avant.
        return null;
      }
    };

    const verifier = async (auRetourOnglet: boolean) => {
      const id = await lireId();
      if (arrete || id === null) return;
      if (baseline === null) {
        baseline = id;
        return;
      }
      if (id === baseline) return;
      if (auRetourOnglet) {
        window.location.reload();
      } else {
        setNouvelleVersion(true);
      }
    };

    void verifier(false); // premier passage : pose la baseline
    const minuterie = window.setInterval(() => {
      if (document.visibilityState === "visible") void verifier(false);
    }, INTERVALLE_MS);
    const surVisibilite = () => {
      if (document.visibilityState === "visible") void verifier(true);
    };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      arrete = true;
      window.clearInterval(minuterie);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, []);

  if (!nouvelleVersion) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "1.25rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        padding: "0.6rem 1rem",
        background: "#111",
        color: "#f5f2ea",
        borderRadius: "3px",
        boxShadow: "0 4px 18px rgba(0, 0, 0, 0.35)",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "0.78rem",
        letterSpacing: "0.02em",
        maxWidth: "calc(100vw - 2rem)",
      }}
    >
      <span>De nouvelles données sont disponibles</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          border: "1px solid #f5f2ea",
          background: "transparent",
          color: "#f5f2ea",
          padding: "0.3rem 0.7rem",
          borderRadius: "2px",
          fontFamily: "inherit",
          fontSize: "inherit",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Actualiser
      </button>
    </div>
  );
}
