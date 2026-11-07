import { afterEach, describe, expect, it, vi } from "vitest";

// delai.ts et deploy-hooks.ts n'ont aucune dépendance lourde : importables par
// la compilation de la racine (cf. l'en-tête de tests/sync-athena.test.ts).
import {
  ATHENA_APPEL_MS,
  DelaiDepasse,
  EXTERNE_MS,
  ORCHESTRATION_MS,
  PG_REQUETE_MS,
  TRANCHE_MS,
  avecDelai,
  tempsRestant,
} from "@/workers/api/src/delai";
import { triggerDeployHooks } from "@/workers/api/src/deploy-hooks";

/**
 * « The Workers runtime canceled this request because it detected that your
 * Worker's code had hung » (27 et 29 septembre 2026) : un appel sans délai qui
 * ne revenait jamais bloquait toute la passe. Ces tests verrouillent la borne.
 */
describe("sync-athena — délais des appels réseau", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("avecDelai rejette une promesse qui ne se règle jamais, à l'échéance", async () => {
    vi.useFakeTimers();
    const pendue = new Promise<never>(() => {});
    const r = avecDelai(pendue, 1_000, "Postgres");
    const attente = expect(r).rejects.toBeInstanceOf(DelaiDepasse);
    await vi.advanceTimersByTimeAsync(1_000);
    await attente;
  });

  it("le message nomme l'appel et le délai", async () => {
    vi.useFakeTimers();
    const r = avecDelai(new Promise<never>(() => {}), 250, "connexion Postgres");
    const attente = expect(r).rejects.toThrow("connexion Postgres : délai dépassé (250 ms)");
    await vi.advanceTimersByTimeAsync(250);
    await attente;
  });

  it("avecDelai laisse passer une réponse arrivée à temps, et son erreur telle quelle", async () => {
    await expect(avecDelai(Promise.resolve(42), 1_000, "x")).resolves.toBe(42);
    await expect(avecDelai(Promise.reject(new Error("HTTP 500")), 1_000, "x")).rejects.toThrow("HTTP 500");
  });

  it("aucun minuteur ne survit à une réponse arrivée à temps", async () => {
    vi.useFakeTimers();
    await avecDelai(Promise.resolve("ok"), 60_000, "x");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tempsRestant ne devient jamais négatif", () => {
    expect(tempsRestant(10_000, 4_000)).toBe(6_000);
    expect(tempsRestant(10_000, 12_000)).toBe(0);
  });

  it("les bornes restent cohérentes entre elles", () => {
    // Une tranche doit tenir dans l'orchestration, qui doit tenir sous les
    // 15 min d'un déclencheur Cron ; une requête dans une tranche.
    expect(TRANCHE_MS).toBeLessThan(ORCHESTRATION_MS);
    expect(ORCHESTRATION_MS).toBeLessThan(15 * 60_000);
    expect(PG_REQUETE_MS).toBeLessThan(TRANCHE_MS);
    expect(ATHENA_APPEL_MS).toBeLessThan(TRANCHE_MS);
  });

  it("les Deploy Hooks partent avec un délai (AbortSignal)", async () => {
    const vus: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      vus.push(init);
      return new Response(null, { status: 200 });
    }));
    await triggerDeployHooks({ DEPLOY_HOOK_PROD: "https://hook.test/prod", DEPLOY_HOOK_DEV: "https://hook.test/dev" } as never);
    expect(vus.length).toBeGreaterThan(0);
    for (const init of vus) expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(EXTERNE_MS).toBeGreaterThan(0);
  });
  it("le dispatch GitHub part aussi avec un délai (Worker muni de son jeton)", async () => {
    const vus: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      vus.push(init);
      return new Response(null, { status: 204 });
    }));
    await triggerDeployHooks({ GITHUB_DISPATCH_TOKEN: "jeton-test" } as never);
    expect(vus.length).toBeGreaterThan(0);
    for (const init of vus) expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
