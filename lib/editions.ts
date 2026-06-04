// Table partagée des « éditions » par bloc de 4 h (heure de Montréal), de la
// nuit à la soirée. Source unique de vérité utilisée côté serveur
// (periodLabelFromInterval, lib/data/headlineEvents.ts) ET côté client
// (PulseCountdown). À garder strictement synchronisée (d'où la centralisation).

export const EDITIONS = [
  "de la nuit", // 00-03
  "du petit matin", // 04-07
  "du matin", // 08-11
  "du midi", // 12-15
  "de l’après-midi", // 16-19
  "de la soirée", // 20-23
] as const;

/** Index du bloc de 4 h (0 à 5) pour une heure 0-23. */
export function editionSlot(hour: number): number {
  return Math.floor(hour / 4);
}

/** Libellé d'édition (« de la soirée », …) pour une heure 0-23. */
export function editionLabel(hour: number): string {
  return EDITIONS[editionSlot(hour)] ?? "du jour";
}
