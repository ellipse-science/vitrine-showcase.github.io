// MOTEUR DES REELS COURTS « Les 12 enjeux ».
//
// Mêmes règles que les reels courts des Partis et de la Une de l'actualité
// (Jules Piral, 2026-09-17) : 8 à 12 secondes, fin comprise ; UN SEUL PLAN, pas
// des slides ; deux ou trois informations au plus ; des phrases qu'on comprend
// du premier coup ; une statistique INÉDITE, calculée à partir du module et
// jamais affichée telle quelle sur le site.
//
// LA MÉCANIQUE DU PLAN EST PARTAGÉE avec `partis-court/plan.ts` : la boîte
// caméra, le passage des phrases, l'éclair et le zoom n'ont rien de propre à un
// module. Seuls le contexte (ce qu'une analyse reçoit), le plafond de l'axe et
// la légende changent.

import type { EditionRef } from "@/lib/data/headlineEvents";
import type { TreemapAllPeriods, TreemapIssueTile } from "@/lib/data/headlineEvents";

import { captionTypo } from "../lib/commun";
import { axeLabel, type Plan } from "../partis-court/plan";

export {
  BOITE, LARGEUR, DUREE_PLAN, MIN_SECONDES, MAX_SECONDES, verifierDuree, BARRES,
  BASE_BARRES, echelleBarres, axeLabel, barresHtml, CSS_BARRES, CSS_LIGNE,
  ligneBarres, scriptBarres, scenePlanHtml, commeOnLeDit, fois,
} from "../partis-court/plan";
export type { Plan, Phrase } from "../partis-court/plan";

export const MODULE = "Les 12 enjeux";
export const HASHTAGS = ["#12Enjeux", "#CAPP", "#CLESSN", "#Élections2026", "#polqc"];

/** PLAFOND DE L'AXE, propre aux 12 enjeux. Les douze se partagent 100 % de la
 *  saillance, contre cinq partis : le premier enjeu tourne autour de 27 % là où
 *  le premier parti monte à 38. L'axe des partis (50 %) laisserait donc la
 *  moitié du graphique vide, et ce vide tombe au centre de la vignette.
 *
 *  40 % — MESURÉ, pas deviné : sur l'édition du 17-09, le maximum est de 27,1 %
 *  sur la journée et de 31,4 % sur la semaine. Un premier plafond à 25 a été
 *  refusé par le garde-fou dès le premier essai, ce qui est exactement son rôle.
 *
 *  Comme pour les partis : plafond FIXE (deux éditions se comparent à l'œil),
 *  ÉCRIT sous le graphique, et un dépassement fait échouer la production plutôt
 *  que de rogner une barre. */
export const PLAFOND_AXE = 40;

/** Ce qu'on mesure, écrit sous le graphique. Les 12 parts somment à 100 %. */
export const AXE_LABEL = axeLabel("Part des 12 enjeux", PLAFOND_AXE);

/** Ce que reçoit une analyse.
 *  `jour` : les 12 enjeux depuis minuit, `semaine` : sur sept jours.
 *  `tuiles` : les 12 du jour, de la plus à la moins saillante. */
export type Contexte = {
  data: TreemapAllPeriods;
  tuiles: TreemapIssueTile[];
  tete: TreemapIssueTile;
  edition: EditionRef;
};

/** Les trois périodes du module, sous les mots du site : « Jour », « Semaine »,
 *  « Campagne » (onglets de la treemap). `month` n'est PAS « le mois » ici. */
export type Periode = "day" | "week" | "month";

export type Analyse = {
  id: string;
  /** Ce que l'analyse raconte, en une ligne (pour la liste). */
  idee: string;
  /** Le plan, ou `null` quand les données du jour ne s'y prêtent pas. */
  construire(ctx: Contexte): Plan | null;
};

/** Le libellé court d'un enjeu, tel que le site l'écrit. */
export const nomEnjeu = (t: TreemapIssueTile) => t.issueFr;

export function legendeComplete(plan: Plan): string {
  return captionTypo([
    plan.legende,
    `${MODULE}, six fois par jour : vitrinedemocratique.com`,
    HASHTAGS.join(" "),
  ].join("\n\n")) + "\n";
}
