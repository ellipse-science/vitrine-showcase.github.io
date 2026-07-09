// Formatage de dates FR partagé entre les loaders (source unique — évite les
// tables DAYS_FR/MONTHS_FR dupliquées par module).

export const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// Parse strict d'une date ISO « YYYY-MM-DD ». Rejette les composantes hors
// plage (mois 13, jour 40…) ET les dates inexistantes (2026-02-30), que
// `new Date(y, m-1, d)` normaliserait silencieusement en une autre date.
function parseIsoDate(dateStr: string): { y: number; m: number; d: number; date: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  // Une date inexistante « déborde » (2026-02-30 → 2 mars) : on la rejette.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return { y, m, d, date };
}

/** ISO « 2026-07-08 » → « Mercredi 8 juillet 2026 ». Retourne l'entrée telle
 *  quelle si elle n'est pas une date ISO valide (validation stricte, cf.
 *  parseIsoDate — pas de normalisation JS silencieuse). */
export function formatDateFr(dateStr: string): string {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return dateStr;
  return `${DAYS_FR[parsed.date.getDay()]} ${parsed.d} ${MONTHS_FR[parsed.m - 1]} ${parsed.y}`;
}

/**
 * Libellé uniforme « Dernière mise à jour : … » affiché en bas à droite de
 * chaque module (classe CSS `.module-last-updated`), branché sur le timestamp
 * de la table du module. Il gèle si le pipeline plante → détecteur de panne.
 * Donnée invalide ou absente → placeholder « — » (jamais un libellé normalisé
 * en douce).
 *
 * `blockEndHour` (fin du bloc 4h, heure Mtl) n'est fourni que par les tables
 * qui ont une granularité horaire (headline_events_4h → Une, Deux solitudes) :
 * 16 → « , 16 h » ; 24 → « , minuit ». Les tables journalières/hebdo (partis,
 * enjeux, assemblée, polimètre) n'affichent que la date — l'heure n'existe pas
 * dans leur donnée.
 */
export function lastUpdatedLabel(dateStr: string, blockEndHour?: number | null): string {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return "Dernière mise à jour : —";
  const dateFr = formatDateFr(dateStr);
  const dateLower = dateFr.charAt(0).toLowerCase() + dateFr.slice(1);
  if (blockEndHour == null || Number.isNaN(blockEndHour)) {
    return `Dernière mise à jour : ${dateLower}`;
  }
  const hourLabel = blockEndHour >= 24 ? "minuit" : `${blockEndHour} h`;
  return `Dernière mise à jour : ${dateLower}, ${hourLabel}`;
}
