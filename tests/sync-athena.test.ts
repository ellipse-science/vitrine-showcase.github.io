import { afterEach, describe, expect, it, vi } from "vitest";

// Importé depuis ./transforms, PAS depuis ./sync-athena. Ce fichier-ci est
// compilé par le tsconfig de la RACINE, qui exclut pourtant `workers/` :
// `exclude` ne filtre que les globs d'`include`, il n'empêche pas un fichier
// d'entrer dans le programme quand un fichier inclus l'importe. Passer par
// sync-athena.ts tirait donc `@neondatabase/serverless` et `aws4fetch` dans la
// compilation racine, où ils ne sont pas installés — `npm run type-check`
// cassait sur toutes les PR, et les déploiements avec.
import {
  HEADLINE_KEEP_DAYS,
  isoDaysAgo,
  keepHeadlineRow,
  normalizeValue,
  polimetreCutoff,
} from "@/workers/api/src/transforms";
import { TABLES } from "@/workers/api/src/tables";
// triggerDeployHooks vit dans son propre module, sans dépendance lourde :
// l'importer ne tire ni Neon ni aws4fetch dans la compilation racine.
import { triggerDeployHooks } from "@/workers/api/src/deploy-hooks";

/**
 * Fonctions PURES du sync direct Athena -> Postgres (chaîne émancipée de
 * GitHub). Mêmes fenêtres et mêmes ancrages que fetch_data.R et que le
 * raffineur vitrine-publish : toute modification doit être répercutée des
 * trois côtés tant que plusieurs chemins coexistent.
 */
describe("sync-athena — transformations pures", () => {
  it("normalise la chaîne vide en NULL, préserve le reste", () => {
    expect(normalizeValue("")).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue("0")).toBe("0");
    expect(normalizeValue("2026-08-19")).toBe("2026-08-19");
  });

  it("fenêtre headline : 14 jours ancrés sur l'horloge, dates manquantes jetées", () => {
    const cutoff = isoDaysAgo(HEADLINE_KEEP_DAYS);
    expect(keepHeadlineRow(isoDaysAgo(1), cutoff)).toBe(true);
    expect(keepHeadlineRow(isoDaysAgo(13), cutoff)).toBe(true);
    expect(keepHeadlineRow(isoDaysAgo(15), cutoff)).toBe(false);
    expect(keepHeadlineRow(null, cutoff)).toBe(false);
  });

  it("fenêtre polimetre : ancrée sur la DONNÉE, pas sur l'horloge", () => {
    // Snapshot le plus récent vieux de 200 jours : la fenêtre gèle avec lui
    // au lieu de vider la table (le module reste visible, données périmées).
    const oldMax = isoDaysAgo(200);
    const cutoff = polimetreCutoff([oldMax, isoDaysAgo(269), null]);
    expect(cutoff).not.toBeNull();
    expect(isoDaysAgo(269) >= cutoff!).toBe(true);
    expect(isoDaysAgo(271) >= cutoff!).toBe(false);
  });

  it("fenêtre polimetre : aucune date valide = pas de coupe", () => {
    expect(polimetreCutoff([null, "n/a"])).toBeNull();
  });

  it("whitelist embarquée : 20 tables, champs requis, filtres connus", () => {
    expect(TABLES).toHaveLength(20);
    for (const t of TABLES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.athena.length).toBeGreaterThan(0);
      expect(t.cols.length).toBeGreaterThan(0);
      expect([null, "headline_events_window", "polimetre_plus_recent"]).toContain(t.filter);
    }
  });
});

/**
 * Deploy hooks — la panne de #570 (prod figée 21→25 août).
 *
 * Deux circuits déclenchent les builds à quelques minutes d'intervalle : le
 * sync Athena (cron :10) et la publication de l'illustration de la Une
 * (art.ts). Cloudflare répond 304 au second — « un déploiement est déjà en
 * file » — et l'ancienne version levait dessus. Comme `prod` est appelé en
 * premier, l'exception emportait aussi le build `dev` : plus rien ne
 * rebâtissait le site.
 */
describe("triggerDeployHooks — un hook n'en bloque pas un autre", () => {
  const env = (over: Record<string, string | undefined> = {}) =>
    ({
      DEPLOY_HOOK_PROD: "https://hook.test/prod",
      DEPLOY_HOOK_DEV: "https://hook.test/dev",
      ...over,
    }) as unknown as Parameters<typeof triggerDeployHooks>[0];

  const stubFetch = (parStatut: Record<string, number>) => {
    const appels: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      appels.push(url);
      return new Response(null, { status: parStatut[url] ?? 200 });
    });
    return appels;
  };

  afterEach(() => vi.unstubAllGlobals());

  it("304 sur prod n'est pas un échec, et dev est quand même appelé", async () => {
    const appels = stubFetch({ "https://hook.test/prod": 304 });
    await expect(triggerDeployHooks(env())).resolves.toBeUndefined();
    expect(appels).toEqual(["https://hook.test/prod", "https://hook.test/dev"]);
  });

  it("un vrai échec sur prod laisse quand même sa chance à dev, puis le signale", async () => {
    const appels = stubFetch({ "https://hook.test/prod": 500 });
    await expect(triggerDeployHooks(env())).rejects.toThrow(/prod a répondu 500/);
    expect(appels).toContain("https://hook.test/dev");
  });

  it("hook absent : les autres partent, aucune erreur", async () => {
    const appels = stubFetch({});
    await expect(
      triggerDeployHooks(env({ DEPLOY_HOOK_PROD: undefined })),
    ).resolves.toBeUndefined();
    expect(appels).toEqual(["https://hook.test/dev"]);
  });
});
