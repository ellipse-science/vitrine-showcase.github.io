#!/usr/bin/env node
/**
 * Fond de carte des 127 circonscriptions provinciales (carte électorale 2026)
 * pour le module « Les candidats sur les réseaux ».
 *
 * Donnée de RÉFÉRENCE, statique : régénérée à la main quand la carte
 * électorale change, jamais au build. Voir docs/reference/donnees-de-reference.md.
 *
 * Source : Élections Québec, « Carte électorale (GeoJSON) »,
 *   https://donnees.electionsquebec.qc.ca/autres/provincial/circonscriptions_electorales_sans_eau_2026.json
 * Licence d'utilisation des données ouvertes du directeur général des
 * élections (https://www.dgeq.org/licence.html) : mention de la source
 * obligatoire, reprise dans le module.
 * Régions administratives : Élections Québec, « Municipalités et entités
 * administratives » (Excel), onglet Circ_vs_RA, joint par le code de
 * circonscription (CO_CEP = CODE_CIRC). Une circonscription à cheval sur
 * deux régions les porte toutes les deux.
 *
 * Étapes :
 *   1. mapshaper (npx, aucune dépendance ajoutée) : projection Québec Lambert
 *      (EPSG:32198), îlots de moins de 2 km² retirés, simplification
 *      topologique à pas variable (50 m en ville, 250 m en région, 1,2 km dans
 *      le Nord) : les frontières communes restent communes ;
 *   2. ici : coordonnées en hectomètres entiers, y inversé, chemins SVG
 *      relatifs ; cadres des encarts Montréal et Québec.
 *
 * Usage : node scripts/reference/carte_circonscriptions.mjs [geojson-source] [xlsx-regions]
 */
import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SOURCE =
  "https://donnees.electionsquebec.qc.ca/autres/provincial/circonscriptions_electorales_sans_eau_2026.json";
const REGIONS = "https://docs.electionsquebec.qc.ca/ORG/6109a347f2284/mun_et_ent_admin.xlsx";
const SORTIE = "lib/geo/circonscriptions-2026.json";
const UNITE = 100; // mètres par unité SVG

const tmp = mkdtempSync(path.join(tmpdir(), "circos-"));
let entree = process.argv[2];
if (!entree) {
  entree = path.join(tmp, "source.json");
  const rep = await fetch(SOURCE);
  if (!rep.ok) throw new Error(`Téléchargement impossible (${rep.status}) : ${SOURCE}`);
  writeFileSync(entree, Buffer.from(await rep.arrayBuffer()));
}

