import { describe, expect, it } from "vitest";

import { samediDeLaSemaine, vendrediDeLaSemaine } from "@/lib/semaine";

describe("samediDeLaSemaine", () => {
  it("un samedi renvoie sa propre date", () => {
    expect(samediDeLaSemaine("2026-08-22")).toBe("2026-08-22");
  });

  it("les six autres jours reculent jusqu'au samedi qui les précède", () => {
    // 2026-08-22 est un samedi (vérifié ci-dessus) ; les six jours suivants,
    // dimanche à vendredi, doivent tous reculer sur lui.
    const semaine = ["2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
    for (const jour of semaine) expect(samediDeLaSemaine(jour)).toBe("2026-08-22");
  });

  it("bascule au samedi SUIVANT dès le premier jour de la semaine d'après", () => {
    expect(samediDeLaSemaine("2026-08-29")).toBe("2026-08-29");
  });
});

describe("vendrediDeLaSemaine", () => {
  it("ferme la semaine six jours après son samedi d'ouverture", () => {
    expect(vendrediDeLaSemaine("2026-08-22")).toBe("2026-08-28");
  });

  it("s'accorde avec samediDeLaSemaine sur les sept jours d'une même semaine", () => {
    const samedi = samediDeLaSemaine("2026-08-25");
    const vendredi = vendrediDeLaSemaine(samedi);
    expect(samedi).toBe("2026-08-22");
    expect(vendredi).toBe("2026-08-28");
  });
});
