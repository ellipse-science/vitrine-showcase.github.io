// /v1/art — l'illustration de la Une des unes, servie depuis R2.
//
// POURQUOI CETTE ROUTE EXISTE. L'illustration était générée par
// `generate_art.py` dans refresh-data.yml puis COMMITÉE dans le dépôt — le
// dernier morceau du chemin critique encore accroché à GitHub Actions, et
// depuis la démotion de refresh-data au rythme hebdomadaire, une illustration
// qui vieillissait d'une semaine sous une Une qui change toutes les 4 h.
//
// Le nouveau circuit (spec émancipation totale, rangée « vitrine-media ») :
// le raffineur vitrine-art lit la Une désignée sur le SITE DÉPLOYÉ
// (data/hero-selection.json — même code de sélection que le rendu, jamais de
// double implémentation, cf. issue #259), génère l'image, la PUT ici, puis
// POST /v1/art/publish. Si la Une illustrée a changé, le Worker déclenche les
// Deploy Hooks : le build suivant rapatrie l'image (scripts/fetch_art.mjs) et
// l'inline dans l'export statique. Les visiteurs ne touchent jamais R2.
//
// POURQUOI R2 ET PAS POSTGRES. Un PNG de ~1,5 Mo en bytea traverserait le
// Worker en l'encodant/décodant — plusieurs dizaines de millisecondes de CPU,
// là où le plan gratuit en donne 10 par requête (la leçon de la passe
// monolithique du 2026-08-19). R2 se lit et s'écrit en STREAMING : le corps
// passe du réseau au bucket sans jamais être matérialisé en mémoire.
//
// DEPUIS LE 2026-09-04, LE BUILD ILLUSTRE LUI-MÊME (scripts/ensure_art.ts,
// vitrine-showcase#723) : il lit ou dépose l'image de la Une sous sa clé
// d'histoire (`une/<clé>.*`) et prend ses références chez `references/*.jpg`.
// Le circuit du raffineur (latest.* + /publish) reste servi tel quel : il
// devient un filet, et trouve l'image « déjà à jour » quand le build est passé.

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { authenticate } from './auth'
import {
  ART_CACHE_CONTROL,
  ART_FILES,
  MAX_UPLOAD_BYTES,
  POCHETTES_HORIZON_JOURS,
  POCHETTES_REGISTRE,
  REFERENCES_INDEX,
  borneIndex,
  borneJoursPosterieurs,
  heroKey,
  parsePochette,
  premierePochettePosterieure,
  parseReference,
  parseUne,
  publishDecision,
} from './art-logic'
import { notifySlack, triggerDeployHooks, type SyncAthenaEnv } from './sync-athena'

export { ART_FILES, MAX_UPLOAD_BYTES, heroKey, parsePochette, publishDecision } from './art-logic'

export interface ArtEnv extends SyncAthenaEnv {
  ART_BUCKET?: R2Bucket
}

/** Objet R2 qui retient la dernière Une PUBLIÉE (clé + horodatage). C'est lui
 *  qui rend /publish idempotent : pas de nouvelle Une, pas de rebuild — un
 *  cycle où la Une n'a pas changé ne coûte ni build ni image. */
const PUBLISHED_MARKER = 'art/published.json'

/** Préfixe des objets images dans le bucket. */
const OBJECT_PREFIX = 'art/'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  })
}

