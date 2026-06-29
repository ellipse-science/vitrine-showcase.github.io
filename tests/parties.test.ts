import { describe, it, expect } from "vitest";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";

const { isoWeekStart, buildDayLookup, computeStats, sparkPoints, samplePoints, buildRangeView } = __test__;

type Row = { party: string; date_utc: string; weighted_mentions: number; weighted_tone: number; pass: string };

function row(party: string, date: string, mentions: number, tone = 0, pass = "pm"): Row {
  return { party, date_utc: date, weighted_mentions: mentions, weighted_tone: tone, pass };
}

describe("isoWeekStart", () => {
  it("retourne toujours un lundi (UTC day 1)", () => {
    for (const d of ["2026-06-08", "2026-06-10", "2026-06-14"]) {
      const start = isoWeekStart(d);
      expect(new Date(start + "T12:00:00Z").getUTCDay()).toBe(1);
    }
  });
  it("renvoie le même lundi pour tous les jours d'une semaine ISO", () => {
    expect(isoWeekStart("2026-06-10")).toBe(isoWeekStart("2026-06-08"));
    expect(isoWeekStart("2026-06-10")).toBe(isoWeekStart("2026-06-14"));
  });
});

describe("buildDayLookup", () => {
  it("déduplique (date, parti, pass) en gardant le plus grand weighted_mentions", () => {
    const lut = buildDayLookup([
      row("PLQ", "2026-06-10", 5, 0, "pm"),
      row("PLQ", "2026-06-10", 9, 0, "pm"), // même clé, mentions plus hautes -> gagne
    ]);
    expect(lut["2026-06-10"]["PLQ"].mentions).toBe(9);
  });
  it("préfère un pass plus tardif avec mentions non nulles (pm > am)", () => {
    const lut = buildDayLookup([
      row("CAQ", "2026-06-10", 3, 0, "am"),
      row("CAQ", "2026-06-10", 7, 0, "pm"),
    ]);
    expect(lut["2026-06-10"]["CAQ"].mentions).toBe(7);
  });
  it("normalise la casse du parti en majuscules", () => {
    const lut = buildDayLookup([row("plq", "2026-06-10", 4)]);
    expect(lut["2026-06-10"]["PLQ"]).toBeDefined();
  });
});

describe("computeStats", () => {
  it("renvoie null quand il n'y a aucune donnée", () => {
    expect(computeStats([])).toBeNull();
  });
  it("renvoie une stat par parti connu et des parts de voix qui somment à ~1", () => {
    const rows = [
      row("PLQ", "2026-06-10", 40),
      row("CAQ", "2026-06-10", 30),
      row("QS", "2026-06-10", 20),
      row("PQ", "2026-06-10", 10),
      row("PCQ", "2026-06-10", 0),
    ];
    const stats = computeStats(rows)!;
    expect(stats).not.toBeNull();
    expect(stats.length).toBe(PARTY_KEYS.length);
    const sumToday = stats.reduce((s, st) => s + st.sov.today, 0);
    expect(sumToday).toBeCloseTo(1, 5);
  });
});

describe("buildRangeView", () => {
  it("met en ombre un parti sous le seuil (<5%) et étiquette le leader", () => {
    const rows = [
      row("PLQ", "2026-06-10", 90),
      row("CAQ", "2026-06-10", 8),
      row("QS", "2026-06-10", 2), // 2% -> shadow
      row("PQ", "2026-06-10", 0),
      row("PCQ", "2026-06-10", 0),
    ];
    const stats = computeStats(rows)!;
    const view = buildRangeView(stats, "today");
    const leader = view.rows[0];
    expect(leader.key).toBe("plq");
    expect(leader.showLeaderLabel).toBe(true);
    const qs = view.rows.find((r) => r.key === "qs")!;
    expect(qs.inShadow).toBe(true);
    for (const r of view.rows) {
      expect(r.barWidthPct).toBeGreaterThanOrEqual(0);
      expect(r.barWidthPct).toBeLessThanOrEqual(100);
      expect(r.toneLeftPct).toBeGreaterThanOrEqual(0);
      expect(r.toneLeftPct).toBeLessThanOrEqual(100);
    }
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
  it("samplePoints: échantillonne au plus n points", () => {
    const many: [number, number][] = Array.from({ length: 20 }, (_, i) => [i, i] as [number, number]);
    expect(samplePoints(many, 7).length).toBe(7);
  });
});
