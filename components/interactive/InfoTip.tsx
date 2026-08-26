"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

// Registre module-level : ferme tous les autres au tap mobile.
const registry = new Set<() => void>();

// `useLayoutEffect` côté navigateur, `useEffect` au rendu serveur — sinon Next
// avertit « useLayoutEffect does nothing on the server » au prérendu statique.
// Le corps n'a de toute façon rien à faire tant que la bulle est fermée.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function InfoTip({
  children,
  label,
  size = "sm",
}: {
  children: ReactNode;
  label: string;
  size?: "sm" | "lg";
}) {
  const [open, setOpen]               = useState(false);
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({});
  const wrapRef       = useRef<HTMLSpanElement>(null);
  const lastPtrType   = useRef<string>("mouse");

  // Enregistre la fonction de fermeture pour le mécanisme "un seul ouvert".
  useEffect(() => {
    const close = () => setOpen(false);
    registry.add(close);
    return () => { registry.delete(close); };
  }, []);

  // Calcule l'offset left pour que la bulle reste dans le viewport (position: absolute).
  // Mesure en LAYOUT effect, pas dans un requestAnimationFrame (#329) : le rAF
  // s'exécute APRÈS la première peinture, donc la bulle était peinte une frame à
  // sa position brute — débordante — avant de sauter en place. Le layout effect
  // tourne avant la peinture : aucun saut, et plus de dépendance au fait qu'une
  // frame soit planifiée.
  useIsoLayoutEffect(() => {
    // Rien à faire à la fermeture : la bulle n'est pas rendue, et la prochaine
    // ouverture recalcule le style avant la peinture. Remettre l'objet à vide
    // ici forçait un rendu + commit synchrones de plus à chaque fermeture (un
    // littéral n'est jamais Object.is-égal au précédent, donc pas de bail-out).
    if (!open) return;
    if (!wrapRef.current) return;
    const wrap = wrapRef.current.getBoundingClientRect();
    const vw   = window.innerWidth;
    const w    = Math.min(300, vw - 16);
    let left   = 0;
    const overflowRight = (wrap.left + w) - (vw - 8);
    if (overflowRight > 0) left = -overflowRight;
    const overflowLeft = 8 - (wrap.left + left);
    if (overflowLeft > 0) left += overflowLeft;
    setBubbleStyle(left !== 0 ? { left: `${left}px`, width: `${w}px` } : {});
  }, [open]);

  // Desktop : hover (souris uniquement via pointerType).
  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(true);
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(false);
  };

  // Ferme au tap en dehors ou au scroll (touch uniquement).
  useEffect(() => {
    if (!open) return;
    const closeOnTouch = (e: TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnScroll = () => {
      if (!wrapRef.current) return;
      const { top, bottom } = wrapRef.current.getBoundingClientRect();
      if (bottom < 0 || top > window.innerHeight) setOpen(false);
    };
    document.addEventListener("touchstart", closeOnTouch, { passive: true });
    window.addEventListener("scroll", closeOnScroll, { passive: true });
    return () => {
      document.removeEventListener("touchstart", closeOnTouch);
      window.removeEventListener("scroll", closeOnScroll);
    };
  }, [open]);

  // Mobile : clic pour toggle, ferme les autres.
  const handlePointerDown = (e: React.PointerEvent) => {
    lastPtrType.current = e.pointerType;
  };
  const handleClick = (e: React.MouseEvent) => {
    // `detail === 0` signe une activation au CLAVIER (Entrée ou Espace) : aucun
    // événement de pointeur ne l'a précédée, donc `lastPtrType` garde sa valeur
    // initiale « mouse » et l'ancien garde renvoyait tout de suite. La bulle
    // était donc TOTALEMENT inopérable au clavier : le bouton prenait le focus,
    // `aria-expanded` restait « false », et rien ne s'ouvrait jamais.
    if (e.detail === 0) {
      e.stopPropagation();
      registry.forEach((fn) => fn());
      setOpen((v) => !v);
      return;
    }
    if (lastPtrType.current === "mouse") return; // géré par hover
    e.stopPropagation();
    if (!open) {
      registry.forEach(fn => fn()); // ferme tous les autres
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  return (
    <span
      ref={wrapRef}
      className={`saillance-info-tip${open ? " open" : ""}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
    >
      <button
        type="button"
        className={`saillance-info-btn info-${size}`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        onBlur={() => setOpen(false)}
        aria-label={label}
        aria-expanded={open}
      >
        ⓘ
      </button>
      {open && (
        <span
          className="saillance-info-bubble"
          role="tooltip"
          style={bubbleStyle}
        >
          {children}
        </span>
      )}
    </span>
  );
}
