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
const USE_API = process.env.VITRINE_DATA_SOURCE === "api";

/** Clé d'API du build. Les jeux de données sont payants : même le site doit
 *  s'authentifier. Sa clé porte la portée totale et aucun quota — ce n'est pas
 *  un client, c'est le site lui-même. */
const API_KEY = process.env.VITRINE_API_KEY ?? "";

/** L'API plafonne une réponse à 5 000 lignes ; la plus grosse table en compte
 *  plus de 9 000. On pagine donc — sans quoi on perdrait des lignes en silence,
 *  ce qui est bien pire qu'une erreur. */
const PAGE_SIZE = 5000;

type TableSpec = { name: string; out: string; enabled: boolean };

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
    config.tables.filter((t) => t.enabled).map((t) => [t.out, t.name]),
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

  if (!USE_API) return fs.readFile(absolute, "utf8");

  const mapping = await loadMapping();
  const dataset = mapping.get(repoRelativePath);
  if (!dataset) {
    // Tout ce que publie fetch_data.R n'est pas dans l'API : la calibration de
    // saillance, la sélection du hero et les métadonnées d'illustration sont
    // calculées, pas projetées depuis une table. Elles restent des fichiers.
    return fs.readFile(absolute, "utf8");
  }

  if (!API_KEY) {
    console.warn(
      `[source] VITRINE_API_KEY absente — repli sur les fichiers pour ${dataset}.`,
    );
    return fs.readFile(absolute, "utf8");
  }

  try {
    const rows = await fetchAllRows(dataset);
    return JSON.stringify(rows);
  } catch (err) {
    // On retombe sur le fichier plutôt que de casser le build. Un site qui se
    // construit avec des données d'il y a quatre heures vaut mieux qu'un site
    // qui ne se construit pas — et l'écart est visible dans /v1/health.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[source] API indisponible pour ${dataset} (${message}) — repli sur le fichier`);
    return fs.readFile(absolute, "utf8");
  }
}
