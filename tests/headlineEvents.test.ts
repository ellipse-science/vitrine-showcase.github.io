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
const { pctile, rocScore, convMode, solitudesEdito, symbolPositions, buildSolitudes, storiesFrom24h, windowConvergence, blockKey, titleTokens, sameStory, CAL_CONV } = __test__;

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
  it("somme la saillance d'une storyline sur plusieurs blocs (fenêtre 24h)", () => {
    const rows = [
      ev({ storyline_id: "sA", title: "A", score_qc: 10, time_interval_utc: "16-20" }),
      ev({ storyline_id: "sA", title: "A", score_qc: 6, time_interval_utc: "12-16" }),
      ev({ storyline_id: "sB", title: "B", score_qc: 4, time_interval_utc: "16-20" }),
    ];
    const st = storiesFrom24h(rows as never).sort((a: { sumQc: number }, b: { sumQc: number }) => b.sumQc - a.sumQc);
    expect(st[0].label).toBe("A");
    expect(st[0].sumQc).toBe(16); // 10 + 6 sur 24h
    expect(st[0].peakQc).toBe(10); // pic = max bloc (échelle du score de bloc)
    expect(st[1].sumQc).toBe(4);
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
});
