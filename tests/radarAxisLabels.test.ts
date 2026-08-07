import { describe, it, expect } from "vitest";
import {
  wrapLabel,
  EYEBROW_MAX_CHARS,
  EYEBROW_PX_PER_CHAR,
  AXIS_BLOCK_MAX_PX,
} from "@/components/interactive/DeuxSolitudesRadar";
import { __test__ } from "@/lib/data/headlineEvents";

const { ISSUE_LABELS_SHORT } = __test__;

// #381 : « Il faut s'assurer que JAMAIS un texte n'embarque sur quelque chose. »
// L'étiquette de rubrique des axes du radar n'était pas coupée du tout, alors
// que le titre l'est à 26 caractères. Trois des douze catégories dépassaient
// donc la largeur du bloc et mordaient sur la colonne de l'axe voisin.
describe("Deux solitudes — rubrique d'axe (#381)", () => {
  it("la calibration tient : une ligne pleine reste dans le bloc titre", () => {
    // 28 × 8,19 = 229 px, sous les 233 px du titre le plus large. Si la police
    // ou le letter-spacing de .radar-eyebrow changent, cette assertion tombe
    // et force à re-mesurer plutôt qu'à découvrir le débordement à l'écran.
    expect(EYEBROW_MAX_CHARS * EYEBROW_PX_PER_CHAR).toBeLessThanOrEqual(AXIS_BLOCK_MAX_PX);
  });

  it("AUCUNE des 12 catégories ne dépasse la largeur du bloc, une fois coupée", () => {
    const trop: string[] = [];
    for (const label of Object.values(ISSUE_LABELS_SHORT)) {
      for (const ligne of wrapLabel(label.toUpperCase(), EYEBROW_MAX_CHARS)) {
        if (ligne.length * EYEBROW_PX_PER_CHAR > AXIS_BLOCK_MAX_PX) trop.push(ligne);
      }
    }
    expect(trop).toEqual([]);
  });

  it("les trois catégories qui débordaient sont bien coupées en 2 lignes", () => {
    // Sans coupure : 45, 35 et 31 caractères, soit 369, 287 et 254 px — contre
    // 233 px de bloc. C'est le cas de la capture de #381 (« DROITS, LIBERTÉS,
    // MINORITÉS ET DISCRIMINATION » par-dessus la colonne voisine).
    const longues = [
      "Droits, libertés, minorités et discrimination",
      "Affaires internationales et défense",
      "Terres publiques et agriculture",
    ];
    for (const l of longues) {
      expect(l.length * EYEBROW_PX_PER_CHAR).toBeGreaterThan(AXIS_BLOCK_MAX_PX);
      expect(wrapLabel(l.toUpperCase(), EYEBROW_MAX_CHARS)).toHaveLength(2);
    }
  });

  it("les catégories courtes restent sur une seule ligne", () => {
    for (const l of ["Économie et travail", "Loi et crime", "Immigration", "Santé et politiques sociales"]) {
      expect(wrapLabel(l.toUpperCase(), EYEBROW_MAX_CHARS)).toHaveLength(1);
    }
  });

  it("wrapLabel garde son défaut de 26 caractères pour les titres", () => {
    for (const ligne of wrapLabel("Grève des agents de bord de WestJet paralyse des centaines de vols")) {
      expect(ligne.length).toBeLessThanOrEqual(26);
    }
  });
});
