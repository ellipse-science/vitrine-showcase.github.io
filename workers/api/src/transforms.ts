// Transformations PURES du sync Athena -> Postgres : fenêtres de rétention et
// normalisation des valeurs. Aucun import, ni externe ni interne.
//
// POURQUOI CE FICHIER EST SÉPARÉ DE sync-athena.ts. Ces fonctions sont les
// seules du Worker qu'une suite de tests a besoin de lire, et `tests/` est
// compilé par le tsconfig de la RACINE — lequel exclut pourtant `workers/`.
// L'exclusion ne suffit pas : `exclude` ne filtre que les globs d'`include`,
// il n'empêche pas un fichier d'entrer dans le programme quand un fichier
// inclus l'importe. Tester depuis sync-athena.ts tirait donc tout le module
// dans la compilation racine, avec ses `@neondatabase/serverless` et
// `aws4fetch` — déclarés dans workers/api/package.json, jamais installés par
// le `npm ci` de la racine. Résultat : `npm run type-check` cassait sur toutes
// les PR, et les déploiements avec (2026-08-19).
//
// En isolant ici ce qui n'a AUCUNE dépendance, le programme racine ne tire
// plus que du code qu'il sait résoudre, et la frontière voulue entre le site
// et le Worker tient sans que personne ait à s'en souvenir.
//
// Mêmes fenêtres et mêmes ancrages que fetch_data.R et que le raffineur
// vitrine-publish : toute modification doit être répercutée des trois côtés
// tant que plusieurs chemins coexistent.

export const HEADLINE_KEEP_DAYS = 14
export const POLIMETRE_KEEP_DAYS = 70

export function isoDaysAgo(days: number, from = new Date()): string {
  return new Date(from.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

/** '' -> NULL : Athena publie des chaînes vides là où la donnée manque, et
 *  les colonnes numériques les refuseraient (défense commune aux trois
 *  écrivains : sync.ts, load_pg.mjs, vitrine-publish). */
export function normalizeValue(v: string | null): string | null {
  return v === '' ? null : v
}

/** Fenêtre headline : ancrée sur l'HORLOGE (archive publique de 14 jours).
 *  Les dates sont des chaînes ISO : l'ordre lexicographique est l'ordre
 *  chronologique, même contrat que l'API de lecture. */
export function keepHeadlineRow(dateUtc: string | null, cutoff: string): boolean {
  return dateUtc !== null && dateUtc.slice(0, 10) >= cutoff
}

/** Fenêtre polimetre : ancrée sur la DONNÉE (dernier snapshot), pas sur
 *  l'horloge — si le raffineur amont cessait de publier, une fenêtre horloge
 *  viderait la table ligne à ligne et le module disparaîtrait sans bruit. */
export function polimetreCutoff(weekEndDates: (string | null)[]): string | null {
  const valid = weekEndDates.filter(
    (d): d is string => d !== null && /^\d{4}-\d{2}-\d{2}/.test(d),
  )
  if (valid.length === 0) return null
  const max = valid.reduce((a, b) => (a > b ? a : b)).slice(0, 10)
  return isoDaysAgo(POLIMETRE_KEEP_DAYS, new Date(`${max}T00:00:00Z`))
}
