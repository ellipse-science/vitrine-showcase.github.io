// Fausses pochettes, pour éprouver le bac du jour et la discothèque avant que
// le raffineur d'illustrations existe.
//
// POURQUOI CE SCRIPT. Les deux bacs ne se voient qu'avec des images, et les
// vraies viennent d'un circuit complet (raffineur -> OpenAI -> R2 -> API ->
// build). Sans lui, la seule façon d'éprouver la mise en page serait de payer
// des images et d'attendre trente jours pour remplir la discothèque. Même
// raison d'être que `scripts/make_parties_fixtures.mjs` pour les données.
//
// CE QU'IL PRODUIT. Un dégradé plat par parti, sans un mot dessus — les vraies
// pochettes ne portent pas de texte non plus (le prompt l'interdit), donc la
// mise en page est éprouvée dans les mêmes conditions. Aucune dépendance :
// l'encodeur PNG tient en trente lignes avec `node:zlib`.
//
// ⚠️ CES IMAGES SONT FAUSSES et le dossier est ignoré par git
// (`/public/data/generated-art/partis/`). `scripts/fetch_art.mjs` les efface au
// build suivant, en repartant d'un dossier propre. Aucun risque qu'une fausse
// pochette se retrouve en ligne — mais on ne juge JAMAIS d'un rendu d'image sur
// elles : ce sont des aplats, pas des illustrations.
//
// Usage :
//   node scripts/make_pochettes_fixtures.mjs           # 12 jours
//   node scripts/make_pochettes_fixtures.mjs 30        # 30 jours

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const JOURS = Math.max(1, Math.min(60, Number(process.argv[2]) || 12));
const RACINE = path.resolve(import.meta.dirname, "..", "public", "data", "generated-art", "partis");

// Mêmes couleurs et mêmes noms que lib/data/parties.ts. Recopiés plutôt
// qu'importés : ce script est du JS pur, hors du graphe TypeScript du site.
const PARTIS = [
  { key: "caq", sigle: "CAQ", nom: "Coalition avenir Québec", rgb: [58, 110, 152] },
  { key: "pq", sigle: "PQ", nom: "Parti québécois", rgb: [30, 58, 95] },
  { key: "qs", sigle: "QS", nom: "Québec solidaire", rgb: [184, 90, 44] },
  { key: "plq", sigle: "PLQ", nom: "Parti libéral du Québec", rgb: [155, 34, 55] },
  { key: "pcq", sigle: "PCQ", nom: "Parti conservateur du Québec", rgb: [70, 66, 62] },
];

const ENJEUX = [
  "Gouvernements et gouvernance",
  "Santé et politiques sociales",
  "Économie et travail",
  "Immigration",
  "Environnement et énergie",
];
const TONS = [
  { mot: "défavorable", pct: 28 },
  { mot: "neutre", pct: 50 },
  { mot: "favorable", pct: 71 },
];

/** Un PNG RGB sans transparence, encodé à la main.
 *
 *  Trois morceaux suffisent : IHDR (dimensions), IDAT (les pixels, chaque ligne
 *  précédée de son octet de filtre, le tout compressé par zlib) et IEND. Le
 *  CRC32 est celui du format, table calculée à la volée. */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filtre « none »
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }

  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // couleur vraie, sans alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Le jour ISO, `n` jours avant aujourd'hui. */
function jourIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Les vraies signatures du jour, lues sur le serveur de développement.
 *
 *  POURQUOI ON VA LES CHERCHER. Le bac du jour n'affiche une pochette que si sa
 *  signature correspond à ce que le module rend au même instant — c'est la garde
 *  d'appariement. Une signature inventée est donc systématiquement rejetée, et
 *  le bac du jour resterait en pochettes géométriques : on n'éprouverait que la
 *  moitié de la mise en page. Le contrat d'illustration porte exactement les
 *  bonnes signatures, alors on les recopie.
 *
 *  Sans serveur en marche, on continue sans : la discothèque, elle, ne passe
 *  par aucune garde (ses chiffres sont ceux de ses propres métadonnées). */
async function signaturesDuJour() {
  const base = process.env.VITRINE_DEV_BASE ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/data/partis-selection.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contrat = await res.json();
    const par = new Map();
    for (const p of contrat?.partis ?? []) par.set(p.key, p);
    if (par.size === 0) throw new Error("contrat vide");
    console.log(`[fixtures] signatures réelles lues sur ${base} (${par.size} partis)`);
    return par;
  } catch (err) {
    console.warn(
      `[fixtures] contrat d'illustration illisible (${err.message}) — le bac du JOUR restera ` +
        "en pochettes géométriques, la discothèque s'affichera normalement.",
    );
    return new Map();
  }
}

const reelles = await signaturesDuJour();

await rm(RACINE, { recursive: true, force: true });

let ecrits = 0;
for (let n = JOURS - 1; n >= 0; n--) {
  const jour = jourIso(n);
  const dossier = path.join(RACINE, jour);
  await mkdir(dossier, { recursive: true });

  // Un ordre qui bouge d'un jour à l'autre, pour que le tri par temps d'écoute
  // se voie : un bac où les cinq tranches gardent la même place ne prouverait
  // rien.
  const decale = [...PARTIS.slice(n % PARTIS.length), ...PARTIS.slice(0, n % PARTIS.length)];

  for (let i = 0; i < decale.length; i++) {
    const p = decale[i];
    const minutes = Math.round(1200 / (i + 1) - ((n * 37) % 90));
    const ton = TONS[(n + i) % TONS.length];
    const [r, g, b] = p.rgb;

    // Un aplat traversé d'une diagonale plus sombre : de quoi distinguer deux
    // pochettes voisines sans prétendre imiter une illustration.
    const image = png(256, 256, (x, y) => {
      const f = (x + y) / 512 > 0.55 ? 0.62 : 1;
      return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
    });
    await writeFile(path.join(dossier, `${p.key}.png`), image);

    const heures = Math.floor(minutes / 60);
    await writeFile(
      path.join(dossier, `${p.key}.json`),
      JSON.stringify(
        {
          generated_at: `${jour}T20:40Z`,
          jour,
          bloc: { hour: 20, label: "20h" },
          parti: p.key,
          sigle: p.sigle,
          nom: p.nom,
          rang: i + 1,
          minutes_une: minutes,
          temps_label: `${heures}h${String(minutes % 60).padStart(2, "0")}`,
          part_pct: Math.max(1, Math.round((minutes / 2800) * 100)),
          enjeu: ENJEUX[(n + i) % ENJEUX.length],
          ton: ton.mot,
          ton_pct: ton.pct,
          // Le jour courant reçoit la VRAIE signature quand on a pu la lire :
          // sans elle, la garde d'appariement écarte la pochette et le bac du
          // jour ne montre rien. Les jours d'archive n'en ont pas besoin.
          signature: (n === 0 ? reelles.get(p.key)?.signature : null) ?? `${p.key}|fixture|${ton.mot}`,
          fixture: true,
        },
        null,
        2,
      ),
    );
    ecrits += 2;
  }
}

console.log(`[fixtures] ${ecrits} fichiers écrits — ${JOURS} jour(s) × ${PARTIS.length} partis dans ${RACINE}`);
console.log("[fixtures] ⚠️ images FAUSSES : elles éprouvent la mise en page, pas le rendu des illustrations.");
