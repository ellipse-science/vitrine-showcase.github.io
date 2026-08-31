import React from "react";

import { CLE_PAR_LIBELLE } from "@/lib/enjeux";

// Le symbole de chacun des 12 enjeux du CAP, demandé par Yannick (issue #425)
// pour que le même enjeu se reconnaisse d'un module à l'autre.
//
// POURQUOI DES GLYPHES DESSINÉS ET PAS DES ÉMOJIS. Un émoji est rendu par le
// système : sa couleur, son épaisseur de trait et son cadrage nous échappent,
// et il change d'apparence d'une plateforme à l'autre. Sur une surface
// éditoriale composée en Playfair et en Plex Mono, il détonne. Ces douze-ci
// partagent un seul gabarit — 24×24, trait de 1,6, sans remplissage — et
// prennent la couleur du texte qui les entoure (`currentColor`), ce qui laisse
// à l'appelant le soin de décider si le glyphe porte la couleur de l'enjeu ou
// celle de la surface.
//
// LA RÈGLE DE COULEUR, une fois pour les quatre modules :
//   - fond neutre (papier, encre)      → le glyphe prend la couleur de l'enjeu
//   - fond DE la couleur de l'enjeu    → le glyphe prend l'encre de la tuile
// Elle vaut aussi pour le radar, où le texte garde sa couleur de RÉGION (bleu
// Québec, rouge Canada) : cette couleur-là porte déjà une information, on ne la
// remplace pas, on ajoute le glyphe à côté.
const GLYPHES: Record<string, React.ReactNode> = {
  // Un globe : méridiens et parallèles.
  international_affairs_and_defense: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <ellipse cx="12" cy="12" rx="3.6" ry="8.4" />
      <path d="M3.9 9.2h16.2M3.9 14.8h16.2" />
    </>
  ),
  // Un fronton à trois colonnes.
  governments_and_governance: (
    <>
      <path d="M3.6 9.4 12 4.6l8.4 4.8" />
      <path d="M5.8 9.4v8.2M12 9.4v8.2M18.2 9.4v8.2" />
      <path d="M3.4 19.4h17.2" />
    </>
  ),
  // Un dollar. Deux essais l'ont précédé : trois barres croissantes, qui
  // disaient « graphique » plutôt qu'« économie », puis une pile de pièces,
  // écartée par Adrien (30-08). Le signe est le plus direct des trois, et il
  // reste le seul glyphe de la série tracé comme un caractère — c'est
  // justement ce qui le rend immédiat.
  economy_and_labour: (
    <>
      <path d="M12 3.6v16.8" />
      <path d="M16.4 7.6c0-1.9-2-3.1-4.4-3.1S7.6 5.7 7.6 7.7c0 4.5 8.8 2.3 8.8 6.8 0 2-2 3.2-4.4 3.2s-4.4-1.2-4.4-3.2" />
    </>
  ),
  // Un tracteur. L'épi qui tenait cette place a été cédé à Environnement : les
  // deux étaient des végétaux verts voisins dans la planche, indistinguables en
  // petit (retour d'Adrien, 31-08). Changer de REGISTRE lève la confusion mieux
  // que redessiner.
  //
  // Quatre détails portent chacun une part du sens, et aucun n'est décoratif :
  // la CHEMINÉE (sans elle, la silhouette est un camion), le MOYEU de la grande
  // roue (sans lui, elle se lit comme un anneau), le PARE-BRISE incliné (il
  // sépare cabine et capot en remplaçant un trait plutôt qu'en ajoutant un), et
  // le GARDE-BOUE — le geste le plus agricole du dessin, celui qu'aucune
  // camionnette n'a.
  //
  // ⚠️ Le bord avant du capot s'arrête à y = 16,1, pas à un chiffre rond : c'est
  // l'ordonnée où la roue avant (centre 17,6 ; 18,2, rayon 2,4) coupe x = 18,8.
  // La première version descendait à 17,0 et laissait un moignon visible DANS la
  // roue. Si ce tracé bouge, recalculer — ne pas estimer à l'œil.
  public_lands_and_agriculture: (
    <>
      <path d="M4.4 13.8V7h5.8l1.6 6.8h7v2.3" />
      <path d="M3.2 15.4A4.6 4.6 0 0 1 12 15.4" />
      <circle cx="7.6" cy="17" r="3.8" />
      <circle cx="7.6" cy="17" r="1.3" />
      <circle cx="17.6" cy="18.2" r="2.4" />
      <path d="M13 13.6V6" />
    </>
  ),
  // Un drapeau sur sa hampe.
  culture_and_nationalism: (
    <>
      <path d="M6.6 20V4.4" />
      <path d="M6.6 5.2h11.8l-2.6 3.6 2.6 3.6H6.6" />
    </>
  ),
  // Deux silhouettes de tailles différentes.
  rights_liberties_minorities_discrimination: (
    <>
      <circle cx="7" cy="8.2" r="2.4" />
      <circle cx="16.4" cy="7.2" r="2" />
      <path d="M3.4 19.6c0-2.9 1.6-4.6 3.6-4.6s3.6 1.7 3.6 4.6" />
      <path d="M13.4 19.6c0-2.5 1.3-3.9 3-3.9s3 1.4 3 3.9" />
    </>
  ),
  // Une puce et ses broches.
  technology: (
    <>
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <path d="M10.4 4.6v3.4M13.6 4.6v3.4M10.4 16v3.4M13.6 16v3.4M4.6 10.4H8M4.6 13.6H8M16 10.4h3.4M16 13.6h3.4" />
    </>
  ),
  // L'épi, repris de Terres publiques quand celui-ci est passé au tracteur.
  // Deux feuilles ont été dessinées puis écartées avant ça — l'une symétrique et
  // posée droite, qui lisait bouclier, l'autre inclinée. Toutes deux
  // contournaient une contrainte : ne pas ressembler à l'épi voisin. La
  // contrainte a disparu avec le tracteur, et l'épi était le meilleur dessin des
  // trois depuis le début (idée d'Adrien, 31-08).
  environment_and_energy: (
    <>
      <path d="M12 20V9.8" />
      <path d="M12 9.8c0-3 1.6-5 4.2-5.6.5 3-.9 5.2-4.2 5.6Z" />
      <path d="M12 13.4c-3.3-.4-4.7-2.6-4.2-5.6C10.4 8.4 12 10.4 12 13.4Z" />
      <path d="M5.4 20h13.2" />
    </>
  ),
  // Un tracé de pouls.
  // Une croix. Le tracé de pouls qu'elle remplace demandait sept changements de
  // direction dans 24 unités : à 13 px, il ne se lisait plus comme un pouls mais
  // comme du bruit. « Une simple croix serait plus clair » (Yannick, 31-08) — et
  // c'est le seul symbole de santé que personne n'a besoin d'apprendre.
  //
  // Contour et non silhouette pleine : la série entière est d'un seul trait, et
  // Adrien a tranché en faveur du contour (31-08). En contrepartie assumée, son
  // intérieur se resserre sous 20 px.
  health_and_social_services: (
    <>
      <path d="M8.5 4h7v4.5H20v7h-4.5V20h-7v-4.5H4v-7h4.5Z" />
    </>
  ),
  // Une balance.
  law_and_crime: (
    <>
      <path d="M12 4.4v15.2M6.2 19.6h11.6M4.4 7.6h15.2" />
      <path d="M4.4 7.6 2 13.2h4.8Z" />
      <path d="M19.6 7.6 17.2 13.2H22Z" />
    </>
  ),
  // Une toque universitaire.
  education: (
    <>
      <path d="M12 8.2 3.4 11.4 12 14.6l8.6-3.2Z" />
      <path d="M6.8 12.8v4.1c0 1.4 2.3 2.5 5.2 2.5s5.2-1.1 5.2-2.5v-4.1" />
    </>
  ),
  // Une valise. La première version dessinait une flèche traversant une
  // frontière pointillée : Jules ne la lisait pas (« c'est le seul que je
  // trouve pas clair », fil #02___vitrine du 30-08), et il avait raison — trois
  // traits fins qui se croisent deviennent une tache à 13 px. La valise tient
  // en deux formes fermées, qui restent lisibles à toutes les tailles.
  immigration: (
    <>
      <rect x="3.4" y="7.8" width="17.2" height="11.8" rx="1.6" />
      <path d="M9 7.8V6.2c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6v1.6" />
      <path d="M8.4 7.8v11.8M15.6 7.8v11.8" />
    </>
  ),
};

