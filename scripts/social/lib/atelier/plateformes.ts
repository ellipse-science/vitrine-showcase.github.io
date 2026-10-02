// CE QUE CHAQUE PLATEFORME IMPOSE — les chiffres, et d'où ils viennent.
//
// L'atelier superpose ces zones sur le reel pour qu'on VOIE ce que l'interface
// de chaque application couvre. Un chiffre qui n'a pas été mesuré chez nous est
// marqué `aMesurer` : il s'affiche en pointillé et l'atelier le dit. On ne
// maquille pas une estimation en mesure — c'est la même règle que partout
// ailleurs dans ce dépôt.
//
// Les zones sont en pixels du reel (1080 × 1920), depuis le HAUT et le BAS.

/** Les plateformes où l'on publie. Propre à l'atelier : il doit pouvoir en
 *  décrire une avant même que le reste du dépôt la connaisse. */
export type PlateformeCle = "instagram" | "tiktok" | "facebook" | "linkedin" | "x" | "bluesky";

/** ⚠️ LES ZONES NE SONT PAS DÉCRITES ICI. Elles viennent de `FORMATS`
 *  (scripts/social/lib/reel.ts), la table que le RENDU et le CONTRÔLE utilisent.
 *
 *  🪤 Elles l'ont été, un après-midi, et ça s'est vu : j'avais recopié dans ce
 *  fichier les marges des guides publics (haut 220, côtés 60/120) — celles-là
 *  mêmes que Jules avait mesurées fausses au simulateur d'iPhone et remplacées
 *  par 150/110 dans reel.ts. Le calque rouge de l'atelier montrait donc une
 *  zone que le gabarit ne vérifiait pas : la barre de marque paraissait sous
 *  l'interface alors qu'elle est au-dessus (Adrien, 2026-09-22). Une donnée
 *  dupliquée est une donnée qui diverge ; celle-ci se lit à un seul endroit. */

export type Plateforme = {
  cle: PlateformeCle;
  nom: string;
  /** Le rendu à utiliser : une mise en page par plateforme (`--format`). */
  rendu: PlateformeCle;
  /** Le média publié et ses dimensions. */
  media: { quoi: string; dim: string; ratio: string };
  /** Limite du texte, telle que la plateforme la compte. */
  texte: string;
  /** Un lien est-il cliquable dans la légende, et à quel prix. */
  lien: string;
  /** Comment on identifie un compte ici. */
  tags: string;
  qui: string;
};

export const PLATEFORMES: Plateforme[] = [
  {
    cle: "instagram", nom: "Instagram", rendu: "instagram",
    media: { quoi: "Reel", dim: "1080 × 1920", ratio: "9/16" },
    texte: "2 200 caractères", lien: "aucun lien cliquable",
    tags: "@identifiant exact — personne ne les a recensés, ne pas en inventer", qui: "Jules",
  },
  {
    cle: "tiktok", nom: "TikTok", rendu: "tiktok",
    media: { quoi: "Vidéo", dim: "1080 × 1920", ratio: "9/16" },
    texte: "2 200 caractères", lien: "aucun lien cliquable",
    tags: "@identifiant exact", qui: "Jules",
  },
  {
    cle: "facebook", nom: "Facebook", rendu: "facebook",
    media: { quoi: "Reel, ou affiche verticale en post", dim: "1080 × 1920", ratio: "9/16" },
    texte: "pas de limite dure", lien: "cliquable",
    tags: "au nom, choisi dans l'autocomplétion", qui: "Jules",
  },
  {
    cle: "linkedin", nom: "LinkedIn", rendu: "linkedin",
    media: { quoi: "Vidéo verticale, ou affiche", dim: "1080 × 1920", ratio: "9/16" },
    texte: "pas de limite dure ; 2 lignes avant « voir plus »", lien: "cliquable",
    tags: "au nom, choisi dans l'autocomplétion", qui: "Adrien",
  },
  {
    cle: "x", nom: "X", rendu: "x",
    media: { quoi: "Vidéo ou image", dim: "1080 × 1920", ratio: "9/16" },
    texte: "280 caractères par message", lien: "cliquable · 0,20 $US le post avec lien",
    tags: "@identifiant exact", qui: "Adrien",
  },
  {
    cle: "bluesky", nom: "Bluesky", rendu: "bluesky",
    media: { quoi: "Image", dim: "1080 × 1920", ratio: "9/16" },
    texte: "300 graphèmes par message", lien: "cliquable",
    tags: "@handle.bsky.social", qui: "Adrien",
  },
];

export const plateforme = (cle: string) => PLATEFORMES.find((p) => p.cle === cle);
