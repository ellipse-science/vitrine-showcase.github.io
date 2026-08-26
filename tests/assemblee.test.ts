import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/assemblee";

const {
  fmtDateFr, fmtWords, computeRichnessLevels, buildEnjeuStack, buildSubtitle,
  buildPeriodView, buildPortraitIndex, lookupPortrait, citationExtrait,
  citationComplete, buildAffiliationIndex, affiliationHistoryFor,
} = __test__;

describe("citationExtrait", () => {
  it("ancre l'extrait sur le concept quand il se trouve après le budget", () => {
    const contexte = "Quand je suis arrivé ici, il y a huit ans, parmi mes priorités il y avait la question de la protection des lanceurs alerte et de leur travail essentiel.";
    const extrait = citationExtrait(contexte, "lanceurs alerte");

    expect(extrait).toContain("lanceurs alerte");
    expect(extrait).toMatch(/^… /);
    expect(extrait!.length).toBeLessThanOrEqual(95);
  });

  it("retrouve le concept sans tenir compte des accents ni de la casse", () => {
    const contexte = `${"Préambule politique et parlementaire. ".repeat(3)}L'ECONOMIE régionale demeure au centre de cette intervention.`;
    const extrait = citationExtrait(contexte, "économie");

    expect(extrait).toMatch(/^… /);
    expect(extrait).toContain("ECONOMIE");
  });

  it("recentre un concept qui chevauche la limite plutôt que de le couper", () => {
    const contexte = `${"Une introduction assez longue précède le passage central et fournit plusieurs détails. "}La participation publique éclaire ensuite la décision.`;
    const extrait = citationExtrait(contexte, "participation publique");

    expect(extrait).toContain("participation publique");
    expect(extrait).not.toContain("parti…");
    expect(extrait!.length).toBeLessThanOrEqual(95);
  });

  it("préserve une citation complète et son point final", () => {
    expect(citationExtrait("Une phrase complète.", "phrase")).toBe("Une phrase complète.");
  });

  it("accepte les mots du concept séparés par un déterminant", () => {
    expect(citationExtrait(
      "La protection des lanceurs d’alerte demeure une priorité.",
      "lanceurs alerte",
    )).toContain("lanceurs d’alerte");
  });

  it("omet une citation qui ne contient pas tous les mots du concept", () => {
    expect(citationExtrait(
      "Le projet de loi encadre plusieurs projets pilotes.",
      "hydrogène naturel",
    )).toBeUndefined();
  });

  it("valide aussi la citation complète affichée dans le tiroir de parti", () => {
    expect(citationComplete("La zone d’innovation soutient la recherche.", "zone innovation"))
      .toBe("La zone d’innovation soutient la recherche.");
    expect(citationComplete("Une phrase sans rapport.", "zone innovation")).toBeUndefined();
  });

  it("ne publie aucune citation hors sujet dans l’instantané réel", () => {
    const files = [
      "public/data/agora/agora_decideurs_qc.json",
      "public/data/agora/agora_decideurs_qc_deputes.json",
    ];
    for (const file of files) {
      const rows = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), "utf8"));
      for (const row of rows) {
        if (!row.signature_word || row.signature_word === "NA") continue;
        const citation = file.endsWith("_deputes.json")
          ? citationExtrait(row.signature_word_context, row.signature_word)
          : citationComplete(row.signature_word_context, row.signature_word);
        if (!citation) continue;
        if (file.endsWith("_deputes.json")) {
          expect(citation.length, `${file}: extrait trop long de ${row.deputy}`)
            .toBeLessThanOrEqual(95);
        }
        expect(
          citationComplete(citation, row.signature_word),
          `${file}: ${row.deputy ?? row.party} · ${row.signature_word}`,
        ).toBe(citation);
      }
    }
  });
});

