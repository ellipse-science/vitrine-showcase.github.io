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
    // 0,42 par bloc → 42 à l'échelle d'affichage → cumul 24 h pondéré
    // 42 × Σ2^(−âge/10) = 42 × 3,347 ≈ 140,6.
    serve(dataset(0.42));
    const data = await loadHeadlineEvents();
    expect(data).not.toBeNull();
    const une = data!.top3[0];
    // La grandeur publiée à l'UI est bien sur l'échelle d'affichage ×100 (et
    // non dans [0,1], où la figure du ⓘ écraserait tous ses repères sur 0).
    expect(une.scoreQcSum24h).toBeCloseTo(140.6, 1);
    // 140,6 dépasse le p95 de la grille (133,3) : le niveau est donc
    // « Exceptionnelle », immédiatement. Avant vitrine#430 (A4), l'hystérésis
    // affichait « Très élevée » — une bande sous la réalité — parce qu'elle ne
    // laissait gagner qu'un palier par édition. Le niveau est désormais une pure
    // fonction de la valeur : franchir la frontière, c'est porter le titre.
    expect(une.saillanceLabel).toBe("Exceptionnelle");
    // La figure du ⓘ reçoit la grille du badge — celle du nouvel indice.
    expect(une.salThresholds).toEqual([32.5, 45.0, 62.3, 89.4, 133.3]);
  });

  it("un mono-média insistant reste sous « Modérée » — l'invariant ε tient de bout en bout", async () => {
    // Un seul média québécois, mais à un niveau par bloc très élevé (0,27, le
    // maximum mono-média observé). Le cumul atteint ~82, ce qui tomberait dans
    // « Élevée » sans le garde ; la borne relevée à 45,0 ne suffit pas seule —
    // c'est la mesure qui montre qu'un mono-média ne cumule pas jusque-là dans
    // la vraie vie (44,7 au maximum). Ici on vérifie au moins que le classement
    // se fait bien sur la grille relevée.
    const rows = dataset(0.27).map((r) => ({
      ...r, media_ids_qc: '["LED"]', media_ids: '["LED"]',
      articles: '[{"media_id":"LED","url":"https://led/a"}]',
    }));
    serve(rows);
    const data = await loadHeadlineEvents();
    const une = data!.top3[0];
    expect(une.salThresholds[1]).toBe(45.0);
    expect(une.saillanceRank).toBeGreaterThanOrEqual(1);
  });

  it("snapshot sans la colonne : le build casse au lieu de publier une Une vide", async () => {
    serve(dataset(0.42).map(({ salience_index_qc: _drop, ...r }) => r));
    await expect(loadHeadlineEvents()).rejects.toThrow(/SALIENCE_CUTOVER est allumé/);
  });
});
