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
 *  jour portent l'instant de leur passe sous trois formes : un instant ISO avec
 *  fuseau (`computed_at` pour les partis, à ramener à Montréal), un `tag` sans
 *  fuseau pour les 12 enjeux (« 2026-09-02 19:37 », qui EST l'heure de Montréal,
 *  voir plus bas), et une date seule pour le `jour` d'un article. Une seule
 *  lecture pour les trois, sinon chaque appelant réinvente la conversion — et
 *  se trompe de quatre heures ou d'un jour.
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
function momentMontrealDetail(horodatage: string | null | undefined): { date: string; heure: number; minute: number } | null {
  const brut = String(horodatage ?? "").trim();
  if (!brut) return null;
  // « 2026-09-02 19:37 » est l'HORLOGE DE MONTRÉAL, pas de l'UTC : le raffineur
  // écrit `format(Sys.time(), "%Y-%m-%d %H:%M")` dans une image réglée sur
  // America/Toronto. Preuve du 2026-09-02 : la Lambda radar-issues-score tourne
  // à 3h36, 7h36, 11h36, 15h36, 19h36 et 23h36 (CloudWatch, heure de Montréal)
  // et ses tags disent 03:36, 07:36, 11:37, 15:36, 19:37, 23:37. Le premier jet
  // (2026-08-30) collait un `Z` à cette forme et reculait tout de quatre heures :
  // le module des 12 enjeux annonçait « 16h » pour la passe de 19h37, servie à
  // 20h, et datait la passe de 3h36 de la veille à minuit. Une chaîne sans
  // fuseau se lit donc telle quelle, sans conversion.
  //
  // Un ISO complet (`Z` ou décalage, comme `computed_at`) passe par
  // `Date.parse`, qui sait le lire, puis est ramené à Montréal ci-dessous.
  const sansFuseau = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/.exec(brut);
  if (sansFuseau) {
    const [, y, mo, jour, h, mi] = sansFuseau;
    const heure = Number(h);
    // Mois 13, 31 février, 25h ou 99 min : mieux vaut « — » qu'une étiquette fausse.
    if (!jourCivilValide(y, mo, jour) || heure > 23 || Number(mi) > 59) return null;
    return { date: `${y}-${mo}-${jour}`, heure, minute: Number(mi) };
  }
  // Une DATE SEULE (« 2026-09-05 ») est un JOUR de Montréal, pas un instant :
  // c'est le `jour` des articles du module des 12 enjeux, et le point quotidien
  // des frises Semaine et Campagne. `Date.parse` la lirait comme minuit UTC,
  // soit la VEILLE à 20h à Montréal : chaque point reculait d'un jour (« 4 sept. »
  // pour les articles du 5) et le premier jour de chaque fenêtre tombait hors du
  // filtre (vu le 2026-09-05). Un jour se lit donc tel quel, à l'heure 0.
  const dateSeule = /^(\d{4})-(\d{2})-(\d{2})$/.exec(brut);
  if (dateSeule) {
    const [, y, mo, jour] = dateSeule;
    return jourCivilValide(y, mo, jour) ? { date: `${y}-${mo}-${jour}`, heure: 0, minute: 0 } : null;
  }
  const t = Date.parse(brut);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  // `America/Montreal` et `hourCycle: "h23"` : les mêmes que le formateur de
  // `headlineEvents.ts`, le voisin immédiat de ce helper. Le dépôt est partagé
  // entre les deux identifiants (Toronto dans `parties.ts` et `EditionNav`,
  // Montréal ici et dans le journal) — ils désignent la même zone, mais autant
  // que la date et l'heure d'un même module sortent du même moule. `h23` plutôt
  // que `hour12: false` : certaines versions d'ICU rendent « 24 » à minuit.
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const champ = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  const heure = Number(champ("hour").replace(/\D/g, ""));
  const minute = Number(champ("minute").replace(/\D/g, ""));
  const date = `${champ("year")}-${champ("month")}-${champ("day")}`;
  if (Number.isNaN(heure) || Number.isNaN(minute) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  // Ceinture et bretelles : `h23` borne déjà à 00-23, mais un « 24 » venu d'une
  // ICU récalcitrante donnerait une heure du jour SUIVANT collée à la date du
  // jour courant. Le modulo garantit que les deux se tiennent.
  return { date, heure: heure % 24, minute };
}

export function momentMontreal(horodatage: string | null | undefined): { date: string; heure: number } | null {
  const m = momentMontrealDetail(horodatage);
  return m ? { date: m.date, heure: m.heure } : null;
}

/** Un jour du calendrier qui existe : rejette le 30 février et le mois 13, que
 *  `Date.UTC` accepterait en débordant sur le mois suivant. */
function jourCivilValide(y: string, mo: string, jour: string): boolean {
  const ref = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(jour)));
  return ref.getUTCMonth() + 1 === Number(mo) && ref.getUTCDate() === Number(jour);
}

