import { describe, expect, it } from "vitest";

import { debutDeLaSemaine, rankMovement, rankPointsForPeriod } from "@/lib/treemapRank";

const point = (date: string, rank: number, heure = "12:00") => ({
  date,
  ranks: { economy_and_labour: rank },
  tag: `${date} ${heure}`,
});

describe("rankPointsForPeriod", () => {
  // ⚠️ Ce cas rend bien SEPT points, mais ce n'est plus la règle « les sept plus
  // récents » : c'est une coïncidence de calendrier. 2026-07-10 est un vendredi
  // et son tag tombe à 8h à Montréal, donc AVANT la bascule de 20h : la semaine
  // en cours a commencé le vendredi 3 à 20h, et sept points la suivent.
  it("va du vendredi 20h au vendredi 20h, soit sept points ici", () => {
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

// Règle d'Adrien (30-08) : la semaine du site va du VENDREDI 20h au vendredi
// 20h, heure de Montréal. Ni le calendrier, ni une fenêtre glissante de 7 jours.
describe("debutDeLaSemaine", () => {
  // Le tag est écrit en heure de Montréal par le raffineur (preuve CloudWatch du
  // 2026-09-02) : il se lit tel quel, sans conversion.
  const pt = (tagMontreal: string, date: string) => ({ date, ranks: {}, tag: tagMontreal });

  it("recule au vendredi précédent quand le dernier point est un dimanche", () => {
    // 2026-08-30 est un dimanche ; le vendredi d'avant est le 28.
    expect(debutDeLaSemaine([pt("2026-08-30 15:36", "2026-08-30")])).toBe("2026-08-28T20");
  });

  it("garde le vendredi même quand le dernier point est ce vendredi APRÈS 20h", () => {
    // Vendredi 28 août, passe de 19h36 (Montréal) → avant 20h, donc semaine d'avant.
    expect(debutDeLaSemaine([pt("2026-08-28 19:36", "2026-08-28")])).toBe("2026-08-21T20");
    // Vendredi 28 août, passe de 23h36 (Montréal) → après 20h, semaine en cours.
    expect(debutDeLaSemaine([pt("2026-08-28 23:36", "2026-08-28")])).toBe("2026-08-28T20");
  });

  it("recule d'une semaine entière quand le dernier point est un jeudi", () => {
    // 2026-08-27 est un jeudi : la semaine en cours a commencé le vendredi 21.
    expect(debutDeLaSemaine([pt("2026-08-27 15:36", "2026-08-27")])).toBe("2026-08-21T20");
  });

  it("rend null sans point exploitable", () => {
    expect(debutDeLaSemaine([])).toBeNull();
  });
});

describe("rankPointsForPeriod — campagne", () => {
  const pt = (date: string) => ({ date, ranks: {}, tag: `${date} 15:36` });

  it("ne garde que les points depuis le déclenchement du scrutin", () => {
    const history = ["2026-08-24", "2026-08-26", "2026-08-27", "2026-08-29", "2026-08-30"].map(pt);
    expect(rankPointsForPeriod(history, "month").map((p) => p.date)).toEqual([
      "2026-08-27",
      "2026-08-29",
      "2026-08-30",
    ]);
  });
});
