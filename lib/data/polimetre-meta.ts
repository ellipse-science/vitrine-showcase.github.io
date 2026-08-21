// Client-safe view types and labels for the Polimètre+ section.
//
// Kept separate from polimetre.ts (which imports node:fs) so the client
// component can import these without dragging server-only modules into the
// browser bundle.

export type VerdictSlug =
  | "realisee"
  | "partielle"
  | "en-cours"
  | "en-suspens"
  | "rompue";

// "flat" = rang inchangé (constat). "unknown" = pas de rang antérieur comparable
// — période précédente non publiée, ou promesse entrante. Les confondre ferait
// affirmer « aucun changement » là où l'on ne sait simplement pas.
export type Trend = { dir: "up" | "down" | "flat" | "unknown"; delta: number };

// The most recent article from a single outlet's coverage of a promise:
// outlet name, headline, and a link to the piece.
export type ArticleRef = { media: string; title: string; url: string };

export type RangeKey = "week" | "month";

export const RANGE_TAB_LABELS: Record<RangeKey, string> = {
  week: "Depuis une semaine",
  month: "Depuis un mois",
};

// The issue category IS its full French name (Polimètre `Catégorie` = the gold
// standard `capp_category`). No English slug is ever used. This list only fixes
// the dropdown display order; the values themselves come from the data.
export const CATEGORY_ORDER: string[] = [
  "Économie et travail",
  "Santé et politiques sociales",
  "Éducation",
  "Environnement et énergie",
  "Gouvernements et gouvernance",
  "Droits, libertés, minorités et discrimination",
  "Culture et nationalisme",
  "Immigration",
  "Terres publiques et agriculture",
  "Technologie",
  "Affaires internationales et défense",
  "Loi et crime",
];

export type PromiseView = {
  pledgeNumber: string;
  title: string; // short, unique display label derived from the pledge text
  fullTitle: string; // full pledge text, cleaned — used as tooltip
  summary: string | null; // résumé (AI-generated, eventually) — null for now
  verdict: VerdictSlug | null;
  verdictLabel: string;
  category: string | null; // full French category name
  salienceIndex: number;
  url: string;
  trend: Trend;
  // One article per outlet that covered the promise — the most recent piece
  // from each (recency is reliable within an outlet). Ordered by canonical outlet
  // order, not cross-outlet recency (the keys aren't comparable across outlets).
  // Empty when no usable title/url pair.
  articles: ArticleRef[];
};

export type PolimetreData = {
  weekEndDate: string;
  /** « Dernière mise à jour : vendredi 3 juillet 2026 » — fin du dernier
   *  snapshot hebdomadaire (week_end_date). */
  lastUpdated: string;
  // One ranked promise list per range. "week" = latest weekly snapshot;
  // "month" = rollup of the most recent ~4 weekly snapshots.
  ranges: Record<RangeKey, PromiseView[]>;
};

/* ========================================================================== *
 * MODE « promesses neuves » (#—)
 *
 * Deuxième source du même module : au lieu des ~150 promesses de la CAQ de
 * 2022, les promesses repérées dans les communiqués de presse des partis au fur
 * et à mesure qu'ils les formulent (raffineur `polimetre-promesses-neuves`).
 *
 * Deux choses changent, et elles se tiennent : la liste n'est plus fermée, donc
 * une promesse neuve n'a pas encore de VERDICT — le Polimètre ne se prononcera
 * sur sa réalisation que des mois plus tard. Ce qu'on sait d'elle le jour même,
 * c'est QUI l'a formulée. La pastille porte donc le PARTI à la place du verdict.
 * ========================================================================== */

export type ModeKey = "polimetre" | "neuves";

export const MODE_LABELS: Record<ModeKey, string> = {
  polimetre: "Promesses de 2022",
  neuves: "Promesses de la campagne",
};

/** Onglets du mode « neuves ». Volontairement PAS de « mois » : une promesse
 *  neuve est un événement daté, et une fenêtre d'un mois noierait la nouveauté
 *  sous l'accumulé — ce que le mode « 2022 » fait déjà. */
export type NeuveRangeKey = "day" | "week";

export const NEUVE_RANGE_TAB_LABELS: Record<NeuveRangeKey, string> = {
  day: "Aujourd'hui",
  week: "Depuis une semaine",
};

/** Clés de parti — les mêmes que PARTY_KEYS de lib/data/parties.ts, en
 *  minuscules. Déclarées ici plutôt qu'importées de parties.ts : ce dernier
 *  tire `node:fs`, et ce fichier doit rester importable par le client. */
export type PartiKey = "plq" | "caq" | "qs" | "pq" | "pcq";

export const PARTI_ORDER: PartiKey[] = ["caq", "plq", "qs", "pq", "pcq"];

/** Libellés d'affichage. Sigles pour les quatre partis qui en portent un ;
 *  « Québec solidaire » ne s'abrège pas dans le corps du texte, mais la pastille
 *  n'a pas la place — d'où le sigle ici et le nom complet en infobulle. */
export const PARTI_LABELS: Record<PartiKey, string> = {
  plq: "PLQ",
  caq: "CAQ",
  qs: "QS",
  pq: "PQ",
  pcq: "PCQ",
};

export const PARTI_FULL_LABELS: Record<PartiKey, string> = {
  plq: "Parti libéral du Québec",
  caq: "Coalition avenir Québec",
  qs: "Québec solidaire",
  pq: "Parti québécois",
  pcq: "Parti conservateur du Québec",
};

/** `party_id` de la table des communiqués (majuscules) → clé de parti. Renvoie
 *  null pour un parti hors des cinq suivis : la promesse s'affiche alors sans
 *  pastille plutôt qu'avec une couleur empruntée à un autre parti. */
export function partiKeyFromId(id: string | null | undefined): PartiKey | null {
  const k = (id ?? "").trim().toLowerCase();
  return (PARTI_ORDER as string[]).includes(k) ? (k as PartiKey) : null;
}

export type PromesseNeuveView = {
  promesseId: string;
  /** Libellé court (3–9 mots) généré par le LLM à partir du verbatim. */
  title: string;
  /** Le VERBATIM du communiqué — phrase complète ou puce, jamais reformulé.
   *  C'est la pièce justificative du module : ce qui est affiché en détail est
   *  ce que le parti a écrit, pas ce qu'un modèle en a compris. */
  verbatim: string;
  parti: PartiKey | null;
  /** Sigle brut tel que publié, pour l'étiquette accessible même hors des cinq. */
  partiLabel: string;
  /** Date d'annonce (ISO), = date du communiqué. */
  announceDate: string;
  /** Lien vers le communiqué source. */
  sourceUrl: string;
  sourceTitle: string;
  salienceIndex: number;
  nMentions: number;
  articles: ArticleRef[];
};

export type PromessesNeuvesData = {
  windowEnd: string;
  lastUpdated: string;
  ranges: Record<NeuveRangeKey, PromesseNeuveView[]>;
};
