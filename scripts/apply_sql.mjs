// Applique un fichier SQL sur la base Postgres de l'API.
//
// Passe par le pilote HTTP de Neon plutôt que par psql : le port 5432 est
// bloqué depuis certains réseaux, alors que le chemin HTTPS — celui qu'utilise
// déjà le Worker — répond partout.
//
// Usage :
//   DATABASE_URL='postgresql://…' node scripts/apply_sql.mjs sql/auth.sql
//   node scripts/apply_sql.mjs sql/schema.sql            (lit ~/.neon-vitrine.env)
//
// Le pilote HTTP n'accepte qu'une instruction par requête : on découpe sur les
// points-virgules en fin de ligne, ce qui suffit pour du DDL (aucun corps de
// fonction PL/pgSQL ici — si l'un apparaît, il faudra un vrai analyseur).

import { readFile } from "node:fs/promises";
import path from "node:path";

import { neon } from "@neondatabase/serverless";

async function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(process.env.HOME ?? "", ".neon-vitrine.env");
  const text = await readFile(envPath, "utf8").catch(() => "");
  const match = text.match(/DATABASE_URL=['"]?([^'"\n]+)/);
  if (!match) {
    throw new Error(
      "DATABASE_URL introuvable — passez-la en variable d'environnement.",
    );
  }
  return match[1];
}

function splitStatements(text) {
  return text
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s && !s.split("\n").every((l) => l.trim().startsWith("--")));
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage : node scripts/apply_sql.mjs <fichier.sql>");

  const sql = neon(await resolveUrl());
  const statements = splitStatements(await readFile(file, "utf8"));

  let done = 0;
  for (const statement of statements) {
    try {
      await sql.query(statement);
      done++;
    } catch (err) {
      // On s'arrête au premier échec : appliquer la moitié d'un schéma laisse
      // une base dans un état que personne n'a décrit.
      process.stderr.write(`\néchec sur :\n${statement.slice(0, 300)}\n`);
      throw err;
    }
  }
  process.stdout.write(`${done}/${statements.length} instructions appliquées (${file})\n`);
}

main().catch((err) => {
  process.stderr.write(`apply_sql : ${err.message}\n`);
  process.exit(1);
});
