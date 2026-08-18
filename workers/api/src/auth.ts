// Authentification par clé d'API, portées et quotas.
//
// LA CLÉ EN CLAIR N'EST JAMAIS STOCKÉE. La base ne contient que son SHA-256,
// comme pour un mot de passe : une fuite de la base ne livre aucune clé
// utilisable, et personne ne peut relire une clé existante — on en émet une
// nouvelle. C'est aussi pourquoi l'administration ne peut que « révoquer et
// recréer », jamais « afficher ».
//
// La comparaison se fait donc sur le hash, ce qui a un effet secondaire utile :
// la recherche est un index unique, et le temps de réponse ne dépend pas de la
// clé présentée.

import type { NeonQueryFunction } from '@neondatabase/serverless'

/** Préfixe des clés émises. Le `live` laisse la place à un `test` plus tard. */
export const KEY_PREFIX = 'vd_live_'

export interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  daily_quota: number | null
}

export type AuthResult =
  | { ok: true; key: ApiKey }
  | { ok: false; status: number; error: string }

/** SHA-256 hexadécimal, via l'API Web Crypto du runtime. */
export async function hashKey(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Génère une clé lisible et son hash. La clé en clair n'est renvoyée qu'ici,
 *  au moment de la création — elle n'est jamais réaffichable ensuite. */
export async function mintKey(): Promise<{ raw: string; hash: string; prefix: string }> {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const body = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  const raw = `${KEY_PREFIX}${body}`
  return { raw, hash: await hashKey(raw), prefix: raw.slice(0, 12) }
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (match) return match[1].trim()
  // `?api_key=` est accepté pour les usages où poser un en-tête est pénible
  // (un tableur, une requête depuis un carnet). Moins bon qu'un en-tête : la
  // clé se retrouve dans les journaux et l'historique du navigateur. Documenté
  // comme tel.
  const url = new URL(request.url)
  return url.searchParams.get('api_key')
}

/** Vérifie la clé et l'autorisation d'accès à un jeu de données.
 *
 *  `dataset` vaut null pour les routes qui n'en ciblent aucun (l'index). */
export async function authenticate(
  sql: NeonQueryFunction<false, false>,
  request: Request,
  dataset: string | null,
): Promise<AuthResult> {
  const raw = bearer(request)
  if (!raw) {
    return { ok: false, status: 401, error: "Clé d'API manquante. En-tête : Authorization: Bearer <clé>" }
  }

  const rows = (await sql.query(
    `SELECT id, name, prefix, scopes, daily_quota
       FROM api.keys
      WHERE key_hash = $1 AND revoked_at IS NULL`,
    [await hashKey(raw)],
  )) as ApiKey[]

  const key = rows[0]
  if (!key) return { ok: false, status: 401, error: "Clé d'API inconnue ou révoquée." }

  if (dataset) {
    const allowed = key.scopes.includes('*') || key.scopes.includes(dataset)
    if (!allowed) {
      // On dit QUEL jeu est refusé : ce n'est pas un secret, et sans cela le
      // client ne peut pas distinguer « clé invalide » de « pas abonné à ce
      // jeu-là », ce qui rend le débogage impossible côté client.
      return { ok: false, status: 403, error: `Cette clé n'a pas accès au jeu « ${dataset} ».` }
    }
  }

  if (key.daily_quota !== null) {
    const used = (await sql.query(
      `SELECT COALESCE(SUM(requests), 0)::int AS n
         FROM api.usage WHERE key_id = $1 AND day = CURRENT_DATE`,
      [key.id],
    )) as { n: number }[]
    if ((used[0]?.n ?? 0) >= key.daily_quota) {
      return {
        ok: false,
        status: 429,
        error: `Quota quotidien atteint (${key.daily_quota} requêtes). Il repart à minuit UTC.`,
      }
    }
  }

  return { ok: true, key }
}

/** Enregistre l'usage. Volontairement « au mieux » : une écriture de compteur
 *  qui échoue ne doit pas faire échouer une requête déjà servie. */
export async function recordUsage(
  sql: NeonQueryFunction<false, false>,
  keyId: string,
  dataset: string,
  rows: number,
): Promise<void> {
  try {
    await sql.query(
      `INSERT INTO api.usage (key_id, day, dataset, requests, rows_out)
       VALUES ($1, CURRENT_DATE, $2, 1, $3)
       ON CONFLICT (key_id, day, dataset) DO UPDATE SET
         requests = api.usage.requests + 1,
         rows_out = api.usage.rows_out + EXCLUDED.rows_out`,
      [keyId, dataset, rows],
    )
    await sql.query(`UPDATE api.keys SET last_used_at = now() WHERE id = $1`, [keyId])
  } catch (err) {
    console.error('usage non enregistré :', err instanceof Error ? err.message : err)
  }
}
