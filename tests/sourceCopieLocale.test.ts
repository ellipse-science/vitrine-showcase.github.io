import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * LA COPIE LOCALE D'UN BUILD NE S'EFFACE PAS SOUS LES PIEDS D'UN AUTRE PROCESSUS.
 *
 * 27 septembre 2026, édition de minuit : le build de prod chevauchait la
 * synchro du Worker, `/v1/health` changeait pendant le build, et deux workers
 * de `next build` ont calculé deux clés de cycle. Le second a effacé le
 * dossier du premier ; la lecture a échoué ; `loadHeadlineEvents` a répondu
 * « rien » ; la prod a publié un accueil sans Une des Unes ni Deux solitudes
 * et des pages d'édition en 404, données complètes des deux côtés. Ces tests
 * posent les deux règles qui l'empêchent : un dossier récent n'est jamais
 * effacé, et une copie disparue est retéléchargée.
 */

const FICHIER = "public/data/agora/agora_decideurs_qc.json";
const CACHE = path.join(".next", "cache", "vitrine-data");
const racines: string[] = [];

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

async function depotTemporaire(): Promise<string> {
  const racine = await fs.mkdtemp(path.join(os.tmpdir(), "vitrine-copie-"));
  racines.push(racine);
  await fs.mkdir(path.join(racine, "scripts"));
  await fs.copyFile(path.resolve("scripts", "tables.json"), path.join(racine, "scripts", "tables.json"));
  await fs.mkdir(path.dirname(path.join(racine, FICHIER)), { recursive: true });
  await fs.copyFile(path.resolve(FICHIER), path.join(racine, FICHIER));
  vi.spyOn(process, "cwd").mockReturnValue(racine);
  return racine;
}

/** API vivante : une synchro fraîche, et un jeu d'une ligne. Compte les
 *  téléchargements de jeux pour prouver un retéléchargement. */
function apiVivante(): { telechargements: () => number } {
  let n = 0;
  vi.stubEnv("VITRINE_DATA_SOURCE", "api");
  vi.stubEnv("VITRINE_API_KEY", "cle-de-test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/v1/health")) {
        return reponse({ sync_state: [{ synced_at: new Date().toISOString() }] });
      }
      n += 1;
      return reponse({ rows: [{ party: "test" }] });
    }),
  );
  return { telechargements: () => n };
}

async function dossierDeCycle(racine: string, nom: string, ageMs: number): Promise<string> {
  const dossier = path.join(racine, CACHE, nom);
  await fs.mkdir(dossier, { recursive: true });
  await fs.writeFile(path.join(dossier, "autre_jeu.json"), "[1]");
  const t = new Date(Date.now() - ageMs);
  await fs.utimes(dossier, t, t);
  return dossier;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const racine of racines.splice(0)) {
    await fs.rm(racine, { recursive: true, force: true });
  }
});

describe("copie locale par jeu de données", () => {
  it("un dossier de cycle récent, donc peut-être vivant, n'est pas effacé ; un vieux l'est", async () => {
    const racine = await depotTemporaire();
    const recent = await dossierDeCycle(racine, "api-voisin-du-meme-build", 2 * 60 * 1000);
    const ancien = await dossierDeCycle(racine, "api-build-d-hier", 3 * 60 * 60 * 1000);
    apiVivante();
    const { readDatasetText } = await import("@/lib/data/source");
    expect(JSON.parse(await readDatasetText(FICHIER))).toHaveLength(1);
    await expect(fs.stat(recent)).resolves.toBeTruthy();
    await expect(fs.stat(ancien)).rejects.toThrow();
  });

  it("une copie locale disparue en cours de build est retéléchargée, pas remplacée par « rien »", async () => {
    const racine = await depotTemporaire();
    const { telechargements } = apiVivante();
    const { readDatasetText } = await import("@/lib/data/source");
    expect(JSON.parse(await readDatasetText(FICHIER))).toHaveLength(1);
    expect(telechargements()).toBe(1);
    // Un autre processus fait le ménage : le dossier de ce build disparaît.
    await fs.rm(path.join(racine, CACHE), { recursive: true, force: true });
    expect(JSON.parse(await readDatasetText(FICHIER))).toHaveLength(1);
    expect(telechargements()).toBe(2);
  });
});
