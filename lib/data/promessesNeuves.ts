// Chargeur AU BUILD du mode « promesses neuves » du Polimètre+.
//
// Lit public/data/refined/day/polimetre_promesses_neuves.json, produit par le
// raffineur `polimetre-promesses-neuves` (→ vitrine_datamart.polimetre_promesses_neuves).
// Le raffineur publie jusqu'à TROIS fenêtres par run — `window_key` ∈ {day,
// week, campaign} — déjà classées et déjà rangées : la Vitrine ne recalcule aucun
// rang ici, contrairement au mode « 2022 » où la vue « mois » agrège plusieurs
// instantanés hebdomadaires et doit donc reclasser. `campaign` est le cumul
// depuis le jour du bref (même origine que ELECTION_CALL_DATE), pas une fenêtre
// glissante. Une fenêtre sans reprise n'est pas publiée du tout : « vide » et
// « pas calculée » se ressemblent dans la donnée, et c'est la vue qui les
// départage par l'emboîtement day ⊂ week ⊂ campaign.
//
// Renvoie null quand le JSON est absent (raffineur pas encore passé) ou qu'aucune
// promesse n'a encore été repérée — le cas ATTENDU hors campagne, où les
// communiqués publiés sont des annonces de candidature et des annonces
// gouvernementales. Le module retombe alors sur son seul mode « 2022 » plutôt que
// d'afficher un onglet vide.

import fs from "node:fs/promises";
import path from "node:path";

import { lastUpdatedLabel } from "@/lib/dates";
import { COULEUR_PAR_LIBELLE } from "@/lib/enjeux";
import { readDatasetText } from "@/lib/data/source";
import {
  NEUVE_RANGE_ORDER,
  partiKeyFromId,
  type ArticleRef,
  type NeuveRangeKey,
  type PromesseNeuveView,
  type PromessesNeuvesData,
} from "@/lib/data/polimetre-meta";

export type {
  NeuveRangeKey,
  PromesseNeuveView,
  PromessesNeuvesData,
} from "@/lib/data/polimetre-meta";

/** Clé de scripts/tables.json — c'est elle qui permet à lib/data/source.ts de
 *  servir ce jeu depuis l'API plutôt que du disque. */
const NEUVES_DATASET = "public/data/refined/day/polimetre_promesses_neuves.json";

// Nombre de promesses conservées par fenêtre. Le module en affiche cinq ; on en
// garde davantage pour que les filtres de parti aient de quoi travailler.
const KEEP_PER_RANGE = 40;

type Row = {
  country_id: string;
  window_key: string;
  window_end: string;
  rank_current: number;
  promesse_id: string;
  party_id: string;
  label: string;
  // Libellé FRANÇAIS de l'enjeu (clé de COULEUR_PAR_LIBELLE), « NA », ou colonne
  // absente : ce n'est PAS une clé d'ISSUE_COLORS (voir scripts/tables.json).
  category?: string | null;
  promesse_text: string;
  announce_date: string;
  release_url: string;
  release_title: string;
  n_mentions: number;
  salience_index: number;
  articles: string; // JSON: [{media_id, title, url}]
  // Horodatage ISO du run qui a publié la ligne. Six runs par jour publient
  // chacun leur instantané sous le MÊME window_end : c'est lui qui départage.
  computed_at?: string | null;
};

// Le dernier instantané d'UNE fenêtre : les lignes du window_end le plus récent,
// puis, parmi elles, celles du run le plus récent (computed_at). Sans ce second
// tri, les six runs quotidiens de la saillance (append, un instantané chacun)
// se superposaient dans l'onglet : la même promesse six fois, six « rang 1 ».
// Dédoublonnage par promesse en filet, pour des lignes sans computed_at.
function dernierInstantane(rows: Row[]): Row[] {
  if (rows.length === 0) return rows;
  const fin = rows.reduce((max, r) => (r.window_end > max ? r.window_end : max), "");
  const duJour = rows.filter((r) => r.window_end === fin);
  const stamp = (r: Row) => String(r.computed_at ?? "");
  const dernier = duJour.reduce((max, r) => (stamp(r) > max ? stamp(r) : max), "");
  const snap = dernier ? duJour.filter((r) => stamp(r) === dernier) : duJour;
  const vus = new Set<string>();
  return snap.filter((r) => {
    if (vus.has(r.promesse_id)) return false;
    vus.add(r.promesse_id);
    return true;
  });
}