/** L'heure PUBLIQUE d'une passe de raffineur, à partir de son instant.
 *
 *  ⚠️ LA RÈGLE, et l'erreur qu'elle corrige (2026-08-30). Un module publié six
 *  fois par jour n'affiche PAS l'heure à laquelle son raffineur a tourné : il
 *  affiche l'heure de l'ÉDITION, prise sur la grille {0, 4, 8, 12, 16, 20} que
 *  le bandeau du site montre déjà. Une passe qui tourne à 15h37 traite le bloc
 *  qui s'est terminé à 15h, et ce bloc est servi à 16h : c'est « 16h » qu'il
 *  faut écrire, jamais « 15h ». Même règle que `publicationHourFromInterval`
 *  (heure = fin du bloc + 1 h, réforme #195 et correctif #317), appliquée ici à
 *  un instant plutôt qu'à un intervalle.
 *
 *  Le premier jet affichait l'heure brute de la passe. Rien ne l'a signalé,
 *  parce que les tables de libellés (`MOMENT_AUJ`) ont un repli `${h}h` pour
 *  les heures hors grille : le module annonçait « 15h » et « depuis 11h » au
 *  lieu de « 16h » et « depuis 12h », sans qu'aucun test ne tombe. La grille
 *  elle-même était l'indice : une heure de publication n'est JAMAIS hors d'elle.
 *
 *  Rend 24 (et non 0) pour minuit, comme `publicationHourFromInterval` : c'est
 *  ce que `lastUpdatedLabel` attend pour écrire « minuit ».
 *  Rend `null` si l'instant n'est pas exploitable.
 */
export function heurePublicationMontreal(horodatage: string | null | undefined): { date: string; heure: number } | null {
  const m = momentMontreal(horodatage);
  if (!m) return null;
  // Bloc de 4 h contenant la passe → sa fin → +1 h. 15h37 tombe dans le bloc
  // 12-16, servi à 16h. 23h36 tombe dans 20-24, servi à minuit (24, pas 0).
  return { date: m.date, heure: (Math.floor(m.heure / 4) + 1) * 4 };
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
 * `blockEndHour` (heure d'ÉDITION, heure Mtl) : 16 → « , 16h » ; 24 → « , minuit ».
 * Heure compacte « 4h » (pas « 4 h ») : l'indicateur est rendu en
 * mono-majuscules et l'espace donnait « 4 H », jugé laid — format 24 h, pas
 * de am/pm. Les tables journalières/hebdo (assemblée, polimètre) n'affichent
 * que la date — l'heure n'existe pas dans leur donnée.
 *
 * RÈGLE (Adrien, 2026-09-06) : L'HEURE AFFICHÉE EST CELLE DE LA DONNÉE, JAMAIS
 * CELLE D'UN CALCUL. Une passe de raffineur qui republie une donnée figée ne
 * fait pas avancer l'heure : c'est ainsi qu'un retard se voit à l'écran, et que
 * le public peut le signaler. Pour la Une et Deux solitudes, c'est le dernier
 * bloc de la table ; pour les 12 enjeux et les partis, c'est l'édition du plus
 * récent article annoté (`editionDeLaDonnee`), et jamais le `tag` de la passe.
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

/** Le lendemain d'une date ISO « YYYY-MM-DD » (calendrier, pas fuseau). */
function jourSuivantIso(dateStr: string): string {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return dateStr;
  const next = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d + 1));
  return next.toISOString().slice(0, 10);
}

