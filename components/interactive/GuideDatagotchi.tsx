"use client";

// La mascotte Datagotchi devient guide du site.
// Elle arrive, ouvre d'elle-même sa bulle UNE fois (première visite) pour
// proposer une visite ; si le visiteur accepte, elle parcourt les modules de
// la Une : un projecteur éclaire l'élément expliqué et,
// sur grand écran, la mascotte (et sa bulle) se déplace à côté de lui. Sur
// téléphone, elle reste au bas de l'écran. Refuser, terminer ou quitter
// (×, Échap) mémorise le choix ; cliquer sur le personnage repropose la visite.
//
// Reprend l'habillage de PromoDatagotchi (classes dg-*) ; aucune donnée lue.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { basePath } from "@/lib/site";
import { PERSOS, choisirPerso, type Perso } from "@/lib/promoDatagotchi";
import {
  CLE_STOCKAGE,
  OFFRE,
  etapesPresentes,
  type Etape,
} from "@/lib/guideVisite";

type Phase = "attente" | "entre" | "parle";
type Rect = { top: number; left: number; width: number; height: number };
type Place = { left: number; top: number; cote: "droite" | "gauche" | "dessous" | "dessus" | "dedans" };

const DELAI_APPARITION_MS = 8000;
const DUREE_ENTREE_MS = 1350;
const DELAI_OFFRE_MS = 600;
const MARGE_PROJECTEUR = 8;
const ECART = 18; // entre l'élément éclairé et le guide
const BORD = 12; // marge minimale au bord de la fenêtre
const LARGEUR_MOBILE = 900;

function memoriser() {
  try {
    window.localStorage.setItem(CLE_STOCKAGE, "vu");
  } catch {
    /* navigation privée : la bulle se reproposera */
  }
}

function dejaVu(): boolean {
  try {
    return window.localStorage.getItem(CLE_STOCKAGE) !== null;
  } catch {
    return false;
  }
}

function surMobile(): boolean {
  return window.innerWidth <= LARGEUR_MOBILE;
}

