import type { ReactNode } from "react";

/**
 * Un pictogramme par catégorie d'enjeu CAP, pour le fond des pochettes.
 *
 * Ils sont dessinés au TRAIT, dans une même famille : `viewBox` 24×24, aucun
 * remplissage, épaisseur 1,5, extrémités arrondies. La pochette les agrandit
 * jusqu'à déborder du carré et les pose en filigrane sur le fond du ton, où ils
 * font la matière plutôt que l'information : le nom de l'enjeu est écrit en
 * toutes lettres juste en dessous, sur la piste « Enjeu clé ». Un pictogramme
 * qu'on ne reconnaît pas ne coûte donc rien.
 *
 * ⚠️ Les clés sont les libellés FRANÇAIS canoniques des 12 catégories (guide de
 * rédaction, entrée « Catégories d'enjeux »), ceux que produit
 * `THEME_VERS_CATEGORIE`. Ils sont partagés avec le Digital Society Lab et
 * l'Institut Donald J. Savoie : ne pas les retoucher ici.
 *
 * ⚠️ « Culture et nationalisme » absorbe aussi `transportation` et `housing`
 * (convention du pipeline, cf. `radar-issues-score`). Aucun dessin ne peut
 * honnêtement couvrir culture, nationalisme, transport et logement à la fois :
 * le masque de théâtre ne rend que le premier terme. À revoir avec Adrien si
 * la catégorie devient visible ailleurs que sur une pochette.
 */
export const PICTO_ENJEU: Record<string, ReactNode> = {
  "Économie et travail": (
    <>
      <path d="M4 20h16" />
      <path d="M7.5 20v-4.5M12 20v-9M16.5 20v-13.5" />
    </>
  ),
  "Santé et politiques sociales": (
    <path d="M2 12h4.5l2.5-6 3.5 12 2.5-6H22" />
  ),
  "Environnement et énergie": (
    <>
      <path d="M20.5 3.5c0 9-5.5 14.5-11.5 14.5-1.5 0-3-.4-3-.4s.4-11.5 8.5-13.3c3-.7 6-.8 6-.8z" />
      <path d="M4.5 21c2.5-4.5 6.5-9 12-12.5" />
    </>
  ),
  "Terres publiques et agriculture": (
    <>
      <path d="M12 21V8" />
      <path d="M12 12c0-2.6 1.8-4.5 4-4.5 0 2.6-1.8 4.5-4 4.5zM12 12c0-2.6-1.8-4.5-4-4.5 0 2.6 1.8 4.5 4 4.5z" />
      <path d="M12 7c0-2.6 1.8-4.5 4-4.5 0 2.6-1.8 4.5-4 4.5zM12 7c0-2.6-1.8-4.5-4-4.5 0 2.6 1.8 4.5 4 4.5z" />
    </>
  ),
  Immigration: (
    <>
      <path d="M3 12h11" />
      <path d="M10.5 8l4 4-4 4" />
      <path d="M19 2.5v4M19 10v4M19 17.5v4" />
    </>
  ),
  /** Une note de musique, et NON un masque de théâtre : le masque, réduit à
   *  24 px, se lit comme une frimousse souriante. Sur une pochette dont le fond
   *  porte déjà le ton en vert ou en rouge, un visage joyeux double l'encodage
   *  du sentiment, et un fond rouge surmonté d'un sourire se contredit. */
  "Culture et nationalisme": (
    <>
      <path d="M9.5 18.5V5.5l8-2v13" />
      <ellipse cx="7" cy="18.5" rx="2.5" ry="2" />
      <ellipse cx="15" cy="16.5" rx="2.5" ry="2" />
    </>
  ),
  "Affaires internationales et défense": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.5 2.6 3.8 5.5 3.8 8.5s-1.3 5.9-3.8 8.5c-2.5-2.6-3.8-5.5-3.8-8.5S9.5 6.1 12 3.5z" />
    </>
  ),
  Technologie: (
    <>
      <path d="M8.5 8.5h7v7h-7z" />
      <path d="M10.5 3.5v5M13.5 3.5v5M10.5 15.5v5M13.5 15.5v5" />
      <path d="M3.5 10.5h5M3.5 13.5h5M15.5 10.5h5M15.5 13.5h5" />
    </>
  ),
  "Gouvernements et gouvernance": (
    <>
      <path d="M2.5 20.5h19" />
      <path d="M12 3l9.5 5.5h-19z" />
      <path d="M5.5 20.5v-9M9.8 20.5v-9M14.2 20.5v-9M18.5 20.5v-9" />
    </>
  ),
  "Éducation": (
    <>
      <path d="M12 3.5L2 8.5l10 5 10-5-10-5z" />
      <path d="M6 11v5.5c0 1.4 2.7 3 6 3s6-1.6 6-3V11" />
    </>
  ),
  "Loi et crime": (
    <>
      <path d="M12 3.5v17M7 20.5h10" />
      <path d="M3.5 7.5h17" />
      <path d="M3.5 7.5L1.5 13a3 3 0 0 0 4 0zM20.5 7.5L22.5 13a3 3 0 0 1-4 0z" />
    </>
  ),
  "Droits, libertés, minorités et discrimination": (
    <>
      <circle cx="8" cy="6.5" r="2.6" />
      <path d="M3.5 20.5v-3.2a4.5 4.5 0 0 1 9 0v3.2" />
      <circle cx="16.8" cy="8.5" r="2.1" />
      <path d="M13.4 20.5v-2.6a3.6 3.6 0 0 1 7.2 0v2.6" />
    </>
  ),
  /** Le reste : « aucun enjeu identifié » n'est pas un enjeu, d'où l'absence de
   *  motif — un cercle barré, qui ne prétend rien nommer. */
  "Aucun enjeu identifié": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7.5 12h9" />
    </>
  ),
};

/** Le pictogramme d'un enjeu, ou celui du reste si l'enjeu est inconnu. */
export function pictoEnjeu(enjeu: string | null | undefined): ReactNode {
  if (!enjeu) return PICTO_ENJEU["Aucun enjeu identifié"];
  return PICTO_ENJEU[enjeu] ?? PICTO_ENJEU["Aucun enjeu identifié"];
}
