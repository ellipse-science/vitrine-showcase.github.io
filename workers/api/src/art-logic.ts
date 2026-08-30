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
