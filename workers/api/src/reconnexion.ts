/**
 * UNE CONNEXION POSTGRES PAR TABLE, ROUVERTE UNE FOIS SI ELLE EST COUPÉE.
 *
 * CE QUI A ÉTÉ OBSERVÉ. Aux filets de 16 h 10 (29 septembre 2026), 0 h 10 et
 * 8 h 10 (30 septembre), la première tranche échouait sur ses deux tables :
 *   agora_decideurs_qc         : « Connection terminated unexpectedly »
 *   agora_decideurs_qc_deputes : « Client has encountered a connection error
 *                                 and is not queryable »
 * La tranche ouvrait UNE connexion pour toutes ses tables : la seconde
 * héritait d'un client déjà mort.
 *
 * CE QUI N'EST PAS ÉTABLI. Chez Neon, « Connection terminated unexpectedly »
 * vise une requête EN COURS au moment de la coupure : la connexion est donc
 * tombée pendant l'écriture de la première table, pas forcément pendant la
 * lecture Athena qui la précédait. Si la coupure tient à cette table, la
 * nouvelle tentative échouera de la même façon ; les journaux (étape et durée
 * depuis l'ouverture, cf. writeTable) le diront.
 *
 * CE QUE CE MODULE GARANTIT : une table ne contamine plus la suivante (une
 * connexion chacune, fermée exactement une fois), et une coupure est retentée
 * UNE fois sur une connexion neuve. La réécriture d'une table est une
 * transaction (TRUNCATE + INSERT + recomptage) : la rejouer est sans danger,
 * même après un COMMIT réussi dont la réponse s'est perdue.
 *
 * Module sans dépendance, importable par les tests de la racine.
 */

/** Messages connus d'une connexion coupée (Neon serverless / node-postgres). */
const COUPURES = [
  /^Connection terminated/,
  /is not queryable$/,
  /\bECONNRESET\b/,
]

/** Texte d'une erreur, y compris un Event WebSocket (qui n'est pas un Error). */
export function messageDe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m.length > 0) return m
    const type = (err as { type?: unknown }).type
    if (typeof type === 'string') return `événement « ${type} » de la connexion`
  }
  return String(err)
}

/** L'erreur vient-elle d'une connexion coupée (et non de la requête elle-même) ?
 *  Un Event WebSocket « error » en est une par nature. */
export function estCoupureConnexion(err: unknown): boolean {
  if (!(err instanceof Error) && err && typeof err === 'object' &&
      (err as { type?: unknown }).type === 'error') return true
  const message = messageDe(err)
  return COUPURES.some((motif) => motif.test(message))
}

/** Message d'erreur publiable (Slack, réponse HTTP) : chaînes de connexion et
 *  clés d'accès masquées, longueur bornée. */
export function resumerErreur(message: string, max = 300): string {
  const masque = message
    .replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://***')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***')
    .replace(/\s+/g, ' ')
    .trim()
  return masque.length > max ? `${masque.slice(0, max - 1)}…` : masque
}

/** Ouvre une connexion, exécute `travail`, la ferme (une seule fois). Sur une
 *  coupure, UNE nouvelle tentative, sur une connexion neuve. */
export async function avecReconnexion<C, T>(
  ouvrir: () => Promise<C>,
  fermer: (c: C) => Promise<unknown>,
  travail: (c: C) => Promise<T>,
  quoi: string,
): Promise<T> {
  const tentative = async (): Promise<T> => {
    const client = await ouvrir()
    try {
      return await travail(client)
    } finally {
      await fermer(client).catch(() => {})
    }
  }
  try {
    return await tentative()
  } catch (err) {
    if (!estCoupureConnexion(err)) throw err
    console.warn(`${quoi} : connexion Postgres coupée (${messageDe(err)}), nouvelle tentative`)
    return await tentative()
  }
}
