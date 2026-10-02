// LES CINQ FORMATS — un fichier par réseau, à chaque édition.
//
// Décision d'Adrien (2026-09-16) : « tu dois toujours finir par produire TOUS
// les formats pour nos différents réseaux ». On publie à la main, mais les
// textes, eux, sortent tout seuls.
//
// Ce fichier ne fait que deux choses : tenir le registre des cinq réseaux et
// appliquer la typographie OQLF à leur sortie. Il ne décide RIEN du contenu
// d'un réseau — chaque réseau décide pour lui, dans son propre fichier.
//
//   linkedin.ts   → Adrien
//   x.ts          → Adrien
//   facebook.ts   → Jules
//   instagram.ts  → Jules
//   tiktok.ts     → Jules
//
// Voir `README.md`, dans ce dossier, pour la règle d'étanchéité.

import { oqlf } from "../lib/identite";
import facebook from "./facebook";
import instagram from "./instagram";
import linkedin from "./linkedin";
import tiktok from "./tiktok";
import x from "./x";
import type { Format, Matiere, Reseau } from "./types";

export type { Matiere, Reseau } from "./types";

/** Le registre. Ajouter un réseau = ajouter son fichier et une ligne ici. */
const RESEAUX: Record<Reseau, Format> = { linkedin, x, facebook, instagram, tiktok };

/** Qui publie sur quoi — déclaré par chaque réseau, rassemblé ici. */
export const RESPONSABLE: Record<Reseau, string> = Object.fromEntries(
  Object.entries(RESEAUX).map(([r, f]) => [r, f.responsable]),
) as Record<Reseau, string>;

/** Les cinq textes d'une édition, prêts à copier. */
export function formats(m: Matiere): Record<Reseau, string> {
  return Object.fromEntries(
    Object.entries(RESEAUX).map(([r, f]) => [r, oqlf(f.post(m))]),
  ) as Record<Reseau, string>;
}
