import { describe, it, expect } from "vitest";
import {
  publicationHourFromInterval,
  publicationDateFromInterval,
  lastUpdatedLabel,
} from "@/lib/dates";

// Réforme #195 : le tag public = heure de PUBLICATION = fin du bloc + 1 h.
describe("publicationHourFromInterval (tag « 20h » — réforme #195)", () => {
  it("bloc du jour : 15-19 → 20 (« 20h »)", () => {
    expect(publicationHourFromInterval("15-19")).toBe(20);
  });
  it("fin à 23 → 24 (rendu « minuit » par lastUpdatedLabel)", () => {
    expect(publicationHourFromInterval("19-23")).toBe(24);
  });
  it("bord de bloc à 24 (« 20-24 », legacy/UTC) EST déjà minuit → 1 (« 1h »), pas « minuit »", () => {
    // Sans la normalisation % 24, on aurait 25 (≥ 24) → « minuit » à tort.
    expect(publicationHourFromInterval("20-24")).toBe(1);
  });
  it("bloc de nuit qui wrap : 23-03 → 4 (« 4h »)", () => {
    expect(publicationHourFromInterval("23-03")).toBe(4);
  });
  it("null si pas de borne de fin numérique", () => {
    expect(publicationHourFromInterval("")).toBeNull();
    expect(publicationHourFromInterval(null)).toBeNull();
    expect(publicationHourFromInterval("15-")).toBeNull();
  });
});

// Vérrouille le rendu de l'heure de publication bout à bout.
describe("lastUpdatedLabel (heure de publication rendue)", () => {
  const d = "2026-07-15";
  it("15-19 → « …, 20h »", () => {
    expect(lastUpdatedLabel(d, publicationHourFromInterval("15-19"))).toContain(", 20h");
  });
  it("19-23 → « …, minuit »", () => {
    expect(lastUpdatedLabel(d, publicationHourFromInterval("19-23"))).toContain(", minuit");
  });
  it("20-24 → « …, 1h » (pas « minuit »)", () => {
    const label = lastUpdatedLabel(d, publicationHourFromInterval("20-24"));
    expect(label).toContain(", 1h");
    expect(label).not.toContain("minuit");
  });
});

// Bug vécu le 2026-08-07 : un bloc « 23-03 » daté du 6 août, publié à 4h,
// s'affichait « 6 août, 4h » (encore le jeudi) au lieu de « 7 août, 4h »
// (le vendredi matin, quand la publication a réellement lieu).
describe("publicationDateFromInterval (décalage de jour pour les blocs qui traversent minuit)", () => {
  it("bloc qui wrap : 23-03 → jour suivant", () => {
    expect(publicationDateFromInterval("2026-08-06", "23-03")).toBe("2026-08-07");
  });
  it("bord de bloc légacy à 24 (« 20-24 ») → jour suivant", () => {
    expect(publicationDateFromInterval("2026-08-06", "20-24")).toBe("2026-08-07");
  });
  it("bloc normal, pas de wrap (« 15-19 ») → même jour", () => {
    expect(publicationDateFromInterval("2026-08-06", "15-19")).toBe("2026-08-06");
  });
  it("wrap à cheval sur un changement de mois", () => {
    expect(publicationDateFromInterval("2026-07-31", "23-03")).toBe("2026-08-01");
  });
  it("date invalide → inchangée", () => {
    expect(publicationDateFromInterval("pas-une-date", "23-03")).toBe("pas-une-date");
  });
  it("intervalle invalide/absent → date inchangée", () => {
    expect(publicationDateFromInterval("2026-08-06", null)).toBe("2026-08-06");
    expect(publicationDateFromInterval("2026-08-06", "")).toBe("2026-08-06");
  });

  it("bout en bout : bloc 23-03 daté 6 août → libellé « vendredi 7 août 2026, 4h »", () => {
    const dateStr = "2026-08-06";
    const interval = "23-03";
    const label = lastUpdatedLabel(
      publicationDateFromInterval(dateStr, interval),
      publicationHourFromInterval(interval),
    );
    expect(label).toBe("Dernière mise à jour du module : vendredi 7 août 2026, 4h");
  });
});
