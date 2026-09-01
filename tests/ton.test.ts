import { describe, expect, it } from "vitest";

import { formatEcartTon, phraseEcartTon } from "@/lib/ton";

describe("formatEcartTon", () => {
  it("écrit le signe et l'unité — jamais un score nu", () => {
    expect(formatEcartTon(0.42)).toBe("+42 pts");
    expect(formatEcartTon(-0.42)).toBe("−42 pts");
  });

  it("emploie le vrai signe MOINS, pas un trait d'union", () => {
    // Dans une colonne, le trait d'union ne se lit pas à la même hauteur que le
    // plus : les deux signes ne s'alignent plus.
    expect(formatEcartTon(-0.42).startsWith("−")).toBe(true);
    expect(formatEcartTon(-0.42).startsWith("-")).toBe(false);
  });

  it("accorde le singulier", () => {
    expect(formatEcartTon(0.01)).toBe("+1 pt");
    expect(formatEcartTon(-0.01)).toBe("−1 pt");
    expect(formatEcartTon(0.02)).toBe("+2 pts");
  });

  it("le zéro ne porte PAS de signe", () => {
    // « +0 pt » laisserait croire à un écart favorable qui n'existe pas.
    expect(formatEcartTon(0)).toBe("0 pt");
    expect(formatEcartTon(-0.001)).toBe("0 pt");
    expect(formatEcartTon(0.004)).toBe("0 pt");
  });

  it("en POINTS et jamais en pour cent — règle du module", () => {
    // « +34 % » ne dit pas si l'on parle de points ou d'un rapport.
    expect(formatEcartTon(0.42)).not.toContain("%");
    expect(phraseEcartTon(0.42)).not.toContain("%");
  });

  it("une mesure absente se dit, au lieu de rendre « NaN pt »", () => {
    expect(formatEcartTon(Number.NaN)).toBe("n. d.");
    expect(formatEcartTon(Infinity)).toBe("n. d.");
  });
});

describe("phraseEcartTon", () => {
  it("NOMME le point de comparaison, à chaque fois", () => {
    // Sans lui, le nombre redevient le score qui ne voulait rien dire.
    expect(phraseEcartTon(0.42)).toContain("que celle des autres partis");
    expect(phraseEcartTon(-0.42)).toContain("que celle des autres partis");
    expect(phraseEcartTon(0)).toContain("que celle des autres partis");
  });

  it("dit le SENS en toutes lettres", () => {
    expect(phraseEcartTon(-0.42)).toContain("42 points plus négative");
    expect(phraseEcartTon(0.42)).toContain("42 points plus positive");
  });

  it("le zéro ne se dit ni positif ni négatif", () => {
    expect(phraseEcartTon(0)).toContain("ni plus positive ni plus négative");
  });
});
