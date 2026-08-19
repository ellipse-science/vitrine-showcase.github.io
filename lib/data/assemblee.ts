// Build-time loader for the "Que dit-on à l'Assemblée ?" section.
//
// Reads /public/data/agora/agora_decideurs_qc.json from disk, applies the
// same transformations as the legacy public/js/assemblee-qc.js (enjeu stack
// truncation, lexical-richness scaling, tone amplification, French date
// formatting), and returns one PeriodView per tab (last_pdq / session /
// legislature) ready for React.

import fs from "node:fs/promises";
import path from "node:path";
import { readDatasetText } from "@/lib/data/source";
import { PARTY_KEYS, PARTY_LABELS, PARTY_COLORS, type PartyKey } from "@/lib/data/parties";
import { lastUpdatedLabel } from "@/lib/dates";

// Le ton mesuré est resserré autour de zéro : sur la table réelle, les partis
// s'étalent de -0,30 à +0,18. Avec un facteur 10, tout ce qui dépasse ±0,1
// venait buter sur les bornes, donc les quatre partis s'affichaient collés aux
// extrémités de la jauge (« 100 % vers le pôle favorable » pour plusieurs
// d'entre eux, ce qui ne voulait plus rien dire). Le facteur 2,5 conserve
// l'ordre et l'écart entre les partis sans saturer :
//
//   parti   ton      × 10    × 2,5
//   CAQ    +0,183    100 %    73 %
//   PLQ    -0,237      0 %    20 %
//   PQ     -0,275      0 %    16 %
//   QS     -0,299      0 %    13 %
const TONE_AMPLIFY = 2.5;

export type IssueKey =
  | "economy_and_labour"
  | "governments_and_governance"
  | "health_and_social_services"
  | "environment_and_energy"
  | "rights_liberties_minorities_discrimination"
  | "culture_and_nationalism"
  | "education"
  | "international_affairs_and_defense"
  | "law_and_crime"
  | "public_lands_and_agriculture"
  | "immigration"
  | "technology";

export type IssueMeta = {
  key: IssueKey;
  color: string;
  label: string;
  title: string;
};

export const ISSUE_META: IssueMeta[] = [
  { key: "economy_and_labour", color: "#94781B", label: "Économie", title: "Économie et travail" },
  { key: "governments_and_governance", color: "#234E78", label: "Gouv.", title: "Gouvernements et gouvernance" },
  { key: "health_and_social_services", color: "#852244", label: "Santé", title: "Santé et politiques sociales" },
  { key: "environment_and_energy", color: "#3D6B3A", label: "Environ.", title: "Environnement et énergie" },
  { key: "rights_liberties_minorities_discrimination", color: "#553278", label: "Droits", title: "Droits, libertés, minorités et discrimination" },
  { key: "culture_and_nationalism", color: "#384873", label: "Culture", title: "Culture et nationalisme" },
  { key: "education", color: "#752373", label: "Éduc.", title: "Éducation" },
  { key: "international_affairs_and_defense", color: "#1F5E66", label: "Aff. int.", title: "Affaires internationales et défense" },
  { key: "law_and_crime", color: "#993322", label: "Loi", title: "Loi et crime" },
  { key: "public_lands_and_agriculture", color: "#5E731F", label: "Terres", title: "Terres publiques et agriculture" },
  { key: "immigration", color: "#9E541B", label: "Immig.", title: "Immigration" },
  { key: "technology", color: "#997018", label: "Tech.", title: "Technologie" },
];

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export type PeriodKey = "last_pdq" | "session" | "legislature";

const PERIOD_TAB_LABELS: Record<PeriodKey, string> = {
  last_pdq: "Dernière période de questions",
  session: "Cette session",
  legislature: "Cette législature",
};

type IssueShares = Partial<Record<IssueKey, number>>;

type AgoraRow = IssueShares & {
  period_type: PeriodKey;
  period_start_date: string;
  period_end_date: string;
  party: string;
  n_interventions: number;
  word_count: number;
  lexical_richness: number;
  tone_score: number;
  editorial_angle: string;
  // Pas encore publiées par le raffineur (dépend de agora-decideurs-qc-phrases,
  // en attente de son premier run réussi) — toujours optionnelles côté JSON.
  signature_word?: string;
  signature_word_context?: string;
};

