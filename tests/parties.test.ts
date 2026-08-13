import { describe, it, expect } from "vitest";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";

const { buildLookup, computeStats, sparkPoints, samplePoints, buildRangeView, buildChart, axisTop } =
  __test__;

/** computeStats renvoie désormais { stats, dates } — les dates servent à
 *  étiqueter l'axe horizontal de la course. */
function statsOf(day: SR[], week: SR[], month: SR[]) {
  const c = computeStats(day, week, month)!;
  return c;
}

type SR = { party: string; date_utc: string; date_montreal_tz: string; weighted_mentions: number; weighted_tone: number; computed_at?: string };

function row(party: string, date: string, mentions: number, tone = 0): SR {
  return { party, date_utc: date, date_montreal_tz: date, weighted_mentions: mentions, weighted_tone: tone };
}

const DATE_A = "2026-06-10";

describe("buildLookup", () => {
  it("indexe par date puis parti en minuscules", () => {
    const lut = buildLookup([row("PLQ", DATE_A, 0.4)]);
    expect(lut[DATE_A]["plq"].mentions).toBeCloseTo(0.4);
  });
  it("garde la première occurrence en cas de doublon (date, parti)", () => {
    const lut = buildLookup([
      row("caq", DATE_A, 0.5),
      row("caq", DATE_A, 0.9),
    ]);
    expect(lut[DATE_A]["caq"].mentions).toBeCloseTo(0.5);
  });
});

describe("computeStats", () => {
  it("renvoie null quand les trois fichiers sont vides", () => {
    expect(computeStats([], [], [])).toBeNull();
  });
  it("renvoie null si l'un des fichiers est vide", () => {
    const rows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2));
    expect(computeStats(rows, [], rows)).toBeNull();
  });
  it("renvoie une stat par parti et des SOV qui somment à ~1", () => {
    const dayRows = [
      row("caq", DATE_A, 0.43), row("pq", DATE_A, 0.26),
      row("qs",  DATE_A, 0.18), row("plq", DATE_A, 0.09), row("pcq", DATE_A, 0.04),
    ];
    const { stats } = statsOf(dayRows, dayRows, dayRows);
    expect(stats.length).toBe(PARTY_KEYS.length);
    const sumToday = stats.reduce((s, st) => s + st.sov.today, 0);
    expect(sumToday).toBeCloseTo(1, 5);
  });
});

describe("buildRangeView", () => {
  it("met en ombre un parti sous le seuil de 2 %", () => {
    const dayRows = [
      row("caq", DATE_A, 0.60), row("pq",  DATE_A, 0.25),
      row("qs",  DATE_A, 0.10), row("plq", DATE_A, 0.04), row("pcq", DATE_A, 0.01),
    ];
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    const pcq = view.rows.find((r) => r.key === "pcq")!;
    expect(pcq.inShadow).toBe(true);
    const plq = view.rows.find((r) => r.key === "plq")!;
    expect(plq.inShadow).toBe(false);
  });
  it("barWidthPct est dans [0, 100] pour tous les partis", () => {
    const dayRows = PARTY_KEYS.map((p, i) => row(p, DATE_A, [0.5, 0.25, 0.15, 0.07, 0.03][i]));
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    for (const r of view.rows) {
      expect(r.barWidthPct).toBeGreaterThanOrEqual(0);
      expect(r.barWidthPct).toBeLessThanOrEqual(100);
    }
  });
  it("showLeaderLabel uniquement pour le premier parti non-ombre", () => {
    const dayRows = [
      row("caq", DATE_A, 0.60), row("pq",  DATE_A, 0.25),
      row("qs",  DATE_A, 0.10), row("plq", DATE_A, 0.04), row("pcq", DATE_A, 0.01),
    ];
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    const leaders = view.rows.filter((r) => r.showLeaderLabel);
    expect(leaders.length).toBe(1);
    expect(leaders[0].key).toBe("caq");
  });
  it("toneDirection est positive, negative ou neutral", () => {
    const dayRows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2, 0.1));
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    for (const r of view.rows) {
      expect(["positive", "negative", "neutral"]).toContain(r.toneDirection);
    }
  });
});

