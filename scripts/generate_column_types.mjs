// Génère workers/api/src/column-types.ts, la table des types de colonnes.
//
// POURQUOI CE GÉNÉRATEUR EXISTE. L'instantané R2 (src/snapshot.ts) est écrit
// depuis les lignes ATHENA, qui arrivent toutes en CHAÎNES. L'API, elle, sert
// les mêmes lignes après un aller-retour par Postgres, où les colonnes sont
// TYPÉES : `0.1981` et non `"0.1981"`. Pour que l'instantané soit
// interchangeable avec /v1/datasets — c'est toute sa raison d'être — il doit
// reproduire ces types.
//
// POURQUOI IL RÉGÉNÈRE LE DDL AU LIEU DE LIRE sql/schema.sql. C'était la
// première version, et elle avait un trou SILENCIEUX : `sql/schema.sql` est un
// artefact commité, donc il peut prendre du retard sur scripts/tables.json —
// il lui manquait effectivement trois tables (les `*_by_media_*`) au
// 2026-08-26. Une table absente n'a pas de types, et sans types la conversion
// laisse tout en chaînes : les modules concernés auraient reçu « "0" » là où
// ils attendent 0, sans le moindre avertissement. On appelle donc
// generate_pg_schema.mjs, qui INFÈRE les types des données réellement
// publiées, et on lit sa sortie. Une seule inférence, deux artefacts.
//
// Corollaire assumé : une table dont les types restent inconnus (fichier de
// données absent) n'est PAS mise en instantané du tout — cf. `hasColumnTypes`
// dans snapshot-logic.ts. Elle continue d'être lue depuis son fichier publié.
// Ne rien servir vaut mieux que servir des chaînes déguisées en nombres.
//
// Usage : node scripts/generate_column_types.mjs

import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(REPO_ROOT, "workers", "api", "src", "column-types.ts");

/** Types Postgres → familles de conversion côté Worker.
 *
 *  Seules DEUX familles comptent : ce que le pilote rend en `number`, et tout
 *  le reste. `bigint` est délibérément absent de la famille numérique — il
 *  sort de la plage sûre de JavaScript et le pilote Neon le rend en CHAÎNE
 *  (règle 2 de generate_pg_schema.mjs). Le convertir en nombre ici ferait
 *  diverger l'instantané de l'API sur la seule colonne concernée. */
const NUMERIC = new Set(["integer", "double precision", "real", "numeric"]);
const BOOLEAN = new Set(["boolean"]);

function parseSchema(sql) {
  const tables = {};
  // On ne lit QUE les tables du schéma `vitrine` : auth.sql y ajoute ses
  // propres tables, qui ne sont jamais servies en instantané.
  const re = /CREATE TABLE IF NOT EXISTS vitrine\."([^"]+)"\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const [, table, body] = m;
    const cols = {};
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim().replace(/,$/, "");
      const col = line.match(/^"([^"]+)"\s+(.+)$/);
      if (!col) continue;
      const [, name, rawType] = col;
      const type = rawType.trim().toLowerCase();
      if (NUMERIC.has(type)) cols[name] = "number";
      else if (BOOLEAN.has(type)) cols[name] = "boolean";
      // `text`, `bigint`, `timestamptz` : laissés tels quels, donc absents de
      // la table. Une entrée par colonne à convertir, pas par colonne tout
      // court — le fichier généré reste lisible en revue.
    }
    // UNE ENTRÉE PAR TABLE, MÊME VIDE. C'est ce qui rend « table absente »
    // sans ambiguïté : cela ne veut plus dire « aucune colonne à convertir »
    // mais « types inconnus », et snapshot-logic.ts peut alors refuser de la
    // mettre en instantané au lieu de la servir en chaînes.
    tables[table] = cols;
  }
  return tables;
}

const schema = execFileSync(
  process.execPath,
  [path.join(REPO_ROOT, "scripts", "generate_pg_schema.mjs")],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);
const tables = parseSchema(schema);

const header = `// GÉNÉRÉ par scripts/generate_column_types.mjs depuis sql/schema.sql.
// NE PAS ÉDITER À LA MAIN. Régénérer : node scripts/generate_column_types.mjs
//
// Types des colonnes que le pilote Postgres rend AUTREMENT qu'en chaîne. Sert
// à l'instantané R2 (src/snapshot.ts), écrit depuis les lignes Athena — qui
// sont toutes des chaînes — pour qu'il soit interchangeable avec la réponse
// de /v1/datasets. Les colonnes absentes restent des chaînes : c'est le cas
// de \`text\`, mais AUSSI de \`bigint\` (rendu en chaîne par le pilote) et de
// \`timestamptz\`.
//
// UNE TABLE ABSENTE DE CETTE LISTE A DES TYPES INCONNUS, et n'est donc PAS
// mise en instantané (cf. hasColumnTypes) : le build continue de la lire dans
// son fichier publié. Une table sans colonne à convertir apparaît, elle, avec
// un objet vide — la distinction est délibérée.

export type ColumnKind = 'number' | 'boolean'

export const COLUMN_TYPES: Record<string, Record<string, ColumnKind>> = `;

const body = JSON.stringify(tables, null, 2).replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1:');
await writeFile(OUT, `${header}${body}\n`, "utf8");

const nCols = Object.values(tables).reduce((n, c) => n + Object.keys(c).length, 0);
console.log(
  `[generate_column_types] ${Object.keys(tables).length} tables, ${nCols} colonnes converties → ${path.relative(REPO_ROOT, OUT)}`,
);
