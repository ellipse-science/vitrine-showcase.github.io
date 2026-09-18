// La mascotte Datagotchi du coin inférieur droit : un personnage par visiteur,
// tiré au sort à la première visite puis gardé — deux personnages à la fois
// auraient encombré la page. Logique pure ici (testable sans navigateur),
// affichage dans components/interactive/PromoDatagotchi.tsx.

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

export const CLE_PERSO = "vitrine:datagotchi:perso";
export const CLE_FERME = "vitrine:datagotchi:ferme";

export function estPerso(valeur: unknown): valeur is Perso {
  return valeur === "chien" || valeur === "prof";
}

// `memorise` vient du localStorage : toute valeur inconnue (clé d'une ancienne
// version, stockage trafiqué) retombe sur un nouveau tirage.
export function choisirPerso(memorise: unknown, hasard: number): Perso {
  if (estPerso(memorise)) return memorise;
  return hasard < 0.5 ? "chien" : "prof";
}
