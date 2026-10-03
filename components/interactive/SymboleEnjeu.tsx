import React from "react";

import { CLE_PAR_LIBELLE } from "@/lib/enjeux";
import { GLYPHES_SVG } from "@/lib/enjeux-glyphes";

export { CLES_AVEC_SYMBOLE } from "@/lib/enjeux-glyphes";

// Le symbole de chacun des 12 enjeux du CAP, demandé par Yannick (issue #425)
// — les tracés eux-mêmes sont dans lib/enjeux-glyphes.ts (chaînes SVG), pour
// servir aussi aux cartes de député rendues sans React ;
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
  const glyphe = resolue ? GLYPHES_SVG[resolue] : undefined;
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
      dangerouslySetInnerHTML={{ __html: glyphe }}
    />
  );
}
