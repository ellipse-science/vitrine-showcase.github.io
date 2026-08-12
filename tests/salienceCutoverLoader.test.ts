import { describe, it, expect, vi } from "vitest";

// Répétition générale du jour J, en traversant le VRAI chargeur.
//
// Les tests unitaires du cutover (tests/salienceCutover.test.ts) prouvent que
// l'accesseur et les grilles font ce qu'il faut. Ils ne prouvent pas que le
// chargeur les BRANCHE correctement — or c'est là que vit le risque : un badge
// classé avec la grille de l'autre indice type-checke parfaitement et se
// déploie sans une erreur. Ici, on allume le flag pour de vrai et on lit ce que
// la page afficherait.
vi.mock("@/lib/data/salienceCutover", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/salienceCutover")>()),
  SALIENCE_CUTOVER: true,
}));

const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({ default: { readFile: (...a: unknown[]) => readFileMock(...a) } }));

const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
const { NEW_SUM_QC_THRESHOLDS } = await import("@/lib/data/salienceCutover");

// Somme des six poids de récence d'une fenêtre 24 h à demi-vie 10 h :
// Σ 2^(−4k/10) pour k = 0..5. Sert à viser une valeur de cumul depuis une
// valeur par bloc, sans recopier un résultat intermédiaire.
const SOMME_POIDS = [0, 1, 2, 3, 4, 5].reduce((s, k) => s + Math.pow(2, (-4 * k) / 10), 0);
/** Valeur par bloc qui produit le cumul 24 h visé (à l'échelle d'affichage). */
const blocPourCumul = (cumul: number) => cumul / SOMME_POIDS / 100;

// Six blocs, une histoire québécoise portée par deux médias. Les deux colonnes
// sont peuplées et DISCORDANTES : l'ancien indice placerait l'histoire tout en
// haut (score_qc = 60 → cumul ≈ 260, au-dessus de l'ancien p95 de 192,8), le
// nouveau la place au milieu (0,42 ×100 = 42 par bloc → cumul ≈ 182 … non :
// voir l'assertion, c'est la grille qui change tout).
const BLOCS: [string, string][] = [
  ["2026-07-26", "11-15"], ["2026-07-26", "15-19"], ["2026-07-26", "19-23"],
  ["2026-07-26", "23-03"], ["2026-07-27", "03-07"], ["2026-07-27", "07-11"],
];

function dataset(idxQc: number) {
  return BLOCS.map(([date, interval], i) => ({
    country_id: "QC",
    event_id: `alpha-${i}`,
    storyline_id: "alpha",
    title: "Alpha",
    target_region: "QC",
    date_utc: date,
    time_interval_utc: interval,
    date_montreal_tz: date,
    time_interval_montreal_tz: interval,
    score_qc: 60,
    score_roc: 0,
    score_saillance: 60,
    salience_index_qc: idxQc,
    salience_index_roc: 0,
    media_ids: '["LED","LAP"]',
    media_ids_qc: '["LED","LAP"]',
    media_ids_roc: "[]",
    articles: '[{"media_id":"LED","url":"https://led/a"},{"media_id":"LAP","url":"https://lap/a"}]',
    interval_convergence_score: null,
  }));
}

// Le chargeur lit deux fichiers : le snapshot, puis la calibration (absente ici
// → repli sur les grilles codées, ce qui est justement l'état du jour J).
const serve = (rows: unknown[]) => {
  readFileMock.mockReset();
  readFileMock.mockImplementation((p: string) =>
    String(p).includes("headline-events.json")
      ? Promise.resolve(JSON.stringify(rows))
      : Promise.reject(new Error("absent")));
};

describe("chargeur, flag ALLUMÉ", () => {
  it("classe la Une avec la grille du NOUVEL indice, pas celle de l'ancien", async () => {
    // On vise 5 % AU-DESSUS du p95 de la grille du badge — dérivé de la grille
    // plutôt qu'écrit en dur, parce que ce test porte sur une RÈGLE (« franchir
    // le p95, c'est porter le titre »), pas sur un jeu de seuils particulier.
    // Écrit en dur, il devenait faux à chaque recalibration en ayant l'air de
    // dénoncer une régression : c'est arrivé le 2026-08-12, où le p95 est passé
    // de 133,3 à 147,7 et où la valeur d'entrée s'est retrouvée SOUS le seuil.
    const cumulVise = NEW_SUM_QC_THRESHOLDS.extreme * 1.05;
    serve(dataset(blocPourCumul(cumulVise)));
    const data = await loadHeadlineEvents();
    expect(data).not.toBeNull();
    const une = data!.top3[0];
    // La grandeur publiée à l'UI est bien sur l'échelle d'affichage ×100 (et
    // non dans [0,1], où la figure du ⓘ écraserait tous ses repères sur 0).
    expect(une.scoreQcSum24h).toBeCloseTo(cumulVise, 1);
    expect(une.scoreQcSum24h).toBeGreaterThan(NEW_SUM_QC_THRESHOLDS.extreme);
    // Au-delà du p95, le niveau est « Exceptionnelle », immédiatement. Avant
    // vitrine#430 (A4), l'hystérésis affichait « Très élevée » — une bande sous
    // la réalité — parce qu'elle ne laissait gagner qu'un palier par édition. Le
    // niveau est désormais une pure fonction de la valeur : franchir la
    // frontière, c'est porter le titre.
    expect(une.saillanceLabel).toBe("Exceptionnelle");
    // La figure du ⓘ reçoit la grille du badge — celle du nouvel indice.
    const g = NEW_SUM_QC_THRESHOLDS;
    expect(une.salThresholds).toEqual([g.faible, g.moyenne, g.eleve, g.tresEleve, g.extreme]);
  });

  it("la grille du badge est bien celle du nouvel indice, aux percentiles bruts", async () => {
    // Un seul média québécois, à un niveau par bloc très élevé (0,27, le
    // maximum mono-média observé). Ce test ne vérifie PLUS un garde ε : depuis
    // vitrine#430 l'invariant est « un mono-média ne dépasse pas la médiane »,
    // et il tient par la forme de l'indice, pas par une borne relevée. Ce qui
    // est vérifié ici, c'est que la grille branchée est bien celle du nouvel
    // indice, sans béquille.
    const rows = dataset(0.27).map((r) => ({
      ...r, media_ids_qc: '["LED"]', media_ids: '["LED"]',
      articles: '[{"media_id":"LED","url":"https://led/a"}]',
    }));
    serve(rows);
    const data = await loadHeadlineEvents();
    const une = data!.top3[0];
    expect(une.salThresholds[1]).toBe(NEW_SUM_QC_THRESHOLDS.moyenne);
    expect(une.saillanceRank).toBeGreaterThanOrEqual(1);
  });

  it("snapshot sans la colonne : le build casse au lieu de publier une Une vide", async () => {
    serve(dataset(0.42).map(({ salience_index_qc: _drop, ...r }) => r));
    await expect(loadHeadlineEvents()).rejects.toThrow(/SALIENCE_CUTOVER est allumé/);
  });
});
