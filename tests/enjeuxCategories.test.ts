import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { libelleEnjeu } from "@/lib/data/parties";
import { ISSUE_LABELS_SHORT } from "@/lib/enjeux";

/** La grille de référence : « Catégories d'enjeux de la CLESSN et du Polimètre »
 *  (Notion, Alexandre Fortier-Chouinard, déc. 2021) — les 21 grands thèmes du
 *  Comparative Agendas Project répartis en 12 enjeux. C'est elle qui fait foi ;
 *  le code la recopie, et ce test vérifie que les copies ne dérivent pas.
 *
 *  Le cas qui a motivé le test (2026-09-02) : `transportation` et `housing`
 *  étaient comptés dans « Culture et nationalisme » depuis l'origine, alors que
 *  la grille les met dans « Économie et travail ». Plus de la moitié de la
 *  catégorie Culture était en fait du transport et du logement. */
const GRILLE: Record<string, string[]> = {
  economy_and_labour: ["macroeconomics", "labor", "domestic_commerce", "foreign_trade", "housing", "transportation"],
  rights_liberties_minorities_discrimination: ["rights_liberties_minorities_discrimination"],
  health_and_social_services: ["health", "social_welfare"],
  public_lands_and_agriculture: ["public_lands", "agriculture"],
  immigration: ["immigration"],
  education: ["education"],
  environment_and_energy: ["environment", "energy"],
  law_and_crime: ["law_and_crime"],
  international_affairs_and_defense: ["international_affairs", "defense"],
  technology: ["technology"],
  governments_and_governance: ["governments_governance"],
  culture_and_nationalism: ["culture_nationalism"],
};

/** Lit ISSUES_THEME_TO_CATEGORY dans scripts/fetch_data.R sans R : le bloc est
 *  une liste de `nom = c("a", "b")`, une entrée par ligne. Le POURCENTAGE d'un
 *  enjeu vient du raffineur, la LISTE D'ARTICLES qui l'explique vient de ce
 *  script : si sa table dérivait, la liste cesserait d'expliquer le nombre. */
function lireTableR(): Record<string, string[]> {
  const src = readFileSync(path.join(process.cwd(), "scripts", "fetch_data.R"), "utf8");
  const bloc = src.match(/ISSUES_THEME_TO_CATEGORY <- list\(([\s\S]*?)\n\)/);
  if (!bloc) throw new Error("ISSUES_THEME_TO_CATEGORY introuvable dans scripts/fetch_data.R");
  const table: Record<string, string[]> = {};
  for (const m of bloc[1].matchAll(/(\w+)\s*=\s*c\(([^)]*)\)/g)) {
    table[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  return table;
}

describe("la grille des 12 enjeux suit la source de vérité CLESSN/Polimètre", () => {
  it("scripts/fetch_data.R recopie la grille — transport et logement dans Économie et travail", () => {
    expect(lireTableR()).toEqual(GRILLE);
  });

  it("chaque thème CAP est compté dans exactement un enjeu, et il y en a 21", () => {
    const tous = Object.values(GRILLE).flat();
    expect(tous).toHaveLength(21);
    expect(new Set(tous).size).toBe(21);
  });

  it("le module des partis traduit chaque thème vers le même enjeu", () => {
    for (const [enjeu, themes] of Object.entries(GRILLE)) {
      for (const theme of themes) {
        expect(libelleEnjeu(theme), theme).toBe(ISSUE_LABELS_SHORT[enjeu]);
      }
    }
  });
});