// ── Régions : lecture minimale d'un .xlsx (zip + XML), sans dépendance ────────
function dezippe(zip) {
  const fichiers = new Map();
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(fin + 16);
  for (let n = zip.readUInt16LE(fin + 10); n > 0; n--) {
    const [methode, taille, lnom, lextra, lcom, local] = [
      zip.readUInt16LE(p + 10), zip.readUInt32LE(p + 20), zip.readUInt16LE(p + 28),
      zip.readUInt16LE(p + 30), zip.readUInt16LE(p + 32), zip.readUInt32LE(p + 42),
    ];
    const nom = zip.toString("utf8", p + 46, p + 46 + lnom);
    const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const brut = zip.subarray(debut, debut + taille);
    fichiers.set(nom, (methode === 8 ? inflateRawSync(brut) : brut).toString("utf8"));
    p += 46 + lnom + lextra + lcom;
  }
  return fichiers;
}
const xml = (t) =>
  t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function regionsParCode(xlsx) {
  const f = dezippe(xlsx);
  const partages = [...f.get("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xml([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const rid = f.get("xl/workbook.xml").match(/<sheet [^>]*name="Circ_vs_RA"[^>]*r:id="([^"]+)"/)[1];
  const cible = f.get("xl/_rels/workbook.xml.rels").match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`));
  const feuille = f.get(`xl/${(cible[1] ?? cible[2]).replace(/^\/?xl\//, "")}`);
  const out = new Map();
  for (const [, ligne] of feuille.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cellules = {};
    for (const [, ref, attrs, v] of ligne.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<f>[^<]*<\/f>)?<v>([^<]*)<\/v>/g))
      cellules[ref] = /t="s"/.test(attrs) ? partages[Number(v)] : xml(v);
    const code = Number(cellules.A);
    if (!Number.isInteger(code) || !cellules.D) continue;
    if (!out.has(code)) out.set(code, []);
    // Le fichier écrit « Saguenay--Lac-Saint-Jean » : le nom officiel porte un demi-cadratin.
    const region = cellules.D.replace(/--/g, "\u2013");
    if (!out.get(code).includes(region)) out.get(code).push(region);
  }
  return out;
}
const xlsx = process.argv[3]
  ? readFileSync(process.argv[3])
  : Buffer.from(await (await fetch(REGIONS)).arrayBuffer());
const regions = regionsParCode(xlsx);

const simplifie = path.join(tmp, "simplifie.json");
execFileSync(
  "npx",
  [
    "--yes", "mapshaper@0.7", entree,
    "-proj", "EPSG:32198",
    "-filter-islands", "min-area=2km2",
    "-simplify", "variable", "interval=this.area < 3e8 ? 50 : (this.area < 5e9 ? 250 : 1200)", "keep-shapes",
    "-o", "format=geojson", "precision=1", simplifie,
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);

const geo = JSON.parse(readFileSync(simplifie, "utf8"));

// Québec Lambert (EPSG:32198, GRS80) : pour placer les encarts en lon/lat.
function lambert(lon, lat) {
  const a = 6378137, f = 1 / 298.257222101, e = Math.sqrt(2 * f - f * f);
  const rad = Math.PI / 180;
  const m = (p) => Math.cos(p) / Math.sqrt(1 - (e * Math.sin(p)) ** 2);
  const t = (p) => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const [p1, p2, p0, l0] = [60 * rad, 46 * rad, 44 * rad, -68.5 * rad];
  const n = Math.log(m(p1) / m(p2)) / Math.log(t(p1) / t(p2));
  const F = m(p1) / (n * t(p1) ** n);
  const r = (p) => a * F * t(p) ** n;
  const th = n * (lon * rad - l0);
  return [r(lat * rad) * Math.sin(th), r(p0) - r(lat * rad) * Math.cos(th)];
}

const anneaux = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates).flat();
let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
for (const f of geo.features)
  for (const a of anneaux(f.geometry))
    for (const [x, y] of a) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
const px = (x) => Math.round((x - x0) / UNITE);
const py = (y) => Math.round((y1 - y) / UNITE);

function chemin(g) {
  let d = "";
  for (const a of anneaux(g)) {
    const pts = [];
    for (const [x, y] of a) {
      const p = [px(x), py(y)];
      const q = pts.at(-1);
      if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p);
    }
    if (pts.length < 3) continue;
    d += `M${pts[0][0]} ${pts[0][1]}`;
    let l = "";
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      l += `${l && dx >= 0 ? " " : ""}${dx}${dy < 0 ? "" : " "}${dy}`;
    }
    d += `l${l}z`;
  }
  return d;
}

function cadre(lonMin, latMin, lonMax, latMax) {
  const coins = [lambert(lonMin, latMin), lambert(lonMax, latMax), lambert(lonMin, latMax), lambert(lonMax, latMin)];
  const xs = coins.map((c) => px(c[0])), ys = coins.map((c) => py(c[1]));
  const [gx, gy] = [Math.min(...xs), Math.min(...ys)];
  return [gx, gy, Math.max(...xs) - gx, Math.max(...ys) - gy];
}

const circonscriptions = geo.features
  .map((f) => {
    const region = regions.get(f.properties.CO_CEP);
    if (!region) throw new Error(`Région introuvable pour ${f.properties.NM_CEP} (${f.properties.CO_CEP})`);
    return { code: f.properties.CO_CEP, nom: f.properties.NM_CEP, region: region.join(" / "), d: chemin(f.geometry) };
  })
  .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

const sortie = {
  source: "Élections Québec, carte électorale 2026 (GeoJSON, sans étendues d'eau)",
  url: SOURCE,
  licence: "https://www.dgeq.org/licence.html",
  unite_m: UNITE,
  vue: [0, 0, px(x1), py(y0)],
  encarts: {
    montreal: cadre(-74.25, 45.25, -73.15, 45.9),
    quebec: cadre(-71.6, 46.66, -70.95, 47.0),
  },
  circonscriptions,
};
writeFileSync(SORTIE, `${JSON.stringify(sortie)}\n`);
console.log(`${circonscriptions.length} circonscriptions -> ${SORTIE} (${(JSON.stringify(sortie).length / 1024).toFixed(0)} Ko)`);
