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
 *  de New York : minute 10 de l'heure qui SUIT la fin de cascade des
 *  raffineurs ({23,03,07,11,15,19} Montréal, dernier étage vers :57). Même
 *  double-jeu été/hiver que ci-dessus, même garde-fou. */
export const ATHENA_TARGET_HOURS_NY = [0, 4, 8, 12, 16, 20]

/** Heures UTC enregistrées pour le sync Athena (minute 10). Doit rester
 *  d'accord avec `crons` dans wrangler.toml. */
export const ATHENA_REGISTERED_UTC_HOURS = [0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21]

export function isAthenaTargetHourInNY(now: Date): boolean {
  return ATHENA_TARGET_HOURS_NY.includes(hourInNY(now))
}
