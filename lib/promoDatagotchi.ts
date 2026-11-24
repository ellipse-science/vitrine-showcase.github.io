// La mascotte Datagotchi du coin inférieur droit : un seul personnage à la
// fois (deux auraient encombré la page), tiré au sort à chaque chargement.
// Logique pure ici (testable sans navigateur), affichage dans
// components/interactive/PromoDatagotchi.tsx.

export type Perso = "chien" | "prof";

export type FichePerso = {
  nom: string;
  texte: string;
  action: string;
  href: string;
  image: string;
  // Version immobile, servie quand le visiteur demande moins de mouvement :
  // un GIF continue de bouger quoi qu'en dise le CSS.
  imageFixe?: string;
  largeur: number;
  hauteur: number;
};

// L'élection est passée : les deux personnages mènent maintenant au site
// principal du projet. Le paramètre utm_source permet à Datagotchi de
// reconnaître les visites venues de la Vitrine ; il ne change rien à ce que la
// page affiche.
const DATAGOTCHI = {
  nom: "Datagotchi",
  texte: "Salut! Viens découvrir notre projet Datagotchi!",
  action: "Visiter le site",
  href: "https://www.datagotchi.com/?utm_source=vitrinedemocratique",
};

export const PERSOS: Record<Perso, FichePerso> = {
  chien: {
    ...DATAGOTCHI,
    image: "/datagotchi/chien.gif",
    imageFixe: "/datagotchi/chien.png",
    // 14 × 15 pixels d'origine, agrandis ×6 sans lissage.
    largeur: 84,
    hauteur: 90,
  },
  prof: {
    ...DATAGOTCHI,
    image: "/datagotchi/prof.png",
    largeur: 78,
    hauteur: 102,
  },
};

// `hasard` : un nombre de [0, 1[, moitié-moitié entre les deux personnages.
export function choisirPerso(hasard: number): Perso {
  return hasard < 0.5 ? "chien" : "prof";
}

// La bulle ne s'ouvre qu'à la demande du visiteur. Sur écran large, elle se
// loge alors dans la marge à droite de la colonne plutôt que sur le contenu.
// `marge` est la largeur libre (px) entre la colonne et le bord de la fenêtre ;
// le résultat est la largeur à donner à la bulle, ou null si elle n'y tient pas
// (elle prend alors sa largeur par défaut, par-dessus le contenu).
export const BULLE_MAX = 348;
export const BULLE_MIN = 300;
// 20 px jusqu'au bord de la fenêtre + 16 px d'air avant la colonne.
export const BULLE_DEGAGEMENT = 36;

export function largeurBulle(marge: number): number | null {
  const place = Math.floor(marge) - BULLE_DEGAGEMENT;
  return place >= BULLE_MIN ? Math.min(BULLE_MAX, place) : null;
}
