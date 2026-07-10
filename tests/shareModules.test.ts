import { describe, it, expect } from "vitest";
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