describe("appariement des portraits", () => {
  const portraits = buildPortraitIndex([
    { deputy_id: "17929", nom: "Éric Girard (Groulx)", circonscription: "Groulx", circonscription_slug: "groulx" },
    { deputy_id: "17957", nom: "Éric Girard (Lac-Saint-Jean)", circonscription: "Lac-Saint-Jean", circonscription_slug: "lac-saint-jean" },
    { deputy_id: "17897", nom: "Pierre Fitzgibbon", circonscription: "Terrebonne", circonscription_slug: "terrebonne", asset_slug: "historique/17897" },
  ]);

  it("départage les deux Éric Girard par leur identifiant ANQ", () => {
    expect(lookupPortrait("Eric Girard", "17929", undefined, portraits)?.circonscription).toBe("Groulx");
    expect(lookupPortrait("Eric Girard", "17957", undefined, portraits)?.circonscription).toBe("Lac-Saint-Jean");
  });

  it("utilise la circonscription quand un ancien jeu de données n'a pas encore d'identifiant", () => {
    expect(lookupPortrait("Éric Girard (Groulx)", undefined, undefined, portraits)?.deputy_id).toBe("17929");
    expect(lookupPortrait("Éric Girard", undefined, "lacsaintjean", portraits)?.deputy_id).toBe("17957");
    expect(lookupPortrait("Éric Girard", undefined, undefined, portraits)).toBeUndefined();
  });

  it("retrouve un portrait historique par identifiant stable", () => {
    expect(lookupPortrait("Pierre Fitzgibbon", "17897", undefined, portraits)?.asset_slug).toBe("historique/17897");
  });
});

