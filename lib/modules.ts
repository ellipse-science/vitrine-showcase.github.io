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
// ⚠️ PALETTE SÉPIA RETENUE (Jules Piral, 2026-09-16, intégration des PR #812 et
// #813) : les couleurs sont celles de l'humeur « Sépia » du banc d'essai
// (components/lab/PaletteScrollLab.tsx) — un PAPIER propre à chaque module, qui
// fonce d'un module à l'autre, et un accent par famille (médias #86642C, pont
// #7A4E33, décideurs #5E1A25). Elles remplacent les nuances par module proposées
// le 16-09 et le papier teinté à 6 % (`teintePapier`). Conséquence assumée :
// Deux solitudes perd le rouge du Canada comme couleur de module (le rouge reste
// celui du Canada À L'INTÉRIEUR du module), et deux modules d'une même famille
// partagent leur accent — c'est le papier qui les distingue.
//
// ⚠️ PALETTE « SÉPIA · TERRES » RETENUE (Jules Piral, 2026-09-17, après comparaison
// de 15 pistes : https://claude.ai/artifact/Wk2Ta2v3L3gxusxmRdWfgh). Les papiers
// sépia restent ; chaque module a SON encre, sourde et lisible sur son papier
// (contraste ≥ 3,9) : laiton, bordeaux, mauve, orange brûlé, sauge, bleu Salon.
// Deux choix de Jules : les Partis en orange, l'Assemblée en BLEU, comme le Salon
// bleu. ⚠️ L'orange des Partis reste voisin de l'orange de QS, et le bleu de
// l'Assemblée des bleus du PQ et de la CAQ : à surveiller là où les partis sont
// en couleur à côté du titre.
//
// CE FICHIER EST AUSSI LA SOURCE DU SITE : le banc d'essai
// (`components/lab/PaletteScrollLab.tsx`, mode « Sépia · Terres ») lit `papier`
// et `accent` ici, par identifiant de section.
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
  /** Le papier du module (fond des reels), palette « Sépia ». */
  papier: string;
  /** Les trois lignes de l'accroche du reel, de la première à la troisième.
   *  `c` force une couleur (le Québec en bleu, le Canada en rouge) ; sans `c`,
   *  la ligne est à l'encre, et `accent: true` prend la couleur du module. */
  lignes: { t: string; accent?: boolean; c?: string }[];
};

export const MODULES = {
  "une-des-unes": {
    nom: "La Une des Unes",
    famille: "médias",
    // Laiton : la couleur des paliers de saillance du module.
    accent: "#80602A",
    papier: "#F3ECDD",
    lignes: [{ t: "Les faits saillants", accent: true }, { t: "au Québec" }, { t: "en ce moment" }],
  },
  "deux-solitudes": {
    nom: "Deux solitudes",
    famille: "médias",
    // Bordeaux : le rouge du Canada, assourdi. Le rouge vif et le bleu restent les
    // couleurs des RÉGIONS à l'intérieur du module.
    accent: "#8F3036",
    papier: "#EDE1CB",
    lignes: [
      { t: "Québec", c: "#2E4663" },
      { t: "Canada", c: "#A8302C" },
      { t: "2 solitudes?" },
    ],
  },
  "enjeux-saillants": {
    nom: "Les 12 enjeux",
    famille: "médias",
    // Mauve. Les douze couleurs d'enjeu restent celles des enjeux.
    accent: "#6A4872",
    papier: "#E6D6B8",
    lignes: [{ t: "Les 12 enjeux", accent: true }, { t: "de la campagne" }, { t: "jour après jour" }],
  },
  "partis-et-couverture": {
    nom: "Partis et couverture",
    famille: "pont",
    // Orange brûlé (Jules, 17-09). Voisin de l'orange de QS : à surveiller.
    accent: "#8E4413",
    papier: "#E2D0B1",
    lignes: [{ t: "De quel parti", accent: true }, { t: "parle-t-on" }, { t: "dans les médias?" }],
  },
  "polimetre-plus": {
    nom: "Polimètre+",
    famille: "décideurs",
    // Sauge : le vert du Polimètre (polimetre.org), assourdi.
    accent: "#4B6E50",
    papier: "#E5D1C3",
    lignes: [{ t: "Les promesses", accent: true }, { t: "tenues, brisées" }, { t: "et oubliées" }],
  },
  "assemblee-nationale": {
    nom: "L’alignement de l’Assemblée",
    famille: "décideurs",
    // Bleu Salon (Jules, 17-09) : le bleu du Salon bleu, loin du bleu de la CAQ.
    accent: "#2F4A8A",
    papier: "#DCC3B4",
    lignes: [{ t: "Qui parle", accent: true }, { t: "au Salon bleu", c: "#2E4663" }, { t: "et de quoi?" }],
  },
} as const satisfies Record<string, IdentiteModule>;

export type CleModule = keyof typeof MODULES;

export const identiteModule = (cle: CleModule): IdentiteModule => MODULES[cle];
