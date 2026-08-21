// Logique PURE de /v1/flappy/leaderboard — aucun type Workers ici, exprès :
// module importé par les tests (tests/flappyApi.test.ts) qui compilent sous le
// tsconfig racine. Même parade que art-logic.ts. Les E/S vivent dans flappy.ts.

import { sanitizeInitials, type ScoreEntry } from '../../../lib/flappy'

/** Plafond de plausibilité : au-delà, c'est un script, pas une partie. */
export const MAX_SCORE = 9999

export const FLAPPY_CACHE_TTL = 60

/** Valide et assainit une soumission de score. null = rejet (422).
 *
 *  C'est LA frontière de confiance du classement : le client est anonyme et
 *  tout ce qu'il envoie est suspect. Score entier borné, initiales passées au
 *  même assainisseur que l'affichage, date au format ISO ou remplacée. */
export function sanitizeSubmission(raw: unknown): ScoreEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  // Nombre JSON exigé, pas une chaîne numérique : le client légitime envoie un
  // number, tout le reste est du bricolage.
  const score = r.score
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > MAX_SCORE) return null
  const initials = sanitizeInitials(String(r.initials ?? ''))
  if (!initials) return null
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    ? r.date
    : new Date().toISOString().slice(0, 10)
  return { initials, score, date }
}
