// Logique PURE du circuit vitrine-art — aucun type Workers ici, exprès : ce
// module est importé par les tests (tests/art.test.ts) qui compilent sous le
// tsconfig racine, lequel ne connaît pas R2Bucket ni ExecutionContext. Même
// parade que schedule.ts pour les tests du cron. Les E/S vivent dans art.ts.

/** Fichiers admis, et leur type MIME. Liste blanche fermée : le bucket ne
 *  sert et ne reçoit rien d'autre, même en devinant un nom d'objet. */
export const ART_FILES: Record<string, string> = {
  'latest.png': 'image/png',
  'latest.webp': 'image/webp',
  'latest.avif': 'image/avif',
  'latest.json': 'application/json; charset=utf-8',
}

/** Même politique que l'ancien public/_headers pour generated-art : l'image
 *  est écrasée en place à URL stable, on la cache court avec tolérance. */
export const ART_CACHE_CONTROL = 'public, max-age=900, stale-while-revalidate=3600'

/** Un PNG 1024×1024 de gpt-image-1 pèse ~1,5 Mo ; 8 Mo laissent de la marge
 *  sans transformer la route en dépôt de fichiers arbitraires. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export interface PublishDecision {
  publish: boolean
  reason: string
}

/** Clé d'appariement d'une illustration à sa Une : la STORYLINE d'abord.
 *
 *  `event_id` change à chaque bloc de 4 h même quand la Une reste la même
 *  histoire ; `storyline_id` la suit à travers les blocs (Jaccard 0.30,
 *  lookback 24 h). Comparer les event_id déclencherait un build — et une
 *  image OpenAI facturée — à chaque cycle sans que rien n'ait changé. */
export function heroKey(meta: { storyline_id?: string | null; event_id?: string | null } | null): string | null {
  if (!meta) return null
  return meta.storyline_id ?? meta.event_id ?? null
}

/** Faut-il déclencher les builds ? Décision pure, testée à part.
 *
 *  `trigger` est SYNC_TRIGGER_DEPLOYS : le même interrupteur maître que la
 *  synchro des données. En phase d'ombre, l'image est stockée mais aucun
 *  build ne part — comportement voulu, identique à sync-athena. */
export function publishDecision(
  currentKey: string | null,
  publishedKey: string | null,
  trigger: string | undefined,
): PublishDecision {
  if (!currentKey) {
    return { publish: false, reason: 'latest.json sans identifiant de Une : rien à publier.' }
  }
  if (currentKey === publishedKey) {
    return { publish: false, reason: `Une inchangée (${currentKey}) : builds inutiles.` }
  }
  if (trigger !== 'true') {
    return { publish: false, reason: 'SYNC_TRIGGER_DEPLOYS ≠ true : phase d’ombre, builds retenus.' }
  }
  return { publish: true, reason: `Nouvelle Une illustrée (${currentKey}).` }
}

/* ───────────────────────────────────────────────────────────────────────────
   LES POCHETTES DES PARTIS (bac du jour + discothèque)

   Même circuit que l'illustration de la Une, mais une image par PARTI et par
   BLOC de 4 h, rangée sous son jour : `partis/<jour>/<parti>.<ext>`. Le bac du
   jour affiche le jour courant ; la discothèque, les jours précédents, figés
   dans leur version de 20h.

   POURQUOI UNE EXPRESSION RÉGULIÈRE ET PAS UNE LISTE. `ART_FILES` peut rester
   une liste fermée parce que la Une n'a que quatre fichiers. Ici le chemin
   porte une date et une clé de parti : la liste serait infinie. La parade est
   la même en esprit — rien qui ne corresponde pas EXACTEMENT à la forme
   attendue n'entre dans le bucket, et surtout aucun `..` ni segment libre.
   ─────────────────────────────────────────────────────────────────────────── */

/** Les cinq partis provinciaux, en minuscules : mêmes clés que PARTY_KEYS
 *  côté site (lib/data/parties.ts). Une clé inconnue est refusée — c'est ce
 *  qui empêche le bucket de servir de dépôt de fichiers arbitraires. */
export const PARTY_SLUGS = ['plq', 'caq', 'qs', 'pq', 'pcq'] as const

/** `partis/2026-08-30/caq.webp` — et rien d'autre. Date ISO stricte, clé de
 *  parti dans la liste, extension parmi les quatre formats publiés. */
const POCHETTE_RE = new RegExp(
  `^partis/(\\d{4}-\\d{2}-\\d{2})/(${PARTY_SLUGS.join('|')})\\.(png|webp|avif|json)$`,
)

const POCHETTE_TYPES: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  json: 'application/json; charset=utf-8',
}

