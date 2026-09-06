import { describe, expect, it } from "vitest";

import { debutDeLaSemaine, jourMoins, rankMovement, rankPointsForPeriod } from "@/lib/treemapRank";

const point = (date: string, rank: number, heure = "12:00") => ({
  date,
  ranks: { economy_and_labour: rank },
  tag: `${date} ${heure}`,
});

describe("rankPointsForPeriod", () => {
  it("garde les sept derniers jours : le dernier point et les six jours qui le précèdent", () => {
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

  it("ne repart pas de zéro le vendredi soir : un samedi montre encore sept jours", () => {
    // Le cas signalé par Laurence-Olivier le samedi 5 septembre : la semaine
    // partait du vendredi 20h et la frise ne portait qu'un point. Avec la
    // fenêtre glissante, le samedi voit le samedi précédent et tout ce qui suit.
    const history = ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"].map((d, i) => point(d, i + 1, "15:36"));

    expect(rankPointsForPeriod(history, "week").map((entry) => entry.date)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });

  it("lit un point daté d'un jour seul (la frise bâtie depuis les articles) sans le reculer d'un jour", () => {
    // Les frises Semaine et Campagne portent un point par jour, dont le `tag`
    // est le jour lui-même (« 2026-09-05 »). Lu comme minuit UTC, ce jour devenait
    // le 4 à 20h à Montréal : le premier jour de la fenêtre sortait du filtre.
    const history = ["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01",
      "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"].map((d, i) => ({ date: d, ranks: { economy_and_labour: i }, tag: d }));

    expect(rankPointsForPeriod(history, "week").map((entry) => entry.date)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
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

// La semaine du module = les SEPT derniers jours, comptés en jours de Montréal
// depuis le dernier point. Une fenêtre glissante : ni le calendrier, ni un
// vendredi 20h qui remet le compteur à zéro (Laurence-Olivier, 05-09).
describe("debutDeLaSemaine", () => {
  // Le tag est écrit en heure de Montréal par le raffineur (preuve CloudWatch du
  // 2026-09-02) : il se lit tel quel, sans conversion.
  const pt = (tagMontreal: string, date: string) => ({ date, ranks: {}, tag: tagMontreal });

  it("recule de six jours depuis le jour du dernier point", () => {
    // Dimanche 30 août : la semaine va du lundi 24 au dimanche 30.
    expect(debutDeLaSemaine([pt("2026-08-30 15:36", "2026-08-30")])).toBe("2026-08-24");
  });

  it("traverse un changement de mois", () => {
    expect(debutDeLaSemaine([pt("2026-09-02 03:36", "2026-09-02")])).toBe("2026-08-27");
  });

  it("ne dépend pas de l'heure de la passe : 19h36 ou 23h36, même jour, même début", () => {
    expect(debutDeLaSemaine([pt("2026-08-28 19:36", "2026-08-28")])).toBe("2026-08-22");
    expect(debutDeLaSemaine([pt("2026-08-28 23:36", "2026-08-28")])).toBe("2026-08-22");
  });

  it("accepte un point daté d'un jour seul, sans le lire comme minuit UTC", () => {
    expect(debutDeLaSemaine([pt("2026-09-05", "2026-09-05")])).toBe("2026-08-30");
  });

  it("rend null sans point exploitable", () => {
    expect(debutDeLaSemaine([])).toBeNull();
  });
});

describe("jourMoins", () => {
  it("recule d'un nombre de jours sans regarder le fuseau de la machine", () => {
    expect(jourMoins("2026-09-06", 6)).toBe("2026-08-31");
    expect(jourMoins("2026-09-06", 0)).toBe("2026-09-06");
    expect(jourMoins("2026-03-01", 1)).toBe("2026-02-28");
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

  it("garde le jour du déclenchement quand les points sont datés d'un jour seul", () => {
    // La frise Campagne bâtie depuis les articles : le 27 août, lu comme minuit
    // UTC, devenait le 26 à Montréal et tombait hors de la campagne.
    const history = ["2026-08-24", "2026-08-26", "2026-08-27", "2026-08-29", "2026-08-30"]
      .map((d) => ({ date: d, ranks: {}, tag: d }));
    expect(rankPointsForPeriod(history, "month").map((p) => p.date)).toEqual([
      "2026-08-27",
      "2026-08-29",
      "2026-08-30",
    ]);
  });
});
