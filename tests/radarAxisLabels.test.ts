import { describe, it, expect } from "vitest";
import {
  wrapLabel,
  ringLabelAngle,
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

// #394 : « Ça embarque sur le point, il faut s'assurer que ça arrive
// jamais. » Les labels % de l'échelle radiale (13/25/38/50 %) étaient plaqués
// sur l'axe vertical du haut — la même colonne que le point de données de cet
// axe — et venaient le recouvrir dès que sa valeur approchait un palier.
describe("Deux solitudes — labels % de l'échelle radiale (#394)", () => {
  const normalize = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  it("l'angle du label ne coïncide jamais avec un axe, quel que soit le nombre d'histoires", () => {
    for (let n = 1; n <= 12; n++) {
      const ring = normalize(ringLabelAngle(n));
      for (let i = 0; i < n; i++) {
        const axis = normalize(-Math.PI / 2 + (i * 2 * Math.PI) / n);
        expect(Math.abs(ring - axis)).toBeGreaterThan(1e-9);
      }
    }
  });

  it("pour six histoires (cas réel), le label tombe bien au milieu de l'écart entre le dernier axe et le premier", () => {
    const n = 6;
    const top = -Math.PI / 2;
    const last = -Math.PI / 2 + ((n - 1) * 2 * Math.PI) / n; // axe n-1
    const ring = ringLabelAngle(n);
    // L'écart top↔last passe par le "bas" (2π - 2π/n) : le label doit être à
    // équidistance des deux, du côté court (celui qui longe le haut).
    expect(normalize(top - ring)).toBeCloseTo(Math.PI / n, 9);
    expect(normalize(ring - last)).toBeCloseTo(Math.PI / n, 9);
  });
});
