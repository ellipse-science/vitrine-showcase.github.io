import fs from "node:fs/promises";
import path from "node:path";

import type { ShareModuleSlug } from "@/lib/shareModules";

// Photos de fond des cartes de partage — droits achetés (Bob Gratton / La
// Petite Vie), une par module. `objectPosition` cadre sur le sujet le plus
// reconnaissable de chaque photo plutôt que le centre géométrique. La story
// (9:16, très haute) et la carte OG (1200×630, très large) ne rognent pas le
// même axe de la photo source — `objectPositionOg` permet un cadrage distinct
// quand le partagé horizontal a besoin d'un point de focus différent ;
// absent, il retombe sur `objectPosition`.
export type ShareBackgroundImage = {
  file: string;
  objectPosition: string;
  objectPositionOg?: string;
};

const GRATTON_BACKGROUNDS: Partial<Record<ShareModuleSlug, ShareBackgroundImage>> = {
  "partis-et-couverture": { file: "gratton-partis.jpg", objectPosition: "30% 35%" },
  "polimetre-plus": { file: "gratton-polimetre.jpg", objectPosition: "78% center" },
  "deux-solitudes": { file: "gratton-deux-solitudes.jpg", objectPosition: "48% 30%" },
  "une-des-unes": { file: "gratton-une-des-unes.jpg", objectPosition: "45% center", objectPositionOg: "45% 25%" },
  "enjeux-saillants": { file: "gratton-enjeux-saillants.jpg", objectPosition: "50% 12%", objectPositionOg: "50% 15%" },
  "assemblee-nationale": { file: "gratton-assemblee-nationale.jpg", objectPosition: "38% center", objectPositionOg: "38% 25%" },
};

// RETIRÉ DE PROD, gardé sur dev (décision du 2026-08-20, avant l'envoi aux
// médias) : les fonds Gratton quittent les cartes publiques — la
// fonctionnalité de partage, elle, reste partout. Table vide en prod : les
// deux consommateurs (carte OG, story) retombent d'eux-mêmes sur leur fond
// couleur d'accent, chemin déjà conçu pour un slug sans photo. Même signal
// d'environnement que app/robots.ts.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export const SHARE_BACKGROUND_IMAGES: Partial<Record<ShareModuleSlug, ShareBackgroundImage>> =
  isProd ? {} : GRATTON_BACKGROUNDS;

export async function loadShareBackgroundDataUri(slug: ShareModuleSlug): Promise<string | null> {
  const bg = SHARE_BACKGROUND_IMAGES[slug];
  if (!bg) return null;
  const imgPath = path.resolve(process.cwd(), "public", "images", "share", bg.file);
  const buf = await fs.readFile(imgPath);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
