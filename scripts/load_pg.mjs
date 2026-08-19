// Charge les JSON de public/data/ dans Postgres.
//
// C'est le PROTOTYPE de la synchro qui vivra dans une Lambda R à côté des
// raffineurs (cf. docs/reference/api-direction.md). Ici la source est le JSON
// déjà publié plutôt qu'Athena, ce qui permet de valider le schéma, les types
// et la stratégie de chargement sans dépendre d'AWS — et de recharger la base
// à volonté pendant le développement de l'API.
//
// STRATÉGIE : remplacement intégral par table, dans UNE transaction.
//   BEGIN; TRUNCATE t; \copy t FROM csv; ... ; COMMIT;
// Pas d'UPSERT : fetch_data.R lit déjà les tables entières, il n'y a aucun
// delta à exploiter, et deviner une clé naturelle par table produirait des
// doublons ou des écrasements silencieux. La transaction rend le basculement
// atomique — un lecteur voit l'ancien jeu complet ou le nouveau, jamais une
// table à moitié vide.
//
// Usage : node scripts/load_pg.mjs            (génère le script psql sur stdout)
//         node scripts/load_pg.mjs --out DIR  (écrit aussi les CSV dans DIR)

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/** Échappement CSV RFC 4180. `null` devient un champ vide, que COPY interprète
 *  comme NULL grâce à l'option NULL '' — sans quoi une chaîne « null » se
 *  retrouverait en base. */
function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
  const outFlag = process.argv.indexOf("--out");
  const outDir = outFlag !== -1 ? process.argv[outFlag + 1] : null;
  if (outDir) await mkdir(outDir, { recursive: true });

  const config = JSON.parse(
    await readFile(path.join(REPO_ROOT, "scripts", "tables.json"), "utf8"),
  );
  const enabled = config.tables.filter((t) => t.enabled);

  const psql = ["\\set ON_ERROR_STOP on", "BEGIN;", ""];
  const report = [];

  for (const table of enabled) {
    const jsonPath = path.join(REPO_ROOT, table.out);
    try {
      await access(jsonPath);
    } catch {
      report.push(`  ${table.name}: SAUTÉE (${table.out} absent)`);
      continue;
    }

    let rows = JSON.parse(await readFile(jsonPath, "utf8"));
    if (!Array.isArray(rows)) rows = [];

    const header = table.cols.map(csvCell).join(",");
    const body = rows.map((r) => table.cols.map((c) => csvCell(r?.[c])).join(","));
    const csv = [header, ...body].join("\n") + "\n";

    const csvPath = outDir
      ? path.join(outDir, `${table.name}.csv`)
      : path.join(REPO_ROOT, ".pgload", `${table.name}.csv`);
    await mkdir(path.dirname(csvPath), { recursive: true });
    await writeFile(csvPath, csv, "utf8");

    const cols = table.cols.map(quoteIdent).join(", ");
    psql.push(`TRUNCATE vitrine.${quoteIdent(table.name)};`);
    psql.push(
      `\\copy vitrine.${quoteIdent(table.name)} (${cols}) FROM '${csvPath}' WITH (FORMAT csv, HEADER true, NULL '');`,
    );
    psql.push(
      `INSERT INTO vitrine.sync_state (table_name, synced_at, row_count, source) ` +
        `VALUES ('${table.name}', now(), ${rows.length}, 'json-prototype') ` +
        `ON CONFLICT (table_name) DO UPDATE SET synced_at = EXCLUDED.synced_at, ` +
        `row_count = EXCLUDED.row_count, source = EXCLUDED.source;`,
    );
    psql.push("");

    report.push(`  ${table.name}: ${rows.length} lignes`);
  }

  psql.push("COMMIT;");
  process.stdout.write(psql.join("\n") + "\n");
  process.stderr.write(report.join("\n") + "\n");
}

main().catch((err) => {
  process.stderr.write(`load_pg a échoué : ${err.message}\n`);
  process.exit(1);
});
