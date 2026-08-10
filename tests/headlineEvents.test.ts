import { describe, it, expect } from "vitest";
import { __test__, selectHeroFromRawEvents } from "@/lib/data/headlineEvents";

const { latestIssueRow, parseIssuesMeta, capitalizeObject, firstSeenSaillantLabel, dedupeByStoryline, buildIssueMedia } = __test__;

describe("latestIssueRow", () => {
  it("renvoie null sur une liste vide", () => {
    expect(latestIssueRow([])).toBeNull();
  });
  it("choisit le tag le plus récent (ordre lexical décroissant)", () => {
    const row = latestIssueRow([
      { tag: "2026-06-01 07:36", date_utc: "2026-06-01", pass: "pm" },
      { tag: "2026-06-05 07:36", date_utc: "2026-06-05", pass: "pm" },
    ]);
    expect(row?.tag).toBe("2026-06-05 07:36");
  });
  it("à tag égal, départage par pass (pm > am)", () => {
    const row = latestIssueRow([
      { tag: "2026-06-05 07:36", date_utc: "2026-06-05", pass: "am" },
      { tag: "2026-06-05 07:36", date_utc: "2026-06-05", pass: "pm" },
    ]);
    expect(row?.pass).toBe("pm");
  });
  it("à tag/date/pass égaux, préfère une ligne avec issues_meta non vide", () => {
    const row = latestIssueRow([
      { tag: "t", date_utc: "2026-06-05", pass: "pm", issues_meta: "{}" },
      { tag: "t", date_utc: "2026-06-05", pass: "pm", issues_meta: '{"economy_and_labour":{"label":"x","obj":"y"}}' },
    ]);
    expect(row?.issues_meta).not.toBe("{}");
  });
});

describe("parseIssuesMeta", () => {
  it('renvoie null pour "{}", null, vide ou non-string', () => {
    expect(parseIssuesMeta("{}")).toBeNull();
    expect(parseIssuesMeta("")).toBeNull();
    expect(parseIssuesMeta(null)).toBeNull();
    expect(parseIssuesMeta(42)).toBeNull();
  });
  it("renvoie null sur du JSON invalide", () => {
    expect(parseIssuesMeta("{not json")).toBeNull();
  });
  it("parse un JSON valide", () => {
    const parsed = parseIssuesMeta('{"economy_and_labour":{"label":"Budget","obj":"déficit"}}');
    expect(parsed).not.toBeNull();
    expect(parsed!["economy_and_labour"].label).toBe("Budget");
  });
});

// « aujourd'hui/hier » est relatif à la date Montréal du bloc affiché (2e
// argument), pas à l'horloge du build.   = espace fine insécable avant « h ».
describe("firstSeenSaillantLabel", () => {
  it("renvoie null si first_seen_utc ou la date du bloc manquent", () => {
    expect(firstSeenSaillantLabel(null, "2026-07-11")).toBeNull();
    expect(firstSeenSaillantLabel(undefined, "2026-07-11")).toBeNull();
    expect(firstSeenSaillantLabel("2026-07-11T12:00:00Z", null)).toBeNull();
  });
  it("renvoie null sur un timestamp invalide", () => {
    expect(firstSeenSaillantLabel("pas-une-date", "2026-07-11")).toBeNull();
  });
  it("même jour : 12h UTC = 8h Montréal (EDT) → « ce matin, 8 h »", () => {
    expect(firstSeenSaillantLabel("2026-07-11T12:00:00Z", "2026-07-11"))
      .toBe("ce matin, 8h");
  });
  it("veille : 0h UTC le 11 = 20h Montréal le 10 → « hier soir, 20 h »", () => {
    expect(firstSeenSaillantLabel("2026-07-11T00:00:00Z", "2026-07-11"))
      .toBe("hier soir, 20h");
  });
  it("arrondit à l'édition la plus proche en heure d'hiver (EST : 0h UTC = 19h)", () => {
    expect(firstSeenSaillantLabel("2026-01-15T00:00:00Z", "2026-01-15"))
      .toBe("hier soir, 20h");
  });
  it("au-delà d'hier : date en toutes lettres", () => {
    expect(firstSeenSaillantLabel("2026-07-08T12:00:00Z", "2026-07-11"))
      .toBe("le mercredi 8 juillet 2026");
  });
});

// La liste arrive triée par score décroissant : garder la 1re occurrence
// d'une storyline = garder la plus saillante (#231, ancien signalement #211).
describe("dedupeByStoryline", () => {
  it("élimine la 2e occurrence d'une même storyline (la plus saillante gagne)", () => {
    const events = [
      { title: "Trêve rompue avec l'Iran", storyline_id: "story-iran-1" },
      { title: "Explosions sur les côtes iraniennes", storyline_id: "story-iran-1" },
      { title: "Budget provincial", storyline_id: "story-budget-2" },
    ];
    expect(dedupeByStoryline(events).map((e) => e.title)).toEqual([
      "Trêve rompue avec l'Iran",
      "Budget provincial",
    ]);
  });
  it("après dédup + coupe top-3, l'événement distinct suivant est promu", () => {
    const events = [
      { title: "A", storyline_id: "s1" },
      { title: "A-doublon", storyline_id: "s1" },
      { title: "B", storyline_id: "s2" },
      { title: "C", storyline_id: "s3" },
    ];
    expect(dedupeByStoryline(events).slice(0, 3).map((e) => e.title)).toEqual(["A", "B", "C"]);
  });
  it("ne traite jamais un storyline_id absent comme doublon (données pré-2026-07-10)", () => {
    const events = [
      { title: "A", storyline_id: null },
      { title: "B", storyline_id: null },
      { title: "C", storyline_id: undefined },
    ];
    expect(dedupeByStoryline(events)).toHaveLength(3);
  });
  it("laisse une liste sans doublon inchangée", () => {
    const events = [
      { title: "A", storyline_id: "s1" },
      { title: "B", storyline_id: "s2" },
      { title: "C", storyline_id: "s3" },
    ];
    expect(dedupeByStoryline(events)).toEqual(events);
  });
});

describe("capitalizeObject", () => {
  it("capitalise la première lettre", () => {
    expect(capitalizeObject("déficit")).toBe("Déficit");
  });
  it("capitalise chaque mot, y compris après un tiret (#161)", () => {
    expect(capitalizeObject("états-unis-iran")).toBe("États-Unis-Iran");
    expect(capitalizeObject("accord états-unis-iran")).toBe("Accord États-Unis-Iran");
  });
  it("laisse une chaîne vide inchangée", () => {
    expect(capitalizeObject("")).toBe("");
  });
});

// ── Deux solitudes (radar, part d'attention 24h) ────────────────────────────
const { pctile, rocScore, convMode, relScore, solitudesEdito, symbolPositions, buildSolitudes, storiesFrom24h, selectTopUnes, windowConvergence, windowEventConvergence, salThresholdsFrom, calConvFrom, SAL_QC_THRESHOLDS, blockKey, titleTokens, sameStory, CAL_CONV, buildSalienceTrend } = __test__;

describe("windowEventConvergence (convergence au niveau HISTOIRE)", () => {
  it("moyenne des parts d'attention sur les histoires bilatérales (2 côtés)", () => {
    // Histoire A bilatérale (qc 60 / roc 40) ; histoire B QC-only (qc 40 / roc 0).
    // couverture_qc = 60/100 = 60 % ; couverture_roc = 40/40 = 100 % → moyenne 80.
    const stories = [
      { sumQc: 60, sumRoc: 40 },
      { sumQc: 40, sumRoc: 0 },
    ];
    expect(windowEventConvergence(stories as never)).toBe(80);
  });
  it("0 quand aucune histoire n'est couverte des deux côtés", () => {
    const stories = [{ sumQc: 90, sumRoc: 0 }, { sumQc: 0, sumRoc: 70 }];
    expect(windowEventConvergence(stories as never)).toBe(0);
  });
  it("null si un côté n'a aucune attention", () => {
    expect(windowEventConvergence([{ sumQc: 10, sumRoc: 0 }] as never)).toBeNull();
  });
});

describe("salThresholdsFrom (#212 — seuils saillance depuis percentiles publiés)", () => {
  it("mappe p5/p20/p50/p80/p95 → faible…extreme", () => {
    const m = { p5: 5.21, p20: 9.45, p50: 16.66, p80: 31.09, p95: 67.14 };
    expect(salThresholdsFrom(m)).toEqual({ faible: 5.21, moyenne: 9.45, eleve: 16.66, tresEleve: 31.09, extreme: 67.14 });
  });
  it("null si métrique absente ou non monotone (repli sur les seuils codés)", () => {
    expect(salThresholdsFrom(undefined)).toBeNull();
    expect(salThresholdsFrom({ p5: 5, p20: 3, p50: 16, p80: 31, p95: 67 })).toBeNull();
  });
});

