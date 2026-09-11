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
 *  CALAGE 2026-09-10 — la passe vise l'heure qui PRÉCÈDE l'édition, minute :53.
 *
 *  Historique en trois temps, parce que chaque calage a corrigé un défaut réel
 *  en en découvrant un autre :
 *
 *  1. Jusqu'au 25-08, la passe tournait à :10 de l'heure de l'édition. Le site
 *     n'affichait l'édition du midi que vers 12h18 — le build partait tard.
 *  2. Du 25-08 au 09-09, elle tournait à :56 de l'heure PRÉCÉDENTE. Mais le
 *     dernier étage de la cascade publiait `headline_events_4h` vers :53 :
 *     trois minutes plus tôt seulement, sous le plancher de cinq minutes de
 *     Glue. La passe lisait encore le bloc PRÉCÉDENT (mesuré le 09-09 par
 *     sonde-worker.yml, à cheval sur la passe de 11h56).
 *  3. Le 09-09 (#775), elle est passée à :02 de l'heure DE l'édition, pour
 *     respecter Glue. Juste pour Glue, faux pour le build : un build Pages prend
 *     cinq à six minutes (médiane mesurée 5,3 min, pire cas 6,1 min), donc une
 *     synchro à 12h02 ne peut PAS être en ligne à 12h00. En retard par
 *     construction — mesuré trois fois : 1 h 03, 1 h 02, 1 h 06.
 *
 *  D'où :53 de l'heure qui précède, qui tient les DEUX contraintes à la fois :
 *  six minutes après la publication de la Une (plancher Glue : cinq) et sept
 *  minutes avant l'heure (le build : cinq à six). Ce créneau n'existait pas
 *  avant aws-infra#572, qui avance la fin de la cascade de :53 à :47. Les deux
 *  contraintes sont tenues par tests/cron-schedule.test.ts.
 *
 *  ⚠️ La passe utile et le filet ne visent donc PLUS les mêmes heures : la
 *  passe utile tombe dans l'heure qui précède l'édition, le filet à l'heure de
 *  l'édition elle-même (ATHENA_FILET_HOURS_NY). Ne pas les réaligner : c'est
 *  précisément l'erreur de #775. */
export const ATHENA_TARGET_HOURS_NY = [23, 3, 7, 11, 15, 19]

/** Heures UTC enregistrées pour le sync Athena. Doit rester d'accord avec
 *  `crons` dans wrangler.toml : {23,3,7,11,15,19} à New York = ces douze heures
 *  UTC, été (UTC-4) et hiver (UTC-5) confondus. */
export const ATHENA_REGISTERED_UTC_HOURS = [0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23]

export function isAthenaTargetHourInNY(now: Date): boolean {
  return ATHENA_TARGET_HOURS_NY.includes(hourInNY(now))
}

/** Heures visées de la passe FILET, en heure de New York : l'heure DE
 *  l'édition. Depuis le calage du 10-09 elles DIFFÈRENT de celles de la passe
 *  utile, qui tombe dans l'heure d'avant : le filet repasse après l'heure pour
 *  rattraper un cycle où la cascade n'avait rien publié à :53. */
export const ATHENA_FILET_HOURS_NY = [0, 4, 8, 12, 16, 20]

/** Heures UTC enregistrées pour la passe filet. */
export const ATHENA_FILET_REGISTERED_UTC_HOURS = [0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21]

export function isAthenaFiletHourInNY(now: Date): boolean {
  return ATHENA_FILET_HOURS_NY.includes(hourInNY(now))
}

/** Minutes auxquelles le sync Athena tourne : la passe utile et son filet.
 *
 *  :53 — la passe utile, dans l'heure qui PRÉCÈDE l'édition : six minutes après
 *        la publication de la Une (:47), sept minutes avant l'heure. Le build
 *        qu'elle déclenche finit vers :59.
 *  :10 — le filet, à l'heure DE l'édition, pour les cycles où la cascade avait
 *        pris du retard et n'avait rien publié à :53.
 *
 *  :10 ne court aucun risque de 304 (« un déploiement est déjà en file ») : il
 *  tombe dix-sept minutes après la passe utile, bien après la fin de son build
 *  (pire cas mesuré : 6,1 min). C'était la raison du :20 de #775, dont la passe
 *  utile à :02 avait encore son build en file à :10 ; elle ne tient plus. */
export const ATHENA_SYNC_MINUTES = [53, 10] as const

/** Le déclenchement courant doit-il lancer le sync Athena ? Répond en tenant
 *  compte de la MINUTE (quelle passe) ET de l'heure locale (le bon calage). */
export function shouldRunAthenaSync(now: Date): boolean {
  const minute = now.getUTCMinutes()
  if (minute === 53) return isAthenaTargetHourInNY(now)
  if (minute === 10) return isAthenaFiletHourInNY(now)
  return false
}
