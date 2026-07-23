import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/polimetre";

const { realText, shortenPledge } = __test__;

describe("realText", () => {
  it("renvoie null pour null", () => {
    expect(realText(null)).toBeNull();
  });
  it("renvoie null pour undefined", () => {
    expect(realText(undefined)).toBeNull();
  });
  it('renvoie null pour une chaîne vide', () => {
    expect(realText("")).toBeNull();
  });
  it('renvoie null pour une chaîne d\'espaces', () => {
    expect(realText("   ")).toBeNull();
  });
  it('renvoie null pour la sentinelle "NA" (majuscules)', () => {
    expect(realText("NA")).toBeNull();
  });
  it('renvoie null pour la sentinelle "na" (minuscules)', () => {
    expect(realText("na")).toBeNull();
  });
  it('renvoie null pour "NA" entouré d\'espaces', () => {
    expect(realText("  NA  ")).toBeNull();
  });
  it("renvoie le texte trimé pour une valeur normale", () => {
    expect(realText("  Texte normal  ")).toBe("Texte normal");
  });
  it("ne supprime pas un texte qui contient 'NA' comme sous-chaîne", () => {
    expect(realText("ANALYSE")).toBe("ANALYSE");
  });
});

describe("shortenPledge", () => {
  it("renvoie une chaîne vide pour null", () => {
    expect(shortenPledge(null)).toBe("");
  });
  it("renvoie une chaîne vide pour undefined", () => {
    expect(shortenPledge(undefined)).toBe("");
  });
  it("retire l'en-tête entre crochets", () => {
    const result = shortenPledge("[Un gouvernement de la CAQ réélu s'engage à] Réduire les taxes");
    expect(result).not.toMatch(/\[/);
    expect(result).toMatch(/^Réduire/);
  });
  it("tronque à 9 mots par défaut et ajoute '…'", () => {
    const result = shortenPledge("un deux trois quatre cinq six sept huit neuf dix onze");
    expect(result).toMatch(/…$/);
    const words = result.replace(/…$/, "").trim().split(" ");
    expect(words.length).toBe(9);
  });
  it("ne tronque pas si le texte a exactement 9 mots ou moins", () => {
    const result = shortenPledge("un deux trois quatre cinq six sept huit neuf");
    expect(result).not.toMatch(/…$/);
  });
  it("met la première lettre en majuscule", () => {
    const result = shortenPledge("abolir les frais");
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });
  it("respecte le paramètre maxWords", () => {
    const result = shortenPledge("un deux trois quatre cinq six", 3);
    expect(result).toMatch(/…$/);
    const words = result.replace(/…$/, "").trim().split(" ");
    expect(words.length).toBe(3);
  });
});