describe("calConvFrom (#212 — jauge depuis percentiles de convergence)", () => {
  it("écrase les ex æquo à 0 du bas de distribution (p5=p20=0)", () => {
    // Distribution réelle 365j (DEV) : p5=0, p20=0, p50=3, p80=33.4, p95=62.85.
    const anchors = calConvFrom({ p5: 0, p20: 0, p50: 3, p80: 33.4, p95: 62.85 });
    expect(anchors).toEqual([[0, 0], [3, 50], [33.4, 80], [62.85, 95], [100, 100]]);
    // x strictement croissant → interpolable par pctile.
    for (let i = 1; i < anchors!.length; i++) expect(anchors![i][0]).toBeGreaterThan(anchors![i - 1][0]);
  });
  it("null si trop plat (aucun point interne)", () => {
    expect(calConvFrom({ p5: 0, p20: 0, p50: 0, p80: 0, p95: 0 })).toBeNull();
    expect(calConvFrom(undefined)).toBeNull();
  });
  it("un percentile qui plafonne à 100 ne vole pas l'ancre terminale → pctile(100)=100", () => {
    // p95 = 100 : sans le garde cx<100, l'ancre serait [100,95] et pctile(100)
    // rendrait 95. On garantit [100,100] terminal.
    const anchors = calConvFrom({ p5: 0, p20: 0, p50: 40, p80: 90, p95: 100 });
    expect(anchors![anchors!.length - 1]).toEqual([100, 100]);
    expect(pctile(100, anchors!)).toBe(100);
  });
});

describe("sameStory (dédup cross-langue, stopgap #213)", () => {
  it("fusionne deux cadrages de la même fusillade de Toronto", () => {
    const a = titleTokens("Fusillade mortelle au festival Salsa on St. Clair à Toronto : 2 morts, 4 blessés");
    const b = titleTokens("Tir mortel lors d'un festival à Toronto : 2 morts et 4 blessés");
    expect(sameStory(a, b)).toBe(true);
  });
  it("ne fusionne pas deux histoires sans rapport partageant un mot", () => {
    const a = titleTokens("Carney optimiste sur le pipeline lors du Stampede de Calgary");
    const b = titleTokens("Trump annonce un blocus naval au détroit d'Ormuz");
    expect(sameStory(a, b)).toBe(false);
  });
  it("ne fusionne pas des titres trop courts (< 3 tokens)", () => {
    expect(sameStory(titleTokens("Iran attaque"), titleTokens("Iran riposte"))).toBe(false);
  });
});

describe("pctile (jauge de convergence)", () => {
  it("renvoie 0 pour une valeur nulle ou négative", () => {
    expect(pctile(0, CAL_CONV)).toBe(0);
    expect(pctile(-5, CAL_CONV)).toBe(0);
  });
  // Recalibré au #272 sur la distribution publiée (p50 = 6, et non 14 comme le
  // prototype 13 mois du red-team).
  it("place la médiane de convergence (6) au centre de la jauge (p50)", () => {
    expect(pctile(6, CAL_CONV)).toBeCloseTo(50, 5);
  });
  it("place p80 et p95 aux valeurs mesurées", () => {
    expect(pctile(37, CAL_CONV)).toBeCloseTo(80, 5);
    expect(pctile(69.1, CAL_CONV)).toBeCloseTo(95, 5);
  });
  it("plafonne à 100", () => {
    expect(pctile(999, CAL_CONV)).toBe(100);
  });
});

describe("rocScore", () => {
  // Ce bloc éprouve le POINT DE BASCULE lui-même : chaque cas nomme donc le
  // régime qu'il teste au lieu de dépendre de l'état du flag. C'est la seule
  // famille de tests qui doit le faire — ailleurs, les fixtures posent les deux
  // colonnes en miroir (cf. la note sur `ev`) et le régime n'a plus d'effet.
  it("flag ÉTEINT : lit la colonne score_roc publiée", () => {
    expect(rocScore({ score_roc: 12, score_saillance: 30, score_qc: 8, score_us: 5 } as never, false)).toBe(12);
  });
  it("flag ALLUMÉ : lit salience_index_roc, à l'échelle d'affichage", () => {
    expect(rocScore({ score_roc: 12, salience_index_roc: 0.42 } as never, true)).toBeCloseTo(42, 6);
    // Et il ne retombe PAS sur l'ancienne colonne quand la nouvelle manque :
    // ce serait publier un chiffre de l'ancien indice sous le nouveau.
    expect(rocScore({ score_roc: 12 } as never, true)).toBe(0);
  });
  // Garde-fou du #272 : le repli `saillance − qc − us` est retiré. S'il revenait,
  // le côté Canada réabsorberait les USA dès que score_us manquerait.
  it("ne dérive JAMAIS le ROC par soustraction quand la colonne manque", () => {
    expect(rocScore({ score_saillance: 30, score_qc: 8, score_us: 5 } as never, false)).toBe(0);
    expect(rocScore({ score_saillance: 30, score_qc: 8 } as never, false)).toBe(0);
  });
  it("rend 0 sur une ligne vide, dans les deux régimes", () => {
    expect(rocScore({} as never, false)).toBe(0);
    expect(rocScore({} as never, true)).toBe(0);
  });
});

describe("convMode", () => {
  it("mappe les 4 niveaux sur les seuils 25/50/75", () => {
    expect(convMode(10).word).toBe("Divergence");
    expect(convMode(40).word).toBe("Divergence partielle");
    expect(convMode(60).word).toBe("Convergence partielle");
    expect(convMode(90).word).toBe("Convergence");
  });
});

describe("solitudesEdito", () => {
  it("distingue « aucun sujet partagé » de la divergence simple", () => {
    expect(solitudesEdito(5, 0)).toMatch(/Aucun sujet/);
    expect(solitudesEdito(5, 2)).toMatch(/presque entièrement différents/);
  });
  it("dit « sujets » et jamais « histoires » à la convergence", () => {
    expect(solitudesEdito(90, 3)).toMatch(/mêmes sujets/);
    expect(solitudesEdito(90, 3)).not.toMatch(/mêmes histoires/);
  });
  it("ne contient jamais de tiret cadratin (skill redaction-editoriale)", () => {
    for (const conv of [5, 40, 60, 90]) {
      expect(solitudesEdito(conv, 1)).not.toContain("—");
    }
  });
});

describe("symbolPositions", () => {
  it("colle les symboles au centre à convergence maximale (gap min 18)", () => {
    const [qc, roc] = symbolPositions(100);
    expect(roc - qc).toBeCloseTo(18, 5);
  });
  it("les écarte à divergence maximale", () => {
    const [qc, roc] = symbolPositions(0);
    expect(roc - qc).toBeCloseTo(90, 5);
  });
});

// Pré-filtre partagé par le loader du site ET par scripts/select_hero.ts (qui
// désigne la Une à illustrer). Il était recopié trois fois dans le loader et une
// quatrième en Python : c'est cette duplication qui a laissé l'illustration
// diverger du hero (#259). Une seule implémentation, donc des tests dessus.
// API publique consommée par scripts/select_hero.ts, qui alimente l'illustration
// (#259). Elle a remplacé un accès à `__test__` — documenté comme réservé aux
// tests — pour qu'un renommage interne du loader ne puisse pas casser en silence
// la synchro illustration ↔ hero (retour Copilot).
describe("selectHeroFromRawEvents (API de sélection du hero, #259)", () => {
  it("désigne la Une n°1 = celle qui a la plus forte saillance cumulée", () => {
    const hero = selectHeroFromRawEvents([
      ev({ event_id: "e1", storyline_id: "sPetite", title: "Petite", score_qc: 5,
        date_utc: "2026-07-13", time_interval_utc: "20-24",
        media_ids_qc: JSON.stringify(["LED", "LAP"]) }),
      ev({ event_id: "e2", storyline_id: "sGrosse", title: "Grosse", score_qc: 80,
        date_utc: "2026-07-13", time_interval_utc: "20-24",
        media_ids_qc: JSON.stringify(["LED", "LAP", "RCI"]) }),
    ] as never);
    expect(hero).not.toBeNull();
    expect(hero!.title).toBe("Grosse");
    expect(hero!.storyline_id).toBe("sGrosse");
    // Traces de contrôle exposées pour lire le JSON produit.
    expect(hero!.sum_qc).toBeGreaterThan(0);
    expect(hero!.date_utc).toBe("2026-07-13");
  });

  it("applique les filtres du loader : les Unes américaines sont écartées", () => {
    const hero = selectHeroFromRawEvents([
      ev({ event_id: "e3", storyline_id: "sUS", title: "Américaine", score_qc: 900,
        country_id: "USA", date_utc: "2026-07-13", time_interval_utc: "20-24",
        media_ids_qc: JSON.stringify(["LED", "LAP"]) }),
      ev({ event_id: "e4", storyline_id: "sQC", title: "Québécoise", score_qc: 10,
        date_utc: "2026-07-13", time_interval_utc: "20-24",
        media_ids_qc: JSON.stringify(["LED", "LAP"]) }),
    ] as never);
    expect(hero!.title).toBe("Québécoise");
  });

  it("aucune Une exploitable → null (le script d'art bascule alors sur son repli)", () => {
    expect(selectHeroFromRawEvents([] as never)).toBeNull();
  });
});

