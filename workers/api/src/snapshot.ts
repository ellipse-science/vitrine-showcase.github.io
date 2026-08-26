// /v1/snapshot — les lignes des tables, servies depuis R2, JAMAIS depuis
// Postgres.
//
// POURQUOI CETTE ROUTE EXISTE (incident du 2026-08-26). Le build du site
// lisait ses données par /v1/datasets, qui interroge Neon à chaque appel :
// la route ne peut pas être mise en cache partagé (sa réponse dépend de la
// clé appelante) et le build ajoutait `Cache-Control: no-cache` par-dessus,
// pour de bonnes raisons. Chaque build tirait donc ~9,6 Mo de Postgres. À
// ~85 builds par jour — dont deux tiers de simples aperçus de branche — cela
// a consommé les 5 Go mensuels de transfert de Neon en huit jours, et la base
// a cessé de répondre : API publique en erreur 500, classement du jeu vide,
// synchro Athena en échec à chaque cycle.
//
// LE CONSTAT QUI COMMANDE LA SOLUTION : la synchro TIENT DÉJÀ ces lignes en
// mémoire quand elle les écrit dans Postgres. Les redemander à Postgres
// ensuite était un aller-retour gratuit. Elles sont désormais déposées AU
// PASSAGE dans R2, et le build les y lit. Neon redevient ce que le document
// de direction décrit — le magasin de service de l'API — au lieu d'être la
// source de données du build.
//
// TROIS PROPRIÉTÉS À NE PAS PERDRE
//
// 1. AUCUN APPEL À POSTGRES SUR CE CHEMIN, y compris pour l'authentification.
//    C'est le cœur du correctif : `authenticate()` lit la table des clés dans
//    Neon, donc s'en servir ici rendrait le build à nouveau tributaire de la
//    santé de la base — exactement la panne qu'on répare. Le jeton est
//    comparé à un secret du Worker, rien d'autre.
//
// 2. FERMÉ PAR DÉFAUT. Sans SNAPSHOT_TOKEN posé, la route répond 503 et ne
//    sert RIEN. Les jeux de données sont le produit (cf. api-direction.md) :
//    un instantané ouvert les distribuerait intégralement et gratuitement.
//
// 3. UN CYCLE EST ATOMIQUE POUR LE LECTEUR. Les tables sont écrites sous
//    `data/snapshot/<cycle>/`, et le manifeste — seul point d'entrée — n'est
//    écrit qu'une fois les 15 tables déposées. Un build ne peut donc pas lire
//    une passe à moitié remplacée, ni un mélange de deux cycles.

import {
  MANIFEST_KEY,
  SNAPSHOT_PREFIX,
  cyclesToPrune,
  resolveSnapshotKey,
  tableKey,
  type SnapshotManifest,
  type SnapshotTableEntry,
} from './snapshot-logic'

export {
  KEEP_CYCLES,
  MANIFEST_KEY,
  SNAPSHOT_PREFIX,
  castValue,
  cycleId,
  cyclesToPrune,
  hasColumnTypes,
  manifestIsFresh,
  resolveSnapshotKey,
  rowsToObjects,
  tableKey,
  type SnapshotManifest,
} from './snapshot-logic'

export interface SnapshotEnv {
  ART_BUCKET?: R2Bucket
  /** Jeton du build pour lire l'instantané. Comparé ICI, jamais dans
   *  Postgres — cf. propriété 1 de l'en-tête. Posé hors du dépôt :
   *  `wrangler secret put SNAPSHOT_TOKEN`. */
  SNAPSHOT_TOKEN?: string
}

/** Comparaison à temps constant. Le jeton n'est pas un secret de haute
 *  valeur, mais une comparaison naïve fuit sa longueur et son préfixe, et
 *  l'écrire correctement coûte quatre lignes. */
function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      // Jamais de cache partagé : la réponse est sous jeton. Le build n'en a
      // pas besoin — R2 sert déjà ces octets sans toucher à Postgres, ce qui
      // était tout l'objet du correctif.
      'cache-control': 'no-store',
    },
  })
}

