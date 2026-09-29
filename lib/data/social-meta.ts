/**
 * Constantes et types du module « Les candidats sur les réseaux », partagés
 * entre le chargeur (serveur) et le composant client. AUCUN import serveur ici
 * (pas de node:fs) : le composant client importe ce fichier.
 */
import type { PartyKey } from "./parties";

export const PLATEFORMES = ["facebook", "instagram", "tiktok"] as const;
export type Plateforme = (typeof PLATEFORMES)[number];

export const NOMS_PLATEFORMES: Record<Plateforme, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** Couleurs des plateformes : jetons du site (--bleu, --brass, --ink-soft). */
export const COULEURS_PLATEFORMES: Record<Plateforme, string> = {
  facebook: "#2E4663",
  instagram: "#A07A3D",
  tiktok: "#433F38",
};

export const TYPES = ["candidat", "parti"] as const;
export type TypeCompte = (typeof TYPES)[number];
export const NOMS_TYPES: Record<TypeCompte, string> = {
  candidat: "Candidats",
  parti: "Partis",
};

export type PartiInfo = { sigle: string; nom: string; couleur: string };
export type PresenceCell = { avecCompte: number; candidats: number; part: number };
export type AudienceItem = {
  nom: string;
  party: PartyKey;
  plateforme: Plateforme;
  type: TypeCompte;
  abonnes: number;
};
export type PalmaresItem = {
  jour: string;
  nom: string;
  party: PartyKey;
  plateforme: Plateforme;
  type: TypeCompte;
  url: string | null;
  texte: string;
  jaime: number;
  commentaires: number;
};

/**
 * Une ligne du cube, par indices pour rester léger : [jour (index dans
 * `jours`), parti (index dans `partis`), plateforme (index dans PLATEFORMES),
 * type (index dans TYPES), publications, j'aime, commentaires]. Additif : toute
 * période et tout filtre se recalculent par somme.
 */
export type CubeRow = [number, number, number, number, number, number, number];

export type SocialData = {
  lastUpdated: string;
  partis: PartyKey[];
  partiInfo: Record<PartyKey, PartiInfo>;
  presence: Record<PartyKey, Record<Plateforme, PresenceCell>>;
  /** Tous les comptes avec un nombre d'abonnés, du plus suivi au moins suivi. */
  audience: AudienceItem[];
  /** Jours complets, du 1er avril au dernier jour complet de relevé. */
  jours: string[];
  /** Index dans `jours` du déclenchement des élections (0 s'il précède l'axe). */
  campagne: number;
  cube: CubeRow[];
  /** Top 10 par jour et plateforme des 60 derniers jours (raffineur). */
  palmares: PalmaresItem[];
};
