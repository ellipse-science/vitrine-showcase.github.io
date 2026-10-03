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
import { buildEnjeuStack, type DeputyRow, type PeriodKey } from "@/lib/data/assemblee";
import { chargerSources, etiquettesPeriodes, fusionnerLignesParParti, retirerExpressions, type DonneesAssemblee } from "./donnees";
import { slugCirco } from "./fonctions";
import { construireJeu } from "./jeu";
import { PERIODES, type Carte, type Etiquette, type Serie } from "./types";

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
  /** UNE PERSONNE, UNE FICHE. Pour les élus dont la période compte plusieurs
   *  lignes (changement d'allégeance, deux graphies), les valeurs réunies, par
   *  période puis par slug : le casier montre la parole PAR PARTI, la carte
   *  parle de la PERSONNE, comme le carton imprimé (fusionnerLignesParParti).
   *  Sans elles, le verso lisait la dernière ligne venue — Rosemont 3 874 mots
   *  au lieu de 139 085 (relecture d'Adrien, vitrine#917). Seuls ces élus-là
   *  sont envoyés : une douzaine de fiches, pas 130. */
  personnes: Partial<Record<PeriodKey, Record<string, Partial<DeputyRow>>>>;
  /** Étendue du ton réellement observée par période, indépendants compris
   *  (ils ne partent pas au navigateur) : l'échelle du ton du verso. */
  maxAbs: Record<PeriodKey, number>;
};

/** Les champs qu'une fusion peut changer. */
const CHAMPS_FUSION = ["interventions", "wordsRaw", "wordsFormatted", "toneScore", "richnessLevel", "signatureWord",
  "signatureWordContext", "enjeuStack", "topIssueLabel", "topIssueKey", "topIssueColor"] as const;

const PERIODES_SITE: PeriodKey[] = ["legislature", "session", "last_pdq"];

/** À appeler après loadAssemblee(), côté serveur. Les retraits d'expressions
 *  relus à la main (donnees/expressions-retirees.json) s'appliquent aux
 *  données elles-mêmes, comme pour les cartes imprimées : le site et le carton
 *  disent la même chose. */
export async function preparerCartesSite(data: DonneesAssemblee): Promise<CartesSite> {
  await retirerExpressions(data);
  const sources = await chargerSources();
  // La série se construit sur une COPIE où les lignes d'une même personne
  // sont réunies, exactement comme dans le générateur : numéros, raretés et
  // fiches sont alors ceux du carton. Les casiers, eux, gardent `data`.
  const reunies: DonneesAssemblee = structuredClone(data);
  await fusionnerLignesParParti(reunies, false);
  const maxAbs = {} as Record<PeriodKey, number>;
  const personnes: CartesSite["personnes"] = {};
  for (const periode of PERIODES) {
    const vue = reunies.periods[periode];
    const tous = vue ? [...vue.rows.flatMap((r) => r.deputies ?? []), ...(vue.independants ?? [])] : [];
    maxAbs[periode] = tous.reduce((m, r) => Math.max(m, Math.abs(r.toneScore)), 0);
    // Les parts réunies n'ont pas encore leur pile : on la refait, comme le
    // générateur après sa fusion.
    for (const d of tous) {
      if (!d.issueShares) continue;
      d.enjeuStack = buildEnjeuStack(d.issueShares);
      const top = d.enjeuStack.find((x) => !x.isReste);
      d.topIssueLabel = top?.label; d.topIssueKey = top?.cle ?? undefined; d.topIssueColor = top?.color;
    }
    // Une fiche réunie n'est envoyée que si elle diffère de la ligne du casier.
    const origine = data.periods[periode];
    const lignesCasier = origine ? [...origine.rows.flatMap((r) => r.deputies ?? []), ...(origine.independants ?? [])] : [];
    for (const d of tous) {
      const slug = slugCirco(d);
      const identique = lignesCasier.some((o) => slugCirco(o) === slug && o.wordsRaw === d.wordsRaw && o.interventions === d.interventions);
      if (identique) continue;
      (personnes[periode] ??= {})[slug] = Object.fromEntries(CHAMPS_FUSION.map((k) => [k, d[k]])) as Partial<DeputyRow>;
    }
  }
  const parPeriode: CartesSite["parPeriode"] = {};
  for (const periode of PERIODES_SITE) {
    if (!reunies.periods[periode]) continue;
    const { cartes, serie } = construireJeu(reunies, periode, sources);
    parPeriode[periode] = {
      serie,
      cartes: cartes.map(({ deputy, ...reste }) => ({ ...reste, elu: slugCirco(deputy) })),
    };
  }
  const signatures = (await fs.readdir(path.resolve(process.cwd(), "public/images/cartes")).catch(() => [] as string[]))
    .map((f) => f.match(/^signature-(.+)\.png$/)?.[1]).filter((x): x is string => !!x);
  return { parPeriode, libelles: await etiquettesPeriodes(), signatures, personnes, maxAbs };
}
