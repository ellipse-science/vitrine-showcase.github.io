// Logique PURE de l'instantané R2 — aucun type Workers ici, exprès : module
// importé par les tests (tests/snapshot.test.ts) qui compilent sous le
// tsconfig racine. Même parade que art-logic.ts et flappy-logic.ts. Les E/S
// (R2, routes) vivent dans snapshot.ts.
//
// CE QUE FAIT CE MODULE, ET POURQUOI IL EXISTE
//
// La synchro tient déjà les lignes d'Athena en mémoire quand elle les écrit
// dans Postgres. L'instantané les dépose AU PASSAGE dans R2, pour que le
// build du site les lise là plutôt que d'interroger Postgres — cf. l'en-tête
// de snapshot.ts pour le pourquoi.
//
// LE PIÈGE, ET TOUT L'ENJEU DE CE FICHIER. Athena rend TOUT en chaînes.
// Postgres, lui, TYPE ses colonnes : `/v1/datasets` renvoie `0.1981`, pas
// `"0.1981"`, et les loaders du site analysent des nombres. Un instantané
// naïf servirait des chaînes et les modules se briseraient en silence —
// `.toFixed()` sur une chaîne, des tris lexicographiques, des sommes
// concaténées. La conversion ci-dessous reproduit donc EXACTEMENT ce que le
// couple « INSERT dans une colonne typée » + « pilote Neon » produit, en
// s'appuyant sur COLUMN_TYPES, généré depuis sql/schema.sql.

import { COLUMN_TYPES, type ColumnKind } from './column-types'

/** Préfixe des objets d'instantané dans le bucket.
 *
 *  MÊME BUCKET QUE L'ILLUSTRATION, à dessein. Un bucket dédié aurait été plus
 *  joli, mais il aurait fallu le créer AVANT le premier `wrangler deploy` :
 *  un binding R2 dont le bucket n'existe pas fait échouer le déploiement, et
 *  ce déploiement est un geste humain qu'on ne peut pas répéter à volonté.
 *  ART_BUCKET est déjà lié, déjà déployé, déjà éprouvé de bout en bout. */
export const SNAPSHOT_PREFIX = 'data/snapshot/'

/** Clé du manifeste. Écrit EN DERNIER, une fois les 15 tables déposées :
 *  c'est lui qui rend un cycle visible, donc lui qui rend la passe atomique
 *  pour le lecteur. Un cycle interrompu laisse des tables orphelines que
 *  personne ne lira jamais. */
export const MANIFEST_KEY = `${SNAPSHOT_PREFIX}manifest.json`

/** Nombre de cycles conservés dans R2. Deux suffiraient (le courant et celui
 *  qu'un build en cours pourrait encore lire) ; trois laisse une marge pour
 *  inspecter le cycle précédent en cas de doute. */
export const KEEP_CYCLES = 3

export interface SnapshotTableEntry {
  rows: number
  bytes: number
  key: string
}

export interface SnapshotManifest {
  cycle: string
  generated_at: string
  source: string
  tables: Record<string, SnapshotTableEntry>
}

/** Identifiant de cycle, dérivé de l'heure du cron.
 *
 *  Les tranches d'une même passe sont des invocations SÉPARÉES : elles ne
 *  peuvent pas se mettre d'accord sur un identifiant, il faut donc que
 *  l'orchestrateur le fabrique et le leur passe. Format volontairement
 *  lisible dans la console R2, et trié lexicographiquement = chronologique,
 *  ce dont dépend le ménage des vieux cycles. */
export function cycleId(at: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}` +
    `T${p(at.getUTCHours())}${p(at.getUTCMinutes())}Z`
  )
}

/** Clé R2 des lignes d'une table pour un cycle donné. */
export function tableKey(cycle: string, table: string): string {
  return `${SNAPSHOT_PREFIX}${cycle}/${table}.json`
}

/** Convertit UNE valeur Athena (chaîne ou null) vers ce que le pilote
 *  Postgres aurait rendu pour cette colonne.
 *
 *  ÉCHOUE PLUTÔT QUE DE DEVINER. `Number('abc')` vaut NaN, et
 *  `JSON.stringify(NaN)` écrit `null` : une colonne numérique polluée en
 *  amont deviendrait donc silencieusement vide dans l'instantané, alors que
 *  le chemin Postgres, lui, aurait REFUSÉ l'insertion et fait échouer la
 *  table. Or l'échec d'une table retient les Deploy Hooks (règle du tout ou
 *  rien) et laisse l'ancienne donnée servie — c'est la protection que la
 *  garde zéro-ligne de sync-athena.ts existe à fournir. On la conserve ici
 *  en levant, plutôt que de la contourner par une valeur nulle plausible. */
export function castValue(
  value: string | null,
  kind: ColumnKind | undefined,
  table: string,
  column: string,
): string | number | boolean | null {
  if (value === null) return null
  if (kind === undefined) return value

  if (kind === 'number') {
    const n = Number(value)
    // `Number.isFinite` rejette NaN ET les infinis d'un seul geste. Postgres
    // accepte littéralement 'NaN' et 'Infinity' en double precision, mais
    // JSON ne sait représenter ni l'un ni l'autre : les laisser passer
    // produirait un `null` indiscernable d'une donnée manquante.
    if (!Number.isFinite(n)) {
      throw new Error(
        `${table}.${column} : « ${value} » n'est pas un nombre représentable en JSON`,
      )
    }
    return n
  }

  // Postgres accepte plusieurs graphies pour un booléen ; on reproduit les
  // seules qu'Athena produit, et on refuse le reste au lieu de le coercer.
  const v = value.trim().toLowerCase()
  if (v === 'true' || v === 't' || v === '1') return true
  if (v === 'false' || v === 'f' || v === '0') return false
  throw new Error(`${table}.${column} : « ${value} » n'est pas un booléen`)
}

