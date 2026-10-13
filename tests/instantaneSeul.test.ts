import { describe, expect, it, vi } from "vitest";
import { synchroniserInstantaneSeul, type DependancesInstantane } from "@/workers/api/src/instantane-seul";

/**
 * Tables « instantané seul » (#944) : le chemin qui écrit dans R2 sans
 * Postgres. Ses garanties : un dépôt quand tout va bien, et TOUT échec rendu
 * comme une raison (jamais une exception), pour qu'il finisse dans
 * `snapshotSkipped` et ne retienne pas les Deploy Hooks.
 */
const entree = { rows: 2, bytes: 2048, key: "data/snapshot/c1/t.json" };

function deps(over: Partial<DependancesInstantane<string[], object>> = {}) {
  const deposer = vi.fn(async () => entree);
  return {
    deposer,
    d: {
      cycle: "c1",
      seau: true,
      lireLignes: async () => [["a"], ["b"]],
      typesConnus: () => true,
      enObjets: (l: string[][]) => l.map((r) => ({ v: r[0] })),
      deposer,
      ...over,
    } as DependancesInstantane<string[], object>,
  };
}

describe("synchroniserInstantaneSeul", () => {
  it("dépose les lignes converties et rend l'entrée du manifeste", async () => {
    const { d, deposer } = deps();
    await expect(synchroniserInstantaneSeul(d)).resolves.toEqual({ ok: true, rows: 2, snapshot: entree });
    expect(deposer).toHaveBeenCalledWith("c1", [{ v: "a" }, { v: "b" }]);
  });

  it.each([
    ["sans cycle", { cycle: undefined }, /sans cycle/],
    ["sans seau", { seau: false }, /sans seau/],
    ["zéro ligne", { lireLignes: async () => [] }, /0 ligne/],
    ["types inconnus", { typesConnus: () => false }, /types de colonnes/],
    ["Athena en panne", { lireLignes: async () => { throw new Error("Athena 500"); } }, /Athena 500/],
  ])("%s : rien n'est déposé, la raison remonte", async (_, over, raison) => {
    const { d, deposer } = deps(over as Partial<DependancesInstantane<string[], object>>);
    const r = await synchroniserInstantaneSeul(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.raison).toMatch(raison);
    expect(deposer).not.toHaveBeenCalled();
  });

  it("un dépôt R2 qui échoue est une raison, pas une exception", async () => {
    const { d } = deps({ deposer: async () => { throw new Error("R2 indisponible"); } });
    await expect(synchroniserInstantaneSeul(d)).resolves.toEqual({ ok: false, raison: "R2 indisponible" });
  });
});
