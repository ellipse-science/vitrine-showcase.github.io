// OUTILS DE DESSIN partagés entre les cartes de député (impression et site)
// et les reels. Rien ici ne touche au système de fichiers ni à React : ce
// module doit pouvoir s'exécuter dans le navigateur, tel quel.
//
// Origine : scripts/social/lib/reel.ts, qui ré-exporte ces symboles pour que
// les reels ne changent pas d'une ligne.

/** La palette du carton : papier, encre et leurs intermédiaires. */
export const COLORS = {
  paper: "#F3ECDD",
  deep: "#ECE3CF",
  ink: "#1C1917",
  soft: "#433F38",
  softer: "#6E685F",
  rule: "#C8BDA6",
  blue: "#224F7D",
  red: "#A8302C",
};

/** Encres du ton : favorable, défavorable, neutre. */
export const TONE = { positive: "#4E7A43", negative: "#B0473A", neutral: "#6E685F" } as const;

/** Fleur de lys du site (même tracé que lib/shareCardTemplate.tsx). */
export const FLEUR_PATH =
  "M297.69,147.804c-47.642-5.459-97.763,27.791-107.192,94.289c-0.329,2.318-0.605,4.685-0.824,7.076h-2.81c4.056-45.102,22.727-76.399,33.905-97.214c14.49-26.98,2.729-53.559-2.997-65.452C211.276,73.013,181.848,18.486,174.354,0c-7.494,18.486-36.702,73.013-43.198,86.503c-5.728,11.893-17.488,38.472-2.998,65.452c11.103,20.673,29.87,52.316,34.226,97.214h-3.208c-0.219-2.392-0.495-4.758-0.824-7.076c-9.43-66.499-59.551-99.748-107.192-94.289c-53.284,6.105-81.882,90.319,0.496,110.666c-13.399-24.813,7.443-69.477,55.583-44.167c15.656,8.232,26.561,21.383,31.072,34.866h-8.065c-7.608,0-13.776,4.469-13.776,9.983c0,5.514,6.168,9.983,13.776,9.983h9.817c-0.803,4.348-2.456,8.464-5.034,12.162c-11.416,16.377-49.649,7.444-28.31-28.286c-36.065-4.747-45.649,29.279-35.228,47.641c11.453,23.411,61.479,30.428,80.41-2.978c4.54-8.012,6.819-18.047,7.555-28.539h3.864c-0.033,7.932-0.53,16.224-1.59,24.887c-12.647,8.146-7.717,25.725-23.735,36.234c10.062,0.265,18.271-1.708,20.92-5.415c0,10.75,9.617,19.812,15.886,32.858c5.824-13.119,15.208-24.094,15.208-32.858c2.648,3.707,10.857,5.68,20.92,5.415c-14.687-9.01-8.898-25.516-23.261-37.306c-1.015-8.293-1.508-16.22-1.589-23.815h3.312c0.735,10.492,3.016,20.527,7.555,28.539c18.931,33.405,68.957,26.389,80.41,2.978c10.422-18.361,0.838-52.388-35.228-47.641c21.34,35.73-16.894,44.663-28.31,28.286c-2.577-3.698-4.23-7.814-5.033-12.162h10.572c7.608,0,13.776-4.47,13.776-9.983c0-5.515-6.168-9.983-13.776-9.983h-8.821c4.512-13.483,15.416-26.634,31.072-34.866c48.14-25.31,68.982,19.354,55.583,44.167C379.573,238.124,350.974,153.91,297.69,147.804z";

export function fleur(color: string, size: number): string {
  return `<svg viewBox="-0.864 -0.333 350 359" width="${size}" height="${Math.round(size * 1.03)}"><path fill="${color}" d="${FLEUR_PATH}"/></svg>`;
}

/** Échappement HTML : les titres et résumés viennent des données. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Typographie OQLF (AGENTS.md règle #7) sur un texte déjà échappé :
 *  insécable avant « : » et « % », pas d'espace avant « ; ? ! ». */
export function typo(s: string): string {
  return s
    .replace(/\s*:(?=\s|$)/g, "&nbsp;:")
    .replace(/\s*%/g, "&nbsp;%")
    .replace(/\s+([;?!])/g, "$1");
}

/** Texte issu des données, prêt à insérer dans le gabarit. */
export function txt(s: string): string {
  return typo(esc(s));
}

/** Pictogramme d'un enjeu, en SVG. Le dessin lui-même vit dans le composant
 *  du site (SymboleEnjeu) ; chaque environnement fournit sa façon de le rendre
 *  en chaîne : react-dom/server pour le générateur, le gabarit du composant
 *  côté navigateur. */
export type Glyphe = (cle: string | null | undefined, color: string, size: number) => string;