/** Les 12 enjeux ont-ils tous leur symbole ? Le test `symbolesEnjeux` s'en sert. */
export const CLES_AVEC_SYMBOLE = Object.keys(GLYPHES);

/** Le symbole d'un enjeu, désigné par sa clé technique OU par son libellé
 *  français — les deux existent selon les modules : la Une et le treemap
 *  portent la clé, le Polimètre+ ne connaît que le libellé.
 *
 *  Rend `null` pour un enjeu inconnu plutôt qu'un glyphe de repli : un symbole
 *  faux se lit comme une information, une absence se lit comme une absence. */
export function SymboleEnjeu({
  cle,
  libelle,
  className,
  style,
  svg,
}: {
  cle?: string | null;
  libelle?: string | null;
  className?: string;
  style?: React.CSSProperties;
  /** Position et taille, quand le symbole est imbriqué DANS un `<svg>` (le
   *  radar). Sans elles, un `<svg>` imbriqué prend 100 % du parent, soit la
   *  largeur entière du radar. */
  svg?: { x: number; y: number; taille: number };
}) {
  const resolue = cle ?? (libelle ? CLE_PAR_LIBELLE[libelle] : undefined);
  const glyphe = resolue ? GLYPHES[resolue] : undefined;
  if (!glyphe) return null;
  return (
    <svg
      className={className ? `symbole-enjeu ${className}` : "symbole-enjeu"}
      viewBox="0 0 24 24"
      {...(svg ? { x: svg.x, y: svg.y, width: svg.taille, height: svg.taille } : null)}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphe}
    </svg>
  );
}
