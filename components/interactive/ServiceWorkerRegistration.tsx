"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker
      .register(`${base}/sw.js`, { scope: `${base}/` })
      .catch(() => {
        // SW indisponible — le site fonctionne normalement sans
      });
  }, []);

  return null;
}
