// Build-time loader for Une des unes, Deux solitudes, and Treemap sections.
//
// Reads /public/data/headline-events.json, deduplicates by event_id
// (preferring QC target_region), filters US-only events, and pre-computes
// every value the UI needs.

import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import { editionLabel } from "@/lib/editions";
import { formatDateFr, lastUpdatedLabel } from "@/lib/dates";

const DATA_PATH = path.resolve(
  process.cwd(),
  "public",
  "data",
  "headline-events.json",
);

// ── Raw JSON shape ──────────────────────────────────────────────────────────

type RawEvent = {
  country_id: string | null;
  date_utc: string;
  time_interval_utc: string;
  date_montreal_tz: string | null;
  time_interval_montreal_tz: string | null;
  event_id: string;
  event_label: string | null;
  representative_url: string | null;
  representative_media_id: string | null;
  score_saillance: number | null;
  score_qc: number | null;
  extracted_objects: string | null;
  media_ids: string;
  outlets_qc: number | null;
  total_outlets_qc: number | null;
  intensity_tier: string | null;
  title: string | null;
  text?: string | null;
  main_issue: string | null;
  main_issue_text_fr: string | null;
  target_region: string | null;
  interval_convergence_score: number | null;
  top_objects_divergence: string | null;
  articles: string | null;
  // Deux solitudes — breakdown régional par événement (radar). Optionnels :
  // score_saillance = score_qc + score_roc + score_us (vérifié empiriquement,
  // cf. #143) — ne jamais dériver le ROC par soustraction, sinon le côté
  // Canada absorbe les USA. Le repli transitoire soustrait tant que score_roc
  // n'est pas publié (≤ 1 rafraîchissement de 4 h après le déploiement de
  // #237). coverage_* et media_ids_qc/roc arrivent avec le refiner #211.
  score_roc?: number | null;
  score_us?: number | null;
  coverage_qc_in_can?: number | null;
  coverage_can_in_qc?: number | null;
  media_ids_qc?: string | null;
  media_ids_roc?: string | null;
  // Agrégats 24h par storyline (aws-refiners#195 phase B, PR #199) — optionnels :
  // absents des lignes publiées avant le 2026-07-10 (Athena renvoie null).
  storyline_id?: string | null;
  media_ids_24h?: string | null;
  articles_24h?: string | null;
  score_qc_peak_24h?: number | null;
  first_seen_utc?: string | null;
  n_blocks_24h?: number | null;
};

type ExtractedObject = { object: string; score: number };

const ISSUE_COLORS: Record<string, string> = {
  economy_and_labour: "#742630",
  governments_and_governance: "#6F5828",
  health_and_social_services: "#7D5358",
  environment_and_energy: "#5F6E36",
  rights_liberties_minorities_discrimination: "#5F4E78",
  culture_and_nationalism: "#35604E",
  education: "#7A5A23",
  international_affairs_and_defense: "#304860",
  law_and_crime: "#463E3E",
  public_lands_and_agriculture: "#7D5132",
  immigration: "#8B6914",
  technology: "#3A5F70",
};

const ISSUE_LABELS_SHORT: Record<string, string> = {
  economy_and_labour: "Économie et travail",
  governments_and_governance: "Gouvernements",
  health_and_social_services: "Santé",
  environment_and_energy: "Environnement",
  rights_liberties_minorities_discrimination: "Droits et libertés",
  culture_and_nationalism: "Culture",
  education: "Éducation",
  international_affairs_and_defense: "Aff. internationales",
  law_and_crime: "Loi et crime",
  public_lands_and_agriculture: "Terres publiques",
  immigration: "Immigration",
  technology: "Technologie",
};

const MEDIA_NAMES: Record<string, string> = {
  LED: "Le Devoir",
  LAP: "La Presse",
  RCI: "Radio-Canada",
  TVA: "TVA Nouvelles",
  JDM: "Journal de Montréal",
  MG: "Montreal Gazette",
  CBC: "CBC",
  CTV: "CTV News",
  GN: "Global News",
  TTS: "Toronto Star",
  GAM: "The Globe and Mail",
  NP: "National Post",
  VS: "Vancouver Sun",
};

// Sigle court affiché dans le badge carré du radar (Deux solitudes).
const MEDIA_BADGE: Record<string, string> = {
  LED: "LD", LAP: "LP", RCI: "RC", TVA: "TVA", JDM: "JdM", MG: "MG",
  CBC: "CBC", CTV: "CTV", GN: "GN", TTS: "TS", GAM: "GM", NP: "NP", VS: "VS",
};

const QC_MEDIA = ["LED", "LAP", "RCI", "TVA", "JDM", "MG"];
// Médias US — exclus du côté « Canada » dans le repli transitoire (avant que
// media_ids_roc soit publié par le refiner #211) pour ne pas afficher une
// source américaine comme canadienne.
const US_MEDIA = ["FXN", "CNN", "NYT", "WAP", "FOX"];

// ── Deux solitudes — calibration de la JAUGE de convergence (échelle relative) ─
// L'axe du radar utilise une part d'attention 24 h (voir buildSolitudes), pas de
// calibration. Seule la jauge « plus/moins que d'habitude » a besoin d'une
// distribution : CAL_CONV mappe l'indice de convergence (0-100) vers son
// percentile. PROVISOIRE — dérivée des bandes 13 mois du red-team (Divergence
// 63 % · Div. part. 17 % · Conv. part. 13 % · Convergence 7 %, médiane 14) :
// conv=14→p50, 25→p63, 50→p80, 75→p93. À recalibrer sur données réelles une fois
// le refiner #211 déployé, puis remplacer par la publication glissante (#212).
const CAL_CONV: [number, number][] = [[0, 0], [14, 50], [25, 63], [50, 80], [75, 93], [100, 100]];

