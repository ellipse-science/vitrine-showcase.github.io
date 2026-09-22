// La mascotte Datagotchi du coin inférieur droit : un seul personnage à la
// fois (deux auraient encombré la page), tiré au sort à chaque chargement
// pour que les deux projets soient vus. Logique pure ici (testable sans
// navigateur), affichage dans components/interactive/PromoDatagotchi.tsx.

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

// Le paramètre utm_source permet aux deux projets de reconnaître les visites
// venues de la Vitrine ; il ne change rien à ce que la page affiche.
export const PERSOS: Record<Perso, FichePerso> = {
  chien: {
    nom: "Défi Datagotchi",
    texte: "Croyez-vous que vous êtes prévisible? Viens tenter ta chance!",
    action: "Tenter ma chance",
    href: "https://quebec.datagotchi.com/?utm_source=vitrinedemocratique",
    image: "/datagotchi/chien.gif",
    imageFixe: "/datagotchi/chien.png",
    // 14 × 15 pixels d'origine, agrandis ×6 sans lissage.
    largeur: 84,
    hauteur: 90,
  },
  prof: {
    nom: "Prof. Datagotchi",
    texte:
      "As-tu des questions sur la campagne électorale? Viens discuter de l’élection avec moi!",
    action: "Discuter avec le prof",
    href: "https://prof-datagotchi.com/?utm_source=vitrinedemocratique",
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