describe("uniqueQcEvents (pré-filtre commun, #259)", () => {
  const { uniqueQcEvents } = __test__;

  it("garde une seule ligne par event_id", () => {
    const out = uniqueQcEvents([
      { event_id: "e1", target_region: "ROC", country_id: "CAN" },
      { event_id: "e1", target_region: "ROC", country_id: "CAN" },
      { event_id: "e2", target_region: "QC", country_id: "CAN" },
    ] as never);
    expect(out.map((e: { event_id: string }) => e.event_id)).toEqual(["e1", "e2"]);
  });

  it("préfère la variante QC quel que soit son rang dans la liste", () => {
    const avant = uniqueQcEvents([
      { event_id: "e1", target_region: "ROC", country_id: "CAN", title: "roc" },
      { event_id: "e1", target_region: "QC", country_id: "CAN", title: "qc" },
    ] as never);
    const apres = uniqueQcEvents([
      { event_id: "e1", target_region: "QC", country_id: "CAN", title: "qc" },
      { event_id: "e1", target_region: "ROC", country_id: "CAN", title: "roc" },
    ] as never);
    expect(avant[0].title).toBe("qc");
    expect(apres[0].title).toBe("qc");
  });

  it("écarte les événements purement américains", () => {
    const out = uniqueQcEvents([
      { event_id: "e1", target_region: "QC", country_id: "USA" },
      { event_id: "e2", target_region: "QC", country_id: "CAN" },
    ] as never);
    expect(out.map((e: { event_id: string }) => e.event_id)).toEqual(["e2"]);
  });

  it("liste vide → liste vide", () => {
    expect(uniqueQcEvents([] as never)).toEqual([]);
  });
});

describe("blockKey", () => {
  it("produit une clé triable date + heure de début", () => {
    expect(blockKey({ date_utc: "2026-07-13", time_interval_utc: "08-12" } as never)).toBe("2026-07-13T08");
    expect(blockKey({ date_utc: "2026-07-13", time_interval_utc: "4-8" } as never)).toBe("2026-07-13T04");
  });
});

// MIROIR SPEC V1 — les fixtures cessent de dépendre de l'état du flag.
//
// `qcScore()` lit `salience_index_qc × 100` quand SALIENCE_CUTOVER est allumé,
// et `score_qc` sinon. Les fixtures ne posaient que `score_qc` : flag allumé,
// elles renvoyaient donc 0 partout, et 29 tests tombaient — non pas parce que le
// code était faux, mais parce que la donnée de test n'existait pas dans le
// régime testé. Le mode d'échec est vicieux : il n'apparaît qu'au moment de la
// bascule, c'est-à-dire au pire moment.
//
// En posant `salience_index_qc = score_qc / 100`, les deux chemins de lecture
// rendent la MÊME valeur, et chaque test devient valable dans les deux régimes.
// Un test qui veut éprouver spécifiquement le nouvel indice peut toujours poser
// `salience_index_qc` explicitement : la valeur fournie l'emporte.
const ev = (over: Record<string, unknown>) => {
  const socle = {
    country_id: "QC", title: "T", score_qc: 0, score_saillance: 0,
    media_ids: "[]", articles: "[]", interval_convergence_score: null,
    date_utc: "2026-07-13", time_interval_utc: "16-20", storyline_id: "s",
  };
  // Voir la note « miroir spec v1 » plus haut : dérivé APRÈS l'étalement de
  // `over`, pour suivre le `score_qc` que le test a réellement demandé.
  const base = { ...socle, ...over } as Record<string, unknown>;
  return {
    ...base,
    salience_index_qc: base.salience_index_qc ?? Number(base.score_qc ?? 0) / 100,
    salience_index_roc: base.salience_index_roc ?? Number(base.score_roc ?? 0) / 100,
  };
};

describe("buildIssueMedia (actualités du treemap)", () => {
  it("conserve les médias propres à chaque actualité et leurs liens", () => {
    const rows = [
      ev({
        event_id: "alpha", target_region: "QC", main_issue: "economy_and_labour",
        storyline_id: "story-alpha", title: "Actualité alpha", score_qc: 20,
        representative_url: "https://ici.radio-canada.ca/alpha",
        media_ids_24h: '["LAP","RCI","CTV"]',
        articles_24h: JSON.stringify([
          { media_id: "RCI", url: "https://ici.radio-canada.ca/alpha" },
          { media_id: "LAP", url: "https://lapresse.ca/alpha" },
          { media_id: "CTV", url: "https://ctvnews.ca/alpha" },
        ]),
      }),
      ev({
        event_id: "bravo", target_region: "QC", main_issue: "economy_and_labour",
        storyline_id: "story-bravo", title: "Actualité bravo", score_qc: 10,
        representative_url: "https://ledevoir.com/bravo",
        media_ids_qc: '["LED"]',
        articles: JSON.stringify([{ media_id: "LED", url: "https://ledevoir.com/bravo" }]),
      }),
    ];

    const articles = buildIssueMedia(rows as never).get("economy_and_labour")!.articles;
    expect(articles.map((article) => article.title)).toEqual(["Actualité alpha", "Actualité bravo"]);
    expect(articles[0].outlets).toEqual([
      { name: "La Presse", url: "https://lapresse.ca/alpha" },
      { name: "Radio-Canada", url: "https://ici.radio-canada.ca/alpha" },
    ]);
    expect(articles[1].outlets).toEqual([
      { name: "Le Devoir", url: "https://ledevoir.com/bravo" },
    ]);
  });

  it("déduplique une storyline sans limiter le nombre d'actualités", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ev({
      event_id: `event-${index}`,
      target_region: "QC",
      main_issue: "technology",
      storyline_id: `story-${index}`,
      title: `Actualité ${index}`,
      score_qc: 20 - index,
    }));
    rows.push(ev({
      event_id: "event-duplicate",
      target_region: "QC",
      main_issue: "technology",
      storyline_id: "story-0",
      title: "Ancienne formulation",
      score_qc: 1,
    }));

    const articles = buildIssueMedia(rows as never).get("technology")!.articles;
    expect(articles).toHaveLength(7);
    expect(articles.some((article) => article.title === "Ancienne formulation")).toBe(false);
  });
});

