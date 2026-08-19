// Synchronisation DIRECTE Athena -> Postgres, sans GitHub.
//
// POURQUOI CE MODULE EXISTE. Directive du 2026-08-19 : la chaîne planifiée du
// site s'émancipe de GitHub Actions et de cron-job.org. Ce module fait dans le
// Worker ce que fetch_data.R faisait dans un runner GitHub : lire les tables
// blanchies d'Athena (clés de LECTURE seulement), appliquer la rétention,
// écrire dans Postgres, puis déclencher les builds. Le cron Cloudflare est le
// seul planificateur.
//
// CE QUI A FONDU PAR RAPPORT AU R : l'API REST d'Athena renvoie toutes les
// valeurs en chaînes — les dates arrivent déjà en ISO (le piège « nombre de
// jours » du binding R disparaît) et Postgres caste les nombres à l'insertion
// (même mécanisme que l'ancien chemin JSON). Restent : les deux filtres de
// rétention et la normalisation chaîne vide -> NULL.
//
// STRATÉGIE D'ÉCRITURE : remplacement intégral par table, une transaction par
// table (TRUNCATE puis INSERT par lots), row_count RECOMPTÉ après insertion
// (l'invariant hérité de sync.ts), sync_state avec source 'cf-athena' — le
// champ qui arbitre la phase d'ombre face à 'cron-json' (ancien chemin) et
// 'aws-refiner' (option Lambda).
//
// RÈGLE DES HOOKS : TOUT OU RIEN, et seulement quand SYNC_TRIGGER_DEPLOYS est
// à 'true' (phase d'ombre = false : on écrit Postgres, aucun build déclenché).
import { Client } from '@neondatabase/serverless'
import { AthenaClient } from './athena'
import { TABLES, type TableSpec } from './tables'

export const HEADLINE_KEEP_DAYS = 14
export const POLIMETRE_KEEP_DAYS = 70
// 400 lignes x 46 colonnes (la table la plus large) = 18 400 paramètres par
// INSERT, loin de la limite Postgres de 65 535.
const BATCH_ROWS = 400

export interface SyncAthenaEnv {
  DATABASE_URL: string
  AWS_ACCESS_KEY_ID_DEV?: string
  AWS_SECRET_ACCESS_KEY_DEV?: string
  ATHENA_REGION?: string
  ATHENA_DATABASE?: string
  ATHENA_OUTPUT?: string
  SYNC_TRIGGER_DEPLOYS?: string
  DEPLOY_HOOK_PROD?: string
  DEPLOY_HOOK_DEV?: string
  SLACK_WEBHOOK_URL?: string
}

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

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

interface TableResult {
  table: string
  rows: number
}

interface FailedTable {
  table: string
  error: string
}

async function fetchTableRows(
  athena: AthenaClient,
  spec: TableSpec,
): Promise<(string | null)[][]> {
  const colList = spec.cols.map(quoteIdent).join(', ')
  // La fenêtre headline est poussée DANS Athena : rapatrier la table entière
  // (4669 lignes aux blobs d'articles) dépassait les ressources du Worker
  // (erreur 1102 constatée) ; filtrée à la source, il reste ~770 lignes.
  // Le filtre JS en aval reste comme ceinture et bretelles.
  const where =
    spec.filter === 'headline_events_window'
      ? ` WHERE ${quoteIdent('date_utc')} >= date_add('day', -${HEADLINE_KEEP_DAYS}, current_date)`
      : ''
  const id = await athena.start(
    `SELECT ${colList} FROM ${quoteIdent(spec.athena)}${where}`,
  )
  await athena.waitUntilDone(id)

  const rows: (string | null)[][] = []
  if (spec.filter === 'headline_events_window') {
    // Filtre au fil de l'eau : la table brute est la plus lourde (blobs
    // d'articles) ; on ne garde en mémoire que la fenêtre de 14 jours.
    const cutoff = isoDaysAgo(HEADLINE_KEEP_DAYS)
    const dateIdx = spec.cols.indexOf('date_utc')
    for await (const row of athena.rows(id)) {
      if (dateIdx === -1 || keepHeadlineRow(row[dateIdx], cutoff)) {
        rows.push(row.map(normalizeValue))
      }
    }
    return rows
  }

  for await (const row of athena.rows(id)) {
    rows.push(row.map(normalizeValue))
  }

  if (spec.filter === 'polimetre_plus_recent') {
    const idx = spec.cols.indexOf('week_end_date')
    if (idx !== -1) {
      const cutoff = polimetreCutoff(rows.map((r) => r[idx]))
      if (cutoff !== null) {
        return rows.filter((r) => r[idx] !== null && (r[idx] as string) >= cutoff)
      }
    }
  } else if (spec.filter) {
    console.warn(`filtre inconnu « ${spec.filter} » : passage tel quel`)
  }
  return rows
}

