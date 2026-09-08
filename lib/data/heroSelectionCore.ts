// Cœur PUR de la sélection de la Une des Unes.
//
// POURQUOI CE FICHIER EXISTE. `vitrine-art` illustre la Une ; pour savoir
// LAQUELLE, il lisait `data/hero-selection.json` sur le SITE DÉPLOYÉ — donc
// derrière la file de build de Cloudflare Pages, qui ne construit qu'un projet
// à la fois et saute un build en file quand un plus récent arrive. Résultat
// mesuré du 29 août au 3 septembre 2026 : de 1 h 20 à 5 h par jour d'édition
// sans illustration (aws-refiners#490).
//
// Le correctif demande que la sélection soit connue AVANT le build. Le Worker
// (`workers/api`) a déjà les événements à :56, mais il ne peut pas importer
// `headlineEvents.ts` : ce module charge `node:fs`, `node:path` et `react`.
// D'où cette extraction — la MÊME logique, dans un module qu'un Worker peut
// charger.
//
// RÈGLE : aucune dépendance Node, aucune dépendance React, aucune E/S — et
// AUCUN import inutile : tout ce qui entre ici entre dans le bundle du
// Worker. Un seul import aujourd'hui, `salienceCutover`, qui n'en a lui-même
// aucun. Même
// convention que `workers/api/src/art-logic.ts`, `snapshot-logic.ts` et
// `flappy-logic.ts` — logique pure ici, entrées-sorties à côté.
//
// ⚠️ CE FICHIER EST LA SOURCE DE VÉRITÉ DE LA UNE. `headlineEvents.ts` le
// ré-exporte, donc le site et le Worker appellent littéralement la même
// fonction. Ne jamais en faire une copie ailleurs : la divergence entre le
// sélecteur et le rendu est exactement la panne de vitrine-showcase#259.
//
// Ce module a été obtenu par DÉPLACEMENT, sans modification de logique
// (aws-refiners#490, 2026-09-08). Le comportement est celui d'avant.

import {
  SALIENCE_CUTOVER,
  NEW_INDEX_SCALE,
  recencyWeight,
} from "@/lib/data/salienceCutover";

export type RawEvent = {
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
  // Canada absorbe les USA. Publiés par le refiner #211, avec coverage_* et
  // media_ids_qc/roc ; lus directement depuis le #272 (plus de repli).
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
  // Indice de saillance spec v1 (aws-refiners#287, tag `spec-v1`), publié en
  // shadow par le raffineur et lu SEULEMENT quand SALIENCE_CUTOVER est vrai.
  // Optionnels : absents des lignes publiées avant le 2026-07-14 (Athena rend
  // null), et absents du snapshot tant que tables.json ne les projette pas.
  // Unité de stockage : [0,1] — le ×100 d'affichage est appliqué par qcScore/
  // rocScore, jamais ici (cf. lib/data/salienceCutover.ts).
  salience_index_qc?: number | null;
  salience_index_roc?: number | null;
};

export function uniqueQcEvents(all: RawEvent[]): RawEvent[] {
  const byId = new Map<string, RawEvent>();
  for (const e of all) {
    const existing = byId.get(e.event_id);
    if (!existing || e.target_region === "QC") byId.set(e.event_id, e);
  }
  return Array.from(byId.values()).filter((e) => e.country_id !== "USA");
}

// Saillance ROC (Canada hors Québec, sans les USA) : lue directement dans la
// colonne publiée (aws-refiners#211). Le repli par soustraction
// `saillance − qc − us` a été retiré au #272 — il était devenu inerte
// (score_roc non nul sur 184/184 lignes le 2026-07-27) et il faisait absorber
// les USA du côté canadien quand score_us manquait.
export function rocScore(e: RawEvent, cutover: boolean = SALIENCE_CUTOVER): number {
  return cutover ? (e.salience_index_roc ?? 0) * NEW_INDEX_SCALE : (e.score_roc ?? 0);
}

