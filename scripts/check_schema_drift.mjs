// Vérifie que la liste blanche du Worker et le schéma SQL sont d'accord.
//
// POURQUOI CETTE GARDE EXISTE. Le 2026-08-26, quatre tables figuraient dans
// `workers/api/src/tables.ts` sans exister dans `sql/schema.sql` — donc sans
// exister dans Postgres. La synchro les tentait à chaque cycle, échouait
// (« relation ... does not exist »), et la règle du tout ou rien retenait les
// Deploy Hooks. Résultat : le site a cessé de se rafraîchir par sa chaîne
// normale pendant des SEMAINES, sans que rien ne le signale. La dérive était
// visible dans le dépôt depuis le premier jour ; il n'existait simplement
// aucun contrôle pour la voir.
//
// CE QUE LA GARDE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS. Elle compare deux
// FICHIERS. Elle ne peut pas savoir ce que Postgres contient réellement — un
// schéma juste dans le dépôt mais jamais appliqué à la base reproduirait la
// même panne. Elle attrape la cause qu'on a rencontrée (le dépôt se contredit
// lui-même), pas toutes les causes possibles.
//
// Usage : node scripts/check_schema_drift.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/** Tables déclarées dans la liste blanche du Worker, et leurs colonnes. */
async function tablesFromWorker() {
  const src = await readFile(
    path.join(REPO_ROOT, "workers", "api", "src", "tables.ts"),
    "utf8",
  );
  const marker = "export const TABLES: TableSpec[] =";
  const from = src.indexOf("[", src.indexOf(marker) + marker.length);
  const specs = JSON.parse(src.slice(from, src.lastIndexOf("]") + 1));
  return new Map(specs.map((s) => [s.name, s.cols]));
}

/** Tables créées par le schéma, et leurs colonnes. */
async function tablesFromSchema() {
  const sql = await readFile(path.join(REPO_ROOT, "sql", "schema.sql"), "utf8");
  const out = new Map();
  const re = /CREATE TABLE IF NOT EXISTS vitrine\."([^"]+)"\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const cols = [...m[2].matchAll(/^\s*"([^"]+)"/gm)].map((x) => x[1]);
    out.set(m[1], cols);
  }
  return out;
}

const worker = await tablesFromWorker();
const schema = await tablesFromSchema();

const problems = [];

for (const [name, cols] of worker) {
  const schemaCols = schema.get(name);
  if (!schemaCols) {
    // LE CAS EXACT DU 2026-08-26 : la synchro écrira dans une table que le
    // schéma ne crée pas. Elle échouera à chaque cycle et retiendra les hooks.
    problems.push(
      `${name} : déclarée dans tables.ts, ABSENTE de sql/schema.sql — la synchro échouera à chaque passe et retiendra les Deploy Hooks.`,
    );
    continue;
  }
  const missing = cols.filter((c) => !schemaCols.includes(c));
  if (missing.length > 0) {
    problems.push(
      `${name} : colonne(s) écrite(s) par la synchro mais absente(s) du schéma — ${missing.join(", ")}.`,
    );
  }
}

if (problems.length > 0) {
  console.error("Dérive entre workers/api/src/tables.ts et sql/schema.sql :\n");
  for (const p of problems) console.error(`  ✘ ${p}`);
  console.error(
    "\nRégénérer : node scripts/generate_pg_schema.mjs > sql/schema.sql" +
      "\nPuis APPLIQUER à Postgres : DATABASE_URL='…' node scripts/apply_sql.mjs sql/schema.sql" +
      "\n(le dépôt seul ne suffit pas : c'est la base qui doit contenir les tables)",
  );
  process.exit(1);
}

console.log(
  `Schéma cohérent : ${worker.size} tables de tables.ts, toutes présentes dans sql/schema.sql avec leurs colonnes.`,
);
