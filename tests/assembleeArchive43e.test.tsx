import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";
import { loadAssemblee, loadArchiveAssemblee43e } from "@/lib/data/assemblee";

vi.mock("@/lib/data/source", () => ({
  readDatasetText: async (fichier: string) => fichier.endsWith("/agora_decideurs_qc.json")
    ? JSON.stringify(["last_pdq", "session", "legislature"].map((period_type) => ({
      period_type, period_start_date: "2026-12-01", period_end_date: "2026-12-01", party: "pq", n_interventions: 42,
    })))
    : "[]",
}));

it("garde une 43e figée quand Agora ne publie que les données de la 44e", async () => {
  const [courante, archive, edition] = await Promise.all([
    loadAssemblee(), loadArchiveAssemblee43e(), loadAssemblee("2026-08-27"),
  ]);
  expect(courante?.periods.last_pdq.lastUpdated).toContain("décembre 2026");
  expect(archive.periods.last_pdq.lastUpdated).toContain("12 juin 2026");
  expect(archive.periods.legislature.rows.flatMap((r) => r.deputies ?? []).length).toBeGreaterThan(100);
  expect(edition?.periods).toEqual(archive.periods);
  const html = renderToStaticMarkup(<AssembleeClient data={courante!} archive43e={{ data: archive }} />);
  expect(html).toContain("43e législature");
  expect(html).toMatch(/aria-selected="true"[^>]*aria-label="44e législature"/);
  expect(html).toContain("décembre 2026");
});
