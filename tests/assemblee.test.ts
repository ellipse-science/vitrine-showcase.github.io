import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/assemblee";

const { fmtDateFr, fmtWords, computeRichnessLevels, buildEnjeuStack, buildSubtitle, buildPeriodView } = __test__;

describe("fmtDateFr", () => {
  it("formate une date ISO en français", () => {
    expect(fmtDateFr("2026-06-10")).toBe("10 juin 2026");
  });
  it("renvoie la chaîne telle quelle si invalide", () => {
    expect(fmtDateFr("2026")).toBe("2026");
  });
});

describe("fmtWords", () => {
  it("ajoute un séparateur de milliers", () => {
    const out = fmtWords(12840);
    expect(out.replace(/\s/g, "")).toBe("12840");
    expect(out.length).toBe(6); // 5 chiffres + 1 séparateur
  });
  it("ne sépare pas sous 1000", () => {
    expect(fmtWords(840)).toBe("840");
  });
});

describe("computeRichnessLevels", () => {
  it("met tout le monde à 3 quand les valeurs sont à <0.01 d'écart", () => {
    expect(computeRichnessLevels({ a: 0.5, b: 0.505 })).toEqual({ a: 3, b: 3 });
  });
  it("échelonne 1..5 relativement (min -> 1, max -> 5)", () => {
    const lvl = computeRichnessLevels({ a: 0, b: 1 });
    expect(lvl.a).toBe(1);
    expect(lvl.b).toBe(5);
  });
  it("renvoie {} sans donnée", () => {
    expect(computeRichnessLevels({})).toEqual({});
  });
});

describe("buildEnjeuStack", () => {
  it("filtre les enjeux <4%, tronque à ~80% et ajoute un segment Reste", () => {
    const stack = buildEnjeuStack({
      period_type: "session",
      period_start_date: "2026-01-01",
      period_end_date: "2026-06-10",
      party: "caq",
      n_interventions: 100,
      word_count: 1000,
      lexical_richness: 0.5,
      tone_score: 0,
      editorial_angle: "NA",
      economy_and_labour: 0.5,
      health_and_social_services: 0.3,
      education: 0.03, // <0.04 -> filtré
    } as never);
    const labels = stack.map((s) => s.label);
    expect(labels).toContain("Économie");
    expect(labels).toContain("Santé");
    expect(labels).not.toContain("Éduc.");
    const reste = stack.find((s) => s.isReste);
    expect(reste).toBeDefined();
    expect(reste!.widthPct).toBe(20);
  });
});

describe("buildSubtitle", () => {
  it("last_pdq inclut la date formatée", () => {
    expect(buildSubtitle("last_pdq", "2026-06-10")).toContain("10 juin 2026");
  });
  it("session et législature incluent l'année", () => {
    expect(buildSubtitle("session", "2026-06-10")).toContain("2026");
    expect(buildSubtitle("legislature", "2026-06-10")).toContain("2026");
  });
});

describe("buildPeriodView", () => {
  it("filtre par période, trie par interventions et met en ombre les partis absents", () => {
    const rows = [
      { period_type: "session", period_start_date: "2026-01-01", period_end_date: "2026-06-10", party: "caq", n_interventions: 50, word_count: 5000, lexical_richness: 0.6, tone_score: 0.01, editorial_angle: "x", economy_and_labour: 0.5 },
      { period_type: "session", period_start_date: "2026-01-01", period_end_date: "2026-06-10", party: "plq", n_interventions: 80, word_count: 8000, lexical_richness: 0.7, tone_score: -0.02, editorial_angle: "y", health_and_social_services: 0.6 },
      { period_type: "last_pdq", period_start_date: "2026-06-10", period_end_date: "2026-06-10", party: "qs", n_interventions: 10, word_count: 1000, lexical_richness: 0.5, tone_score: 0, editorial_angle: "z" },
    ];
    const view = buildPeriodView(rows as never, "session");
    expect(view.period).toBe("session");
    // Seuls caq et plq ont des interventions en session ; plq (80) avant caq (50).
    expect(view.rows[0].key).toBe("plq");
    expect(view.rows[0].inShadow).toBe(false);
    const qs = view.rows.find((r) => r.key === "qs")!;
    expect(qs.inShadow).toBe(true); // aucune intervention en "session"
    expect(qs.enjeuStack).toBeUndefined();
  });
});
