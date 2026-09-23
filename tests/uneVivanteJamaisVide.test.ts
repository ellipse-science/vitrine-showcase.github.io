import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * L'ÉDITION VIVANTE NE PEUT PAS ÊTRE VIDE EN SILENCE.
 *
 * Nuit du 16 au 17 septembre 2026 : le build de prod a reçu des événements qui
 * sont tous tombés au filtre de saillance. `loadHeadlineEvents` rendait `null`,
 * les deux sections rendaient `null` à leur tour, et le site s'est déployé sans
 * la Une des Unes ni Deux solitudes — sans une seule erreur. La garde bruyante
 * prévue pour ce cas était placée APRÈS ce `return null` : inatteignable.
 *
 * Désormais, l'édition courante échoue bruyamment (un build Cloudflare qui
 * échoue garde en ligne la dernière édition complète), tandis qu'une ARCHIVE
 * garde le droit d'être vide. Même règle quand la source est illisible.
 */

vi.mock("@/lib/data/source", () => ({
  readDatasetText: vi.fn(async () => "[]"),
}));

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

describe("édition vivante sans événement", () => {
  it("échoue bruyamment plutôt que de publier une page amputée", async () => {
    const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
    await expect(loadHeadlineEvents()).rejects.toThrow(/édition courante/i);
  });

  it("laisse une archive vide rendre null, sans casser le build", async () => {
    const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
    await expect(loadHeadlineEvents("2026-09-16T23")).resolves.toBeNull();
  });
});

describe("source illisible", () => {
  // `repliFichier` ne transforme plus qu'un fichier ABSENT en jeu vide : une
  // erreur de permission ou d'E/S remonte jusqu'ici, et ne doit pas redevenir
  // une Une vide pour l'édition courante (relevé de Copilot, vitrine#818).
  async function sourceIllisible() {
    const source = await import("@/lib/data/source");
    vi.mocked(source.readDatasetText).mockRejectedValueOnce(
      Object.assign(new Error("EISDIR: illegal operation on a directory"), { code: "EISDIR" }),
    );
  }

  it("fait échouer l'édition courante au lieu de la rendre sans Une", async () => {
    await sourceIllisible();
    const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
    await expect(loadHeadlineEvents()).rejects.toThrow(/EISDIR/);
  });

  it("laisse une archive illisible rendre null", async () => {
    await sourceIllisible();
    const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
    await expect(loadHeadlineEvents("2026-09-16T23")).resolves.toBeNull();
  });
});
