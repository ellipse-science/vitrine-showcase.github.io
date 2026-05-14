// After `next build`, copy static assets that live outside next-site/ into
// the output directory so the deployed site has data, logos, favicons, the
// methodology PDF, the RevealJS presentation, etc.
//
// We don't put these inside next-site/public/ because:
// - the JSON data files are committed by the R refresher into /public/data/
//   on a 4-hour cron, and we don't want to maintain a copy
// - /presentation/ is a separate static deliverable that lives at repo root
// Keeping the source paths stable means the existing data pipeline doesn't
// have to know about Next.js.

import { cp, readdir } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT_DIR = path.resolve(import.meta.dirname, "..", "out");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

// Files / dirs in /public that should ship with the build. Anything not in
// this list is silently skipped (e.g., the legacy maquette index.html or
// the legacy js/ hydration scripts during the migration window).
const PUBLIC_ENTRIES = [
  "data",
  "logos",
  "methodologie",
  "metho.pdf",
  "manifest.json",
  "dark-manifest.json",
  "browserconfig.xml",
  "robots.txt",
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "dark-favicon.ico",
  "dark-favicon-16x16.png",
  "dark-favicon-32x32.png",
  "dark-apple-touch-icon.png",
  "dark-android-chrome-192x192.png",
  "dark-android-chrome-512x512.png",
];

async function copyIfPresent(src, dest) {
  try {
    await cp(src, dest, { recursive: true, force: true });
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

async function main() {
  // Sanity check: out/ must exist (Next.js should have created it).
  try {
    await readdir(OUT_DIR);
  } catch {
    console.error(`postbuild: ${OUT_DIR} does not exist — did next build run?`);
    process.exit(1);
  }

  let copied = 0;
  for (const entry of PUBLIC_ENTRIES) {
    const src = path.join(PUBLIC_DIR, entry);
    const dest = path.join(OUT_DIR, entry);
    if (await copyIfPresent(src, dest)) copied++;
  }
  console.log(`postbuild: copied ${copied} entries from /public to /next-site/out`);

  // /presentation/ lives at repo root, not under /public.
  const presentationSrc = path.join(REPO_ROOT, "presentation");
  const presentationDest = path.join(OUT_DIR, "presentation");
  if (await copyIfPresent(presentationSrc, presentationDest)) {
    console.log("postbuild: copied /presentation");
  }
}

main().catch((err) => {
  console.error("postbuild failed:", err);
  process.exit(1);
});
