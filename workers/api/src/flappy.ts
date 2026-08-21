// /v1/flappy/leaderboard — le classement global du jeu caché « Flappy Enjeux ».
//
// POURQUOI CETTE ROUTE EXISTE (issue #499). Le classement vivait dans Upstash,
// et le client a longtemps embarqué un jeton d'ÉCRITURE dans le bundle public
// — révoqué par la PR #491, jamais remplacé : depuis, les variables Upstash ne
// sont posées nulle part et le tableau s'affiche vide. Plutôt que remettre des
// jetons dans le navigateur, le classement passe ici : lecture publique,
// écriture validée CÔTÉ SERVEUR (le client n'envoie que SON entrée, jamais le
// tableau — il ne peut donc pas l'écraser), stockage dans le Neon qu'on a
// déjà. Plus aucun secret côté client, plus d'Upstash du tout.
//
// C'est le PREMIER POST d'origine navigateur de ce Worker (les autres routes
// d'écriture sont appelées de serveur à serveur) : il découvre le préflight
// CORS. Un POST cross-origin en application/json déclenche un OPTIONS que le
// navigateur doit voir accepté, sinon le POST n'est JAMAIS émis — et l'échec
// serait silencieux côté joueur (revue d'AdriClout sur #545). D'où le
// gestionnaire OPTIONS ci-dessous, avant tout garde de méthode.
//
// UNE LIGNE PAR SCORE, pas un tableau JSON réécrit : l'INSERT est atomique —
// deux parties finies dans la même seconde ne peuvent pas s'écraser (le
// get + merge + set d'un blob JSON le permettait). Le top 10 est recalculé à
// la lecture. ENJEU ASSUMÉ FAIBLE (cadrage de #499) : soumission anonyme mais
// bornée (score plafonné, initiales assainies), tableau réinitialisable en un
// TRUNCATE, et le GET passe par le cache edge — Postgres ne voit qu'une
// requête par minute quel que soit le trafic. Le CREATE IF NOT EXISTS sur le
// chemin d'écriture est un choix, pas un oubli : pas de migration à
// orchestrer pour un easter egg, au prix d'un no-op DDL par soumission.

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { type ScoreEntry } from '../../../lib/flappy'
import { FLAPPY_CACHE_TTL, MAX_SCORE, sanitizeSubmission } from './flappy-logic'

export { FLAPPY_CACHE_TTL, MAX_SCORE, sanitizeSubmission } from './flappy-logic'

const BOARD_SIZE = 10

async function readBoard(sql: NeonQueryFunction<false, false>): Promise<ScoreEntry[]> {
  try {
    const rows = await sql`
      SELECT initials, score, date FROM vitrine.flappy_scores
      ORDER BY score DESC, created_at ASC
      LIMIT ${BOARD_SIZE}`
    return rows.map((r) => ({
      initials: String(r.initials),
      score: Number(r.score),
      date: String(r.date),
    }))
  } catch {
    // Table absente (premier déploiement) : tableau vide, jamais une erreur —
    // même philosophie best-effort que le client.
    return []
  }
}

function json(body: unknown, status = 200, ttl = 0): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
  })
  if (ttl > 0) headers.set('cache-control', `public, max-age=${ttl}`)
  return new Response(JSON.stringify(body, null, 2) + '\n', { status, headers })
}

export async function handleFlappy(
  request: Request,
  ctx: ExecutionContext,
  sql: NeonQueryFunction<false, false>,
): Promise<Response> {
  // Préflight CORS — AVANT tout garde de méthode. Sans ces trois en-têtes, le
  // navigateur n'émet jamais le POST qui suit.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    })
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    const board = await readBoard(sql)
    const response = json({ board }, 200, FLAPPY_CACHE_TTL)
    if (request.method === 'GET') {
      ctx.waitUntil(caches.default.put(request, response.clone()))
    }
    return response
  }

  if (request.method !== 'POST') {
    return json({ error: 'Méthodes admises : GET, POST, OPTIONS.' }, 405)
  }

  const entry = sanitizeSubmission(await request.json().catch(() => null))
  if (!entry) {
    return json({ error: `Entrée invalide. Attendu : { initials, score (1..${MAX_SCORE}), date? }.` }, 422)
  }

  await sql.query(
    `CREATE TABLE IF NOT EXISTS vitrine.flappy_scores (
       id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
       initials text NOT NULL,
       score integer NOT NULL,
       date text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
    [],
  )
  await sql.query(
    `INSERT INTO vitrine.flappy_scores (initials, score, date) VALUES ($1, $2, $3)`,
    [entry.initials, entry.score, entry.date],
  )

  // Purge la copie edge du GET : le score soumis doit se voir tout de suite,
  // pas dans une minute.
  const getUrl = new URL(request.url)
  ctx.waitUntil(caches.default.delete(new Request(getUrl.toString(), { method: 'GET' })))

  return json({ board: await readBoard(sql) })
}
