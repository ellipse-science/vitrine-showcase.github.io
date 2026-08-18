// Génère le schéma Postgres de l'API à partir de scripts/tables.json.
//
// POURQUOI GÉNÉRER PLUTÔT QU'ÉCRIRE À LA MAIN : tables.json EST le contrat de
// schéma (cf. docs/reference/api-direction.md). Un schéma SQL maintenu
// séparément dériverait du contrat au premier ajout de colonne — précisément ce
// que le contrat existe pour empêcher. Ici, une colonne ajoutée à tables.json
// apparaît dans le DDL au prochain passage, ou l'écart devient visible.
//
// Les TYPES ne sont pas dans tables.json : ils sont INFÉRÉS des données réelles
// déjà publiées dans public/data/. C'est la source la plus fiable dont on
// dispose — c'est littéralement ce qu'Athena a produit.
//
// STRATÉGIE DE CHARGEMENT : remplacement intégral par table, dans une
// transaction (TRUNCATE puis COPY). Pas de clés primaires, pas d'UPSERT.
//
//   - fetch_data.R lit déjà les tables ENTIÈRES toutes les 4 h : il n'y a pas
//     de delta à exploiter, donc rien à gagner à un UPSERT.
//   - Deviner une clé naturelle par table (party+date ? deputy+period ?) serait
//     une source de bogues silencieux : une clé fausse dédoublonne des lignes
//     légitimes ou en écrase.
//   - Une transaction rend l'opération atomique : les lecteurs voient l'ancien
//     jeu complet ou le nouveau, jamais une table à moitié vide.
//
// Usage : node scripts/generate_pg_schema.mjs > sql/schema.sql

import { readFile, access } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/** Postgres type for a column, inferred from every non-null value seen.
 *
 *  Volontairement conservateur : au moindre doute on élargit (int → numeric →
 *  text). Une colonne trop large ne casse rien ; une colonne trop étroite fait
 *  échouer le chargement à 4 h du matin. */
function inferType(values) {
  const seen = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (seen.length === 0) return "text"; // aucune donnée : on ne devine pas

  if (seen.every((v) => typeof v === "boolean")) return "boolean";

  if (seen.every((v) => typeof v === "number")) {
    return seen.every((v) => Number.isInteger(v)) ? "bigint" : "double precision";
  }

  if (seen.every((v) => typeof v === "string")) {
    // Dates ISO (2026-08-17) et horodatages (2026-08-17T12:04:00Z)
    if (seen.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))) return "date";
    if (seen.every((v) => /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v))) {
      return "timestamptz";
    }
  }

  return "text";
}

/** Colonnes qui méritent un index : ce sont les axes de filtrage évidents
 *  d'une API de séries temporelles. Inutile d'indexer 46 colonnes. */
const INDEXABLE = new Set([
  "date_utc",
  "date_montreal_tz",
  "party",
  "deputy",
  "period_type",
  "period_start_date",
  "period_end_date",
]);

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
  const config = JSON.parse(
    await readFile(path.join(REPO_ROOT, "scripts", "tables.json"), "utf8"),
  );
  const enabled = config.tables.filter((t) => t.enabled);

  const out = [];
  out.push("-- Généré par scripts/generate_pg_schema.mjs — NE PAS ÉDITER À LA MAIN.");
  out.push("-- Source de vérité : scripts/tables.json (contrat de schéma public).");
  out.push("-- Régénérer : node scripts/generate_pg_schema.mjs > sql/schema.sql");
  out.push("");
  out.push("CREATE SCHEMA IF NOT EXISTS vitrine;");
  out.push("");

  let skipped = 0;

  for (const table of enabled) {
    const jsonPath = path.join(REPO_ROOT, table.out);
    let rows = [];
    try {
      await access(jsonPath);
      rows = JSON.parse(await readFile(jsonPath, "utf8"));
    } catch {
      // Sans données publiées, on ne peut rien inférer. On l'annonce dans le
      // DDL plutôt que d'inventer des types en silence.
      out.push(`-- ⚠️  ${table.name} : ${table.out} absent — types non inférables, table omise.`);
      out.push("");
      skipped++;
      continue;
    }
    if (!Array.isArray(rows)) rows = [];

    const cols = table.cols.map((col) => ({
      name: col,
      type: inferType(rows.slice(0, 5000).map((r) => r?.[col])),
    }));

    out.push(`-- ${table.name}  (Athena : ${table.athena})`);
    if (table.used_by) out.push(`-- consommé par ${table.used_by}`);
    out.push(`CREATE TABLE IF NOT EXISTS vitrine.${quoteIdent(table.name)} (`);
    out.push(cols.map((c) => `  ${quoteIdent(c.name)} ${c.type}`).join(",\n"));
    out.push(");");

    for (const c of cols) {
      if (!INDEXABLE.has(c.name)) continue;
      const idx = `${table.name}_${c.name}_idx`;
      out.push(
        `CREATE INDEX IF NOT EXISTS ${quoteIdent(idx)} ` +
          `ON vitrine.${quoteIdent(table.name)} (${quoteIdent(c.name)});`,
      );
    }
    out.push("");
  }

  out.push("-- Fraîcheur : une ligne par table, écrite en fin de synchro. C'est ce");
  out.push("-- que l'API expose comme date de dernière mise à jour, et ce qui permet");
  out.push("-- de détecter une synchro muette (le pire des cas : des données figées");
  out.push("-- qui ont l'air vivantes).");
  out.push("CREATE TABLE IF NOT EXISTS vitrine.sync_state (");
  out.push('  "table_name" text PRIMARY KEY,');
  out.push('  "synced_at"  timestamptz NOT NULL,');
  out.push('  "row_count"  bigint NOT NULL,');
  out.push('  "source"     text NOT NULL DEFAULT \'athena\'');
  out.push(");");

  process.stdout.write(out.join("\n") + "\n");
  process.stderr.write(
    `schéma généré : ${enabled.length - skipped} tables` +
      (skipped ? `, ${skipped} omises faute de données\n` : "\n"),
  );
}

main().catch((err) => {
  process.stderr.write(`generate_pg_schema a échoué : ${err.message}\n`);
  process.exit(1);
});
