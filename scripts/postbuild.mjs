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

import { cp, readdir } from "node:fs/promises";
import path from "node:path";

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
}

main().catch((err) => {
  console.error("postbuild failed:", err);
  process.exit(1);
});
