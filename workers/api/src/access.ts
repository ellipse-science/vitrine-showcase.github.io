// Vérification de l'identité Cloudflare Access, par signature.
//
// POURQUOI NE PAS SE CONTENTER DE L'EN-TÊTE COURRIEL
//
// Access injecte `Cf-Access-Authenticated-User-Email` après avoir vérifié
// l'identité, et Cloudflare écrase toute valeur envoyée par le client. Tant que
// l'application Access est en place, cet en-tête est donc digne de confiance.
//
// « Tant que » est le problème. Si l'application Access est retirée, désactivée
// ou mal reconfigurée — un clic — le Worker reste joignable et n'importe qui
// peut alors fabriquer cet en-tête et ÉMETTRE DES CLÉS D'API. Le garde-fou
// reposait entièrement sur une configuration extérieure au code.
//
// On vérifie donc le JETON SIGNÉ (`Cf-Access-Jwt-Assertion`) : signature RS256
// contre les clés publiques de l'organisation, `aud` égal à celui de
// l'application, et expiration. Un jeton ne peut pas être fabriqué sans la clé
// privée de Cloudflare. La sécurité tient désormais au code, pas à un réglage.

interface Jwk {
  kid: string
  kty: string
  n: string
  e: string
  alg?: string
}

/** Clés publiques de l'organisation, mises en cache.
 *
 *  Cloudflare fait tourner ces clés ; on les recharge donc périodiquement, et
 *  immédiatement si un `kid` inconnu apparaît (signe d'une rotation récente
 *  plutôt que d'une attaque). */
let jwksCache: { keys: Jwk[]; at: number } | null = null
const JWKS_TTL_MS = 60 * 60 * 1000

async function fetchJwks(teamDomain: string, force = false): Promise<Jwk[]> {
  const fresh = jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS
  if (fresh && !force) return jwksCache!.keys
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`certs ${res.status}`)
  const body = (await res.json()) as { keys?: Jwk[] }
  const keys = body.keys ?? []
  jwksCache = { keys, at: Date.now() }
  return keys
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function decodePayload(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)))
}

async function importKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
}

export interface AccessIdentity {
  email: string
}

/** Renvoie l'identité prouvée, ou null.
 *
 *  Ne fait AUCUNE concession : pas de jeton, signature invalide, mauvais
 *  auditoire ou jeton expiré donnent tous null. Le code appelant refuse alors
 *  de servir /admin — une administration inaccessible vaut mieux qu'ouverte. */
export async function verifyAccessJwt(
  request: Request,
  teamDomain: string,
  expectedAud: string,
): Promise<AccessIdentity | null> {
  const token =
    request.headers.get('cf-access-jwt-assertion') ??
    (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1]
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [rawHeader, rawPayload, rawSignature] = parts

  let header: { kid?: string; alg?: string }
  let payload: Record<string, unknown>
  try {
    header = decodePayload(rawHeader) as { kid?: string; alg?: string }
    payload = decodePayload(rawPayload)
  } catch {
    return null
  }

  // On n'accepte que RS256 : laisser passer `alg: none` ou un algorithme
  // symétrique est la faille classique des vérifications de JWT.
  if (header.alg !== 'RS256' || !header.kid) return null

  let keys = await fetchJwks(teamDomain)
  let jwk = keys.find((k) => k.kid === header.kid)
  if (!jwk) {
    keys = await fetchJwks(teamDomain, true) // rotation probable
    jwk = keys.find((k) => k.kid === header.kid)
  }
  if (!jwk) return null

  const data = new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    await importKey(jwk),
    b64urlToBytes(rawSignature),
    data,
  )
  if (!ok) return null

  // `aud` lie le jeton à CETTE application : sans ce contrôle, un jeton émis
  // pour une autre application de la même organisation — le miroir dev, par
  // exemple — ouvrirait l'administration.
  const aud = payload.aud
  const audList = Array.isArray(aud) ? aud.map(String) : [String(aud ?? '')]
  if (!audList.includes(expectedAud)) return null

  const exp = Number(payload.exp ?? 0)
  if (!exp || exp * 1000 <= Date.now()) return null

  const email = String(payload.email ?? '')
  if (!email.includes('@')) return null

  return { email }
}
