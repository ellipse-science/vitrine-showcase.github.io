// IDENTITÉ DES SIX MODULES — un module, une couleur.
//
// Demande de Yannick Dufresne (2-3 sept. 2026), reprise par Adrien le 16-09 :
// « il FAUT que chaque module ait une couleur particulière, que l'on retrouverait
// autant dans les reels qu'en ligne, qui nous rappelle tout de suite le module ».
//
// CE FICHIER EST LA SOURCE UNIQUE. Les reels (`scripts/social`) et le site lisent
// la même table : une couleur changée ici change la vidéo ET la page, jamais l'une
// sans l'autre.
//
// POURQUOI CES COULEURS-LÀ, ET PAS D'AUTRES (règle d'Adrien : « la palette doit
// être RÉFLÉCHIE, pas aléatoire ») :
//
//  1. Elles suivent les TROIS FAMILLES de données déjà retenues au banc d'essai
//     `components/lab/PaletteScrollLab.tsx` (vitrine#715), reprises du Projet
//     Quorum : médias (laiton), pont (brun chaud), décideurs (rose/cordovan).
//     Ce qui change ici : le banc donnait UNE couleur par famille, donc deux
//     modules partageaient la même — impossible de reconnaître un module à sa
//     couleur. Chaque module reçoit sa nuance DANS sa famille.
//  2. Chaque teinte est un jeton existant (`app/globals.css`) ou sa variante
//     lisible en texte sur le papier.
//  3. AUCUNE ne reprend une des douze couleurs d'enjeu (`lib/enjeux.ts`) : dans
//     les 12 enjeux comme dans la Une, la couleur d'un enjeu doit rester la
//     couleur de cet enjeu, jamais celle d'un module.
//
// ⚠️ UNE EXCEPTION ASSUMÉE, tranchée par Adrien le 2026-09-16 : Deux solitudes
// prend le ROUGE DU CANADA plutôt qu'une nuance de sa famille. C'est le seul
// module qui mobilise le Canada — la mémorisation l'emporte ici sur la famille.
//
// Le fond des reels est ce même accent, mêlé au papier à 6 % (`teintePapier`) :
// « très discret », demande d'Adrien du 16-09.
//
// ⚠️ La règle d'Adrien du 3 sept. tient toujours : **la Une des Unes garde le
// papier tel quel** en ligne. L'accent ci-dessous colore les filets, les titres
// d'accroche et les bandeaux — pas le fond de la Une.

export type FamilleModule = "médias" | "pont" | "décideurs";

/** L'intention musicale d'un module : de quoi fabriquer son lit sonore.
 *  `racine` = demi-tons depuis le La 440 ; `bpm` donne la vitesse du vibrato.
 *  Le détail de la fabrication est dans `scripts/social/lib/musique.ts`. */
export type IntentionMusicale = {
  racine: number;
  accord: "min" | "maj";
  bpm: number;
  /** Ce que la musique doit faire ressentir — en une phrase, pour qu'on puisse
   *  la remplacer un jour par une vraie trame sans perdre l'intention. */
  intention: string;
};

export type IdentiteModule = {
  /** Nom du module, tel qu'affiché. */
  nom: string;
  famille: FamilleModule;
  /** La couleur du module : filets, accents, bandeau de fin du reel. */
  accent: string;
  /** Le lit sonore du module (voir `scripts/social/lib/musique.ts`). */
  musique: IntentionMusicale;
  /** Les trois lignes de l'accroche du reel, de la première à la troisième.
   *  `c` force une couleur (le Québec en bleu, le Canada en rouge) ; sans `c`,
   *  la ligne est à l'encre, et `accent: true` prend la couleur du module. */
  lignes: { t: string; accent?: boolean; c?: string }[];
};

export const MODULES = {
  "une-des-unes": {
    nom: "La Une des Unes",
    famille: "médias",
    // Laiton encre (`--amber-encre`) : la couleur des paliers de saillance,
    // déjà celle de ce module partout dans le site.
    accent: "#86642C",
    musique: { racine: -7, accord: "min", bpm: 60, intention: "ce qui domine l’actualité : grave, posé, un peu solennel" },
    lignes: [{ t: "Les faits saillants", accent: true }, { t: "au Québec" }, { t: "en ce moment" }],
  },
  "deux-solitudes": {
    nom: "Deux solitudes",
    famille: "médias",
    // Le ROUGE DU CANADA (`--red`), tranché par Adrien le 2026-09-16 : c'est le
    // seul module qui mobilise le Canada, donc la couleur se retient toute
    // seule. Le bleu du Québec reste réservé au Québec À L'INTÉRIEUR du module
    // (polygone, barres, points) : le module a le rouge, la région a le bleu.
    accent: "#A8302C",
    musique: { racine: -5, accord: "min", bpm: 66, intention: "deux agendas qui ne se croisent pas : tendu, en suspens" },
    lignes: [
      { t: "Québec", c: "#2E4663" },
      { t: "Canada", accent: true },
      { t: "2 solitudes?" },
    ],
  },
  "enjeux-saillants": {
    nom: "Les 12 enjeux",
    famille: "médias",
    // Encre adoucie (`--ink-soft`) : le module porte DÉJÀ douze couleurs. Lui en
    // donner une treizième les concurrencerait ; il prend donc l'encre.
    accent: "#433F38",
    musique: { racine: -10, accord: "maj", bpm: 72, intention: "le partage de l’attention : clair, régulier, sans drame" },
    lignes: [{ t: "Les 12 enjeux", accent: true }, { t: "de la campagne" }, { t: "jour après jour" }],
  },
  "partis-et-couverture": {
    nom: "Partis et couverture",
    famille: "pont",
    // Brun chaud : l'accent « pont » du banc d'essai, entre médias et décideurs
    // — ce module est exactement ce pont.
    accent: "#8A5A3A",
    musique: { racine: -3, accord: "min", bpm: 76, intention: "la course : plus vif, légèrement nerveux" },
    lignes: [{ t: "De quel parti", accent: true }, { t: "parle-t-on" }, { t: "dans les médias?" }],
  },
  "polimetre-plus": {
    nom: "Polimètre+",
    famille: "décideurs",
    // Cordovan (`--cordovan`) : la couleur du Polimètre et des décideurs.
    accent: "#6B1E2A",
    musique: { racine: -12, accord: "min", bpm: 56, intention: "les promesses et le temps qui passe : lent, ample" },
    lignes: [{ t: "Les promesses", accent: true }, { t: "tenues, brisées" }, { t: "et oubliées" }],
  },
  "assemblee-nationale": {
    nom: "L’alignement de l’Assemblée",
    famille: "décideurs",
    // Rose profond : le cordovan éclairci vers le rose, seconde nuance de la
    // famille décideurs, distincte du Polimètre+ au premier coup d'œil.
    accent: "#7A3B57",
    musique: { racine: -8, accord: "maj", bpm: 64, intention: "la parole publique : sobre, institutionnel" },
    lignes: [{ t: "Qui parle", accent: true }, { t: "au Salon bleu", c: "#2E4663" }, { t: "et de quoi?" }],
  },
} as const satisfies Record<string, IdentiteModule>;

/** Le reel de PRÉSENTATION (le tour des six modules, travaillé par Jules) :
 *  il n'appartient à aucun module, mais il lui faut sa musique. */
export const MUSIQUE_PRESENTATION: IntentionMusicale = {
  racine: -9, accord: "maj", bpm: 68,
  intention: "présenter la Vitrine : ouvert, accueillant, confiant",
};

export type CleModule = keyof typeof MODULES;

export const identiteModule = (cle: CleModule): IdentiteModule => MODULES[cle];
