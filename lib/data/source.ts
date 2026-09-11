// D'où les loaders tirent leurs lignes : fichiers publiés, ou API.
//
// AU BUILD, JAMAIS À L'EXÉCUTION. Le site reste un export statique dont les
// données sont inlinées dans le HTML prérendu — c'est ce qui lui permet
// d'encaisser un afflux de visiteurs sans effet sur AWS. Lire l'API ICI ne
// change pas cette propriété : le navigateur du visiteur ne l'appelle jamais.
//
// POURQUOI CETTE COUCHE EXISTE
//
// Aujourd'hui `fetch_data.R` interroge Athena depuis GitHub Actions et commite
// ~10 Mo de JSON par cycle dans le dépôt. Une fois que le build sait lire
// l'API, ce script n'a plus de raison d'être : le raffineur alimente Postgres
// depuis l'intérieur d'AWS, et le dépôt cesse de grossir de 10 Mo par jour.
//
// La bascule est volontairement PROGRESSIVE et RÉVERSIBLE : la source par
// défaut reste les fichiers. `VITRINE_DATA_SOURCE=api` bascule sur l'API, et
// en cas d'échec on retombe sur le fichier plutôt que de casser le build. Tant
// que les deux chemins coexistent, on peut comparer leurs sorties.

import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.VITRINE_API_BASE ?? "https://api.vitrinedemocratique.com";

/** Trois sources possibles, choisies par `VITRINE_DATA_SOURCE` :
 *
 *  - absent / autre  → les FICHIERS publiés du dépôt (défaut historique) ;
 *  - `api`           → /v1/datasets, donc Postgres à chaque appel ;
 *  - `snapshot`      → /v1/snapshot, donc R2, sans jamais toucher Postgres.
 *
 *  POURQUOI `snapshot` EXISTE (incident du 2026-08-26). Le mode `api` faisait
 *  descendre CHAQUE build jusqu'à Postgres : la route ne peut pas être mise en
 *  cache partagé (sa réponse dépend de la clé) et on ajoutait `no-cache`
 *  par-dessus pour avoir le cycle courant. À ~85 builds par jour — dont deux
 *  tiers de simples aperçus de branche — cela a épuisé les 5 Go mensuels de
 *  transfert de Neon en huit jours, et la base a cessé de répondre.
 *
 *  Le mode `snapshot` lit les MÊMES lignes, déposées dans R2 par la synchro au
 *  moment où elle les écrit dans Postgres (workers/api/src/snapshot.ts). Elles
 *  sont converties là-bas pour être indiscernables de ce que renvoyait
 *  /v1/datasets — mêmes nombres, mêmes nulls, mêmes chaînes.
 *
 *  Les deux modes cohabitent VOLONTAIREMENT : `api` reste le chemin de repli
 *  et permet de comparer les deux sorties avant de basculer pour de bon. */
const DATA_SOURCE = process.env.VITRINE_DATA_SOURCE ?? "";
const USE_API = DATA_SOURCE === "api";
const USE_SNAPSHOT = DATA_SOURCE === "snapshot";

/** Clé d'API du build. Les jeux de données sont payants : même le site doit
 *  s'authentifier. Sa clé porte la portée totale et aucun quota — ce n'est pas
 *  un client, c'est le site lui-même. */
const API_KEY = process.env.VITRINE_API_KEY ?? "";

/** Jeton de lecture de l'instantané. Comparé à un secret du WORKER, jamais à
 *  la table des clés dans Postgres — c'est ce qui rend ce chemin insensible à
 *  une base indisponible. Par défaut la même valeur que la clé d'API, pour
 *  qu'une bascule ne demande pas une variable de plus côté Pages. */
const SNAPSHOT_TOKEN = process.env.VITRINE_SNAPSHOT_TOKEN ?? API_KEY;

/** L'API plafonne une réponse à 5 000 lignes ; la plus grosse table en compte
 *  plus de 9 000. On pagine donc — sans quoi on perdrait des lignes en silence,
 *  ce qui est bien pire qu'une erreur. */
