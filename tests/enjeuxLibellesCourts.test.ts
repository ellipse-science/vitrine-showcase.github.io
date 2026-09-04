import { describe, it, expect } from "vitest";
import { __test__, libelleEnjeuCourt, SANS_ENJEU } from "@/lib/data/parties";

const { THEME_VERS_CATEGORIE } = __test__;

/** LE BUDGET DU DOS DE LA POCHETTE, en signes.
 *
 *  La carte la plus étroite fait 150 px (`.trophee-panel-grille`,
 *  `minmax(150px, 1fr)`), moins 10 px de marge de chaque côté = 130 px. Le
 *  libellé « ENJEU » en prend ~33, les deux gouttières 12, le filet pointillé
 *  8 au minimum : il reste ~77 px, soit environ 13 signes en Source Serif 12 px.
 *
 *  Ni le libellé ni la valeur n'ayant le droit de rétrécir (`flex: none`) et la
 *  boîte coupant ce qui dépasse (`overflow: hidden`), un signe de trop n'est
 *  pas un défaut d'esthétique : c'est du texte tranché en plein mot. */
const BUDGET = 13;

describe("les libellés d'enjeux tiennent au dos de la pochette", () => {
  it("AUCUNE catégorie ne dépasse le budget une fois abrégée", () => {
    // ⚠️ LA GARDE QUI COMPTE. Elle porte sur la table AMONT, pas sur la liste
    // des abréviations : une catégorie ajoutée à `THEME_VERS_CATEGORIE` sans
    // nom court se ferait couper à l'écran, en silence. Ce test la refuse.
    for (const categorie of new Set(Object.values(THEME_VERS_CATEGORIE))) {
      const court = libelleEnjeuCourt(categorie);
      expect(court.length, `« ${categorie} » → « ${court} » (${court.length} signes)`).toBeLessThanOrEqual(BUDGET);
    }
  });

  it("« Aucun enjeu identifié » aussi — il s'affiche comme les autres", () => {
    expect(libelleEnjeuCourt(SANS_ENJEU).length).toBeLessThanOrEqual(BUDGET);
  });

  it("une catégorie déjà courte n'est pas touchée", () => {
    // On n'abrège que ce qui dépasse : réécrire « Éducation » n'apporterait
    // rien et ferait diverger deux noms pour un même enjeu.
    for (const c of ["Éducation", "Immigration", "Technologie", "Loi et crime"]) {
      expect(libelleEnjeuCourt(c)).toBe(c);
    }
  });

  it("une catégorie INCONNUE passe telle quelle, plutôt que de disparaître", () => {
    // La liste des têtes est découverte à l'exécution en amont : une catégorie
    // sans correspondance doit rester lisible. Mieux vaut un libellé long
    // qu'un libellé faux — et le test précédent empêche que ça arrive aux
    // catégories qu'on connaît.
    expect(libelleEnjeuCourt("Une catégorie toute neuve")).toBe("Une catégorie toute neuve");
  });
});
