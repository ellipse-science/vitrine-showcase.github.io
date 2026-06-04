"use client";

import { useState, type ReactNode } from "react";

// Icône ⓘ générique : survol/clic ouvre une bulle. `size="lg"` pour l'explication
// de section (à côté du titre), `size="sm"` pour un détail collé à une étiquette.
// Wrapper <span> + bouton + bulle sœur (un <a> ne peut pas vivre dans un <button>).
export function InfoTip({
  children,
  label,
  size = "sm",
}: {
  children: ReactNode;
  label: string;
  size?: "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`saillance-info-tip${open ? " open" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`saillance-info-btn info-${size}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={label}
        aria-expanded={open}
      >
        ⓘ
      </button>
      {open && (
        <span className="saillance-info-bubble" role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}
