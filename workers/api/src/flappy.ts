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
// ENJEU ASSUMÉ FAIBLE (cadrage de #499) : un tableau de scores de jeu. Pas de
// clé d'API pour soumettre — les joueurs sont anonymes — mais des bornes
// serveur (score plafonné, initiales assainies, top 10) et un tableau
// réinitialisable en un TRUNCATE. Le GET passe par le cache edge : Postgres ne
// voit qu'une requête par minute quel que soit le trafic.

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { insertScore, type ScoreEntry } from '../../../lib/flappy'
import { FLAPPY_CACHE_TTL, MAX_SCORE, sanitizeSubmission } from './flappy-logic'

export { FLAPPY_CACHE_TTL, MAX_SCORE, sanitizeSubmission } from './flappy-logic'

async function readBoard(sql: NeonQueryFunction<false, false>): Promise<ScoreEntry[]> {
  try {
    const rows = await sql`SELECT board FROM vitrine.flappy_leaderboard WHERE id = 1`
    const raw = rows[0]?.board
    if (Array.isArray(raw)) return raw as ScoreEntry[]
    if (typeof raw === 'string') return JSON.parse(raw) as ScoreEntry[]
  } catch {
    // Table absente (premier déploiement) ou contenu illisible : tableau vide,
    // jamais une erreur — même philosophie best-effort que le client.
  }
  return []
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
  if (request.method === 'GET' || request.method === 'HEAD') {
    const board = await readBoard(sql)
    const response = json({ board }, 200, FLAPPY_CACHE_TTL)
    if (request.method === 'GET') {
      ctx.waitUntil(caches.default.put(request, response.clone()))
    }
    return response
  }

  if (request.method !== 'POST') {
    return json({ error: 'Méthodes admises : GET, POST.' }, 405)
  }

  const entry = sanitizeSubmission(await request.json().catch(() => null))
  if (!entry) {
    return json({ error: `Entrée invalide. Attendu : { initials, score (1..${MAX_SCORE}), date? }.` }, 422)
  }

  // get + merge + set côté serveur (le contrat de #499). La table est créée au
  // premier score : pas de migration à orchestrer pour un easter egg.
  await sql.query(
    `CREATE TABLE IF NOT EXISTS vitrine.flappy_leaderboard (
       id integer PRIMARY KEY CHECK (id = 1),
       board jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
    [],
  )
  const board = insertScore(await readBoard(sql), entry)
  await sql.query(
    `INSERT INTO vitrine.flappy_leaderboard (id, board, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET board = EXCLUDED.board, updated_at = now()`,
    [JSON.stringify(board)],
  )

  // Purge la copie edge du GET : le score soumis doit se voir tout de suite,
  // pas dans une minute.
  const getUrl = new URL(request.url)
  ctx.waitUntil(caches.default.delete(new Request(getUrl.toString(), { method: 'GET' })))

  return json({ board })
}