// Ligne brute de agora_decideurs_qc_deputes.json (agrégation par député, PR
// aws-refiners#259) — pas d'angle éditorial ici (coût LLM non justifié à
// l'échelle du député), mais le mot distinctif est calculé pour chacun.
type DeputyAgoraRow = IssueShares & {
  period_type: PeriodKey;
  period_start_date: string;
  period_end_date: string;
  party: string;
  deputy: string;
  n_interventions: number;
  word_count: number;
  lexical_richness: number;
  tone_score: number;
  signature_word?: string;
  signature_word_context?: string;
};

export type EnjeuSegment = {
  color: string;
  widthPct: number;
  label: string;
  title: string;
  isReste?: boolean;
};

export type DeputyRow = {
  /** Graphie de l'Assemblée nationale quand le portrait est apparié
   *  (« Jean-François Roberge ») ; sinon la graphie brute du référentiel,
   *  remise en capitales initiales (« Jean-Francois Roberge »). */
  name: string;
  wordsFormatted: string;
  wordsRaw: number;
  richnessLevel: number;
  toneLeftPct: number;
  signatureWord?: string;
  signatureWordContext?: string;
  // Champs de carte. circonscription et portrait manquent quand l'appariement
  // avec le référentiel de l'ANQ échoue (cf. PORTRAIT_ALIASES).
  circonscription?: string;
  portrait?: string;
  interventions: number;
  /** Ton BRUT (non amplifié, non borné). L'échelle visuelle se normalise sur
   *  l'étendue réellement observée dans la période : toneLeftPct est inutilisable
   *  pour cela, puisque l'amplification y colle 81 députés sur 108 à la butée. */
  toneScore: number;
  /** Enjeu dominant : tient lieu de « position » sur la carte. */
  topIssueLabel?: string;
  topIssueColor?: string;
  /** Répartition par enjeu, pour le verso statistique. */
  enjeuStack: EnjeuSegment[];
};

export type AssembleeRow = {
  key: PartyKey;
  label: string;
  color: string;
  inShadow: boolean;
  // Active-row fields (when not in shadow):
  enjeuStack?: EnjeuSegment[];
  editorialAngle?: string;
  toneLeftPct?: number;
  wordsFormatted?: string;
  wordsRaw?: number;
  richnessLevel?: number;
  /** Interventions du parti sur la période — porté sur la porte du casier. */
  interventions?: number;
  /** Ton brut du parti, même usage que DeputyRow.toneScore. */
  toneScore?: number;
  // Mot distinctif (TF-IDF inter-partis) — absent tant que le raffineur ne
  // le publie pas ; le composant masque simplement cette info le cas échéant.
  signatureWord?: string;
  signatureWordContext?: string;
  // Députés du parti pour la période (tableau d'enquête) — absent tant que
  // agora_decideurs_qc_deputes.json n'a pas encore été publié.
  deputies?: DeputyRow[];
};

export type PeriodView = {
  period: PeriodKey;
  tabLabel: string;
  subtitle: string;
  /** « Dernière mise à jour : jeudi 4 juin 2026 » — date de la dernière séance
   *  (period_end_date). NB : la publication des transcriptions peut prendre
   *  plusieurs semaines (cf. SourceTip) — la date reflète la séance, pas le fetch. */
  lastUpdated: string;
  rows: AssembleeRow[];
};

export type AssembleeData = {
  periods: Record<PeriodKey, PeriodView>;
};

function fmtDateFr(dateStr: string): string {
  const parts = String(dateStr || "").split("-");
  if (parts.length < 3) return dateStr || "";
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  return `${day} ${MONTHS_FR[month]} ${parts[0]}`;
}

function fmtWords(n: number): string {
  // Non-breaking space thousands separator (12840 → "12 840"), matches the
  // legacy renderer.
  const s = String(Math.round(n || 0));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += " ";
    out += s[i];
  }
  return out;
}

function computeRichnessLevels(mattrs: Record<string, number>): Record<string, number> {
  // Normalize MATTR values across active parties → 1–5 levels (relative
  // scaling). Within 0.01 of each other → all 3.
  const keys = Object.keys(mattrs);
  if (keys.length === 0) return {};
  const values = keys.map((k) => mattrs[k]);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal;
  const result: Record<string, number> = {};
  for (const k of keys) {
    result[k] = range < 0.01
      ? 3
      : Math.max(1, Math.round(1 + ((mattrs[k] - minVal) / range) * 4));
  }
  return result;
}