describe("buildChart — la course", () => {
  const DATES = ["2026-06-08", "2026-06-09", "2026-06-10"];
  /** Cinq partis sur trois jours, parts de voix stables et bien séparées. */
  function threeDays(): SR[] {
    const vals: Record<string, number> = { caq: 0.4, pq: 0.3, qs: 0.15, plq: 0.1, pcq: 0.05 };
    return DATES.flatMap((d) => PARTY_KEYS.map((p) => row(p, d, vals[p])));
  }

  it("place toutes les lignes sur UNE échelle commune : à part de voix égale, même hauteur", () => {
    const rows = DATES.flatMap((d) => PARTY_KEYS.map((p) => row(p, d, 0.2)));
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, "today", dates);
    const ys = chart.series.map((s) => s.lastY);
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 6);
  });

  it("un parti deux fois plus couvert est deux fois plus haut au-dessus de zéro", () => {
    const rows = DATES.flatMap((d) => [
      row("caq", d, 0.4), row("pq", d, 0.2),
      row("qs", d, 0.2), row("plq", d, 0.1), row("pcq", d, 0.1),
    ]);
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, "today", dates);
    const caq = chart.series.find((s) => s.key === "caq")!;
    const pq = chart.series.find((s) => s.key === "pq")!;
    // y est mesuré depuis le HAUT du viewBox : la hauteur au-dessus de zéro
    // vaut donc (height - y). C'est ELLE qui doit doubler, pas y.
    expect(chart.height - caq.lastY).toBeCloseTo(2 * (chart.height - pq.lastY), 6);
  });

  it("l'axe vertical plafonne au-dessus du maximum observé, jamais en dessous", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, "today", dates);
    const leader = chart.series[0];
    expect(leader.lastY).toBeGreaterThanOrEqual(0);
    expect(leader.lastPct).toBe(40);
  });

  it("axisTop : plancher à 20 % pour ne pas dramatiser une course serrée", () => {
    expect(axisTop(4)).toBe(20);
    expect(axisTop(35)).toBe(40);
    expect(axisTop(40)).toBe(40);
  });

  it("les lignes sont triées par part de voix décroissante", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, "today", dates);
    const pcts = chart.series.map((s) => s.lastPct);
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a));
  });

  it("une seule date ⇒ tooShort, pour que le composant n'affiche pas une « courbe » d'un point", () => {
    const rows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2));
    const { stats, dates } = statsOf(rows, rows, rows);
    expect(buildChart(stats, "today", dates).tooShort).toBe(true);
  });

  it("écarte les étiquettes de partis au coude à coude, sans déplacer les points", () => {
    // Course serrée : quatre partis en un point d'écart. Sans répulsion, les
    // quatre étiquettes se superposeraient.
    const rows = DATES.flatMap((d) => [
      row("caq", d, 0.251), row("pq", d, 0.250),
      row("qs", d, 0.249), row("plq", d, 0.248), row("pcq", d, 0.002),
    ]);
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, "today", dates);

    const serres = chart.series.filter((s) => s.lastPct >= 20);
    expect(serres.length).toBe(4);
    for (let i = 1; i < serres.length; i++) {
      expect(serres[i].labelY - serres[i - 1].labelY).toBeGreaterThanOrEqual(4.19);
    }
    // Les points, eux, restent sur la donnée : presque confondus.
    const ys = serres.map((s) => s.lastY);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });

  it("les étiquettes restent dans le cadre même quand tout le monde est au plancher", () => {
    const rows = DATES.flatMap((d) => PARTY_KEYS.map((p) => row(p, d, 0.2)));
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, "today", dates);
    for (const s of chart.series) {
      expect(s.labelY).toBeGreaterThanOrEqual(0);
      expect(s.labelY).toBeLessThanOrEqual(chart.height);
    }
  });

  it("étiquette l'axe horizontal avec la première et la dernière date", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, "today", dates);
    expect(chart.xLabels[0].label).toBe("8 juin");
    expect(chart.xLabels.at(-1)!.label).toBe("10 juin");
  });
});

describe("sparkPoints / samplePoints", () => {
  it("sparkPoints: liste vide -> []", () => {
    expect(sparkPoints([], 100, 30)).toEqual([]);
  });
  it("sparkPoints: une seule valeur -> centrée horizontalement", () => {
    const pts = sparkPoints([0.5], 100, 30);
    expect(pts.length).toBe(1);
    expect(pts[0][0]).toBe(50);
  });
  it("samplePoints: retourne au plus n points", () => {
    const pts: [number, number][] = Array.from({ length: 20 }, (_, i) => [i, i] as [number, number]);
    expect(samplePoints(pts, 7).length).toBe(7);
  });
  it("samplePoints: inclut toujours le dernier point", () => {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [i, i] as [number, number]);
    const sampled = samplePoints(pts, 4);
    expect(sampled[sampled.length - 1]).toEqual(pts[pts.length - 1]);
  });
});
