// Rapatrie l'illustration de la Une des unes depuis l'API (R2) vers
// public/data/generated-art/, AVANT le build (hook npm `prebuild`).
//
// POURQUOI CE SCRIPT EXISTE. L'illustration n'est plus commitée : le
// raffineur vitrine-art la génère et la dépose sur /v1/art (cf.
// workers/api/src/art.ts). Le build la télécharge ici, puis l'inline comme
// avant dans l'export statique — les visiteurs continuent de lire des
// fichiers plats sur le CDN, jamais l'API. C'est la même architecture que les
// données (lib/data/source.ts) : rapatriement AU BUILD, JAMAIS À L'EXÉCUTION.
//
// TOUT EST BEST-EFFORT, comme l'était generate_art.py dans refresh-data.yml :
// une API muette ou un bucket vide ne cassent jamais le build. En cas d'échec,
// le fichier local est SUPPRIMÉ plutôt que laissé tel quel : un reliquat
// périmé ferait afficher l'illustration d'une autre Une — précisément ce que
// la garde d'appariement de UneDesUnesSection existe à empêcher. Absent, le
// module bascule sur sa mise en page « sans illustration » ; périmé, il ment.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.VITRINE_API_BASE ?? "https://api.vitrinedemocratique.com";

/** Clé du build. `/v1/art` exige une clé depuis la fermeture de l'API
 *  (2026-08-26) : seuls le build et les raffineurs appellent cette route, le
 *  visiteur ne voit que l'image inlinée dans l'export statique. Sans clé, le
 *  rapatriement échoue proprement et le module s'affiche sans illustration —
 *  le même repli que pour une API muette. */
const API_KEY = process.env.VITRINE_API_KEY ?? "";
const OUT_DIR = path.resolve(import.meta.dirname, "..", "public", "data", "generated-art");

// latest.json en PREMIER : c'est lui qui porte l'event_id de la garde
// d'appariement. Sans lui, les images seules ne s'afficheraient pas.
const FILES = ["latest.json", "latest.png", "latest.webp", "latest.avif"];

async function fetchOne(file) {
  const url = `${API_BASE}/v1/art/${file}`;
  const target = path.join(OUT_DIR, file);
  try {
    // `no-cache` : le build veut l'image du cycle courant, pas la copie du
    // cache edge — même sémantique que le rapatriement des données.
    const res = await fetch(url, {
      headers: {
        "cache-control": "no-cache",
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error("réponse vide");
    if (file.endsWith(".json")) JSON.parse(bytes.toString("utf8"));
    await writeFile(target, bytes);
    console.log(`[fetch_art] ${file} — ${Math.round(bytes.length / 1024)} Ko`);
    return true;
  } catch (err) {
    console.warn(`[fetch_art] ${file} indisponible (${err.message}) — retiré du build`);
    await rm(target, { force: true });
    return false;
  }
}

await mkdir(OUT_DIR, { recursive: true });
const results = await Promise.all(FILES.map(fetchOne));
if (!results.some(Boolean)) {
  console.warn("[fetch_art] aucune illustration rapatriée — le module s'affichera sans image");
}