const PAGE_SIZE = 5000;

/** Au-delà de ce délai, les données de l'API sont jugées périmées et le build
 *  repart des fichiers.
 *
 *  POURQUOI CE GARDE-FOU EXISTE. Le 2026-08-18, la prod a servi des données de
 *  plusieurs heures plus anciennes que celles qui venaient d'être publiées : le
 *  déploiement se déclenche à la poussée sur `prod`, mais la synchro Postgres
 *  tournait sur son propre horaire. Le garde-fou reste la seconde ligne, pour
 *  que la même panne ne puisse pas repasser inaperçue.
 *
 *  POURQUOI 45 MIN ÉTAIT FAUX (corrigé le 2026-08-27). Le seuil supposait que
 *  « les fichiers sont frais par construction : ils viennent d'être commités
 *  par le job qui déclenche le build ». C'était vrai quand refresh-data
 *  publiait les JSON six fois par jour PUIS déclenchait le build. Depuis la
 *  bascule du 2026-08-19, refresh-data n'est plus qu'un FILET HEBDOMADAIRE
 *  (lundi 12:00 UTC) : les builds sont déclenchés par la synchro du Worker ou
 *  par un déploiement de code, et les fichiers commités sont alors la source
 *  la PLUS VIEILLE, pas la plus fraîche.
 *
 *  Conséquence mesurée le 2026-08-27 à 18h58 UTC : l'instantané (167 min,
 *  rejeté) portait le bloc `2026-08-27 11-15` ; les fichiers, retenus,
 *  s'arrêtaient au bloc `07-11`. Le garde-fou jetait la source récente pour
 *  une plus ancienne, et TOUT déploiement tombant entre deux synchros faisait
 *  RECULER l'édition affichée — y compris les promotions de code (#601, #603).
 *
 *  LE SEUIL DOIT DONC MESURER « LA CHAÎNE EST MORTE », PAS « ON EST ENTRE
 *  DEUX SYNCHROS ». La synchro tourne six fois par jour (~4 h d'écart au
 *  pire) : un instantané sain dépasse structurellement 45 min. Six heures
 *  laissent une marge d'une synchro entière ratée avant de retomber sur les
 *  fichiers — qui restent le dernier recours, mais ne gagnent plus par
 *  défaut. */
const MAX_STALENESS_MS = 6 * 60 * 60 * 1000;

let freshnessChecked: boolean | null = null;

/** Clé du cycle de l'API (synchro la plus ancienne, ISO) : nomme le dossier
 *  de la copie locale, pour qu'un build ne relise jamais le cycle précédent. */
let apiCycleKey = "";

