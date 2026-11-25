/** Les portraits des élus vivent sous `<racine>/cartes/web/<slug>.jpg` (écran)
 *  et `<racine>/cartes/trame/<slug>.webp` (cartes). La racine est
 *  `/images/deputes` pour la législature courante, et
 *  `/images/deputes/archive-43e` pour l'archive figée de la 43e : le
 *  rafraîchissement de nuit remplace les premiers par le nouvel élu de la
 *  circonscription, jamais les seconds. */
export const RACINE_PORTRAITS = "/images/deputes/cartes";
export const RACINE_PORTRAITS_ARCHIVE_43E = "/images/deputes/archive-43e/cartes";

/** La trame des cartes qui correspond à un portrait écran, ou null. */
export function trameDuPortrait(portrait?: string): string | null {
  const m = portrait?.match(/^(.*\/cartes)\/web\/(.+)\.jpg$/);
  return m ? `${m[1]}/trame/${m[2]}.webp` : null;
}
