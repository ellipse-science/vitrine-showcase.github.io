// /v1/cartes/* — LES CARTES DE DÉPUTÉ EN HAUTE RÉSOLUTION, à télécharger
// depuis le vestiaire du site (vitrine#920).
//
// Les 258 faces (recto et verso des 129 cartes, 2 142 × 2 992 px) sont rendues
// par le générateur dans le workflow Refresh Data quand les données changent,
// puis déposées ici, dans le bucket des illustrations, sous le préfixe
// `cartes/<periode>/`. Un manifeste par période dit la date des données et la
// liste des cartes : le bouton du site le lit pour savoir ce qui existe.
//
// POURQUOI UNE LECTURE PUBLIQUE, ALORS QUE L'API EST PRIVÉE (26-08). Le site a
// pour règle que le navigateur n'appelle jamais l'API : les données sont lues
// au build. Mais un PNG de 1,5 Mo à télécharger n'est pas une donnée et ne
// peut pas être inliné dans l'export statique (≈ 400 Mo par build). Ces
// objets sont donc l'exception, clairement bornée : un préfixe, des noms de
// fichier validés par une expression régulière fermée, des réponses mises en
// cache une heure (elles changent le mardi), et rien d'autre de l'API ne
// change de politique. Si Patrick préfère un domaine public sur un bucket
// dédié (`cartes.vitrinedemocratique.com`), seule la lecture d'ici tombe : le
// dépôt (PUT sous clé) et la structure des clés restent les mêmes.
//
// ÉCRITURE : PUT sous clé `sync`, comme la Une (art.ts), corps streamé.
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { authenticate } from './auth'

export type CartesEnv = { ART_BUCKET?: R2Bucket }

const PREFIXE = 'art/cartes/'
const MAX_OCTETS = 12 * 1024 * 1024
const TTL_SECONDES = 3600

/** `<periode>/<slug>-<face>.png` ou `<periode>/manifeste.json`. Fermé : un
 *  slug est fait de lettres, chiffres et tirets (la circonscription, parfois
 *  suivie du parti) ; la période est l'une des trois vues du site. */
const CHEMIN = /^(legislature|session|last_pdq)\/(?:([a-z0-9-]{1,80})-(recto|verso)\.png|manifeste\.json)$/

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function handleCartes(
  request: Request,
  env: CartesEnv,
  ctx: ExecutionContext,
  sql: NeonQueryFunction<false, false>,
  chemin: string,
): Promise<Response> {
  if (!env.ART_BUCKET) return json({ error: "Bucket d'illustrations non configuré." }, 503)
  const m = CHEMIN.exec(chemin)
  if (!m) return json({ error: `Chemin inconnu : ${chemin || '(vide)'}. Forme : <periode>/<slug>-<recto|verso>.png ou <periode>/manifeste.json.` }, 404)
  const contentType = chemin.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/png'
  const cle = PREFIXE + chemin

  if (request.method === 'PUT') {
    const auth = await authenticate(sql, request, 'sync')
    if (!auth.ok) return json({ error: auth.error }, auth.status)
    const declare = Number(request.headers.get('content-length') ?? '0')
    if (!declare || declare > MAX_OCTETS) {
      return json({ error: `Content-Length requis, entre 1 et ${MAX_OCTETS} octets.` }, declare ? 413 : 411)
    }
    await env.ART_BUCKET.put(cle, request.body, { httpMetadata: { contentType } })
    // La version en cache est périmée dès qu'on réécrit : on la retire.
    ctx.waitUntil(caches.default.delete(new Request(new URL(request.url), { method: 'GET' })))
    return json({ ok: true, key: cle, bytes: declare })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Méthodes admises : GET, HEAD, PUT.' }, 405)
  }

  // Lecture publique, en cache une heure. Le cache est consulté ici et non en
  // tête de fetch() : il ne doit servir que ces objets-là.
  const cache = caches.default
  const requeteGet = new Request(new URL(request.url), { method: 'GET' })
  const enCache = await cache.match(requeteGet)
  if (enCache) return request.method === 'HEAD' ? new Response(null, { headers: enCache.headers }) : enCache

  const obj = await env.ART_BUCKET.get(cle)
  if (!obj) return json({ error: `${chemin} n'existe pas encore : les cartes sont déposées après la mise à jour des données.` }, 404)
  const headers = new Headers({
    'content-type': contentType,
    'cache-control': `public, max-age=${TTL_SECONDES}`,
    'access-control-allow-origin': '*',
    etag: obj.httpEtag,
  })
  const reponse = new Response(obj.body, { headers })
  ctx.waitUntil(cache.put(requeteGet, reponse.clone()))
  return request.method === 'HEAD' ? new Response(null, { headers }) : reponse
}
