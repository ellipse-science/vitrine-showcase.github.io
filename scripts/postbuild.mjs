// After `next build`, copy static assets that don't live under Next.js's
// public/ into the output directory:
//
// - The R refresher writes JSON to /public/data/ on a 4-hour cron — Next.js
//   copies those into out/ via its public/ convention. We take that back out
//   again: see pruneDataJson() below, c'est le « contrôle explicite » que ce
//   commentaire anticipait.
// - /presentation/ is a separate static deliverable (RevealJS deck) that
//   lives at the repo root, not inside public/.

import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import pkg from "../package.json" with { type: "json" };
import { formatVersion, VERSION_PLACEHOLDER } from "./version.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "out");

async function copyIfPresent(src, dest) {
  try {
    await cp(src, dest, { recursive: true, force: true });
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

// Les pages HTML de public/ (Méthodologie, docs vivantes) sont recopiées
// VERBATIM par `output: export` : elles ne traversent jamais React, donc
// RawMaquette ne peut pas y substituer la version. Sans ce passage, la seule
// façon d'y afficher un numéro était de l'écrire en dur — et il se périmait au
// premier bump. La page Méthodologie a ainsi annoncé « Bêta v1.9.7 » alors que
// le site tournait en 2.23.0.
//
// On balaie donc tout out/ après le build : les pages Next y ont déjà leur
// version (substituée au rendu), les statiques y portent encore le jeton.
async function* filesWithSuffix(dir, suffix) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* filesWithSuffix(full, suffix);
    else if (entry.name.endsWith(suffix)) yield full;
  }
}

const htmlFiles = (dir) => filesWithSuffix(dir, ".html");

async function substituteVersion() {
  const label = formatVersion(pkg.version);
  let touched = 0;
  for await (const file of htmlFiles(OUT_DIR)) {
    const html = await readFile(file, "utf8");
    if (!html.includes(VERSION_PLACEHOLDER)) continue;
    await writeFile(file, html.replaceAll(VERSION_PLACEHOLDER, label), "utf8");
    touched++;
  }
  console.log(`postbuild: version « ${label} » posée dans ${touched} page(s) statique(s)`);
}

// Les JSON de out/data/ ne sont JAMAIS demandés par un navigateur : les loaders
// de lib/data/*.ts les lisent avec node:fs AU BUILD, et Next.js inline le
// résultat dans le HTML prérendu. Les livrer au CDN, c'est publier ~9,5 Mo de
// jeu de données à des URL devinables — celui-là même dont le projet compte
// vendre l'accès (cf. docs/reference/api-direction.md) — et alourdir chaque
// déploiement pour rien.
//
// Règle en LISTE NOIRE, pas en liste blanche : on supprime « *.json sous
// out/data/ » et rien d'autre. Tout actif non-JSON survit par construction —
// latest.png, latest.mp3, latest.webp, latest.avif — donc ajouter un format
// d'image plus tard ne demande aucune retouche ici.
async function pruneDataJson() {
  const dataDir = path.join(OUT_DIR, "data");
  let removed = 0;
  let bytes = 0;

  try {
    await readdir(dataDir);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }

  for await (const file of filesWithSuffix(dataDir, ".json")) {
    bytes += (await stat(file)).size;
    await rm(file);
    removed++;
  }

  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(`postbuild: ${removed} JSON de données retirés de out/data (${mb} Mo)`);
}

async function main() {
  try {
    await readdir(OUT_DIR);
  } catch {
    console.error(`postbuild: ${OUT_DIR} does not exist — did next build run?`);
    process.exit(1);
  }

  // /presentation/ lives at repo root, not under /public.
  const presentationSrc = path.join(REPO_ROOT, "presentation");
  const presentationDest = path.join(OUT_DIR, "presentation");
  if (await copyIfPresent(presentationSrc, presentationDest)) {
    console.log("postbuild: copied /presentation");
  }

  // APRÈS la copie : /presentation peut elle aussi porter le jeton un jour.
  await substituteVersion();

  // EN DERNIER : après la substitution de version, qui balaie tout out/.
  await pruneDataJson();
}

main().catch((err) => {
  console.error("postbuild failed:", err);
  process.exit(1);
});
