// UNE FABRIQUE, PLUSIEURS LÉGISLATURES. Ce qui change d'une législature à
// l'autre tient ici : l'édition imprimée au pied des cartes, les bornes de la
// frise du mandat, les rubans posés à la main et le dossier de ses sources
// (fonctions, carrière, scrutins, genre). La 43e reprend les valeurs écrites
// jusqu'ici dans fonctions.ts ; la 44e lit les sources tirées de la dimension
// des député·es (scripts/social/sources-cartes-dimension.ts).
import type { PartyKey } from "@/lib/data/partis-constantes";
import { AXE_DEBUT, AXE_FIN, CHEFS, EDITION_LEGISLATURE, PARTI_ACTUEL_PAR_SIEGE } from "./fonctions";
import type { Titre } from "./types";

export type ProfilLegislature = {
  numero: number;
  /** « 43e législature · 2022-2026 » : pied du recto et du verso. */
  edition: string;
  /** « 2022-2026 » : la ligne « Législature » du tableau du verso. */
  annees: string;
  /** Bornes de la frise du mandat : élection générale, puis dissolution ou
   *  date de référence des fonctions pour une législature en cours. */
  axe: { debut: string; fin: string };
  /** Rubans saisis à la main, par slug de circonscription. */
  chefs: Record<string, Titre>;
  /** Siège dont l'élu a changé de parti après l'élection. */
  partiActuelParSiege: Partial<Record<string, PartyKey>>;
  /** Dossier des sources des cartes, relatif à la racine du dépôt. */
  donnees: string;
};

export const PROFIL_43E: ProfilLegislature = {
  numero: 43,
  edition: EDITION_LEGISLATURE,
  annees: "2022-2026",
  axe: { debut: AXE_DEBUT, fin: AXE_FIN },
  chefs: CHEFS,
  partiActuelParSiege: PARTI_ACTUEL_PAR_SIEGE,
  donnees: "scripts/social/donnees",
};

export const PROFIL_44E: ProfilLegislature = {
  numero: 44,
  edition: "44e législature · depuis 2026",
  annees: "depuis 2026",
  // La fin de l'axe suit la date de référence des fonctions
  // (scripts/social/donnees/44e/fonctions-deputes.json) : la législature est
  // en cours, la frise s'arrête au dernier relevé.
  axe: { debut: "2026-10-05", fin: "2026-11-24" },
  // Le ruban du premier ministre vient de sa fonction (rubanChefParlementaire
  // ne pose que ceux des chefs de groupe) : il est saisi ici, comme pour la 43e.
  chefs: { "camille-laurin": { titre: "Premier ministre du Québec", eclat: true } },
  partiActuelParSiege: {},
  donnees: "scripts/social/donnees/44e",
};