/** L'API est-elle assez fraîche pour qu'on s'y fie ? Vérifié une fois par build. */
async function apiIsFresh(): Promise<boolean> {
  if (freshnessChecked !== null) return freshnessChecked;
  try {
    // `/v1/health` exige une clé depuis la fermeture de l'API (2026-08-26).
    const res = await fetch(`${API_BASE}/v1/health`, {
      headers: {
        "cache-control": "no-cache",
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`santé ${res.status}`);
    const body = (await res.json()) as { sync_state?: { synced_at: string }[] };
    const stamps = (body.sync_state ?? []).map((r) => Date.parse(r.synced_at));
    if (stamps.length === 0) throw new Error("aucun état de synchro");

    // La table la plus EN RETARD décide : une seule table figée suffit à
    // publier un module périmé.
    const oldest = Math.min(...stamps);
    const ageMin = Math.round((Date.now() - oldest) / 60000);
    apiCycleKey = new Date(oldest).toISOString();
    freshnessChecked = Date.now() - oldest <= MAX_STALENESS_MS;
    if (!freshnessChecked) {
      console.warn(
        `[source] API périmée (synchro la plus ancienne il y a ${ageMin} min). Repli sur les fichiers.`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[source] fraîcheur de l'API invérifiable (${message}). Repli sur les fichiers.`);
    freshnessChecked = false;
  }
  return freshnessChecked;
}

interface SnapshotManifest {
  cycle: string;
  generated_at: string;
  tables: Record<string, { rows: number; bytes: number; key: string }>;
}

let manifestPromise: Promise<SnapshotManifest | null> | null = null;

/** Le manifeste de l'instantané, lu UNE fois par build.
 *
 *  Il remplace l'appel à /v1/health du mode `api` — lequel interrogeait
 *  `vitrine.sync_state`, donc Postgres. Le garder aurait laissé le build
 *  tributaire de la santé de la base pour savoir s'il peut éviter la base :
 *  exactement le nœud qu'on défait ici. */
async function loadManifest(): Promise<SnapshotManifest | null> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    if (!SNAPSHOT_TOKEN) {
      console.warn("[source] jeton d'instantané absent. Repli sur les fichiers.");
      return null;
    }
    try {
      const res = await fetch(`${API_BASE}/v1/snapshot/manifest.json`, {
        headers: { authorization: `Bearer ${SNAPSHOT_TOKEN}` },
      });
      if (!res.ok) throw new Error(`manifeste ${res.status}`);
      const manifest = (await res.json()) as SnapshotManifest;

      // MÊME GARDE-FOU DE FRAÎCHEUR que le mode `api`, pour la même raison :
      // un instantané figé ressemble à un instantané vivant. Le cycle est
      // écrit en entier ou pas du tout, il suffit donc de dater le manifeste.
      const age = Date.now() - Date.parse(manifest.generated_at);
      if (!Number.isFinite(age) || age > MAX_STALENESS_MS) {
        console.warn(
          `[source] instantané périmé (cycle ${manifest.cycle}, ${Math.round(age / 60000)} min). Repli sur les fichiers.`,
        );
        return null;
      }
      console.log(
        // garde-redaction: ok (journal de build, pas une surface éditoriale)
        `[source] instantané ${manifest.cycle} : ${Object.keys(manifest.tables).length} tables`,
      );
      return manifest;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[source] instantané illisible (${message}). Repli sur les fichiers.`);
      return null;
    }
  })();
  return manifestPromise;
}

/** Les lignes d'une table, depuis R2. Pas de pagination : le cycle dépose la
 *  table entière en un objet, là où l'API plafonnait à 5 000 lignes. */
async function fetchSnapshotRows(
  dataset: string,
  manifest: SnapshotManifest,
): Promise<string> {
  const entry = manifest.tables[dataset];
  if (!entry) throw new Error(`absente du manifeste`);
  const url = `${API_BASE}/v1/snapshot/${manifest.cycle}/${dataset}.json`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${SNAPSHOT_TOKEN}` } });
  if (!res.ok) throw new Error(`${res.status} sur ${url}`);
  const text = await res.text();
  // Le manifeste connaît le compte de lignes : on le vérifie plutôt que de
  // faire confiance. Une table tronquée en route publierait un module amputé
  // sans que rien ne le signale.
  const parsed = JSON.parse(text) as unknown[];
  if (parsed.length !== entry.rows) {
    throw new Error(`${parsed.length} lignes reçues, ${entry.rows} annoncées`);
  }
  return text;
}

/** COPIE LOCALE PAR JEU DE DONNÉES, valable pour les deux modes distants.
 *
 *  POURQUOI ELLE EXISTE. `readDatasetText` est appelée par chaque loader, et
 *  les loaders sont appelés par chaque page prérendue : un même jeu était
 *  redemandé des dizaines de fois par build. Les journaux du 2026-08-25 en
 *  comptent 4 260 requêtes en un jour pour une seule table.
 *
 *  POURQUOI UN FICHIER ET NON UNE CHAÎNE EN MÉMOIRE (incident du 2026-09-10,
 *  vitrine#787). La version précédente gardait le texte téléchargé dans une
 *  promesse partagée par toutes les pages du worker. Mesuré à code égal,
 *  3 workers, cgroup 9 Go : le mode fichiers passe, le mode api est tué avant
 *  la moitié des pages — les workers de `next build` tiennent nettement plus
 *  de mémoire quand la source est une chaîne partagée que quand chaque page
 *  relit un fichier. Le mécanisme V8 exact n'est pas isolé ; l'effet est
 *  reproduit. On télécharge donc UNE fois par build et par table dans
 *  `.next/cache/vitrine-data/<cycle>/`, et chaque page relit ce fichier
 *  exactement comme elle relit `public/data/` : les modes distants n'ont
 *  plus d'autre différence que la provenance du fichier.
 *
 *  Le dossier est nommé par le cycle (synchro la plus ancienne en mode api,
 *  `cycle` du manifeste en mode instantané) : un build local qui suit une
 *  synchro ne relit jamais le cycle précédent. Les autres cycles sont
 *  effacés à la première lecture. L'écriture est atomique (fichier temporaire
 *  puis `rename`) : deux workers qui téléchargent la même table en même temps
 *  écrivent le même contenu, et aucun lecteur ne voit un fichier partiel. */
const LOCAL_ROOT = path.resolve(process.cwd(), ".next", "cache", "vitrine-data");

/** Jeu de données → chemin de sa copie locale, ou `null` (repli sur le fichier
 *  publié). Une promesse par jeu et par instance de module : le téléchargement
 *  n'est tenté qu'une fois, même sous huit pages concurrentes. */
const localCopies = new Map<string, Promise<string | null>>();

let pruned: Promise<void> | null = null;

/** Efface les dossiers des cycles précédents, une fois par build. */
function pruneOtherCycles(currentDir: string): Promise<void> {
  pruned ??= (async () => {
    try {
      for (const entry of await fs.readdir(LOCAL_ROOT)) {
        const full = path.join(LOCAL_ROOT, entry);
        if (full !== currentDir) await fs.rm(full, { recursive: true, force: true });
      }
    } catch {
      // Dossier absent au premier build : rien à effacer.
    }
  })();
  return pruned;
}

async function localCopy(
  dataset: string,
  cycleKey: string,
  download: () => Promise<string>,
  mode: "API" | "instantané",
): Promise<string | null> {
  const existing = localCopies.get(dataset);
  if (existing) return existing;

  const pending = (async () => {
    const dir = path.join(LOCAL_ROOT, cycleKey.replace(/[^A-Za-z0-9_-]/g, "-"));
    const target = path.join(dir, `${dataset}.json`);
    await pruneOtherCycles(dir);
    try {
      await fs.access(target);
      return target;
    } catch {
      // Pas encore téléchargée par ce build.
    }
    try {
      const text = await download();
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${target}.${process.pid}.tmp`;
      await fs.writeFile(tmp, text, "utf8");
      await fs.rename(tmp, target);
      return target;
    } catch (err) {
      // On retombe sur le fichier plutôt que de casser le build. Un site qui se
      // construit avec des données d'il y a quatre heures vaut mieux qu'un site
      // qui ne se construit pas — et l'écart est visible dans /v1/health.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[source] ${mode} indisponible pour ${dataset} (${message}). Repli sur le fichier.`);
      return null;
    }
  })();
  localCopies.set(dataset, pending);
  return pending;
}