// LE point de bascule du cutover, côté québécois — et le SEUL endroit du loader
// qui décide quelle colonne est « la saillance d'un bloc ». Tout le reste
// (cumuls pondérés, sommets, classement, badge, parts d'attention, trajectoire,
// radar) se sert de cette valeur sans savoir d'où elle vient, si bien que la
// bascule ne peut pas laisser un module derrière.
//
// Le ×100 est appliqué ICI, à la lecture, pas à l'affichage : voir la note
// d'échelle dans lib/data/salienceCutover.ts.
export function qcScore(e: RawEvent, cutover: boolean = SALIENCE_CUTOVER): number {
  return cutover ? (e.salience_index_qc ?? 0) * NEW_INDEX_SCALE : (e.score_qc ?? 0);
}

// Clé de bloc triable (date + heure de début du créneau 4h).
export function blockKey(e: RawEvent): string {
  const start = (e.time_interval_utc ?? "").split("-")[0].padStart(2, "0");
  return `${e.date_utc}T${start}`;
}

// Signature de titre pour la dédup cross-langue (stopgap aws-refiners#213) :
// tokens significatifs (sans accents, stopwords FR/EN, mots courts).
export const TITLE_STOP = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "et", "ou", "en",
  "sur", "pour", "dans", "par", "avec", "sans", "sous", "vers", "chez", "que", "qui",
  "the", "and", "for", "with", "from", "that", "this", "into", "over", "after",
]);

