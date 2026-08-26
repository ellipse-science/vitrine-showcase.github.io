// Synchro périodique : JSON publiés → Postgres (Neon).
//
// Déclenchée par un Cron Trigger Cloudflare, toutes les 4 h, calé sur le cycle
// de rafraîchissement des données.
//
// CE QUE CETTE SYNCHRO DÉCOUPLE, ET CE QU'ELLE NE DÉCOUPLE PAS
//
// Le DÉCLENCHEUR est chez Cloudflare : précis à la minute, indépendant de la
// disponibilité et de la file d'attente de GitHub Actions.
//
// La PRODUCTION des données reste dans GitHub Actions : c'est fetch_data.R qui
// interroge Athena et publie les JSON. On lit son résultat, on ne le remplace
// pas. Une vraie indépendance demanderait de porter 728 lignes de R vers
// TypeScript, dont le calcul de calibration — un risque sur des chiffres
// publics, pour un gain qui reste à démontrer.
//
// POURQUOI LIRE LE JSON PLUTÔT QU'ATHENA : le Worker n'a alors besoin d'AUCUN
// identifiant AWS. Le dépôt est public, la lecture est un simple GET sur un CDN.
//
// ────────────────────────────────────────────────────────────────────────────
// POURQUOI POSTGRES DÉPLIE LE JSON, ET PAS LE WORKER
//
// La première version faisait `JSON.parse` des ~11 Mo, puis construisait ~28 000
// paramètres liés. Sur le plan gratuit de Workers — 10 ms de CPU par invocation
// — elle mourait après quatre tables, en silence : le cron répondait « succès »
// et onze tables restaient sur les données de la veille.
//
// Ici, le corps JSON part TEL QUEL en un seul paramètre, et `jsonb_to_recordset`
// le déplie côté serveur. Le Worker ne parse plus rien : son travail se réduit à
// un GET et une requête. Le CPU passe de « des secondes » à « négligeable », et
// le coût de dépliage atterrit dans Postgres, dont c'est le métier.
//
// Effet de bord : les types de colonnes ne sont plus devinés côté Worker. Ils
// sont lus dans `information_schema`, donc c'est le schéma réel qui fait foi —
// une colonne ajoutée au contrat suit automatiquement.
//
// STRATÉGIE : remplacement intégral par table, une transaction par table.
// fetch_data.R republie les tables entières à chaque cycle : aucun delta à
// exploiter, et deviner une clé naturelle produirait doublons ou écrasements.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export { isTargetHourInNY, TARGET_HOURS_NY } from './schedule'

const RAW_BASE =
  'https://raw.githubusercontent.com/ellipse-science/vitrine-showcase.github.io/main'

interface TableSpec {
  name: string
  out: string
  cols: string[]
  enabled: boolean
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cf: { cacheTtl: 0 } })
  if (!res.ok) throw new Error(`${res.status} sur ${url}`)
  return (await res.json()) as T
}

/** Corps brut, sans parse — c'est tout l'intérêt : le Worker ne touche pas au
 *  contenu, il le relaie. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cf: { cacheTtl: 0 } })
  if (!res.ok) throw new Error(`${res.status} sur ${url}`)
  return await res.text()
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** Définition de colonnes pour `jsonb_to_recordset`, lue dans le schéma réel.
 *
 *  On ne redéclare pas les types ici : `information_schema` fait foi, donc une
 *  colonne ajoutée au contrat et appliquée au schéma est reprise sans toucher
 *  au Worker. */
