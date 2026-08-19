"use client";

import type { MouseEvent, ReactNode } from "react";

// Lien du titre d'une Une. Au clic gauche simple, ouvre un article AU HASARD
// parmi les médias QC qui couvrent l'histoire — chance ÉGALE pour chaque média
// (décision Adrien 2026-07-20 : ne pas toujours envoyer vers le plus saillant).
// `fallback` reste un vrai href (article de repli) pour le clic-milieu, le
// « ouvrir dans un onglet » et la navigation sans JavaScript.
export function HeadlineLink({ urls, fallback, children }: {
  urls: string[];
  fallback: string;
  children: ReactNode;
}) {
  const pool = urls.length > 0 ? urls : [fallback];
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Laisser le navigateur gérer clic-milieu et clics modifiés (nouvel onglet…).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const url = pool[Math.floor(Math.random() * pool.length)];
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <a href={fallback} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {children}
    </a>
  );
}
