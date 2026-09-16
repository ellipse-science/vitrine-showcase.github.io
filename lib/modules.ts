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
// ⚠️ La règle d'Adrien du 3 sept. tient toujours : **la Une des Unes garde le
// papier tel quel** en ligne. L'accent ci-dessous colore les filets, les titres
// d'accroche et les bandeaux — pas le fond de la Une.

export type FamilleModule = "médias" | "pont" | "décideurs";

export type IdentiteModule = {
  /** Nom du module, tel qu'affiché. */
  nom: string;
  famille: FamilleModule;
  /** La couleur du module : filets, accents, bandeau de fin du reel. */
  accent: string;
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
    lignes: [{ t: "Les faits saillants", accent: true }, { t: "au Québec" }, { t: "en ce moment" }],
  },
  "deux-solitudes": {
    nom: "Deux solitudes",
    famille: "médias",
    // Bleu acier : la famille médias, mais du côté froid — et volontairement
    // PAS le `--bleu` du Québec ni le `--red` du Canada, qui servent déjà à
    // désigner les deux régions à l'intérieur du module.
    accent: "#2F6480",
    lignes: [
      { t: "Québec", c: "#2E4663" },
      { t: "Canada", c: "#A8302C" },
      { t: "2 solitudes ?", accent: true },
    ],
  },
  "enjeux-saillants": {
    nom: "Les 12 enjeux",
    famille: "médias",
    // Encre adoucie (`--ink-soft`) : le module porte DÉJÀ douze couleurs. Lui en
    // donner une treizième les concurrencerait ; il prend donc l'encre.
    accent: "#433F38",
    lignes: [{ t: "Les 12 enjeux", accent: true }, { t: "de la campagne" }, { t: "jour après jour" }],
  },
  "partis-et-couverture": {
    nom: "Partis et couverture",
    famille: "pont",
    // Brun chaud : l'accent « pont » du banc d'essai, entre médias et décideurs
    // — ce module est exactement ce pont.
    accent: "#8A5A3A",
    lignes: [{ t: "De quel parti", accent: true }, { t: "parle-t-on" }, { t: "dans les médias ?" }],
  },
  "polimetre-plus": {
    nom: "Polimètre+",
    famille: "décideurs",
    // Cordovan (`--cordovan`) : la couleur du Polimètre et des décideurs.
    accent: "#6B1E2A",
    lignes: [{ t: "Les promesses", accent: true }, { t: "tenues, brisées" }, { t: "et oubliées" }],
  },
  "assemblee-nationale": {
    nom: "L’alignement de l’Assemblée",
    famille: "décideurs",
    // Rose profond : le cordovan éclairci vers le rose, seconde nuance de la
    // famille décideurs, distincte du Polimètre+ au premier coup d'œil.
    accent: "#7A3B57",
    lignes: [{ t: "Qui parle", accent: true }, { t: "au Salon bleu", c: "#2E4663" }, { t: "et de quoi ?" }],
  },
} as const satisfies Record<string, IdentiteModule>;

export type CleModule = keyof typeof MODULES;

export const identiteModule = (cle: CleModule): IdentiteModule => MODULES[cle];
