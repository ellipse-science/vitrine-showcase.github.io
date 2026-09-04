// L'illustration de la Une, FAITE AU BUILD (2026-09-04, issue #723).
//
// POURQUOI. Jusqu'ici l'image était produite APRÈS la mise en ligne : le
// raffineur vitrine-art (AWS) lisait la Une sur le site déployé, dessinait,
// déposait l'image et demandait un SECOND build. Deux builds par édition, et
// entre les deux pas d'image. Quand la file de Cloudflare Pages s'allonge, le
// tir du raffineur lit encore l'ancienne Une, ne produit rien, et la nouvelle
// reste sans illustration jusqu'à l'édition suivante : de 1h20 à 5h par jour
// sans image du 29 août au 3 septembre. Ici le build connaît la Une AVANT de
// rendre la page : il demande l'image de cette histoire, la fait s'il le faut,
// et part en ligne avec elle. Un seul build, aucune course.
//
// DANS L'ORDRE, après scripts/fetch_art.mjs (qui a rapatrié latest.* et les
// pochettes comme avant) :
//   1. la Une, par le MÊME code que le rendu (selectHeroFromRawEvents) et la
//      même source de données que le build (readDatasetText) — jamais une
//      seconde implémentation (issue #259) ;
//   2. l'image de cette histoire existe en R2 (`une/<clé>.*`) → on la prend.
//      Dev, prod et aperçus partagent ce cache : une histoire, une image ;
//   3. sinon, là où c'est permis (clé OpenAI posée ET branche develop/main,
//      cf. generationAllowed) : vingt références de l'artiste maison lues sur
//      l'API, le prompt du raffineur, gpt-4o + image_generation, WebP et AVIF
//      par sharp, dépôt en R2 sous la clé ET sous latest.* — pour le raffineur,
//      qui trouvera l'image « déjà à jour », et pour la carte de partage ;
//   4. tout échec laisse en place ce que fetch_art a rapatrié, et la garde
//      d'appariement de UneDesUnesSection décide, comme avant. Ce script ne
//      fait JAMAIS échouer un build : une image manquante est un manque, un
//      site non publié serait une panne.

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseEvents, selectHeroFromRawEvents, type HeroSelection, type RawEvent } from "@/lib/data/headlineEvents";
import { readDatasetText } from "@/lib/data/source";

import {
  ART_LOCAL_FILES,
  buildContextDigest,
  buildMetadata,
  buildPrompt,
  buildResponsesRequest,
  extractImageB64,
  generationAllowed,
  selectReferenceNames,
  uneKey,
  type ArtFile,
} from "./art_logic";

const API_BASE = process.env.VITRINE_API_BASE ?? "https://api.vitrinedemocratique.com";
const API_KEY = process.env.VITRINE_API_KEY ?? "";
const OPENAI_URL = process.env.OPENAI_RESPONSES_URL ?? "https://api.openai.com/v1/responses";
const OUT_DIR = path.resolve(process.cwd(), "public", "data", "generated-art");
/** Un agent nommé : le WAF de la zone refuse les agents anonymes (vitrine#705). */
const USER_AGENT = "vitrine-build-art/1.0";

const EXTENSIONS = ["png", "webp", "avif", "json"] as const;
type Ext = (typeof EXTENSIONS)[number];
const CONTENT_TYPES: Record<Ext, string> = {
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  json: "application/json; charset=utf-8",
};

type Files = Map<ArtFile, Buffer>;

const log = (m: string) => console.log(`[ensure_art] ${m}`);
const warn = (m: string) => console.warn(`[ensure_art] ${m}`);

function api(pathname: string, init: { method?: string; body?: Buffer; contentType?: string; timeoutMs?: number } = {}) {
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    "cache-control": "no-cache",
    authorization: `Bearer ${API_KEY}`,
  };
  if (init.contentType) headers["content-type"] = init.contentType;
  if (init.body) headers["content-length"] = String(init.body.length);
  return fetch(`${API_BASE}/v1/art/${pathname}`, {
    method: init.method ?? "GET",
    headers,
    // Copie dans un Uint8Array « propre » : les typages de fetch n'acceptent
    // pas un Buffer tel quel, et ces corps font au plus 1,6 Mo.
    body: init.body ? new Uint8Array(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
  });
}