/** `api: false` : la table est publiée en fichier par fetch_data.R mais l'API
 *  ne la sert pas (absente de DATASETS, workers/api/src/index.ts). Le build
 *  la lit alors DIRECTEMENT dans le fichier, sans la demander à l'API.
 *
 *  POURQUOI CE DRAPEAU EXISTE (incident du 2026-09-10). `radar_annotated` est
 *  entrée dans tables.json le 08-09 (#759) sans être servie : chaque instance
 *  du build la demandait à l'API, recevait 404 et retombait sur le fichier.
 *  Ce repli est le chemin le plus coûteux en mémoire des modes distants : en
 *  mode `api`, le build de prod dépassait 12 Go et mourait avant la moitié
 *  des pages (GitHub : « runner has received a shutdown signal » ; Cloudflare :
 *  36 min puis « exceeded the time limit »), alors que le même build en
 *  mode fichiers tenait en 7,6 Go. Sans cette entrée dans la correspondance,
 *  le même build passe en 5 min. Mesures : issue vitrine#787. */
type TableSpec = { name: string; out: string; enabled: boolean; api?: boolean };

let datasetByPath: Map<string, string> | null = null;

/** Chemin de fichier publié → nom de jeu de données dans l'API.
 *
 *  Dérivé de `scripts/tables.json`, qui EST le contrat de schéma : la
 *  correspondance ne peut donc pas diverger de ce que l'API expose. */
