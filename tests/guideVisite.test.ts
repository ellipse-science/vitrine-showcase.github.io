import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ETAPES, OFFRE, etapesPresentes } from "@/lib/guideVisite";

const metho = readFileSync(path.join(process.cwd(), "public/methodologie/index.html"), "utf8");
const textes = [OFFRE.texte, ...ETAPES.flatMap((e) => [e.titre, e.texte])];

describe("visite guidée", () => {
  it("reste courte : une douzaine d'étapes au plus", () => {
    expect(ETAPES.length).toBeLessThanOrEqual(12);
  });

  it("commence par la frise des éditions, puis l'indice de saillance", () => {
    expect(ETAPES[1].cible).toBe(".edition-nav-row");
    expect(ETAPES[2].texte).toContain("Adrien Cloutier");
  });

  it("chaque lien « En savoir plus » vise une ancre qui existe dans la Méthodologie", () => {
    for (const e of ETAPES) {
      if (e.metho) expect(metho).toContain(`id="${e.metho}"`);
    }
  });

  it("respecte la typographie OQLF : pas d'espace avant ? ! ;, pas de tiret cadratin", () => {
    for (const t of textes) {
      expect(t).not.toMatch(/ [?!;]/);
      expect(t).not.toContain("—");
    }
  });

  it("saute les étapes dont la cible est absente, garde celles sans cible", () => {
    const gardees = etapesPresentes((s) => s !== "#candidats-reseaux");
    expect(gardees.length).toBe(ETAPES.length - 1);
    expect(gardees[0].cible).toBeNull();
  });
});
