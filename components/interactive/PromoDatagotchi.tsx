"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { basePath } from "@/lib/site";
import {
  PERSOS,
  choisirPerso,
  largeurBulle,
  type Perso,
} from "@/lib/promoDatagotchi";

// La mascotte Datagotchi, à la manière du trombone d'Office : le personnage
// jette un œil par-dessus le bord puis monte, seul, avec un « ! ». Un seul
// temps fort, joué une fois ; ensuite il ne bouge presque plus.
//
// RÈGLE : la bulle ne s'ouvre jamais de son propre chef, quel que soit
// l'écran. Elle ne s'ouvre qu'à la demande du visiteur (survol, clic, toucher,
// focus) ; le texte s'écrit alors. Le « × » ne ferme que la bulle : le
// personnage reste, et la bulle se rouvre à la prochaine demande.
//
// Les phases pilotent le CSS (`data-phase`), qui n'anime que transform et
// opacity : rien ne recalcule la mise en page pendant que la page défile.
type Phase = "attente" | "entre" | "parle";

// Le visiteur lit d'abord la Une : le personnage n'arrive qu'ensuite.
const DELAI_APPARITION_MS = 15000;
const DUREE_ENTREE_MS = 1350;
const DUREE_BULLE_MS = 420;
const DELAI_REPLI_MS = 450;
const MS_PAR_LETTRE = 26;

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
  // Largeur de bulle qui tient dans la marge : ouverte, elle ne mord pas sur
  // la colonne. null = elle n'y tient pas, elle prend sa largeur par défaut.
  const [largeur, setLargeur] = useState<number | null>(null);
  const [demande, setDemande] = useState(false);
  const racine = useRef<HTMLElement>(null);
  const lienPerso = useRef<HTMLAnchorElement>(null);
  const minuteries = useRef<number[]>([]);
  const repli = useRef(0);
  const dejaLues = useRef(0);
  const ouvertAuAppui = useRef(false);
  const focusMuet = useRef(false);

  const plusTard = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    minuteries.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    const choix = choisirPerso(Math.random());

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

  const ouvert = phase === "parle" && demande;

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

  // Ne ferme que la bulle. Au clavier, le focus retourne au personnage sans
  // la rouvrir : sinon il resterait dans la bulle, devenue inerte.
  const fermerBulle = useCallback((auClavier: boolean) => {
    setDemande(false);
    if (!auClavier) return;
    focusMuet.current = true;
    lienPerso.current?.focus();
  }, []);

  if (!perso) return null;

  const fiche = PERSOS[perso];
  const fini = lettres >= fiche.texte.length;

  return (
    <aside
      ref={racine}
      className="dg-promo"
      data-perso={perso}
      data-phase={phase}
      data-ouvert={ouvert ? "" : undefined}
      data-leve={surLabo ? "" : undefined}
      aria-label={fiche.nom}
      style={largeur === null ? undefined : { ["--dg-largeur" as string]: `${largeur}px` }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !ouvert) return;
        fermerBulle(racine.current?.contains(document.activeElement) ?? false);
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
        <button
          type="button"
          className="dg-fermer"
          onClick={(e) => fermerBulle(e.detail === 0)}
          aria-label="Fermer la bulle"
        >
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
        ref={lienPerso}
        className="dg-perso"
        href={fiche.href}
        target="_blank"
        rel="noopener"
        aria-label={`${fiche.nom} : ${fiche.action.toLowerCase()}`}
        tabIndex={phase === "parle" ? 0 : -1}
        onFocus={() => {
          if (focusMuet.current) focusMuet.current = false;
          else setDemande(true);
        }}
        onPointerDown={() => {
          ouvertAuAppui.current = ouvert;
        }}
        onClick={(e) => {
          // Bulle fermée : le premier clic (ou toucher) l'ouvre ; le lien ne
          // s'active qu'une fois le message visible. L'état se lit À L'APPUI :
          // le focus que provoque ce même appui ouvre la bulle avant le clic.
          // `detail === 0` : activation au clavier, sans appui ; la bulle est
          // ouverte par le focus, sauf si le visiteur vient de la fermer.
          if (!(e.detail === 0 ? ouvert : ouvertAuAppui.current)) {
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
