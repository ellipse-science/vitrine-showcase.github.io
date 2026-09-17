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
 * Désormais, l'édition courante échoue bruyamment (le job `secours-fichiers` de
 * deploy-prod.yml rebâtit alors en mode fichiers), tandis qu'une ARCHIVE garde
 * le droit d'être vide.
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
