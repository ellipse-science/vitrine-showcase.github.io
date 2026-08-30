import { describe, expect, it } from "vitest";

import { CLES_AVEC_SYMBOLE } from "@/components/interactive/SymboleEnjeu";
import { CLE_PAR_LIBELLE, ISSUE_COLORS, ISSUE_LABELS_SHORT } from "@/lib/enjeux";
import { CATEGORY_ORDER } from "@/lib/data/polimetre-meta";

// Le symbole d'enjeu (issue #425) est le SEUL élément partagé par les quatre
// modules. Un enjeu sans symbole ne se voit pas : il ne casse rien, il disparaît
// simplement de la Une, du radar, d'une tuile et d'une promesse à la fois.
describe("symboles d'enjeu", () => {
  it("les douze enjeux ont chacun le leur, et il n'y en a pas de treizième", () => {
    expect([...CLES_AVEC_SYMBOLE].sort()).toEqual([...Object.keys(ISSUE_COLORS)].sort());
  });

  // Le Polimètre+ ne connaît ses enjeux que par leur libellé complet. Si un seul
  // caractère diverge (une apostrophe, un accent), le symbole disparaît en
  // silence de tout le module 6.
  it("les catégories du Polimètre+ se résolvent toutes en une clé d'enjeu", () => {
    const orphelines = CATEGORY_ORDER.filter((libelle) => !CLE_PAR_LIBELLE[libelle]);
    expect(orphelines).toEqual([]);
  });

  it("l'index libellé vers clé est l'inverse exact de ISSUE_LABELS_SHORT", () => {
    for (const [cle, libelle] of Object.entries(ISSUE_LABELS_SHORT)) {
      expect(CLE_PAR_LIBELLE[libelle]).toBe(cle);
    }
    expect(Object.keys(CLE_PAR_LIBELLE)).toHaveLength(Object.keys(ISSUE_LABELS_SHORT).length);
  });
});