// Premier élément VISIBLE qui correspond au sélecteur : une même étape peut
// viser les tuiles sur ordinateur et les barres sur téléphone.
function trouver(selecteur: string): Element | null {
  for (const el of document.querySelectorAll(selecteur)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const pince = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Où poser le guide (taille l × h) à côté de l'élément r, dans la fenêtre.
// Essaie à droite, à gauche, dessous, dessus ; sinon, dans le coin inférieur
// droit de l'élément (cas des très grands éléments).
function placer(r: Rect, l: number, h: number): Place {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const milieuY = pince(r.top + r.height / 2 - h * 0.75, BORD, vh - h - BORD);
  if (r.left + r.width + ECART + l <= vw - BORD) {
    return { cote: "droite", left: r.left + r.width + ECART, top: milieuY };
  }
  if (r.left - ECART - l >= BORD) {
    return { cote: "gauche", left: r.left - ECART - l, top: milieuY };
  }
  const gauche = pince(r.left + r.width - l, BORD, vw - l - BORD);
  if (r.top + r.height + ECART + h <= vh - BORD) {
    return { cote: "dessous", left: gauche, top: r.top + r.height + ECART };
  }
  if (r.top - ECART - h >= BORD) {
    return { cote: "dessus", left: gauche, top: r.top - ECART - h };
  }
  return {
    cote: "dedans",
    left: vw - l - BORD - 8,
    top: vh - h - BORD,
  };
}

export function GuideDatagotchi({ surLabo = false }: { surLabo?: boolean }) {
  const [perso, setPerso] = useState<Perso | null>(null);
  const [source, setSource] = useState("");
  const [phase, setPhase] = useState<Phase>("attente");
  const [ouvert, setOuvert] = useState(false);
  const [etapes, setEtapes] = useState<Etape[]>([]);
  // -1 = l'offre ; 0..n-1 = les étapes de la visite.
  const [rang, setRang] = useState(-1);
  const [rect, setRect] = useState<Rect | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [saut, setSaut] = useState(0);
  const racine = useRef<HTMLElement>(null);
  const bulle = useRef<HTMLDivElement>(null);

  // Arrivée du personnage, puis offre spontanée à la première visite.
  useEffect(() => {
    const choix = choisirPerso(Math.random());
    const immobile = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fiche = PERSOS[choix];
    const src = `${basePath}${(immobile && fiche.imageFixe) || fiche.image}`;
    const minuteries: number[] = [];
    const image = new Image();
    let annule = false;
    image.onload = () => {
      if (annule) return;
      setSource(src);
      setPerso(choix);
      minuteries.push(
        window.setTimeout(() => {
          setPhase("entre");
          minuteries.push(
            window.setTimeout(() => {
              setPhase("parle");
              if (!dejaVu()) {
                minuteries.push(window.setTimeout(() => setOuvert(true), DELAI_OFFRE_MS));
              }
            }, DUREE_ENTREE_MS),
          );
        }, DELAI_APPARITION_MS),
      );
    };
    image.src = src;
    return () => {
      annule = true;
      image.onload = null;
      minuteries.forEach((m) => window.clearTimeout(m));
    };
  }, []);

  const enVisite = ouvert && rang >= 0;
  const etape = rang >= 0 ? etapes[rang] : undefined;
  const cible = enVisite && etape?.cible ? etape.cible : null;

  // Défilement vers l'élément de l'étape : un petit élément se pose au tiers
  // de la fenêtre (place pour le guide autour), un grand en haut.
  useEffect(() => {
    if (!cible) return;
    const el = trouver(cible);
    if (!el) return;
    const immobile = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const mobile = surMobile();
    const viser = mobile ? 70 : r.height < vh * 0.45 ? vh * 0.3 : 24;
    window.scrollTo({ top: r.top + window.scrollY - viser, behavior: immobile ? "auto" : "smooth" });
    setSaut((s) => s + 1);
  }, [cible]);

  // Le projecteur et le guide suivent l'élément pendant que la page défile.
  useLayoutEffect(() => {
    if (!cible) {
      setRect(null);
      setPlace(null);
      return;
    }
    const el = trouver(cible);
    if (!el) return;
    let raf = 0;
    const mesurer = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const eclaire = {
          top: r.top - MARGE_PROJECTEUR,
          left: r.left - MARGE_PROJECTEUR,
          width: r.width + 2 * MARGE_PROJECTEUR,
          height: r.height + 2 * MARGE_PROJECTEUR,
        };
        setRect(eclaire);
        const guide = racine.current;
        if (!guide || surMobile()) {
          setPlace(null);
          return;
        }
        setPlace(placer(eclaire, guide.offsetWidth, guide.offsetHeight));
      });
    };
    mesurer();
    // La bulle change de hauteur d'une étape à l'autre : on remesure une fois
    // qu'elle a pris sa taille.
    const encore = window.setTimeout(mesurer, 80);
    window.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(encore);
      window.removeEventListener("scroll", mesurer);
      window.removeEventListener("resize", mesurer);
    };
  }, [cible, rang]);

  const lancer = useCallback(() => {
    // Une cible absente OU invisible à cette largeur d'écran (ex. la flèche
    // de variation des tuiles, remplacée par des barres sur téléphone) : sautée.
    setEtapes(
      etapesPresentes((s) => trouver(s) !== null),
    );
    setRang(0);
  }, []);

  const quitter = useCallback(() => {
    memoriser();
    setOuvert(false);
    setRang(-1);
  }, []);

  const suivant = useCallback(() => setRang((r) => Math.min(r + 1, etapes.length - 1)), [etapes.length]);
  const precedent = useCallback(() => setRang((r) => Math.max(r - 1, 0)), []);

  // Échap quitte, ← et → changent d'étape.
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") quitter();
      else if (rang >= 0 && e.key === "ArrowRight") suivant();
      else if (rang >= 0 && e.key === "ArrowLeft") precedent();
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [ouvert, rang, quitter, suivant, precedent]);

  // Le focus suit la bulle : un lecteur d'écran lit la nouvelle étape.
  useEffect(() => {
    if (ouvert) bulle.current?.focus({ preventScroll: true });
  }, [ouvert, rang]);

  if (!perso) return null;
  const fiche = PERSOS[perso];
  const derniere = rang === etapes.length - 1;

  const style: React.CSSProperties | undefined = place
    ? ({ left: place.left, top: place.top, right: "auto", bottom: "auto", ["--dg-bas" as string]: "0px" } as React.CSSProperties)
    : undefined;

  return (
    <>
      {rect && (
        <div
          className="dg-projecteur"
          aria-hidden="true"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <aside
        ref={racine}
        className="dg-promo dg-guide"
        data-perso={perso}
        data-phase={phase}
        data-ouvert={ouvert ? "" : undefined}
        data-leve={surLabo && !place ? "" : undefined}
        data-visite={enVisite ? "" : undefined}
        data-place={place?.cote}
        aria-label="Guide du site"
        style={style}
      >
        <div
          ref={bulle}
          className="dg-bulle"
          data-fini=""
          inert={!ouvert}
          tabIndex={-1}
          role="dialog"
          aria-live="polite"
          aria-label={etape ? etape.titre : "Visite guidée"}
        >
          <button type="button" className="dg-fermer" onClick={quitter} aria-label="Quitter la visite">
            <svg viewBox="0 0 10 10" width="12" height="12" aria-hidden="true">
              <path d="M1 1 9 9M9 1 1 9" />
            </svg>
          </button>

          {rang < 0 || !etape ? (
            <>
              <p className="dg-nom">Datagotchi</p>
              <p className="dg-texte">{OFFRE.texte}</p>
              <div className="dg-boutons">
                <button type="button" className="dg-action" onClick={lancer}>
                  {OFFRE.oui}
                </button>
                <button type="button" className="dg-secondaire" onClick={quitter}>
                  {OFFRE.non}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="dg-nom">
                {rang + 1}/{etapes.length}
              </p>
              <p className="dg-titre">{etape.titre}</p>
              <p className="dg-texte">{etape.texte}</p>
              <p className="dg-liens">
                {etape.metho && (
                  <a className="dg-lien" href={`${basePath}/methodologie/#${etape.metho}`} target="_blank" rel="noopener">
                    En savoir plus
                  </a>
                )}
                {derniere && (
                  <>
                    <a className="dg-lien" href={`${basePath}/methodologie/`} target="_blank" rel="noopener">
                      La page Méthodologie
                    </a>
                    <a className="dg-lien" href={fiche.href} target="_blank" rel="noopener">
                      Découvrir Datagotchi
                    </a>
                  </>
                )}
              </p>
              <div className="dg-boutons">
                {rang > 0 && (
                  <button type="button" className="dg-secondaire" onClick={precedent}>
                    ‹ Précédent
                  </button>
                )}
                {derniere ? (
                  <button type="button" className="dg-action" onClick={quitter}>
                    Terminer
                  </button>
                ) : (
                  <button type="button" className="dg-action" onClick={suivant}>
                    Suivant ›
                  </button>
                )}
              </div>
            </>
          )}
          <svg className="dg-queue" viewBox="0 0 26 20" width="26" height="20" aria-hidden="true">
            <path className="dg-queue-fond" d="M0 0H26V20H18V14H12V8H6V2H0Z" />
            <path className="dg-queue-trait" d="M1 0V7H7V13H13V19H25V0" />
          </svg>
        </div>

        <button
          type="button"
          className="dg-perso"
          aria-label={ouvert ? "Datagotchi, guide du site" : "Ouvrir la visite guidée"}
          aria-expanded={ouvert}
          tabIndex={phase === "parle" ? 0 : -1}
          onClick={() => {
            if (ouvert) return;
            setRang(-1);
            setOuvert(true);
          }}
        >
          <span className="dg-signe" aria-hidden="true">
            ?
            <svg className="dg-signe-queue" viewBox="0 0 14 10" width="14" height="10">
              <path className="dg-signe-queue-fond" d="M0 0H14V10H5V5H0Z" />
              <path className="dg-signe-queue-trait" d="M1 0V4H6V9H13V0" />
            </svg>
          </span>
          <span className="dg-perso-vie" key={saut} data-saut={saut > 0 ? "" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source} alt="" width={fiche.largeur} height={fiche.hauteur} draggable={false} />
          </span>
        </button>
      </aside>
    </>
  );
}
