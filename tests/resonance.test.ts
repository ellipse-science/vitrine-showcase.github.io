import { describe, it, expect, vi } from "vitest";

// Résonance cross-région (#230). Deux choses à prouver, et la seconde compte
// autant que la première : le tag apparaît quand il doit, ET les lignes
// américaines qu'on relit pour le calculer ne retombent JAMAIS dans les scores.
// C'est le filtre `country_id !== "USA"` de uniqueQcEvents qui tient l'indice de
// convergence à sa valeur publiée (#211/#237) ; la détection de résonance passe
// à côté, en lecture seule.
const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({ default: { readFile: (...a: unknown[]) => readFileMock(...a) } }));

const ev = (over: Record<string, unknown>) => ({
  country_id: "QC", target_region: "QC", title: "T", score_qc: 0, score_roc: 0, score_us: 0,
  score_saillance: 0, media_ids: '["LED","LAP"]', media_ids_qc: '["LED","LAP"]', media_ids_roc: "[]",
  articles: '[{"media_id":"LED","url":"https://led/a"},{"media_id":"LAP","url":"https://lap/a"}]',
  interval_convergence_score: null,
  date_utc: "2026-07-27", time_interval_utc: "07-11",
  date_montreal_tz: "2026-07-27", time_interval_montreal_tz: "07-11",
  ...over,
});

// Trois histoires québécoises du même bloc, toutes trois en Une :
//   · « alpha » n'existe qu'ici → aucun tag ;
//   · « bravo » est aussi couverte par des médias du ROC → tag canadien ;
//   · « charlie » a un écho américain → tag américain.
const QC = [
  ev({ event_id: "qc-alpha", storyline_id: "alpha", score_qc: 50, score_saillance: 50,
    title: "Pénurie de logements étudiants à Rimouski" }),
  ev({ event_id: "qc-bravo", storyline_id: "bravo", score_qc: 40, score_saillance: 40,
    title: "Grève des agents de bord chez WestJet" }),
  ev({ event_id: "qc-charlie", storyline_id: "charlie", score_qc: 30, score_saillance: 30,
    title: "Accord de désarmement annoncé par Trump" }),
];

// Ligne canadienne de la MÊME storyline que « bravo » : c'est le raffineur qui
// publie `media_ids_roc` (#211), et storiesFrom24h la fusionne déjà dans
// l'histoire — d'où une résonance canadienne lisible sans rien réapparier.
const CAN = ev({
  country_id: "CAN", target_region: "CAN", event_id: "can-bravo", storyline_id: "bravo",
  title: "Grève des agents de bord chez WestJet", score_qc: 0, score_roc: 35, score_saillance: 35,
  media_ids_qc: "[]", media_ids_roc: '["CBC","GAM"]',
  articles: '[{"media_id":"CBC","url":"https://cbc/a"},{"media_id":"GAM","url":"https://gam/a"}]',
});

// Lignes américaines : la première partage le storyline_id de « charlie »,
// la seconde ne l'a pas mais porte un titre très proche (appariement de repli
// tant que le regroupement cross-langue n'est pas livré, aws-refiners#213).
const US_MEME_STORYLINE = ev({
  country_id: "USA", target_region: "US", event_id: "us-charlie", storyline_id: "charlie",
  title: "Accord de désarmement annoncé par Trump", score_qc: null, score_roc: null,
  score_us: 90, score_saillance: 90, media_ids_qc: "[]",
});
const US_TITRE_PROCHE = ev({
  country_id: "USA", target_region: "US", event_id: "us-charlie-bis", storyline_id: "autre-story",
  title: "Trump annonce un accord de désarmement historique", score_qc: null, score_roc: null,
  score_us: 80, score_saillance: 80, media_ids_qc: "[]",
});

async function unes(rows: unknown[]) {
  readFileMock.mockResolvedValue(JSON.stringify(rows));
  vi.resetModules();
  const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
  const data = (await loadHeadlineEvents())!;
  expect(data).not.toBeNull();
  return new Map(data.top3.map((u) => [u.storylineId, u]));
}

