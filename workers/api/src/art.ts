// /v1/art — l'illustration de la Une des unes, servie depuis R2.
//
// POURQUOI CETTE ROUTE EXISTE. L'illustration était générée par
// `generate_art.py` dans refresh-data.yml puis COMMITÉE dans le dépôt — le
// dernier morceau du chemin critique encore accroché à GitHub Actions, et
// depuis la démotion de refresh-data au rythme hebdomadaire, une illustration
// qui vieillissait d'une semaine sous une Une qui change toutes les 4 h.
//
// Le nouveau circuit (spec émancipation totale, rangée « vitrine-media ») :
// le raffineur vitrine-art lit la Une désignée sur le SITE DÉPLOYÉ
// (data/hero-selection.json — même code de sélection que le rendu, jamais de
// double implémentation, cf. issue #259), génère l'image, la PUT ici, puis
// POST /v1/art/publish. Si la Une illustrée a changé, le Worker déclenche les
// Deploy Hooks : le build suivant rapatrie l'image (scripts/fetch_art.mjs) et
// l'inline dans l'export statique. Les visiteurs ne touchent jamais R2.
//
// POURQUOI R2 ET PAS POSTGRES. Un PNG de ~1,5 Mo en bytea traverserait le
// Worker en l'encodant/décodant — plusieurs dizaines de millisecondes de CPU,
// là où le plan gratuit en donne 10 par requête (la leçon de la passe
// monolithique du 2026-08-19). R2 se lit et s'écrit en STREAMING : le corps
// passe du réseau au bucket sans jamais être matérialisé en mémoire.

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { authenticate } from './auth'
import { ART_CACHE_CONTROL, ART_FILES, MAX_UPLOAD_BYTES, heroKey, publishDecision } from './art-logic'
import { notifySlack, triggerDeployHooks, type SyncAthenaEnv } from './sync-athena'

export { ART_FILES, MAX_UPLOAD_BYTES, heroKey, publishDecision } from './art-logic'

export interface ArtEnv extends SyncAthenaEnv {
  ART_BUCKET?: R2Bucket
}

/** Objet R2 qui retient la dernière Une PUBLIÉE (clé + horodatage). C'est lui
 *  qui rend /publish idempotent : pas de nouvelle Une, pas de rebuild — un
 *  cycle où la Une n'a pas changé ne coûte ni build ni image. */
const PUBLISHED_MARKER = 'art/published.json'

/** Préfixe des objets images dans le bucket. */
const OBJECT_PREFIX = 'art/'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  })
}

export async function handleArt(
  request: Request,
  env: ArtEnv,
  ctx: ExecutionContext,
  sql: NeonQueryFunction<false, false>,
  file: string,
): Promise<Response> {
  if (!env.ART_BUCKET) {
    return json({ error: "Bucket d'illustrations non configuré." }, 503)
  }

  // POST /v1/art/publish — déclenche les builds si la Une illustrée a changé.
  if (file === 'publish') {
    if (request.method !== 'POST') {
      return json({ error: 'Utilisez POST pour publier.' }, 405)
    }
    const auth = await authenticate(sql, request, 'sync')
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const metaObj = await env.ART_BUCKET.get(OBJECT_PREFIX + 'latest.json')
    if (!metaObj) {
      return json({ error: 'Aucune illustration téléversée (latest.json absent).' }, 409)
    }
    type ArtMeta = { storyline_id?: string | null; event_id?: string | null } | null
    const meta = (await metaObj.json().catch(() => null)) as ArtMeta
    const marker = await env.ART_BUCKET.get(PUBLISHED_MARKER)
    const published = marker ? ((await marker.json().catch(() => null)) as { hero_key?: string } | null) : null

    const key = heroKey(meta)
    const decision = publishDecision(key, published?.hero_key ?? null, env.SYNC_TRIGGER_DEPLOYS)
    if (!decision.publish) {
      return json({ published: false, reason: decision.reason })
    }

    try {
      await triggerDeployHooks(env)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await notifySlack(env, `vitrine-art : image stockée mais hook en échec : ${message}`)
      return json({ published: false, error: `Deploy hook en échec : ${message}` }, 502)
    }
    await env.ART_BUCKET.put(
      PUBLISHED_MARKER,
      JSON.stringify({ hero_key: key, published_at: new Date().toISOString() }),
      { httpMetadata: { contentType: 'application/json' } },
    )
    return json({ published: true, hero_key: key, reason: decision.reason })
  }

  const contentType = ART_FILES[file]
  if (!contentType) {
    return json({ error: `Fichier inconnu : ${file || '(vide)'}.`, files: Object.keys(ART_FILES) }, 404)
  }

  // PUT /v1/art/latest.* — téléversement par le raffineur, corps STREAMÉ vers
  // R2. Portée `sync` : comme la synchro, c'est une écriture, pas une lecture.
  if (request.method === 'PUT') {
    const auth = await authenticate(sql, request, 'sync')
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const declared = Number(request.headers.get('content-length') ?? '0')
    if (!declared || declared > MAX_UPLOAD_BYTES) {
      return json(
        { error: `Content-Length requis, entre 1 et ${MAX_UPLOAD_BYTES} octets.` },
        declared ? 413 : 411,
      )
    }
    await env.ART_BUCKET.put(OBJECT_PREFIX + file, request.body, {
      httpMetadata: { contentType },
    })
    return json({ stored: file, bytes: declared })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Méthodes admises : GET, HEAD, PUT.' }, 405)
  }

  // GET /v1/art/latest.* — lecture publique. L'image n'est pas une donnée
  // vendue : c'est la couverture du site, et le build doit pouvoir la
  // rapatrier sans clé.
  const obj = await env.ART_BUCKET.get(OBJECT_PREFIX + file)
  if (!obj) {
    return json({ error: `${file} n'existe pas encore.` }, 404)
  }
  const headers = new Headers({
    'content-type': contentType,
    'cache-control': ART_CACHE_CONTROL,
    'access-control-allow-origin': '*',
    etag: obj.httpEtag,
  })
  const response = new Response(request.method === 'HEAD' ? null : obj.body, { headers })

  // Sans ce put, le match du cache edge en tête de fetch() ne trouverait
  // jamais rien : c'est lui qui évite de relire R2 à chaque visite.
  if (request.method === 'GET') {
    ctx.waitUntil(caches.default.put(request, response.clone()))
  }
  return response
}
