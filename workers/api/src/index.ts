// api.vitrinedemocratique.com — lecture des indicateurs de la Vitrine.
//
// Sert les AGRÉGATS DÉRIVÉS produits par les raffineurs (saillance des enjeux,
// couverture des partis, polimètre, agora), lus depuis Postgres (Neon).
// Cf. docs/reference/api-direction.md.
//
// TROIS PROPRIÉTÉS À NE PAS PERDRE
//
// 1. On ne requête JAMAIS Athena. Latence de plusieurs secondes à froid,
//    facturation au téraoctet scanné : chaque appel d'un client se traduirait
//    en facture imprévisible. Postgres répond en moins d'une milliseconde.
//
// 2. Les tables et colonnes exposées viennent de la LISTE BLANCHE ci-dessous,
//    dérivée de scripts/tables.json. Rien d'autre n'est atteignable, même en
//    devinant un nom de table — c'est ce qui empêche l'API de devenir un accès
//    SQL déguisé.
//
// 3. Les réponses sont mises en cache 4 h, la cadence du rafraîchissement.
//    Postgres ne voit donc qu'une poignée de requêtes par fenêtre quel que
//    soit le trafic : l'API monte en charge comme un CDN.
//
// PAS ENCORE FAIT, ASSUMÉ : ni authentification, ni quotas, ni facturation.
// Cette version est en lecture seule et publique. Les clés d'API viendront
// quand il y aura des clients — cf. § « Ce qu'il reste à faire » du document
// de direction.

import { neon } from '@neondatabase/serverless'
import { runSync } from './sync'
import { isTargetHourInNY } from './schedule'

interface Env {
  DATABASE_URL: string
  CACHE_TTL_SECONDS?: string
}

/** Tables exposées, et colonnes sur lesquelles un filtre est accepté.
 *
 *  Liste blanche explicite plutôt que lecture du catalogue Postgres : une
 *  table ajoutée au schéma ne doit pas devenir publique par accident. Les noms
 *  reproduisent ceux de scripts/tables.json, qui EST le contrat public. */
const DATASETS: Record<string, { filters: string[]; order: string }> = {
  issues_score_day: { filters: ['date_montreal_tz', 'date_utc'], order: 'date_montreal_tz' },
  issues_score_week: { filters: ['date_montreal_tz', 'date_utc'], order: 'date_montreal_tz' },
  issues_score_month: { filters: ['date_montreal_tz', 'date_utc'], order: 'date_montreal_tz' },
  provincial_parties_score_day: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  provincial_parties_score_week: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  provincial_parties_score_month: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  federal_parties_score_week: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  federal_parties_score_month: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  provincial_parties_salient_shadow_day: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  provincial_parties_salient_shadow_week: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  provincial_parties_salient_shadow_month: { filters: ['party', 'date_montreal_tz'], order: 'date_montreal_tz' },
  agora_decideurs_qc: { filters: ['party', 'period_type'], order: 'period_start_date' },
  agora_decideurs_qc_deputes: { filters: ['party', 'deputy', 'period_type'], order: 'period_start_date' },
  polimetre_plus: { filters: [], order: '' },
  headline_events_4h: { filters: [], order: '' },
}

const MAX_LIMIT = 5000
const DEFAULT_LIMIT = 1000

function json(body: unknown, init: ResponseInit = {}, ttl = 0): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('access-control-allow-origin', '*')
  if (ttl > 0) headers.set('cache-control', `public, max-age=${ttl}`)
  return new Response(JSON.stringify(body, null, 2) + '\n', { ...init, headers })
}

function problem(status: number, detail: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: detail, ...extra }, { status })
}

