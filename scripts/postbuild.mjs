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
//
// DEUX exceptions nommées, sur le même principe : les verdicts que les
// raffineurs d'illustration lisent sur le site déployé pour savoir QUOI
// illustrer, plutôt que de les recalculer chacun de leur côté.
//   - hero-selection.json  → la Une (app/data/hero-selection.json/route.ts)
//   - partis-selection.json → les cinq pochettes du bac du jour
// Ni l'un ni l'autre n'est une donnée vendue : les deux ne portent que ce qui
// est déjà affiché à l'écran.
const PRUNE_KEEP = new Set(["hero-selection.json", "partis-selection.json"]);

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
    if (PRUNE_KEEP.has(path.basename(file))) continue;
    bytes += (await stat(file)).size;
    await rm(file);
    removed++;
  }

  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(`postbuild: ${removed} JSON de données retirés de out/data (${mb} Mo)`);
}

// Fonds Gratton RETIRÉS DE PROD (2026-08-20) : lib/shareImageBackgrounds.ts
// vide déjà la table en prod — plus aucune carte n'y réfère — mais `output:
// export` copierait quand même les photos dans out/images/share/, à des URL
// devinables. On retire donc les fichiers eux-mêmes du livrable prod ; dev
// les garde.
async function pruneShareBackgrounds() {
  if (process.env.NEXT_PUBLIC_SITE_ENV !== "prod") return;
  const shareDir = path.join(OUT_DIR, "images", "share");
  let entries;
  try {
    entries = await readdir(shareDir);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  let removed = 0;
  for (const name of entries) {
    if (!name.startsWith("gratton-")) continue;
    await rm(path.join(shareDir, name));
    removed++;
  }
  console.log(`postbuild: ${removed} fond(s) Gratton retiré(s) du livrable prod`);
}

// Identifiant de build pour l'actualisation côté navigateur (composant
// ActualisationAuto) : ~100 octets consultés par la sonde du client, servis
// par le CDN avec Cache-Control: no-store (public/_headers). L'horodatage
// fait partie de l'identifiant : un rebuild « données seulement » (même
// commit, nouvelles données via Deploy Hook) change l'identifiant quand même.
function computeBuildId() {
  const sha = (process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || "local").slice(0, 7);
  const builtAt = new Date().toISOString();
  return { id: `${sha}-${Date.parse(builtAt)}`, builtAt };
}

async function writeBuildId({ id, builtAt }) {
  await writeFile(
    path.join(OUT_DIR, "build-id.json"),
    JSON.stringify({ id, builtAt }) + "\n",
    "utf8",
  );
  console.log(`postbuild: build-id « ${id} » écrit`);
}

// Le cache du service worker retient du HTML aux données inlinées : sous un
// nom constant, il survivait aux déploiements et pouvait resservir une vieille
// édition indéfiniment (audit du 2026-08-19). Le nom porte donc l'identifiant
// de build : l'activate du SW purge tout cache qui ne le porte pas.
async function versionServiceWorker({ id }) {
  const swPath = path.join(OUT_DIR, "sw.js");
  let sw;
  try {
    sw = await readFile(swPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  if (!sw.includes("__BUILD_ID__")) {
    console.warn("postbuild: sw.js sans jeton __BUILD_ID__ — cache non versionné");
    return;
  }
  await writeFile(swPath, sw.replaceAll("__BUILD_ID__", id), "utf8");
  console.log(`postbuild: service worker versionné (vitrine-${id})`);
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
  await pruneShareBackgrounds();

  // Hors de out/data/ : survit à pruneDataJson par construction. Le MÊME
  // identifiant nomme le cache du service worker — la sonde ActualisationAuto
  // et la purge du SW parlent du même build.
  const build = computeBuildId();
  await writeBuildId(build);
  await versionServiceWorker(build);
}

main().catch((err) => {
  console.error("postbuild failed:", err);
  process.exit(1);
});
