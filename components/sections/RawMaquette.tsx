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
// Libellé de version : source unique, partagée avec scripts/postbuild.mjs, qui
// fait la même substitution sur les pages statiques de public/ (elles ne
// traversent pas React). Voir scripts/version.mjs.
import { formatVersion, VERSION_PLACEHOLDER } from "../../scripts/version.mjs";

const CHUNK_DIR = path.resolve(process.cwd(), "static-content");

export type ChunkName = "top" | "bottom" | "polimeter_plus";

export { formatVersion };

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
  html = html.replace(/href="journal\/"/g, `href="${basePath}/journal/"`);
  html = html.replace(/href="camille\/"/g, `href="${basePath}/camille/"`);
  html = html.replace(/href="\.\/"/g, `href="${basePath || '/'}"`);
  html = html.replace(/src="\/images\//g, `src="${basePath}/images/`);

  // Substitue la version (source de vérité : package.json) — no-op sur les
  // chunks qui ne contiennent pas le placeholder.
  html = html.replaceAll(VERSION_PLACEHOLDER, formatVersion(pkg.version));

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
