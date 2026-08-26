// Jetons de couleur du thème clair (app/globals.css) en valeurs littérales —
// partagés entre les générateurs d'image de partage (opengraph-image.tsx,
// story/route.tsx). Satori ne comprend pas var(), donc ni l'un ni l'autre ne
// peut lire app/globals.css directement ; on centralise ici plutôt que de
// dupliquer les hex dans chaque fichier (design_language.md §1).
export const PAPER = "#F3ECDD";
export const PAPER_DEEP = "#ECE3CF";
export const INK = "#1C1917";
export const CORDOVAN = "#6B1E2A";
export const RULE = "#C8BDA6";
export const GREEN = "#3D6B3A";
