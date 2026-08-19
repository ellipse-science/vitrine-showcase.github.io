import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Une édition a DEUX adresses selon qui la lit, et les confondre coûte un 404.
//
// L'attribut `href` d'un lien est une adresse de navigateur : il doit porter le
// préfixe de déploiement (`/vitrine-showcase.github.io` sur GitHub Pages).
// `router.push` et `router.prefetch`, eux, reçoivent une ROUTE et rajoutent ce
// préfixe d'eux-mêmes — leur passer l'href le comptait deux fois.
//
// Le défaut n'était visible ni en développement (basePath vide) ni en tapant
// les URL à la main : il ne vivait que dans le clic, sur un déploiement
// préfixé. D'où ce test, qui fixe la valeur du préfixe plutôt que de la lire.

const BASE = "/vitrine-showcase.github.io";

describe("adresses d'édition", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", BASE);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("l'href porte le préfixe de déploiement", async () => {
    const { editionHref } = await import("@/lib/editionLinks");
    expect(editionHref("2026-08-09T11", false)).toBe(`${BASE}/edition/2026-08-09T11/`);
    // L'édition la plus récente EST l'accueil : c'est elle qui porte
    // l'illustration et la musique, et c'est l'adresse qu'on partage.
    expect(editionHref("2026-08-10T15", true)).toBe(`${BASE}/`);
  });

  it("la route donnée au routeur ne le porte pas", async () => {
    const { editionHref, editionRoute } = await import("@/lib/editionLinks");
    expect(editionRoute(editionHref("2026-08-09T11", false))).toBe("/edition/2026-08-09T11/");
    expect(editionRoute(editionHref("2026-08-10T15", true))).toBe("/");
    // Ce que le bug produisait, et qu'on ne veut plus jamais voir :
    expect(editionRoute(editionHref("2026-08-09T11", false))).not.toContain(`${BASE}${BASE}`);
  });

  it("sans préfixe déployé, les deux formes coïncident", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "");
    vi.resetModules();
    const { editionHref, editionRoute } = await import("@/lib/editionLinks");
    const href = editionHref("2026-08-09T11", false);
    expect(href).toBe("/edition/2026-08-09T11/");
    expect(editionRoute(href)).toBe(href);
  });
});
