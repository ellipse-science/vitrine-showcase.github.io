import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";
import { loadAssemblee, periodeParDefaut } from "@/lib/data/assemblee";

// Revue d'Adrien sur #1043 (lib/data/assemblee.ts) : si Agora fait encore
// commencer la ligne « législature » de la 44e le 2022-11-29 (bornage
// d'aws-refiners#654 pas encore en production), le filtre l'écarte, à raison,
// puisqu'elle mêle la 43e. L'onglet par défaut ne doit pas s'ouvrir vide pour autant.
vi.mock("@/lib/data/source", () => ({
  readDatasetText: async (fichier: string) => fichier.endsWith("/agora_decideurs_qc.json")
    ? JSON.stringify([
      { period_type: "last_pdq", period_start_date: "2026-12-01", period_end_date: "2026-12-01", party: "pq", n_interventions: 42 },
      { period_type: "session", period_start_date: "2026-12-01", period_end_date: "2026-12-01", party: "pq", n_interventions: 42 },
      { period_type: "legislature", period_start_date: "2022-11-29", period_end_date: "2026-12-01", party: "pq", n_interventions: 4200 },
    ])
    : "[]",
}));

it("ouvre sur une période non vide quand la législature d'Agora n'est pas bornée", async () => {
  const courante = await loadAssemblee();
  expect(courante?.periods.legislature.rows.every((r) => !r.interventions)).toBe(true);
  expect(periodeParDefaut(courante!)).toBe("session");
  const html = renderToStaticMarkup(<AssembleeClient data={courante!} />);
  const selectionnee = html.match(/aria-selected="true"[^>]*aria-label="([^"]+)"/g) ?? [];
  expect(selectionnee.join(" ")).toContain(courante!.periods.session.tabLabel);
});
