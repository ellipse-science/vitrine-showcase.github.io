// TYPES DES CARTES DE DÉPUTÉ — partagés par le générateur imprimé
// (scripts/social/cartes-deputes.ts) et le site. Les choix méthodologiques
// sont documentés dans docs/reference/cartes-deputes.md.
import type { DeputyRow, PeriodKey } from "@/lib/data/assemblee";
import type { PartyKey } from "@/lib/data/parties";

/** RARETÉ (grille arrêtée avec Jules, 23-09). Légendaire : les premiers
 *  ministres de la législature, hors calcul. Tous les autres, chefs compris,
 *  sont classés sur les MOTS PRONONCÉS au Salon bleu sur la législature (la
 *  saillance de l'élu, durée du mandat comprise) : 10 % rares, 35 % peu
 *  communes, le reste communes.
 *  · Mots plutôt qu'interventions : les vice-présidents cumulent des milliers
 *    d'interventions de procédure (26 à 42 mots chacune), qui les mettaient
 *    en tête du classement.
 *  · La présidente est commune d'office (le sceau essayé le 23-09 a été retiré) : dans les
 *    transcriptions, ce qu'elle dit en présidant est attribué à « la
 *    Présidente », pas à elle (6 interventions sur la législature).
 *  Grille précédente (22-09, abandonnée) : poids des fonctions rémunérées et
 *  des duels de porte-parole, classé par camp. */
export type Rarete = "commune" | "peu-commune" | "rare" | "legendaire";

export type Titre = { titre: string; eclat?: boolean };

/** Fonctions et indemnités à la dissolution, produites par
 *  scripts/social/fonctions-deputes.ts à partir des fiches de l'Assemblée. */
export type FicheFonctions = {
  assnat_id: string;
  nom: string;
  circonscription: string | null;
  nom_famille: string | null;
  prenom: string | null;
  indemnite_totale?: number;
  total_legislature: number | null;
  moyenne_annuelle: number | null;
  fonctions_legislature?: { titre: string; pct: number; debut: string; fin: string }[];
  vis_a_vis_legislature?: { assnat_id: string; nom: string; jours: number; dossiers: string[] }[];
  porte_parole_legislature?: { titre: string }[];
  debut_mandat?: string | null;
  fin_mandat?: string;
  porte_parole: string[];
  vis_a_vis?: { assnat_id: string; nom: string; dossiers: string[] }[];
};

export type Scrutin = { date: string; circonscription: string; nom_famille: string; pourcentage: number; avance: number };

/** ANCIENNETÉ (Jules, 25-09), troisième ligne sous le nom au verso :
 *  donnees/carriere-deputes.json (pplmatch, mandates_qc, par identifiant de
 *  l'Assemblée). */
export type Carriere = { premiere_election: string; mandats: number };

export type Genre = "f" | "m";

export type Mandat = { debut: string; motif: string };

/** DATE D'ÉLECTION DE CHAQUE ÉLU.
 *
 *  `DeputyRow.affiliationHistory` ne la porte que pour vingt députés : le
 *  loader ne l'expose « que lorsqu'un événement mérite d'être expliqué ». La
 *  source, elle, couvre les 129 — on la lit donc directement. On retient le
 *  PREMIER mandat de la personne, ce qui donne bien l'élection et non la
 *  défection qui a pu suivre. */
export type Mandats = { parNomEtDistrict: Map<string, Mandat>; parDistrict: Map<string, Mandat>; parNom: Map<string, Mandat> };

/** Libellé d'une ligne du tableau : le type de période, en petites capitales,
 *  et SA DATE. « Cette session » ne disait rien au lecteur d'une carte qu'on
 *  garde : on écrit « Session · 5 mai – 12 juin 2026 » (demande de Jules, 22-09). */
export type Etiquette = { type: string; date: string };

