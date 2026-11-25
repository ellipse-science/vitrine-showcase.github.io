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
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildEnjeuStack, type DeputyRow, type LegislatureEnAttente, type PeriodKey, type PeriodView } from "@/lib/data/assemblee";
import { rangeesEnAttente } from "@/lib/data/assembleeAttente";
import { chargerSources, etiquettesPeriodes, fusionnerLignesParParti, retirerExpressions, type DonneesAssemblee } from "./donnees";
import { cleDistrict, slugCirco } from "./fonctions";
import { PROFIL_44E, type ProfilLegislature } from "./legislatures";
import { construireJeu } from "./jeu";
import { PERIODES, type Carte, type Etiquette, type Mandats, type Serie } from "./types";

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
/** UNE FOIS PAR JEU DE DONNÉES (6 oct. 2026). Chaque page d'édition archivée
 *  rend le vestiaire, et chacune refaisait tout le jeu de cartes : 83 fois par
 *  build de dev, jusqu'à ce que le worker de build soit tué faute de mémoire
 *  (SIGKILL, déploiement de dev du 6 oct.). Or l'Assemblée suit les jours de
 *  séance, pas les éditions : la plupart de ces pages ont exactement les mêmes
 *  données. On garde donc le résultat par empreinte des données reçues, prise
 *  AVANT toute modification. Le retrait des expressions, lui, s'applique à
 *  chaque appel : il modifie `data`, que les casiers affichent. */
const parDonnees = new Map<string, Promise<CartesSite>>();

export async function preparerCartesSite(data: DonneesAssemblee, dossier?: string): Promise<CartesSite> {
  const empreinte = createHash("sha1").update(JSON.stringify([dossier, data])).digest("hex");
  await retirerExpressions(data);
  let cartes = parDonnees.get(empreinte);
  if (!cartes) {
    cartes = construireCartesSite(data, dossier);
    parDonnees.set(empreinte, cartes);
  }
  return cartes;
}

async function construireCartesSite(data: DonneesAssemblee, dossier?: string): Promise<CartesSite> {
  const sources = await chargerSources(dossier);
  // La série se construit sur une COPIE où les lignes d'une même personne
  // sont réunies, exactement comme dans le générateur : numéros, raretés et
  // fiches sont alors ceux du carton. Les casiers, eux, gardent `data`.
  const reunies: DonneesAssemblee = structuredClone(data);
  await fusionnerLignesParParti(reunies, false, dossier);
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
  return { parPeriode, libelles: await etiquettesPeriodes(dossier), signatures, personnes, maxAbs };
}

/** LES CARTES D'UNE LÉGISLATURE EN ATTENTE DE SA PREMIÈRE SÉANCE (Jules,
 *  25 nov.) : la même fabrique, avec les sources et le profil de la nouvelle
 *  législature. Pas de parole, donc pas de verso ni de classement (toutes
 *  communes, sauf la première ministre et la présidence : construireJeu).
 *  Le mandat (« Élu le 5 octobre 2026 ») vient des fiches tirées de la
 *  dimension, faute d'affiliations publiées par Agora. */
export async function preparerCartesAttente(vue: LegislatureEnAttente, profil: ProfilLegislature = PROFIL_44E): Promise<CartesSite> {
  const rows = rangeesEnAttente(vue);
  const v = (period: PeriodKey): PeriodView => ({ period, tabLabel: "", subtitle: "", lastUpdated: "", rows });
  const data = { periods: { legislature: v("legislature"), session: v("session"), last_pdq: v("last_pdq") } } as DonneesAssemblee;
  const sources = await chargerSources(undefined, profil);
  const mandats: Mandats = { parNomEtDistrict: new Map(), parDistrict: new Map(), parNom: new Map() };
  for (const f of sources.fonctions) {
    if (!f.debut_mandat) continue;
    const m = { debut: f.debut_mandat, motif: f.debut_mandat === profil.axe.debut ? "election" : "byelection" };
    mandats.parNom.set(cleDistrict(f.nom), m);
    if (f.circonscription) {
      mandats.parDistrict.set(cleDistrict(f.circonscription), m);
      mandats.parNomEtDistrict.set(`${cleDistrict(f.nom)}@${cleDistrict(f.circonscription)}`, m);
    }
  }
  const { cartes, serie } = construireJeu(data, "legislature", { ...sources, mandats }, { profil });
  return {
    parPeriode: { legislature: { serie, cartes: cartes.map(({ deputy, ...reste }) => ({ ...reste, elu: slugCirco(deputy) })) } },
    libelles: {
      legislature: { type: "Législature", date: profil.annees },
      session: { type: "Session", date: "" },
      last_pdq: { type: "Dernière séance", date: "" },
    },
    signatures: [],
    personnes: {},
    maxAbs: { legislature: 0, session: 0, last_pdq: 0 },
  };
}
