// Tables « instantané seul » (#944) : lues dans Athena, déposées dans
// l'instantané R2, jamais dans Postgres ni servies par /v1/data.
//
// Isolé de sync-athena.ts, dépendances INJECTÉES, pour être testé sans Neon
// ni aws4fetch (tests/instantaneSeul.test.ts) : ce module n'importe que des
// fonctions pures. Aucune connexion Postgres n'est possible d'ici, par
// construction.
import { messageDe, resumerErreur } from './reconnexion'
import type { SnapshotTableEntry } from './snapshot-logic'

export interface DependancesInstantane<Ligne, Objet> {
  /** Cycle de la passe ; absent = appel manuel de reprise, rien à écrire. */
  cycle: string | undefined
  /** Vrai quand un seau R2 est lié au Worker. */
  seau: boolean
  lireLignes: () => Promise<Ligne[]>
  typesConnus: () => boolean
  enObjets: (lignes: Ligne[]) => Objet[]
  deposer: (cycle: string, objets: Objet[]) => Promise<SnapshotTableEntry>
}

export type ResultatInstantane =
  | { ok: true; rows: number; snapshot: SnapshotTableEntry }
  | { ok: false; raison: string }

/**
 * Une table instantané seul. Ne lève JAMAIS : tout échec (lecture, garde
 * zéro-ligne, types, dépôt R2) rend `ok: false` avec sa raison. L'appelant la
 * range dans `snapshotSkipped` (Slack), jamais dans `failed` : elle ne retient
 * pas les Deploy Hooks, et le build relit son fichier publié.
 */
export async function synchroniserInstantaneSeul<Ligne, Objet>(
  d: DependancesInstantane<Ligne, Objet>,
): Promise<ResultatInstantane> {
  try {
    if (!d.cycle || !d.seau) throw new Error('passe sans cycle ou sans seau R2 : rien à écrire')
    const lignes = await d.lireLignes()
    // Garde zéro-ligne, jumelle de celle de writeTable : sans sync_state pour
    // comparer, zéro ligne n'est jamais accepté pour ces tables.
    if (lignes.length === 0) throw new Error("0 ligne reçue d'Athena")
    if (!d.typesConnus()) throw new Error('types de colonnes inconnus (régénérer column-types.ts)')
    const snapshot = await d.deposer(d.cycle, d.enObjets(lignes))
    return { ok: true, rows: lignes.length, snapshot }
  } catch (err) {
    return { ok: false, raison: resumerErreur(messageDe(err)) }
  }
}
