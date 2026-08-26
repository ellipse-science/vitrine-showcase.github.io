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
import { hasColumnTypes, putTableSnapshot, rowsToObjects, type SnapshotEnv } from './snapshot'
import type { SnapshotTableEntry } from './snapshot-logic'
import { TABLES, type TableSpec } from './tables'
import {
  HEADLINE_KEEP_DAYS,
  isoDaysAgo,
  keepHeadlineRow,
  normalizeValue,
  polimetreCutoff,
} from './transforms'

// Fenêtres de rétention et normalisation : voir ./transforms. Réexportées ici
// pour que les importateurs existants du module ne changent pas.
export {
  HEADLINE_KEEP_DAYS,
  POLIMETRE_KEEP_DAYS,
  isoDaysAgo,
  normalizeValue,
  keepHeadlineRow,
  polimetreCutoff,
} from './transforms'

// 400 lignes x 46 colonnes (la table la plus large) = 18 400 paramètres par
// INSERT, loin de la limite Postgres de 65 535.
const BATCH_ROWS = 400

export interface SyncAthenaEnv extends SnapshotEnv {
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

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

interface TableResult {
  table: string
  rows: number
  /** Entrée de manifeste produite par le dépôt R2 de cette table. Absente
   *  quand la passe tourne sans cycle (appel manuel de reprise) ou sans
   *  bucket lié : l'instantané est alors simplement pas alimenté, et le
   *  build continue de lire les fichiers publiés. */
  snapshot?: SnapshotTableEntry
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
    // GARDE ZÉRO-LIGNE. Une requête Athena qui renvoie 0 ligne sur une table
    // qui en avait est presque toujours une panne amont (partition manquante,
    // vue vide, permission), pas une réalité éditoriale. Sans cette garde, on
    // TRUNCATE, on committe « 0 ligne, succès », le tout-ou-rien passe, les
    // hooks tirent et le site se reconstruit avec un module VIDE. Le risque
    // avait été accepté en phase d'ombre (M1, trigger_deploys=false) — il ne
    // l'était plus depuis l'armement des hooks (audit 2026-08-19). Échouer la
    // table suffit : le tout-ou-rien retient les hooks, la transaction est
    // annulée, et l'ancienne donnée continue d'être servie.
    if (rows.length === 0) {
      const prev = await pg.query(
        `SELECT row_count FROM vitrine.sync_state WHERE table_name = $1`,
        [spec.name],
      )
      const previous = Number(prev.rows[0]?.row_count ?? 0)
      if (previous > 0) {
        throw new Error(
          `0 ligne reçue d'Athena alors que ${spec.name} en comptait ${previous} — table préservée`,
        )
      }
    }
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

export { triggerDeployHooks } from './deploy-hooks'

export interface SyncAthenaResult {
  synced: TableResult[]
  failed: FailedTable[]
  /** Tables synchronisées mais laissées hors de l'instantané, avec la raison.
   *  Distinct de `failed` À DESSEIN : la synchro a réussi. */
  snapshotSkipped: string[]
  total: number
  next: number | null
}

/** Exécute la synchronisation sur une TRANCHE de la whitelist (offset/limit
 *  sur la liste des tables, comme /v1/sync). Le cron passe sans tranche :
 *  les 19 tables. Les hooks ne partent que sur une passe complète, sans
 *  échec, et si SYNC_TRIGGER_DEPLOYS vaut 'true'. */
export async function runAthenaSync(
  env: SyncAthenaEnv,
  slice: { offset?: number; limit?: number; cycle?: string } = {},
): Promise<SyncAthenaResult> {
  if (!env.AWS_ACCESS_KEY_ID_DEV || !env.AWS_SECRET_ACCESS_KEY_DEV) {
    throw new Error(
      'Clés de lecture Athena absentes (secrets AWS_ACCESS_KEY_ID_DEV / AWS_SECRET_ACCESS_KEY_DEV).',
    )
  }
  const offset = slice.offset ?? 0
  const limit = slice.limit ?? TABLES.length
  const cycle = slice.cycle
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
  /** Tables écrites dans Postgres mais PAS dans l'instantané. Jamais un
   *  échec de synchro (cf. le side-car plus bas) : une information, qui
   *  remonte jusqu'à Slack pour que la dérive ne s'installe pas en silence. */
  const snapshotSkipped: string[] = []
  try {
    for (const spec of specs) {
      try {
        const rows = await fetchTableRows(athena, spec)
        const n = await writeTable(pg, spec, rows)

        // INSTANTANÉ R2, ÉCRIT AU PASSAGE. Les lignes sont déjà là, en
        // mémoire : c'est précisément ce que le build allait sinon
        // redemander à Postgres, table par table, à chaque build (incident
        // du 2026-08-26, cf. l'en-tête de snapshot.ts). Le dépôt vient
        // APRÈS le COMMIT, jamais avant : une table n'entre dans
        // l'instantané que si elle est entrée dans la base.
        //
        // Une conversion qui échoue (colonne numérique polluée en amont)
        // lève et fait ÉCHOUER la table — donc retient les hooks et
        // préserve la donnée servie, comme la garde zéro-ligne ci-dessus.
        // L'INSTANTANÉ EST UN SIDE-CAR : il ne peut JAMAIS faire échouer la
        // synchro. Postgres a déjà commité à ce stade, et un échec ici
        // remonterait dans `failed`, donc retiendrait les Deploy Hooks au
        // titre du tout-ou-rien : le site cesserait de se rafraîchir pour
        // protéger une copie dont il n'a pas besoin pour fonctionner. C'est
        // l'inverse du bon compromis.
        //
        // Une table qui n'entre pas dans l'instantané en est simplement
        // ABSENTE, donc absente du manifeste, donc lue par le build dans son
        // fichier publié : le comportement d'avant cette PR. On perd
        // l'économie sur cette table, jamais la justesse ni l'édition.
        let snapshot: SnapshotTableEntry | undefined
        if (cycle && env.ART_BUCKET) {
          try {
            if (!hasColumnTypes(spec.name)) {
              throw new Error('types de colonnes inconnus (régénérer column-types.ts)')
            }
            const objects = rowsToObjects(spec.name, spec.cols, rows)
            snapshot = await putTableSnapshot(env.ART_BUCKET, cycle, spec.name, objects)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.warn(`${spec.name} : hors instantané (${message})`)
            snapshotSkipped.push(`${spec.name} : ${message}`)
          }
        }

        console.log(
          `${spec.name} : ${n} lignes (cf-athena)` +
            (snapshot ? `, instantané ${Math.round(snapshot.bytes / 1024)} Ko` : ''),
        )
        synced.push({ table: spec.name, rows: n, snapshot })
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
  // survit pas aux 19 tables d'un coup (constaté le 2026-08-19 : la passe
  // monolithique mourait après 8 tables), c'est la même leçon que /v1/sync.
  return { synced, failed, snapshotSkipped, total: TABLES.length, next }
}
