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
import { notifySlack, runAthenaSync, triggerDeployHooks, type SyncAthenaEnv } from './sync-athena'
import { authenticate, recordUsage } from './auth'
import { handleAdmin } from './admin'
import { handleArt, type ArtEnv } from './art'
import { handleFlappy } from './flappy'
import { ATHENA_SYNC_MINUTES, isTargetHourInNY, shouldRunAthenaSync } from './schedule'

interface Env extends SyncAthenaEnv, ArtEnv {
  DATABASE_URL: string
  /** Domaine de l'organisation Zero Trust, p. ex. capp-vitrine.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string
  /** `aud` de l'application Access devant /admin. Lie le jeton à CETTE
   *  application : sans lui, un jeton émis pour le miroir dev ouvrirait
   *  l'administration. */
  ACCESS_AUD?: string
  CACHE_TTL_SECONDS?: string
  /** Force la synchro hors des heures visées. UNIQUEMENT pour l'éprouver en
   *  local via `wrangler dev --test-scheduled` : le garde-fou horaire rejette
   *  sinon tout déclenchement manuel qui ne tombe pas pile sur une heure de
   *  New York, ce qui rend la synchro intestable onze heures sur douze.
   *  Défini dans .dev.vars (non versionné), jamais en production. */
  SYNC_FORCE?: string
  /** Jeton interne de l'orchestration par tranches : le cron s'appelle
   *  lui-même sur /v1/sync-athena (chaque appel = un budget CPU neuf).
   *  Généré aléatoirement, posé par `wrangler secret put`, connu de
   *  personne d'autre que le Worker. */
  SYNC_INTERNAL_TOKEN?: string
  /** Service binding vers CE Worker (wrangler.toml). Indispensable : un
   *  fetch() du Worker vers son propre nom d'hôte ne lui revient jamais —
   *  Cloudflare coupe la boucle — et l'orchestration échouait en silence à
   *  chaque cycle (constaté le 2026-08-19 : six occurrences sans trace). */
  SELF?: Fetcher
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

// Pas de conversion de types ici, et c'est voulu : le schéma stocke les
// chaînes telles qu'Athena les publie (`text`), et les entiers en `integer`
// plutôt qu'en `bigint`. L'aller-retour est donc fidèle au caractère près sans
// que l'API n'ait à reformater quoi que ce soit.
//
// La version précédente typait les dates en `date`/`timestamptz` et tentait de
// les restituer avec to_char. Impossible : la source mélange au moins trois
// formes — « 2026-06-12 », « 2026-07-31T20:01:35Z », « 2025-05-28 16:13 ». Un
// seul format de sortie ne pouvait pas les reproduire toutes.

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