export async function handleArt(
  request: Request,
  env: ArtEnv,
  ctx: ExecutionContext,
  sql: NeonQueryFunction<false, false>,
  file: string,
): Promise<Response> {
  if (!env.ART_BUCKET) {
    return json({ error: "Bucket d'illustrations non configuré." }, 503)
  }

  // POST /v1/art/publish — déclenche les builds si la Une illustrée a changé.
  if (file === 'publish') {
    if (request.method !== 'POST') {
      return json({ error: 'Utilisez POST pour publier.' }, 405)
    }
    const auth = await authenticate(sql, request, 'sync')
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const metaObj = await env.ART_BUCKET.get(OBJECT_PREFIX + 'latest.json')
    if (!metaObj) {
      return json({ error: 'Aucune illustration téléversée (latest.json absent).' }, 409)
    }
    type ArtMeta = { storyline_id?: string | null; event_id?: string | null } | null
    const meta = (await metaObj.json().catch(() => null)) as ArtMeta
    const marker = await env.ART_BUCKET.get(PUBLISHED_MARKER)
    const published = marker ? ((await marker.json().catch(() => null)) as { hero_key?: string } | null) : null

    const key = heroKey(meta)
    const decision = publishDecision(key, published?.hero_key ?? null, env.SYNC_TRIGGER_DEPLOYS)
    if (!decision.publish) {
      return json({ published: false, reason: decision.reason })
    }

    try {
      await triggerDeployHooks(env)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await notifySlack(env, `vitrine-art : image stockée mais hook en échec : ${message}`)
      return json({ published: false, error: `Deploy hook en échec : ${message}` }, 502)
    }
    await env.ART_BUCKET.put(
      PUBLISHED_MARKER,
      JSON.stringify({ hero_key: key, published_at: new Date().toISOString() }),
      { httpMetadata: { contentType: 'application/json' } },
    )
    return json({ published: true, hero_key: key, reason: decision.reason })
  }

  // GET /v1/art/partis/index.json — ce que la discothèque contient.
  //
  // L'index est CALCULÉ en listant le bucket, jamais tenu à la main : un
  // manifeste écrit par le raffineur finirait par décrire une archive qui
  // n'existe plus (image perdue, jour purgé), et le build téléchargerait des
  // 404. Le listage est borné par `startAfter` — voir `borneIndex`.
  if (file === 'partis/index.json') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Méthodes admises : GET, HEAD.' }, 405)
    }
    const auth = await authenticate(sql, request, null)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const url = new URL(request.url)
    const demande = Number(url.searchParams.get('jours'))
    // `jours=0` = TOUT LE FONDS, sans borne. Le listage parcourt alors l'archive
    // entière (une page R2 par millier d'objets, soit deux appels par année
    // conservée) : réservé à l'inventaire, appelé une fois par build, jamais au
    // rythme du bac.
    const tout = demande === 0
    const horizon = Number.isFinite(demande) && demande > 0 && demande <= 3650
      ? Math.floor(demande)
      : POCHETTES_HORIZON_JOURS
    const depuis = tout ? null : borneIndex(new Date(), horizon)

    const jours: Record<string, string[]> = {}
    let cursor: string | undefined
    do {
      const page = await env.ART_BUCKET.list({
        prefix: OBJECT_PREFIX + 'partis/',
        ...(depuis ? { startAfter: OBJECT_PREFIX + 'partis/' + depuis } : {}),
        cursor,
      })
      for (const obj of page.objects) {
        const ref = parsePochette(obj.key.slice(OBJECT_PREFIX.length))
        // On indexe sur le JSON de métadonnées : c'est lui qui atteste qu'une
        // pochette est complète, les formats d'image étant best-effort.
        if (!ref || ref.ext !== 'json') continue
        ;(jours[ref.jour] ??= []).push(ref.parti)
      }
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)

    return json({
      horizon_jours: tout ? null : horizon,
      depuis,
      jours: Object.fromEntries(
        Object.entries(jours)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([jour, partis]) => [jour, partis.sort()]),
      ),
    })
  }

  // GET /v1/art/references/index.json — les images de référence disponibles,
  // listées depuis le bucket. Le build en tire vingt (dix du sujet, dix au
  // hasard) pour guider la génération, comme le raffineur avec son dossier
  // local. Sous clé comme le reste : l'artiste maison n'a pas signé pour un
  // dépôt public.
  if (file === REFERENCES_INDEX) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Méthodes admises : GET, HEAD.' }, 405)
    }
    const auth = await authenticate(sql, request, null)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const references: string[] = []
    let cursor: string | undefined
    do {
      const page = await env.ART_BUCKET.list({ prefix: OBJECT_PREFIX + 'references/', cursor })
      for (const obj of page.objects) {
        const ref = parseReference(obj.key.slice(OBJECT_PREFIX.length))
        if (ref) references.push(ref.name)
      }
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
    return json({ references: references.sort() })
  }

  // Les pochettes des partis : chemin validé par expression régulière fermée,
  // même politique de cache et de portée que les fichiers de la Une. Le registre
  // du fonds (`partis/fonds.json`) n'est pas une pochette : il échappe donc au
  // gel des journées closes, et c'est voulu — il est réécrit à chaque cycle.
  // L'image par histoire (`une/<clé>.*`) et les références (`references/*.jpg`)
  // passent par les mêmes GET/PUT sous clé, et par les mêmes refus.
  const pochette = parsePochette(file)
  const contentType =
    pochette?.contentType ??
    parseUne(file)?.contentType ??
    parseReference(file)?.contentType ??
    (file === POCHETTES_REGISTRE ? 'application/json; charset=utf-8' : undefined) ??
    ART_FILES[file]
  if (!contentType) {
    return json({ error: `Fichier inconnu : ${file || '(vide)'}.`, files: Object.keys(ART_FILES) }, 404)
  }

  // PUT /v1/art/latest.* — téléversement par le raffineur, corps STREAMÉ vers
  // R2. Portée `sync` : comme la synchro, c'est une écriture, pas une lecture.
  if (request.method === 'PUT') {
    const auth = await authenticate(sql, request, 'sync')
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const declared = Number(request.headers.get('content-length') ?? '0')
    if (!declared || declared > MAX_UPLOAD_BYTES) {
      return json(
        { error: `Content-Length requis, entre 1 et ${MAX_UPLOAD_BYTES} octets.` },
        declared ? 413 : 411,
      )
    }

    // UNE JOURNÉE CLOSE NE SE RÉÉCRIT PLUS.
    //
    // La discothèque conserve la version de FIN DE JOURNÉE de chaque pochette.
    // Comme le chemin ne porte pas le bloc, les six passages d'une journée
    // écrivent la même clé et seul le dernier survit — c'est voulu, et c'est ce
    // qui borne le stockage à ~3,4 Go par an (mesuré : 1,92 Mo par pochette,
    // tous formats, sur cinq images réelles du 2026-08-30). Mais rien n'empêchait un cycle en
    // retard (pipeline qui traîne, rejeu manuel, `force`) de rouvrir une
    // journée déjà rangée et d'en remplacer l'image des semaines plus tard.
    // L'archive doit être un fonds, pas un tableau blanc.
    //
    // « Close » veut dire DÉPASSÉE PAR UNE JOURNÉE PLUS RÉCENTE, et non « avant
    // aujourd'hui » : à 00h45 heure de Montréal, le dernier bloc publié est
    // encore celui de 20h de la veille, et une règle fondée sur l'horloge
    // refuserait le cycle toutes les nuits. Cf. `borneJoursPosterieurs`.
    // ⚠️ LE LISTAGE N'EST PAS FILTRÉ PAR LA BORNE SEULE. Le préfixe `partis/`
    // porte aussi le registre du fonds (`partis/fonds.json`), qui trie APRÈS
    // toute clé datée. Un `limit: 1` rapportait donc le registre et faisait
    // refuser toutes les pochettes, indéfiniment (aws-refiners#480). On passe
    // les clés par `premierePochettePosterieure`, qui n'en retient que de
    // vraies pochettes d'une journée strictement postérieure.
    if (pochette) {
      let cursor: string | undefined
      let plusRecent: string | null = null
      do {
        const page = await env.ART_BUCKET.list({
          prefix: OBJECT_PREFIX + 'partis/',
          startAfter: OBJECT_PREFIX + borneJoursPosterieurs(pochette.jour),
          cursor,
        })
        plusRecent = premierePochettePosterieure(
          page.objects.map((o) => o.key.slice(OBJECT_PREFIX.length)),
          pochette.jour,
        )
        cursor = !plusRecent && page.truncated ? page.cursor : undefined
      } while (cursor)
      if (plusRecent) {
        return json(
          {
            error: `Journée close : ${pochette.jour} est dépassée par une journée plus récente, sa pochette ne se réécrit plus.`,
            plus_recent: plusRecent,
          },
          409,
        )
      }
    }

    await env.ART_BUCKET.put(OBJECT_PREFIX + file, request.body, {
      httpMetadata: { contentType },
    })
    return json({ stored: file, bytes: declared })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Méthodes admises : GET, HEAD, PUT.' }, 405)
  }

  // GET /v1/art/latest.* — DÉSORMAIS SOUS CLÉ (2026-08-26).
  //
  // La lecture était publique parce que « l'image n'est pas une donnée
  // vendue » et que le build devait pouvoir la rapatrier sans clé. L'API est
  // maintenant privée : seuls le build et les raffineurs l'appellent, et tous
  // deux ont déjà une clé. Le visiteur, lui, ne voit jamais cette route — il
  // lit l'image inlinée dans l'export statique (cf. scripts/fetch_art.mjs).
  const auth = await authenticate(sql, request, null)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  const obj = await env.ART_BUCKET.get(OBJECT_PREFIX + file)
  if (!obj) {
    return json({ error: `${file} n'existe pas encore.` }, 404)
  }
  const headers = new Headers({
    'content-type': contentType,
    // `private` : la réponse dépend de la clé, elle ne doit être partagée par
    // aucun cache intermédiaire.
    'cache-control': 'private, no-store',
    'access-control-allow-origin': '*',
    etag: obj.httpEtag,
  })

  // PLUS DE `caches.default.put` ICI, ET C'EST LE POINT IMPORTANT. Le
  // `cache.match` en tête de fetch() s'exécute AVANT tout contrôle de clé :
  // une réponse sous clé déposée dans le cache partagé serait resservie à
  // n'importe quel appelant anonyme, ce qui annulerait l'authentification
  // qu'on vient d'ajouter. On relit R2 à chaque appel — quelques centaines de
  // fois par jour, pour des builds, ce qui ne coûte rien.
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers })
}