/** L'image de cette histoire, si le bucket l'a déjà : les métadonnées sont
 *  obligatoires (elles portent la clé d'appariement), chaque format d'image
 *  est best-effort — comme dans fetch_art.mjs. */
async function fetchUne(key: string): Promise<Files | null> {
  const meta = await api(`une/${key}.json`);
  if (meta.status === 404) return null;
  if (!meta.ok) throw new Error(`GET une/${key}.json : HTTP ${meta.status}`);
  const files: Files = new Map();
  files.set("latest.json", Buffer.from(await meta.arrayBuffer()));
  JSON.parse(files.get("latest.json")!.toString("utf8"));
  for (const ext of ["png", "webp", "avif"] as const) {
    const res = await api(`une/${key}.${ext}`);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`GET une/${key}.${ext} : HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 0) files.set(`latest.${ext}`, bytes);
  }
  if (!files.has("latest.png")) throw new Error(`une/${key}.png absent alors que le JSON existe`);
  return files;
}

async function fetchReferences(mainIssue: string): Promise<string[]> {
  const res = await api("references/index.json");
  if (!res.ok) throw new Error(`GET references/index.json : HTTP ${res.status}`);
  const index = (await res.json()) as { references?: unknown };
  const names = Array.isArray(index.references) ? index.references.filter((n): n is string => typeof n === "string") : [];
  if (names.length === 0) throw new Error("aucune image de référence dans le bucket");
  const chosen = selectReferenceNames(names, mainIssue);
  const b64s = await Promise.all(
    chosen.map(async (name) => {
      const r = await api(`references/${name}.jpg`);
      if (!r.ok) throw new Error(`GET references/${name}.jpg : HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer()).toString("base64");
    }),
  );
  log(`références : ${b64s.length} (${chosen.filter((n) => n.startsWith(mainIssue)).length} du sujet)`);
  return b64s;
}

async function generateImage(prompt: string, referenceB64s: string[]): Promise<Buffer> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildResponsesRequest(prompt, referenceB64s)),
    // La génération prend de 30 s à 2 min ; au-delà de 4 min on abandonne et le
    // build repart sans image, comme un raffineur qui aurait raté son cycle.
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`OpenAI : HTTP ${res.status} ${detail}`);
  }
  const b64 = extractImageB64(await res.json());
  if (!b64) throw new Error("OpenAI : aucune image dans la réponse");
  return Buffer.from(b64, "base64");
}

/** WebP et AVIF par sharp (mêmes réglages que le raffineur : WebP qualité 82,
 *  effort 6 ; AVIF qualité 55). sharp est une dépendance optionnelle de Next :
 *  s'il manque, on garde le PNG seul — UneDesUnesSection ne déclare que les
 *  formats présents sur disque. */
async function webFormats(png: Buffer): Promise<Partial<Record<"latest.webp" | "latest.avif", Buffer>>> {
  const out: Partial<Record<"latest.webp" | "latest.avif", Buffer>> = {};
  let sharp: (typeof import("sharp"))["default"];
  try {
    sharp = (await import("sharp")).default;
  } catch (err) {
    warn(`sharp indisponible (${(err as Error).message}) — PNG seul`);
    return out;
  }
  try {
    out["latest.webp"] = await sharp(png).webp({ quality: 82, effort: 6 }).toBuffer();
  } catch (err) {
    warn(`WebP non produit (${(err as Error).message})`);
  }
  try {
    out["latest.avif"] = await sharp(png).avif({ quality: 55 }).toBuffer();
  } catch (err) {
    warn(`AVIF non produit (${(err as Error).message})`);
  }
  return out;
}

/** Dépôt en R2 : sous la clé d'histoire, puis sous latest.* ; les images
 *  d'abord, le JSON EN DERNIER — tant qu'il n'est pas remplacé, personne
 *  n'apparie la nouvelle image aux anciennes métadonnées. */