export type Carte = {
  slug: string;
  deputy: DeputyRow;
  parti: string;
  cle: PartyKey | "ind";
  couleur: string;
  /** Parti d'élection d'un élu qui a fini indépendant (voir finitIndependant). */
  partiElu?: string;
  /** Rang du SIÈGE dans le jeu COMPLET, calculé avant tout filtre : une carte
   *  garde son numéro qu'on tire la série entière ou un seul élu. */
  numero: number;
  /** « A », « B »… pour un député remplacé en cours de législature, qui partage
   *  le numéro de son siège ; vide pour l'élu en poste. */
  variante: string;
  /** Nombre de sièges, pas de cartes. */
  total: number;
  /** « Législature 2026 · Salon bleu » — le sous-titre de la période, que le
   *  site écrit déjà ; il tient lieu de mention de ligue sur le carton. */
  salon: string;
  /** Année de l'ÉDITION du jeu, pas de la donnée : les cartes se rééditeront
   *  chaque année, et deux tirages d'une même législature doivent se
   *  distinguer. Réglable par --annee. */
  annee: number;
  /** « Élu·e le 3 octobre 2022 ». Vide si le mandat n'a pas pu être apparié. */
  mandat: string;
  /** Résultat du scrutin qui lui a donné son siège (générale de 2022 ou
   *  partielle), tiré des données ouvertes d'Élections Québec. */
  scrutin?: { pourcentage: number; avance: number };
  /** « Chef du Parti québécois », le cas échéant. `eclat` réserve un traitement
   *  plus marqué à la seule distinction qui dépasse la direction d'un parti. */
  chef?: Titre;
  /** Député remplacé en cours de législature (carte à lettre) : pourquoi et
   *  quand il a quitté le siège, et qui l'occupe désormais. Verso seulement. */
  depart?: { titre: string; successeur: string };
  /** Somme touchée pendant la législature (base + fonction la mieux payée, jour
   *  par jour), tirée de scripts/social/donnees/fonctions-deputes.json. */
  remuneration?: number;
  /** La même, ramenée à une année de mandat. */
  remunerationMoyenne?: number;
  /** Frise du mandat : segments (position g et largeur w en % de l'axe,
   *  trame o), périodes hors mandat, légende. */
  parcours?: {
    segments: { g: number; w: number; o: number }[];
    horsMandat: { g: number; w: number }[];
    legende: { titre: string; annees: string; o: number }[];
  };
  /** Vis-à-vis ministre / porte-parole. Pas imprimé : sert à la rareté. */
  rarete?: Rarete;
  /** Présidente de l'Assemblée : commune d'office (voir RARETÉ). */
  presidente?: boolean;
  /** « PM », « M », « CO »… (voir CODES_FONCTION). */
  codeFonction?: string;
  /** Ce que le code veut dire, accordé : « Ministre », « Députée »… */
  libelleFonction?: string;
  /** « Élue pour la première fois en 2018 · 2e mandat » */
  carriere?: string;
  /** La même, en champs, pour le bloc Élection du verso. */
  carriereStats?: { premiere: string; mandats: number; genre?: Genre };
  /** Légendaires : autographe (URL du tracé blanc), s'il y en a un. */
  signature?: string | null;
  visAVis?: string;
  /** « 43e législature · 2022-2026 » ; pied du recto et du verso. */
  edition: string;
};

/** Ce que la série entière dit d'elle-même : sert aux cartes du paquet. */
export type Serie = {
  total: number;
  sansExpression: number;
  raretes: Record<Rarete, number>;
};

/** Les trois fenêtres de la fiche, dans l'ordre où le site les présente. Les
 *  LIBELLÉS ne sont pas écrits ici : ils viennent de `tabLabel`, comme sur le
 *  site. Un premier jet nommait `last_pdq` « dernière période de questions » —
 *  c'est faux, le site dit « Dernière journée de débats », et une journée de
 *  débats ne se réduit pas à la période de questions. Inventer un vocabulaire
 *  parallèle sur un carton qu'un élu peut brandir est le meilleur moyen de se
 *  faire corriger en public. */
export const PERIODES: PeriodKey[] = ["last_pdq", "session", "legislature"];
