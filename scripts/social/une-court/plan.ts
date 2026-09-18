// MOTEUR DES REELS COURTS « La Une des Unes ».
//
// Mêmes règles que les reels courts des Partis (Jules Piral, 2026-09-17) : 12
// secondes au plus, fin comprise ; UN SEUL PLAN, pas des slides ; deux ou trois
// informations au plus ; des phrases qu'on comprend du premier coup ; une
// statistique INÉDITE, calculée à partir du module et jamais affichée telle
// quelle sur le site.
//
// LA MÉCANIQUE DU PLAN EST PARTAGÉE avec `partis-court/plan.ts` : la boîte
// caméra, le passage des phrases, l'éclair et le zoom n'ont rien de propre à un
// module. Seuls le contexte (ce qu'une analyse reçoit) et la légende changent.

import type { EditionRef, UneEvent } from "@/lib/data/headlineEvents";

import { captionTypo } from "../lib/commun";
import type { Plan } from "../partis-court/plan";

export {
  BOITE, LARGEUR, DUREE_PLAN, MIN_SECONDES, MAX_SECONDES, verifierDuree, BARRES, ECHELLE_BARRES, BASE_BARRES, PLAFOND_AXE, AXE_LABEL,
  barresHtml, CSS_BARRES, scriptBarres, scenePlanHtml,
} from "../partis-court/plan";
export type { Plan, Phrase } from "../partis-court/plan";

export const MODULE = "La Une des Unes";
export const HASHTAGS = ["#LaUnedesUnes", "#CAPP", "#CLESSN", "#Élections2026", "#polqc"];

/** Ce que reçoit une analyse. `top` : la Une n°1 ; `classement` : les cinq
 *  nouvelles les plus saillantes des 24 dernières heures, dans l'ordre. */
export type Contexte = { classement: UneEvent[]; top: UneEvent; edition: EditionRef };

export type Analyse = {
  id: string;
  /** Ce que l'analyse raconte, en une ligne (pour la liste). */
  idee: string;
  /** Le plan, ou `null` quand les données du jour ne s'y prêtent pas. */
  construire(ctx: Contexte): Plan | null;
};

/** Corps d'un titre de Une, en pixels. Un titre n'a pas de longueur fixe et il
 *  doit se lire EN ENTIER : on ne le coupe pas, on le compose plus petit. Entre
 *  la grande ligne (y 396) et le haut de la boîte caméra (y 636), il reste
 *  240 px — d'où ces paliers, mesurés sur une colonne de 720 px. */
export function corpsTitre(titre: string): number {
  const n = titre.length;
  if (n <= 32) return 88;
  if (n <= 48) return 74;
  if (n <= 66) return 62;
  if (n <= 84) return 54;
  return 46;
}

export function legendeComplete(plan: Plan): string {
  return captionTypo([plan.legende, `${MODULE}, six fois par jour : vitrinedemocratique.com`, HASHTAGS.join(" ")].join("\n\n")) + "\n";
}