async function loadMapping(): Promise<Map<string, string>> {
  if (datasetByPath) return datasetByPath;
  const raw = await fs.readFile(
    path.resolve(process.cwd(), "scripts", "tables.json"),
    "utf8",
  );
  const config = JSON.parse(raw) as { tables: TableSpec[] };
  datasetByPath = new Map(
    config.tables.filter((t) => t.enabled && t.api !== false).map((t) => [t.out, t.name]),
  );
  return datasetByPath;
}

async function fetchAllRows(dataset: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${API_BASE}/v1/datasets/${dataset}?limit=${PAGE_SIZE}&offset=${offset}`;
    // Le build veut les données du cycle courant. Sans cet en-tête, il peut
    // recevoir une réponse mise en cache jusqu'à quatre heures plus tôt.
    const res = await fetch(url, {
      headers: {
        "cache-control": "no-cache",
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} sur ${url}`);
    const body = (await res.json()) as { rows?: unknown[] };
    const page = body.rows ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Renvoie le contenu d'un jeu de données, sous la même forme que le fichier
 *  publié : un tableau JSON sérialisé. Les loaders n'ont donc rien à changer à
 *  leur analyse.
 *
 *  `repoRelativePath` est le chemin tel qu'il apparaît dans tables.json,
 *  p. ex. `public/data/refined/week/polimetre_plus.json`. */
export async function readDatasetText(repoRelativePath: string): Promise<string> {
  const absolute = path.resolve(process.cwd(), repoRelativePath);

  if (!USE_API && !USE_SNAPSHOT) return fs.readFile(absolute, "utf8");

  const mapping = await loadMapping();
  const dataset = mapping.get(repoRelativePath);
  if (!dataset) {
    // Tout ce que publie fetch_data.R n'est pas dans l'API : la calibration de
    // saillance, la sélection du hero et les métadonnées d'illustration sont
    // calculées, pas projetées depuis une table. Elles restent des fichiers.
    return fs.readFile(absolute, "utf8");
  }

  // MODE INSTANTANÉ : R2, jamais Postgres. Un manifeste absent ou périmé
  // suffit à repartir des fichiers — on ne tente même pas les tables.
  if (USE_SNAPSHOT) {
    const manifest = await loadManifest();
    if (!manifest) return fs.readFile(absolute, "utf8");

    const local = await localCopy(
      dataset,
      `instantane-${manifest.cycle}`,
      () => fetchSnapshotRows(dataset, manifest),
      "instantané",
    );
    return fs.readFile(local ?? absolute, "utf8");
  }

  if (!(await apiIsFresh())) return fs.readFile(absolute, "utf8");

  if (!API_KEY) {
    console.warn(
      `[source] VITRINE_API_KEY absente. Repli sur les fichiers pour ${dataset}.`,
    );
    return fs.readFile(absolute, "utf8");
  }

  const local = await localCopy(
    dataset,
    `api-${apiCycleKey || "sans-cycle"}`,
    async () => JSON.stringify(await fetchAllRows(dataset)),
    "API",
  );
  return fs.readFile(local ?? absolute, "utf8");
}