/** Dépose les lignes d'UNE table pour le cycle courant.
 *
 *  Appelée par la tranche de synchro juste après le COMMIT Postgres : la
 *  table n'entre dans l'instantané que si elle est entrée dans la base, donc
 *  les deux ne peuvent pas diverger. */
export async function putTableSnapshot(
  bucket: R2Bucket,
  cycle: string,
  table: string,
  objects: Record<string, unknown>[],
): Promise<SnapshotTableEntry> {
  const key = tableKey(cycle, table)
  // Sérialisation COMPACTE, à la différence des réponses de l'API : ces
  // octets ne sont jamais lus par un humain, et l'indentation gonflait la
  // charge utile d'environ moitié pour rien.
  const payload = JSON.stringify(objects)
  const bytes = new TextEncoder().encode(payload)
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
  return { rows: objects.length, bytes: bytes.byteLength, key }
}

/** Publie le manifeste — le geste qui rend un cycle VISIBLE. */
export async function putManifest(
  bucket: R2Bucket,
  manifest: SnapshotManifest,
): Promise<void> {
  await bucket.put(MANIFEST_KEY, JSON.stringify(manifest, null, 2) + '\n', {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
}

/** Supprime les cycles trop vieux.
 *
 *  BEST-EFFORT, ET L'APPELANT DOIT LE TRAITER COMME TEL : ce ménage tourne
 *  APRÈS la publication du manifeste, dans le même `waitUntil` que les
 *  Deploy Hooks. S'il échouait bruyamment, il ferait passer pour ratée une
 *  passe réussie et pourrait retenir les hooks — c'est-à-dire figer le site
 *  pour économiser quelques octets. Un cycle non nettoyé ne coûte rien ;
 *  un hook manqué coûte une édition. */
export async function pruneSnapshots(bucket: R2Bucket, keep?: number): Promise<number> {
  const cycles = new Set<string>()
  let cursor: string | undefined
  do {
    const listed = await bucket.list({ prefix: SNAPSHOT_PREFIX, cursor })
    for (const obj of listed.objects) {
      const rest = obj.key.slice(SNAPSHOT_PREFIX.length)
      const slash = rest.indexOf('/')
      if (slash > 0) cycles.add(rest.slice(0, slash))
    }
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)

  let deleted = 0
  for (const cycle of cyclesToPrune([...cycles], keep)) {
    let c: string | undefined
    do {
      const listed = await bucket.list({ prefix: `${SNAPSHOT_PREFIX}${cycle}/`, cursor: c })
      const keys = listed.objects.map((o) => o.key)
      if (keys.length > 0) {
        await bucket.delete(keys)
        deleted += keys.length
      }
      c = listed.truncated ? listed.cursor : undefined
    } while (c)
  }
  return deleted
}

/** GET /v1/snapshot/manifest.json — le cycle courant et ses tables.
 *  GET /v1/snapshot/<cycle>/<table>.json — les lignes, telles que /v1/datasets
 *  les aurait servies. */
export async function handleSnapshot(
  request: Request,
  env: SnapshotEnv,
  segments: string[],
): Promise<Response> {
  if (!env.ART_BUCKET) {
    return json({ error: "Bucket d'instantanés non configuré." }, 503)
  }
  // FERMÉ PAR DÉFAUT : sans secret posé, on ne sert rien. Un instantané
  // ouvert distribuerait tout le produit.
  if (!env.SNAPSHOT_TOKEN) {
    return json({ error: "Instantané non configuré (SNAPSHOT_TOKEN absent)." }, 503)
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Seules les requêtes GET sont acceptées.' }, 405)
  }

  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!presented || !tokensMatch(presented, env.SNAPSHOT_TOKEN)) {
    return json({ error: "Jeton d'instantané invalide ou absent." }, 401)
  }

  const key = resolveSnapshotKey(segments)
  if (key === null) {
    return json(
      { error: 'Chemin inconnu.', endpoints: ['/v1/snapshot/manifest.json', '/v1/snapshot/{cycle}/{table}.json'] },
      404,
    )
  }

  const obj = await env.ART_BUCKET.get(key)
  if (!obj) return json({ error: `Absent de l'instantané : ${key}` }, 404)

  return new Response(obj.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      etag: obj.httpEtag,
    },
  })
}
