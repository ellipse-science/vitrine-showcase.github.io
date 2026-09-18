import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { PERSOS, choisirPerso, estPerso } from "@/lib/promoDatagotchi";

describe("choisirPerso", () => {
  it("garde le personnage déjà attribué au visiteur", () => {
    expect(choisirPerso("prof", 0.1)).toBe("prof");
    expect(choisirPerso("chien", 0.9)).toBe("chien");
  });

  it("tire au sort, moitié-moitié, quand rien n'est mémorisé", () => {
    expect(choisirPerso(null, 0)).toBe("chien");
    expect(choisirPerso(null, 0.49)).toBe("chien");
    expect(choisirPerso(null, 0.5)).toBe("prof");
    expect(choisirPerso(null, 0.99)).toBe("prof");
  });

  it("retire au sort sur une valeur mémorisée inconnue", () => {
    expect(choisirPerso("clippy", 0.7)).toBe("prof");
    expect(estPerso("clippy")).toBe(false);
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
