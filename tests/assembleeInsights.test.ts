import { describe, it, expect } from "vitest";
import { facetResult } from "@/lib/data/assembleeInsights";
import type { AssembleeRow } from "@/lib/data/assemblee";

function row(overrides: Partial<AssembleeRow> & { key: AssembleeRow["key"] }): AssembleeRow {
  return {
    label: overrides.key.toUpperCase(),
    color: "#000",
    inShadow: false,
    ...overrides,
  };
}

describe("facetResult / tone", () => {
  it("qualifie le ton comme plus favorable que la moyenne", () => {
    const caq = row({ key: "caq", toneLeftPct: 70 });
    const others = [row({ key: "plq", toneLeftPct: 50 }), row({ key: "qs", toneLeftPct: 50 })];
    const result = facetResult(caq, "tone", [caq, ...others]);
    expect(result.body).toContain("Plus favorable");
  });

  it("qualifie le ton comme comparable quand l'écart est sous la tolérance", () => {
    const caq = row({ key: "caq", toneLeftPct: 51 });
    const others = [row({ key: "plq", toneLeftPct: 50 }), row({ key: "qs", toneLeftPct: 50 })];
    const result = facetResult(caq, "tone", [caq, ...others]);
    expect(result.body).toContain("Comparable");
  });

  it("retombe sur 50 quand toneLeftPct est absent", () => {
    const caq = row({ key: "caq" });
    const result = facetResult(caq, "tone", [caq]);
    expect(result.body).toContain("50 %");
  });
});

describe("facetResult / words", () => {
  it("qualifie le parti comme plus loquace que la moyenne", () => {
    const caq = row({ key: "caq", wordsRaw: 20000, wordsFormatted: "20 000" });
    const others = [row({ key: "plq", wordsRaw: 10000 }), row({ key: "qs", wordsRaw: 10000 })];
    const result = facetResult(caq, "words", [caq, ...others]);
    expect(result.body).toContain("Plus loquace");
  });

  it("n'inclut aucune comparaison quand le parti est seul", () => {
    const caq = row({ key: "caq", wordsRaw: 20000, wordsFormatted: "20 000" });
    const result = facetResult(caq, "words", [caq]);
    expect(result.body).toBe("20 000 mots prononcés cette période. ");
  });
});

describe("facetResult / issue", () => {
  it("signale les autres partis qui partagent le même enjeu dominant", () => {
    const topSeg = { color: "#111", widthPct: 40, label: "Écon.", title: "Économie" };
    const caq = row({ key: "caq", enjeuStack: [topSeg] });
    const plq = row({ key: "plq", enjeuStack: [{ ...topSeg }] });
    const result = facetResult(caq, "issue", [caq, plq]);
    expect(result.body).toContain("1 autre parti actif partage aussi cette priorité.");
  });

  it("indique l'absence d'enjeu détecté quand la pile est vide", () => {
    const caq = row({ key: "caq", enjeuStack: [] });
    const result = facetResult(caq, "issue", [caq]);
    expect(result.body).toBe("Aucun enjeu détecté cette période.");
  });
});
