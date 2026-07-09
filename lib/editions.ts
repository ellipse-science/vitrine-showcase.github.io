// Table partagée des « éditions » par bloc de 4 h (heure de Montréal).
// Source unique de vérité utilisée côté serveur (periodLabelFromInterval,
// lib/data/headlineEvents.ts) ET côté client (PulseCountdown).
//
// Noms OFFICIELS des 6 blocs (aws-infra/lib/data-stacks/refiners/refiners.ts
// + aws-infra/docs/horaire-refiners-2026.html), nommés par leur heure de
// DÉBUT de bloc : Minuit / Nuit / Matin / Midi / Après-midi / Soirée.
// Rendu articulé (« Les Unes du midi », « Édition du midi ») pour la prose.
//   bloc 00-04 → Minuit      bloc 12-16 → Midi
//   bloc 04-08 → Nuit        bloc 16-20 → Après-midi
//   bloc 08-12 → Matin       bloc 20-24 → Soirée

export const EDITIONS = [
  "de minuit", // 00-04 · Minuit
  "de la nuit", // 04-08 · Nuit
  "du matin", // 08-12 · Matin
  "du midi", // 12-16 · Midi
  "de l’après-midi", // 16-20 · Après-midi
  "de la soirée", // 20-24 · Soirée
] as const;

/** Index du bloc de 4 h (0 à 5) pour une heure 0-23. */
export function editionSlot(hour: number): number {
  return Math.floor(hour / 4);
}

/** Libellé d'édition articulé (« du midi », …) pour une heure 0-23. */
export function editionLabel(hour: number): string {
  return EDITIONS[editionSlot(hour)] ?? "du jour";
}
