/**
 * DÉLAIS MAXIMAUX des appels réseau de la synchro Athena.
 *
 * POURQUOI. Les 27 et 29 septembre 2026, l'orchestration a été coupée par le
 * runtime : « The Workers runtime canceled this request because it detected
 * that your Worker's code had hung and would never generate a response ».
 * C'est ce qui arrive quand une invocation attend une promesse qui ne se
 * résoudra jamais — typiquement une connexion (WebSocket Neon, HTTP Athena)
 * tombée sans erreur. Aucun appel n'avait de délai : un seul d'entre eux
 * bloquait toute la passe, et les builds n'étaient pas déclenchés.
 *
 * Avec un délai, un blocage devient une ERREUR franche : la table en cause
 * échoue (le tout-ou-rien retient les hooks, la donnée servie est préservée),
 * et la passe suivante recommence. Le minuteur est lui-même une attente
 * active : le runtime ne voit plus une invocation « pendue ».
 *
 * Module sans dépendance : importable par les tests de la racine sans tirer
 * Neon ni aws4fetch dans la compilation (cf. tests/sync-athena.test.ts).
 */

/** Un appel HTTP à Athena (start, état, une page de résultats). */
export const ATHENA_APPEL_MS = 30_000
/** Pages de 1 000 lignes : au-delà, une pagination qui ne finit pas. */
export const ATHENA_PAGES_MAX = 500
/** Connexion Postgres (Neon, WebSocket). */
export const PG_CONNEXION_MS = 20_000
/** Une requête Postgres (la plus lourde : un INSERT de BATCH_ROWS lignes). */
export const PG_REQUETE_MS = 60_000
/** Fermeture de la connexion Postgres, dans un `finally`. */
export const PG_FERMETURE_MS = 10_000
/** Slack, Deploy Hooks, dispatch GitHub. */
export const EXTERNE_MS = 15_000
/** Une tranche (deux tables) appelée par l'orchestrateur. */
export const TRANCHE_MS = 6 * 60_000
/** Toute l'orchestration du cron — sous les 15 min d'un déclencheur Cron. */
export const ORCHESTRATION_MS = 13 * 60_000

export class DelaiDepasse extends Error {
  constructor(quoi: string, ms: number) {
    super(`${quoi} : délai dépassé (${ms} ms)`)
    this.name = 'DelaiDepasse'
  }
}

/** Rejette avec DelaiDepasse si `promesse` ne s'est pas réglée en `ms`. */
export function avecDelai<T>(promesse: Promise<T>, ms: number, quoi: string): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined
  const expiration = new Promise<never>((_, rejeter) => {
    minuteur = setTimeout(() => rejeter(new DelaiDepasse(quoi, ms)), ms)
  })
  return Promise.race([promesse, expiration]).finally(() => {
    if (minuteur !== undefined) clearTimeout(minuteur)
  })
}

/** Temps restant avant l'échéance, jamais négatif. */
export function tempsRestant(echeance: number, maintenant = Date.now()): number {
  return Math.max(0, echeance - maintenant)
}
