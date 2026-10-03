"use client";

import { useLayoutEffect, useMemo, useRef } from "react";

import type { DeputyRow, PeriodKey } from "@/lib/data/assemblee";
import { ajusterFonctions, ajusterLegende, ajusterNom, ajusterRubriques, ajusterVerso } from "@/lib/cartes/ajustements";
import { recto, verso, type Face, type Rendu } from "@/lib/cartes/faces";
import { slugCirco } from "@/lib/cartes/fonctions";
import { H, W } from "@/lib/cartes/gabarit";
import type { CarteSite } from "@/lib/cartes/site";
import type { Carte, Etiquette } from "@/lib/cartes/types";
import { symboleEnjeuSVG } from "@/lib/enjeux-glyphes";

// LA CARTE DU VESTIAIRE EST LA CARTE IMPRIMÉE — même balisage, même CSS, par
// lib/cartes/faces.ts. La face est dessinée dans un repère fixe de
// 1071 × 1496 px, puis réduite par `transform: scale()` à la largeur de la
// carte : c'est le même moteur de rendu que la capture Chromium du
// générateur, le résultat est donc identique au pixel près, à l'échelle.
//
// POURQUOI UNE OMBRE (shadow DOM). Le CSS des faces nomme ses classes
// librement (.nom, .bande, .panneau…) et cible `body` : posé dans la page, il
// se battrait avec les styles du site, et réciproquement. Dans l'ombre d'un
// élément, il est seul au monde ; `body` devient `:host`. Les polices, elles,
// se déclarent au niveau du document : la feuille Google Fonts de la face est
// ajoutée à <head> à la première carte montée (Oswald et Archivo Narrow, que
// le site ne charge pas ailleurs).
//
// LES AJUSTEMENTS (nom trop long, verso qui déborde) sont ceux du générateur,
// exécutés ici après `document.fonts.ready`, dans l'ombre de chaque carte :
// mesurés avant que les polices soient là, ils rapetisseraient pour rien.

/** Les fichiers que le site sert pour les cartes (préparés par
 *  scripts/social/portraits-trames.ts et commis dans le dépôt). */
const ASSETS = {
  capp: "/images/cartes/capp.png",
  ulaval: "/images/cartes/ulaval.png",
  vitrine: "/images/cartes/vitrine.png",
  ecusson: (cle: Carte["cle"]) => (cle === "ind" ? null : `/images/cartes/ecusson-${cle}.png`),
  portrait: (deputy: DeputyRow) => {
    const asset = deputy.portrait?.match(/\/images\/deputes\/cartes\/web\/(.+)\.jpg$/)?.[1];
    return asset ? `/images/deputes/cartes/trame/${asset}.webp` : null;
  },
  signature: (slug: string) => `/images/cartes/signature-${slug}.png`,
};

const RENDU: Rendu = {
  impression: false,
  glyphe: (cle, color, size) => symboleEnjeuSVG(cle, `width:${size}px;height:${size}px;color:${color};display:block`),
  logoUlaval: ASSETS.ulaval,
};

export type ContexteCartes = {
  periode: PeriodKey;
  /** La fiche d'un élu dans les trois périodes, par slug de circonscription. */
  fiches: Map<string, Partial<Record<PeriodKey, DeputyRow>>>;
  /** Étendue du ton réellement observée dans chaque période (échelle du ton). */
  maxAbs: Record<PeriodKey, number>;
  libelles: Record<PeriodKey, Etiquette>;
  /** Dernière séance couverte, pour la note des sources du verso. */
  derniereSeance: string;
  /** Slugs des légendaires dont on a l'autographe. */
  signatures: ReadonlySet<string>;
};

/** Reconstitue la Carte complète : la fiche de carte préparée au build, plus
 *  l'élu du casier. */
export function carteComplete(c: CarteSite, deputy: DeputyRow, contexte: ContexteCartes): Carte {
  const { elu, ...reste } = c;
  // L'élu de la carte : la ligne du casier, ou la fiche réunie de la personne
  // quand elle en a plusieurs (voir CartesSite.personnes).
  const personne = contexte.fiches.get(elu)?.[contexte.periode];
  return { ...reste, deputy: personne ? { ...deputy, ...personne } : deputy, signature: contexte.signatures.has(c.slug) ? ASSETS.signature(c.slug) : null };
}

