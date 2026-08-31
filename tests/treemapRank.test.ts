import { describe, expect, it } from "vitest";

import { rankMovement, rankPointsForPeriod } from "@/lib/treemapRank";

const point = (date: string, rank: number, heure = "12:00") => ({
  date,
  ranks: { economy_and_labour: rank },
  tag: `${date} ${heure}`,
});

describe("rankPointsForPeriod", () => {
  it("garde les sept observations les plus récentes pour la semaine", () => {
    const history = Array.from({ length: 10 }, (_, index) => point(`2026-07-${String(index + 1).padStart(2, "0")}`, index + 1));

    expect(rankPointsForPeriod(history, "week").map((entry) => entry.date)).toEqual([
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
  });

  it("garde uniquement le mois de l'observation la plus récente", () => {
    const history = [
      point("2026-06-30", 5),
      point("2026-07-01", 4),
      point("2026-07-15", 3),
      point("2026-07-31", 2),
    ];

    expect(rankPointsForPeriod(history, "month").map((entry) => entry.date)).toEqual([
      "2026-07-01",
      "2026-07-15",
      "2026-07-31",
    ]);
  });

  it("utilise les trente dernières observations si le mois courant n'en a qu'une", () => {
    const history = [
      point("2026-06-29", 5),
      point("2026-06-30", 4),
      point("2026-07-01", 3),
    ];

    expect(rankPointsForPeriod(history, "month")).toEqual(history);
  });
});

describe("rankMovement", () => {
  it("exprime une progression comme un delta positif", () => {
    expect(rankMovement([point("2026-07-01", 8), point("2026-07-07", 3)], "economy_and_labour"))
      .toEqual({ startRank: 8, endRank: 3, delta: 5 });
  });

  it("exprime un recul comme un delta négatif", () => {
    expect(rankMovement([point("2026-07-01", 2), point("2026-07-07", 6)], "economy_and_labour"))
      .toEqual({ startRank: 2, endRank: 6, delta: -4 });
  });
});

// La frise s'ouvre à la période JOUR (30-08) : les deux visualisations doivent
// exister pour chacune des trois périodes, pas une par période.
describe("rankPointsForPeriod — période jour", () => {
  it("ne garde que les passes de la journée en cours", () => {
    const history = [
      point("2026-08-29", 3, "15:36"),
      point("2026-08-29", 2, "19:37"),
      point("2026-08-30", 4, "03:36"),
      point("2026-08-30", 1, "07:36"),
      point("2026-08-30", 2, "11:36"),
    ];

    expect(rankPointsForPeriod(history, "day").map((p) => p.tag)).toEqual([
      "2026-08-30 03:36",
      "2026-08-30 07:36",
      "2026-08-30 11:36",
    ]);
  });

  it("élargit aux six dernières passes quand la journée n'en a qu'une", () => {
    // Une seule passe ne trace aucune trajectoire : mieux vaut déborder sur la
    // veille que d'afficher une frise vide au premier bloc du matin.
    const history = [
      ...Array.from({ length: 8 }, (_, i) => point("2026-08-29", i + 1, `0${i}:00`)),
      point("2026-08-30", 1, "03:36"),
    ];

    const points = rankPointsForPeriod(history, "day");
    expect(points).toHaveLength(6);
    expect(points.at(-1)?.date).toBe("2026-08-30");
  });
});
