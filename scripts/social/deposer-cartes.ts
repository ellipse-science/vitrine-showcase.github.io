// DÉPÔT DES CARTES À TÉLÉCHARGER — social-out/cartes-deputes-web/*.png et
// manifeste.json → l'API (PUT /v1/cartes/<periode>/<fichier>, clé `sync`),
// qui les range en R2 (vitrine#920). Lancé par le workflow Refresh Data après
// le rendu (`cartes-deputes.ts --style web --png --sans-relecture`), ou à la
// main une première fois.
//
//   VITRINE_API_KEY=… npx tsx scripts/social/deposer-cartes.ts --periode legislature
//   npx tsx scripts/social/deposer-cartes.ts --periode legislature --dossier social-out/cartes-deputes-web
//
// Les PNG d'abord, le manifeste EN DERNIER : tant qu'il n'est pas remplacé,
// le site ne propose que des cartes qui existent déjà (même règle que la Une,
// scripts/ensure_art.ts). Quatre envois à la fois ; un échec arrête tout et
// laisse l'ancien manifeste en place.
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "./lib/reel";

const API_BASE = process.env.VITRINE_API_BASE ?? "https://api.vitrinedemocratique.com";
const API_KEY = process.env.VITRINE_API_KEY ?? "";

async function deposer(chemin: string, octets: Buffer, contentType: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/cartes/${chemin}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": contentType, "content-length": String(octets.length) },
    body: new Uint8Array(octets),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`PUT ${chemin} : HTTP ${res.status} ${await res.text().catch(() => "")}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const periode = typeof args.periode === "string" ? args.periode : "legislature";
  if (!["legislature", "session", "last_pdq"].includes(periode)) throw new Error(`--periode ${periode} : legislature, session ou last_pdq.`);
  if (!API_KEY) throw new Error("VITRINE_API_KEY manquante : le dépôt se fait sous clé.");
  const dossier = path.resolve(process.cwd(), typeof args.dossier === "string" ? args.dossier : "social-out/cartes-deputes-web");
  const manifeste = JSON.parse(await fs.readFile(path.join(dossier, "manifeste.json"), "utf8")) as { periode: string; cartes: { slug: string }[] };
  if (manifeste.periode !== periode) throw new Error(`Le manifeste de ${dossier} est celui de la période « ${manifeste.periode} », pas « ${periode} ».`);

  const fichiers = manifeste.cartes.flatMap((c) => [`${c.slug}-recto.png`, `${c.slug}-verso.png`]);
  // Le recto n'a pas de suffixe sur disque (`<slug>.png`) ; le verso en a un.
  const surDisque = (f: string) => f.endsWith("-recto.png") ? `${f.slice(0, -"-recto.png".length)}.png` : f;
  let faits = 0;
  const file = [...fichiers];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let f = file.shift(); f; f = file.shift()) {
      const octets = await fs.readFile(path.join(dossier, surDisque(f)));
      await deposer(`${periode}/${f}`, octets, "image/png");
      process.stdout.write(`\r  ${++faits}/${fichiers.length} déposées`);
    }
  }));
  await deposer(`${periode}/manifeste.json`, Buffer.from(await fs.readFile(path.join(dossier, "manifeste.json"))), "application/json; charset=utf-8");
  console.log(`\n  ${fichiers.length} faces et le manifeste → ${API_BASE}/v1/cartes/${periode}/`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