async function upload(key: string, files: Files): Promise<void> {
  for (const prefix of [`une/${key}`, "latest"]) {
    for (const ext of EXTENSIONS) {
      const bytes = files.get(`latest.${ext}`);
      if (!bytes) continue;
      const res = await api(`${prefix}.${ext}`, { method: "PUT", body: bytes, contentType: CONTENT_TYPES[ext], timeoutMs: 120_000 });
      if (!res.ok) throw new Error(`PUT ${prefix}.${ext} : HTTP ${res.status}`);
    }
  }
  log(`déposé en R2 sous une/${key}.* et latest.*`);
}

/** Écrit les fichiers du build ; ce qui n'a pas été produit est RETIRÉ, sinon
 *  un WebP d'une autre Une, laissé par fetch_art, serait servi à côté du bon
 *  PNG — précisément ce que la garde d'appariement existe à empêcher. */
async function writeLocal(files: Files): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  for (const name of ART_LOCAL_FILES) {
    const target = path.join(OUT_DIR, name);
    const bytes = files.get(name);
    if (bytes) await writeFile(target, bytes);
    else await rm(target, { force: true });
  }
}

function findRepresentative(events: RawEvent[], hero: HeroSelection): RawEvent | undefined {
  return (
    events.find(
      (e) => e.event_id === hero.event_id && e.date_utc === hero.date_utc && e.time_interval_utc === hero.time_interval_utc,
    ) ?? events.find((e) => e.event_id === hero.event_id)
  );
}

async function main(): Promise<void> {
  if (!API_KEY) {
    log("pas de clé d'API : on garde ce que fetch_art a rapatrié");
    return;
  }

  const events = parseEvents(await readDatasetText("public/data/headline-events.json"));
  const hero = selectHeroFromRawEvents(events);
  if (!hero) {
    log("aucune Une désignée : rien à illustrer");
    return;
  }
  const key = uneKey(hero);
  if (!key) {
    warn(`clé de Une inutilisable (${hero.storyline_id ?? hero.event_id}) : on garde latest.* de fetch_art`);
    return;
  }
  log(`Une : « ${hero.title ?? ""} » (clé ${key})`);

  const cached = await fetchUne(key);
  if (cached) {
    await writeLocal(cached);
    log(`illustration reprise du cache par histoire (${[...cached.keys()].join(", ")})`);
    return;
  }

  const gate = generationAllowed(process.env);
  if (!gate.allowed) {
    log(`pas d'image pour cette histoire et pas de génération ici (${gate.reason}) : on garde latest.* de fetch_art`);
    return;
  }

  const rep = findRepresentative(events, hero);
  const mainIssue = hero.main_issue ?? rep?.main_issue ?? "governments_and_governance";
  const mainIssueTextFr = rep?.main_issue_text_fr ?? mainIssue;
  const { digest, outlets } = buildContextDigest(rep?.articles ?? null);
  const prompt = buildPrompt(hero.title ?? "", mainIssueTextFr, digest);
  log(`génération (${gate.reason}) — enjeu : ${mainIssueTextFr} ; rédactions du digest : ${outlets.join(", ") || "(aucune)"}`);

  const started = Date.now();
  const references = await fetchReferences(mainIssue);
  const png = await generateImage(prompt, references);
  const files: Files = new Map([["latest.png", png]]);
  for (const [name, bytes] of Object.entries(await webFormats(png))) {
    if (bytes) files.set(name as ArtFile, bytes);
  }
  files.set(
    "latest.json",
    Buffer.from(JSON.stringify(buildMetadata(hero, mainIssue, mainIssueTextFr, outlets, new Date()), null, 2)),
  );
  log(`image générée en ${Math.round((Date.now() - started) / 1000)} s (${Math.round(png.length / 1024)} Ko PNG)`);

  await upload(key, files);
  await writeLocal(files);
}

main().catch((err: unknown) => {
  warn(`échec (${err instanceof Error ? err.message : String(err)}) : on garde latest.* de fetch_art`);
});
