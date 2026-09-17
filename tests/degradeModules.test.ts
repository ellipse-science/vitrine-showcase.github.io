import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { fondAuDefilement, melange, type Repere } from "@/lib/degradeModules";
import { MODULES } from "@/lib/modules";

// Le dégradé au défilement doit survivre à une réorganisation des modules
// (Jules Piral, 2026-09-17).
const reperes: Repere[] = [
  { id: "a", centre: 500, fond: "#F3ECDD", accent: "#80602A" },
  { id: "b", centre: 1500, fond: "#EDE1CB", accent: "#8F3036" },
  { id: "c", centre: 2500, fond: "#DCC3B4", accent: "#2F4A8A" },
];

describe("fondAuDefilement", () => {
  it("mélange à parts égales au milieu de deux modules voisins", () => {
    expect(fondAuDefilement(reperes, 1000)?.fond).toBe(melange("#F3ECDD", "#EDE1CB", 0.5));
  });

  it("ne dépend pas de l'ordre de la liste, seulement des positions sur la page", () => {
    const melangee = [reperes[2], reperes[0], reperes[1]];
    for (const y of [0, 700, 1000, 1499, 1500, 2000, 2600]) {
      expect(fondAuDefilement(melangee, y)).toEqual(fondAuDefilement(reperes, y));
    }
  });

  it("suit un nouvel ordre sur la page : on mélange les VOISINS réels", () => {
    // « c » déplacé entre « a » et « b » : à mi-chemin a→c, pas de trace de b.
    const reordonnee = [{ ...reperes[0] }, { ...reperes[2], centre: 1000 }, { ...reperes[1], centre: 1500 }];
    expect(fondAuDefilement(reordonnee, 750)?.fond).toBe(melange("#F3ECDD", "#DCC3B4", 0.5));
  });

  it("garde la couleur du premier et du dernier module aux extrémités", () => {
    expect(fondAuDefilement(reperes, 0)?.fond).toBe("#F3ECDD");
    expect(fondAuDefilement(reperes, 9999)?.fond).toBe("#DCC3B4");
  });

  it("change l'accent des titres à mi-chemin, sans couleur intermédiaire", () => {
    expect(fondAuDefilement(reperes, 990)?.accent).toBe("#80602A");
    expect(fondAuDefilement(reperes, 1010)?.accent).toBe("#8F3036");
  });

  it("rend null sans module sur la page", () => {
    expect(fondAuDefilement([], 100)).toBeNull();
  });
});

describe("chaque module de lib/modules.ts a sa section sur la page", () => {
  it("un identifiant de section par module (app/page.tsx)", () => {
    const page = readFileSync(path.resolve(__dirname, "../app/page.tsx"), "utf8");
    for (const id of Object.keys(MODULES)) expect(page).toContain(`id="${id}"`);
  });
});