function buildEnjeuStack(row: IssueShares): EnjeuSegment[] {
  const segments = ISSUE_META
    .map((meta) => ({ meta, val: Number(row[meta.key] || 0) }))
    .filter((s) => s.val >= 0.04)
    .sort((a, b) => b.val - a.val);

  let cumul = 0;
  const kept: typeof segments = [];
  for (const seg of segments) {
    if (cumul < 0.8) {
      kept.push(seg);
      cumul += seg.val;
    }
  }

  const stack: EnjeuSegment[] = kept.map((seg) => {
    const pct = Math.round(seg.val * 100);
    return {
      color: seg.meta.color,
      widthPct: pct,
      label: seg.meta.label,
      title: `${seg.meta.title} · ${pct} %`,
    };
  });

  const reste = Math.max(0, 1 - cumul);
  if (reste > 0.02) {
    const pct = Math.round(reste * 100);
    stack.push({
      color: "",
      widthPct: pct,
      label: "Reste",
      title: `Autres enjeux · ${pct} %`,
      isReste: true,
    });
  }
  return stack;
}

// « NA » est la valeur manquante de R : elle traverse le pipeline sous forme
// de chaîne littérale et ne doit jamais s'afficher (vu en prod le 2026-07-28 :
// un député dont le mot distinctif s'affichait « NA »).
function cleanText(value?: string): string | undefined {
  const v = (value ?? "").trim();
  return v === "" || v === "NA" ? undefined : v;
}

// ---------------------------------------------------------------------------
// Appariement des portraits
// ---------------------------------------------------------------------------
// Le référentiel de pplmatch écrit les noms sans accents ni séparateurs
// (« jeanfrancois roberge ») ; l'ANQ les écrit correctement
// (« Jean-François Roberge »). On apparie donc sur une clé « serrée » : minuscules,
// accents retirés, TOUT séparateur supprimé. Cela résout à lui seul 102 des
// 108 noms, y compris les traits d'union et les apostrophes (« sylvie damours »
// ↔ « Sylvie D'Amours »).

export type DeputyPortrait = {
  circonscription: string;
  circonscription_slug: string;
  nom: string;
  /** « Indépendant », « Indépendante », ou le nom du parti, tel que l'ANQ
   *  l'inscrit dans son index. */
  parti?: string;
};

// Un.e député.e qui siège comme indépendant.e n'apparaît pas dans le module :
// le raffineur ne produit pas encore de catégorie pour ces sièges, et les
// afficher sous une bannière de parti serait faux (décision d'équipe,
// 2026-08-05).
//
// La liste est DÉRIVÉE de l'index de l'ANQ, jamais tenue à la main. Une liste
// manuelle a déjà produit exactement l'erreur qu'elle prétendait éviter : un
// nom y avait été ajouté sans vérification et un député en règle s'est
// retrouvé retiré du module. En lisant l'index, la liste se remet à jour toute
// seule au prochain passage du scraper, et chaque entrée est vérifiable sur la
// page officielle.
function isIndependent(portrait: DeputyPortrait): boolean {
  return /^ind[ée]pendant/i.test((portrait.parti ?? "").trim());
}

