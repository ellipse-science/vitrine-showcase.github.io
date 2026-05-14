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

const CHUNK_DIR = path.resolve(process.cwd(), "static-content");

export type ChunkName = "top" | "middle" | "bottom";

export async function RawMaquette({ chunk }: { chunk: ChunkName }) {
  const file = path.join(CHUNK_DIR, `${chunk}.html`);
  const html = await fs.readFile(file, "utf8");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
