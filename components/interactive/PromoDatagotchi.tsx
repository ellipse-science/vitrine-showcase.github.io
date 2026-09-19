"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { basePath } from "@/lib/site";
import {
  CLE_FERME,
  CLE_PERSO,
  PERSOS,
  choisirPerso,
  largeurBulle,
  type Perso,
} from "@/lib/promoDatagotchi";

// La mascotte Datagotchi, à la manière du trombone d'Office : le personnage
// jette un œil par-dessus le bord, monte, puis sa bulle s'ouvre et le texte
// s'écrit. Un seul temps fort, joué une fois ; ensuite il ne bouge presque plus.
//
// RÈGLE : la bulle ne recouvre jamais le contenu du site de son propre chef.
// Elle ne s'ouvre seule que si elle tient dans la marge à droite de la colonne
// (écrans larges). Ailleurs, le personnage arrive seul avec un « ! », et la
// bulle ne s'ouvre qu'à la demande du visiteur (survol, clic, toucher, focus).
//
// Les phases pilotent le CSS (`data-phase`), qui n'anime que transform et
// opacity : rien ne recalcule la mise en page pendant que la page défile.
type Phase = "attente" | "entre" | "parle" | "sort";

const DELAI_APPARITION_MS = 3500;
const DUREE_ENTREE_MS = 1350;
const DUREE_BULLE_MS = 420;
const DUREE_SORTIE_MS = 520;
const DELAI_REPLI_MS = 450;
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

// Largeur libre entre la colonne de contenu et le bord droit de la fenêtre.
function margeDroite(): number {
  const colonne = document.querySelector(".page [data-section]");
  if (!colonne) return 0;
  return Math.max(0, document.documentElement.clientWidth - colonne.getBoundingClientRect().right);
}

// `surLabo` : sur dev, le panneau du laboratoire de palettes occupe le même
// coin ; le personnage se pose au-dessus. Jamais vrai en production.
export function PromoDatagotchi({ surLabo = false }: { surLabo?: boolean }) {
  const [perso, setPerso] = useState<Perso | null>(null);
  const [phase, setPhase] = useState<Phase>("attente");
  const [lettres, setLettres] = useState(0);
  const [source, setSource] = useState("");
  // Largeur de bulle qui tient dans la marge ; null = elle n'y tient pas.
  const [largeur, setLargeur] = useState<number | null>(null);
  const [demande, setDemande] = useState(false);
  const racine = useRef<HTMLElement>(null);
  const minuteries = useRef<number[]>([]);
  const repli = useRef(0);
  const dejaLues = useRef(0);
  const ouvertAuAppui = useRef(false);

  const plusTard = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    minuteries.current.push(id);
    return id;
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
      setLargeur(largeurBulle(margeDroite()));
      setPerso(choix);
      plusTard(() => {
        setPhase("entre");
        plusTard(() => setPhase("parle"), DUREE_ENTREE_MS);
      }, DELAI_APPARITION_MS);
    };
    image.onload = lancer;
    image.src = src;

    let raf = 0;
    const mesurer = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => setLargeur(largeurBulle(margeDroite())));
    };
    window.addEventListener("resize", mesurer);

    const enCours = minuteries.current;
    return () => {
      annule = true;
      image.onload = null;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", mesurer);
      enCours.forEach((m) => window.clearTimeout(m));
    };
  }, [plusTard]);

  const ouvert = phase === "parle" && (largeur !== null || demande);

  // Le texte s'écrit lettre par lettre à la première ouverture. Le texte
  // complet est toujours dans le DOM (la suite est seulement invisible) : la
  // bulle a sa taille finale dès l'ouverture et les lecteurs d'écran lisent la
  // phrase entière, pas un flux de lettres. Une bulle rouverte reprend où elle
  // en était.
  useEffect(() => {
    if (!ouvert || !perso) return;
    const total = PERSOS[perso].texte.length;
    const depart = dejaLues.current;
    if (depart >= total) return;
    const immobile = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let debut = 0;
    const pas = (t: number) => {
      if (!debut) debut = t + DUREE_BULLE_MS;
      const n = immobile
        ? total
        : Math.max(depart, Math.min(total, depart + Math.floor((t - debut) / MS_PAR_LETTRE)));
      dejaLues.current = n;
      setLettres(n);
      if (n < total) raf = window.requestAnimationFrame(pas);
    };
    raf = window.requestAnimationFrame(pas);
    return () => window.cancelAnimationFrame(raf);
  }, [ouvert, perso]);

  // Bulle ouverte à la demande : un toucher ou un clic ailleurs la replie.
  useEffect(() => {
    if (!demande) return;
    const dehors = (e: PointerEvent) => {
      if (!racine.current?.contains(e.target as Node)) setDemande(false);
    };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [demande]);

  const fermer = useCallback(() => {
    ecrire("sessionStorage", CLE_FERME, "1");
    setPhase("sort");
    plusTard(() => setPerso(null), DUREE_SORTIE_MS);
  }, [plusTard]);

  if (!perso) return null;

  const fiche = PERSOS[perso];
  const fini = lettres >= fiche.texte.length;
  const discret = largeur === null;

  return (
    <aside
      ref={racine}
      className="dg-promo"
      data-perso={perso}
      data-phase={phase}
      data-ouvert={ouvert ? "" : undefined}
      data-discret={discret ? "" : undefined}
      data-leve={surLabo ? "" : undefined}
      aria-label={fiche.nom}
      style={largeur === null ? undefined : { ["--dg-largeur" as string]: `${largeur}px` }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        if (discret && demande) setDemande(false);
        else fermer();
      }}
      onPointerEnter={(e) => {
        window.clearTimeout(repli.current);
        if (e.pointerType === "mouse" && phase === "parle") setDemande(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        repli.current = plusTard(() => {
          if (!racine.current?.contains(document.activeElement)) setDemande(false);
        }, DELAI_REPLI_MS);
      }}
      onBlur={(e) => {
        if (!racine.current?.contains(e.relatedTarget as Node | null)) setDemande(false);
      }}
    >
      <div className="dg-bulle" data-fini={fini ? "" : undefined} inert={!ouvert}>
        <button type="button" className="dg-fermer" onClick={fermer} aria-label="Fermer">
          <svg viewBox="0 0 10 10" width="12" height="12" aria-hidden="true">
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
        tabIndex={phase === "parle" ? 0 : -1}
        onFocus={() => setDemande(true)}
        onPointerDown={() => {
          ouvertAuAppui.current = ouvert;
        }}
        onClick={(e) => {
          // Bulle fermée : le premier clic (ou toucher) l'ouvre ; le lien ne
          // s'active qu'une fois le message visible. L'état se lit À L'APPUI :
          // le focus que provoque ce même appui ouvre la bulle avant le clic.
          // `detail === 0` : activation au clavier, la bulle est déjà ouverte
          // par le focus.
          if (e.detail !== 0 && !ouvertAuAppui.current) {
            e.preventDefault();
            setDemande(true);
          }
        }}
      >
        <span className="dg-signe" aria-hidden="true">
          !
        </span>
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
