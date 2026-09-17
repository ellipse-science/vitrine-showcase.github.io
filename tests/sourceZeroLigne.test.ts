import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * UN JEU DE DONNÉES VIDE N'EST PAS UNE DONNÉE.
 *
 * Nuit du 16 au 17 septembre 2026 : la prod a servi une édition sans la Une
 * des Unes ni Deux solitudes. Les deux sections rendent `null` quand elles ne
 * reçoivent aucun événement, et c'est exactement ce qui s'est passé : la
 * source distante a renvoyé une liste VIDE, sans erreur. Le repli sur le
 * fichier publié ne se déclenchait qu'en cas d'ERREUR ou de péremption, et
 * l'instantané vérifiait le compte annoncé par le manifeste — zéro reçu pour
 * zéro annoncé passait la garde. Dev, qui lit les fichiers, affichait les deux
 * modules pendant ce temps.
 *
 * Le Worker applique déjà cette règle à l'écriture (`sync-athena.ts` : « 0
 * ligne reçue d'Athena alors que la table en comptait N »). Ces tests la
 * posent à la LECTURE, de l'autre côté de la couture.
 */

const BASE = "https://api.exemple.test";

function reponse(corps: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => corps,
    text: async () => (typeof corps === "string" ? corps : JSON.stringify(corps)),
  } as unknown as Response;
}

const FICHIER = "public/data/agora/agora_decideurs_qc.json";
const racines: string[] = [];

/** Un dépôt jetable : `tables.json`, et le fichier publié seulement si demandé.
 *  Le cache des copies locales (`.next/cache/vitrine-data`, relatif au dossier
 *  courant) y vit aussi : les tests n'effacent jamais celui du vrai dépôt. */
async function depotTemporaire(avecFichier: boolean): Promise<void> {
  const racine = await fs.mkdtemp(path.join(os.tmpdir(), "vitrine-source-"));
  racines.push(racine);
  await fs.mkdir(path.join(racine, "scripts"));
  await fs.copyFile(
    path.resolve("scripts", "tables.json"),
    path.join(racine, "scripts", "tables.json"),
  );
  if (avecFichier) {
    await fs.mkdir(path.dirname(path.join(racine, FICHIER)), { recursive: true });
    await fs.copyFile(path.resolve(FICHIER), path.join(racine, FICHIER));
  }
  vi.spyOn(process, "cwd").mockReturnValue(racine);
}

function instantaneVide() {
  vi.stubEnv("VITRINE_DATA_SOURCE", "snapshot");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("manifest.json")
        ? reponse({
            cycle: "test",
            generated_at: new Date().toISOString(),
            tables: { agora_decideurs_qc: { rows: 0, bytes: 2 } },
          })
        : reponse("[]"),
    ),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITRINE_API_BASE", BASE);
  vi.stubEnv("VITRINE_API_KEY", "clef-de-test");
  vi.stubEnv("VITRINE_SNAPSHOT_TOKEN", "jeton-de-test");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const racine of racines.splice(0)) {
    await fs.rm(racine, { recursive: true, force: true });
  }
});

describe("repli quand la source distante est vide", () => {
  it("instantané à zéro ligne : le build repart du fichier publié", async () => {
    await depotTemporaire(true);
    instantaneVide();

    const { readDatasetText } = await import("@/lib/data/source");
    const texte = await readDatasetText(FICHIER);

    expect(JSON.parse(texte).length).toBeGreaterThan(0);
  });

  it("API à zéro ligne : le build repart du fichier publié", async () => {
    await depotTemporaire(true);
    vi.stubEnv("VITRINE_DATA_SOURCE", "api");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/v1/health")
          ? reponse({ sync_state: [{ synced_at: new Date().toISOString() }] })
          : reponse({ rows: [] }),
      ),
    );

    const { readDatasetText } = await import("@/lib/data/source");
    const texte = await readDatasetText(FICHIER);

    expect(JSON.parse(texte).length).toBeGreaterThan(0);
  });

  it("sans fichier de repli, le build reçoit un jeu vide plutôt qu'une exception", async () => {
    // Toute table active a aujourd'hui son fichier publié : on simule le cas
    // d'une table activée avant son premier fichier.
    await depotTemporaire(false);
    instantaneVide();

    const { readDatasetText } = await import("@/lib/data/source");
    const texte = await readDatasetText(FICHIER);

    expect(JSON.parse(texte)).toEqual([]);
  });
});