function pctile(v: number, cal: [number, number][]): number {
  if (!(v > 0)) return 0;
  for (let i = 1; i < cal.length; i++) {
    if (v <= cal[i][0]) {
      const [x0, y0] = cal[i - 1], [x1, y1] = cal[i];
      return y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 100;
}

// Saillance ROC (Canada hors Québec, sans les USA). Repli par soustraction
// UNIQUEMENT tant que la colonne score_roc n'est pas publiée (≤ 1 rafraîchissement
// de 4 h après #237) : on soustrait score_qc ET score_us (quand dispo) pour ne
// PAS réabsorber les USA côté Canada. À retirer une fois score_roc publié.
function rocScore(e: RawEvent): number {
  return e.score_roc ?? Math.max(0, (e.score_saillance ?? 0) - (e.score_qc ?? 0) - (e.score_us ?? 0));
}

// Positions des symboles sur l'axe : collés au centre quand ça converge,
// aux extrémités quand ça diverge. gap min 18 % pour ne pas les superposer.
function symbolPositions(convPct: number): [number, number] {
  const div = 100 - convPct;
  const gap = 18 + 72 * Math.pow(div / 100, 1.4);
  return [50 - gap / 2, 50 + gap / 2];
}

// 4 niveaux symétriques sur la convergence (seuils 25/50/75). Le mot et la
// couleur pilotent le grand chiffre. Cf. red-team + design de la maquette.
function convMode(convPct: number): { word: string; cls: string } {
  if (convPct < 25) return { word: "Divergence", cls: "mode-div" };
  if (convPct < 50) return { word: "Divergence partielle", cls: "mode-divp" };
  if (convPct < 75) return { word: "Convergence partielle", cls: "mode-convp" };
  return { word: "Convergence", cls: "mode-con" };
}

// Phrase éditoriale : GABARITS FINIS choisis par règles (aucun LLM en prod),
// conformes au skill redaction-editoriale (mêmes « sujets », pas de tiret
// cadratin, formulation honnête). `shared` = nb de sujets du radar couverts
// des deux côtés.
function solitudesEdito(convPct: number, shared: number): string {
  if (convPct < 25) {
    return shared === 0
      ? "Aucun sujet ne figure à la fois parmi les Unes québécoises et canadiennes de ce bloc. Deux conversations parallèles."
      : "Pendant ce bloc, les médias québécois et canadiens ont mis l'accent sur des sujets presque entièrement différents.";
  }
  if (convPct < 50) {
    return "Quelques grandes histoires traversent la frontière ; le reste des deux agendas se croise à peine.";
  }
  if (convPct < 75) {
    return "Une bonne partie de l'actualité est suivie des deux côtés, chacun avec ses propres mots.";
  }
  return "Fait rare : les deux espaces médiatiques mettent de l'avant surtout les mêmes sujets.";
}

// Clé de bloc triable (date + heure de début du créneau 4h).
function blockKey(e: RawEvent): string {
  const start = (e.time_interval_utc ?? "").split("-")[0].padStart(2, "0");
  return `${e.date_utc}T${start}`;
}

// Signature de titre pour la dédup cross-langue (stopgap aws-refiners#213) :
// tokens significatifs (sans accents, stopwords FR/EN, mots courts).
const TITLE_STOP = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "et", "ou", "en",
  "sur", "pour", "dans", "par", "avec", "sans", "sous", "vers", "chez", "que", "qui",
  "the", "and", "for", "with", "from", "that", "this", "into", "over", "after",
]);
function titleTokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !TITLE_STOP.has(w)),
  );
}
// Deux titres décrivent la même histoire s'ils partagent AU MOINS 3 tokens
// significatifs ET un Jaccard ≥ 0,4. Le minimum de 3 évite de fusionner deux
// sujets sans rapport qui partageraient un seul mot commun.
function sameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 3 || b.size < 3) return false;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (inter < 3) return false;
  return inter / (a.size + b.size - inter) >= 0.4;
}

