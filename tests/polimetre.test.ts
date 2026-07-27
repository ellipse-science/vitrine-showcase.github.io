import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/polimetre";

const { realText, shortenPledge, buildView } = __test__;

// Ligne minimale du datamart ; les surcharges portent le cas testé.
function row(over: Record<string, unknown> = {}) {
  return {
    country_id: "QC",
    week_end_date: "2026-07-24",
    pledge_number: "42",
    pledge_text_fr: "[Un gouvernement de la CAQ réélu s'engage à] abolir la taxe sur les carburants dès le premier budget",
    pledge_en: "Abolish the fuel tax",
    verdict: "Promesse tenue",
    category: "Économie",
    salience_index: 10,
    previous_salience_index: 5,
    delta_index: 5,
    rank_current: 1,
    rank_delta: 0,
    n_mentions: 3,
    titles: "",
    urls: "",
    ...over,
  };
}

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

// Câblage datamart → vue : ce que l'utilisateur voit réellement selon l'état
// de l'enrichissement LLM (peuplé / sentinelle "NA" / colonne absente).
describe("buildView — libellé court et résumé IA", () => {
  const WEEK = ["2026-07-24"];

  it("utilise pledge_short_fr comme titre quand le LLM a produit un libellé", () => {
    const [p] = buildView([row({ pledge_short_fr: "Abolir la taxe sur les carburants" })], WEEK, []);
    expect(p.title).toBe("Abolir la taxe sur les carburants");
  });

  it("expose le résumé hebdo sur une période d'une seule semaine", () => {
    const [p] = buildView(
      [row({ coverage_summary_week: "Couverture dominée par le budget.", coverage_summary_month: "Résumé mensuel." })],
      WEEK,
      [],
    );
    expect(p.summary).toBe("Couverture dominée par le budget.");
  });

  it("bascule sur le résumé mensuel dès que la période couvre plusieurs semaines", () => {
    const rows = [
      row({ week_end_date: "2026-07-17", coverage_summary_week: "Hebdo 17.", coverage_summary_month: "Résumé mensuel." }),
      row({ week_end_date: "2026-07-24", coverage_summary_week: "Hebdo 24.", coverage_summary_month: "Résumé mensuel." }),
    ];
    const [p] = buildView(rows, ["2026-07-17", "2026-07-24"], []);
    expect(p.summary).toBe("Résumé mensuel.");
  });

  // État actuel du datamart : le raffineur écrit "NA" quand l'infer-api est down.
  it('retombe sur le titre tronqué et un résumé nul quand les colonnes valent "NA"', () => {
    const [p] = buildView(
      [row({ pledge_short_fr: "NA", coverage_summary_week: "NA", coverage_summary_month: "NA" })],
      WEEK,
      [],
    );
    expect(p.title).toBe(shortenPledge(row().pledge_text_fr));
    expect(p.title).not.toMatch(/NA/);
    expect(p.summary).toBeNull();
  });

  // Semaines antérieures au déploiement du raffineur : colonnes absentes du JSON.
  it("retombe sur le titre tronqué quand les colonnes sont absentes (semaines non rétro-remplies)", () => {
    const [p] = buildView([row()], WEEK, []);
    expect(p.title).toBe(shortenPledge(row().pledge_text_fr));
    expect(p.summary).toBeNull();
  });

  // Un rétro-remplissage partiel ne doit pas casser les semaines restées vides.
  it("gère un mélange de promesses enrichies et non enrichies", () => {
    const rows = [
      row({ pledge_number: "1", salience_index: 20, pledge_short_fr: "Libellé IA" }),
      row({ pledge_number: "2", salience_index: 10, pledge_short_fr: "NA" }),
    ];
    const view = buildView(rows, WEEK, []);
    expect(view.map((p) => p.title)).toEqual(["Libellé IA", shortenPledge(row().pledge_text_fr)]);
  });
});
