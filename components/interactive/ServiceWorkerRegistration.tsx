"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // En dev : désinstaller tout SW déjà actif. Le cache-first sur
      // /_next/static/* sert sinon des CSS périmées au prochain chargement.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((r) => r.unregister());
        })
        .catch(() => {
          // getRegistrations indisponible (permissions, contexte non sécurisé…) — sans gravité en dev
        });
      return;
    }

    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker
      .register(`${base}/sw.js`, { scope: `${base}/` })
      .catch(() => {
        // SW indisponible — le site fonctionne normalement sans
      });
  }, []);

  return null;
}