// Construit tout l'état du module « Deux solitudes » (radar + jauge + édito).
// `latest` = événements du bloc courant (pour l'indice de convergence) ;
// `allEvents` = tous les blocs publiés (3 jours), pour agréger la part
// d'attention sur la fenêtre glissante de 24 h.
function buildSolitudes(latest: RawEvent[], allEvents: RawEvent[]): SolitudeData {
  // Indice de convergence OBJET (0-100), publié sur les lignes QC/CAN par le
  // refiner (#211). Repli sur l'exclusivité pondérée tant qu'il est absent.
  const qcRow = latest.find((e) => e.country_id === "QC" || e.country_id === "CAN");
  const rawConvergence = qcRow?.interval_convergence_score ?? null;
  let convPct: number;
  if (rawConvergence !== null) {
    convPct = Math.max(0, Math.min(100, rawConvergence));
  } else {
    const withScore = latest.filter((e) => (e.score_qc ?? 0) + rocScore(e) > 0);
    const total = withScore.reduce((s, e) => s + (e.score_qc ?? 0) + rocScore(e), 0);
    const excl = withScore.reduce((s, e) => {
      const q = e.score_qc ?? 0, tot = q + rocScore(e);
      return s + tot * Math.abs((tot > 0 ? q / tot : 0) - 0.5) * 2;
    }, 0);
    convPct = total > 0 ? Math.round(100 - (excl / total) * 100) : 0;
  }
  const divPct = Math.max(0, Math.min(100, 100 - convPct));
  const relPct = Math.round(pctile(convPct, CAL_CONV));
  const mode = convMode(convPct);
  const [qcSymbolPos, canSymbolPos] = symbolPositions(convPct);

  // Résolution des liens par média (dernier article sur la storyline si dispo,
  type RawArticle = { media_id: string; url: string };
  const parseIds = (json: string | null | undefined): string[] => {
    try {
      const p = JSON.parse(json ?? "[]");
      return Array.isArray(p) ? (p as string[]) : [];
    } catch { return []; }
  };

  // ── Fenêtre glissante 24 h : part d'attention par histoire ────────────────
  // On agrège la saillance par storyline sur les 6 blocs de 4h les plus récents
  // (= 24 h), pour chaque région. La valeur radiale d'un sujet est sa part
  // rapportée au sujet le plus couvert de sa région (le plus gros du jour touche
  // le bord). Même fenêtre 24 h que le suivi de la Une des Unes → les deux
  // modules montrent les mêmes histoires, comparables.
  const blocks = Array.from(new Set(allEvents.map(blockKey))).sort().reverse();
  const window24h = new Set(blocks.slice(0, 6));
  const windowEvents = allEvents.filter((e) => window24h.has(blockKey(e)));

  // Accumule, par storyline, la saillance + les médias/URLs par région (union
  // sur tous les blocs 24 h) et un jeu de tokens de titre pour la dédup.
  type Agg = {
    label: string; repKey: string; qc: number; roc: number;
    qcMedia: Set<string>; canMedia: Set<string>;
    urlByMedia: Record<string, string>; tok: Set<string>;
  };
  const byStory = new Map<string, Agg>();
  for (const e of windowEvents) {
    if (!e.title) continue;
    const key = e.storyline_id ?? e.event_label ?? e.event_id;
    const bk = blockKey(e);
    const qcIds = e.media_ids_qc !== undefined
      ? parseIds(e.media_ids_qc)
      : parseIds(e.media_ids).filter((id) => QC_MEDIA.includes(id));
    const canIds = e.media_ids_roc !== undefined
      ? parseIds(e.media_ids_roc)
      : parseIds(e.media_ids).filter((id) => !QC_MEDIA.includes(id) && !US_MEDIA.includes(id));
    let cur = byStory.get(key);
    if (!cur) {
      cur = { label: e.title ?? "", repKey: bk, qc: 0, roc: 0,
        qcMedia: new Set(), canMedia: new Set(), urlByMedia: {}, tok: titleTokens(e.title ?? "") };
      byStory.set(key, cur);
    }
    cur.qc += e.score_qc ?? 0;
    cur.roc += rocScore(e);
    qcIds.forEach((id) => cur!.qcMedia.add(id));
    canIds.forEach((id) => cur!.canMedia.add(id));
    for (const k of ["articles_24h", "articles"] as const) {
      try {
        const parsed = JSON.parse((e[k] as string) ?? "[]");
        if (Array.isArray(parsed)) for (const a of parsed as RawArticle[]) {
          if (a.media_id && a.url && !cur.urlByMedia[a.media_id]) cur.urlByMedia[a.media_id] = a.url;
        }
      } catch { /* champ absent ou malformé */ }
    }
    // Représentant = titre/tokens du bloc le plus récent.
    if (bk > cur.repKey) { cur.repKey = bk; cur.label = e.title ?? ""; cur.tok = titleTokens(e.title ?? ""); }
  }

  // Dédup cross-langue (STOPGAP, aws-refiners#213) : le refiner scinde parfois
  // une histoire en plusieurs storylines (cadrage FR/EN). On fusionne celles
  // dont les titres se recoupent fortement (Jaccard ≥ 0,5), en additionnant la
  // saillance et l'union des médias — ce qui corrige aussi la divergence
  // artificielle (une histoire QC-only + sa version CAN-only redeviennent une
  // seule histoire couverte des deux côtés).
  const merged: Agg[] = [];
  for (const a of Array.from(byStory.values()).sort((x, y) => y.qc + y.roc - (x.qc + x.roc))) {
    const host = merged.find((m) => sameStory(m.tok, a.tok));
    if (host) {
      host.qc += a.qc; host.roc += a.roc;
      a.qcMedia.forEach((id) => host.qcMedia.add(id));
      a.canMedia.forEach((id) => host.canMedia.add(id));
      for (const [id, url] of Object.entries(a.urlByMedia)) if (!host.urlByMedia[id]) host.urlByMedia[id] = url;
    } else {
      merged.push(a);
    }
  }

  const aggs = merged.filter((a) => a.qc + a.roc > 0);
  const totalQc = aggs.reduce((s, a) => s + a.qc, 0);
  const totalRoc = aggs.reduce((s, a) => s + a.roc, 0);
  const maxQc = Math.max(...aggs.map((a) => a.qc), 1);
  const maxRoc = Math.max(...aggs.map((a) => a.roc), 1);

  // Sélection ÉQUILIBRÉE : union du top-3 québécois et du top-3 canadien, pour
  // que les deux agendas soient représentés (sinon le Canada, à l'échelle 2,8×
  // plus grande, monopolise les 6 axes — cf. observation d'Adrien 2026-07-14).
  const topQc = [...aggs].sort((a, b) => b.qc - a.qc).slice(0, 3);
  const topRoc = [...aggs].sort((a, b) => b.roc - a.roc).slice(0, 3);
  const picked: Agg[] = [];
  for (const a of [...topQc, ...topRoc]) if (!picked.includes(a)) picked.push(a);
  // Complète jusqu'à 6 par saillance combinée si l'union en donne moins.
  for (const a of [...aggs].sort((x, y) => y.qc + y.roc - (x.qc + x.roc))) {
    if (picked.length >= 6) break;
    if (!picked.includes(a)) picked.push(a);
  }

  const buildMediaFor = (a: Agg): SolitudeAxis["media"] => {
    const mk = (id: string, region: "qc" | "can") => ({
      id, name: MEDIA_NAMES[id] ?? id, badge: MEDIA_BADGE[id] ?? id,
      url: a.urlByMedia[id] ?? null, region,
    });
    return [
      ...[...a.qcMedia].map((id) => mk(id, "qc" as const)),
      ...[...a.canMedia].map((id) => mk(id, "can" as const)),
    ];
  };

  const axes: SolitudeAxis[] = picked.map((a) => {
    const qcRadial = Math.round((a.qc / maxQc) * 100);
    const canRadial = Math.round((a.roc / maxRoc) * 100);
    return {
      label: a.label,
      qcRadial, canRadial,
      qcShare: totalQc > 0 ? Math.round((a.qc / totalQc) * 100) : 0,
      canShare: totalRoc > 0 ? Math.round((a.roc / totalRoc) * 100) : 0,
      side: (qcRadial >= canRadial ? "qc" : "can") as "qc" | "can",
      media: buildMediaFor(a),
    };
  });

  const shared = axes.filter((a) => a.qcRadial > 0 && a.canRadial > 0).length;

  return {
    divPct, convPct,
    scoreValue: convPct < 50 ? divPct : convPct,
    verb: convPct < 50 ? "divergence" : "convergence",
    modeWord: mode.word, modeCls: mode.cls,
    relPct,
    coverageQcInCan: qcRow?.coverage_qc_in_can ?? null,
    coverageCanInQc: qcRow?.coverage_can_in_qc ?? null,
    edito: solitudesEdito(convPct, shared),
    qcSymbolPos, canSymbolPos,
    axes,
  };
}

