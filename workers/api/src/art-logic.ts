// Logique PURE du circuit vitrine-art — aucun type Workers ici, exprès : ce
// module est importé par les tests (tests/art.test.ts) qui compilent sous le
// tsconfig racine, lequel ne connaît pas R2Bucket ni ExecutionContext. Même
// parade que schedule.ts pour les tests du cron. Les E/S vivent dans art.ts.

/** Fichiers admis, et leur type MIME. Liste blanche fermée : le bucket ne
 *  sert et ne reçoit rien d'autre, même en devinant un nom d'objet. */
export const ART_FILES: Record<string, string> = {
  'latest.png': 'image/png',
  'latest.webp': 'image/webp',
  'latest.avif': 'image/avif',
  'latest.json': 'application/json; charset=utf-8',
}

/** Même politique que l'ancien public/_headers pour generated-art : l'image
 *  est écrasée en place à URL stable, on la cache court avec tolérance. */
export const ART_CACHE_CONTROL = 'public, max-age=900, stale-while-revalidate=3600'

/** Un PNG 1024×1024 de gpt-image-1 pèse ~1,5 Mo ; 8 Mo laissent de la marge
 *  sans transformer la route en dépôt de fichiers arbitraires. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export interface PublishDecision {
  publish: boolean
  reason: string
}

/** Clé d'appariement d'une illustration à sa Une : la STORYLINE d'abord.
 *
 *  `event_id` change à chaque bloc de 4 h même quand la Une reste la même
 *  histoire ; `storyline_id` la suit à travers les blocs (Jaccard 0.30,
 *  lookback 24 h). Comparer les event_id déclencherait un build — et une
 *  image OpenAI facturée — à chaque cycle sans que rien n'ait changé. */
export function heroKey(meta: { storyline_id?: string | null; event_id?: string | null } | null): string | null {
  if (!meta) return null
  return meta.storyline_id ?? meta.event_id ?? null
}

/** Faut-il déclencher les builds ? Décision pure, testée à part.
 *
 *  `trigger` est SYNC_TRIGGER_DEPLOYS : le même interrupteur maître que la
 *  synchro des données. En phase d'ombre, l'image est stockée mais aucun
 *  build ne part — comportement voulu, identique à sync-athena. */
export function publishDecision(
  currentKey: string | null,
  publishedKey: string | null,
  trigger: string | undefined,
): PublishDecision {
  if (!currentKey) {
    return { publish: false, reason: 'latest.json sans identifiant de Une : rien à publier.' }
  }
  if (currentKey === publishedKey) {
    return { publish: false, reason: `Une inchangée (${currentKey}) : builds inutiles.` }
  }
  if (trigger !== 'true') {
    return { publish: false, reason: 'SYNC_TRIGGER_DEPLOYS ≠ true : phase d’ombre, builds retenus.' }
  }
  return { publish: true, reason: `Nouvelle Une illustrée (${currentKey}).` }
}
