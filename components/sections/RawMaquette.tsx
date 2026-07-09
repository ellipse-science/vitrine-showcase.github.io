// Renders a verbatim slice of the original maquette HTML inline.
//
// This is the pragmatic shortcut for the static (non-data-bound) sections
// during the migration: instead of hand-converting hundreds of lines of HTML
// to JSX (with all the className / htmlFor / self-closing / style-object
// gotchas), we read the source HTML at build time and inject it via
// dangerouslySetInnerHTML. Safe because the source is our own static markup,
// not user input. JSX-converting individual chunks later is a follow-up.
//
// Each chunk lives in static-content/{name}.html, extracted verbatim from
// public/index.html. To edit a chunk, edit the .html file directly.

import fs from "node:fs/promises";
import path from "node:path";

import pkg from "../../package.json";

const CHUNK_DIR = path.resolve(process.cwd(), "static-content");

export type ChunkName = "top" | "bottom" | "polimeter_plus";

// `package.json` est la source de vérité de la version (bumpée en CI, cf.
// .github/workflows/version-bump.yml). Le footer contient un placeholder
// `__VERSION__` substitué ici au build.
//   2.0.0-beta.3 → « Bêta v2.0.0 (b3) »  (compteur bêta visible)
//   2.0.0        → « v2.0.0 »             (hors bêta)
function formatVersion(version: string): string {
  const [core, pre] = version.split("-");
  const beta = pre?.match(/^beta\.(\d+)$/);
  return beta ? `Bêta v${core} (b${beta[1]})` : `v${core}`;
}

export async function RawMaquette({ chunk }: { chunk: ChunkName }) {
  const file = path.join(CHUNK_DIR, `${chunk}.html`);
  let html = await fs.readFile(file, "utf8");

  // Dynamically resolve relative/absolute paths for subpages (dev and prod basepath)
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  // Replace links with basePath prefix
  html = html.replace(/href="methodologie\/"/g, `href="${basePath}/methodologie/"`);
  html = html.replace(/href="apropos\/"/g, `href="${basePath}/apropos/"`);
  html = html.replace(/href="\/abonnement"/g, `href="${basePath}/abonnement/"`);
  html = html.replace(/href="abonnement\/"/g, `href="${basePath}/abonnement/"`);
  html = html.replace(/href="\.\/"/g, `href="${basePath || '/'}"`);
  html = html.replace(/src="\/images\//g, `src="${basePath}/images/`);

  // Substitue la version (source de vérité : package.json) — no-op sur les
  // chunks qui ne contiennent pas le placeholder.
  html = html.replaceAll("__VERSION__", formatVersion(pkg.version));

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