// Étiquette de saillance par percentiles SYMÉTRIQUES du score_qc (cf. #35) :
// autant de « Très faible » que d'« Exceptionnelle », le gros au centre (courbe en
// cloche sur échelle log). Bandes p5/p20/p50/p80/p95 = 5/15/30/30/15/5 %.
// Labels : Très faible, Faible, Modérée, Élevée, Très élevée, Exceptionnelle
// (la médiane tombe entre Modérée et Élevée ; aucune bande ne prétend être
// « la moyenne »).
// Seuils recalibrés sur TOUTE la donnée disponible (table headline_events_4h
// depuis le 2026-05-14, fenêtre qui s'étend). Recalibrage du 2026-06-03 sur
// 406 Unes : p5/p20/p50/p80/p95 = 5/10/19/36/71. Illustration pédago dans
// public/methodologie/ (et docs/). TODO(#122) : calcul glissant dans le
// refiner pour ne plus hardcoder ici.
const SAL_QC_THRESHOLDS = { faible: 5, moyenne: 10, eleve: 19, tresEleve: 36, extreme: 71 };

// `rank` (1–6) pilote aussi la taille du titre (data-saillance) : la hiérarchie
// visuelle reflète la saillance, plus le nombre de médias.
// `hint` : explication relative du niveau. Le cadrage BASCULE à la médiane pour
// garder un % toujours grand et parlant : sous la médiane on compte ce qui
// DÉPASSE la nouvelle (« X % … sont plus saillantes que celle-ci »), au-dessus on
// compte ce qu'elle dépasse (« Plus saillante que X % … »). Toutes les nouvelles
// ici ont fait la Une. Affiché en infobulle sur chaque tag + visible sous le hero.
function saillanceTierFromScore(scoreQc: number | null): { label: string; cls: string; rank: number; hint: string } {
  const s = scoreQc ?? 0;
  if (s >= SAL_QC_THRESHOLDS.extreme)   return { label: "Exceptionnelle",     cls: "s-extreme",     rank: 6, hint: "Plus saillante que 95 % des nouvelles à la Une." };
  if (s >= SAL_QC_THRESHOLDS.tresEleve) return { label: "Très élevée", cls: "s-tres-eleve",  rank: 5, hint: "Plus saillante qu’environ 85 % des nouvelles à la Une." };
  if (s >= SAL_QC_THRESHOLDS.eleve)     return { label: "Élevée",      cls: "s-eleve",       rank: 4, hint: "Plus saillante qu’environ 65 % des nouvelles à la Une." };
  // « Modérée » (et non « Moyenne ») : cette bande (p20-p50) est ENTIÈREMENT sous
  // la médiane ; avec 6 bandes paires, aucune n'EST le centre. Éviter « Moyenne »,
  // qui laisse croire à tort que c'est le niveau typique (retour M-A Martel, #35).
  // Le `cls` reste s-moyenne (le CSS s'appuie dessus, label ≠ classe).
  if (s >= SAL_QC_THRESHOLDS.moyenne)   return { label: "Modérée",     cls: "s-moyenne",     rank: 3, hint: "Environ 65 % des nouvelles à la Une sont plus saillantes que celle-ci." };
  if (s >= SAL_QC_THRESHOLDS.faible)    return { label: "Faible",      cls: "s-faible",      rank: 2, hint: "Environ 85 % des nouvelles à la Une sont plus saillantes que celle-ci." };
  return { label: "Très faible", cls: "s-tres-faible", rank: 1, hint: "95 % des nouvelles à la Une sont plus saillantes que celle-ci." };
}

// Dédup storyline-aware (#231, ancien signalement #211 « la 1re et la 2e
// nouvelle sont la même ») : le clustering amont peut scinder une même histoire
// en deux événements du même bloc, et la garantie « 3 cartes par bloc/pays » du
// refiner peut réintroduire un quasi-doublon pourtant détecté. On garde la
// première occurrence (la plus saillante — la liste arrive triée par score_qc
// décroissant). Un storyline_id absent (lignes antérieures au 2026-07-10)
// n'est jamais traité comme doublon : deux lignes sans storyline sont gardées.
function dedupeByStoryline<T extends { storyline_id?: string | null }>(events: T[]): T[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.storyline_id) return true;
    if (seen.has(e.storyline_id)) return false;
    seen.add(e.storyline_id);
    return true;
  });
}

const UPDATE_HOURS_MTL = [0, 4, 8, 12, 16, 20];
const SAILLANT_TODAY: Record<number, string> = {
  0: "cette nuit", 4: "tôt ce matin", 8: "ce matin",
  12: "ce midi", 16: "cet après-midi", 20: "ce soir",
};
const SAILLANT_YESTERDAY: Record<number, string> = {
  0: "cette nuit", 4: "hier, avant l’aube", 8: "hier matin",
  12: "hier midi", 16: "hier après-midi", 20: "hier soir",
};

// Conversion UTC → Montréal sans dépendance : Intl gère EDT/EST.
const MTL_DATE_HOUR_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montreal",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});

