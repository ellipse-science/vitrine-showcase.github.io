import { describe, expect, it, vi } from "vitest";

// reconnexion.ts n'a aucune dépendance : importable par la compilation de la
// racine, comme delai.ts (cf. tests/sync-athena-delais.test.ts).
import { avecReconnexion, estCoupureConnexion } from "@/workers/api/src/reconnexion";

/**
 * 30 septembre 2026, 8 h 10 : « Connection terminated unexpectedly » sur la
 * première table, puis « Client … is not queryable » sur la seconde, qui
 * héritait du client mort. Ces tests verrouillent la connexion par table et
 * la nouvelle tentative unique.
 */
describe("sync-athena — connexion Postgres par table", () => {
  it("reconnaît les deux messages observés en production", () => {
    expect(estCoupureConnexion(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(estCoupureConnexion(new Error("Client has encountered a connection error and is not queryable"))).toBe(true);
  });

  it("ne prend pas une erreur de requête pour une coupure", () => {
    expect(estCoupureConnexion(new Error('relation "vitrine.x" does not exist'))).toBe(false);
    expect(estCoupureConnexion(new Error("0 ligne reçue d'Athena alors que t en comptait 12 — table préservée"))).toBe(false);
  });

  it("une coupure : nouvelle tentative sur une connexion NEUVE, et les deux sont fermées", async () => {
    const ouverts: number[] = [];
    const fermes: number[] = [];
    let n = 0;
    const ouvrir = vi.fn(async () => { n += 1; ouverts.push(n); return n; });
    const fermer = vi.fn(async (c: number) => { fermes.push(c); });
    const travail = vi.fn(async (c: number) => {
      if (c === 1) throw new Error("Connection terminated unexpectedly");
      return "écrit avec " + c;
    });
    await expect(avecReconnexion(ouvrir, fermer, travail, "agora_decideurs_qc")).resolves.toBe("écrit avec 2");
    expect(ouverts).toEqual([1, 2]);
    expect(fermes.sort()).toEqual([1, 2]);
  });

  it("une seule nouvelle tentative : deux coupures de suite font échouer la table", async () => {
    const ouvrir = vi.fn(async () => 0);
    const travail = vi.fn(async () => { throw new Error("Connection terminated unexpectedly"); });
    await expect(avecReconnexion(ouvrir, async () => {}, travail, "t")).rejects.toThrow("Connection terminated");
    expect(travail).toHaveBeenCalledTimes(2);
  });

  it("une erreur de requête n'est pas retentée", async () => {
    const travail = vi.fn(async () => { throw new Error('relation "vitrine.x" does not exist'); });
    await expect(avecReconnexion(async () => 0, async () => {}, travail, "t")).rejects.toThrow("does not exist");
    expect(travail).toHaveBeenCalledTimes(1);
  });

  it("la connexion est fermée même quand tout va bien", async () => {
    const fermer = vi.fn(async () => {});
    await avecReconnexion(async () => 7, fermer, async () => "ok", "t");
    expect(fermer).toHaveBeenCalledWith(7);
  });
});
