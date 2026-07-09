// Table partagée des « éditions » par bloc de 4 h (heure de Montréal).
// Source unique de vérité utilisée côté serveur (periodLabelFromInterval,
// lib/data/headlineEvents.ts) ET côté client (PulseCountdown).
//
// Noms OFFICIELS des 6 blocs (aws-infra/lib/data-stacks/refiners/refiners.ts
// + aws-infra/docs/horaire-refiners-2026.html), nommés par leur heure de
// DÉBUT de bloc : Minuit / Nuit / Matin / Midi / Après-midi / Soirée.
// Rendu articulé (« Les Unes du midi », « Édition du midi ») pour la prose.
//
// Convention d'intervalle : FIN EXCLUSIVE — le bloc « 00-04 » couvre
// 00:00 à 03:59 (l'heure 4 appartient au bloc suivant), comme le champ
// time_interval_montreal_tz des données et editionSlot(hour) ci-dessous.
//   00:00–03:59 → Minuit      12:00–15:59 → Midi
//   04:00–07:59 → Nuit        16:00–19:59 → Après-midi
//   08:00–11:59 → Matin       20:00–23:59 → Soirée

export const EDITIONS = [
  "de minuit", // 00:00–03:59 · Minuit
  "de la nuit", // 04:00–07:59 · Nuit
  "du matin", // 08:00–11:59 · Matin
  "du midi", // 12:00–15:59 · Midi
  "de l’après-midi", // 16:00–19:59 · Après-midi
  "de la soirée", // 20:00–23:59 · Soirée
] as const;

/** Index du bloc de 4 h (0 à 5) pour une heure 0-23. */
export function editionSlot(hour: number): number {
  return Math.floor(hour / 4);
}

/** Libellé d'édition articulé (« du midi », …) pour une heure 0-23. */
export function editionLabel(hour: number): string {
  return EDITIONS[editionSlot(hour)] ?? "du jour";
}
