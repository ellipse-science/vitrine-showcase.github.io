// Synchro périodique : JSON publiés → Postgres (Neon).
//
// Déclenchée par un Cron Trigger Cloudflare, toutes les 4 h, calé sur le cycle
// de rafraîchissement des données.
//
// CE QUE CETTE SYNCHRO DÉCOUPLE, ET CE QU'ELLE NE DÉCOUPLE PAS
//
// Le DÉCLENCHEUR est chez Cloudflare : précis à la minute, indépendant de la
// disponibilité et de la file d'attente de GitHub Actions. C'est ce qui était
// demandé — « quelque chose dont on sait que ça se déclenche à la bonne heure ».
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
// STRATÉGIE : remplacement intégral par table, une transaction par table.
// fetch_data.R republie les tables entières à chaque cycle, il n'y a donc aucun
// delta à exploiter ; et deviner une clé naturelle par table produirait des
// doublons ou des écrasements silencieux.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

const RAW_BASE =
  'https://raw.githubusercontent.com/ellipse-science/vitrine-showcase.github.io/main'

/** Lignes insérées par requête.
 *
 *  Postgres plafonne à 65 535 paramètres liés par requête. La table la plus
 *  large a 46 colonnes : 500 × 46 = 23 000, confortablement en dessous. Assez
 *  gros pour limiter les allers-retours HTTP, assez petit pour ne pas frôler la
 *  limite si une colonne est ajoutée au contrat. */
const BATCH_ROWS = 500

export { isTargetHourInNY, TARGET_HOURS_NY } from './schedule'

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

/** Normalise une valeur JSON vers ce que le pilote Postgres accepte.
 *
 *  Une chaîne vide devient NULL : Athena publie des vides là où la donnée est
 *  absente, et les laisser tels quels ferait échouer l'insertion sur les
 *  colonnes date et numériques. */
function cell(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' && value === '') return null
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

async function syncTable(
  sql: NeonQueryFunction<false, false>,
  spec: TableSpec,
): Promise<number> {
  const rows = await fetchJson<Record<string, unknown>[]>(`${RAW_BASE}/${spec.out}`)
  const list = Array.isArray(rows) ? rows : []

  const quoted = spec.cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')
  const table = `vitrine."${spec.name.replace(/"/g, '""')}"`

  // Une transaction par table : un lecteur de l'API voit l'ancien jeu complet
  // ou le nouveau, jamais une table à moitié vide.
  await sql.query('BEGIN')
  try {
    await sql.query(`TRUNCATE ${table}`)

    for (let i = 0; i < list.length; i += BATCH_ROWS) {
      const batch = list.slice(i, i + BATCH_ROWS)
      const params: unknown[] = []
      const tuples = batch.map((row) => {
        const placeholders = spec.cols.map((col) => {
          params.push(cell(row?.[col]))
          return `$${params.length}`
        })
        return `(${placeholders.join(', ')})`
      })
      await sql.query(`INSERT INTO ${table} (${quoted}) VALUES ${tuples.join(', ')}`, params)
    }

    await sql.query(
      `INSERT INTO vitrine.sync_state (table_name, synced_at, row_count, source)
       VALUES ($1, now(), $2, 'cron-json')
       ON CONFLICT (table_name) DO UPDATE SET
         synced_at = EXCLUDED.synced_at,
         row_count = EXCLUDED.row_count,
         source = EXCLUDED.source`,
      [spec.name, list.length],
    )
    await sql.query('COMMIT')
  } catch (err) {
    await sql.query('ROLLBACK')
    throw err
  }

  return list.length
}

export async function runSync(databaseUrl: string): Promise<{
  synced: string[]
  failed: { table: string; error: string }[]
}> {
  const sql = neon(databaseUrl)
  const config = await fetchJson<{ tables: TableSpec[] }>(`${RAW_BASE}/scripts/tables.json`)
  const enabled = config.tables.filter((t) => t.enabled)

  const synced: string[] = []
  const failed: { table: string; error: string }[] = []

  // Séquentiel, volontairement : en parallèle, quinze tables en mémoire d'un
  // coup dépasseraient la limite du Worker, et rien ne presse — la fenêtre est
  // de quatre heures.
  for (const spec of enabled) {
    try {
      const n = await syncTable(sql, spec)
      console.log(`sync ${spec.name}: ${n} lignes`)
      synced.push(spec.name)
    } catch (err) {
      // Une table en échec n'emporte pas les autres. L'échec reste visible dans
      // sync_state : son synced_at cesse d'avancer.
      const message = err instanceof Error ? err.message : String(err)
      console.error(`sync ${spec.name} A ÉCHOUÉ: ${message}`)
      failed.push({ table: spec.name, error: message })
    }
  }

  return { synced, failed }
}