describe("résonance cross-région (#230)", () => {
  it("un sujet couvert aussi au Canada anglais porte le tag canadien, pas l'américain", async () => {
    const top = await unes([...QC, CAN]);
    expect(top.get("bravo")?.resonanceCan).not.toBeNull();
    expect(top.get("bravo")?.resonanceUs).toBeNull();
  });

  it("un sujet purement québécois ne porte aucun tag", async () => {
    const top = await unes([...QC, CAN, US_MEME_STORYLINE]);
    expect(top.get("alpha")?.resonanceCan).toBeNull();
    expect(top.get("alpha")?.resonanceUs).toBeNull();
  });

  it("un écho américain de même storyline pose le tag américain", async () => {
    const top = await unes([...QC, US_MEME_STORYLINE]);
    expect(top.get("charlie")?.resonanceUs).not.toBeNull();
    expect(top.get("charlie")?.resonanceCan).toBeNull();
  });

  it("un écho américain au titre proche est reconnu même sans storyline commune", async () => {
    const top = await unes([...QC, US_TITRE_PROCHE]);
    expect(top.get("charlie")?.resonanceUs).not.toBeNull();
  });

  it("les deux tags peuvent coexister sur une même Une", async () => {
    const canCharlie = ev({
      country_id: "CAN", target_region: "CAN", event_id: "can-charlie", storyline_id: "charlie",
      title: "Accord de désarmement annoncé par Trump", score_qc: 0, score_roc: 20,
      score_saillance: 20, media_ids_qc: "[]", media_ids_roc: '["CBC"]',
    });
    const top = await unes([...QC, canCharlie, US_MEME_STORYLINE]);
    expect(top.get("charlie")?.resonanceCan).not.toBeNull();
    expect(top.get("charlie")?.resonanceUs).not.toBeNull();
  });

  it("le tag canadien porte la part d'attention du ROC et ses médias, avec leurs liens", async () => {
    const top = await unes([...QC, CAN]);
    const echo = top.get("bravo")!.resonanceCan!;
    // « bravo » est la seule histoire couverte au Canada anglais du jeu de
    // données : elle capte donc 100 % de l'attention canadienne.
    expect(echo.share).toBe(100);
    // Ordre du roster (CBC avant GAM), noms lisibles, liens présents.
    expect(echo.media.map((m) => m.name)).toEqual(["CBC", "The Globe and Mail"]);
    expect(echo.media.every((m) => typeof m.url === "string")).toBe(true);
  });

  it("le tag américain ne liste que des médias américains, jamais les médias d'ici", async () => {
    // Une ligne américaine agrège les reprises des deux pays : ici CNN (US) et
    // Radio-Canada (QC). Seul CNN doit apparaître — d'où le filtre par
    // complément du roster canadien plutôt qu'une liste blanche de sigles US.
    const usAvecReprise = ev({
      country_id: "USA", target_region: "US", event_id: "us-mixte", storyline_id: "charlie",
      title: "Accord de désarmement annoncé par Trump", score_qc: null, score_roc: null,
      score_us: 90, score_saillance: 90, media_ids_qc: "[]",
      articles: '[{"media_id":"CNN","url":"https://cnn/a"},{"media_id":"RCI","url":"https://rci/a"}]',
    });
    const top = await unes([...QC, usAvecReprise]);
    const echo = top.get("charlie")!.resonanceUs!;
    expect(echo.media).toEqual([{ name: "CNN", url: "https://cnn/a" }]);
    expect(echo.share).toBe(100);
  });

  // LE garde-fou : ajouter des lignes américaines ne doit rien changer d'autre
  // que les tags. Sans lui, une future refonte pourrait rebrancher les USA dans
  // le pipeline sans que rien ne proteste — et l'indice de convergence sauterait
  // de ~31 à ~41 en silence (#237).
  it("les lignes américaines n'entrent ni dans la saillance, ni dans la convergence, ni dans la sélection", async () => {
    readFileMock.mockResolvedValue(JSON.stringify([...QC, CAN]));
    vi.resetModules();
    const sans = (await (await import("@/lib/data/headlineEvents")).loadHeadlineEvents())!;

    readFileMock.mockResolvedValue(JSON.stringify([...QC, CAN, US_MEME_STORYLINE, US_TITRE_PROCHE]));
    vi.resetModules();
    const avec = (await (await import("@/lib/data/headlineEvents")).loadHeadlineEvents())!;

    expect(avec.top3.map((u) => u.storylineId)).toEqual(sans.top3.map((u) => u.storylineId));
    expect(avec.top3.map((u) => u.scoreQcSum24h)).toEqual(sans.top3.map((u) => u.scoreQcSum24h));
    expect(avec.top3.map((u) => u.saillanceRank)).toEqual(sans.top3.map((u) => u.saillanceRank));
    expect(avec.solitudes.convPct).toBe(sans.solitudes.convPct);
    expect(typeof avec.solitudes.convPct).toBe("number"); // sinon l'égalité ci-dessus ne prouve rien
    // …et la seule différence attendue est bien le tag américain.
    expect(sans.top3.find((u) => u.storylineId === "charlie")?.resonanceUs).toBeNull();
    expect(avec.top3.find((u) => u.storylineId === "charlie")?.resonanceUs).not.toBeNull();
  });
});
