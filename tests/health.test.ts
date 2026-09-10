import { describe, expect, it } from "vitest";
import { santeDesTables } from "@/workers/api/src/health-logic";
import { TABLES } from "@/workers/api/src/tables";

// Cas réel du 10-09 : une table parties_score retirée le 03-09, figée depuis.
const lignes = [
  { table_name: "headline_events_4h", synced_at: "2026-09-10T16:20:39Z" },
  { table_name: "issues_score_day", synced_at: "2026-09-10T16:21:10Z" },
  { table_name: "provincial_parties_score_day", synced_at: "2026-09-04T17:10:00Z" },
];

describe("santeDesTables (/v1/health)", () => {
  it("ignore une table retirée de la synchro : sa ligne figée ne vieillit plus toute l'API", () => {
    const r = santeDesTables(lignes, ["headline_events_4h", "issues_score_day"]);
    expect(r.plusAncienne).toBe("2026-09-10T16:20:39Z");
    expect(r.suivies.map((l) => l.table_name)).toEqual(["headline_events_4h", "issues_score_day"]);
  });

  it("nomme les tables retirées au lieu de les avaler", () => {
    expect(santeDesTables(lignes, ["headline_events_4h", "issues_score_day"]).horsSynchro).toEqual([
      "provincial_parties_score_day",
    ]);
  });

  it("une table SUIVIE qui cesse de synchroniser vieillit toujours la réponse", () => {
    const figee = { table_name: "polimetre_plus", synced_at: "2026-09-09T10:00:00Z" };
    const r = santeDesTables([...lignes, figee], ["headline_events_4h", "issues_score_day", "polimetre_plus"]);
    expect(r.plusAncienne).toBe("2026-09-09T10:00:00Z");
  });

  it("compare des horodatages Date (pilote Postgres) comme des chaînes ISO", () => {
    const d = new Date("2026-09-10T16:00:00Z");
    const r = santeDesTables([{ table_name: "a", synced_at: "2026-09-10T17:00:00Z" }, { table_name: "b", synced_at: d }], ["a", "b"]);
    expect(r.plusAncienne).toBe(d);
  });

  it("sans table suivie, pas de plus ancienne", () => {
    expect(santeDesTables(lignes, []).plusAncienne).toBeNull();
  });

  it("les 6 tables parties_score retirées le 03-09 ne sont plus dans la synchro du Worker", () => {
    const noms = TABLES.map((t) => t.name);
    const retirees = ["provincial", "federal"].flatMap((niveau) =>
      ["day", "week", "month"].map((periode) => `${niveau}_parties_score_${periode}`),
    );
    expect(retirees).toHaveLength(6);
    for (const retiree of retirees) expect(noms).not.toContain(retiree);
  });
});
