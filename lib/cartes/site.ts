// LES CARTES POUR LE SITE, préparées AU BUILD (jamais dans le navigateur,
// règle du dépôt) : la série complète de chaque période par construireJeu(),
// la même fonction que le générateur imprimé, puis réduite à ce que le
// vestiaire doit emporter dans la page.
//
// Ce qui part dans la page est VOLUMINEUX si on n'y prend garde : une Carte
// porte son DeputyRow entier, déjà présent dans les casiers. On ne garde donc
// que les champs propres à la carte, et le navigateur ré-attache l'élu par la
// clé de sa circonscription (slugCirco), la même que le générateur utilise
// pour nommer les fichiers.
import fs from "node:fs/promises";
import path from "node:path";
import type { PeriodKey } from "@/lib/data/assemblee";
import { chargerSources, etiquettesPeriodes, retirerExpressions, type DonneesAssemblee } from "./donnees";
import { slugCirco } from "./fonctions";
import { construireJeu } from "./jeu";
import type { Carte, Etiquette, Serie } from "./types";

/** Une carte sans son DeputyRow : `elu` = slugCirco(deputy). */
export type CarteSite = Omit<Carte, "deputy"> & { elu: string };

export type CartesSite = {
  /** Par période, la série complète (indépendants compris : ils n'ont pas de
   *  casier, mais une personne passée indépendante garde sa carte sous son
   *  parti d'élection, et la carte dit « Indépendant »). */
  parPeriode: Partial<Record<PeriodKey, { cartes: CarteSite[]; serie: Serie }>>;
  /** « Session · 5 mai – 12 juin 2026 » : les bornes de chaque période. */
  libelles: Record<PeriodKey, Etiquette>;
  /** Slugs des légendaires dont on a l'autographe (public/images/cartes/signature-<slug>.png). */
  signatures: string[];
};

const PERIODES_SITE: PeriodKey[] = ["legislature", "session", "last_pdq"];

/** À appeler après loadAssemblee(), côté serveur. Les retraits d'expressions
 *  relus à la main (donnees/expressions-retirees.json) s'appliquent aux
 *  données elles-mêmes, comme pour les cartes imprimées : le site et le carton
 *  disent la même chose. */
export async function preparerCartesSite(data: DonneesAssemblee): Promise<CartesSite> {
  await retirerExpressions(data);
  const sources = await chargerSources();
  const parPeriode: CartesSite["parPeriode"] = {};
  for (const periode of PERIODES_SITE) {
    if (!data.periods[periode]) continue;
    const { cartes, serie } = construireJeu(data, periode, sources);
    parPeriode[periode] = {
      serie,
      cartes: cartes.map(({ deputy, ...reste }) => ({ ...reste, elu: slugCirco(deputy) })),
    };
  }
  const signatures = (await fs.readdir(path.resolve(process.cwd(), "public/images/cartes")).catch(() => [] as string[]))
    .map((f) => f.match(/^signature-(.+)\.png$/)?.[1]).filter((x): x is string => !!x);
  return { parPeriode, libelles: await etiquettesPeriodes(), signatures };
}