describe("historique d’affiliation", () => {
  const affiliations = buildAffiliationIndex([
    { deputy_id: "19275", deputy: "maite blanchette vezina", district_id: "rimouski", party: "CAQ", affiliation_start_date: "2022-10-03", affiliation_end_date: "2025-09-17", start_reason: "election", end_reason: "defection" },
    { deputy_id: "19275", deputy: "maite blanchette vezina", district_id: "rimouski", party: "IND", affiliation_start_date: "2025-09-18", affiliation_end_date: "2026-03-23", start_reason: "defection", end_reason: "defection" },
    { deputy_id: "19275", deputy: "maite blanchette vezina", district_id: "rimouski", party: "PCQ", affiliation_start_date: "2026-03-24", affiliation_end_date: "2026-10-05", start_reason: "defection", end_reason: "dissolution" },
  ]);

  it("date les trois affiliations de Maïté Blanchette Vézina dans la vue législature", () => {
    expect(affiliationHistoryFor(
      "Maïté Blanchette Vézina", "19275", "rimouski", "legislature",
      "2022-11-29", "2026-06-12", affiliations,
    )).toEqual([
      { label: "CAQ", startDate: "2022-10-03", endDate: "2025-09-17", startReason: "election", endReason: "defection" },
      { label: "Sans affiliation à un parti", startDate: "2025-09-18", endDate: "2026-03-23", startReason: "defection", endReason: "defection" },
      { label: "PCQ", startDate: "2026-03-24", startReason: "defection" },
    ]);
  });

  it("ne surcharge pas les vues courtes d’une chronologie de législature", () => {
    expect(affiliationHistoryFor(
      "Maïté Blanchette Vézina", "19275", "rimouski", "session",
      "2026-01-01", "2026-06-12", affiliations,
    )).toBeUndefined();
  });

  it("ne révèle pas dans une édition passée un changement encore futur", () => {
    expect(affiliationHistoryFor(
      "Maïté Blanchette Vézina", "19275", "rimouski", "legislature",
      "2022-11-29", "2025-09-10", affiliations,
    ))
      .toBeUndefined();
    expect(affiliationHistoryFor(
      "Maïté Blanchette Vézina", "19275", "rimouski", "legislature",
      "2022-11-29", "2025-10-01", affiliations,
    ))
      .toEqual([
        { label: "CAQ", startDate: "2022-10-03", endDate: "2025-09-17", startReason: "election", endReason: "defection" },
        { label: "Sans affiliation à un parti", startDate: "2025-09-18", startReason: "defection" },
      ]);
  });

  it("signale une élection partielle même sans changement d’affiliation", () => {
    const electionPartielle = buildAffiliationIndex([
      { deputy_id: "20193", deputy: "alex boivin", party: "PQ", affiliation_start_date: "2026-02-23", start_reason: "byelection" },
    ]);
    expect(affiliationHistoryFor(
      "Alex Boivin", "20193", undefined, "legislature",
      "2022-11-29", "2026-06-12", electionPartielle,
    )).toEqual([
      { label: "PQ", startDate: "2026-02-23", startReason: "byelection" },
    ]);
  });

  it("signale une démission même sans changement d’affiliation", () => {
    const demission = buildAffiliationIndex([
      { deputy_id: "17897", deputy: "pierre fitzgibbon", party: "CAQ", affiliation_start_date: "2022-10-03", affiliation_end_date: "2024-09-05", start_reason: "election", end_reason: "resignation" },
    ]);
    expect(affiliationHistoryFor(
      "Pierre Fitzgibbon", "17897", undefined, "legislature",
      "2022-11-29", "2026-06-12", demission,
    )).toEqual([
      { label: "CAQ", startDate: "2022-10-03", endDate: "2024-09-05", startReason: "election", endReason: "resignation" },
    ]);
  });

  it("ne fusionne pas les affiliations de deux homonymes sans identifiant", () => {
    const homonymes = buildAffiliationIndex([
      { deputy_id: "17929", deputy: "eric girard", district_id: "groulx", party: "CAQ", affiliation_start_date: "2022-10-03" },
      { deputy_id: "17957", deputy: "eric girard", district_id: "lacsaintjean", party: "CAQ", affiliation_start_date: "2022-10-03" },
    ]);

    expect(affiliationHistoryFor(
      "Éric Girard", undefined, undefined, "legislature",
      "2022-11-29", "2026-06-12", homonymes,
    )).toBeUndefined();
  });
});

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

  it("conserve le contexte complet du concept dans le tiroir", () => {
    const contexte = "Une citation volontairement longue qui dépasse le budget de la carte et doit néanmoins rester entière dans le tiroir du parti afin de préserver tout son contexte parlementaire.";
    const rows = [{
      period_type: "session", period_start_date: "2026-01-01", period_end_date: "2026-06-10",
      party: "caq", n_interventions: 50, word_count: 5000, lexical_richness: 0.6,
      tone_score: 0.01, editorial_angle: "x", signature_word: "contexte",
      signature_word_context: contexte,
    }];

    const view = buildPeriodView(rows as never, "session");

    expect(view.rows.find((row) => row.key === "caq")?.signatureWordContext).toBe(contexte);
  });

  it("sélectionne réellement la dernière journée de débats même si les lignes sont désordonnées", () => {
    const rows = [
      { period_type: "last_pdq", period_start_date: "2026-06-12", period_end_date: "2026-06-12", party: "caq", n_interventions: 12, word_count: 1200, lexical_richness: 0.5, tone_score: 0, editorial_angle: "récent" },
      { period_type: "last_pdq", period_start_date: "2026-05-29", period_end_date: "2026-05-29", party: "caq", n_interventions: 8, word_count: 800, lexical_richness: 0.5, tone_score: 0, editorial_angle: "ancien" },
    ];

    const view = buildPeriodView(rows as never, "last_pdq");

    expect(view.subtitle).toContain("12 juin 2026");
    expect(view.rows.find((row) => row.key === "caq")?.wordsRaw).toBe(1200);
  });

  it("conserve sous son ancien parti la parole d’une personne maintenant sans affiliation", () => {
    const partyRows = [{
      period_type: "legislature", period_start_date: "2022-11-29", period_end_date: "2026-06-12",
      party: "caq", n_interventions: 20, word_count: 1200, lexical_richness: 0.5,
      tone_score: 0, editorial_angle: "x",
    }];
    const deputyRows = [{
      period_type: "legislature", period_start_date: "2022-11-29", period_end_date: "2026-06-12",
      party: "caq", deputy: "Christian Dubé", n_interventions: 10, word_count: 800,
      lexical_richness: 0.5, tone_score: 0,
    }];
    const portraits = buildPortraitIndex([{
      nom: "Christian Dubé", circonscription: "La Prairie", circonscription_slug: "la-prairie",
      parti: "Indépendant",
    }]);

    const affiliations = buildAffiliationIndex([
      { deputy: "Christian Dubé", district_id: "laprairie", party: "CAQ", affiliation_start_date: "2022-10-03", affiliation_end_date: "2025-09-17" },
      { deputy: "Christian Dubé", district_id: "laprairie", party: "IND", affiliation_start_date: "2025-09-18", affiliation_end_date: "2026-10-05" },
    ]);

    const view = buildPeriodView(
      partyRows as never, "legislature", deputyRows as never, portraits, affiliations,
    );
    const deputy = view.rows.find((row) => row.key === "caq")?.deputies?.[0];

    expect(deputy?.name).toBe("Christian Dubé");
    expect(deputy?.affiliationHistory).toHaveLength(2);
  });
});
