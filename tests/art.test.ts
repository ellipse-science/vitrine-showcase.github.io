import { describe, expect, it } from "vitest";

import { ART_FILES, MAX_UPLOAD_BYTES, heroKey, publishDecision } from "@/workers/api/src/art-logic";

/**
 * La décision de publication est LE garde-fou économique du circuit
 * vitrine-art : elle sépare « nouvelle Une → builds + image » de « cycle sans
 * changement → rien ». Une régression ici, dans un sens, déclenche douze
 * builds et douze images facturées par jour pour rien ; dans l'autre, gèle
 * l'illustration pour toujours. D'où des tests sur la fonction pure.
 */
describe("publishDecision (vitrine-art)", () => {
  it("publie quand la Une change et que l'interrupteur maître est armé", () => {
    const d = publishDecision("s2", "s1", "true");
    expect(d.publish).toBe(true);
  });

  it("ne publie pas quand la Une n'a pas changé", () => {
    expect(publishDecision("s1", "s1", "true").publish).toBe(false);
  });

  it("ne publie pas sans identifiant de Une", () => {
    expect(publishDecision(null, "s1", "true").publish).toBe(false);
  });

  it("retient les builds en phase d'ombre (SYNC_TRIGGER_DEPLOYS ≠ true)", () => {
    expect(publishDecision("s2", "s1", "false").publish).toBe(false);
    expect(publishDecision("s2", "s1", undefined).publish).toBe(false);
  });

  it("publie la toute première illustration (aucun marqueur antérieur)", () => {
    expect(publishDecision("s1", null, "true").publish).toBe(true);
  });
});

describe("heroKey (clé d'appariement illustration ↔ Une)", () => {
  it("préfère la storyline : l'event_id change à chaque bloc de 4 h", () => {
    expect(heroKey({ storyline_id: "s1", event_id: "e9" })).toBe("s1");
  });

  it("retombe sur l'event_id quand la storyline manque", () => {
    expect(heroKey({ storyline_id: null, event_id: "e9" })).toBe("e9");
    expect(heroKey({ event_id: "e9" })).toBe("e9");
  });

  it("null quand rien n'identifie la Une", () => {
    expect(heroKey(null)).toBeNull();
    expect(heroKey({})).toBeNull();
  });
});

describe("liste blanche des fichiers d'art", () => {
  it("expose exactement les quatre fichiers du circuit", () => {
    expect(Object.keys(ART_FILES).sort()).toEqual([
      "latest.avif",
      "latest.json",
      "latest.png",
      "latest.webp",
    ]);
  });

  it("borne le téléversement au-dessus du PNG de gpt-image-1 (~1,5 Mo)", () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(2 * 1024 * 1024);
  });
});
