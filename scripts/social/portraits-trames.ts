// PORTRAITS TRAMÉS POUR LE SITE — public/images/deputes/cartes/trame/<slug>.webp
//
// Le vestiaire du site affiche les cartes de député avec le même balisage que
// les cartes imprimées (lib/cartes/faces.ts). Le portrait de ces cartes est
// une photo TRAMÉE (rosette quadrichromique, lib/cartes/trame.ts), calculée
// par sharp : quelques secondes par portrait, trop pour chaque build du site
// (plusieurs par jour). Les fichiers sont donc produits ici, à la main, et
// COMMIS dans le dépôt, comme les portraits en bichromie de cartes/web/.
//
// Réglages : trame de 4 px sur 1500 × 2000 (le style « web » du générateur,
// retenu par Jules le 25-09), puis réduction à 600 × 800 en WebP (qualité 72,
// ≈ 65 Ko) — assez pour la carte du vestiaire à l'échelle 2 (une carte de
// 291 px de large montre la photo sur 266 px, 532 px sur un écran Retina).
// Pas plus grand : à 750 × 1000 la trame de 4 px aliasait et chaque fichier
// pesait 250 Ko, 32 Mo pour la série. Un manifeste note l'empreinte de chaque
// source : un portrait inchangé n'est pas recalculé.
//
// Le même script prépare les ACCESSOIRES des cartes du site, dans
// public/images/cartes/ : les logos rognés à l'encre (CAPP, Université Laval,
// Vitrine) et les écussons de parti rognés puis recentrés dans un carré —
// exactement ce que le générateur fait en mémoire (loadLogos, ecussonURI),
// pour que `mask-size: contain` donne la même taille sur le site.
//
//   npx tsx scripts/social/portraits-trames.ts            → ce qui manque ou a changé
//   npx tsx scripts/social/portraits-trames.ts --tout     → tout refaire
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FORMAT_PORTRAIT, TRAME_VERSION, monogrammePNG, tramer } from "@/lib/cartes/trame";

const SOURCE = path.resolve(process.cwd(), "public/images/deputes");
const SORTIE = path.resolve(process.cwd(), "public/images/deputes/cartes/trame");
const MANIFESTE = path.join(SORTIE, ".manifeste.json");
/** Même trame que le style « web » du générateur de cartes. */
const REGLAGES = { cellule: 4, densite: 1, largeur: 600, hauteur: 800, qualite: 72 };

async function lister(dossier: string, prefixe = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dossier, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // Seul « historique » (anciens élus) est une source ; « cartes » est une sortie.
      if (e.name === "historique") out.push(...await lister(path.join(dossier, e.name), `${prefixe}${e.name}/`));
      continue;
    }
    if (e.name.toLowerCase().endsWith(".jpg")) out.push(`${prefixe}${e.name.slice(0, -4)}`);
  }
  return out.sort();
}

async function main() {
  const tout = process.argv.includes("--tout");
  const sharp = (await import("sharp")).default;
  const manifeste: Record<string, string> = tout ? {} : await fs.readFile(MANIFESTE, "utf8").then(JSON.parse).catch(() => ({}));
  const assets = await lister(SOURCE);
  let faits = 0, gardes = 0, echecs = 0;
  for (const asset of assets) {
    const octets = await fs.readFile(path.join(SOURCE, `${asset}.jpg`));
    const empreinte = createHash("sha256").update(octets).update(TRAME_VERSION).update(JSON.stringify(REGLAGES)).digest("hex").slice(0, 16);
    const cible = path.join(SORTIE, `${asset}.webp`);
    if (manifeste[asset] === empreinte && await fs.access(cible).then(() => true, () => false)) { gardes++; continue; }
    const png = await tramer(octets, { ...FORMAT_PORTRAIT, cellule: REGLAGES.cellule, densite: REGLAGES.densite, nom: asset });
    if (!png) { echecs++; continue; }
    await fs.mkdir(path.dirname(cible), { recursive: true });
    await sharp(png).resize(REGLAGES.largeur, REGLAGES.hauteur, { kernel: "lanczos3" }).webp({ quality: REGLAGES.qualite }).toFile(cible);
    manifeste[asset] = empreinte;
    process.stdout.write(`\r  ${++faits} portrait(s) tramé(s)`);
  }
  await accessoires(sharp);
  await fs.mkdir(SORTIE, { recursive: true });
  await fs.writeFile(MANIFESTE, `${JSON.stringify(Object.fromEntries(Object.entries(manifeste).sort()), null, 2)}\n`);
  console.log(`\n  ${faits} fait(s), ${gardes} déjà à jour, ${echecs} échec(s) → ${path.relative(process.cwd(), SORTIE)}`);
  if (echecs) process.exitCode = 1;
}

const ACCESSOIRES = path.resolve(process.cwd(), "public/images/cartes");
const PARTIS = ["caq", "plq", "qs", "pq", "pcq"] as const;

