// Vocabulaire et calculs communs aux reels du module « Partis et couverture »
// (version longue `partis.ts` et versions courtes `partis-court/`).

import { PARTY_FULL_NAMES, type PartiesData, type PartyKey, type RowView } from "@/lib/data/parties";
import { MEDIA_DANS } from "@/lib/medias";
import { MODULES } from "@/lib/modules";

import { joinFr } from "./commun";
import { HASHTAGS as HASHTAGS_UNE } from "./identite";

export const IDENTITE = MODULES["partis-et-couverture"];
export const MODULE = IDENTITE.nom;

/** Mots-clics : ceux du gabarit commun (lib/identite.ts), sans celui de la Une des Unes. */
export const HASHTAGS = ["#PartisEtCouverture", ...HASHTAGS_UNE.filter((h) => h !== "#LaUnedesUnes")];

// ── Formulations ────────────────────────────────────────────────────────────
// Gabarits finis, nourris par les données (règle #7 : à relire avant publication).

/** Nom complet avec article (« le Parti québécois »). */
export const NOM_ARTICLE: Record<PartyKey, string> = {
  pq: `le ${PARTY_FULL_NAMES.pq}`,
  plq: `le ${PARTY_FULL_NAMES.plq}`,
  caq: `la ${PARTY_FULL_NAMES.caq}`,
  pcq: `le ${PARTY_FULL_NAMES.pcq}`,
  qs: PARTY_FULL_NAMES.qs,
};
/** Sigle avec article (« le PQ », « la CAQ », « QS »). */
export const SIGLE_ARTICLE: Record<PartyKey, string> = { pq: "le PQ", plq: "le PLQ", caq: "la CAQ", pcq: "le PCQ", qs: "QS" };
/** « du PQ », « de la CAQ », « de QS ». */
export const SIGLE_DE: Record<PartyKey, string> = { pq: "du PQ", plq: "du PLQ", caq: "de la CAQ", pcq: "du PCQ", qs: "de QS" };
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const TONE_MOT = { negative: "défavorable", positive: "favorable", neutral: "neutre" } as const;

// ── Par média ──────────────────────────────────────────────────────────────
// Le fader « Source » du site : chaque média a sa propre ventilation des cinq
// partis (les parts d'un média se somment à 100 % de SA couverture des partis).
export type MediaMix = { id: string; nom: string; dans: string; rows: RowView[]; minutes: number };

export function mediaMixes(data: PartiesData): MediaMix[] {
  return data.medias.flatMap((m) => {
    const view = data.byMedia[m.id];
    if (!view) return [];
    const rows = [...view.ranges.today.rows];
    const minutes = rows.reduce((t, r) => t + r.minutesUne, 0);
    if (minutes <= 0) return [];
    const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());
    return [{
      id: m.id,
      nom: m.label.replace(/^Le Journal/, "Journal"),
      dans: lower(MEDIA_DANS[m.id] ?? `Dans ${m.label}`),
      rows,
      minutes,
    }];
  });
}

/** Le ou les partis en tête d'un média (égalité possible). */
export function leaders(mix: MediaMix): RowView[] {
  const max = Math.max(...mix.rows.map((r) => r.sovPct));
  return mix.rows.filter((r) => r.sovPct === max && max > 0);
}

/** « défavorable pour 4 partis, favorable pour QS » : groupes de ton. */
export function tonGroupes(rows: RowView[]): string[] {
  return (["negative", "positive", "neutral"] as const).flatMap((dir) => {
    const g = rows.filter((r) => r.toneDirection === dir);
    if (!g.length) return [];
    const qui = g.length >= 3 ? `${g.length} partis` : joinFr(g.map((r) => SIGLE_ARTICLE[r.key]));
    return [`${TONE_MOT[dir]} pour ${qui}`];
  });
}