describe("storiesFrom24h (agrégation partagée des 2 modules)", () => {
  // Poids de récence d'un bloc vieux de `h` heures (demi-vie 10 h, #274).
  const w = (h: number) => Math.pow(2, -h / 10);
  it("somme la saillance d'une storyline sur plusieurs blocs, pondérée par récence", () => {
    const rows = [
      ev({ storyline_id: "sA", title: "A", score_qc: 10, time_interval_utc: "16-20" }),
      ev({ storyline_id: "sA", title: "A", score_qc: 6, time_interval_utc: "12-16" }),
      ev({ storyline_id: "sB", title: "B", score_qc: 4, time_interval_utc: "16-20" }),
    ];
    const st = storiesFrom24h(rows as never).sort((a: { sumQc: number }, b: { sumQc: number }) => b.sumQc - a.sumQc);
    expect(st[0].label).toBe("A");
    expect(st[0].sumQc).toBeCloseTo(10 + 6 * w(4), 6); // bloc frais plein poids, bloc −4h atténué
    expect(st[0].peakQc).toBe(10); // pic = max bloc BRUT (échelle du score de bloc, pastille)
    expect(st[1].sumQc).toBeCloseTo(4, 6);
  });
  it("la récence peut inverser le classement : pic d'hier soir contre histoire en cours (#274)", () => {
    // "Vieille" domine en cumul plat (30 vs 24) mais tout son score date de
    // 20 h ; "Fraîche" est en cours. Avec la demi-vie 10 h, Fraîche passe devant,
    // et Vieille garde le peakQc le plus haut (la pastille reste honnête).
    const rows = [
      ev({ storyline_id: "sV", title: "Vieille", score_qc: 30, date_utc: "2026-07-13", time_interval_utc: "00-04" }),
      ev({ storyline_id: "sF", title: "Fraîche", score_qc: 24, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
    ];
    const st = storiesFrom24h(rows as never);
    const vieille = st.find((s: { label: string }) => s.label === "Vieille")!;
    const fraiche = st.find((s: { label: string }) => s.label === "Fraîche")!;
    expect(fraiche.sumQc).toBeGreaterThan(vieille.sumQc); // 24 > 30·2^(-2) = 7,5
    expect(vieille.sumQc).toBeCloseTo(30 * w(20), 6);
    expect(vieille.peakQc).toBe(30);
  });
  it("le poids de récence se mesure en heures calendaires, pas en rangs de blocs", () => {
    // Trou dans la grille (bloc 16-20 absent) : le bloc 12-16 reste vieux de 8 h
    // par rapport à 20-24, pas de 4 h.
    const rows = [
      ev({ storyline_id: "sA", title: "A", score_qc: 10, time_interval_utc: "20-24" }),
      ev({ storyline_id: "sA", title: "A", score_qc: 10, time_interval_utc: "12-16" }),
    ];
    const st = storiesFrom24h(rows as never);
    expect(st[0].sumQc).toBeCloseTo(10 + 10 * w(8), 6);
  });
  it("ne garde que les 6 blocs les plus récents (24h)", () => {
    // 8 blocs : le plus ancien (00) hors fenêtre de 6
    const rows = ["00", "04", "08", "12", "16", "20"].map((h, i) =>
      ev({ storyline_id: `s${i}`, title: `H${i}`, score_qc: 5, date_utc: "2026-07-13", time_interval_utc: `${h}-x` }),
    );
    rows.push(ev({ storyline_id: "old", title: "Vieux", score_qc: 99, date_utc: "2026-07-12", time_interval_utc: "00-04" }) as never);
    rows.push(ev({ storyline_id: "old2", title: "Vieux2", score_qc: 99, date_utc: "2026-07-12", time_interval_utc: "04-08" }) as never);
    const st = storiesFrom24h(rows as never);
    expect(st.some((s: { label: string }) => s.label === "Vieux")).toBe(false);
  });
  it("urlByMedia garde l'URL du bloc le plus récent, quel que soit l'ordre du JSON", () => {
    // JSON ordonné du plus ANCIEN au plus récent : sans tri interne, le
    // « premier URL conservé » serait le vieux.
    const rows = [
      ev({ storyline_id: "sA", title: "A", score_qc: 5, time_interval_utc: "12-16",
        articles: JSON.stringify([{ media_id: "LED", url: "https://led/vieux" }]) }),
      ev({ storyline_id: "sA", title: "A", score_qc: 5, time_interval_utc: "16-20",
        articles: JSON.stringify([{ media_id: "LED", url: "https://led/frais" }]) }),
    ];
    const st = storiesFrom24h(rows as never);
    expect(st[0].urlByMedia["LED"]).toBe("https://led/frais");
    expect(st[0].repKey).toBe("2026-07-13T16"); // rep = bloc le plus récent aussi
  });
});

describe("storiesFrom24h — série par bloc (trajectoire #274)", () => {
  // GARDE-FOU (relevé en review sur #432) : `present` se décide sur la VALEUR,
  // pas sur l'existence d'une ligne. Le datamart publie des lignes dont la
  // saillance QC est nulle — l'histoire figure dans le bloc mais aucun média
  // québécois ne l'avait en Une. Les compter comme « présentes » ferait dire
  // « à la Une » à une histoire absente des pages frontales, et masquerait les
  // points creux de la trajectoire (« Hors du radar »).
  it("une ligne présente mais à saillance QC NULLE compte comme absente", () => {
    const rows = [
      ev({ storyline_id: "sA", title: "A", score_qc: 30, date_utc: "2026-07-13", time_interval_utc: "12-16" }),
      // Ligne bien réelle, mais saillance QC nulle : l'histoire n'est plus en Une.
      ev({ storyline_id: "sA", title: "A", score_qc: 0, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
      ev({ storyline_id: "sB", title: "B", score_qc: 5, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
    ];
    const s = storiesFrom24h(rows as never).find((x: { label: string }) => x.label === "A")!;
    const bloc = (k: string) => s.series.find((p: { blockUtc: string }) => p.blockUtc === k)!;
    expect(bloc("2026-07-13T16").present).toBe(false);   // la ligne existe, la Une non
    expect(bloc("2026-07-13T16").qc).toBe(0);
    expect(bloc("2026-07-13T12").present).toBe(true);    // celle-ci était bien en Une
  });
  it("expose la série brute des 6 blocs de la fenêtre, 0 si absente d'un bloc", () => {
    const rows = [
      ev({ storyline_id: "sA", title: "A", score_qc: 30, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
      ev({ storyline_id: "sA", title: "A", score_qc: 10, date_utc: "2026-07-13", time_interval_utc: "12-16" }),
      // Une autre histoire occupe le bloc 16-20 ; A y est absente → 0 dans sa série.
      ev({ storyline_id: "sB", title: "B", score_qc: 5, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
    ];
    const st = storiesFrom24h(rows as never);
    const s = st.find((x: { label: string }) => x.label === "A")!;
    // série ordonnée du plus ancien au plus récent ; le score par bloc est BRUT.
    const scores = s.series.map((p: { qc: number }) => p.qc);
    expect(scores[scores.length - 1]).toBe(30); // bloc le plus récent (20-24)
    expect(scores.filter((v: number) => v === 10)).toHaveLength(1); // bloc 12-16
    expect(scores.filter((v: number) => v === 0).length).toBeGreaterThan(0); // A absente du bloc 16-20
  });
});

// La PART d'attention par bloc (#304) est produite ici, en amont de la tendance :
// c'est elle qui borne le chiffre affiché sous la Une. Les tests de
// buildSalienceTrend la reçoivent déjà calculée — sans ces cas-ci, une régression
// sur le dénominateur (total QC du bloc) passerait inaperçue.
describe("storiesFrom24h — part d'attention par bloc (#304)", () => {
  const shareAt = (s: { series: { blockUtc: string; share: number }[] }, block: string) =>
    s.series.find((p) => p.blockUtc === block)!.share;

  it("part = qc de l'histoire / qc total du bloc (30 contre 10 → 75 % / 25 %)", () => {
    const rows = [
      ev({ storyline_id: "sA", title: "Alpha", score_qc: 30, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
      ev({ storyline_id: "sB", title: "Bravo", score_qc: 10, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
    ];
    const st = storiesFrom24h(rows as never);
    expect(shareAt(st.find((x: { label: string }) => x.label === "Alpha")!, "2026-07-13T20")).toBeCloseTo(75, 6);
    expect(shareAt(st.find((x: { label: string }) => x.label === "Bravo")!, "2026-07-13T20")).toBeCloseTo(25, 6);
  });

  it("les parts d'un même bloc somment à 100 % (dénominateur = TOUTES les histoires du bloc)", () => {
    const rows = [
      ev({ storyline_id: "sA", title: "Alpha", score_qc: 7, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
      ev({ storyline_id: "sB", title: "Bravo", score_qc: 11, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
      ev({ storyline_id: "sC", title: "Charlie", score_qc: 3, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
    ];
    const st = storiesFrom24h(rows as never);
    const total = st.reduce(
      (acc: number, s: { series: { blockUtc: string; share: number }[] }) => acc + shareAt(s, "2026-07-13T16"), 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("une histoire absente d'un bloc y a une part de 0 (pas la part de son bloc voisin)", () => {
    const rows = [
      ev({ storyline_id: "sA", title: "Alpha", score_qc: 20, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
      ev({ storyline_id: "sB", title: "Bravo", score_qc: 5, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
    ];
    const st = storiesFrom24h(rows as never);
    const alpha = st.find((x: { label: string }) => x.label === "Alpha")!;
    expect(shareAt(alpha, "2026-07-13T20")).toBeCloseTo(100, 6); // seule au bloc 20-24
    expect(shareAt(alpha, "2026-07-13T16")).toBe(0);             // absente du bloc 16-20
  });

  it("bloc sans aucune saillance QC : part 0, jamais NaN (division par zéro)", () => {
    // Bloc 16-20 présent dans la fenêtre mais à saillance QC nulle → dénominateur 0.
    const rows = [
      ev({ storyline_id: "sA", title: "Alpha", score_qc: 20, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
      ev({ storyline_id: "sA", title: "Alpha", score_qc: 0, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
    ];
    const st = storiesFrom24h(rows as never);
    const alpha = st.find((x: { label: string }) => x.label === "Alpha")!;
    const zero = shareAt(alpha, "2026-07-13T16");
    expect(Number.isNaN(zero)).toBe(false);
    expect(zero).toBe(0);
  });

  it("toute part reste dans [0, 100] — c'est ce qui borne le chiffre affiché (bug #301)", () => {
    const rows = [
      // Écart extrême entre deux histoires : le rapport de scores explose (2000×),
      // la PART, elle, reste bornée — c'est précisément ce que la variation
      // relative du prototype #301 ne garantissait pas (« +4 145 410 % »).
      ev({ storyline_id: "sA", title: "Alpha", score_qc: 2000, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
      ev({ storyline_id: "sB", title: "Bravo", score_qc: 1, date_utc: "2026-07-13", time_interval_utc: "20-24" }),
      ev({ storyline_id: "sB", title: "Bravo", score_qc: 0.001, date_utc: "2026-07-13", time_interval_utc: "16-20" }),
    ];
    const st = storiesFrom24h(rows as never);
    for (const s of st) {
      for (const p of s.series as { share: number }[]) {
        expect(p.share).toBeGreaterThanOrEqual(0);
        expect(p.share).toBeLessThanOrEqual(100);
      }
    }
  });
});

// Le badge suit la saillance CUMULÉE 24 h, qui décroît d'elle-même. Sans
// hystérésis elle change de bande une édition sur deux (mesuré : 52 % des
// transitions sur l'historique DEV, dont 5,6 % de sauts de 2 bandes).
// La grille du badge vient de calibration_sum_qc (fetch_data.R). Elle reste
// NULL tant que la fenêtre post-fusion n'a pas 60 Unes distinctes (~23 au
// 2026-07-27) : le repli codé en dur sert donc pour de vrai, pas seulement en
// théorie. On verrouille les deux branches.
describe("grille du badge : calibration publiée sinon repli (#314)", () => {
  const { salThresholdsFrom, SUM_QC_THRESHOLDS } = __test__;

  it("métrique absente → repli sur SUM_QC_THRESHOLDS", () => {
    expect(salThresholdsFrom(undefined)).toBeNull();
    // Le loader fait `salThresholdsFrom(...) ?? SUM_QC_THRESHOLDS`.
    expect(salThresholdsFrom(undefined) ?? SUM_QC_THRESHOLDS).toBe(SUM_QC_THRESHOLDS);
  });

  it("métrique publiée → elle gagne sur le repli", () => {
    const publiee = { p5: 25.5, p20: 41.4, p50: 67.5, p80: 149.8, p95: 253.5 };
    expect(salThresholdsFrom(publiee) ?? SUM_QC_THRESHOLDS).toEqual({
      faible: 25.5, moyenne: 41.4, eleve: 67.5, tresEleve: 149.8, extreme: 253.5,
    });
  });

  it("métrique non monotone → repli (garde-fou contre une calibration dégénérée)", () => {
    const cassee = { p5: 25, p20: 10, p50: 67, p80: 149, p95: 253 };
    expect(salThresholdsFrom(cassee) ?? SUM_QC_THRESHOLDS).toBe(SUM_QC_THRESHOLDS);
  });

  it("le repli garde l'ordre attendu des bandes", () => {
    const t = SUM_QC_THRESHOLDS;
    expect(t.faible).toBeLessThan(t.moyenne);
    expect(t.moyenne).toBeLessThan(t.eleve);
    expect(t.eleve).toBeLessThan(t.tresEleve);
    expect(t.tresEleve).toBeLessThan(t.extreme);
  });
});

// Le rejeu des éditions ne sert plus à reconstituer le niveau précédent : depuis
// le retrait de l'hystérésis (A4), le rang est une fonction pure du cumul et ne
// dépend d'aucun état antérieur. Il reste nécessaire pour deux choses — le
// SOMMET (la plus haute valeur atteinte et l'édition où elle l'a été) et
// l'HISTORIQUE des niveaux lu au survol de la trajectoire.
describe("badgeRanks (rejeu des éditions)", () => {
  const { badgeRanks, SUM_QC_THRESHOLDS } = __test__;   // plus d'hystérésis depuis A4
  // Une histoire seule dans chaque bloc : sumQc = score du bloc + traînée
  // pondérée des précédents (demi-vie 10 h), donc strictement croissante ici.
  const bloc = (h: string, qc: number) =>
    ev({ storyline_id: "sA", title: "Alpha", score_qc: qc,
      date_utc: "2026-07-13", time_interval_utc: `${h}-x`,
      articles: JSON.stringify([{ media_id: "LED", url: "https://led/a" }]) });

  it("accumule un historique : une entrée par édition rejouée", () => {
    const suivi = badgeRanks(
      [bloc("00", 30), bloc("04", 60), bloc("08", 90)] as never, SUM_QC_THRESHOLDS);
    const a = suivi.get("sA")!;
    expect(a).toBeDefined();
    // 3 blocs = 3 éditions rejouées, donc 3 niveaux mémorisés.
    expect(a.history.size).toBe(3);
    expect([...a.history.keys()]).toEqual(
      ["2026-07-13T00", "2026-07-13T04", "2026-07-13T08"]);
  });

  it("le sommet se fixe sur l'édition où le cumul est le plus haut", () => {
    // Le cumul culmine au dernier bloc (la traînée s'ajoute au plus gros score).
    const suivi = badgeRanks(
      [bloc("00", 30), bloc("04", 60), bloc("08", 90)] as never, SUM_QC_THRESHOLDS);
    const a = suivi.get("sA")!;
    expect(a.peakBlock).toBe("2026-07-13T08");
    expect(a.peakSum).toBeGreaterThan(90); // 90 + traînée des blocs précédents

    // Si le gros score est au MILIEU, le sommet reste sur ce bloc-là même si
    // des éditions plus récentes suivent — c'est ce qui permet au ⓘ de dire
    // « plus haut niveau à telle heure » après le déclin.
    const declin = badgeRanks(
      [bloc("00", 20), bloc("04", 200), bloc("08", 5)] as never, SUM_QC_THRESHOLDS);
    expect(declin.get("sA")!.peakBlock).toBe("2026-07-13T04");
  });

  it("le rang final est celui de la dernière édition, et il a suivi la montée", () => {
    const suivi = badgeRanks(
      [bloc("00", 5), bloc("04", 40), bloc("08", 260)] as never, SUM_QC_THRESHOLDS);
    const a = suivi.get("sA")!;
    const rangs = [...a.history.values()];
    expect(a.rank).toBe(rangs[rangs.length - 1]);
    // Monotone croissant ici : le cumul ne fait que grimper.
    expect(rangs[0]).toBeLessThanOrEqual(rangs[rangs.length - 1]);
    expect(a.rank).toBeGreaterThan(rangs[0]);
  });

  it("aucun événement → aucune entrée (pas de plantage)", () => {
    expect(badgeRanks([] as never, SUM_QC_THRESHOLDS).size).toBe(0);
  });
});

// Le describe « hysteresisRank » a été retiré avec la règle (vitrine#430, A4) :
// le niveau du badge est redevenu une pure FONCTION de la valeur. Deux Unes au
// même cumul affichent le même niveau, quoi qu'elles aient affiché avant — c'est
// la condition pour qu'un score soit officiel et comparable dans le temps.

describe("buildSalienceTrend (#430 B3 — la bande ne parle que du CUMUL 24 h)", () => {
  const thr = SAL_QC_THRESHOLDS; // pics : {faible:8, moyenne:11, eleve:19, tresEleve:48, extreme:95}
  // `present` = un média québécois avait la Une à ce bloc. `cumul` = l'attention
  // cumulée 24 h à cette édition — LA grandeur de la bande depuis #430 : c'est
  // elle que la courbe trace, elle que le sommet marque, et elle dont la flèche
  // chiffre la variation. `share` (la part du bloc de 4 h) ne sert plus à rien
  // ici : elle disait une FRACTION là où le mot disait un NIVEAU, et 39 % des
  // mouvements se contredisaient à l'écran.
  //
  // La variation est désormais RELATIVE, en % du cumul précédent : sur une
  // quantité absolue, « −10 points » ne veut rien dire au lecteur.
  const decline = [
    { blockUtc: "2026-07-19T19", qc: 0, present: false, cumul: 0 }, { blockUtc: "2026-07-19T23", qc: 100, present: true, cumul: 100 },
    { blockUtc: "2026-07-20T03", qc: 50, present: true, cumul: 95 }, { blockUtc: "2026-07-20T07", qc: 12, present: true, cumul: 70 },
    { blockUtc: "2026-07-20T11", qc: 0, present: false, cumul: 56 },
  ];
  it("absente du bloc courant : l'attention est retombée, JAMAIS « plus à la Une »", () => {
    const t = buildSalienceTrend(decline as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("down");
    expect(t.deltaPct).toBe(-20);   // 70 → 56 = −20 % du cumul précédent
    expect(t.situation).toBe("retombee");
    // Grammaire arrêtée : [ce que l'attention fait] puis l'ancre au sommet en incise.
    expect(t.capLabel).toMatch(/^L’attention est retombée depuis .+ \(Sommet .+\)$/);
    // La carte EST une Une : la phrase ne doit jamais nier cette appartenance.
    expect(t.capLabel).not.toMatch(/à la Une/);
  });
  it("étiquette chaque bloc à SON niveau (pas le pic), marque sommet / première Une / maintenant", () => {
    const t = buildSalienceTrend(decline as never, thr, "2026-07-20")!;
    const peak = t.points.find((p: { isPeak: boolean }) => p.isPeak)!;
    expect(peak.score).toBe(100);
    expect(peak.level).toBe("Exceptionnelle"); // 100 ≥ extreme(95)
    expect(t.points.find((p: { isNow: boolean }) => p.isNow)!.level).toBe("Hors du radar"); // bloc sans Une → absente, pas « faible »
    expect(t.points.find((p: { score: number }) => p.score === 50)!.level).toBe("Très élevée"); // 48 ≤ 50 < 95
    expect(t.points.find((p: { score: number }) => p.score === 12)!.level).toBe("Modérée"); // 11 ≤ 12 < 19
    // première apparition = premier bloc à score > 0
    expect(t.points.filter((p: { isFirst: boolean }) => p.isFirst)).toHaveLength(1);
    expect(t.points.find((p: { isFirst: boolean }) => p.isFirst)!.score).toBe(100);
  });
  it("détecte la progression (cumul qui monte : 20 → 23 = +15 %)", () => {
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T03", qc: 4, present: true, cumul: 10 }, { blockUtc: "2026-07-20T07", qc: 9, present: true, cumul: 20 },
      { blockUtc: "2026-07-20T11", qc: 20, present: true, cumul: 23 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("up");
    expect(t.deltaPct).toBe(15);
    // Part la plus haute de la fenêtre → « au plus haut du jour », pas d'ancre
    // au sommet (elle EST le sommet).
    expect(t.situation).toBe("sommet");
    // Seul cas où l'écart se compte depuis le BLOC PRÉCÉDENT : au sommet,
    // « sous le sommet » n'a pas de sens, la question est « de combien elle a monté ».
    // Notation en % (et non « points »), alignée sur le module des enjeux.
    expect(t.capLabel).toMatch(/^Nouveau sommet aujourd’hui \(\+15 % depuis /);
  });
  // Ampleur = variation RELATIVE du cumul entre les deux dernières éditions.
  it("deltaPct baisse : cumul 40 → 30 = −25 %", () => {
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T07", qc: 40, present: true, cumul: 40 },
      { blockUtc: "2026-07-20T11", qc: 30, present: true, cumul: 30 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("down");
    expect(t.deltaPct).toBe(-25);
  });
  it("deltaPct hausse : cumul 50 → 61 = +22 %", () => {
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T07", qc: 12, present: true, cumul: 50 },
      { blockUtc: "2026-07-20T11", qc: 30, present: true, cumul: 61 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("up");
    expect(t.deltaPct).toBe(22);
  });
  it("stable : cumul inchangé → dir flat, et le SCORE du bloc qui monte ne fait pas un sommet", () => {
    // qc monte (40 → 42) mais le cumul ne bouge pas : la bande parle du CUMUL,
    // donc ce n'est pas « au plus haut du jour ».
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T07", qc: 40, present: true, cumul: 30 },
      { blockUtc: "2026-07-20T11", qc: 42, present: true, cumul: 30 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("flat");
    expect(t.deltaPct).toBe(0);
    expect(t.situation).toBe("stable");
    expect(t.capLabel).toMatch(/^Se maintient \(Sommet .+\)$/);
  });
  it("distingue « Absente » (pas à la Une) d'une saillance faible réelle", () => {
    const trend = buildSalienceTrend([
      { blockUtc: "2026-07-20T03", qc: 0, present: false, cumul: 0 },  // pas à la Une → Absente
      { blockUtc: "2026-07-20T07", qc: 3, present: true, cumul: 5 },   // à la Une mais faible (< seuil faible=8)
      { blockUtc: "2026-07-20T11", qc: 40, present: true, cumul: 40 },
    ] as never, thr, "2026-07-20")!;
    const absent = trend.points[0], faible = trend.points[1];
    expect(absent.level).toBe("Hors du radar");
    expect(absent.isAbsent).toBe(true);
    expect(faible.level).toBe("Très faible");   // présente mais faible ≠ absente
    expect(faible.isAbsent).toBe(false);
  });
  it("étiquette l'heure de chaque point par sa PUBLICATION (fin + 1 h, réforme #195), pas son début", () => {
    // Bloc UTC 07 = 03:00–07:00 Montréal (EDT) → PUBLIÉ à 8 h : le label doit dire
    // « 8 h », jamais « 3 h » (l'heure de début), cohérent avec le pied de module.
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-24T03", qc: 30, present: true },  // 23-03 Mtl → publié 4 h
      { blockUtc: "2026-07-24T07", qc: 20, present: true },  // 03-07 Mtl → publié 8 h
    ] as never, thr, "2026-07-24")!;
    const now = t.points.find((p: { isNow: boolean }) => p.isNow)!;
    expect(now.timeLabel).toMatch(/8\s*h$/);   // heure de PUBLICATION
    expect(now.timeLabel).not.toContain("3");  // surtout pas l'heure de début
  });
  it("bloc de nuit 23-03 (publié à 4 h LE LENDEMAIN) → « aujourd’hui 4 h », jamais « hier » (jour = publication, #317)", () => {
    // Le bloc 23-03 commence à 23 h la VEILLE mais est publié à 4 h le jour de
    // référence : le mot-jour doit suivre la publication, pas le début du bloc.
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-24T03", qc: 30, present: true },  // 23-03 Mtl (début 23 h le 23) → publié 4 h le 24
      { blockUtc: "2026-07-24T07", qc: 20, present: true },  // 03-07 Mtl → publié 8 h le 24
    ] as never, thr, "2026-07-24")!;
    const overnight = t.points[t.points.length - 2];   // le point 23-03
    expect(overnight.timeLabel).toMatch(/4\s*h/);       // heure de publication
    expect(overnight.timeLabel).toContain("aujourd");   // « aujourd’hui », jour de publication
    expect(overnight.timeLabel).not.toContain("hier");  // surtout pas le jour du début
  });
  it("bloc du soir 19-23 Mtl → publié à « minuit » (fin 23 h + 1), pas « 19 h »", () => {
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-24T19", qc: 20, present: true },  // 15-19 Mtl → publié 20 h
      { blockUtc: "2026-07-24T23", qc: 30, present: true },  // 19-23 Mtl → publié minuit
    ] as never, thr, "2026-07-24")!;
    const now = t.points.find((p: { isNow: boolean }) => p.isNow)!;
    expect(now.timeLabel).toContain("minuit");
  });
  it("renvoie null s'il n'y a rien à raconter (aucun bloc actif)", () => {
    expect(buildSalienceTrend([{ blockUtc: "2026-07-20T11", qc: 0, present: false, share: 0 }] as never, thr, "2026-07-20")).toBeNull();
  });

  // ── Le mot-jour appartient à l'ÉDITION, pas à l'histoire ────────────────────
  // Le 3e argument est le jour de publication de l'édition affichée. Il était
  // auparavant la date du dernier bloc de CETTE histoire : une Une retombée du
  // radar traînait un repère en retard et nommait « aujourd'hui » des blocs de
  // la veille — jusqu'à annoncer un sommet à une heure encore à venir.
  it("une Une retombée du radar situe quand même ses blocs par rapport à l'édition", () => {
    // Édition du 27 à 12h. L'histoire n'est plus à la Une depuis le bloc publié
    // à 4 h ; ses blocs de la veille doivent se lire « hier », pas « aujourd'hui ».
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-26T15", qc: 40, present: true, share: 44 },   // 11-15 Mtl → publié 16 h le 26
      { blockUtc: "2026-07-26T19", qc: 30, present: true, share: 30 },   // 15-19 Mtl → publié 20 h le 26
      { blockUtc: "2026-07-26T23", qc: 5, present: true, share: 2 },     // 19-23 Mtl → publié minuit
      { blockUtc: "2026-07-27T03", qc: 0, present: false, share: 0 },    // 23-03 Mtl → publié 4 h le 27
      { blockUtc: "2026-07-27T07", qc: 0, present: false, share: 0 },    // 03-07 Mtl → publié 8 h le 27
    ] as never, thr, "2026-07-27")!;
    const labels = t.points.map((p: { timeLabel: string }) => p.timeLabel);
    expect(labels[0]).toBe("hier 16h");
    expect(labels[1]).toBe("hier 20h");
    expect(labels[2]).toBe("hier minuit");      // publié à minuit, rattaché au jour qui finit
    expect(labels[3]).toBe("aujourd’hui 4h");   // publié le 27, même si le bloc démarre le 26
    expect(labels[4]).toBe("aujourd’hui 8h");
    // Et la phrase ne peut plus annoncer un sommet dans le futur de l'édition.
    expect(t.capLabel).toContain("hier à 16h");
  });

  it("deux Unes de la même édition nomment les mêmes blocs de la même façon", () => {
    // C'est la propriété qui cassait à l'écran : la 1re Une disait « hier 20h »
    // et la 3e « aujourd’hui 20h » pour le MÊME bloc, sur la même page.
    const blocs = [
      { blockUtc: "2026-07-26T15", present: true, share: 40 },
      { blockUtc: "2026-07-26T19", present: true, share: 30 },
      { blockUtc: "2026-07-26T23", present: true, share: 20 },
      { blockUtc: "2026-07-27T03", present: true, share: 10 },
    ];
    const enCours = buildSalienceTrend(
      blocs.map((b) => ({ ...b, qc: 30 })) as never, thr, "2026-07-27")!;
    // Même série de blocs, mais l'histoire a disparu du radar sur les 2 derniers.
    const retombee = buildSalienceTrend(
      blocs.map((b, i) => ({ ...b, qc: i < 2 ? 30 : 0, present: i < 2 })) as never, thr, "2026-07-27")!;
    expect(retombee.points.map((p: { timeLabel: string }) => p.timeLabel))
      .toEqual(enCours.points.map((p: { timeLabel: string }) => p.timeLabel));
  });
});

describe("selectTopUnes (#430 A2 — classement pur, plus de seuil de médias)", () => {
  // selectTopUnes classe par sumQc (saillance QC cumulée 24 h) et s'arrête là.
  // Le seuil « ≥ 2 médias québécois » pour les cartes secondaires a été retiré
  // le 2026-08-09 : il datait de l'ancien indice, qui ne voyait pas la largeur
  // de couverture. Le nouvel indice classe lui-même une histoire mono-média tout
  // en bas — mesuré, 93 % d'entre elles tombent dans les deux bandes basses —
  // et la règle était incohérente (le héros, lui, était gardé mono-média).
  // ⚠️ La population de CALIBRATION, elle, garde le ≥ 2 : le niveau est une
  // position dans un groupe, et ce groupe ne doit pas suivre l'affichage.
  // ⚠️ Les cumuls de ces fixtures sont volontairement PROCHES les uns des
  // autres : ces tests portent sur le nombre de médias et sur l'ordre, pas sur
  // la règle de domination (#430 B6), qui a son propre describe plus bas.
  const story = (label: string, sumQc: number, nQcMedia: number) =>
    ({ label, sumQc, qcMedia: new Set(Array.from({ length: nQcMedia }, (_, i) => `M${i}`)),
       series: [{ blockUtc: "2026-07-20T15", qc: Math.max(1, sumQc) }] });

  it("garde les 3 Unes quand les secondaires sont multi-médias", () => {
    const st = [story("A", 30, 4), story("B", 25, 2), story("C", 20, 3)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["A", "B", "C"]);
  });
  it("les secondaires mono-média ne sont PLUS cachées (cas du 16-17 juillet, inversé)", () => {
    // Avant #430 ce cas rendait ["Argentine"] seule : deux histoires réelles
    // disparaissaient de l'écran alors que l'indice savait déjà les classer bas.
    const st = [story("Argentine", 30, 4), story("Montréal vibre", 25, 1), story("Tiques", 20, 1)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label))
      .toEqual(["Argentine", "Montréal vibre", "Tiques"]);
  });
  it("le héros reste le plus gros cumul, mono-média ou non", () => {
    const st = [story("Seule", 8, 1), story("Autre", 5, 1)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["Seule", "Autre"]);
  });
  it("tronque SANS repêcher : une histoire hors top-3 ne remonte pas (pool partagé avec le radar)", () => {
    const st = [story("A", 30, 4), story("B", 25, 1), story("C", 20, 2), story("D", 18, 5)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["A", "B", "C"]);
  });
  it("classe par saillance cumulée décroissante et ignore les histoires sans média QC", () => {
    const st = [story("Faible", 30, 2), story("Forte", 50, 2), { label: "ROC", sumQc: 99, qcMedia: new Set() }];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["Forte", "Faible"]);
  });
});

describe("classement pur : la Une suit la saillance pondérée 24 h comme le radar (plancher retiré 2026-07-23)", () => {
  const B = ["2026-07-19T23", "2026-07-20T03", "2026-07-20T07", "2026-07-20T11", "2026-07-20T15"];
  const withSeries = (label: string, sumQc: number, nQcMedia: number, scores: number[]) =>
    ({ label, sumQc, qcMedia: new Set(Array.from({ length: nQcMedia }, (_, i) => `M${i}`)),
       series: B.slice(-scores.length).map((b, i) => ({ blockUtc: b, qc: scores[i] })) });

  it("une histoire au plus gros cumul reste le héros même absente du bloc courant (cas Oliver Jones)", () => {
    // Pic ~record pendant la nuit, retombé le matin, mais toujours #1 au cumul
    // pondéré 24 h → doit rester le héros (le radar Deux solitudes le montre en gras).
    const st = [
      withSeries("Oliver Jones", 117, 5, [0, 26, 105, 60, 0]),  // absent du bloc courant
      withSeries("tarifs", 90, 3, [0, 37, 0, 0, 33]),           // frais mais cumul plus bas
    ];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label))
      .toEqual(["Oliver Jones", "tarifs"]);
  });
  it("tradeoff assumé : une histoire retombée au plus gros cumul coiffe une fraîche plus petite", () => {
    // Ancien « cas soccer » : sans plancher, la plus grosse au cumul reste #1, la
    // fraîche plus petite passe #2 — comportement voulu (banc de mesure interne :
    // la moyenne pondérée fait décroître le soccer d'elle-même en quelques blocs).
    const st = [
      withSeries("soccer", 74, 3, [90, 54, 21, 10, 0]),   // plus gros cumul, retombé
      withSeries("inflation", 45, 2, [0, 0, 0, 0, 45]),   // frais, cumul plus bas
    ];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label))
      .toEqual(["soccer", "inflation"]);
  });
  it("garde toujours ≥ 1 Une et le héros = plus gros cumul QC", () => {
    const st = [
      withSeries("A", 74, 3, [90, 54, 21, 10, 0]),
      withSeries("B", 40, 2, [50, 30, 8, 4, 0]),
    ];
    const unes = selectTopUnes(st as never).map((s: { label: string }) => s.label);
    expect(unes.length).toBeGreaterThan(0);
    expect(unes[0]).toBe("A");
  });
});

describe("windowConvergence (convergence 24h, moyenne pondérée des blocs)", () => {
  it("pondère par l'attention : un bloc chargé pèse plus qu'un bloc creux", () => {
    // Bloc 16-20 : indice 80, forte attention (qc+roc = 100) ;
    // bloc 12-16 : indice 0, faible attention (qc+roc = 4).
    const rows = [
      ev({ interval_convergence_score: 80, score_qc: 60, score_roc: 40, time_interval_utc: "16-20" }),
      ev({ interval_convergence_score: 0, score_qc: 2, score_roc: 2, time_interval_utc: "12-16" }),
    ];
    // (80·100 + 0·4) / (100 + 4) ≈ 76,9 — bien au-dessus de la moyenne simple 40.
    expect(windowConvergence(rows as never)).toBeCloseTo((80 * 100) / 104, 5);
  });
  it("renvoie null si aucun bloc de la fenêtre n'a d'indice publié", () => {
    const rows = [ev({ interval_convergence_score: null, score_qc: 10, score_roc: 5 })];
    expect(windowConvergence(rows as never)).toBeNull();
  });
  it("repli sur la moyenne simple quand les blocs à indice sont sans saillance", () => {
    const rows = [
      ev({ interval_convergence_score: 40, score_qc: 0, score_roc: 0, time_interval_utc: "16-20" }),
      ev({ interval_convergence_score: 60, score_qc: 0, score_roc: 0, time_interval_utc: "12-16" }),
    ];
    expect(windowConvergence(rows as never)).toBe(50);
  });
});

describe("buildSolitudes", () => {
  const sol = (latest: unknown[], all: unknown[]) =>
    buildSolitudes(latest as never, storiesFrom24h(all as never), windowConvergence(all as never));

  it("lit l'indice de convergence objet (24h) et calcule divPct = 100 − conv", () => {
    const row = ev({ interval_convergence_score: 80, score_qc: 20, score_roc: 18 });
    const s = sol([row], [row]);
    expect(s.convPct).toBe(80);
    expect(s.divPct).toBe(20);
    // La bulle du marqueur dit le niveau du moment en CONVERGENCE, la même
    // grandeur que la position du marqueur sur la piste (`left: convPct%`).
    // Ancré sur le DÉBUT de la phrase : un simple `toContain("80")` passait
    // aussi si 80 n'apparaissait que dans « Habituel », sans rien garantir sur
    // la valeur du moment — le défaut que ce test est censé verrouiller.
    // L'espace avant % est insécable, comme dans toute l'interface.
    expect(s.markerTitle).toMatch(/^Aujourd'hui : 80 % de convergence\./);
    expect(s.markerTitle).toMatch(/Habituel : \d+ %\.$/);
  });

  it("repli 24h : sans indice publié, exclusivité pondérée des histoires (pas du bloc)", () => {
    // Aucun indice objet → repli. Une histoire quasi exclusivement QC ⇒ divergence.
    const rows = [
      ev({ storyline_id: "qc", title: "QC", score_qc: 90, score_roc: 0, interval_convergence_score: null }),
      ev({ storyline_id: "ca", title: "CA", score_qc: 0, score_saillance: 80, interval_convergence_score: null, country_id: "CAN", media_ids: '["CBC"]' }),
    ];
    const s = sol(rows, rows);
    expect(s.convPct).toBeLessThan(50);
    // Même une journée divergente se chiffre en convergence : c'est le défaut
    // corrigé — le module basculait de vocabulaire selon le côté du milieu, et
    // la bulle du marqueur annonçait une divergence là où le marqueur était
    // posé à `convPct`. Un seul mot chiffré à l'écran, quel que soit le jour.
    expect(s.markerTitle).toContain("de convergence");
    expect(s.markerTitle).not.toContain("divergence");
    expect(s.relInfo).not.toContain("divergence");
  });

  it("garde au plus 6 axes, la plus grosse histoire en tête", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      ev({ storyline_id: `s${i}`, title: `Histoire ${i}`, score_qc: i + 1, score_roc: 0, interval_convergence_score: 10 }),
    );
    const s = sol(rows, rows);
    expect(s.axes.length).toBe(6);
    expect(s.axes[0].label).toBe("Histoire 8");
    expect(s.axes.every((a) => a.qcShare >= 0 && a.qcShare <= 100)).toBe(true);
  });

  it("attribue le camp dominant (side)", () => {
    const row = ev({ title: "Sujet QC", score_qc: 30, score_roc: 5, interval_convergence_score: 10 });
    const s = sol([row], [row]);
    expect(s.axes[0].side).toBe("qc");
  });

  it("repère « habituel » = médiane event-level (défaut mesuré, sinon param calibré)", () => {
    const row = ev({ interval_convergence_score: 80, score_qc: 20, score_roc: 18 });
    // Repli = médiane event-level mesurée via le vrai code (HABITUAL_EVENT_CONV
    // = 31 %), confirmée au #272 par la métrique publiée event_convergence.p50,
    // qui vaut aussi 31.
    expect(sol([row], [row]).habitualConvPct).toBe(31);
    // La valeur publiée (event_convergence.p50) prime quand elle est là.
    const calibré = buildSolitudes([row] as never, storiesFrom24h([row] as never), 80, 44);
    expect(calibré.habitualConvPct).toBe(44);
  });

  it("verrouille l'orientation de l'axe : Québec à DROITE, Canada à GAUCHE (#395/#399)", () => {
    const row = ev({ interval_convergence_score: 60, score_qc: 20, score_roc: 18 });
    const s = sol([row], [row]);
    // Les positions sont un pourcentage sur l'axe, de 0 (extrême gauche) à 100
    // (extrême droite). Le symbole du Québec doit être posé à DROITE de celui
    // du Canada — le sens corrigé au #395 (retour Shannon + Adrien), aligné sur
    // ce que le radar fait déjà structurellement. Ce test échoue si le
    // destructuring `[canSymbolPos, qcSymbolPos]` est ré-inversé en silence.
    expect(s.qcSymbolPos).toBeGreaterThan(s.canSymbolPos);
    // Chaque camp dans sa moitié : Canada à gauche du centre, Québec à droite.
    expect(s.canSymbolPos).toBeLessThan(50);
    expect(s.qcSymbolPos).toBeGreaterThan(50);
  });

  it("niveau du bout de ligne : mêmes constructions des deux côtés (#273), repli ROC au pic", () => {
    // Un sujet mené par le CANADA (aucun média QC) : son niveau doit venir du
    // CUMUL 24 h (`sumRoc` = 50 ici) contre la calibration cumulée
    // `score_roc_sum_24h` — plus jamais du pic contre les scores de bloc, le
    // compromis qui faisait dire deux niveaux à la même histoire (2026-08-03).
    const can = ev({ storyline_id: "ca", title: "Sujet CAN", score_qc: 0,
      score_roc: 50, country_id: "CAN", media_ids_roc: '["CBC"]',
      interval_convergence_score: 10 });
    const stories = storiesFrom24h([can] as never);
    const sumRoc = { faible: 1, moyenne: 10, eleve: 100, tresEleve: 200, extreme: 300 };
    const rocBlocs = { faible: 1, moyenne: 2, eleve: 3, tresEleve: 4, extreme: 5 };
    const avecCumul = buildSolitudes([can] as never, stories, 10, 31,
      { p20: 16, p80: 42 },
      { badgeRanks: new Map(), sumThresholds: sumRoc, sumRocThresholds: sumRoc, roc: rocBlocs });
    // cumul 50 : ≥ moyenne (10), < eleve (100) → « Modérée », population ROC.
    expect(avecCumul.axes[0].salienceLabel).toBe("Modérée");
    expect(avecCumul.axes[0].salienceHint).toContain("canadiens");
    // REPLI transitoire : sans calibration cumulée, l'ancien chemin (pic 24 h
    // vs blocs) reste — ici pic 50 ≥ extreme (5) → « Exceptionnelle ». Le même
    // sujet change d'étiquette entre les deux chemins : c'est le test qui
    // verrouille que le nouveau chemin est bien prioritaire quand publié.
    const sansCumul = buildSolitudes([can] as never, stories, 10, 31,
      { p20: 16, p80: 42 },
      { badgeRanks: new Map(), sumThresholds: sumRoc, sumRocThresholds: null, roc: rocBlocs });
    expect(sansCumul.axes[0].salienceLabel).toBe("Exceptionnelle");
    // Côté QC, rien ne bouge : le rang du badge du module 1 est repris tel quel.
    const qc = ev({ storyline_id: "s-qc", title: "Sujet QC", score_qc: 40,
      interval_convergence_score: 10 });
    const sQc = buildSolitudes([qc] as never, storiesFrom24h([qc] as never), 10, 31,
      { p20: 16, p80: 42 },
      { badgeRanks: new Map([["s-qc", { rank: 5 }]]), sumThresholds: sumRoc, sumRocThresholds: sumRoc, roc: rocBlocs });
    expect(sQc.axes[0].salienceLabel).toBe("Très élevée");
    expect(sQc.axes[0].salienceHint).toContain("québécois");
  });
});

describe("relScore (#258 : hero relatif, l'intensité vit dans la bulle ⓘ)", () => {
  it("écart + direction au libellé, intensité « un peu » dans la bulle", () => {
    const r = relScore(35, 31, 16, 42);
    expect(r.relDiffPct).toBe(4);
    expect(r.relLabel).toBe("plus convergent que d'habitude");
    expect(r.relInfo).toContain("consacrent 31 % de leur attention");
    expect(r.relInfo).toContain("35 %, un peu plus que d'habitude");
    expect(r.relCls).toBe("mode-convp");
  });

  it("« nettement » quand le moment sort de la bande p20-p80 (bulle seulement)", () => {
    const haut = relScore(45, 31, 16, 42);
    expect(haut.relLabel).toBe("plus convergent que d'habitude");
    expect(haut.relInfo).toContain("nettement plus que d'habitude");
    expect(haut.relCls).toBe("mode-con");
    const bas = relScore(12, 31, 16, 42);
    expect(bas.relLabel).toBe("plus divergent que d'habitude");
    expect(bas.relInfo).toContain("nettement moins que d'habitude");
    expect(bas.relCls).toBe("mode-div");
  });

  it("« un peu plus divergent » entre p20 et l'habituel", () => {
    const r = relScore(24, 31, 16, 42);
    expect(r.relDiffPct).toBe(7);
    expect(r.relLabel).toBe("plus divergent que d'habitude");
    expect(r.relInfo).toContain("un peu moins que d'habitude");
  });

  it("écart nul : « aussi convergent que d'habitude », « autant » dans la bulle", () => {
    const r = relScore(31, 31, 16, 42);
    expect(r.relDiffPct).toBe(0);
    expect(r.relLabel).toBe("aussi convergent que d'habitude");
    expect(r.relInfo).toContain("autant que d'habitude");
  });
});

// ── B6 — le nombre de manchettes reflète la journée (vitrine#430) ────────────
describe("selectTopUnes — règle de domination (#430 B6)", () => {
  const { selectTopUnes } = __test__;
  const st = (label: string, sumQc: number) =>
    ({ label, sumQc, qcMedia: new Set(["M1"]), series: [{ blockUtc: "2026-07-20T15", qc: sumQc }] });

  it("une histoire qui écrase les autres reste seule", () => {
    // Cas réel du 2026-08-09 : 79,4 / 37,6 / 21,7 — la 2e est à 47 % du meneur.
    expect(selectTopUnes([st("Incendies", 79.4), st("Élus", 37.6), st("Douane", 21.7)] as never)
      .map((s: { label: string }) => s.label)).toEqual(["Incendies"]);
  });
  it("deux histoires comparables → deux manchettes", () => {
    expect(selectTopUnes([st("A", 80), st("B", 60), st("C", 20)] as never)
      .map((s: { label: string }) => s.label)).toEqual(["A", "B"]);
  });
  it("trois histoires comparables → trois manchettes, même toutes faibles", () => {
    // LE cas qui inquiétait Adrien : une journée creuse ne doit pas vider le
    // module. La règle compare les histoires ENTRE ELLES, jamais à un plancher.
    expect(selectTopUnes([st("A", 9), st("B", 8), st("C", 7)] as never)
      .map((s: { label: string }) => s.label)).toEqual(["A", "B", "C"]);
  });
  it("le meneur passe toujours : le module ne peut pas se vider", () => {
    expect(selectTopUnes([st("Seule", 0.4)] as never).map((s: { label: string }) => s.label))
      .toEqual(["Seule"]);
  });
  it("la 3e est jugée sur le meneur, pas sur la 2e", () => {
    // 100 / 55 / 52 : la 3e vaut 95 % de la 2e mais 52 % du meneur → elle passe.
    expect(selectTopUnes([st("A", 100), st("B", 55), st("C", 52)] as never)).toHaveLength(3);
    // 100 / 55 / 45 : la 3e tombe sous la moitié du meneur → elle sort.
    expect(selectTopUnes([st("A", 100), st("B", 55), st("C", 45)] as never)).toHaveLength(2);
  });
});