async function recordDefinition(
  sql: NeonQueryFunction<false, false>,
  table: string,
  cols: string[],
): Promise<string> {
  const rows = (await sql.query(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'vitrine' AND table_name = $1`,
    [table],
  )) as { column_name: string; data_type: string }[]

  const types = new Map(rows.map((r) => [r.column_name, r.data_type]))
  const missing = cols.filter((c) => !types.has(c))
  if (missing.length > 0) {
    throw new Error(
      `colonnes absentes du schéma : ${missing.join(', ')} — réappliquer sql/schema.sql`,
    )
  }
  return cols.map((c) => `${quoteIdent(c)} ${types.get(c)}`).join(', ')
}

async function syncTable(
  sql: NeonQueryFunction<false, false>,
  spec: TableSpec,
): Promise<number> {
  const body = await fetchText(`${RAW_BASE}/${spec.out}`)
  const definition = await recordDefinition(sql, spec.name, spec.cols)

  const table = `vitrine.${quoteIdent(spec.name)}`
  const colList = spec.cols.map(quoteIdent).join(', ')

  // Une transaction par table : un lecteur voit l'ancien jeu complet ou le
  // nouveau, jamais une table à moitié vide.
  await sql.query('BEGIN')
  try {
    await sql.query(`TRUNCATE ${table}`)

    // `NULLIF(..., '')` reproduit la règle de l'ancienne version : Athena publie
    // des chaînes vides là où la donnée manque, et les laisser telles quelles
    // ferait échouer l'insertion sur les colonnes date et numériques.
    await sql.query(
      `INSERT INTO ${table} (${colList})
       SELECT ${colList} FROM jsonb_to_recordset(
         (SELECT jsonb_agg(
            (SELECT jsonb_object_agg(k, NULLIF(v #>> '{}', ''))
               FROM jsonb_each(elem) AS e(k, v))
          )
          FROM jsonb_array_elements($1::jsonb) AS a(elem))
       ) AS x(${definition})`,
      [body],
    )

    // On recompte plutôt que de lire le `rowCount` du pilote : sur le pilote
    // HTTP de Neon il revenait à 0 alors que l'insertion avait bien eu lieu,
    // et sync_state annonçait « 0 ligne » sur des tables pleines — exactement
    // le genre de faux signal que sync_state existe pour éviter.
    const counted = (await sql.query(`SELECT count(*)::int AS n FROM ${table}`)) as
      | { n: number }[]
      | { rows: { n: number }[] }
    const rows = Array.isArray(counted) ? counted : counted.rows
    const count = rows?.[0]?.n ?? 0

    await sql.query(
      `INSERT INTO vitrine.sync_state (table_name, synced_at, row_count, source)
       VALUES ($1, now(), $2, 'cron-json')
       ON CONFLICT (table_name) DO UPDATE SET
         synced_at = EXCLUDED.synced_at,
         row_count = EXCLUDED.row_count,
         source = EXCLUDED.source`,
      [spec.name, count],
    )
    await sql.query('COMMIT')
    return count
  } catch (err) {
    await sql.query('ROLLBACK')
    throw err
  }
}

/** Recharge les tables, éventuellement par TRANCHE.
 *
 *  POURQUOI LES TRANCHES : sur le plan gratuit de Workers, un gestionnaire
 *  `scheduled` dispose de 30 s de CPU, mais un gestionnaire `fetch` n'en a que
 *  10 ms. Le cron passe donc les dix-neuf tables d'un coup, tandis qu'un
 *  déclenchement HTTP meurt vers la sixième. Plutôt que de faire dépendre la
 *  fraîcheur du site d'un abonnement, l'appelant HTTP demande quelques tables
 *  à la fois et rappelle jusqu'à épuisement.
 *
 *  `offset`/`limit` portent sur la LISTE DES TABLES, pas sur les lignes. */
export async function runSync(
  databaseUrl: string,
  slice?: { offset: number; limit: number },
): Promise<{
  synced: string[]
  failed: { table: string; error: string }[]
  total: number
  next: number | null
}> {
  const sql = neon(databaseUrl)
  const config = await fetchJson<{ tables: TableSpec[] }>(`${RAW_BASE}/scripts/tables.json`)
  const all = config.tables.filter((t) => t.enabled)
  const total = all.length
  const start = slice ? Math.max(0, slice.offset) : 0
  const enabled = slice ? all.slice(start, start + slice.limit) : all

  const synced: string[] = []
  const failed: { table: string; error: string }[] = []

  for (const spec of enabled) {
    try {
      const n = await syncTable(sql, spec)
      console.log(`sync ${spec.name}: ${n} lignes`)
      synced.push(spec.name)
    } catch (err) {
      // Une table en échec n'emporte pas les autres. L'échec reste visible dans
      // sync_state : son synced_at cesse d'avancer, et /v1/health l'expose.
      const message = err instanceof Error ? err.message : String(err)
      console.error(`sync ${spec.name} A ÉCHOUÉ: ${message}`)
      failed.push({ table: spec.name, error: message })
    }
  }

  const consumed = start + enabled.length
  return { synced, failed, total, next: consumed < total ? consumed : null }
}
