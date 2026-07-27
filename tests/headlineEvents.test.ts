import { describe, it, expect } from "vitest";
import { __test__ } from "@/lib/data/headlineEvents";

const { latestIssueRow, parseIssuesMeta, capitalizeObject, firstSeenSaillantLabel, dedupeByStoryline } = __test__;

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
      .toBe("ce matin, 8 h");
  });
  it("veille : 0h UTC le 11 = 20h Montréal le 10 → « hier soir, 20 h »", () => {
    expect(firstSeenSaillantLabel("2026-07-11T00:00:00Z", "2026-07-11"))
      .toBe("hier soir, 20 h");
  });
  it("arrondit à l'édition la plus proche en heure d'hiver (EST : 0h UTC = 19h)", () => {
    expect(firstSeenSaillantLabel("2026-01-15T00:00:00Z", "2026-01-15"))
      .toBe("hier soir, 20 h");
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
const { pctile, rocScore, convMode, solitudesEdito, symbolPositions, buildSolitudes, storiesFrom24h, selectTopUnes, windowConvergence, windowEventConvergence, salThresholdsFrom, calConvFrom, SAL_QC_THRESHOLDS, blockKey, titleTokens, sameStory, CAL_CONV, buildSalienceTrend } = __test__;

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
  it("place la médiane de convergence (14) au centre de la jauge (p50)", () => {
    expect(pctile(14, CAL_CONV)).toBeCloseTo(50, 5);
  });
  it("plafonne à 100", () => {
    expect(pctile(999, CAL_CONV)).toBe(100);
  });
});

