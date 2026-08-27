import { afterEach, describe, it, expect, vi } from "vitest";
import { isShareModuleSlug, getShareModuleContent, SHARE_MODULE_SLUGS } from "@/lib/shareModules";

describe("isShareModuleSlug", () => {
  it("reconnaît les 6 slugs valides", () => {
    for (const slug of SHARE_MODULE_SLUGS) {
      expect(isShareModuleSlug(slug)).toBe(true);
    }
  });
  it("rejette un slug inconnu", () => {
    expect(isShareModuleSlug("pas-un-module")).toBe(false);
  });
});

describe("SHARE_MODULE_SLUGS — visibilité par environnement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exclut en production le module Partis, toujours masqué par #544", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "prod");
    vi.resetModules();

    const prodShareModules = await import("@/lib/shareModules");

    expect(prodShareModules.SHARE_MODULE_SLUGS).not.toContain("partis-et-couverture");
    expect(prodShareModules.isShareModuleSlug("partis-et-couverture")).toBe(false);
  });

  it("inclut en production l'Assemblée, sortie du rodage le 2026-08-27", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "prod");
    vi.resetModules();

    const prodShareModules = await import("@/lib/shareModules");

    expect(prodShareModules.SHARE_MODULE_SLUGS).toContain("assemblee-nationale");
    expect(prodShareModules.isShareModuleSlug("assemblee-nationale")).toBe(true);
  });
});

describe("getShareModuleContent — modules à description statique", () => {
  it("renvoie un titre et une description non vides pour chaque module sans donnée live", async () => {
    const staticSlugs = ["partis-et-couverture", "enjeux-saillants", "assemblee-nationale", "polimetre-plus"] as const;
    for (const slug of staticSlugs) {
      const content = await getShareModuleContent(slug);
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.description.length).toBeGreaterThan(0);
    }
  });
});

describe("getShareModuleContent — chiffre choc (stat)", () => {
  it("renvoie un stat.value et stat.label non vides pour chaque module", async () => {
    for (const slug of SHARE_MODULE_SLUGS) {
      const { stat } = await getShareModuleContent(slug);
      expect(stat.value.length).toBeGreaterThan(0);
      expect(stat.label.length).toBeGreaterThan(0);
    }
  });

  it("deux-solitudes : le stat reflète le % de divergence déjà utilisé dans la description", async () => {
    const content = await getShareModuleContent("deux-solitudes");
    const pctInDescription = content.description.match(/(\d+) %/)?.[1];
    if (pctInDescription) {
      expect(content.stat.value).toBe(`${pctInDescription} %`);
    }
  });

  it("une-des-unes : transmet le niveau calibré qui porte la carte de partage", async () => {
    const { stat } = await getShareModuleContent("une-des-unes");

    if (stat.kicker) {
      expect(stat.salienceLabel).toBeTruthy();
      expect(stat.salienceRank).toBeGreaterThanOrEqual(1);
      expect(stat.salienceRank).toBeLessThanOrEqual(6);
    }
  });

  it("partis-et-couverture : quand un parti mène aujourd'hui, le libellé le nomme et le ton pilote la pointe éditoriale", async () => {
    const content = await getShareModuleContent("partis-et-couverture");
    if (content.stat.value.endsWith("%")) {
      expect(content.stat.label).toMatch(/domine la couverture/);
      expect(content.stat.contextHighlight).toMatch(/en bien\.|en mal\.|c'est qu'on en parle\./);
    }
  });
});
