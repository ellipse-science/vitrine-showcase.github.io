// After `next build`, copy static assets that don't live under Next.js's
// public/ into the output directory:
//
// - The R refresher writes JSON to /public/data/ on a 4-hour cron — Next.js
//   handles those automatically via its public/ convention, but this script
//   stays in case we ever want explicit control or want to copy other roots.
// - /presentation/ is a separate static deliverable (RevealJS deck) that
//   lives at the repo root, not inside public/.
//
// Today the script is mostly a no-op for /public/* since Next.js already
// copies those, but it keeps /presentation/ wired in and lets us include
// any future repo-root static directory without touching the workflow.

import { cp, readdir, readFile, writeFile } from "node:fs/promises";
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
async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith(".html")) yield full;
  }
}

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
}

main().catch((err) => {
  console.error("postbuild failed:", err);
  process.exit(1);
});