export default {
  /** Cron Trigger : recharge Postgres depuis les JSON publiés, toutes les 4 h.
   *
   *  Le déclencheur est chez Cloudflare — précis à la minute, indépendant de la
   *  file d'attente de GitHub Actions. Voir sync.ts pour ce que cela découple
   *  réellement, et ce que cela ne découple pas. */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Douze déclenchements sont enregistrés — les heures UTC d'été ET celles
    // d'hiver — pour que l'horaire reste fixe à New York sans intervention
    // semestrielle. Six d'entre eux ressortent ici sans rien faire.
    const now = new Date(event.scheduledTime)
    if (!isTargetHourInNY(now)) {
      console.log('déclenchement hors heure visée à New York — ignoré')
      return
    }

    ctx.waitUntil(
      runSync(env.DATABASE_URL).then(({ synced, failed }) => {
        console.log(`sync terminée : ${synced.length} tables, ${failed.length} en échec`)
        if (failed.length > 0) {
          console.error('tables en échec :', failed.map((f) => f.table).join(', '))
        }
      }),
    )
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const ttl = Number(env.CACHE_TTL_SECONDS ?? '14400')

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return problem(405, 'Seules les requêtes GET sont acceptées.')
    }

    // Le cache d'abord : c'est lui qui absorbe la charge. Une réponse servie
    // ici ne touche jamais Postgres.
    const cache = caches.default
    const cached = await cache.match(request)
    if (cached) return cached

    const sql = neon(env.DATABASE_URL)
    const segments = url.pathname.split('/').filter(Boolean)

    try {
      // GET /v1/health — fraîcheur par table. C'est ce qui rend détectable une
      // synchro muette : des données figées qui ont l'air vivantes.
      if (segments[0] === 'v1' && segments[1] === 'health') {
        const rows = await sql`
          SELECT table_name, synced_at, row_count, source
          FROM vitrine.sync_state ORDER BY table_name`
        const oldest = rows.reduce<string | null>(
          (acc, r) => (acc === null || String(r.synced_at) < acc ? String(r.synced_at) : acc),
          null,
        )
        return json({ status: 'ok', tables: rows.length, oldest_sync: oldest, sync_state: rows }, {}, 300)
      }

      // GET /v1/datasets — ce que l'API expose, et comment le filtrer.
      // `!segments[2]` est indispensable : sans lui cette route intercepte
      // aussi /v1/datasets/{nom} et renvoie l'index à la place des lignes.
      if (segments[0] === 'v1' && segments[1] === 'datasets' && !segments[2]) {
        return json(
          {
            datasets: Object.entries(DATASETS).map(([name, spec]) => ({
              name,
              filters: spec.filters,
              path: `/v1/datasets/${name}`,
            })),
          },
          {},
          ttl,
        )
      }

      // GET /v1/datasets/:name?from=&to=&party=&limit=&offset=
      if (segments[0] === 'v1' && segments[1] === 'datasets' && segments[2]) {
        const name = segments[2]
        const spec = DATASETS[name]
        if (!spec) {
          return problem(404, `Jeu de données inconnu : ${name}`, {
            available: Object.keys(DATASETS),
          })
        }

        const limit = Math.min(Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT)
        const offset = Math.max(Number(url.searchParams.get('offset') ?? '0') || 0, 0)

        // Les identifiants viennent de la liste blanche, jamais de l'URL ; les
        // VALEURS passent en paramètres liés. Aucune entrée de l'utilisateur
        // n'est concaténée dans le SQL.
        const wheres: string[] = []
        const params: unknown[] = []

        for (const col of spec.filters) {
          const value = url.searchParams.get(col)
          if (value !== null) {
            params.push(value)
            wheres.push(`"${col}" = $${params.length}`)
          }
        }
        if (spec.order) {
          const from = url.searchParams.get('from')
          const to = url.searchParams.get('to')
          if (from) { params.push(from); wheres.push(`"${spec.order}" >= $${params.length}`) }
          if (to) { params.push(to); wheres.push(`"${spec.order}" <= $${params.length}`) }
        }

        const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''
        const orderBy = spec.order ? `ORDER BY "${spec.order}" DESC` : ''
        params.push(limit, offset)

        const query =
          `SELECT * FROM vitrine."${name}" ${where} ${orderBy} ` +
          `LIMIT $${params.length - 1} OFFSET $${params.length}`

        const rows = await sql.query(query, params)
        const state = await sql`
          SELECT synced_at, row_count FROM vitrine.sync_state WHERE table_name = ${name}`

        const response = json(
          {
            dataset: name,
            synced_at: state[0]?.synced_at ?? null,
            total_rows: state[0]?.row_count ?? null,
            count: rows.length,
            limit,
            offset,
            rows,
          },
          {},
          ttl,
        )
        ctx.waitUntil(cache.put(request, response.clone()))
        return response
      }

      // Racine : de quoi comprendre l'API sans documentation externe.
      if (segments.length === 0) {
        return json(
          {
            name: 'API Vitrine démocratique',
            version: 'v1',
            description:
              "Indicateurs dérivés de la couverture médiatique et des discours politiques au Québec.",
            endpoints: ['/v1/health', '/v1/datasets', '/v1/datasets/{nom}'],
            note: "Version de lecture, sans authentification. Les clés d'API viendront avec l'offre payante.",
          },
          {},
          ttl,
        )
      }

      return problem(404, 'Route inconnue.', { endpoints: ['/v1/health', '/v1/datasets'] })
    } catch (err) {
      // On ne renvoie jamais le message d'erreur brut : il peut contenir la
      // chaîne de connexion ou des noms internes.
      console.error('API error:', err)
      return problem(500, 'Erreur interne.')
    }
  },
}