describe("rocScore", () => {
  it("lit score_roc directement quand présent", () => {
    expect(rocScore({ score_roc: 12, score_saillance: 30, score_qc: 8, score_us: 5 } as never)).toBe(12);
  });
  it("repli transitoire : saillance − qc − us (ne réabsorbe pas les USA)", () => {
    expect(rocScore({ score_saillance: 30, score_qc: 8, score_us: 5 } as never)).toBe(17);
  });
  it("repli plancher à 0", () => {
    expect(rocScore({ score_saillance: 5, score_qc: 8 } as never)).toBe(0);
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

describe("blockKey", () => {
  it("produit une clé triable date + heure de début", () => {
    expect(blockKey({ date_utc: "2026-07-13", time_interval_utc: "08-12" } as never)).toBe("2026-07-13T08");
    expect(blockKey({ date_utc: "2026-07-13", time_interval_utc: "4-8" } as never)).toBe("2026-07-13T04");
  });
});

const ev = (over: Record<string, unknown>) => ({
  country_id: "QC", title: "T", score_qc: 0, score_saillance: 0,
  media_ids: "[]", articles: "[]", interval_convergence_score: null,
  date_utc: "2026-07-13", time_interval_utc: "16-20", storyline_id: "s",
  ...over,
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
describe("hysteresisRank (lissage du badge cumulé)", () => {
  const T = __test__.SUM_QC_THRESHOLDS; // {faible:21.4, moyenne:31, eleve:47.9, tresEleve:102.4, extreme:192.8}
  const { rawRank, hysteresisRank } = __test__;

  it("sans niveau précédent, rend le niveau brut", () => {
    expect(hysteresisRank(undefined, 50, T)).toBe(rawRank(50, T)); // 47.9 ≤ 50 → rang 4
    expect(hysteresisRank(undefined, 50, T)).toBe(4);
  });

  it("ne monte pas d'une bande pour un franchissement de justesse", () => {
    // 48 dépasse le seuil « Élevée » (47.9) mais pas de 8 % → reste à 3.
    expect(rawRank(48, T)).toBe(4);
    expect(hysteresisRank(3, 48, T)).toBe(3);
  });

  it("monte quand la marge est franchie", () => {
    expect(hysteresisRank(3, 47.9 * 1.09, T)).toBe(4);
  });

  it("ne redescend pas pour un repli de justesse sous le seuil quitté", () => {
    // 47 est juste sous 47.9 : le badge « Élevée » tient.
    expect(rawRank(47, T)).toBe(3);
    expect(hysteresisRank(4, 47, T)).toBe(4);
  });

  it("redescend quand le repli est net", () => {
    expect(hysteresisRank(4, 47.9 * 0.91, T)).toBe(3);
  });

  it("un aller-retour de frontière ne fait bouger le badge ni à l'aller ni au retour", () => {
    let r = 3;
    for (const v of [48, 47, 48.5, 46.5, 48]) r = hysteresisRank(r, v, T);
    expect(r).toBe(3);
  });

  it("laisse passer une vraie décroissance, bande après bande", () => {
    // Trajectoire réelle (tarifs, 23-24 juillet) : 261 → 198 → 150 → 110 → 68 → 34
    const suite = [261.8, 198.4, 150.4, 110.5, 68.1, 33.8];
    let r: number | undefined = undefined;
    const rangs = suite.map((v) => (r = hysteresisRank(r, v, T)));
    expect(rangs).toEqual([6, 6, 5, 5, 4, 3]); // le badge redescend avec l'histoire
  });
});

describe("buildSalienceTrend (#274/#304 — tendance = variation de la part d'attention)", () => {
  const thr = SAL_QC_THRESHOLDS; // pics : {faible:8, moyenne:11, eleve:19, tresEleve:48, extreme:95}
  // present = la nouvelle a fait la Une à ce bloc. `share` = part d'attention QC du
  // bloc (qc histoire / qc total du bloc), calculée en amont (storiesFrom24h). La
  // TENDANCE (#304) compare la part des DEUX derniers blocs ; la mini-courbe et les
  // niveaux par bloc restent, eux, basés sur `qc`.
  const decline = [
    { blockUtc: "2026-07-19T19", qc: 0, present: false, share: 0 }, { blockUtc: "2026-07-19T23", qc: 100, present: true, share: 55 },
    { blockUtc: "2026-07-20T03", qc: 50, present: true, share: 40 }, { blockUtc: "2026-07-20T07", qc: 12, present: true, share: 25 },
    { blockUtc: "2026-07-20T11", qc: 0, present: false, share: 0 },
  ];
  it("absente du bloc courant : l'attention est retombée, JAMAIS « plus à la Une »", () => {
    const t = buildSalienceTrend(decline as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("down");
    expect(t.deltaPct).toBe(-25);
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
    expect(t.points.find((p: { isNow: boolean }) => p.isNow)!.level).toBe("Pas à la Une"); // bloc sans Une → absente, pas « faible »
    expect(t.points.find((p: { score: number }) => p.score === 50)!.level).toBe("Très élevée"); // 48 ≤ 50 < 95
    expect(t.points.find((p: { score: number }) => p.score === 12)!.level).toBe("Modérée"); // 11 ≤ 12 < 19
    // première apparition = premier bloc à score > 0
    expect(t.points.filter((p: { isFirst: boolean }) => p.isFirst)).toHaveLength(1);
    expect(t.points.find((p: { isFirst: boolean }) => p.isFirst)!.score).toBe(100);
  });
  it("détecte la progression (part qui monte d'un bloc au suivant : 15 → 32 = +17)", () => {
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T03", qc: 4, present: true, share: 10 }, { blockUtc: "2026-07-20T07", qc: 9, present: true, share: 15 },
      { blockUtc: "2026-07-20T11", qc: 20, present: true, share: 32 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("up");
    expect(t.deltaPct).toBe(17);
    // Part la plus haute de la fenêtre → « au plus haut du jour », pas d'ancre
    // au sommet (elle EST le sommet).
    expect(t.situation).toBe("sommet");
    // Seul cas où l'écart se compte depuis le BLOC PRÉCÉDENT : au sommet,
    // « sous le sommet » n'a pas de sens, la question est « de combien elle a monté ».
    // Notation en % (et non « points »), alignée sur le module des enjeux.
    expect(t.capLabel).toMatch(/^Nouveau sommet aujourd’hui \(\+17 % depuis /);
  });
  // Ampleur = variation de la PART d'attention entre les deux derniers blocs (#304).
  it("deltaPct baisse : 25 % → 15 % = −10 points", () => {
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T07", qc: 40, present: true, share: 25 },
      { blockUtc: "2026-07-20T11", qc: 30, present: true, share: 15 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("down");
    expect(t.deltaPct).toBe(-10);
  });
  it("deltaPct hausse : 10 % → 22 % = +12 points", () => {
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T07", qc: 12, present: true, share: 10 },
      { blockUtc: "2026-07-20T11", qc: 30, present: true, share: 22 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("up");
    expect(t.deltaPct).toBe(12);
  });
  it("stable : part inchangée → dir flat, et le SCORE qui monte ne fait pas un sommet", () => {
    // qc monte (40 → 42) mais la part ne bouge pas : la boîte parle de PART,
    // donc ce n'est pas « au plus haut du jour ».
    const t = buildSalienceTrend([
      { blockUtc: "2026-07-20T07", qc: 40, present: true, share: 30 },
      { blockUtc: "2026-07-20T11", qc: 42, present: true, share: 30 },
    ] as never, thr, "2026-07-20")!;
    expect(t.dir).toBe("flat");
    expect(t.deltaPct).toBe(0);
    expect(t.situation).toBe("stable");
    expect(t.capLabel).toMatch(/^Se maintient \(Sommet .+\)$/);
  });
  it("distingue « Absente » (pas à la Une) d'une saillance faible réelle", () => {
    const trend = buildSalienceTrend([
      { blockUtc: "2026-07-20T03", qc: 0, present: false, share: 0 },  // pas à la Une → Absente
      { blockUtc: "2026-07-20T07", qc: 3, present: true, share: 5 },   // à la Une mais faible (< seuil faible=8)
      { blockUtc: "2026-07-20T11", qc: 40, present: true, share: 30 },
    ] as never, thr, "2026-07-20")!;
    const absent = trend.points[0], faible = trend.points[1];
    expect(absent.level).toBe("Pas à la Une");
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
});

describe("selectTopUnes (#273 — seuil éditorial : 1 à 3 Unes, pas toujours 3)", () => {
  // selectTopUnes classe par sumQc (saillance QC cumulée 24 h) et applique le
  // seuil éditorial ≥ 2 médias QC pour les secondaires. Classement pur, sans
  // plancher de récence (retiré 2026-07-23) — cf. describe « classement pur » plus bas.
  const story = (label: string, sumQc: number, nQcMedia: number) =>
    ({ label, sumQc, qcMedia: new Set(Array.from({ length: nQcMedia }, (_, i) => `M${i}`)),
       series: [{ blockUtc: "2026-07-20T15", qc: Math.max(1, sumQc) }] });

  it("garde les 3 Unes quand les secondaires sont multi-médias", () => {
    const st = [story("A", 30, 4), story("B", 20, 2), story("C", 10, 3)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["A", "B", "C"]);
  });
  it("cas du 16-17 juillet : héros multi-médias + 2 secondaires mono-média → une seule Une", () => {
    const st = [story("Argentine", 30, 4), story("Montréal vibre", 20, 1), story("Tiques", 10, 1)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["Argentine"]);
  });
  it("le héros reste affiché même mono-média (le module a toujours ≥ 1 Une)", () => {
    const st = [story("Seule", 8, 1), story("Autre", 5, 1)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["Seule"]);
  });
  it("tronque SANS repêcher : une multi-média hors top-3 ne remonte pas (sélection partagée avec le radar)", () => {
    const st = [story("A", 30, 4), story("B", 20, 1), story("C", 10, 2), story("D", 5, 5)];
    expect(selectTopUnes(st as never).map((s: { label: string }) => s.label)).toEqual(["A", "C"]);
  });
  it("classe par saillance cumulée décroissante et ignore les histoires sans média QC", () => {
    const st = [story("Faible", 5, 2), story("Forte", 50, 2), { label: "ROC", sumQc: 99, qcMedia: new Set() }];
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
      withSeries("inflation", 14, 2, [0, 0, 0, 0, 14]),   // frais, cumul plus bas
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
    expect(s.verb).toBe("convergence");
    expect(s.scoreValue).toBe(80);
  });

  it("repli 24h : sans indice publié, exclusivité pondérée des histoires (pas du bloc)", () => {
    // Aucun indice objet → repli. Une histoire quasi exclusivement QC ⇒ divergence.
    const rows = [
      ev({ storyline_id: "qc", title: "QC", score_qc: 90, score_roc: 0, interval_convergence_score: null }),
      ev({ storyline_id: "ca", title: "CA", score_qc: 0, score_saillance: 80, interval_convergence_score: null, country_id: "CAN", media_ids: '["CBC"]' }),
    ];
    const s = sol(rows, rows);
    expect(s.convPct).toBeLessThan(50);
    expect(s.verb).toBe("divergence");
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
    // Défaut = médiane event-level mesurée via le vrai code (HABITUAL_EVENT_CONV = 31 %).
    expect(sol([row], [row]).habitualConvPct).toBe(31);
    // Câblé : quand la calibration glissante publiera event_convergence.p50, il prime.
    const calibré = buildSolitudes([row] as never, storiesFrom24h([row] as never), 80, 44);
    expect(calibré.habitualConvPct).toBe(44);
  });
});
