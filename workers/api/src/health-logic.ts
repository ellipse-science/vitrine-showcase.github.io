/* ───────────────────────────────────────────────────────────────────────────
   /v1/health NE SURVEILLE QUE LES TABLES QU'ON SYNCHRONISE (10-09)

   Le build juge la chaîne vivante sur la synchro LA PLUS ANCIENNE de
   /v1/health (lib/data/source.ts, seuil 6 h) : au-delà, il abandonne l'API et
   lit les fichiers du filet GitHub. Or une table retirée de la synchro garde sa
   ligne dans vitrine.sync_state, figée à sa dernière passe.

   C'est arrivé : 9915f80e (03-09) a retiré les tables parties_score, leurs
   lignes ont vieilli, et dès le 04-09 chaque build a jugé l'API « périmée » —
   « synchro la plus ancienne il y a 8677 min » le 10-09. Six jours d'éditions
   livrées par le seul filet, une heure après l'heure, alors que le Worker
   synchronisait à temps des données que personne ne lisait.

   Une table SUIVIE qui cesse de synchroniser vieillit toujours la réponse :
   c'est le signal que /v1/health existe pour donner. Seules les tables que le
   Worker ne synchronise plus sortent du calcul — nommées dans `hors_synchro`,
   pour que leur retrait reste visible au lieu d'être avalé.
   ─────────────────────────────────────────────────────────────────────────── */

const horodatage = (v: unknown): number => (v instanceof Date ? v.getTime() : Date.parse(String(v)))

export function santeDesTables<T extends Record<string, unknown>>(
  lignes: T[],
  synchronisees: Iterable<string>,
): { suivies: T[]; horsSynchro: string[]; plusAncienne: unknown } {
  const actives = new Set(synchronisees)
  const suivies = lignes.filter((l) => actives.has(String(l.table_name)))
  const horsSynchro = lignes.filter((l) => !actives.has(String(l.table_name))).map((l) => String(l.table_name))
  let plusAncienne: T | null = null
  for (const l of suivies) {
    if (plusAncienne === null || horodatage(l.synced_at) < horodatage(plusAncienne.synced_at)) plusAncienne = l
  }
  return { suivies, horsSynchro, plusAncienne: plusAncienne ? plusAncienne.synced_at : null }
}