export function titleTokens(s: string): Set<string> {
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
export function sameStory(a: Set<string>, b: Set<string>): boolean {
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
// Une histoire agrégée sur la fenêtre glissante de 24 h (6 blocs de 4 h les
// plus récents). SOURCE COMMUNE aux deux modules : la Une des Unes (top QC) et
// Deux solitudes (top QC + top CAN) sélectionnent depuis la MÊME liste → ils
// montrent les mêmes histoires.
export type Story = {
  rep: RawEvent;           // occurrence du bloc le plus récent (titre, médias, articles frais)
  repKey: string;
  label: string;
  // Σ de l'indice de bloc (qcScore : `score_qc`, ou `salience_index_qc` ×100
  // après le cutover) pondérée par récence (demi-vie HALF_LIFE_H) — CLASSEMENT.
  // Poids NORMALISÉS (somme = 1 sur six blocs, vitrine#566) : c'est donc la
  // moyenne pondérée des six derniers blocs, sur 100 — les « points » du site.
  sumQc: number;
  sumRoc: number;
  peakQc: number;          // max de l'indice de bloc, BRUT, sur la fenêtre
  peakRoc: number;         // (même échelle que l'indice de bloc → seuils cohérents)
  qcMedia: Set<string>;
  canMedia: Set<string>;
  urlByMedia: Record<string, string>;
  tok: Set<string>;
  // Score QC BRUT (non pondéré) par bloc 4 h de la fenêtre — sert à la
  // trajectoire de saillance (#274). max par bloc, comme peakQc mais conservé
  // bloc par bloc. Rempli pendant l'agrégation, sérialisé en `series` à la fin.
  byBlock: Map<string, number>;
  /** 6 blocs de la fenêtre, du plus ANCIEN au plus récent ; qc = 0 si la
   *  storyline était absente de ce bloc. `present` distingue « pas à la Une »
   *  (absente) d'une faible saillance réelle. Alimente la sparkline + le survol.
   *  `share` = PART d'attention QC de l'histoire dans ce bloc, en % (qc de
   *  l'histoire / qc total du bloc × 100), donc dans [0, 100] et 0 quand le bloc
   *  n'a aucune saillance QC. Sert à chiffrer la tendance (#304) — le `qc` brut,
   *  lui, reste la base de la courbe et du niveau au survol. */
  series: { blockUtc: string; qc: number; present: boolean; share: number; cumul: number }[];
};

export function parseIdList(json: string | null | undefined): string[] {
  try {
    const p = JSON.parse(json ?? "[]");
    return Array.isArray(p) ? (p as string[]) : [];
  } catch { return []; }
}

// Pondération de récence du CLASSEMENT (vitrine #274, arbitrage d'Adrien sur le
// banc d'essai #282 du 2026-07-20) : à l'intérieur de la fenêtre 24 h, le poids
// d'un bloc décroît exponentiellement avec son âge — demi-vie de 10 h, donc une
// Une d'il y a 10 h pèse moitié moins qu'une Une en cours. Ne touche QUE les
// sommes (sumQc/sumRoc → classement, parts d'attention, convergence) ; le pic
// (peakQc → pastille) reste BRUT : l'étiquette décrit ce que l'histoire a été à
// son sommet sur 24 h, le rang décrit ce qui domine l'attention maintenant.
// Chiffres du banc (juin 2026) : âge moyen du pic du n°1 10,1 h → 5,5 h, churn
// 37 % (cible < 35-40 %), convergence Deux solitudes quasi inchangée (Δp50 ≤ 1).
// Depuis vitrine#566 les poids sont NORMALISÉS (`recencyWeight`, somme = 1 sur
// une fenêtre pleine) : les sommes sont des moyennes pondérées sur 100, et la
// demi-vie (HALF_LIFE_H) vit dans salienceCutover.ts à côté des grilles.
export const blockStartMs = (bk: string) => Date.parse(`${bk}:00:00Z`);

export const ageH = (olderMs: number, newerMs: number) => (newerMs - olderMs) / 3.6e6;

export function storiesFrom24h(allEvents: RawEvent[], cutover: boolean = SALIENCE_CUTOVER): Story[] {
  type RawArticle = { media_id: string; url: string };
  const blocks = Array.from(new Set(allEvents.map(blockKey))).sort().reverse();
  const window24h = new Set(blocks.slice(0, 6));
  // Référence de la décroissance = bloc le plus récent de la fenêtre (âge 0).
  const newestMs = blocks.length ? blockStartMs(blocks[0]) : 0;
  // Blocs récents d'abord : l'ordre du JSON n'est pas garanti, et le « premier
  // URL conservé » par média (ci-dessous) doit venir du bloc le plus frais.
  const windowEvents = allEvents
    .filter((e) => window24h.has(blockKey(e)))
    .sort((a, b) => (blockKey(a) < blockKey(b) ? 1 : blockKey(a) > blockKey(b) ? -1 : 0));

  const byStory = new Map<string, Story>();
  for (const e of windowEvents) {
    if (!e.title) continue;
    const key = e.storyline_id ?? e.event_label ?? e.event_id;
    const bk = blockKey(e);
    // Poids de récence : 1 pour le bloc le plus frais, ~0,5 à 10 h d'âge, etc.
    const w = recencyWeight(ageH(blockStartMs(bk), newestMs));
    const qc = qcScore(e, cutover);
    const roc = rocScore(e, cutover);
    // Listes de médias par région, publiées par le refiner (#211). Le repli qui
    // re-triait `media_ids` à la main a été retiré au #272 : il devinait le côté
    // canadien par soustraction d'une liste de médias US codée en dur, ce qui
    // classait « canadien » tout média américain absent de cette liste.
    const qcIds = parseIdList(e.media_ids_qc);
    const canIds = parseIdList(e.media_ids_roc);
    let cur = byStory.get(key);
    if (!cur) {
      cur = { rep: e, repKey: bk, label: e.title ?? "", sumQc: 0, sumRoc: 0, peakQc: 0, peakRoc: 0,
        qcMedia: new Set(), canMedia: new Set(), urlByMedia: {}, tok: titleTokens(e.title ?? ""),
        byBlock: new Map(), series: [] };
      byStory.set(key, cur);
    }
    cur.sumQc += qc * w; cur.sumRoc += roc * w;
    cur.peakQc = Math.max(cur.peakQc, qc); cur.peakRoc = Math.max(cur.peakRoc, roc);
    cur.byBlock.set(bk, Math.max(cur.byBlock.get(bk) ?? 0, qc)); // score BRUT par bloc (trajectoire)
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
    if (bk > cur.repKey) { cur.rep = e; cur.repKey = bk; cur.label = e.title ?? ""; cur.tok = titleTokens(e.title ?? ""); }
  }

  // Dédup cross-langue (STOPGAP aws-refiners#213) : fusionne les storylines
  // d'une même histoire scindée FR/EN (titres très proches). Sommes additionnées,
  // pics au max, médias en union ; représentant = celui de la storyline la PLUS
  // SAILLANTE (host), délibérément NON réévalué à la fusion : basculer vers la
  // jumelle (souvent l'autre langue) ferait changer la langue du titre affiché.
  // À l'intérieur d'une storyline, rep = bloc le plus récent (boucle ci-dessus).
  const merged: Story[] = [];
  for (const a of Array.from(byStory.values()).sort((x, y) => y.sumQc + y.sumRoc - (x.sumQc + x.sumRoc))) {
    const host = merged.find((m) => sameStory(m.tok, a.tok));
    if (host) {
      host.sumQc += a.sumQc; host.sumRoc += a.sumRoc;
      host.peakQc = Math.max(host.peakQc, a.peakQc); host.peakRoc = Math.max(host.peakRoc, a.peakRoc);
      a.qcMedia.forEach((id) => host.qcMedia.add(id));
      a.canMedia.forEach((id) => host.canMedia.add(id));
      for (const [id, url] of Object.entries(a.urlByMedia)) if (!host.urlByMedia[id]) host.urlByMedia[id] = url;
      for (const [b, v] of a.byBlock) host.byBlock.set(b, Math.max(host.byBlock.get(b) ?? 0, v));
    } else {
      merged.push(a);
    }
  }
  // Série par bloc sur les 6 blocs de la fenêtre, du plus ANCIEN au plus récent
  // (0 quand la storyline était absente du bloc) — pour la trajectoire #274.
  const windowBlocksAsc = blocks.slice(0, 6).slice().reverse();
  // Total QC par bloc (toutes histoires du bloc) → part d'attention QC de chaque
  // histoire, bloc par bloc. Sert à la tendance #304 : « combien d'espace média
  // occupe cette histoire, et comment ça bouge d'un bloc à l'autre ». Même base
  // que Deux solitudes (part = qc de l'histoire / qc total du bloc).
  const blockTotalQc = new Map<string, number>();
  for (const b of windowBlocksAsc) {
    let tot = 0;
    for (const s of merged) tot += s.byBlock.get(b) ?? 0;
    blockTotalQc.set(b, tot);
  }
  for (const s of merged) {
    s.series = windowBlocksAsc.map((b, idx) => {
      const qc = s.byBlock.get(b) ?? 0;
      const tot = blockTotalQc.get(b) ?? 0;
      // `present` = « un média QUÉBÉCOIS l'avait-il en Une dans ce bloc ? »,
      // et NON « ce bloc a-t-il une entrée pour cette histoire ? ».
      //
      // La nuance n'est pas théorique : une entrée existe dès qu'un événement
      // apparaît dans le bloc, y compris quand seuls des médias canadiens ou
      // américains le couvraient — la saillance québécoise est alors nulle.
      // Avec l'ancien test (`byBlock.has`), ces points échappaient à
      // « Hors du radar » et affichaient le niveau du BADGE (cumul 24 h) suivi
      // de « 0 % de l'attention médiatique ». Les deux moitiés étaient vraies,
      // l'ensemble illisible — signalé par Adrien captures à l'appui, mesuré à
      // **229 points sur 2 086 (11 %)** du snapshot déployé.
      //
      // Vérifié : le défaut ne vient PAS de l'indice — il se reproduit à
      // l'identique flag allumé (vitrine#430).
      //
      // `cumul` = l'attention cumulée 24 h « as-of » ce bloc — LA grandeur du
      // badge, donc celle que la courbe trace depuis #430 B3. Repli seulement :
      // le loader passe les cumuls exacts du rejeu d'éditions (badgeSums), qui
      // voient aussi les blocs antérieurs à la fenêtre affichée. Ici on ne peut
      // regarder que les 6 blocs de la fenêtre, donc les premiers points sont
      // légèrement sous-estimés.
      let cumul = 0;
      for (let j = Math.max(0, idx - 5); j <= idx; j++) {
        const bj = windowBlocksAsc[j];
        const qj = s.byBlock.get(bj) ?? 0;
        if (qj <= 0) continue;
        cumul += qj * recencyWeight(ageH(blockStartMs(bj), blockStartMs(b)));
      }
      return { blockUtc: b, qc, present: qc > 0, share: tot > 0 ? (qc / tot) * 100 : 0, cumul };
    });
  }
  return merged.filter((s) => s.sumQc + s.sumRoc > 0);
}

/** Part de l'attention du meneur qu'une manchette secondaire doit atteindre pour
 *  s'afficher (#430, B6). Voir selectTopUnes pour le raisonnement et la mesure. */
export const MIN_PART_DU_MENEUR = 0.5;

// Sélection des Unes : classement PUR par saillance QC cumulée 24 h (sumQc,
// demi-vie w10), depuis le MÊME pool que le radar Deux solitudes → les deux modules
// montrent exactement le même classement (le héros de la Une = la nouvelle #1 du
// radar). Aucun plancher de récence : la moyenne pondérée fait déjà décroître une
// histoire en douceur à mesure qu'elle vieillit et que de plus grosses émergent,
// comme un vrai journal. Une histoire qui a culminé pendant la nuit reste donc à la
// Une le lendemain matin, puis glisse d'elle-même en #2, #3, puis sort.
//
// Historique : un plancher `isStaleForUne` (arbitrage 2026-07-20) excluait toute
// histoire absente du bloc courant dont le pic datait de ≥ 8 h. RETIRÉ 2026-07-23
// (arbitrage Adrien) : un banc de mesure interne sur 10 semaines (427 blocs)
// montre qu'il DÉSACCORDAIT la Une
// du radar (cohérence 67 % → 100 % sans lui), appauvrissait les fronts (jours à
// 1 seule Une 52 % → 23 %) et AUGMENTAIT le churn du héros (60 % → 35 % sans lui —
// il éjectait le leader d'un coup à chaque bloc raté). Le seul coût — quelques
// « héros retombés » les nuits creuses — est assumé : c'est aussi ce que font les
// médias quand rien de neuf n'émerge. Déclencheur : cas Oliver Jones (mort culturelle
// de la nuit, pic ~record, exclue à tort de la Une du midi le 2026-07-23).
export function selectTopUnes(stories: Story[], max = 3): Story[] {
  // Top-3 par saillance cumulée, sans repêchage (le pool est partagé avec le
  // radar) et SANS filtre de nombre de médias depuis #430 A2 : l'indice
  // hiérarchise lui-même, et le badge dit honnêtement où chaque carte se situe.
  const eligible = stories.filter((s) => s.qcMedia.size > 0 && s.sumQc > 0);
  const top = eligible.sort((a, b) => b.sumQc - a.sumQc).slice(0, max);
  if (top.length === 0) return top;
  // RÈGLE DE DOMINATION (#430, B6, décision d'Adrien du 2026-08-09).
  //
  // Le nombre de manchettes n'est pas un réglage : c'est une AFFIRMATION.
  // Trois cartes disent « voici les trois histoires du moment » ; une seule dit
  // « aujourd'hui, une seule compte ». C'est la journée qui doit décider
  // laquelle est vraie.
  //
  // La règle est RELATIVE, jamais un plancher absolu. Un plancher pourrait vider
  // le module un jour creux où rien n'atteint le seuil — or trois nouvelles
  // également faibles sont comparables ENTRE ELLES et méritent leurs trois
  // cartes, chacune portant honnêtement son « Très faible ». À l'inverse, une
  // histoire qui écrase les autres doit rester seule. Le meneur passe toujours :
  // le module ne peut pas se vider.
  //
  // Seuil à 50 % — mesuré sur 105 éditions : trois cartes 49 % du temps, deux
  // 23 %, une seule 29 %. La 2e histoire est à 69 % du meneur en médiane, mais
  // sous 48 % dans un quart des éditions : les deux régimes de journées existent
  // vraiment. Et le seuil se dit en une phrase publique.
  //
  // ⚠️ C'est une règle d'AFFICHAGE, pas de mesure (précision d'Adrien) : l'indice
  // est calculé et publié pour TOUTES les histoires, elles restent disponibles
  // en base pour l'analyse, et Radar+ les montrera toutes. La Vitrine choisit
  // seulement ce qu'elle met en avant.
  // B7 (#430) — LE DÉNOMINATEUR EST LA PLUS FORTE HISTOIRE ENCORE VIVANTE.
  //
  // Le défaut : le cumul 24 h d'un meneur ÉTEINT (plus aucun média québécois ne
  // l'a en Une dans le bloc courant) reste gonflé par son passé. Une nouvelle
  // bien vivante se faisait alors retirer de l'écran pour n'avoir pas fait la
  // moitié d'un fantôme — le 2026-08-09 à 16h, Gaza (33,4) sortait à 49 % d'un
  // meneur à 68,4 qui valait 0 dans le bloc courant. Trois histoires en cours,
  // deux cartes.
  //
  // Mesuré sur le rejeu de l'année (2683 éditions) : le cas se produit dans
  // 6,0 % des éditions. La correction en change 7,9 % (4,2 % sur le seul régime
  // de regroupement actuel) et PRÉSERVE le cas à deux cartes — 21,1 % contre
  // 25,9 % — là où toutes les variantes « cascade » testées le faisaient tomber
  // à 9 % en poussant tout vers trois cartes.
  //
  // Formulation publique, une seule phrase et aucune condition : « une manchette
  // secondaire s'affiche si elle vaut au moins la moitié de la plus forte
  // histoire encore à la Une ». Quand le meneur est vivant — le cas ordinaire —
  // c'est lui, et la règle est exactement celle d'avant.
  const vivante = (s: Story) => (s.series[s.series.length - 1]?.qc ?? 0) > 0;
  // `eligible` est déjà trié par cumul décroissant : le premier vivant est donc
  // le plus fort. Repli sur le meneur si PERSONNE n'est à la Une dans ce bloc
  // (nuit creuse) — sinon la règle n'aurait plus de référence du tout.
  const reference = (vivante(top[0]) ? top[0] : eligible.find(vivante) ?? top[0]).sumQc;
  return top.filter((s, i) => i === 0 || s.sumQc >= reference * MIN_PART_DU_MENEUR);
}

export type HeroSelection = {
  event_id: string;
  storyline_id: string | null;
  title: string | null;
  main_issue: string | null;
  date_utc: string;
  time_interval_utc: string;
  /** Traces de contrôle : permettent de voir, dans le JSON produit, que le hero
   *  vient d'un bloc antérieur au bloc courant — le cas fréquent (38 %). */
  sum_qc: number;
  peak_qc: number;
};

// API PUBLIQUE et stable de la sélection du hero. Le script d'illustration
// passait par `__test__`, qui est explicitement documenté comme réservé aux
// tests : un simple renommage interne du loader aurait cassé la synchro
// illustration ↔ hero sans que rien ne le signale (retour Copilot). Le contrat
// vit désormais ici, avec les autres exports du module.
export function selectHeroFromRawEvents(all: RawEvent[]): HeroSelection | null {
  const stories = storiesFrom24h(uniqueQcEvents(all));
  const hero = selectTopUnes(stories)[0];
  if (!hero) return null;
  // `rep` = l'occurrence de l'histoire dans le bloc le plus récent où elle est
  // présente ; c'est elle qui porte le titre et les articles que le site affiche.
  const rep = hero.rep;
  return {
    event_id: rep.event_id,
    storyline_id: rep.storyline_id ?? null,
    title: rep.title ?? null,
    main_issue: rep.main_issue ?? null,
    date_utc: rep.date_utc,
    time_interval_utc: rep.time_interval_utc,
    sum_qc: Number(hero.sumQc.toFixed(3)),
    peak_qc: Number(hero.peakQc.toFixed(3)),
  };
}
