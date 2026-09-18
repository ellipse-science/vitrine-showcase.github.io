// MOTEUR DES REELS COURTS « L'alignement de l'Assemblée ».
//
// Mêmes règles que les autres reels courts (Jules Piral, 2026-09-17) : 8 à 12
// secondes, fin comprise ; UN SEUL PLAN ; deux ou trois informations au plus ;
// une statistique INÉDITE. La mécanique du plan est RÉEXPORTÉE de
// `partis-court/plan.ts` : la boîte caméra, le passage des phrases et le zoom
// n'ont rien de propre à un module.
//
// ⚠️ CE MODULE NE SUIT PAS LA CADENCE DES ÉDITIONS. Les discours sont publiés
// par JOUR DE DÉBAT : au 18 septembre 2026, la dernière séance remonte au
// 12 juin. L'en-tête porte la date du jour (quand le reel est fait), la ligne
// de méthode porte la PÉRIODE DES DONNÉES. Les confondre ferait passer des
// chiffres de juin pour des chiffres de campagne.

import type { AssembleeData, PeriodKey } from "@/lib/data/assemblee";
import type { EditionRef } from "@/lib/data/headlineEvents";
import { MODULES } from "@/lib/modules";

import { captionTypo } from "../lib/commun";

export {
  BOITE, LARGEUR, scenePlanHtml, fois,
} from "../partis-court/plan";

/** ⚠️ CE MODULE SORT DE LA FENÊTRE 8–12 s, ET C'EST DÉLIBÉRÉ (Jules Piral,
 *  2026-09-18 : « trop vite et on ne sait pas de quoi on parle »).
 *
 *  L'arithmétique ne laissait pas le choix. Une PRÉSENTATION D'ÉQUIPE, ce n'est
 *  pas une analyse : il faut poser le cadre (où, quand, qui), puis donner à
 *  chacun des trois chefs le temps qu'on lise son nom, sa circonscription et
 *  ses deux chiffres. À 12 s, chaque chef avait 2,4 s — de quoi voir passer un
 *  chiffre, pas de quoi le lire. À 18,9 s, il en a 3,5, et le cadre a les
 *  siennes.
 *
 *  La fenêtre 8–12 s reste la règle pour les reels d'ANALYSE (partis, enjeux,
 *  Une de l'actualité) : une statistique, deux phrases, on sort. */
export const DUREE_PLAN = 10.5;
export const MIN_SECONDES = 15;
export const MAX_SECONDES = 22;

/** Contrôle la durée totale. Jette si elle sort de la fenêtre du module. */
export function verifierDuree(secondes: number, quoi: string): void {
  const s = Math.round(secondes * 100) / 100;
  if (s < MIN_SECONDES - 0.05 || s > MAX_SECONDES + 0.05) {
    throw new Error(`${quoi} : ${s} s à l'écran, hors de la fenêtre ${MIN_SECONDES}–${MAX_SECONDES} s des présentations.`);
  }
}
export type { Plan, Phrase } from "../partis-court/plan";

export const IDENTITE = MODULES["assemblee-nationale"];
export const MODULE = IDENTITE.nom;
export const HASHTAGS = ["#AssembléeNationale", "#CAPP", "#CLESSN", "#Élections2026", "#polqc"];

/** Ce que reçoit une analyse. `periode` : la vue choisie (législature par
 *  défaut — c'est la seule qui couvre le mandat entier). */
export type Contexte = {
  data: AssembleeData;
  periode: PeriodKey;
  edition: EditionRef;
  /** Les portraits, EN BASE64, par chemin de la donnée. Une analyse est
   *  synchrone : elle ne peut pas lire un fichier. Et un `src` en « /images/… »
   *  ne résout pas dans une page HTML locale — le cercle restait gris. */
  portraits: Record<string, string>;
};

/** Charge et inline les portraits des députés cités. Réduits à 360 px : la page
 *  d'aperçu est déjà lourde, et le cercle fait 240 px à l'écran. */
export async function chargerPortraits(chemins: (string | undefined)[]): Promise<Record<string, string>> {
  const sharp = (await import("sharp")).default;
  const path = await import("node:path");
  const out: Record<string, string> = {};
  for (const c of chemins) {
    if (!c || out[c]) continue;
    const abs = path.resolve(process.cwd(), "public", c.replace(/^\//, ""));
    try {
      const jpg = await sharp(abs).resize(360, 360, { fit: "cover", position: "top" }).jpeg({ quality: 82 }).toBuffer();
      out[c] = `data:image/jpeg;base64,${jpg.toString("base64")}`;
    } catch {
      // Portrait manquant : la carte s'affiche sans, plutôt que de tout arrêter.
    }
  }
  return out;
}

export type Analyse = {
  id: string;
  /** Ce que l'analyse raconte, en une ligne (pour la liste). */
  idee: string;
  /** Le plan, ou `null` quand les données ne s'y prêtent pas. */
  construire(ctx: Contexte): import("../partis-court/plan").Plan | null;
};

export function legendeComplete(plan: import("../partis-court/plan").Plan): string {
  return captionTypo([
    plan.legende,
    `${MODULE} : vitrinedemocratique.com`,
    HASHTAGS.join(" "),
  ].join("\n\n")) + "\n";
}
