import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/polimetre";

const { realText, shortenPledge, buildView, snapshotWindow } = __test__;

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

// « flat » affiche « Aucun changement » : l'afficher faute de point de comparaison
// serait une affirmation fausse. D'où l'état « unknown ».
describe("buildView — tendance sans période de comparaison", () => {
  const WEEK = ["2026-07-24"];

  it("renvoie unknown quand la période précédente n'a pas été publiée", () => {
    const [p] = buildView([row()], WEEK, []);
    expect(p.trend).toEqual({ dir: "unknown", delta: 0 });
  });

  it("renvoie unknown pour une promesse absente de la période précédente", () => {
    const rows = [
      row({ pledge_number: "1", week_end_date: "2026-07-17", salience_index: 5 }),
      row({ pledge_number: "1", week_end_date: "2026-07-24", salience_index: 8 }),
      row({ pledge_number: "2", week_end_date: "2026-07-24", salience_index: 20 }), // entrante
    ];
    const view = buildView(rows, WEEK, ["2026-07-17"]);
    expect(view.find((p) => p.pledgeNumber === "2")!.trend.dir).toBe("unknown");
  });

  it("distingue un rang réellement inchangé", () => {
    const rows = [
      row({ pledge_number: "1", week_end_date: "2026-07-17", salience_index: 20 }),
      row({ pledge_number: "2", week_end_date: "2026-07-17", salience_index: 10 }),
      row({ pledge_number: "1", week_end_date: "2026-07-24", salience_index: 30 }),
      row({ pledge_number: "2", week_end_date: "2026-07-24", salience_index: 15 }),
    ];
    const view = buildView(rows, WEEK, ["2026-07-17"]);
    expect(view.map((p) => p.trend.dir)).toEqual(["flat", "flat"]);
  });
});

// Chaque snapshot couvre une fenêtre GLISSANTE de 7 jours. La sélection doit donc
// se faire par date, jamais par position de ligne, sous peine d'additionner des
// fenêtres qui se recouvrent.
describe("snapshotWindow — fenêtres disjointes quelle que soit la cadence", () => {
  const FRIDAYS = [
    "2026-06-05", "2026-06-12", "2026-06-19", "2026-06-26",
    "2026-07-03", "2026-07-10", "2026-07-17", "2026-07-24",
  ];

  it("suit les pas de 7 jours en publication hebdomadaire", () => {
    expect(snapshotWindow(FRIDAYS, "2026-07-24", 4)).toEqual([
      "2026-07-24", "2026-07-17", "2026-07-10", "2026-07-03",
    ]);
  });

  // Régression : en cadence quotidienne, prendre les 4 dernières LIGNES donnait
  // 4 jours consécutifs, chevauchés à 6/7 — la même couverture comptée 4 fois.
  it("ignore les snapshots intermédiaires en publication quotidienne", () => {
    const daily = [
      "2026-07-06", "2026-07-13", "2026-07-20",
      "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27",
    ];
    expect(snapshotWindow(daily, "2026-07-27", 4)).toEqual([
      "2026-07-27", "2026-07-20", "2026-07-13", "2026-07-06",
    ]);
  });

  it("laisse un trou quand un run a été manqué plutôt que d'emprunter un voisin", () => {
    const withGap = ["2026-07-03", "2026-07-10", "2026-07-24"]; // 2026-07-17 jamais publié
    expect(snapshotWindow(withGap, "2026-07-24", 4)).toEqual(["2026-07-24", "2026-07-10", "2026-07-03"]);
  });

  it("tolère un snapshot décalé de moins d'une demi-semaine", () => {
    expect(snapshotWindow(["2026-07-24", "2026-07-15"], "2026-07-24", 2)).toEqual([
      "2026-07-24", "2026-07-15",
    ]);
  });

  it("ne réutilise jamais deux fois le même snapshot", () => {
    expect(snapshotWindow(["2026-07-24"], "2026-07-24", 4)).toEqual(["2026-07-24"]);
  });

  // Cas réel du 28 juillet : reprise de publication 4 jours après le dernier
  // snapshot. Les deux fenêtres se recouvrent sur 3 jours — les additionner
  // compterait cette couverture deux fois. La tolérance seule les acceptait.
  it("écarte un snapshot trop rapproché même s'il tombe dans la tolérance", () => {
    const resumed = ["2026-07-03", "2026-07-10", "2026-07-24", "2026-07-28"];
    expect(snapshotWindow(resumed, "2026-07-28", 4)).toEqual(["2026-07-28", "2026-07-10"]);
  });

  it("garde au moins 7 jours entre deux snapshots retenus, quelle que soit la cadence", () => {
    const dense = ["2026-07-02", "2026-07-09", "2026-07-12", "2026-07-16", "2026-07-23", "2026-07-30"];
    const picked = snapshotWindow(dense, "2026-07-30", 4);
    const gaps = picked.slice(1).map((w, i) => (Date.parse(picked[i]) - Date.parse(w)) / 86_400_000);
    expect(gaps.every((g) => g >= 7)).toBe(true);
  });

  // La fenêtre précédente sert au calcul des tendances : elle doit être disjointe
  // de la courante, sinon la flèche compare deux périodes qui se recouvrent.
  it("produit une fenêtre précédente sans intersection avec la courante", () => {
    const current = snapshotWindow(FRIDAYS, "2026-07-24", 4);
    const previous = snapshotWindow(FRIDAYS, "2026-07-24", 4, 4);
    expect(previous).toEqual(["2026-06-26", "2026-06-19", "2026-06-12", "2026-06-05"]);
    expect(current.filter((w) => previous.includes(w))).toEqual([]);
  });
});