function mtlDateAndHour(d: Date): { dateIso: string; hour: number } {
  const parts = MTL_DATE_HOUR_FMT.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    dateIso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

// Jour UTC entier d'une date ISO « YYYY-MM-DD » — pour compter des écarts de
// jours calendaires sans passer par le fuseau de la machine de build.
function isoDay(dateIso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso ?? "");
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

// « ce matin, 8 h » (#126) — version EXACTE : `first_seen_utc` (début du premier
// bloc 4h où la storyline figurait parmi les Unes saillantes, cf.
// aws-refiners#195 phase B) converti en heure de Montréal. « aujourd'hui/hier »
// est relatif à la DATE DU BLOC affiché (date_montreal_tz), pas à l'heure du
// build — le libellé reste juste même si le site est reconstruit en retard.
// Au-delà d'hier : date en toutes lettres. L'heure est arrondie à l'édition la
// plus proche (les blocs tombent pile sur les éditions en EDT, à 1 h près en EST).
function firstSeenSaillantLabel(firstSeenUtc: string | null | undefined, blockDateMtl: string | null): string | null {
  if (!firstSeenUtc || !blockDateMtl) return null;
  const t = new Date(firstSeenUtc);
  if (Number.isNaN(t.getTime())) return null;
  const { dateIso, hour } = mtlDateAndHour(t);
  const seenDay = isoDay(dateIso);
  const blockDay = isoDay(blockDateMtl);
  if (seenDay === null || blockDay === null) return null;
  const snapped = UPDATE_HOURS_MTL.reduce(
    (p, c) => (Math.abs(c - hour) <= Math.abs(p - hour) ? c : p),
    UPDATE_HOURS_MTL[0],
  );
  const dayDiff = blockDay - seenDay;
  // Espace fine insécable avant « h » (norme typographique française).
  if (dayDiff <= 0) return `${SAILLANT_TODAY[snapped]}, ${snapped} h`;
  if (dayDiff === 1) return `${SAILLANT_YESTERDAY[snapped]}, ${snapped} h`;
  const dateFr = formatDateFr(dateIso);
  return `le ${dateFr.charAt(0).toLowerCase()}${dateFr.slice(1)}`;
}

// Estimation historique (#126) : début de saillance déduit du bloc 4h courant
// et de la durée en Une. Conservée en SECOURS pour les lignes sans
// `first_seen_utc` (données antérieures au 2026-07-10).
function saillantSinceLabel(timeIntervalMtl: string | null, headlineHours: number | null): string | null {
  if (!headlineHours || headlineHours <= 0) return null;
  const blockStart = parseInt((timeIntervalMtl ?? "").split("-")[0] ?? "", 10);
  if (Number.isNaN(blockStart)) return null;
  const raw = blockStart - headlineHours;
  const yesterday = raw < 0;
  const start = ((raw % 24) + 24) % 24;
  const snapped = UPDATE_HOURS_MTL.reduce(
    (p, c) => (Math.abs(c - start) <= Math.abs(p - start) ? c : p),
    UPDATE_HOURS_MTL[0],
  );
  const part = (yesterday ? SAILLANT_YESTERDAY : SAILLANT_TODAY)[snapped];
  // Espace fine insécable avant « h » (norme typographique française).
  return `${part}, ${snapped} h`;
}

// Label de période pour la section (#125) : change selon le bloc 4h courant.
// « Les Unes saillantes de la soirée / du matin / … ».
function periodLabelFromInterval(intervalMtl: string): string {
  const start = parseInt((intervalMtl ?? "").split("-")[0] ?? "", 10);
  if (Number.isNaN(start)) return "du jour";
  // Table partagée avec PulseCountdown (client) — cf. lib/editions.ts.
  return editionLabel(start);
}

export type UneEvent = {
  title: string;
  /** Lead synthétique généré par le refiner (colonne `text`) — affiché sous la 1re Une. */
  excerpt: string | null;
  issueFr: string;
  issueColor: string;
  /** Rang de saillance 1–6 (Très faible→1 … Exceptionnelle→6) — pilote la taille du titre. */
  saillanceRank: number;
  saillanceLabel: string;
  saillanceCls: string;
  /** Explication relative du niveau, en pourcentage (cf. saillanceTierFromScore). */
  saillanceHint: string;
  timeMtl: string;
  headlineHours: number | null;
  /** « ce matin, 8 h » — moment depuis lequel l'événement est saillant (#126).
   *  Exact (first_seen_utc) quand la donnée 24h existe, sinon estimation. */
  saillantSince: string | null;
  representativeUrl: string | null;
  /** Union 24h des médias QC ayant mis la storyline en Une (media_ids_24h,
   *  #213/#215/#51) — remplace l'ancienne liste limitée au bloc courant ;
   *  retombe sur les médias du bloc courant si la donnée 24h manque
   *  (lignes antérieures au 2026-07-10). */
  mediaToday: { name: string; url: string | null }[];
  mediaAbsent: string[];
  qcOutletCount: number;
  totalQcOutlets: number;
  /** Identifiant de suivi cross-blocs (Jaccard 0.30, lookback 24h). */
  storylineId: string | null;
  /** Pic de score_qc sur la fenêtre 24h — base de l'étiquette phase C (#122). */
  scoreQcPeak24h: number | null;
  /** Nombre de blocs 4h (≤ 7) où la storyline figurait parmi les Unes. */
  nBlocks24h: number | null;
};

/** Un axe du radar « Deux solitudes » = une histoire saillante du jour. */
export type SolitudeAxis = {
  /** Titre FR de l'histoire (storyline). */
  label: string;
  /** Valeur radiale de dessin (0-100) : part de l'attention 24h de la région
   *  rapportée au sujet le plus couvert de cette région (le plus gros sujet du
   *  jour touche le bord). Rend les deux formes comparables malgré l'écart
   *  d'échelle QC/ROC. */
  qcRadial: number;
  canRadial: number;
  /** Part réelle de l'attention 24h de la région (%), pour l'infobulle. */
  qcShare: number;
  canShare: number;
  /** Camp dominant (couleur du libellé). */
  side: "qc" | "can";
  /** Médias couvrants + lien vers leur dernier article sur le sujet.
   *  `region` colore la pastille (bleu QC / rouge CAN) : un sujet couvert des
   *  deux côtés montre les deux couleurs. */
  media: { id: string; name: string; badge: string; url: string | null; region: "qc" | "can" }[];
};

export type SolitudeData = {
  /** Divergence affichée (0-100) = 100 − convergence. */
  divPct: number;
  convPct: number;
  /** Le grand chiffre + son verbe (« divergence » / « convergence »). */
  scoreValue: number;
  verb: "divergence" | "convergence";
  /** Niveau + classe de couleur (4 seuils 25/50/75 sur la convergence). */
  modeWord: string;
  modeCls: string;
  /** Percentile de convergence dans la distribution des blocs (position de la
   *  jauge « plus divergent / habituel / plus convergent »). */
  relPct: number;
  /** Mesure asymétrique « qui suit qui » (refiner #211) — null tant que non déployé. */
  coverageQcInCan: number | null;
  coverageCanInQc: number | null;
  /** Phrase éditoriale (gabarit fini, choisi par règles — pas de LLM). */
  edito: string;
  /** Positions de la fleur-de-lys et de l'érable sur l'axe (%). */
  qcSymbolPos: number;
  canSymbolPos: number;
  axes: SolitudeAxis[];
};

export type TreemapTile = {
  name: string;
  enjeu: string;
  color: string;
  context: string;
};

export type TreemapIssueTile = {
  issueKey: string;
  issueFr: string;
  color: string;
  score: number;
  relScore: number;
  topObject: string;
  context: string;
  url: string | null;
};

export type TreemapPeriodData = {
  tiles: TreemapIssueTile[];
  dateLabel: string;
  /** « Dernière mise à jour : mercredi 8 juillet 2026 » — table journalière, pas d'heure. */
  lastUpdated: string;
};

export type TreemapAllPeriods = {
  day: TreemapPeriodData;
  week: TreemapPeriodData;
  month: TreemapPeriodData;
};

export type HeadlineData = {
  dateLabel: string;
  /** « Dernière mise à jour : mercredi 8 juillet 2026, 16 h » — date + fin du
   *  bloc 4h de la donnée la plus récente (cf. lib/dates.ts). Affiché en bas à
   *  droite des modules Une des unes ET Deux solitudes (même table). */
  lastUpdated: string;
  snapshotInterval: string;
  /** « de la soirée », « du matin »… selon le bloc 4h (#125). */
  periodLabel: string;
  top3: UneEvent[];
  solitudes: SolitudeData;
  treemapTier1: TreemapTile[];
  treemapTier2: TreemapTile[];
  treemapTier3: TreemapTile[];
  treemapTier4: TreemapTile[];
  treemapMobile: (TreemapTile & { relWidth: number })[];
};

// cache() : le snapshot est lu par plusieurs consommateurs du même rendu
// (Home pour periodLabel, UneDesUnesSection pour le contenu) — une seule
// lecture/parse par build au lieu d'une par appel.
export const loadHeadlineEvents = cache(async (): Promise<HeadlineData | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_PATH, "utf8");
  } catch {
    return null;
  }

  const all = JSON.parse(raw) as RawEvent[];

  const byId = new Map<string, RawEvent>();
  for (const e of all) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") {
      byId.set(e.event_id, e);
    }
  }
  const unique = Array.from(byId.values()).filter((e) => e.country_id !== "USA");

  if (unique.length === 0) return null;

  const sorted = unique.slice().sort((a, b) => {
    const dA = `${a.date_utc}T${a.time_interval_utc.split("-")[0]}:00Z`;
    const dB = `${b.date_utc}T${b.time_interval_utc.split("-")[0]}:00Z`;
    return dB.localeCompare(dA);
  });
  const latestDate = sorted[0].date_utc;
  const latestInterval = sorted[0].time_interval_utc;
  const latest = sorted.filter(
    (e) => e.date_utc === latestDate && e.time_interval_utc === latestInterval,
  );

  const dateLabel = formatDateFr(sorted[0].date_montreal_tz ?? sorted[0].date_utc);
  const snapshotInterval = sorted[0].time_interval_montreal_tz ?? sorted[0].time_interval_utc;
  const periodLabel = periodLabelFromInterval(snapshotInterval);
  // Le tag public affiche l'HEURE DE PUBLICATION, pas la fin du bloc de données.
  // Réforme #195 : le bloc de données 15-19 est servi à 20 h (après ~1 h de
  // pipeline), donc heure de publication = fin du bloc + 1 h. Les gens voient
  // « 20 h » (l'heure où c'est en ligne) ; la fenêtre de données 15-19 n'est
  // expliquée que dans la Méthodologie. « 19-23 » → 23 + 1 = 24 → « minuit »
  // (géré par lastUpdatedLabel ≥ 24) ; « 23-03 » → 3 + 1 = 4 → « 4 h ».
  const blockEnd = parseInt((snapshotInterval ?? "").split("-")[1] ?? "", 10);
  const publicationHour = Number.isNaN(blockEnd) ? null : blockEnd + 1;
  const lastUpdated = lastUpdatedLabel(
    sorted[0].date_montreal_tz ?? sorted[0].date_utc,
    publicationHour,
  );

  // Unes du QUÉBEC seulement : au moins un média QC doit avoir mis l'histoire
  // en Une (outlets_qc > 0). Sans ce filtre, la dédup storyline libère des
  // places que le tri par score_qc comble avec des cartes ROC à score
  // québécois ≈ 0 (« Très faible ») — vu sur le bloc du 2026-07-07 20-24
  // (décès de Marc Messier : 3 cartes QC = 1 storyline). Avant la dédup le
  // problème était invisible : les 3 cartes QC occupaient toujours le top-3.
  const withTitles = latest
    .filter((e) => e.title && (e.outlets_qc ?? 0) > 0)
    .sort((a, b) =>
      (b.score_qc ?? 0) - (a.score_qc ?? 0) ||
      (b.score_saillance ?? 0) - (a.score_saillance ?? 0),
    );

  // Dédup AVANT la coupe du top-3 : si le bloc contenait un doublon en 4e
  // position, l'événement distinct suivant serait promu. En pratique la table
  // ne publie que 3 cartes par bloc/pays : un doublon éliminé donne 1-2 Unes —
  // la mise en page s'adapte (1 à 3 Unes, cf. UneDesUnesSection / #124).
  const top3: UneEvent[] = dedupeByStoryline(withTitles).slice(0, 3).map((e) => {
    const { label: saillanceLabel, cls: saillanceCls, rank: saillanceRank, hint: saillanceHint } = saillanceTierFromScore(e.score_qc);
    const qcOutletCount = e.outlets_qc ?? 0;
    const totalQcOutlets = e.total_outlets_qc ?? 6;
    let mediaIds: string[] = [];
    try { mediaIds = JSON.parse(e.media_ids) as string[]; } catch { }
    type RawArticle = { media_id: string; url: string; headline_minutes?: number | null };
    const mediaIdToUrl: Record<string, string> = {};
    let totalHeadlineMinutes = 0;
    try {
      const arts = JSON.parse(e.articles ?? "[]") as RawArticle[];
      for (const art of arts) {
        if (art.media_id && art.url && !mediaIdToUrl[art.media_id]) {
          mediaIdToUrl[art.media_id] = art.url;
        }
        const mins = Number(art.headline_minutes ?? 0);
        if (Number.isFinite(mins) && mins > 0) {
          totalHeadlineMinutes += mins;
        }
      }
    } catch { }
    const excerpt = e.text?.trim() || null;
    const headlineHours =
      totalHeadlineMinutes > 0
        ? Math.max(1, Math.round(totalHeadlineMinutes / 60))
        : null;
    // Exact (first_seen_utc) si la donnée 24h existe, sinon l'estimation historique.
    const saillantSince =
      firstSeenSaillantLabel(e.first_seen_utc, e.date_montreal_tz) ??
      saillantSinceLabel(e.time_interval_montreal_tz ?? null, headlineHours);

    // Fenêtre 24h (aws-refiners#195 phase B) : union des médias + dernier
    // article par média (articles_24h est déjà dédupliqué par le refiner,
    // du bloc le plus récent au plus ancien).
    // JSON.parse("null") ou un objet ne lèvent pas d'exception : on exige un
    // tableau explicitement, sinon .length/.includes/for..of planteraient au build.
    let mediaIds24h: string[] = [];
    try {
      const parsed = JSON.parse(e.media_ids_24h ?? "[]");
      if (Array.isArray(parsed)) mediaIds24h = parsed as string[];
    } catch { }
    const latestUrlByMedia: Record<string, string> = {};
    try {
      const parsed = JSON.parse(e.articles_24h ?? "[]");
      const arts24 = Array.isArray(parsed) ? (parsed as RawArticle[]) : [];
      for (const art of arts24) {
        if (art.media_id && art.url && !latestUrlByMedia[art.media_id]) {
          latestUrlByMedia[art.media_id] = art.url;
        }
      }
    } catch { }
    // Lien média = dernier article mis en Une par CE média sur la storyline,
    // même s'il vient d'un bloc précédent (#129) ; secours : article du bloc.
    const urlFor = (id: string) => latestUrlByMedia[id] ?? mediaIdToUrl[id] ?? null;
    const union24h = mediaIds24h.length > 0 ? mediaIds24h : mediaIds;

    // QC media seulement (Shannon: "Médias Qc seulement", "Supprimer ROC, US pour les deux")
    const mediaToday = QC_MEDIA.filter((id) => union24h.includes(id)).map(
      (id) => ({ name: MEDIA_NAMES[id] ?? id, url: urlFor(id) }),
    );
    // « Absent de la Une sur » = jamais mis en Une sur TOUTE la fenêtre 24h
    // (#129) — plus juste que l'absence du seul bloc courant.
    const mediaAbsent = QC_MEDIA.filter((id) => !union24h.includes(id)).map(
      (id) => MEDIA_NAMES[id] ?? id,
    );
    return {
      title: e.title ?? "",
      excerpt,
      issueFr: e.main_issue_text_fr ?? ISSUE_LABELS_SHORT[e.main_issue ?? ""] ?? "Actualité",
      issueColor: ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E",
      saillanceRank,
      saillanceLabel,
      saillanceCls,
      saillanceHint,
      timeMtl: e.time_interval_montreal_tz ?? e.time_interval_utc,
      headlineHours,
      saillantSince,
      representativeUrl: e.representative_url ?? null,
      mediaToday,
      mediaAbsent,
      qcOutletCount,
      totalQcOutlets,
      storylineId: e.storyline_id ?? null,
      scoreQcPeak24h: e.score_qc_peak_24h ?? null,
      nBlocks24h: e.n_blocks_24h ?? null,
    };
  });

  const solitudes = buildSolitudes(latest, unique);

  const objMap = new Map<string, { score: number; issue: string; color: string; context: string }>();
  for (const e of latest) {
    if (!e.extracted_objects) continue;
    let objects: ExtractedObject[] = [];
    try { objects = JSON.parse(e.extracted_objects) as ExtractedObject[]; } catch { continue; }
    const eventWeight = e.score_qc ?? e.score_saillance ?? 0;
    const issueColor = ISSUE_COLORS[e.main_issue ?? ""] ?? "#463E3E";
    const context = e.title ?? "";
    for (const obj of objects.slice(0, 8)) {
      const name = obj.object.trim();
      if (!name || name.length < 3) continue;
      const weighted = obj.score * eventWeight;
      const existing = objMap.get(name);
      if (!existing || weighted > existing.score) {
        objMap.set(name, { score: existing ? existing.score + weighted : weighted, issue: existing?.issue ?? e.main_issue ?? "", color: issueColor, context: context.length > 0 ? context : existing?.context ?? "" });
      } else { existing.score += weighted; }
    }
  }

  const allObjects = Array.from(objMap.entries())
    .map(([name, data]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), enjeu: ISSUE_LABELS_SHORT[data.issue] ?? "Actualité", color: data.color, context: data.context, score: data.score }))
    .sort((a, b) => b.score - a.score);

  const withTruncContext = allObjects;

  const tier1 = withTruncContext.slice(0, 4);
  const tier2 = withTruncContext.slice(4, 9);
  const tier3 = withTruncContext.slice(9, 14);
  const tier4 = withTruncContext.slice(14, 18);
  const topScore = allObjects[0]?.score ?? 1;
  const treemapMobile = withTruncContext.slice(0, 14).map((o) => ({ ...o, relWidth: Math.round((o.score / topScore) * 100) }));

  return { dateLabel, lastUpdated, snapshotInterval, periodLabel, top3, solitudes, treemapTier1: tier1, treemapTier2: tier2, treemapTier3: tier3, treemapTier4: tier4, treemapMobile };
});