export interface PochetteRef {
  jour: string
  parti: string
  ext: string
  contentType: string
}

/** Décompose un chemin de pochette, ou `null` s'il ne correspond pas à la
 *  forme attendue. C'est LE point de contrôle : tout ce qui passe ici est
 *  validé, tout le reste est refusé en 404. */
export function parsePochette(file: string): PochetteRef | null {
  const m = POCHETTE_RE.exec(file)
  if (!m) return null
  const [, jour, parti, ext] = m
  // Une date syntaxiquement valide peut être absurde (2026-13-45). On la
  // repasse par Date : le bucket ne se remplira pas de jours qui n'existent
  // pas, et l'index resterait triable.
  const d = new Date(`${jour}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== jour) return null
  return { jour, parti, ext, contentType: POCHETTE_TYPES[ext] }
}

/** Le jour à partir duquel l'index liste, pour un horizon en jours.
 *
 *  Sert de `startAfter` au listage R2. Les clés sont triées
 *  lexicographiquement, et `partis/YYYY-MM-DD/…` trie donc CHRONOLOGIQUEMENT :
 *  se placer après la borne évite de parcourir toute l'archive à chaque appel.
 *  Sans cette borne, le listage coûterait de plus en plus cher à mesure que la
 *  discothèque grossit — exactement ce qu'on veut éviter. */
export function borneIndex(aujourdhui: Date, horizonJours: number): string {
  const d = new Date(aujourdhui.getTime() - horizonJours * 86400000)
  return d.toISOString().slice(0, 10)
}

/** Horizon servi par défaut : le bac de la discothèque montre un mois glissant
 *  (arbitrage du 2026-08-30). Les pochettes plus anciennes restent dans R2 —
 *  elles ne sont simplement plus rapatriées par le build. */
export const POCHETTES_HORIZON_JOURS = 30

/** LE REGISTRE DU FONDS : les chiffres de toutes les pochettes jamais rangées,
 *  en un seul objet.
 *
 *  POURQUOI IL EXISTE. La page du fonds veut montrer, pour chaque journée
 *  archivée, ce que la pochette disait — temps en Une, enjeu, ton. Ces chiffres
 *  vivent dans le fichier de métadonnées de chaque pochette, soit cinq fichiers
 *  par jour : les rapatrier tous ferait 1825 requêtes par build au bout d'un an,
 *  9125 au bout de cinq. Le registre les rassemble et se lit en UNE requête,
 *  pour ~160 Ko par année conservée.
 *
 *  CE N'EST PAS LA SOURCE DE VÉRITÉ. C'est un index DÉRIVÉ, écrit par le
 *  raffineur ; ce qui existe vraiment est ce que le listage R2 rapporte
 *  (`partis/index.json`). Un cycle interrompu peut laisser le registre en
 *  retard d'une journée. La page réconcilie les deux et montre les journées que
 *  le listage connaît mais que le registre ignore — sans leurs chiffres, plutôt
 *  que de les cacher. */
export const POCHETTES_REGISTRE = 'partis/fonds.json'

/** La borne de listage qui saute par-dessus TOUTES les clés d'un jour donné,
 *  pour ne voir que les jours strictement postérieurs.
 *
 *  L'astuce tient à l'ordre des octets : les clés d'un jour sont
 *  `partis/2026-08-30/…`, et « / » vaut 0x2F quand « 0 » vaut 0x30. Passer
 *  `partis/2026-08-300` en `startAfter` place donc le curseur APRÈS la dernière
 *  clé du 30 août et AVANT la première du 31 (« 2026-08-300 » < « 2026-08-31/ »).
 *  Un seul objet suffit à répondre : il existe un jour plus récent, ou non.
 *
 *  POURQUOI PAS UNE COMPARAISON À LA DATE DU JOUR. Parce qu'à 00h45 heure de
 *  Montréal, le dernier bloc publié est encore celui de 20h de la VEILLE : le
 *  raffineur écrirait légitimement dans un jour « passé », et une règle fondée
 *  sur l'horloge le refuserait toutes les nuits. « Close » ne veut pas dire
 *  « hier », ça veut dire « dépassée par une journée plus récente ». */
export function borneJoursPosterieurs(jour: string): string {
  return `partis/${jour}0`
}

/** Parmi les clés que le listage rapporte APRÈS la borne, la première qui est
 *  vraiment la pochette d'une journée postérieure — ou `null`.
 *
 *  POURQUOI CE FILTRE EXISTE. `borneJoursPosterieurs` place le curseur au bon
 *  endroit, mais le préfixe `partis/` ne contient pas QUE des pochettes : le
 *  registre du fonds y vit aussi, sous `partis/fonds.json`. Or « f » vaut 0x66
 *  quand les chiffres valent 0x30 à 0x39 : `partis/fonds.json` trie donc APRÈS
 *  n'importe quelle clé datée, quelle que soit la date.
 *
 *  Conséquence, mesurée le 2026-09-06 : dès le premier album qui écrivait le
 *  registre, le listage `limit: 1` rapportait `partis/fonds.json`, la garde y
 *  lisait « une journée plus récente existe » et refusait TOUT téléversement de
 *  pochette — pour toujours, quel que soit le jour. Le fonds s'est arrêté au
 *  2026-09-02 et chaque cycle a engendré puis jeté une image pendant quatre
 *  jours (aws-refiners#480).
 *
 *  On ne se fie donc plus à la position lexicographique seule : ce qui compte
 *  comme « journée plus récente » doit d'abord ÊTRE une pochette, ce que seul
 *  `parsePochette` peut dire. */
export function premierePochettePosterieure(cles: string[], jour: string): string | null {
  for (const cle of cles) {
    const ref = parsePochette(cle)
    if (ref && ref.jour > jour) return cle
  }
  return null
}

/* ───────────────────────────────────────────────────────────────────────────
   L'ILLUSTRATION PAR HISTOIRE — `une/<clé>.<ext>` — ET LES RÉFÉRENCES.

   Depuis le 2026-09-04, c'est le BUILD qui illustre la Une
   (scripts/ensure_art.ts) : il connaît la Une avant de rendre la page, demande
   l'image de cette histoire, la génère s'il le faut, et part en ligne AVEC
   elle. Un seul build par édition, plus de second passage, plus de course avec
   la file de Cloudflare Pages (vitrine-showcase#723).

   Pour que dev, prod et les aperçus ne paient jamais deux fois la même
   histoire, l'image est rangée sous sa CLÉ D'HISTOIRE (`storyline_id`, ou
   `event_id` à défaut — la même règle que `heroKey`) : `une/<clé>.<ext>`.
   `latest.*` reste écrit en parallèle pour tout ce qui le lit encore : le
   raffineur vitrine-art (qui trouve alors l'image « déjà à jour ») et la carte
   de partage (lib/shareUneArt.ts).

   Les images de référence de l'artiste maison (`references/<nom>.jpg`, 57
   JPEG de 512 px) vivent dans le bucket, pas dans le dépôt public du site.
   Même principe que pour les pochettes : une expression régulière FERMÉE, et
   rien d'autre n'entre ni ne sort.
   ─────────────────────────────────────────────────────────────────────────── */

/** Une clé d'histoire telle que le pipeline les produit : `story-…-01a5194c`
 *  (storyline) ou `20260903T150000Z-evt-…-3eb9c369` (event_id). Minuscules,
 *  chiffres et tirets simples : ni point, ni barre oblique, donc aucune
 *  remontée de chemin possible. */
const UNE_KEY = String.raw`(?:story|\d{8}T\d{6}Z-evt)-[a-z0-9]+(?:-[a-z0-9]+)*`
const UNE_RE = new RegExp(`^une/(${UNE_KEY})\\.(png|webp|avif|json)$`)

/** Une clé ne dépasse jamais cela ; au-delà, ce n'est pas une clé du
 *  pipeline mais une tentative de remplir le bucket de noms arbitraires. */
export const UNE_KEY_MAX_LENGTH = 160

export interface UneRef {
  key: string
  ext: string
  contentType: string
}

/** Décompose `une/<clé>.<ext>`, ou `null`. Même rôle que `parsePochette` :
 *  ce qui passe ici est validé, tout le reste est refusé en 404. */
export function parseUne(file: string): UneRef | null {
  const m = UNE_RE.exec(file)
  if (!m) return null
  const [, key, ext] = m
  if (key.length > UNE_KEY_MAX_LENGTH) return null
  return { key, ext, contentType: POCHETTE_TYPES[ext] }
}

/** `references/index.json` : la liste des références disponibles, calculée en
 *  listant le bucket (jamais tenue à la main, comme `partis/index.json`). */
export const REFERENCES_INDEX = 'references/index.json'

/** `references/economy_and_labour_generic3.jpg` — et rien d'autre : le nom
 *  commence par l'enjeu (snake_case), se termine par `_generic<n>`. */
const REFERENCE_RE = /^references\/([a-z]+(?:_[a-z]+)*_generic\d{1,2})\.jpg$/

export interface ReferenceRef {
  name: string
  contentType: string
}

export function parseReference(file: string): ReferenceRef | null {
  const m = REFERENCE_RE.exec(file)
  return m ? { name: m[1], contentType: 'image/jpeg' } : null
}