async function accessoires(sharp: typeof import("sharp").default): Promise<void> {
  await fs.mkdir(ACCESSOIRES, { recursive: true });
  // Rognés à l'encre, puis ramenés à 720 px de large : sur la face (1071 px),
  // le plus grand logo en occupe 180 ; à l'échelle 2 d'un écran Retina, 720
  // suffit largement. Les originaux de 1 800 à 2 000 px pesaient 4 fois plus.
  const rogne = async (source: string, cible: string) => {
    await sharp(path.resolve(process.cwd(), source)).trim().resize({ width: 720, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true }).toFile(path.join(ACCESSOIRES, cible));
  };
  await rogne("public/images/brand/logo_capp_1row_bg-none_theme-black.png", "capp.png");
  await rogne("public/images/brand/logo_vitrinedemocratique_bg-none_theme-black.png", "vitrine.png");
  await rogne("public/images/partners/ULaval-N.png", "ulaval.png");
  for (const cle of PARTIS) {
    // Rogné au dessin, puis recentré dans un carré : c'est le dessin, et non
    // le fichier, qui devient la mesure (voir ecussonURI du générateur).
    const dessin = await sharp(path.resolve(process.cwd(), `public/logos/parties-black/${cle}.png`)).trim().toBuffer({ resolveWithObject: true });
    const cote = Math.max(dessin.info.width, dessin.info.height);
    await sharp({ create: { width: cote, height: cote, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: dessin.data, left: Math.round((cote - dessin.info.width) / 2), top: Math.round((cote - dessin.info.height) / 2) }])
      .png().toBuffer()
      // Ramené à 256 px APRÈS la composition (sharp redimensionne avant de
      // composer, et refuse une incrustation plus grande que le fond).
      .then((carre) => sharp(carre).resize(256, 256).png({ compressionLevel: 9, palette: true }).toFile(path.join(ACCESSOIRES, `ecusson-${cle}.png`)));
  }
  // AUTOGRAPHES des légendaires (scripts/social/donnees/signatures/<slug>.jpg,
  // encre sombre sur fond clair) → tracé BLANC sur fond transparent, ×3,
  // comme signatureURI du générateur.
  const dossierSignatures = path.resolve(process.cwd(), "scripts/social/donnees/signatures");
  const signatures = (await fs.readdir(dossierSignatures).catch(() => [] as string[])).filter((f) => f.endsWith(".jpg"));
  for (const f of signatures) {
    const octets = await fs.readFile(path.join(dossierSignatures, f));
    const { width = 0, height = 0 } = await sharp(octets).metadata();
    const [w, h] = [width * 3, height * 3];
    const alpha = await sharp(octets).resize(w, h, { kernel: "lanczos3" }).grayscale().negate()
      .linear(1.8, -60).blur(0.6).raw().toBuffer();
    await sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } })
      .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
      .png().toFile(path.join(ACCESSOIRES, `signature-${f.slice(0, -4)}.png`));
  }
  // Le monogramme du bas du verso (même rayon que LOGO_VERSO du gabarit).
  const mono = await monogrammePNG(10);
  if (mono) await sharp(mono).resize({ width: 240, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(path.join(ACCESSOIRES, "monogramme.png"));
  // LE GRAIN DU CARTON EN TEXTURE (site seulement) : les deux bruits des
  // cartes (piqué fin et mouchetures), calculés une fois en PNG à motif
  // raccordable. Sur le site, un filtre SVG feTurbulence est recalculé à
  // chaque image d'une animation ; une texture ne coûte rien.
  const bruit = (frequence: number, octaves: number, matrice: string, cote: number) => Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cote}" height="${cote}"><filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frequence}" numOctaves="${octaves}" stitchTiles="stitch"/><feColorMatrix values="${matrice}"/></filter><rect width="100%" height="100%" filter="url(#f)"/></svg>`);
  await sharp(bruit(0.9, 3, "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .2 .2 .2 0 -.08", 256)).webp({ quality: 80, alphaQuality: 80 }).toFile(path.join(ACCESSOIRES, "grain.webp"));
  await sharp(bruit(0.045, 4, "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .09 .09 .09 0 -.1", 512)).webp({ quality: 80, alphaQuality: 80 }).toFile(path.join(ACCESSOIRES, "mouchete.webp"));
  // Pour les FACES de carte, au corps du carton (1071 px) : mêmes réglages que
  // gabarit.ts, que le site réduit ensuite d'un facteur 0,27.
  await sharp(bruit(0.82, 4, "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14", 512)).webp({ quality: 80, alphaQuality: 80 }).toFile(path.join(ACCESSOIRES, "grain-carte.webp"));
  // Mouchetures : basse fréquence, donc tuile de 512 px affichée en 1 024
  // (taille de fond doublée côté site) — même aspect, quatre fois plus léger.
  await sharp(bruit(0.026, 4, "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42", 512)).webp({ quality: 80, alphaQuality: 80 }).toFile(path.join(ACCESSOIRES, "mouchete-carte.webp"));
  console.log(`  accessoires → ${path.relative(process.cwd(), ACCESSOIRES)} (3 logos, ${PARTIS.length} écussons, ${signatures.length} signature(s), 4 textures)`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
