// Publication de la sélection de la Une DANS L'INSTANTANÉ, avant le build.
//
// POURQUOI. `vitrine-art` illustre la Une ; pour savoir laquelle, il lit
// `data/hero-selection.json` sur le SITE DÉPLOYÉ — donc derrière la file de
// build de Cloudflare Pages, qui ne construit qu'un projet à la fois pour tout
// le compte et SAUTE un build en file quand un plus récent arrive. Mesuré du
// 29 août au 3 septembre 2026 : de 1 h 20 à 5 h par jour d'édition sans
// illustration (aws-refiners#490, vitrine-showcase#723).
//
// Le Worker, lui, connaît la Une à :02 — avant le build. En la publiant ici,
// on rend possible que l'image soit produite AVANT la construction du site,
// donc qu'elle parte dans la MÊME édition que les données.
//
// ⚠️ LA MÊME FONCTION QUE LE SITE, JAMAIS UNE COPIE. `heroSelectionPayload`
// vient de `lib/data/heroSelectionCore.ts`, et la route
// `app/data/hero-selection.json/route.ts` appelle exactement celle-là. Les deux
// verdicts sont donc identiques par construction. Réimplémenter la sélection
// ici recréerait la divergence sélecteur/rendu de vitrine-showcase#259 — la
// panne même que le couplage actuel au site déployé servait à éviter.
//
// IMPORT RELATIF, pas l'alias `@/` : le tsconfig du Worker ne déclare aucun
// `paths`. Même parade que `flappy.ts`, qui importe déjà `../../../lib/flappy`.

import {
  heroSelectionPayload,
  type HeroSelectionPayload,
  type RawEvent,
} from '../../../lib/data/heroSelectionCore'
import { tableKey } from './snapshot-logic'
import { avecDelai, DELAI_MS } from './hero-selection-logic'

/** Table source de la sélection, dans l'instantané du cycle. */
export const SOURCE_TABLE = 'headline_events_4h'

/** Nom de l'objet publié.
 *
 *  ⚠️ SOULIGNÉ, PAS TRAIT D'UNION. `resolveSnapshotKey` n'accepte que
 *  `/^[a-z0-9_]+\.json$/` : `hero-selection.json` serait rejeté par la route
 *  `/v1/snapshot/<cycle>/<table>.json`, et l'objet publié deviendrait
 *  illisible — une panne silencieuse, puisque l'écriture, elle, réussirait. */
export const HERO_OBJECT = 'hero_selection'

/** Copie à adresse FIXE de la sélection, pour vitrine-art
 *  (GET /v1/art/selection.json) : il la lit PENDANT la passe, avant que le
 *  manifeste du cycle ne soit publié. */
export const SELECTION_ART_KEY = 'art/selection.json'

/** Lit les événements de l'instantané du cycle.
 *
 *  ON RELIT CE QUI VIENT D'ÊTRE ÉCRIT plutôt que de garder les lignes en
 *  mémoire : les tranches de synchro sont des invocations SÉPARÉES, et
 *  l'orchestrateur ne voit passer que leurs métadonnées. Relire garantit en
 *  prime que la sélection porte exactement sur ce qui a été publié.
 *
 *  ⚠️ La table est fenêtrée à HEADLINE_KEEP_DAYS (14 jours) par la synchro.
 *  Sans conséquence ici : `storiesFrom24h` ne regarde que les six blocs les
 *  plus récents. */
export async function lireEvenements(
  bucket: R2Bucket,
  cycle: string,
): Promise<RawEvent[] | null> {
  const obj = await bucket.get(tableKey(cycle, SOURCE_TABLE))
  if (!obj) return null
  const rows = JSON.parse(await obj.text()) as unknown
  return Array.isArray(rows) ? (rows as RawEvent[]) : null
}

/** Calcule la sélection du cycle et la dépose dans l'instantané.
 *
 *  Rend la sélection publiée, ou `null` si l'instantané ne portait pas la
 *  table source — un cycle sans événements n'a pas de Une, et ce n'est pas
 *  une erreur. */
export async function publierSelectionUne(
  bucket: R2Bucket,
  cycle: string,
  delaiMs: number = DELAI_MS,
): Promise<{ published: boolean; selection: HeroSelectionPayload }> {
  return avecDelai(publier(bucket, cycle), delaiMs, 'sélection de la Une')
}

async function publier(
  bucket: R2Bucket,
  cycle: string,
): Promise<{ published: boolean; selection: HeroSelectionPayload }> {
  const events = await lireEvenements(bucket, cycle)
  if (events === null) return { published: false, selection: null }

  const selection = heroSelectionPayload(events)
  await bucket.put(tableKey(cycle, HERO_OBJECT), JSON.stringify(selection) + '\n', {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
  await bucket.put(
    SELECTION_ART_KEY,
    JSON.stringify({ cycle, generated_at: new Date().toISOString(), selection }) + '\n',
    { httpMetadata: { contentType: 'application/json; charset=utf-8' } },
  )
  return { published: true, selection }
}
