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

/* ───────────────────────────────────────────────────────────────────────────
   LES POCHETTES DES PARTIS — bac du jour et discothèque.

   Même circuit que l'illustration de la Une : un raffineur les engendre, le
   build les rapatrie, le visiteur ne lit que des fichiers plats.

   DEUX ARBITRAGES DE POIDS, parce que l'archive grossit de cinq pochettes par
   jour et qu'un build de Cloudflare Pages repart d'une copie neuve :

   1. HORIZON DE 30 JOURS (arbitrage du 2026-08-30). Au-delà, les pochettes
      restent dans R2 mais ne sont plus servies. Sans borne, chaque build
      téléchargerait des centaines de mégaoctets un an plus tard.
   2. UN SEUL FORMAT POUR L'ARCHIVE. Le jour courant reçoit ses quatre fichiers
      (métadonnées + trois formats, comme la Une) ; les jours passés n'ont que
      le WebP, avec repli PNG.

      CHIFFRES MESURÉS sur cinq pochettes réellement engendrées le 2026-08-30 :
      1802 Ko le PNG, 106 Ko le WebP, 60 Ko l'AVIF. Quatre formats sur 30 jours
      feraient donc 600 requêtes et 288 Mo par build, pour des images qu'on ne
      voit qu'au survol. Tel qu'implanté : 25 Mo. (Une estimation antérieure
      disait 120 Mo — elle sous-évaluait le poids du PNG.)
   ─────────────────────────────────────────────────────────────────────────── */

const POCHETTES_DIR = path.join(OUT_DIR, "partis");
const HORIZON_JOURS = 30;

/** Un fichier de pochette. Rend le nom écrit, ou null. Même politique que
 *  `fetchOne` : un échec retire le fichier local plutôt que de laisser un
 *  reliquat périmé, qu'une garde d'appariement devrait ensuite rattraper. */
async function fetchPochette(jour, parti, ext) {
  const rel = `partis/${jour}/${parti}.${ext}`;
  const target = path.join(OUT_DIR, "partis", jour, `${parti}.${ext}`);
  try {
    const res = await fetch(`${API_BASE}/v1/art/${rel}`, {
      headers: {
        "cache-control": "no-cache",
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error("réponse vide");
    if (ext === "json") JSON.parse(bytes.toString("utf8"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return rel;
  } catch {
    await rm(target, { force: true });
    return null;
  }
}

/** Un JSON de l'API, ou null. Les échecs sont normaux ici (circuit pas encore
 *  déployé, API muette, clé absente) et ne doivent jamais casser un build. */
async function fetchJson(chemin, quoi) {
  try {
    const res = await fetch(`${API_BASE}/v1/art/${chemin}`, {
      headers: {
        "cache-control": "no-cache",
        ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[fetch_art] ${quoi} indisponible (${err.message})`);
    return null;
  }
}

async function fetchPochettes() {
  // DEUX INVENTAIRES, ET C'EST VOULU.
  //
  // `jours=0` liste TOUT le fonds : ce qui existe vraiment dans R2, jusqu'à la
  // première pochette jamais rangée. C'est la SOURCE DE VÉRITÉ, et c'est ce que
  // la page du fonds parcourt. Une requête, quelle que soit la taille du fonds.
  //
  // Le registre (`partis/fonds.json`) porte les CHIFFRES de ces pochettes —
  // temps en Une, enjeu, ton — que la page affiche sans avoir à rapatrier cinq
  // fichiers de métadonnées par journée archivée (1825 requêtes par build au
  // bout d'un an). C'est un index dérivé, écrit par le raffineur : il peut être
  // en retard sur le listage, jamais l'inverse. La page réconcilie les deux.
  const index = await fetchJson("partis/index.json?jours=0", "inventaire des pochettes");
  if (!index) {
    await rm(POCHETTES_DIR, { recursive: true, force: true });
    console.warn("[fetch_art] bacs vides");
    return;
  }
  const registre = await fetchJson("partis/fonds.json", "registre du fonds");

  const jours = Object.entries(index?.jours ?? {});
  if (jours.length === 0) {
    console.warn("[fetch_art] aucune pochette publiée — bacs vides");
    await rm(POCHETTES_DIR, { recursive: true, force: true });
    return;
  }

  // On repart d'un dossier propre : une pochette sortie de l'horizon doit
  // disparaître du livrable, pas y survivre parce qu'elle y était hier.
  await rm(POCHETTES_DIR, { recursive: true, force: true });
  await mkdir(POCHETTES_DIR, { recursive: true });

  // L'INVENTAIRE, écrit sur le disque du build : la liste de TOUT le fonds, plus
  // les chiffres que le registre en connaît. C'est ce que lit la page du fonds
  // (lib/data/pochettes.ts), et il tient en quelques dizaines de kilo-octets là
  // où les images font des mégaoctets.
  await writeFile(
    path.join(POCHETTES_DIR, "inventaire.json"),
    JSON.stringify({ jours: index.jours ?? {}, registre: registre?.jours ?? null }),
  );

  // Le jour le plus récent EST le bac du jour ; les autres, la discothèque.
  const jourCourant = jours.map(([j]) => j).sort().at(-1);

  // L'HORIZON D'IMAGES est plus court que l'inventaire : on ne rapatrie les
  // fichiers que des 30 derniers jours (cf. l'en-tête). Le reste est inventorié,
  // pas servi.
  const horizon = new Date(Date.now() - HORIZON_JOURS * 86400000).toISOString().slice(0, 10);
  const aRapatrier = jours.filter(([jour]) => jour >= horizon);
  if (aRapatrier.length < jours.length) {
    console.log(
      `[fetch_art] fonds : ${jours.length} jour(s) inventoriés, ${aRapatrier.length} servi(s) (horizon ${HORIZON_JOURS} j)`,
    );
  }

  const taches = [];
  for (const [jour, partis] of aRapatrier) {
    for (const parti of partis) taches.push({ jour, parti });
  }

  let ecrits = 0;
  for (const { jour, parti } of taches) {
    if (jour === jourCourant) {
      // Le jour courant : les quatre fichiers, chaque format best-effort comme
      // pour la Une.
      const rs = await Promise.all(
        ["json", "png", "webp", "avif"].map((ext) => fetchPochette(jour, parti, ext)),
      );
      ecrits += rs.filter(Boolean).length;
      continue;
    }
    // L'archive : les métadonnées, puis LE PREMIER format qui répond. WebP
    // d'abord (le plus léger), PNG en repli — le raffineur écrit les formats
    // web en best-effort, l'un des deux peut manquer.
    const meta = await fetchPochette(jour, parti, "json");
    if (meta) ecrits += 1;
    for (const ext of ["webp", "png"]) {
      if (await fetchPochette(jour, parti, ext)) {
        ecrits += 1;
        break;
      }
    }
  }
  console.log(`[fetch_art] pochettes : ${ecrits} fichiers sur ${jours.length} jour(s), bac du jour ${jourCourant}`);
}

await fetchPochettes();
