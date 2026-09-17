import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITRINE_API_BASE", BASE);
  vi.stubEnv("VITRINE_API_KEY", "clef-de-test");
  vi.stubEnv("VITRINE_SNAPSHOT_TOKEN", "jeton-de-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("repli quand la source distante est vide", () => {
  it("instantané à zéro ligne : le build repart du fichier publié", async () => {
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

    const { readDatasetText } = await import("@/lib/data/source");
    const texte = await readDatasetText("public/data/agora/agora_decideurs_qc.json");

    expect(JSON.parse(texte).length).toBeGreaterThan(0);
  });

  it("API à zéro ligne : le build repart du fichier publié", async () => {
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
    const texte = await readDatasetText("public/data/agora/agora_decideurs_qc.json");

    expect(JSON.parse(texte).length).toBeGreaterThan(0);
  });

  it("sans fichier de repli, le build reçoit un jeu vide plutôt qu'une exception", async () => {
    vi.stubEnv("VITRINE_DATA_SOURCE", "snapshot");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("manifest.json")
          ? reponse({
              cycle: "test",
              generated_at: new Date().toISOString(),
              tables: { polimetre_promesses_neuves: { rows: 0, bytes: 2 } },
            })
          : reponse("[]"),
      ),
    );

    const { readDatasetText } = await import("@/lib/data/source");
    const texte = await readDatasetText(
      "public/data/refined/day/polimetre_promesses_neuves.json",
    );

    expect(JSON.parse(texte)).toEqual([]);
  });
});