    // Les crons se distinguent par leur MINUTE :
    //   :56 = sync DIRECT Athena -> Postgres, la passe qui vise l'heure PILE
    //         (l'édition du midi est préparée à 11h56, cf. #570) ;
    //   :10 = la même chose, en FILET, pour les cycles où la cascade des
    //         raffineurs n'avait encore rien publié à :56 ;
    //   :00 = ancien chemin JSON publiés -> Postgres (retiré des crons).
    // Les deux passes n'ont pas les mêmes heures visées — :56 tombe sur
    // l'heure qui PRÉCÈDE l'édition, :10 sur celle de l'édition — d'où
    // `shouldRunAthenaSync`, qui lit la minute avant de juger l'heure.
    if ((ATHENA_SYNC_MINUTES as readonly number[]).includes(now.getUTCMinutes())) {
      if (env.SYNC_FORCE !== '1' && !shouldRunAthenaSync(now)) {
        console.log('sync-athena : hors heure visée à New York — ignoré')
        return
      }
      // Orchestration PAR TRANCHES : le cron s'appelle lui-même sur la route
      // HTTP, deux tables par appel — chaque appel est une invocation neuve
      // avec son propre budget CPU. La passe monolithique mourait après
      // 8 tables sur 15 (constaté le 2026-08-19) : même leçon que /v1/sync.
      // La règle TOUT OU RIEN vit ici, sur l'agrégat des tranches.
      ctx.waitUntil(
        (async () => {
          if (!env.SYNC_INTERNAL_TOKEN) {
            // Sans alerte, ce serait le GEL TOTAL SILENCIEUX : plus aucune
            // synchro, plus aucun build, et personne ne le sait — la classe
            // de panne la plus chère du chemin critique (audit 2026-08-19).
            await notifySlack(
              env,
              'sync-athena : SYNC_INTERNAL_TOKEN absent — orchestration impossible, le site ne se rafraîchit plus.',
            )
            console.error('SYNC_INTERNAL_TOKEN absent : orchestration impossible')
            return
          }
          // PAR LE SERVICE BINDING, jamais par fetch() global : un Worker qui
          // fetch son propre nom d'hôte ne se rappelle pas lui-même —
          // Cloudflare coupe la boucle — et c'est exactement pourquoi la
          // passe autonome n'a laissé aucune trace sur six cycles le
          // 2026-08-19 pendant que les mêmes tranches, appelées de
          // l'extérieur, réussissaient 15/15. Le binding invoque le Worker
          // pour de vrai, avec un budget CPU neuf par appel.
          if (!env.SELF) {
            await notifySlack(
              env,
              'sync-athena : service binding SELF absent — orchestration impossible, le site ne se rafraîchit plus.',
            )
            console.error('SELF absent : orchestration impossible')
            return
          }
          const failed: string[] = []
          let synced = 0
          let offset: number | null = 0
          try {
            while (offset !== null) {
              const res = await env.SELF.fetch(
                `https://api.vitrinedemocratique.com/v1/sync-athena?offset=${offset}&limit=2`,
                {
                  method: 'POST',
                  headers: { Authorization: `Bearer interne:${env.SYNC_INTERNAL_TOKEN}` },
                },
              )
              if (!res.ok && res.status !== 207) {
                failed.push(`tranche offset=${offset} : HTTP ${res.status}`)
                break
              }
              const body = (await res.json()) as {
                synced: number
                failed: string[]
                next: number | null
              }
              synced += body.synced
              failed.push(...body.failed)
              offset = body.next
            }
          } catch (err) {
            // Une exception ici (réseau, boucle coupée, JSON invalide) était
            // le SILENCE TOTAL : waitUntil l'avalait, ni Slack ni journal.
            const message = err instanceof Error ? err.message : String(err)
            failed.push(`orchestration : ${message}`)
          }
          console.log(`sync-athena (cron) : ${synced} tables, ${failed.length} échec(s)`)
          if (failed.length > 0) {
            await notifySlack(
              env,
              `sync-athena : échec(s) : ${failed.join(', ')} ; builds NON déclenchés.`,
            )
            return
          }
          if (env.SYNC_TRIGGER_DEPLOYS === 'true') {
            try {
              await triggerDeployHooks(env)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              await notifySlack(env, `sync-athena : données écrites mais hook en échec : ${message}`)
            }
          }
        })(),
      )
      return
    }

