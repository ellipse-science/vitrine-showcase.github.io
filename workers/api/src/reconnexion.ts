/**
 * UNE CONNEXION POSTGRES PAR TABLE, ROUVERTE UNE FOIS SI NEON LA COUPE.
 *
 * POURQUOI. Le 30 septembre 2026 (8 h 10, et aux filets de 0 h 10 et 16 h 10
 * la veille), la première tranche échouait sur ses deux tables :
 *   agora_decideurs_qc         : « Connection terminated unexpectedly »
 *   agora_decideurs_qc_deputes : « Client has encountered a connection error
 *                                 and is not queryable »
 * La tranche ouvrait UNE connexion avant la lecture Athena de sa première
 * table ; restée inactive pendant la requête, elle était coupée côté Neon, et
 * la seconde table héritait d'un client mort. Désormais la connexion s'ouvre
 * APRÈS la lecture Athena, pour une seule table, et une coupure est retentée
 * une fois sur une connexion neuve. La réécriture d'une table est une
 * transaction (TRUNCATE + INSERT) : la rejouer est sans danger.
 *
 * Module sans dépendance, importable par les tests de la racine.
 */

const COUPURES = [
  /connection terminated/i,
  /connection error/i,
  /not queryable/i,
  /econnreset/i,
  /socket (hang up|closed)/i,
  /websocket/i,
]

/** L'erreur vient-elle d'une connexion coupée (et non de la requête elle-même) ? */
export function estCoupureConnexion(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return COUPURES.some((motif) => motif.test(message))
}

/** Ouvre une connexion, exécute `travail`, la ferme toujours. Sur une coupure,
 *  une seule nouvelle tentative, sur une connexion neuve. */
export async function avecReconnexion<C, T>(
  ouvrir: () => Promise<C>,
  fermer: (c: C) => Promise<unknown>,
  travail: (c: C) => Promise<T>,
  quoi: string,
): Promise<T> {
  let client = await ouvrir()
  try {
    return await travail(client)
  } catch (err) {
    if (!estCoupureConnexion(err)) throw err
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`${quoi} : connexion Postgres coupée (${message}), nouvelle tentative`)
    await fermer(client).catch(() => {})
    client = await ouvrir()
    return await travail(client)
  } finally {
    await fermer(client).catch(() => {})
  }
}
