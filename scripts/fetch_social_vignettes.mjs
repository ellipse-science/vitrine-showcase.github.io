// Rapatrie les vignettes du palmarès et du fil « Les candidats sur les réseaux » depuis
// l'API (R2) vers public/data/generated-art/social/, AVANT le build (hook npm
// `prebuild`), comme scripts/fetch_art.mjs pour l'illustration de la Une.
//
// Le raffineur agora-social (aws-refiners) réduit l'image de chaque
// publication affichable (400 px, JPEG) et la dépose sur
// PUT /v1/art/social/<plateforme>/<id>.jpg ; la colonne `vignette` du palmarès
// porte cette clé. Les visiteurs ne lisent que des fichiers plats du CDN.
//
// DRAPEAU NATUREL. Tant que le raffineur ne dépose rien (drapeau `vignettes`
// éteint, motif absent du Worker), la colonne est vide et ce script ne fait
// aucune requête. BEST-EFFORT : une vignette introuvable n'est pas écrite, et
// le chargeur (lib/data/social.ts) n'affiche que celles présentes sur le disque.

import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.VITRINE_API_BASE ?? "https://api.vitrinedemocratique.com";
const API_KEY = process.env.VITRINE_API_KEY ?? "";
const RACINE = path.resolve(import.meta.dirname, "..");
// Le palmarès et le fil des circonscriptions portent tous deux une colonne `vignette`.
const TABLES = ["agora_social_palmares.json", "agora_social_fil.json"].map((f) =>
  path.join(RACINE, "public", "data", "agora", f),
);
const OUT_DIR = path.join(RACINE, "public", "data", "generated-art");
// Même motif que le Worker devra accepter, et que le chargeur vérifie.
const CLE = /^social\/(facebook|instagram|tiktok)\/[A-Za-z0-9._-]{1,40}\.jpg$/;
const EN_PARALLELE = 8;

async function lignes(fichier) {
  try {
    const rows = JSON.parse(await readFile(fichier, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function cles() {
  const toutes = (await Promise.all(TABLES.map(lignes))).flat();
  return [...new Set(toutes.map((r) => r?.vignette).filter((v) => CLE.test(v ?? "")))];
}

async function fetchVignette(cle) {
  const cible = path.join(OUT_DIR, cle);
  try {
    const res = await fetch(`${API_BASE}/v1/art/${cle}`, {
      headers: API_KEY ? { authorization: `Bearer ${API_KEY}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const octets = Buffer.from(await res.arrayBuffer());
    if (octets.length === 0) throw new Error("réponse vide");
    await mkdir(path.dirname(cible), { recursive: true });
    await writeFile(cible, octets);
    return true;
  } catch {
    return false;
  }
}

const liste = await cles();
// Dossier propre : une vignette sortie du palmarès ne survit pas au build.
await rm(path.join(OUT_DIR, "social"), { recursive: true, force: true });
if (liste.length === 0) {
  console.log("[fetch_social_vignettes] aucune vignette au palmarès");
} else {
  let ecrites = 0;
  for (let i = 0; i < liste.length; i += EN_PARALLELE) {
    const rs = await Promise.all(liste.slice(i, i + EN_PARALLELE).map(fetchVignette));
    ecrites += rs.filter(Boolean).length;
  }
  console.log(`[fetch_social_vignettes] ${ecrites}/${liste.length} vignettes`);
}