const ISSUE_KEYS = Object.keys(ISSUE_COLORS);
const PASS_ORDER: Record<string, number> = { am: 0, noon: 1, pm: 2 };

async function loadIssueScores(period: "day" | "week" | "month"): Promise<Array<Record<string, unknown>> | null> {
  const filePath = path.resolve(process.cwd(), "public", "data", "refined", period, `issues_score_${period}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Array<Record<string, unknown>>;
  } catch { return null; }
}

function latestIssueRow(rows: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => {
    const tA = (a.tag as string) ?? "";
    const tB = (b.tag as string) ?? "";
    if (tB !== tA) return tB.localeCompare(tA);
    const dA = (a.date_utc as string) ?? "";
    const dB = (b.date_utc as string) ?? "";
    if (dB !== dA) return dB.localeCompare(dA);
    const passDiff = (PASS_ORDER[b.pass as string] ?? 0) - (PASS_ORDER[a.pass as string] ?? 0);
    if (passDiff !== 0) return passDiff;
    const metaA = (a.issues_meta as string) ?? "{}";
    const metaB = (b.issues_meta as string) ?? "{}";
    if (metaB !== "{}" && metaA === "{}") return 1;
    if (metaA !== "{}" && metaB === "{}") return -1;
    return 0;
  })[0] ?? null;
}

type IssueMetaEntry = { label: string; obj: string; url?: string };
type IssuesMeta = Record<string, IssueMetaEntry>;

function parseIssuesMeta(raw: unknown): IssuesMeta | null {
  if (!raw || typeof raw !== "string" || raw === "{}") return null;
  try { return JSON.parse(raw) as IssuesMeta; } catch { return null; }
}

// Les objets extraits (ex: « accord états-unis-iran ») sont en minuscules et
// désignent presque toujours une entité nommée (pays, personne, organisation).
// Une simple capitalisation de la première lettre laissait « Accord
// états-unis-iran » — on met en majuscule chaque mot (espace ou tiret) (#161).
function capitalizeObject(s: string): string {
  if (s.length === 0) return s;
  return s.replace(/(^|[\s-])(\p{Ll})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

type FallbackEntry = { topObject: string; context: string; url: string | null };

async function loadFallbackIssueContent(): Promise<Map<string, FallbackEntry>> {
  const map = new Map<string, FallbackEntry>();
  let rawEvents: string;
  try { rawEvents = await fs.readFile(DATA_PATH, "utf8"); } catch { return map; }
  const allRaw = JSON.parse(rawEvents) as RawEvent[];

  const byId = new Map<string, RawEvent>();
  for (const e of allRaw) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") byId.set(e.event_id, e);
  }
  const unique = Array.from(byId.values()).filter((e) => e.country_id !== "USA");

  const bestByIssue = new Map<string, RawEvent>();
  for (const e of unique) {
    const key = e.main_issue ?? "";
    const existing = bestByIssue.get(key);
    if (!existing || (e.score_qc ?? 0) > (existing.score_qc ?? 0)) bestByIssue.set(key, e);
  }
  for (const [issueKey, e] of bestByIssue) {
    let topObject = "";
    if (e.extracted_objects) {
      try {
        const objs = JSON.parse(e.extracted_objects) as ExtractedObject[];
        const raw = objs[0]?.object?.trim() ?? "";
        if (raw.length >= 2) topObject = capitalizeObject(raw);
      } catch { }
    }
    map.set(issueKey, { topObject, context: e.title ?? "", url: e.representative_url ?? null });
  }
  return map;
}

export async function loadTreemap(): Promise<TreemapAllPeriods | null> {
  const [dayRows, weekRows, monthRows, fallbackContent] = await Promise.all([
    loadIssueScores("day"),
    loadIssueScores("week"),
    loadIssueScores("month"),
    loadFallbackIssueContent(),
  ]);

  function buildPeriodData(rows: Array<Record<string, unknown>> | null): TreemapPeriodData | null {
    if (!rows) return null;
    const latest = latestIssueRow(rows);
    if (!latest) return null;
    const dateStr = (latest.date_montreal_tz as string) ?? (latest.date_utc as string) ?? "";
    const dateLabel = formatDateFr(dateStr);
    const lastUpdated = lastUpdatedLabel(dateStr);
    const meta = parseIssuesMeta(latest.issues_meta);

    const latestTag = (latest.tag as string) ?? "";
    const periodRows = latestTag
      ? rows.filter((r) => (r.tag as string) === latestTag)
      : [latest];
    const aggregated = ISSUE_KEYS.reduce<Record<string, number>>((acc, key) => {
      acc[key] = periodRows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
      return acc;
    }, {});

    const scored = ISSUE_KEYS.map((issueKey) => ({ issueKey, score: aggregated[issueKey] ?? 0 })).sort((a, b) => b.score - a.score);
    const maxScore = scored[0]?.score || 1;
    const tiles: TreemapIssueTile[] = scored.map(({ issueKey, score }) => {
      let topObject = ""; let context = "";
      const metaEntry = meta?.[issueKey];
      const hasMetaContent = metaEntry && (metaEntry.obj?.length > 0 || metaEntry.label?.length > 0);
      const fb = fallbackContent.get(issueKey);
      let url: string | null = null;
      if (hasMetaContent) {
        const obj = metaEntry.obj ?? "";
        topObject = obj.length > 0 ? capitalizeObject(obj) : "";
        context = metaEntry.label ?? "";
        url = metaEntry.url ?? null;
      } else {
        topObject = fb?.topObject ?? "";
        context = fb?.context ?? "Aucune actualité saillante sur cette période.";
        url = fb?.url ?? null;
      }
      return { issueKey, issueFr: ISSUE_LABELS_SHORT[issueKey] ?? issueKey, color: ISSUE_COLORS[issueKey] ?? "#463E3E", score, relScore: Math.round((score / maxScore) * 100), topObject, context, url };
    });
    return { tiles, dateLabel, lastUpdated };
  }

  const day = buildPeriodData(dayRows);
  if (!day) return null;
  return { day, week: buildPeriodData(weekRows) ?? day, month: buildPeriodData(monthRows) ?? day };
}

// Exports réservés aux tests unitaires (pipeline interne ; pas l'API publique).
export const __test__ = {
  latestIssueRow,
  parseIssuesMeta,
  capitalizeObject,
  firstSeenSaillantLabel,
  dedupeByStoryline,
  pctile,
  rocScore,
  convMode,
  solitudesEdito,
  symbolPositions,
  buildSolitudes,
  blockKey,
  titleTokens,
  sameStory,
  CAL_CONV,
};
