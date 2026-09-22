import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { PERSOS, choisirPerso, largeurBulle } from "@/lib/promoDatagotchi";

describe("choisirPerso", () => {
  it("tire au sort, moitié-moitié, à chaque chargement", () => {
    expect(choisirPerso(0)).toBe("chien");
    expect(choisirPerso(0.49)).toBe("chien");
    expect(choisirPerso(0.5)).toBe("prof");
    expect(choisirPerso(0.99)).toBe("prof");
  });
});

describe("PERSOS", () => {
  it("chaque personnage mène à son projet, en https, et son image existe", () => {
    expect(new URL(PERSOS.chien.href).hostname).toBe("quebec.datagotchi.com");
    expect(new URL(PERSOS.prof.href).hostname).toBe("prof-datagotchi.com");
    for (const fiche of Object.values(PERSOS)) {
      expect(fiche.href.startsWith("https://")).toBe(true);
      expect(existsSync(path.join(process.cwd(), "public", fiche.image))).toBe(true);
    }
  });

  it("respecte la typographie OQLF : pas d'espace avant ? et !", () => {
    for (const fiche of Object.values(PERSOS)) {
      expect(fiche.texte).not.toMatch(/\s[?!]/);
    }
  });
});

// Marges mesurées sur le site (colonne de 1204 px) : 358 px à 1920, 238 px à
// 1680, 118 px à 1440, 48 px à 1280 et moins.
describe("largeurBulle", () => {
  it("tient dans la marge d'un écran de 1920, sans jamais toucher la colonne", () => {
    expect(largeurBulle(358)).toBe(322);
    expect(322 + 36).toBeLessThanOrEqual(358);
  });

  it("plafonne sur les très grands écrans", () => {
    expect(largeurBulle(678)).toBe(348);
  });

  it("renonce quand la marge est trop étroite : la bulle garde sa largeur par défaut", () => {
    expect(largeurBulle(238)).toBeNull();
    expect(largeurBulle(118)).toBeNull();
    expect(largeurBulle(48)).toBeNull();
    expect(largeurBulle(0)).toBeNull();
    expect(largeurBulle(335)).toBeNull();
    expect(largeurBulle(336)).toBe(300);
  });
});
