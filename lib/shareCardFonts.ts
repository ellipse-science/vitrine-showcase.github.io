import fs from "node:fs/promises";
import path from "node:path";

// POLICES DES CARTES DE PARTAGE. Satori ne sait pas lire `app/globals.css` ni
// suivre le <link> Google Fonts d'`app/layout.tsx` : sans fichier de police
// fourni explicitement, il retombe sur sa police par défaut, et les cartes
// sortaient en Georgia — hors du langage visuel du site (design_language.md
// §2). On embarque donc les binaires dans le dépôt (`assets/fonts/`, hors
// `public/` : ils servent au BUILD, le navigateur ne doit jamais les
// télécharger).
//
// POURQUOI DES FICHIERS VERSIONNÉS PLUTÔT QU'UN FETCH. Résoudre la police
// depuis fonts.googleapis.com au moment de générer l'image ajoute un
// aller-retour réseau à chaque carte, dans un build statique qui en produit
// des centaines : un échec réseau en CI casserait le build entier. Les trois
// familles sont sous licence OFL 1.1 (`assets/fonts/LICENSE-OFL.txt`), donc
// redistribuables avec le dépôt.
//
// Satori accepte TTF, OTF et WOFF, mais PAS WOFF2 : ne pas « optimiser » ces
// fichiers vers du woff2, la génération échouerait.

const FONT_DIR = path.resolve(process.cwd(), "assets", "fonts");

// Les trois rôles de design_language.md §2, et rien d'autre : Playfair Display
// pour l'affichage (titres, grands chiffres), Source Serif 4 pour le texte lu,
// IBM Plex Mono pour les étiquettes en capitales espacées.
const FONT_FILES = [
  { file: "PlayfairDisplay-Black.ttf", name: "Playfair Display", weight: 900 as const, style: "normal" as const },
  { file: "SourceSerif4-Regular.ttf", name: "Source Serif 4", weight: 400 as const, style: "normal" as const },
  { file: "SourceSerif4-Italic.ttf", name: "Source Serif 4", weight: 400 as const, style: "italic" as const },
  { file: "IBMPlexMono-Medium.ttf", name: "IBM Plex Mono", weight: 500 as const, style: "normal" as const },
];

export type ShareFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 900;
  style: "normal" | "italic";
};

let cached: Promise<ShareFont[]> | null = null;

// Mémoïsé au niveau du module : le build génère une carte par (module ×
// édition), et relire 630 Ko de polices à chaque image serait la dépense
// dominante de la génération.
export function loadShareFonts(): Promise<ShareFont[]> {
  cached ??= Promise.all(
    FONT_FILES.map(async ({ file, name, weight, style }) => {
      const buf = await fs.readFile(path.join(FONT_DIR, file));
      return {
        name,
        // Satori veut un ArrayBuffer : `buf.buffer` d'un Buffer Node peut être
        // un pool partagé plus grand que la police elle-même, d'où la découpe.
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight,
        style,
      };
    }),
  );
  return cached;
}