// media_id → nom d'affichage. MÊME table que lib/data/polimetre.ts : les deux
// modes du module citent les mêmes cinq médias, ils doivent les nommer pareil.
const MEDIA_BY_ID: Record<string, string> = {
  LAP: "La Presse",
  LED: "Le Devoir",
  JDM: "Le Journal de Montréal",
  TVA: "TVA Nouvelles",
  RCI: "Radio-Canada",
};

const MEDIA_ORDER: string[] = Object.values(MEDIA_BY_ID);
function mediaRank(media: string): number {
  const i = MEDIA_ORDER.indexOf(media);
  return i === -1 ? MEDIA_ORDER.length : i;
}

// Le raffineur écrit la chaîne littérale "NA" quand l'enrichissement LLM n'a pas
// abouti. La traiter comme une valeur afficherait un libellé « NA » dans la liste.
function realText(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t && t.toUpperCase() !== "NA" ? t : null;
}

function cleanText(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function parseArticles(raw: string | null | undefined): ArticleRef[] {
  let arr: { media_id?: string; title?: string; url?: string }[] = [];
  try {
    arr = JSON.parse(raw || "[]") as typeof arr;
  } catch {
    return [];
  }
  const out: ArticleRef[] = [];
  const seen = new Set<string>();
  for (const a of arr) {
    const url = (a?.url ?? "").trim();
    const title = cleanText(a?.title);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    out.push({ media: (a.media_id && MEDIA_BY_ID[a.media_id]) || "Source", title, url });
  }
  // Ordre canonique des médias, comme dans le mode « 2022 » : les clés de
  // récence ne sont pas comparables d'un média à l'autre, donc on n'implique
  // aucune chronologie inter-médias.
  return out.sort(
    (x, y) => mediaRank(x.media) - mediaRank(y.media) || x.media.localeCompare(y.media, "fr"),
  );
}

function toView(r: Row): PromesseNeuveView | null {
  const title = realText(r.label);
  // Une promesse sans libellé court n'est pas affichable : un rang sans titre est
  // pire qu'un rang absent. Le raffineur les écarte déjà, ceci est la ceinture.
  if (!title) return null;
  const verbatim = cleanText(r.promesse_text);
  if (!verbatim) return null;
  // Sans parti émetteur reconnu, pas de promesse. Ce que ce module mesure, c'est
  // la saillance médiatique des promesses formulées dans les communiqués des CINQ
  // partis suivis ; une ligne dont le `party_id` sort de ces cinq ne relève pas de
  // cette mesure et ne doit donc ni s'afficher, ni peser dans le classement.
  const parti = partiKeyFromId(r.party_id);
  if (!parti) return null;

  // Un libellé d'enjeu hors des douze s'afficherait sans couleur. Le raffineur
  // valide déjà le sien ; ceci est la ceinture, comme pour le parti. La
  // différence est le TRAITEMENT : un parti inconnu écarte la promesse (elle ne
  // relève pas de la mesure), un enjeu inconnu lui retire seulement sa puce.
  //
  // C'est le LIBELLÉ FRANÇAIS qui est publié, comme dans le mode « 2022 » — les
  // deux tables disent la même chose de la même façon.
  const brut = realText(r.category);
  const enjeu = brut && brut in COULEUR_PAR_LIBELLE ? brut : null;

  return {
    promesseId: r.promesse_id,
    title,
    verbatim,
    parti,
    enjeu,
    announceDate: String(r.announce_date ?? ""),
    sourceUrl: (r.release_url ?? "").trim(),
    sourceTitle: cleanText(r.release_title),
    salienceIndex: Number(r.salience_index) || 0,
    nMentions: Number(r.n_mentions) || 0,
    articles: parseArticles(r.articles),
  };
}

// Par défaut : la donnée publiée par fetch_data.R. En développement,
// VITRINE_NEUVES_FIXTURES pointe vers un jeu local au même schéma
// (cf. scripts/make_promesses_neuves_fixtures.mjs).
//
// POURQUOI C'EST NÉCESSAIRE ICI. La table `polimetre_promesses_neuves` est
// déclarée `enabled: false` dans scripts/tables.json — le raffineur qui
// l'alimente n'est pas fiable et n'est pas planifié. Le JSON n'existe donc PAS
// sur disque, `loadPromessesNeuves()` rend null, et le second mode du module est
// tout simplement invisible en `npm run dev` : impossible d'y travailler.
// Même motif que VITRINE_PARTIES_FIXTURES (lib/data/parties.ts), pour la même
// raison — une donnée absente ou dégénérée rend un module intravaillable.
// Variable absente ⇒ comportement inchangé.
const SUR_FIXTURES = Boolean(process.env.VITRINE_NEUVES_FIXTURES);

// GARDE-FOU : ces données ne doivent JAMAIS partir en production. Copié sur
// celui de parties.ts, mêmes règles — défaut SÛR (tout ce qui n'est pas
// explicitement « dev » compte comme production), et restreint aux builds de CI
// pour ne pas interdire en local l'usage même auquel les fixtures servent.
if (SUR_FIXTURES && process.env.CI && process.env.NEXT_PUBLIC_SITE_ENV !== "dev") {
  throw new Error(
    "VITRINE_NEUVES_FIXTURES est défini sur un build qui n'est pas le miroir dev " +
      `(NEXT_PUBLIC_SITE_ENV=${process.env.NEXT_PUBLIC_SITE_ENV ?? "<absent>"}). ` +
      "Les promesses de développement sont réservées au dev. " +
      "Retirez la variable, ou posez NEXT_PUBLIC_SITE_ENV=dev si c'est bien un build dev.",
  );
}

export async function loadPromessesNeuves(
  /** Édition passée (#434) : jour de publication de l'édition affichée. */
  asOfIso?: string,
): Promise<PromessesNeuvesData | null> {
  let raw: string;
  try {
    // SUR FIXTURES, ON NE PASSE JAMAIS PAR L'API — même raison que parties.ts :
    // confondre les deux sources ferait apparaître de la vraie donnée sous un
    // bandeau de développement, ou l'inverse.
    raw = SUR_FIXTURES
      ? await fs.readFile(
          path.resolve(process.cwd(), process.env.VITRINE_NEUVES_FIXTURES as string),
          "utf8",
        )
      : await readDatasetText(NEUVES_DATASET);
  } catch {
    return null; // le raffineur n'a pas encore publié (ou fixture introuvable)
  }

  let rows: Row[];
  try {
    rows = (JSON.parse(raw) as Row[]).filter(
      (r) =>
        r &&
        r.country_id === "QC" &&
        (!asOfIso || String(r.window_end ?? "") <= asOfIso),
    );
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  // Un seul instantané : le plus récent. Le raffineur republie la fenêtre
  // entière à chaque run, donc mélanger deux `window_end` compterait deux fois
  // les mêmes promesses.
  // Chaque fenêtre garde SON dernier instantané : `day` est republiée six fois
  // par jour, `week` et `campaign` peuvent dater d'un run antérieur — les couper
  // au window_end de `day` les faisait disparaître dès le lendemain.
  const ranges: Record<NeuveRangeKey, PromesseNeuveView[]> = { day: [], week: [], campaign: [] };
  let windowEnd = "";
  for (const key of NEUVE_RANGE_ORDER) {
    const snap = dernierInstantane(rows.filter((r) => r.window_key === key));
    if (snap.length > 0 && snap[0].window_end > windowEnd) windowEnd = snap[0].window_end;
    ranges[key] = snap
      // rank_current vient du raffineur, qui a déjà tranché les ex æquo (écho
      // médiatique, puis date d'annonce). On le respecte au lieu de reclasser :
      // deux classements concurrents finiraient par diverger en silence.
      .sort((a, b) => (Number(a.rank_current) || 0) - (Number(b.rank_current) || 0))
      .map(toView)
      .filter((v): v is PromesseNeuveView => v !== null)
      .slice(0, KEEP_PER_RANGE);
  }

  if (NEUVE_RANGE_ORDER.every((key) => ranges[key].length === 0)) return null;

  return {
    windowEnd,
    lastUpdated: lastUpdatedLabel(windowEnd),
    ranges,
    fictif: SUR_FIXTURES || undefined,
  };
}
