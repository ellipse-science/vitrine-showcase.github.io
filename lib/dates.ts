// Formatage de dates FR partagé entre les loaders (source unique — évite les
// tables DAYS_FR/MONTHS_FR dupliquées par module).

export const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** ISO « 2026-07-08 » → « Mercredi 8 juillet 2026 ». Retourne l'entrée telle
 *  quelle si elle n'est pas une date ISO valide. */
export function formatDateFr(dateStr: string): string {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return `${DAYS_FR[dt.getDay()]} ${d} ${MONTHS_FR[m - 1]} ${y}`;
}

/**
 * Libellé uniforme « Dernière mise à jour : … » affiché en bas à droite de
 * chaque module (classe CSS `.module-last-updated`), branché sur le timestamp
 * de la table du module. Il gèle si le pipeline plante → détecteur de panne.
 *
 * `blockEndHour` (fin du bloc 4h, heure Mtl) n'est fourni que par les tables
 * qui ont une granularité horaire (headline_events_4h → Une, Deux solitudes) :
 * 16 → « , 16 h » ; 24 → « , minuit ». Les tables journalières/hebdo (partis,
 * enjeux, assemblée, polimètre) n'affichent que la date — l'heure n'existe pas
 * dans leur donnée.
 */
export function lastUpdatedLabel(dateStr: string, blockEndHour?: number | null): string {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return "Dernière mise à jour : —";
  const dateFr = formatDateFr(dateStr);
  const dateLower = dateFr.charAt(0).toLowerCase() + dateFr.slice(1);
  if (blockEndHour == null || Number.isNaN(blockEndHour)) {
    return `Dernière mise à jour : ${dateLower}`;
  }
  const hourLabel = blockEndHour >= 24 ? "minuit" : `${blockEndHour} h`;
  return `Dernière mise à jour : ${dateLower}, ${hourLabel}`;
}
