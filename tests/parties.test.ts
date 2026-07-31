import { describe, it, expect } from "vitest";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";

const { buildLookup, computeStats, sparkPoints, samplePoints, buildRangeView, rowsAreFresh } = __test__;

type SR = { party: string; date_utc: string; date_montreal_tz: string; weighted_mentions: number; weighted_tone: number | null; computed_at?: string };

function row(party: string, date: string, mentions: number, tone: number | null = 0): SR {
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
    const stats = computeStats(dayRows, dayRows, dayRows)!;
    expect(stats).not.toBeNull();
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
    const stats = computeStats(dayRows, dayRows, dayRows)!;
    const view = buildRangeView(stats, "today");
    const pcq = view.rows.find((r) => r.key === "pcq")!;
    expect(pcq.inShadow).toBe(true);
    const plq = view.rows.find((r) => r.key === "plq")!;
    expect(plq.inShadow).toBe(false);
  });
  it("barWidthPct est dans [0, 100] pour tous les partis", () => {
    const dayRows = PARTY_KEYS.map((p, i) => row(p, DATE_A, [0.5, 0.25, 0.15, 0.07, 0.03][i]));
    const stats = computeStats(dayRows, dayRows, dayRows)!;
    const view = buildRangeView(stats, "today");
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
    const stats = computeStats(dayRows, dayRows, dayRows)!;
    const view = buildRangeView(stats, "today");
    const leaders = view.rows.filter((r) => r.showLeaderLabel);
    expect(leaders.length).toBe(1);
    expect(leaders[0].key).toBe("caq");
  });
  it("toneDirection est positive, negative ou neutral", () => {
    const dayRows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2, 0.1));
    const stats = computeStats(dayRows, dayRows, dayRows)!;
    const view = buildRangeView(stats, "today");
    for (const r of view.rows) {
      expect(["positive", "negative", "neutral"]).toContain(r.toneDirection);
    }
  });
  it("affiche un ton manquant comme indisponible, jamais neutre", () => {
    const rows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2, p === "caq" ? null : 0.1));
    const view = buildRangeView(computeStats(rows, rows, rows)!, "today");
    const caq = view.rows.find((r) => r.key === "caq")!;
    expect(caq.toneDirection).toBe("unavailable");
    expect(caq.toneLabel).toContain("Indisponible");
    expect(caq.toneTitle).not.toContain("Neutre");
  });
  it("décrit le ton ciblé envers le parti", () => {
    const rows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2, 0.1));
    const caq = buildRangeView(computeStats(rows, rows, rows)!, "today").rows.find((r) => r.key === "caq")!;
    expect(caq.toneTitle).toContain("envers ce parti");
    expect(caq.toneTitle).not.toContain("proportion nette de mots positifs");
  });
});

describe("rowsAreFresh", () => {
  const now = Date.parse("2026-07-31T12:00:00Z");
  it("utilise le timestamp le plus récent de la fenêtre historique", () => {
    const rows = [
      { ...row("caq", DATE_A, 1), computed_at: "2026-07-01T00:00:00Z" },
      { ...row("caq", DATE_A, 1), computed_at: "2026-07-31T06:00:00Z" },
    ];
    expect(rowsAreFresh(rows, 12, now)).toBe(true);
  });
  it("rejette les données périmées, invalides ou futures", () => {
    expect(rowsAreFresh([{ ...row("caq", DATE_A, 1), computed_at: "2026-07-30T23:00:00Z" }], 12, now)).toBe(false);
    expect(rowsAreFresh([{ ...row("caq", DATE_A, 1), computed_at: "invalid" }], 12, now)).toBe(false);
    expect(rowsAreFresh([{ ...row("caq", DATE_A, 1), computed_at: "2026-07-31T14:00:00Z" }], 12, now)).toBe(false);
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
