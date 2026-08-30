import { describe, expect, it } from "vitest";

import {
  ART_FILES,
  MAX_UPLOAD_BYTES,
  PARTY_SLUGS,
  borneIndex,
  heroKey,
  parsePochette,
  publishDecision,
} from "@/workers/api/src/art-logic";

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

/* ───────────────────────────────────────────────────────────────────────────
   LES POCHETTES DES PARTIS — validation du chemin.

   C'est le seul contrôle entre le réseau et le bucket : `parsePochette` dit
   oui ou non, et un « oui » trop large ferait de /v1/art un dépôt de fichiers
   arbitraires. On éprouve donc autant les refus que les acceptations.
   ─────────────────────────────────────────────────────────────────────────── */
describe("parsePochette", () => {
  it("accepte les quatre formats publiés, pour chaque parti", () => {
    for (const parti of PARTY_SLUGS) {
      for (const ext of ["png", "webp", "avif", "json"]) {
        const ref = parsePochette(`partis/2026-08-30/${parti}.${ext}`);
        expect(ref).not.toBeNull();
        expect(ref).toMatchObject({ jour: "2026-08-30", parti, ext });
      }
    }
  });

  it("refuse ce qui n'est pas exactement la forme attendue", () => {
    const refuses = [
      "partis/2026-08-30/npd.png",           // parti hors liste
      "partis/2026-08-30/caq.gif",           // format non publié
      "partis/2026-8-30/caq.png",            // date non ISO
      "partis/2026-13-45/caq.png",           // date syntaxique mais inexistante
      "partis/2026-02-30/caq.png",           // 30 février
      "partis/../latest.png",                // remontée de chemin
      "partis/2026-08-30/caq.png/../../x",   // remontée déguisée
      "partis/2026-08-30/CAQ.png",           // casse
      "partis/2026-08-30/caq.png ",          // espace final
      "partis/2026-08-30//caq.png",          // segment vide
      "latest.png",                          // fichier de la Une, autre liste
      "",
    ];
    for (const chemin of refuses) {
      expect(parsePochette(chemin), chemin).toBeNull();
    }
  });

  it("borne l'index sur un horizon, pour que le listage ne grossisse pas", () => {
    // Le 30 août moins 30 jours tombe le 31 juillet : c'est cette borne que le
    // listage R2 passe en `startAfter`, ce qui évite de parcourir toute
    // l'archive à chaque appel.
    expect(borneIndex(new Date("2026-08-30T12:00:00Z"), 30)).toBe("2026-07-31");
    expect(borneIndex(new Date("2026-01-05T00:00:00Z"), 30)).toBe("2025-12-06");
  });
});
