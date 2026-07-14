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
const { pctile, rocScore, convMode, solitudesEdito, symbolPositions, buildSolitudes, blockKey, CAL_CONV } = __test__;

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

describe("buildSolitudes", () => {
  const ev = (over: Record<string, unknown>) => ({
    country_id: "QC", title: "T", score_qc: 0, score_saillance: 0,
    media_ids: "[]", articles: "[]", interval_convergence_score: null,
    date_utc: "2026-07-13", time_interval_utc: "16-20", storyline_id: "s",
    ...over,
  });

  it("lit l'indice de convergence objet et calcule divPct = 100 − conv", () => {
    const row = ev({ interval_convergence_score: 80, score_qc: 20, score_roc: 18 });
    const s = buildSolitudes([row] as never, [row] as never);
    expect(s.convPct).toBe(80);
    expect(s.divPct).toBe(20);
    expect(s.verb).toBe("convergence");
    expect(s.scoreValue).toBe(80);
  });

  it("agrège la part d'attention 24h par storyline et garde au plus 6 axes", () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      ev({ event_id: `e${i}`, storyline_id: `s${i}`, title: `Histoire ${i}`, score_qc: i + 1, score_roc: 0, interval_convergence_score: 10 }),
    );
    const s = buildSolitudes(rows as never, rows as never);
    expect(s.axes.length).toBe(6);
    expect(s.axes[0].label).toBe("Histoire 8"); // la plus couverte en tête
    expect(s.axes[0].qcRadial).toBe(100); // le plus gros sujet touche le bord
    // Les parts (share) somment de façon cohérente (chaque part <= 100)
    expect(s.axes.every((a) => a.qcShare >= 0 && a.qcShare <= 100)).toBe(true);
  });

  it("somme la saillance d'une storyline sur plusieurs blocs (fenêtre 24h)", () => {
    const rows = [
      ev({ event_id: "a1", storyline_id: "sA", title: "A", score_qc: 10, time_interval_utc: "16-20" }),
      ev({ event_id: "a2", storyline_id: "sA", title: "A", score_qc: 6, time_interval_utc: "12-16" }),
      ev({ event_id: "b1", storyline_id: "sB", title: "B", score_qc: 4, time_interval_utc: "16-20" }),
    ];
    const s = buildSolitudes([rows[0], rows[2]] as never, rows as never);
    // sA agrège 10+6=16 sur 24h → domine sB (4)
    expect(s.axes[0].label).toBe("A");
    expect(s.axes[0].qcShare).toBe(80); // 16 / (16+4)
  });

  it("attribue le camp dominant (side) par valeur radiale", () => {
    const row = ev({ title: "Sujet QC", score_qc: 30, score_roc: 5, interval_convergence_score: 10 });
    const s = buildSolitudes([row] as never, [row] as never);
    expect(s.axes[0].side).toBe("qc");
  });
});