function tightKey(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// Les six noms restants divergent réellement d'une source à l'autre. On les
// résout à la main plutôt que par similarité approximative : afficher le
// mauvais visage sur une carte nominative est une faute éditoriale, et un
// appariement flou finirait tôt ou tard par en produire une.
//
// Éric Girard reste volontairement non apparié : deux députés portent ce nom
// (Groulx et Lac-Saint-Jean) et le référentiel ne les distingue pas de façon
// fiable (l'un des deux arrive sous « eric girard2 », l'autre sous une ligne
// fusionnée « eric girard; eric girard2 »). Sans circonscription dans la table
// des députés, le lien est indécidable : la carte s'affiche donc sans portrait.
const PORTRAIT_ALIASES: Record<string, string> = {
  brigittebgarceau: "brigittegarceau",   // « Brigitte B. Garceau » : initiale du second prénom
  karianabourassa: "karianebourassa",    // Kariane, selon l'ANQ
  simonjolinbarrette: "simonjolinbarette", // l'ANQ écrit « Barette » ; le nom réel prend deux r
  valeriesetlakwe: "michellesetlakwe",   // prénom erroné au référentiel ; une seule Setlakwe siège
};

function buildPortraitIndex(portraits: DeputyPortrait[]): Map<string, DeputyPortrait> {
  const byKey = new Map<string, DeputyPortrait>();
  const seen = new Set<string>();
  for (const p of portraits) {
    const key = tightKey(p.nom);
    if (!key) continue;
    // Un homonyme rend la clé inutilisable : on la retire plutôt que de
    // trancher au hasard entre deux personnes.
    if (byKey.has(key)) {
      seen.add(key);
      byKey.delete(key);
      continue;
    }
    if (!seen.has(key)) byKey.set(key, p);
  }
  return byKey;
}

function lookupPortrait(
  deputy: string,
  index: Map<string, DeputyPortrait>,
): DeputyPortrait | undefined {
  const key = tightKey(deputy);
  return index.get(key) ?? index.get(PORTRAIT_ALIASES[key] ?? "");
}

// Repli quand le portrait manque : « jeanfrancois roberge » est illisible tel
// quel. On ne peut pas restituer les accents ni les traits d'union perdus, mais
// on peut au moins remettre les capitales initiales.
function titleCaseName(raw: string): string {
  return (raw || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildDeputyList(
  partyKey: PartyKey,
  period: PeriodKey,
  deputyRows: DeputyAgoraRow[],
  portraits: Map<string, DeputyPortrait>,
): DeputyRow[] {
  const rows = deputyRows.filter(
    (r) => r.period_type === period && r.party && r.party.toLowerCase() === partyKey && r.deputy,
  );
  if (rows.length === 0) return [];

  // Les sièges indépendants sortent des cartes nominatives. Le raffineur en
  // écarte déjà l'essentiel en filtrant sur PARTIES_QC ; ce filtre-ci ne sert
  // qu'aux cas que le raffineur attribuerait encore à un parti.
  // Les agrégats de parti, eux, ne sont pas retouchés : la parole a bel et bien
  // été prononcée sous cette bannière pendant la période.
  const sorted = [...rows]
    .filter((r) => {
      const p = lookupPortrait(r.deputy, portraits);
      return !(p && isIndependent(p));
    })
    .sort((a, b) => (b.word_count || 0) - (a.word_count || 0));
  if (sorted.length === 0) return [];

  const mattrs: Record<string, number> = {};
  for (const r of sorted) mattrs[r.deputy] = Number(r.lexical_richness || 0);
  const richnessLevels = computeRichnessLevels(mattrs);

  return sorted.map((r) => {
    const amplified = Math.max(-1, Math.min(1, Number(r.tone_score || 0) * TONE_AMPLIFY));
    const portrait = lookupPortrait(r.deputy, portraits);
    const stack = buildEnjeuStack(r);
    const top = stack.find((s) => !s.isReste);
    return {
      name: portrait ? portrait.nom : titleCaseName(r.deputy),
      wordsFormatted: fmtWords(r.word_count),
      wordsRaw: Number(r.word_count || 0),
      richnessLevel: richnessLevels[r.deputy] || 1,
      toneLeftPct: Number((((amplified + 1) / 2) * 100).toFixed(1)),
      signatureWord: cleanText(r.signature_word),
      signatureWordContext: cleanText(r.signature_word_context),
      circonscription: portrait?.circonscription,
      // Tirage écran ; le tirage impression vit dans cartes/ (même nom de
      // fichier, sans le /web) et n'est chargé qu'au moment d'imprimer.
      portrait: portrait ? `/images/deputes/cartes/web/${portrait.circonscription_slug}.jpg` : undefined,
      interventions: Number(r.n_interventions || 0),
      toneScore: Number(r.tone_score || 0),
      topIssueLabel: top?.label,
      topIssueColor: top?.color,
      enjeuStack: stack,
    };
  });
}

function buildSubtitle(periodType: PeriodKey, endDate: string): string {
  if (periodType === "last_pdq") {
    return `Période de questions du ${fmtDateFr(endDate)} · Salon bleu`;
  }
  if (periodType === "session") {
    return `Session ${String(endDate || "").slice(0, 4)} · Salon bleu`;
  }
  return `Législature ${String(endDate || "").slice(0, 4)} · Salon bleu`;
}

function buildPeriodView(
  allRows: AgoraRow[],
  period: PeriodKey,
  deputyRows: DeputyAgoraRow[] = [],
  portraits: Map<string, DeputyPortrait> = new Map(),
): PeriodView {
  const rows = allRows.filter((r) => r.period_type === period);
  const endDate = rows[0]?.period_end_date || "";

  // Map party → row, preserving the static PARTY_KEYS order then re-sorting
  // by interventions descending.
  type WithData = { key: PartyKey; data: AgoraRow | null; interventions: number };
  const sorted: WithData[] = PARTY_KEYS.map((key) => {
    const partyData = rows.find((r) => r.party && r.party.toLowerCase() === key) || null;
    return { key, data: partyData, interventions: partyData?.n_interventions || 0 };
  });
  sorted.sort((a, b) => b.interventions - a.interventions);

  const mattrs: Record<string, number> = {};
  for (const item of sorted) {
    if (item.interventions > 0 && item.data) {
      mattrs[item.key] = Number(item.data.lexical_richness || 0);
    }
  }
  const richnessLevels = computeRichnessLevels(mattrs);

  const builtRows: AssembleeRow[] = sorted.map((item): AssembleeRow => {
    const isShadow = !(item.interventions > 0 && item.data);
    if (isShadow || !item.data) {
      return { key: item.key, label: PARTY_LABELS[item.key], color: PARTY_COLORS[item.key], inShadow: true };
    }
    const d = item.data;
    const amplified = Math.max(-1, Math.min(1, Number(d.tone_score || 0) * TONE_AMPLIFY));
    return {
      key: item.key,
      label: PARTY_LABELS[item.key],
      color: PARTY_COLORS[item.key],
      inShadow: false,
      enjeuStack: buildEnjeuStack(d),
      editorialAngle: cleanText(d.editorial_angle) ?? "",
      toneLeftPct: Number((((amplified + 1) / 2) * 100).toFixed(1)),
      wordsFormatted: fmtWords(d.word_count),
      wordsRaw: Number(d.word_count || 0),
      richnessLevel: richnessLevels[item.key] || 1,
      interventions: Number(d.n_interventions || 0),
      toneScore: Number(d.tone_score || 0),
      signatureWord: cleanText(d.signature_word),
      signatureWordContext: cleanText(d.signature_word_context),
      deputies: buildDeputyList(item.key, period, deputyRows, portraits),
    };
  });

  return {
    period,
    tabLabel: PERIOD_TAB_LABELS[period],
    subtitle: buildSubtitle(period, endDate),
    lastUpdated: lastUpdatedLabel(endDate),
    rows: builtRows,
  };
}

const ASSEMBLEE_JSON_PATH = path.resolve(
  process.cwd(),
  "public",
  "data",
  "agora",
  "agora_decideurs_qc.json",
);

const ASSEMBLEE_DEPUTES_JSON_PATH = path.resolve(
  process.cwd(),
  "public",
  "data",
  "agora",
  "agora_decideurs_qc_deputes.json",
);

async function loadDeputyRows(): Promise<DeputyAgoraRow[]> {
  // Table publiée séparément (aws-refiners#259) — tant qu'un premier fetch_data.R
  // ne l'a pas encore matérialisée localement, on dégrade en l'absence de
  // cartes satellites plutôt que de faire échouer toute la section.
  try {
    const raw = await readDatasetText("public/data/agora/agora_decideurs_qc_deputes.json");
    const rows = JSON.parse(raw) as DeputyAgoraRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

const PORTRAITS_INDEX_PATH = path.resolve(
  process.cwd(),
  "public",
  "images",
  "deputes",
  "index.json",
);

async function loadPortraits(): Promise<DeputyPortrait[]> {
  // Index produit par scripts/scrape_deputy_photos.py. Absent du dépôt tant que
  // le script n'a pas tourné : on dégrade alors en cartes sans portrait plutôt
  // que de faire échouer le build.
  try {
    const raw = await fs.readFile(PORTRAITS_INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw) as { deputes?: DeputyPortrait[] };
    return Array.isArray(parsed?.deputes) ? parsed.deputes : [];
  } catch {
    return [];
  }
}

export async function loadAssemblee(
  /** Édition passée (#434) : jour de publication de l'édition affichée. Les
   *  discours sont publiés par JOUR DE DÉBAT — l'archive de ce module suit donc
   *  la cadence de l'Assemblée, pas celle des éditions. */
  asOfIso?: string,
): Promise<AssembleeData | null> {
  const raw = await readDatasetText("public/data/agora/agora_decideurs_qc.json");
  const parsed = JSON.parse(raw) as AgoraRow[];
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const allRows = asOfIso
    ? parsed.filter((r) => String(r.period_end_date ?? "") <= asOfIso)
    : parsed;
  if (allRows.length === 0) return null;
  const deputyRows = await loadDeputyRows();
  const portraits = buildPortraitIndex(await loadPortraits());
  return {
    periods: {
      last_pdq: buildPeriodView(allRows, "last_pdq", deputyRows, portraits),
      session: buildPeriodView(allRows, "session", deputyRows, portraits),
      legislature: buildPeriodView(allRows, "legislature", deputyRows, portraits),
    },
  };
}

// Exports réservés aux tests unitaires (pipeline interne ; pas l'API publique).
export const __test__ = {
  fmtDateFr,
  fmtWords,
  computeRichnessLevels,
  buildEnjeuStack,
  buildSubtitle,
  buildPeriodView,
};
