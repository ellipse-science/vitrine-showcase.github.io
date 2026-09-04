import { describe, expect, it } from "vitest";

import { ETIQ_MAX_CAR, plierEtiquette } from "@/components/interactive/TreemapClient";
import { ISSUE_LABELS_SHORT } from "@/lib/enjeux";

/* Le graphique d'évolution écrit le nom de l'enjeu en SVG, à droite de sa
 * pastille de rang. Le SVG ne replie pas le texte et ne le tronque pas : ce qui
 * dépasse du viewBox est coupé net, en plein mot — « DROITS, LIBERTÉS, MINOR ».
 * Ces tests gardent l'invariant : aucun libellé ne dépasse jamais la gouttière.
 * Ils mordront le jour où un libellé du CAP s'allongera. */

describe("plierEtiquette", () => {
  it("laisse sur une seule ligne ce qui tient", () => {
    expect(plierEtiquette("Loi et crime", ETIQ_MAX_CAR)).toEqual(["Loi et crime"]);
    expect(plierEtiquette("Terres publiques et agriculture", ETIQ_MAX_CAR)).toEqual([
      "Terres publiques et agriculture",
    ]);
  });

  it("coupe à l'espace, au point qui équilibre le mieux les deux lignes", () => {
    expect(plierEtiquette("Droits, libertés, minorités et discrimination", ETIQ_MAX_CAR)).toEqual([
      "Droits, libertés,",
      "minorités et discrimination",
    ]);
    expect(plierEtiquette("Affaires internationales et défense", ETIQ_MAX_CAR)).toEqual([
      "Affaires internationales",
      "et défense",
    ]);
  });

  it("coupe au caractère un libellé sans espace, plutôt que de le laisser sortir du cadre", () => {
    // Le repli de `ISSUE_LABELS_SHORT` rend la clé technique quand l'enjeu est
    // inconnu : elle n'a pas d'espace où couper, mais elle ne doit pas déborder.
    const lignes = plierEtiquette("rights_liberties_minorities_discrimination", ETIQ_MAX_CAR);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toHaveLength(ETIQ_MAX_CAR);
    expect(lignes[0].endsWith("…")).toBe(true);
  });

  it("tient les douze libellés du CAP dans la gouttière, sur deux lignes au plus", () => {
    for (const libelle of Object.values(ISSUE_LABELS_SHORT)) {
      const lignes = plierEtiquette(libelle, ETIQ_MAX_CAR);
      expect(lignes.length, libelle).toBeLessThanOrEqual(2);
      // Rien n'a été perdu au passage : le repli n'abrège pas, il range.
      expect(lignes.join(" "), libelle).toBe(libelle);
      for (const ligne of lignes) {
        expect(ligne.length, `${libelle} → « ${ligne} »`).toBeLessThanOrEqual(ETIQ_MAX_CAR);
      }
    }
  });
});