/** Connaît-on les types de cette table ?
 *
 *  SI NON, ELLE NE DOIT PAS ENTRER DANS L'INSTANTANÉ. Sans types, la
 *  conversion laisserait toutes les valeurs en chaînes et les modules
 *  recevraient « "0" » là où ils attendent 0 — une panne silencieuse, du
 *  genre que personne ne voit avant qu'un graphique ne trie de travers. Le
 *  cas s'est présenté pour de vrai : `sql/schema.sql`, artefact commité, avait
 *  trois tables de retard sur scripts/tables.json au 2026-08-26.
 *
 *  La table concernée continue simplement d'être lue dans son fichier publié,
 *  comme avant l'instantané. On perd l'économie sur cette table-là, jamais la
 *  justesse. */
export function hasColumnTypes(table: string): boolean {
  return Object.prototype.hasOwnProperty.call(COLUMN_TYPES, table)
}

/** Transforme les lignes Athena (tableaux de valeurs) en objets, dans la
 *  forme EXACTE que sert /v1/datasets — c'est-à-dire celle que les loaders du
 *  site analysent depuis toujours, fichier publié comme API. */
export function rowsToObjects(
  table: string,
  cols: string[],
  rows: (string | null)[][],
): Record<string, unknown>[] {
  if (!hasColumnTypes(table)) {
    throw new Error(
      `${table} : types de colonnes inconnus — régénérer workers/api/src/column-types.ts`,
    )
  }
  const types = COLUMN_TYPES[table]
  return rows.map((row) => {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      obj[col] = castValue(row[i] ?? null, types[col], table, col)
    }
    return obj
  })
}

/** Le manifeste est-il assez frais pour qu'un build s'y fie ?
 *
 *  Même seuil et même philosophie que le contrôle qu'il remplace côté build :
 *  en cas de doute, les fichiers publiés gagnent. */
export function manifestIsFresh(
  manifest: SnapshotManifest | null,
  now: number,
  maxAgeMs: number,
): boolean {
  if (!manifest) return false
  const stamp = Date.parse(manifest.generated_at)
  if (Number.isNaN(stamp)) return false
  return now - stamp <= maxAgeMs
}

/** Segments de clé acceptés : le manifeste, ou <cycle>/<table>.json.
 *
 *  LISTE BLANCHE PAR EXPRESSION RÉGULIÈRE, jamais une concaténation directe
 *  de l'URL : un segment `..` ou une barre oblique encodée composerait une
 *  clé R2 arbitraire, et le bucket contient AUSSI les illustrations de la
 *  Une — un chemin deviné pourrait les lire, voire les servir sous couvert
 *  d'instantané. */
const CYCLE_RE = /^\d{8}T\d{4}Z$/
const TABLE_RE = /^[a-z0-9_]+\.json$/

export function resolveSnapshotKey(segments: string[]): string | null {
  if (segments.length === 1 && segments[0] === 'manifest.json') return MANIFEST_KEY
  if (segments.length === 2 && CYCLE_RE.test(segments[0]) && TABLE_RE.test(segments[1])) {
    return `${SNAPSHOT_PREFIX}${segments[0]}/${segments[1]}`
  }
  return null
}

/** Cycles à supprimer : tout sauf les `keep` plus récents.
 *
 *  `cycles` est une liste d'identifiants ; l'ordre lexicographique suffit,
 *  cf. le format de `cycleId`. */
export function cyclesToPrune(cycles: string[], keep = KEEP_CYCLES): string[] {
  const sorted = [...new Set(cycles)].sort()
  return sorted.slice(0, Math.max(0, sorted.length - keep))
}
