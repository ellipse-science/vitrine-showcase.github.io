import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PolimetrePlusClient } from "@/components/interactive/PolimetrePlusClient";
import type { PolimetreData } from "@/lib/data/polimetre-meta";

// La série CAQ 2022 est figée (freeze_at dans scripts/tables.json) : le module
// doit le dire, avec la date du dernier instantané reçu — jamais une date codée
// en dur — et ne parler du jour des élections que si c'est bien ce jour-là.

const donnees = (weekEndDate: string): PolimetreData => ({
  weekEndDate,
  lastUpdated: "Dernière mise à jour : —",
  ranges: { week: [], month: [] },
});

describe("Polimètre+ CAQ 2022 figé", () => {
  it("annonce l'arrêt des mises à jour au jour des élections", () => {
    const html = renderToStaticMarkup(<PolimetrePlusClient data={donnees("2026-10-05")} />);
    expect(html).toContain("plus mis à jour depuis le 5 octobre 2026");
    expect(html).toContain("jour des élections générales");
  });

  it("prend la date dans les données, sans invoquer l'élection à tort", () => {
    const html = renderToStaticMarkup(<PolimetrePlusClient data={donnees("2026-09-20")} />);
    expect(html).toContain("plus mis à jour depuis le 20 septembre 2026");
    expect(html).not.toContain("jour des élections générales");
  });
});
