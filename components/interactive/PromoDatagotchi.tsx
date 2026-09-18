"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { basePath } from "@/lib/site";
import {
  CLE_FERME,
  CLE_PERSO,
  PERSOS,
  choisirPerso,
  type Perso,
} from "@/lib/promoDatagotchi";

// La mascotte Datagotchi, à la manière du trombone d'Office : le personnage
// jette un œil par-dessus le bord, monte, puis sa bulle s'ouvre et le texte
// s'écrit. Un seul temps fort, joué une fois ; ensuite il ne bouge presque plus.
//
// Les phases pilotent le CSS (`data-phase`), qui n'anime que transform et
// opacity : rien ne recalcule la mise en page pendant que la page défile.
type Phase = "attente" | "entre" | "parle" | "sort";

const DELAI_APPARITION_MS = 3500;
const DUREE_ENTREE_MS = 1350;
const DUREE_BULLE_MS = 420;
const DUREE_SORTIE_MS = 520;
const MS_PAR_LETTRE = 26;

function lire(stockage: "localStorage" | "sessionStorage", cle: string): string | null {
  // Navigation privée, stockage bloqué : l'accès lui-même peut lever.
  try {
    return window[stockage].getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(stockage: "localStorage" | "sessionStorage", cle: string, valeur: string) {
  try {
    window[stockage].setItem(cle, valeur);
  } catch {
    /* sans stockage, la mascotte revient à la prochaine page : acceptable */
  }
}

// `surLabo` : sur dev, le panneau du laboratoire de palettes occupe le même
// coin ; le personnage se pose au-dessus. Jamais vrai en production.
export function PromoDatagotchi({ surLabo = false }: { surLabo?: boolean }) {
  const [perso, setPerso] = useState<Perso | null>(null);
  const [phase, setPhase] = useState<Phase>("attente");
  const [lettres, setLettres] = useState(0);
  const [source, setSource] = useState("");
  const minuteries = useRef<number[]>([]);

  const plusTard = useCallback((fn: () => void, ms: number) => {
    minuteries.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    if (lire("sessionStorage", CLE_FERME)) return;
    const choix = choisirPerso(lire("localStorage", CLE_PERSO), Math.random());
    ecrire("localStorage", CLE_PERSO, choix);

    // L'image est chargée AVANT l'entrée : un personnage qui monte en se
    // dessinant par morceaux ruinerait le seul moment qui compte.
    const immobile = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fiche = PERSOS[choix];
    const src = `${basePath}${(immobile && fiche.imageFixe) || fiche.image}`;
    const image = new Image();
    let annule = false;
    const lancer = () => {
      if (annule) return;
      setSource(src);
      setPerso(choix);
      plusTard(() => {
        setPhase("entre");
        plusTard(() => setPhase("parle"), DUREE_ENTREE_MS);
      }, DELAI_APPARITION_MS);
    };
    image.onload = lancer;
    image.src = src;

    const enCours = minuteries.current;
    return () => {
      annule = true;
      image.onload = null;
      enCours.forEach((m) => window.clearTimeout(m));
    };
  }, [plusTard]);

  // Le texte s'écrit lettre par lettre une fois la bulle ouverte. Le texte
  // complet est toujours dans le DOM (la suite est seulement invisible) : la
  // bulle a sa taille finale dès l'ouverture et les lecteurs d'écran lisent la
  // phrase entière, pas un flux de lettres.
  useEffect(() => {
    if (phase !== "parle" || !perso) return;
    const total = PERSOS[perso].texte.length;
    const immobile = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let debut = 0;
    const pas = (t: number) => {
      if (!debut) debut = t + DUREE_BULLE_MS;
      const n = immobile
        ? total
        : Math.max(0, Math.min(total, Math.floor((t - debut) / MS_PAR_LETTRE)));
      setLettres(n);
      if (n < total) raf = window.requestAnimationFrame(pas);
    };
    raf = window.requestAnimationFrame(pas);
    return () => window.cancelAnimationFrame(raf);
  }, [phase, perso]);

  const fermer = useCallback(() => {
    ecrire("sessionStorage", CLE_FERME, "1");
    setPhase("sort");
    plusTard(() => setPerso(null), DUREE_SORTIE_MS);
  }, [plusTard]);

  if (!perso) return null;

  const fiche = PERSOS[perso];
  const fini = lettres >= fiche.texte.length;
  const ouvert = phase === "parle";

  return (
    <aside
      className="dg-promo"
      data-perso={perso}
      data-phase={phase}
      data-leve={surLabo ? "" : undefined}
      aria-label={fiche.nom}
      onKeyDown={(e) => {
        if (e.key === "Escape") fermer();
      }}
    >
      <div className="dg-bulle" data-fini={fini ? "" : undefined} inert={!ouvert}>
        <button type="button" className="dg-fermer" onClick={fermer} aria-label="Fermer">
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            <path d="M1 1 9 9M9 1 1 9" />
          </svg>
        </button>
        <p className="dg-nom">{fiche.nom}</p>
        <p className="dg-texte">
          <span className="dg-lu">{fiche.texte}</span>
          <span aria-hidden="true">
            {fiche.texte.slice(0, lettres)}
            <span className="dg-reste">{fiche.texte.slice(lettres)}</span>
          </span>
        </p>
        <a className="dg-action" href={fiche.href} target="_blank" rel="noopener">
          {fiche.action}
        </a>
        <svg className="dg-queue" viewBox="0 0 26 20" width="26" height="20" aria-hidden="true">
          <path className="dg-queue-fond" d="M0 0H26V20H18V14H12V8H6V2H0Z" />
          <path className="dg-queue-trait" d="M1 0V7H7V13H13V19H25V0" />
        </svg>
      </div>
      <a
        className="dg-perso"
        href={fiche.href}
        target="_blank"
        rel="noopener"
        aria-label={`${fiche.nom} : ${fiche.action.toLowerCase()}`}
        tabIndex={ouvert ? 0 : -1}
      >
        <span className="dg-perso-vie">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source}
            alt=""
            width={fiche.largeur}
            height={fiche.hauteur}
            draggable={false}
          />
        </span>
      </a>
    </aside>
  );
}
