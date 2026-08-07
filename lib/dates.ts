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
 * Libellé uniforme « Dernière mise à jour du module : … » affiché en bas à
 * droite de chaque module (classe CSS `.module-last-updated`), branché sur le
 * timestamp de la table du module. « du module » : chaque module a sa propre
 * cadence — le libellé le rend explicite (décision Adrien 2026-07-09). Il gèle
 * si le pipeline plante → détecteur de panne. Donnée invalide ou absente →
 * placeholder « — » (jamais un libellé normalisé en douce).
 *
 * `blockEndHour` (fin du bloc 4h, heure Mtl) n'est fourni que par les tables
 * qui ont une granularité horaire (headline_events_4h → Une, Deux solitudes) :
 * 16 → « , 16h » ; 24 → « , minuit ». Heure compacte « 4h » (pas « 4 h ») :
 * l'indicateur est rendu en mono-majuscules et l'espace donnait « 4 H », jugé
 * laid — format 24 h, pas de am/pm. Les tables journalières/hebdo (partis,
 * enjeux, assemblée, polimètre) n'affichent que la date — l'heure n'existe pas
 * dans leur donnée.
 */
export function lastUpdatedLabel(dateStr: string, blockEndHour?: number | null): string {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return "Dernière mise à jour du module : —";
  const dateFr = formatDateFr(dateStr);
  const dateLower = dateFr.charAt(0).toLowerCase() + dateFr.slice(1);
  if (blockEndHour == null || Number.isNaN(blockEndHour)) {
    return `Dernière mise à jour du module : ${dateLower}`;
  }
  const hourLabel = blockEndHour >= 24 ? "minuit" : `${blockEndHour}h`;
  return `Dernière mise à jour du module : ${dateLower}, ${hourLabel}`;
}

/**
 * Heure de PUBLICATION à partir d'un intervalle de bloc « HH-HH » (réforme #195).
 * Le bloc de données est servi ~1 h après sa fin → heure = fin + 1 h.
 * Un bord de bloc à 24 (« 20-24 », legacy/UTC) EST déjà minuit : on le normalise
 * à 0 avant +1, sinon 24+1=25 (≥ 24) réafficherait « minuit » au lieu de « 1h ».
 * La valeur 24 (issue d'une fin à 23) reste 24 → « minuit » via lastUpdatedLabel.
 * Retourne null si l'intervalle n'a pas de borne de fin numérique.
 */
export function publicationHourFromInterval(interval: string | null | undefined): number | null {
  const blockEnd = parseInt((interval ?? "").split("-")[1] ?? "", 10);
  return Number.isNaN(blockEnd) ? null : (blockEnd % 24) + 1;
}

/**
 * Date de PUBLICATION à partir de la date de DÉBUT du bloc (`date_montreal_tz`)
 * et de son intervalle. `date_montreal_tz` porte le jour où le bloc COMMENCE ;
 * l'heure de publication (fin + 1 h, cf. `publicationHourFromInterval`) tombe
 * un jour plus tard dès que le bloc traverse minuit — soit qu'il « wrap »
 * (« 23-03 » : fin < début) soit en légacy (« 20-24 » : fin = 24). Sans ce
 * décalage, `lastUpdatedLabel` affiche un jour de retard : un bloc « 23-03 »
 * daté du 6 août, publié à 4h, s'affichait « 6 août, 4h » au lieu de
 * « 7 août, 4h ». Retourne `dateStr` inchangé si l'intervalle est invalide ou
 * ne traverse pas minuit.
 */
export function publicationDateFromInterval(
  dateStr: string,
  interval: string | null | undefined,
): string {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return dateStr;
  const parts = (interval ?? "").split("-");
  const start = parseInt(parts[0] ?? "", 10);
  const end = parseInt(parts[1] ?? "", 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return dateStr;
  const crossesMidnight = end === 24 || end < start;
  if (!crossesMidnight) return dateStr;
  const next = new Date(parsed.y, parsed.m - 1, parsed.d + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
