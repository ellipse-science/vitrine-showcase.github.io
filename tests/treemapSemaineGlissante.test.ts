import { describe, expect, it } from "vitest";

import { __test__, type TreemapPeriodData } from "@/lib/data/headlineEvents";

const { buildPeriodeDepuisArticles } = __test__;

// La vue Semaine des 12 enjeux = les SEPT derniers jours d'articles, et sa
// variation se compare à la fenêtre que le module affichait LA VEILLE, qui
// commençait elle aussi un jour plus tôt. Avant le 06-09, la semaine partait du
// vendredi 20h et repartait de zéro chaque semaine (Laurence-Olivier, 05-09 :
// « Semaine, ça devrait être 7 derniers jours »).

const ECO = "economy_and_labour";
const SANTE = "health_and_social_services";

/** Un article par jour, du 28 août au 5 septembre, qui pèse autant pour
 *  l'économie que pour la santé — sauf le 29 août, où l'économie écrase tout. */
function articles() {
  const jours = ["2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01",
    "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
  return jours.map((jour) => ({
    title: `Article du ${jour}`,
    url: `https://exemple.test/${jour}`,
    media_id: "LAP",
    jour,
    [ECO]: jour === "2026-08-29" ? 8 : 1,
    [SANTE]: jour === "2026-08-29" ? 0 : 1,
  }));
}

const jourVue: TreemapPeriodData = {
  tiles: [],
  dateLabel: "samedi 5 septembre 2026",
  growthSince: null,
  lastUpdated: "Dernière mise à jour du module : samedi 5 septembre 2026, 16h",
  history: [],
};

const tuile = (periode: TreemapPeriodData, cle: string) => periode.tiles.find((t) => t.issueKey === cle)!;

describe("buildPeriodeDepuisArticles — la semaine glissante", () => {
  const semaine = buildPeriodeDepuisArticles(articles(), "2026-08-30", jourVue, "2026-08-29")!;

  it("ne somme que les sept derniers jours et trace un point par jour", () => {
    expect(semaine.history.map((p) => p.tag)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
    // 7 articles à parts égales : le 29 août (économie 8) est hors fenêtre.
    expect(tuile(semaine, ECO).share).toBeCloseTo(50, 6);
    expect(tuile(semaine, SANTE).share).toBeCloseTo(50, 6);
    expect(tuile(semaine, ECO).articlesTotal).toBe(7);
  });

  it("compare la part à celle de la fenêtre affichée la veille, qui commençait un jour plus tôt", () => {
    // Hier, la semaine allait du 29 août au 4 septembre : économie 8 + 6 = 14
    // contre santé 6, soit 70 % / 30 %. Aujourd'hui 50 % / 50 %.
    expect(semaine.growthSince).toBe("hier");
    expect(tuile(semaine, ECO).growth).toBeCloseTo(((50 - 70) / 70) * 100, 6);
    expect(tuile(semaine, SANTE).growth).toBeCloseTo(((50 - 30) / 30) * 100, 6);
  });

  it("garde la fenêtre d'aujourd'hui arrêtée à hier quand la fenêtre est ancrée (la campagne)", () => {
    // Sans `depuisVeille`, la veille commence au même jour que la fenêtre :
    // 30 août → 4 septembre, parts égales, aucune variation.
    const campagne = buildPeriodeDepuisArticles(articles(), "2026-08-30", jourVue)!;
    expect(tuile(campagne, ECO).growth).toBeCloseTo(0, 6);
    expect(tuile(campagne, SANTE).growth).toBeCloseTo(0, 6);
  });

  it("rend null sans articles ni début de fenêtre", () => {
    expect(buildPeriodeDepuisArticles([], "2026-08-30", jourVue)).toBeNull();
    expect(buildPeriodeDepuisArticles(articles(), null, jourVue)).toBeNull();
  });
});
