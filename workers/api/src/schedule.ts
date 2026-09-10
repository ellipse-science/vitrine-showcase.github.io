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
 *  CALAGE 2026-09-09 (#570) — la passe vise l'heure DE l'édition, minute :02.
 *
 *  Historique en deux temps, parce que les deux premiers calages ont chacun
 *  corrigé un défaut réel en en découvrant un autre :
 *
 *  1. Jusqu'au 25-08, la passe tournait à :10 de l'heure de l'édition. Le site
 *     n'affichait l'édition du midi que vers 12h18 — le build partait tard.
 *  2. Du 25-08 au 09-09, elle tournait à :56 de l'heure PRÉCÉDENTE, pour que
 *     le build finisse autour de l'heure pile. Mais le dernier étage de la
 *     cascade publie `headline_events_4h` vers :53 : trois minutes plus tôt
 *     seulement. Glue/Athena n'a pas rattrapé en trois minutes, et la passe
 *     lisait donc encore le bloc PRÉCÉDENT.
 *
 *  MESURE DU 09-09 qui tranche (sonde-worker.yml, à cheval sur la passe de
 *  11h56) : raffineur à 11h53, passe à 11h56, build à 11h58 — et ce build
 *  affichait l'édition d'AVANT. Le `synced_at` de `headline_events_4h` est
 *  12h11, c'est-à-dire la passe filet, pas 11h56. Résultat : chaque édition
 *  était bâtie sur la donnée de la précédente, et il fallait attendre le filet
 *  GitHub de :50 pour qu'un build lise la bonne — environ une heure de retard,
 *  six fois par jour, tous les jours.
 *
 *  Ce n'était donc PAS un défaut des Deploy Hooks : la même mesure montre
 *  qu'ils tirent bien un build prod (identifiant de build Next changé, aucun
 *  workflow GitHub entre-temps). C'est ce qui clôt la question 1 de #570.
 *
 *  D'où :02 de l'heure de l'édition — environ neuf minutes après la
 *  publication du raffineur. C'est la même contrainte que celle déjà connue
 *  ailleurs dans l'écosystème : il faut AU MOINS CINQ MINUTES entre la
 *  publication d'un raffineur et la lecture qui suit, sinon on lit un
 *  watermark périmé et on court avec Glue. Neuf minutes laissent une marge de
 *  quatre minutes sur ce plancher.
 *
 *  ⚠️ Les heures visées AVANCENT donc d'une heure — {0,4,8,12,16,20} au lieu
 *  de {23,3,7,11,15,19} — et rejoignent celles du filet. Les deux passes ont
 *  désormais les MÊMES heures visées, ce qui est correct et voulu : ce sont
 *  les MINUTES qui les distinguent. Ne pas « corriger » cette égalité en
 *  décalant l'une des deux d'une heure : c'est le calage :56 qu'on retirerait. */
export const ATHENA_TARGET_HOURS_NY = [23, 3, 7, 11, 15, 19]

/** Heures UTC enregistrées pour le sync Athena. Doit rester d'accord avec
 *  `crons` dans wrangler.toml : {0,4,8,12,16,20} à New York = ces douze heures
 *  UTC, été (UTC-4) et hiver (UTC-5) confondus. */
export const ATHENA_REGISTERED_UTC_HOURS = [0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23]

export function isAthenaTargetHourInNY(now: Date): boolean {
  return ATHENA_TARGET_HOURS_NY.includes(hourInNY(now))
}

/** Heures visées de la passe FILET, en heure de New York.
 *
 *  Identiques à celles de la passe utile depuis le calage du 09-09 : les deux
 *  tombent sur l'heure DE l'édition et ne se distinguent que par la minute. */
export const ATHENA_FILET_HOURS_NY = [0, 4, 8, 12, 16, 20]

/** Heures UTC enregistrées pour la passe filet. */
export const ATHENA_FILET_REGISTERED_UTC_HOURS = [0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21]

export function isAthenaFiletHourInNY(now: Date): boolean {
  return ATHENA_FILET_HOURS_NY.includes(hourInNY(now))
}

/** Minutes auxquelles le sync Athena tourne : la passe utile et son filet.
 *
 *  :02 — la passe utile, environ neuf minutes après la publication du
 *        raffineur (:53). Le build qu'elle déclenche démarre vers :04.
 *  :20 — le filet, pour les cycles où la cascade avait pris du retard et
 *        n'avait rien publié à :02.
 *
 *  POURQUOI :20 ET NON :10 : un build Pages dure six à huit minutes, donc
 *  celui de :04 est encore en file jusque vers :12. Cloudflare répond 304 à un
 *  hook tiré pendant ce temps — « un déploiement est déjà en file » — et le
 *  filet ne rebâtirait rien. À :20 il tombe après, et garde donc son pouvoir
 *  de rattrapage. L'écart de dix-huit minutes reprend d'ailleurs celui que le
 *  filet avait avant (:56 -> :10, quatorze minutes). */
export const ATHENA_SYNC_MINUTES = [53, 10] as const

/** Le déclenchement courant doit-il lancer le sync Athena ? Répond en tenant
 *  compte de la MINUTE (quelle passe) ET de l'heure locale (le bon calage). */
export function shouldRunAthenaSync(now: Date): boolean {
  const minute = now.getUTCMinutes()
  if (minute === 53) return isAthenaTargetHourInNY(now)
  if (minute === 10) return isAthenaFiletHourInNY(now)
  return false
}
