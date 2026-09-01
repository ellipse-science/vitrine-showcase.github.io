import { describe, expect, it } from "vitest";

import { loadTreemap } from "@/lib/data/headlineEvents";
import { getShareModuleContent } from "@/lib/shareModules";

// La page Méthodologie ANNONCE que les douze parts totalisent 100 %. Rien ne le
// garantissait : c'est une somme calculée sur des données qui changent toutes
// les 4 h. Ces tests lisent les données publiées du dépôt, pas des fixtures, et
// vérifient l'invariant sur les trois périodes.
describe("part de l'attention (module « Les 12 enjeux de la campagne »)", () => {
  it("répartit 100 % entre les douze enjeux, sur les trois périodes", async () => {
    const data = await loadTreemap();
    expect(data).not.toBeNull();

    for (const periode of ["day", "week", "month"] as const) {
      const tiles = data![periode].tiles;
      expect(tiles).toHaveLength(12);
      expect(tiles.every((tile) => tile.share >= 0)).toBe(true);
      expect(tiles.reduce((somme, tile) => somme + tile.share, 0)).toBeCloseTo(100, 6);
    }
  });

  it("garde la part proportionnelle au score, dans l'ordre des tuiles", async () => {
    const tiles = (await loadTreemap())!.day.tiles;
    const total = tiles.reduce((somme, tile) => somme + tile.score, 0);

    for (const tile of tiles) {
      expect(tile.share).toBeCloseTo((tile.score / total) * 100, 9);
    }
    // Les tuiles sont triées par score décroissant : les parts le sont donc aussi.
    const parts = tiles.map((tile) => tile.share);
    expect([...parts].sort((a, b) => b - a)).toEqual(parts);
  });

  // La carte de partage divisait de son côté, en parallèle du chargeur. Deux
  // divisions, deux occasions de diverger : elle lit maintenant `share`.
  it("annonce sur la carte de partage la part de la tuile de tête", async () => {
    const top = (await loadTreemap())!.day.tiles[0];
    const carte = await getShareModuleContent("enjeux-saillants");

    expect(carte.title).toBe("Les 12 enjeux de la campagne");
    expect(parseInt(carte.stat!.value, 10)).toBe(Math.round(top.share));
  });
});