/** Les polices des faces, telles que le CSS les demande. Les AJUSTEMENTS ne
 *  peuvent se faire qu'une fois ces fontes-là chargées : `document.fonts.ready`
 *  seul ne suffit pas — il se résout avant même que la feuille Google Fonts
 *  ajoutée à l'instant ait déclaré quoi que ce soit, et un verso mesuré en
 *  Arial déborde, se fait resserrer pour rien, puis reçoit Oswald. */
const POLICES_FACES = [
  "900 68px 'Playfair Display'", "700 60px Oswald", "600 27px Oswald", "500 22px Oswald", "400 20px Oswald",
  "600 21px 'IBM Plex Mono'", "400 24px 'Source Serif 4'", "italic 400 24px 'Source Serif 4'",
  "400 20px 'Archivo Narrow'", "italic 400 20px 'Archivo Narrow'", "600 20px 'Archivo Narrow'", "700 20px 'Archivo Narrow'",
];

const feuilles = new Map<string, Promise<void>>();
function chargerPolices(href: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  let p = feuilles.get(href);
  if (p) return p;
  p = new Promise<void>((resoudre) => {
    const existante = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    if (existante) { resoudre(); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resoudre();
    link.onerror = () => resoudre();
    document.head.appendChild(link);
  }).then(() => Promise.all(POLICES_FACES.map((f) => document.fonts.load(f).catch(() => []))))
    .then(() => document.fonts.ready).then(() => undefined);
  feuilles.set(href, p);
  return p;
}

export function CarteDepute({ carte, face, contexte }: { carte: Carte; face: "recto" | "verso"; contexte: ContexteCartes }) {
  const hote = useRef<HTMLDivElement>(null);
  const ombre = useRef<ShadowRoot | null>(null);

  const rendue: Face = useMemo(() => {
    const portrait = ASSETS.portrait(carte.deputy);
    const ecusson = ASSETS.ecusson(carte.cle);
    if (face === "recto") return recto(carte, portrait, ecusson, ASSETS.capp, RENDU);
    const fiche = contexte.fiches.get(slugCirco(carte.deputy)) ?? { [contexte.periode]: carte.deputy };
    return verso(carte, fiche, contexte.maxAbs, contexte.libelles, portrait, ecusson, ASSETS.vitrine, ASSETS.capp, contexte.derniereSeance, { ...RENDU, periodeFiche: contexte.periode });
  }, [carte, face, contexte]);

  useLayoutEffect(() => {
    const el = hote.current;
    if (!el) return;
    if (!ombre.current) ombre.current = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    const racine = ombre.current;
    // `body` → `:host` : le CSS de la face est écrit pour une page entière.
    // `all:initial` d'abord : l'ombre arrête les sélecteurs du site, pas
    // l'HÉRITAGE — interligne, interlettrage, casse ou graisse posés sur la
    // carte du vestiaire descendraient dans la face et la décaleraient de
    // quelques pixels par ligne (constaté le 2 oct. : un verso écrasé de 8 px
    // en haut). On repart donc des valeurs d'une page vierge, comme Chromium.
    const css = rendue.css.replace(/(^|\n)\s*body\{/, "$1:host{");
    racine.innerHTML = `<style>:host{all:initial}\n${css}\n:host{display:block;transform-origin:0 0}</style>${rendue.corps}`;
    let annule = false;
    chargerPolices(rendue.polices).then(() => {
      if (annule) return;
      ajusterNom(racine);
      ajusterRubriques(racine);
      ajusterLegende(racine);
      ajusterFonctions(racine);
      ajusterVerso(racine);
    });
    return () => { annule = true; };
  }, [rendue]);

  // Le dessin fait W × H ; la boîte prend la largeur de la carte et la
  // hauteur qui va avec, et l'hôte y est réduit d'un seul facteur.
  return (
    <span className="cd-boite" aria-hidden="true">
      <div ref={hote} className="cd-hote" style={{ width: W, height: H, transform: `scale(var(--cd-k))` }} />
    </span>
  );
}