async function writeTable(
  pg: Client,
  spec: TableSpec,
  rows: (string | null)[][],
): Promise<number> {
  const table = `vitrine.${quoteIdent(spec.name)}`
  const colList = spec.cols.map(quoteIdent).join(', ')
  await pg.query('BEGIN')
  try {
    await pg.query(`TRUNCATE ${table}`)
    for (let start = 0; start < rows.length; start += BATCH_ROWS) {
      const batch = rows.slice(start, start + BATCH_ROWS)
      const placeholders = batch
        .map(
          (_, r) =>
            `(${spec.cols.map((_, c) => `$${r * spec.cols.length + c + 1}`).join(', ')})`,
        )
        .join(', ')
      await pg.query(
        `INSERT INTO ${table} (${colList}) VALUES ${placeholders}`,
        batch.flat(),
      )
    }
    // Recomptage post-insertion : ne jamais se fier au compte du pilote
    // (leçon documentée de sync.ts, où le pilote HTTP rapportait 0 ligne).
    const counted = await pg.query(`SELECT count(*)::int AS n FROM ${table}`)
    const n = Number(counted.rows[0]?.n ?? 0)
    await pg.query(
      `INSERT INTO vitrine.sync_state (table_name, synced_at, row_count, source)
       VALUES ($1, now(), $2, 'cf-athena')
       ON CONFLICT (table_name) DO UPDATE SET
         synced_at = EXCLUDED.synced_at,
         row_count = EXCLUDED.row_count,
         source = EXCLUDED.source`,
      [spec.name, n],
    )
    await pg.query('COMMIT')
    return n
  } catch (err) {
    await pg.query('ROLLBACK').catch(() => {})
    throw err
  }
}

export async function notifySlack(env: SyncAthenaEnv, text: string): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) return
  try {
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.status >= 300) console.error(`Slack a répondu ${res.status}`)
  } catch (err) {
    console.error('Alerte Slack impossible :', err)
  }
}

export async function triggerDeployHooks(env: SyncAthenaEnv): Promise<void> {
  const hooks: [string, string | undefined][] = [
    ['prod', env.DEPLOY_HOOK_PROD],
    ['dev', env.DEPLOY_HOOK_DEV],
  ]
  for (const [name, url] of hooks) {
    if (!url) {
      console.warn(`hook ${name} absent : aucun build déclenché pour ${name}`)
      continue
    }
    const res = await fetch(url, { method: 'POST' })
    if (res.status >= 300) throw new Error(`Deploy hook ${name} a répondu ${res.status}`)
    console.log(`hook ${name} déclenché`)
  }
}

export interface SyncAthenaResult {
  synced: TableResult[]
  failed: FailedTable[]
  total: number
  next: number | null
}

/** Exécute la synchronisation sur une TRANCHE de la whitelist (offset/limit
 *  sur la liste des tables, comme /v1/sync). Le cron passe sans tranche :
 *  les 15 tables. Les hooks ne partent que sur une passe complète, sans
 *  échec, et si SYNC_TRIGGER_DEPLOYS vaut 'true'. */
export async function runAthenaSync(
  env: SyncAthenaEnv,
  slice: { offset?: number; limit?: number } = {},
): Promise<SyncAthenaResult> {
  if (!env.AWS_ACCESS_KEY_ID_DEV || !env.AWS_SECRET_ACCESS_KEY_DEV) {
    throw new Error(
      'Clés de lecture Athena absentes (secrets AWS_ACCESS_KEY_ID_DEV / AWS_SECRET_ACCESS_KEY_DEV).',
    )
  }
  const offset = slice.offset ?? 0
  const limit = slice.limit ?? TABLES.length
  const specs = TABLES.slice(offset, offset + limit)
  const next = offset + limit < TABLES.length ? offset + limit : null

  const athena = new AthenaClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID_DEV,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY_DEV,
    region: env.ATHENA_REGION ?? 'ca-central-1',
    database: env.ATHENA_DATABASE ?? 'gluestackdatamartdbd046f685',
    outputLocation:
      env.ATHENA_OUTPUT ??
      's3://pipeline-stack-athenaqueryresultsbucket6f63bbe4-1hrrrojv867l3/',
  })

  const pg = new Client(env.DATABASE_URL)
  await pg.connect()

  const synced: TableResult[] = []
  const failed: FailedTable[] = []
  try {
    for (const spec of specs) {
      try {
        const rows = await fetchTableRows(athena, spec)
        const n = await writeTable(pg, spec, rows)
        console.log(`${spec.name} : ${n} lignes (cf-athena)`)
        synced.push({ table: spec.name, rows: n })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`${spec.name} en échec :`, message)
        failed.push({ table: spec.name, error: message })
      }
    }
  } finally {
    await pg.end().catch(() => {})
  }

  // Ni Slack ni hooks ici : une TRANCHE ne connaît pas le sort de la passe.
  // La règle tout-ou-rien appartient à l'orchestrateur du cron (index.ts),
  // qui agrège les tranches ; le budget CPU d'une invocation planifiée ne
  // survit pas aux 15 tables d'un coup (constaté le 2026-08-19 : la passe
  // monolithique mourait après 8 tables), c'est la même leçon que /v1/sync.
  return { synced, failed, total: TABLES.length, next }
}
