/**
 * Constantes et types du module « Les candidats sur les réseaux », partagés
 * entre le chargeur (serveur) et le composant client. AUCUN import serveur ici
 * (pas de node:fs) : le composant client importe ce fichier.
 */
import type { PartyKey } from "./parties";

export const PLATEFORMES = ["facebook", "instagram", "tiktok"] as const;
export type Plateforme = (typeof PLATEFORMES)[number];
export type FiltrePlateforme = "toutes" | Plateforme;
export const FILTRES: FiltrePlateforme[] = ["toutes", ...PLATEFORMES];

export const NOMS_PLATEFORMES: Record<Plateforme, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export type PartiInfo = { sigle: string; nom: string; couleur: string };
export type PresenceCell = { avecCompte: number; candidats: number; part: number };
export type AudienceItem = {
  nom: string;
  party: PartyKey;
  plateforme: Plateforme;
  estParti: boolean;
  abonnes: number;
};
export type Serie = { party: PartyKey; valeurs: number[] };
export type PalmaresItem = {
  jour: string;
  nom: string;
  party: PartyKey;
  plateforme: Plateforme;
  url: string | null;
  texte: string;
  jaime: number;
  commentaires: number;
};

export type SocialData = {
  lastUpdated: string;
  partis: PartyKey[];
  partiInfo: Record<PartyKey, PartiInfo>;
  presence: Record<PartyKey, Record<Plateforme, PresenceCell>>;
  audience: Record<FiltrePlateforme, AudienceItem[]>;
  jours: string[];
  publications: Record<FiltrePlateforme, Serie[]>;
  jaime: Record<FiltrePlateforme, Serie[]>;
  palmares: Record<FiltrePlateforme, PalmaresItem[]>;
  palmaresDu: string;
  palmaresAu: string;
};
