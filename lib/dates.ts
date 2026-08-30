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

/** L'instant d'une passe de raffineur, ramené à l'heure de Montréal.
 *
 *  POURQUOI CE HELPER EXISTE. Les tables des modules republiés six fois par
 *  jour portent l'instant de leur passe en UTC — `computed_at` pour les partis,
 *  la colonne `tag` pour les 12 enjeux (« 2026-08-27 19:37 », vérifié UTC le
 *  2026-08-30 : le tag `03:36` porte `pass: pm`, ce qui n'a de sens qu'à 23h36
 *  à Montréal). C'est l'exception admise par la règle « heure de Montréal
 *  partout » : une clé d'ordre de stepper reste en UTC. Rien n'interdit donc
 *  cet UTC-là, mais rien n'autorise à l'AFFICHER tel quel.
 *
 *  ⚠️ L'écart n'est pas −4 h : c'est −4 l'été et −5 l'hiver. D'où `Intl` et sa
 *  base de fuseaux, jamais une soustraction.
 *
 *  ⚠️ La date et l'heure sortent du MÊME instant. Les tirer de deux sources
 *  (une `date_utc` d'un côté, une heure convertie de l'autre) les fait diverger
 *  d'un jour pour toute passe entre 00h et 04h UTC, où Montréal est encore la
 *  veille — le libellé annonce alors le bon horaire au mauvais jour.
 *
 *  Rend `null` si l'entrée n'est pas un instant exploitable ; l'appelant
 *  retombe alors sur la date seule, comme avant.
 */
export function momentMontreal(instantUtc: string | null | undefined): { date: string; heure: number } | null {
  const brut = String(instantUtc ?? "").trim();
  if (!brut) return null;
  // « 2026-08-27 19:37 » n'est pas de l'ISO : sans le `T` ni le `Z`, JS le lit
  // comme une heure LOCALE de la machine de build, qui n'est pas Montréal en CI.
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(brut)
    ? `${brut.slice(0, 10)}T${brut.slice(11, 16)}:00Z`
    : brut;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  }).formatToParts(d);
  const champ = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  const heure = Number(champ("hour").replace(/\D/g, ""));
  const date = `${champ("year")}-${champ("month")}-${champ("day")}`;
  if (Number.isNaN(heure) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // `hour12: false` rend « 24 » à minuit dans certaines versions d'ICU ;
  // `lastUpdatedLabel` sait le lire (« minuit »), mais la DATE, elle, serait
  // celle du jour qui commence. On normalise pour que les deux se tiennent.
  return { date, heure: heure % 24 };
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
  if (!parsed) return "Dernière mise à jour du module : —"; // garde-redaction: ok (tiret = glyphe de donnée absente)
  const dateFr = formatDateFr(dateStr);
  const dateLower = dateFr.charAt(0).toLowerCase() + dateFr.slice(1);
  if (blockEndHour == null || Number.isNaN(blockEndHour)) {
    return `Dernière mise à jour du module : ${dateLower}`;
  }
  const hourLabel = blockEndHour >= 24 ? "minuit" : `${blockEndHour}h`;
  return `Dernière mise à jour du module : ${dateLower}, ${hourLabel}`;
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
