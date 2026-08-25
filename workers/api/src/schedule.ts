// Choix de l'heure d'exécution du cron, isolé ici pour être testable.
//
// Ce fichier ne dépend NI du runtime Cloudflare, NI de Postgres — uniquement de
// `Intl` et `Date`. C'est ce qui permet de le couvrir depuis la suite de tests
// du dépôt (tests/cron-schedule.test.ts) sans monter un Worker.

/** Heures visées, en HEURE DE NEW YORK. */
export const TARGET_HOURS_NY = [2, 6, 10, 14, 18, 22]

/** Heures UTC enregistrées comme Cron Triggers : les deux jeux, été et hiver.
 *  Doit rester d'accord avec `crons` dans wrangler.toml. */
export const REGISTERED_UTC_HOURS = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23]

/** Heure locale à New York, pour un instant donné. */
export function hourInNY(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  )
}

/** Ce déclenchement tombe-t-il sur une heure visée à New York ?
 *
 *  POURQUOI CE GARDE-FOU EXISTE : le cron Cloudflare est en UTC, et UTC ignore
 *  l'heure avancée. Un horaire UTC fixe dérive donc d'une heure deux fois par
 *  an. Plutôt qu'un changement manuel semestriel — qui finit toujours par être
 *  oublié, et dont l'oubli est silencieux — on enregistre les DEUX jeux
 *  d'heures UTC et ce test laisse passer seulement ceux qui tombent juste.
 *
 *  Douze déclenchements par jour, dont six ressortent sans rien faire. Le coût
 *  est nul et l'horaire local ne bouge jamais, y compris les nuits de bascule.
 *
 *  C'est `Intl` qui sait si America/New_York est à UTC-4 ou UTC-5 aujourd'hui,
 *  via la base des fuseaux — pas nous, et pas une date en dur. */
export function isTargetHourInNY(now: Date): boolean {
  return TARGET_HOURS_NY.includes(hourInNY(now))
}

/** Heures visées du sync DIRECT Athena (chaîne émancipée de GitHub), en heure
 *  de New York.
 *
 *  DÉCALAGE 2026-08-25 (#570) : le sync tournait à la minute :10 de l'heure
 *  SUIVANT l'édition — 12h10 pour l'édition du midi, plus 6 à 8 min de build :
 *  le site ne l'affichait que vers 12h18 (mesuré le 21-08, « l'édition de 16h
 *  en ligne ~16h20-16h24 »). Il vise maintenant la minute :56 de l'heure qui
 *  PRÉCÈDE — 11h56 pour l'édition du midi : le dernier étage de la cascade
 *  (radar-event-salience, :51) a publié vers :53, et le build a le temps de
 *  finir autour de l'heure pile.
 *
 *  Les heures visées reculent donc d'une heure — {23,3,7,11,15,19} au lieu de
 *  {0,4,8,12,16,20} — et le cron passe de :10 à :56 dans wrangler.toml. Le
 *  garde-fou été/hiver ne change pas de principe : c'est `Intl` qui sait si
 *  New York est à UTC-4 ou UTC-5.
 *
 *  Le cron :10 est CONSERVÉ en filet : si la cascade a pris du retard et
 *  n'avait rien publié à :56, la passe suivante rattrape 14 minutes plus tard.
 *  C'est ce double appel qui rendait le hook 304 fatal — corrigé dans la même
 *  série (#582), donc sans danger désormais. */
export const ATHENA_TARGET_HOURS_NY = [23, 3, 7, 11, 15, 19]

/** Heures UTC enregistrées pour le sync Athena. Doit rester d'accord avec
 *  `crons` dans wrangler.toml : {23,3,7,11,15,19} à New York = ces douze
 *  heures UTC, été et hiver confondus. */
export const ATHENA_REGISTERED_UTC_HOURS = [0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23]

export function isAthenaTargetHourInNY(now: Date): boolean {
  return ATHENA_TARGET_HOURS_NY.includes(hourInNY(now))
}