export type Edition = { date: string; heure: number };

/**
 * L'ÉDITION à laquelle appartient un instant de DONNÉE.
 *
 * Complément de `heurePublicationMontreal`, qui date une PASSE de raffineur —
 * un instant APRÈS la fin du bloc. Ici l'instant est DANS le bloc : la dernière
 * capture d'un article en Une (`headline_stop_utc`). Les blocs de collecte
 * commencent à 3h, 7h, 11h, 15h, 19h et 23h (heure de Montréal, soit 7h, 11h…
 * UTC), et chacun est servi une heure après sa fin : 8h, 12h, 16h, 20h, minuit
 * et 4h — la grille du bandeau des éditions.
 *
 * Bornes : un instant EXACTEMENT sur une frontière (15h00) appartient au bloc
 * qui FINIT là (11h-15h, servi à 16h) — c'est la dernière capture possible de
 * ce bloc, pas la première du suivant. Le bloc 19h-23h est servi à minuit →
 * `{ date, heure: 24 }`, « minuit » sous le jour qui finit, comme partout. Le
 * bloc 23h-3h franchit minuit → servi à 4h le LENDEMAIN, la date avance.
 *
 * POURQUOI ÇA EXISTE (2026-09-06). Pendant une panne d'INFER, les 12 enjeux
 * ont affiché « dimanche 6 septembre, 12h » alors que le dernier article annoté
 * datait de la veille à 15h52 : l'heure venait du tag de la passe, qui
 * continuait d'avancer sur une donnée figée. Rend `null` si l'instant n'est
 * pas exploitable.
 */
export function editionDeLaDonnee(horodatage: string | null | undefined): Edition | null {
  const m = momentMontrealDetail(horodatage);
  if (!m) return null;
  const minutes = m.heure * 60 + m.minute;
  // (3h00, 7h00] → 0, (7h00, 11h00] → 1 … (23h00, 27h00] → 5 ; jusqu'à 3h00
  // inclus → -1, le bloc 23h-3h commencé la veille.
  const bloc = Math.floor((minutes - 181) / 240);
  const heure = 3 + 4 * bloc + 4 + 1; // fin du bloc + 1 h : 8, 12, 16, 20, 24, 28 ; -1 → 4
  if (heure > 24) return { date: jourSuivantIso(m.date), heure: heure - 24 };
  return { date: m.date, heure };
}

/** Clé d'ordre d'une édition : « 2026-09-05, minuit (24) » vient avant
 *  « 2026-09-06, 4h ». Sert à comparer deux éditions, jamais à les afficher. */
export function cleEdition(e: Edition): number {
  const parsed = parseIsoDate(e.date);
  if (!parsed) return Number.NaN;
  return Date.UTC(parsed.y, parsed.m - 1, parsed.d) + e.heure * 3_600_000;
}

/** La plus ANCIENNE de deux éditions — celle qu'un module peut honnêtement
 *  annoncer quand sa donnée passe par deux étages : il n'est jamais plus frais
 *  que le plus lent des deux. `null` des deux côtés → `null`. */
export function plusAncienneEdition(a: Edition | null, b: Edition | null): Edition | null {
  if (!a) return b;
  if (!b) return a;
  const ka = cleEdition(a);
  const kb = cleEdition(b);
  if (Number.isNaN(ka)) return b;
  if (Number.isNaN(kb)) return a;
  return kb < ka ? b : a;
}