    if (env.SYNC_FORCE !== '1' && !isTargetHourInNY(now)) {
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


    // /admin d'abord : protégé par Cloudflare Access, jamais mis en cache, et
    // servi avant toute logique de clé d'API — un administrateur n'a pas de
    // clé, il a une identité.
    const seg = url.pathname.split('/').filter(Boolean)
    if (seg[0] === 'admin') {
      const sqlAdmin = neon(env.DATABASE_URL)
      const res = await handleAdmin(request, sqlAdmin, seg, env)
      res.headers.set('cache-control', 'no-store')
      return res
    }

    // /v1/art accepte PUT (téléversement du raffineur) et POST (publish) : il
    // doit être exempté du garde 405 global, comme les routes de synchro —
    // la leçon du 2026-08-19, où le garde avalait POST /v1/sync-athena.
    const isSync = seg[0] === 'v1' && (seg[1] === 'sync' || seg[1] === 'sync-athena')
    const isArt = seg[0] === 'v1' && seg[1] === 'art'
    // /v1/flappy accepte POST (soumission de score, anonyme) : exempté du
    // garde 405 comme les routes de synchro et d'art.
    const isFlappy = seg[0] === 'v1' && seg[1] === 'flappy'
    if (!isSync && !isArt && !isFlappy && request.method !== 'GET' && request.method !== 'HEAD') {
      return problem(405, 'Seules les requêtes GET sont acceptées.')
    }

    // Le cache d'abord : c'est lui qui absorbe la charge. Une réponse servie
    // ici ne touche jamais Postgres.
    //
    // `Cache-Control: no-cache` court-circuite ce cache, selon la sémantique
    // HTTP habituelle. Le build du site s'en sert : il veut les données du
    // cycle courant, pas une réponse vieille de quatre heures. Sans cela, un
    // correctif de format restait invisible au build jusqu'à expiration — ce
    // qui est exactement ce qui s'est produit la première fois.
    const noCache = (request.headers.get('cache-control') ?? '').includes('no-cache')
    const cache = caches.default
    if (!noCache) {
      const cached = await cache.match(request)
      if (cached) return cached
    }

    // Contrepartie du match ci-dessus, LONGTEMPS MANQUANTE : rien n'entrait
    // jamais dans le cache, donc le match ne trouvait jamais rien et chaque
    // requête publique descendait jusqu'à Postgres (audit 2026-08-19). À
    // appeler sur les réponses publiques dont l'en-tête cache-control fait
    // foi ; jamais sur les réponses à clé (elles dépendent de l'appelant).
    const cachePublic = (res: Response): Response => {
      if (request.method === 'GET' && res.status === 200) {
        ctx.waitUntil(cache.put(request, res.clone()))
      }
      return res
    }

    const sql = neon(env.DATABASE_URL)
    const segments = url.pathname.split('/').filter(Boolean)

    try {
      // POST /v1/sync — recharge Postgres depuis les JSON publiés, à la demande.
      //
      // POURQUOI CETTE ROUTE EXISTE. Le cron seul ne suffit pas : refresh-data
      // publie les JSON puis pousse sur `prod`, ce qui déclenche le
      // déploiement dans la minute. Si la synchro n'a lieu que sur son propre
      // horaire, le build lit l'API à un moment où elle contient encore le
      // cycle précédent — c'est la régression observée le 2026-08-18.
      //
      // refresh-data appelle donc cette route APRÈS avoir commité sur main et
      // AVANT de pousser sur `prod`. L'ordre devient garanti au lieu d'espéré,
      // et le cron ne sert plus que de filet.
      //
      // Réservée aux clés portant la portée `sync` : ce n'est pas une lecture,
      // c'est une écriture qui remplace le contenu de quinze tables.
      if (segments[0] === 'v1' && segments[1] === 'sync') {
        if (request.method !== 'POST') {
          return problem(405, 'Utilisez POST pour déclencher une synchronisation.')
        }
        const auth = await authenticate(sql, request, 'sync')
        if (!auth.ok) return problem(auth.status, auth.error)

        // Par TRANCHES : un gestionnaire `fetch` n'a que 10 ms de CPU sur le
        // plan gratuit, là où le cron en a 30 s. Quatre tables par appel
        // passent confortablement ; l'appelant rappelle avec `next` jusqu'à
        // recevoir null.
        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0)
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get('limit') ?? '4') || 4),
          15,
        )

        const started = Date.now()
        const { synced, failed, total, next } = await runSync(env.DATABASE_URL, {
          offset,
          limit,
        })
        return json(
          {
            synced: synced.length,
            tables: synced,
            failed: failed.map((f) => f.table),
            offset,
            total,
            next,
            seconds: Math.round((Date.now() - started) / 1000),
          },
          { status: failed.length > 0 ? 207 : 200 },
        )
      }

      // Déclenchement manuel du sync DIRECT Athena (chaîne émancipée). Même
      // contrat de tranches que /v1/sync, mais le travail CPU par table est
      // plus lourd (analyse des pages Athena) : défaut à 2 tables par appel.
      // Le cron de la minute :10 fait la passe complète ; cette route sert la
      // phase d'ombre et les reprises.
      if (segments[0] === 'v1' && segments[1] === 'sync-athena') {
        if (request.method !== 'POST') {
          return problem(405, 'Utilisez POST pour déclencher une synchronisation.')
        }
        // Deux voies d'entrée : le jeton INTERNE de l'orchestrateur du cron
        // (le Worker s'appelle lui-même par tranches), ou une clé d'API de
        // portée sync pour les déclenchements manuels.
        const authHeader = request.headers.get('authorization') ?? ''
        const interne =
          Boolean(env.SYNC_INTERNAL_TOKEN) &&
          authHeader === `Bearer interne:${env.SYNC_INTERNAL_TOKEN}`
        if (!interne) {
          const auth = await authenticate(sql, request, 'sync')
          if (!auth.ok) return problem(auth.status, auth.error)
        }

        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0)
        const limit = Math.min(
          Math.max(1, Number(url.searchParams.get('limit') ?? '2') || 2),
          15,
        )

        const started = Date.now()
        const { synced, failed, total, next } = await runAthenaSync(env, { offset, limit })
        return json(
          {
            synced: synced.length,
            tables: synced,
            failed: failed.map((f) => f.table),
            offset,
            total,
            next,
            seconds: Math.round((Date.now() - started) / 1000),
          },
          { status: failed.length > 0 ? 207 : 200 },
        )
      }

      // /v1/art/* — l'illustration de la Une des unes (R2). Lecture publique,
      // écriture sous clé `sync`, publication conditionnelle. Cf. art.ts.
      // /v1/flappy/leaderboard — classement du jeu caché (issue #499). Lecture
      // publique cachée 60 s, soumission anonyme validée serveur. Cf. flappy.ts.
      if (segments[0] === 'v1' && segments[1] === 'flappy' && segments[2] === 'leaderboard') {
        return handleFlappy(request, ctx, sql)
      }

      if (segments[0] === 'v1' && segments[1] === 'art') {
        return handleArt(request, env, ctx, sql, segments[2] ?? '')
      }

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
        return cachePublic(
          json({ status: 'ok', tables: rows.length, oldest_sync: oldest, sync_state: rows }, {}, 300),
        )
      }

      // GET /v1/datasets — ce que l'API expose, et comment le filtrer.
      // `!segments[2]` est indispensable : sans lui cette route intercepte
      // aussi /v1/datasets/{nom} et renvoie l'index à la place des lignes.
      if (segments[0] === 'v1' && segments[1] === 'datasets' && !segments[2]) {
        return cachePublic(json(
          {
            datasets: Object.entries(DATASETS).map(([name, spec]) => ({
              name,
              filters: spec.filters,
              path: `/v1/datasets/${name}`,
            })),
          },
          {},
          ttl,
        ))
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

        // Les données sont le produit : la lecture d'un jeu demande une clé.
        // /v1/health et /v1/datasets restent ouverts — l'un sert à surveiller,
        // l'autre à découvrir ce qui existe, et ni l'un ni l'autre ne livre de
        // donnée.
        const auth = await authenticate(sql, request, name)
        if (!auth.ok) return problem(auth.status, auth.error)

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
        ctx.waitUntil(recordUsage(sql, auth.key.id, name, rows.length))

        // PAS de mise en cache partagée ici : la réponse dépend de la clé
        // (portées, quotas), et `caches.default` est commun à tous les
        // appelants. Une réponse servie à une clé ne doit jamais être resservie
        // à une autre. Le cache reste en place pour /v1/datasets, qui ne
        // dépend d'aucune clé.
        return response
      }

      // Racine : de quoi comprendre l'API sans documentation externe.
      if (segments.length === 0) {
        return cachePublic(json(
          {
            name: 'API Vitrine démocratique',
            version: 'v1',
            description:
              "Indicateurs dérivés de la couverture médiatique et des discours politiques au Québec.",
            endpoints: ['/v1/health', '/v1/datasets', '/v1/datasets/{nom}', '/v1/art/latest.{png,webp,avif,json}'],
            note: "Version de lecture, sans authentification. Les clés d'API viendront avec l'offre payante.",
          },
          {},
          ttl,
        ))
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
