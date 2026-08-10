import { describe, it, expect, vi, beforeEach } from "vitest";

// Navigation dans les éditions passées (#434). Trois propriétés sont
// verrouillées ici, et chacune correspond à un défaut rencontré en chemin :
//   1. une édition proposée a toujours sa fenêtre 24 h complète ;
//   2. l'édition de minuit se range dans la rangée d'icônes du jour qui
//      COMMENCE — sans quoi la case « 00 h » du bandeau reste vide à vie ;
//   3. rejouer une édition rend bien le module de CETTE édition-là.
const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({ default: { readFile: (...a: unknown[]) => readFileMock(...a) } }));

const ev = (over: Record<string, unknown>) => {
  const socle = {
    country_id: "QC", title: "T", score_qc: 0, score_saillance: 0,
    media_ids: '["LED","LAP"]', media_ids_qc: '["LED","LAP"]',
    articles: '[{"media_id":"LED","url":"https://led/a"},{"media_id":"LAP","url":"https://lap/a"}]',
    interval_convergence_score: null, storyline_id: "s",
  };
  // Miroir spec v1 : les fixtures rendent la même valeur avant et après le
  // cutover, pour que ces tests restent valables des deux côtés de la bascule.
  const base = { ...socle, ...over } as Record<string, unknown>;
  return {
    ...base,
    salience_index_qc: base.salience_index_qc ?? Number(base.score_qc ?? 0) / 100,
    salience_index_roc: base.salience_index_roc ?? Number(base.score_roc ?? 0) / 100,
  };
};

// 12 blocs consécutifs — deux jours pleins, avec les DEUX fuseaux comme dans le
// vrai fichier : [date_utc, intervalle_utc, date_montreal, intervalle_montreal].
//
// Poser `time_interval_montreal_tz` égal à l'intervalle UTC (raccourci commode)
// mettrait les deux chemins de calcul de l'heure publique en désaccord de 4 h
// sans qu'aucun test ne le voie : `listEditions` la dérive de la clé UTC via
// blockAnchor, le pied de module de l'intervalle MONTRÉAL via
// publicationHourFromInterval. Une fixture fidèle fait donc de ce fichier un
// recoupement des deux — ce qui a immédiatement servi.
const BLOCS: [string, string, string, string][] = [
  ["2026-07-25", "03-07", "2026-07-24", "23-03"],
  ["2026-07-25", "07-11", "2026-07-25", "03-07"],
  ["2026-07-25", "11-15", "2026-07-25", "07-11"],
  ["2026-07-25", "15-19", "2026-07-25", "11-15"],
  ["2026-07-25", "19-23", "2026-07-25", "15-19"],
  ["2026-07-25", "23-03", "2026-07-25", "19-23"],
  ["2026-07-26", "03-07", "2026-07-25", "23-03"],
  ["2026-07-26", "07-11", "2026-07-26", "03-07"],
  ["2026-07-26", "11-15", "2026-07-26", "07-11"],
  ["2026-07-26", "15-19", "2026-07-26", "11-15"],
  ["2026-07-26", "19-23", "2026-07-26", "15-19"],
  ["2026-07-26", "23-03", "2026-07-26", "19-23"],
];

// Une histoire dominante DIFFÉRENTE par bloc : si le rejeu ne coupait pas le
// snapshot, tous les blocs rendraient la même Une n°1 et le test passerait
// pour de mauvaises raisons.
function dataset() {
  return BLOCS.flatMap(([date, interval, dateMtl, intervalMtl], i) => [
    ev({
      event_id: `star-${i}`, storyline_id: `star-${i}`, title: `Vedette du bloc ${i}`,
      score_qc: 100, score_saillance: 100,
      date_utc: date, time_interval_utc: interval,
      date_montreal_tz: dateMtl, time_interval_montreal_tz: intervalMtl,
    }),
    ev({
      event_id: `fond-${i}`, storyline_id: "fond", title: "Histoire de fond",
      score_qc: 5, score_saillance: 5,
      date_utc: date, time_interval_utc: interval,
      date_montreal_tz: dateMtl, time_interval_montreal_tz: intervalMtl,
    }),
  ]);
}

async function freshModule() {
  // `loadHeadlineEvents` et `listEditions` sont mémoïsés par cache() : sans
  // module neuf, le premier appel d'un test servirait tous les suivants.
  vi.resetModules();
  return import("@/lib/data/headlineEvents");
}

beforeEach(() => {
  readFileMock.mockReset();
  readFileMock.mockImplementation((p: string) =>
    String(p).endsWith("headline-events.json")
      ? Promise.resolve(JSON.stringify(dataset()))
      : Promise.reject(new Error("absent")),
  );
});

describe("listEditions", () => {
  it("écarte les éditions dont la fenêtre 24 h serait tronquée", async () => {
    const { listEditions } = await freshModule();
    const eds = await listEditions();

    // 12 blocs dans le snapshot, moins les 5 plus anciens : le module y calcule
    // des sommes sur 6 blocs, et une somme sur 2 blocs n'a jamais été à l'écran.
    expect(eds).toHaveLength(BLOCS.length - 5);
    expect(eds[0].key).toBe("2026-07-26T23");
    expect(eds[eds.length - 1].key).toBe("2026-07-25T23");
  });

  it("va de la plus récente à la plus ancienne", async () => {
    const { listEditions } = await freshModule();
    const keys = (await listEditions()).map((e) => e.key);
    expect(keys).toEqual([...keys].sort().reverse());
  });

  it("nomme chaque édition par son HEURE DE PUBLICATION (fin du bloc + 1 h)", async () => {
    const { listEditions } = await freshModule();
    const eds = await listEditions();
    const bloc = (k: string) => eds.find((e) => e.key === k)!;

    // Les clés de bloc sont en UTC. Bloc 07-11 UTC → publié 12 h UTC → 8 h à
    // Montréal → « du matin ». C'est la même arithmétique que la réforme #195
    // (fin + 1 h), lue dans le bon fuseau : le décalage se paie une fois, ici.
    expect(bloc("2026-07-26T07").pubHour).toBe(8);
    expect(bloc("2026-07-26T07").label).toBe("Édition du matin");
    expect(bloc("2026-07-26T07").slot).toBe(2);

    // Bloc 23-03 → publié à minuit → 24 h, l'icône « 00 h ».
    expect(bloc("2026-07-26T23").pubHour).toBe(24);
    expect(bloc("2026-07-26T23").label).toBe("Édition de minuit");
    expect(bloc("2026-07-26T23").slot).toBe(0);
  });

  it("range l'édition de minuit dans la rangée du jour qui COMMENCE", async () => {
    const { listEditions } = await freshModule();
    const minuit = (await listEditions()).find((e) => e.key === "2026-07-26T23")!;

    // Les deux dates DIVERGENT, et c'est voulu : l'ancrage éditorial rattache
    // « cette nuit » au jour qui vient de finir (le 26), tandis que le bandeau
    // montre le 00 h que le lecteur vient de vivre, au matin du 27. Les
    // confondre laissait la case « 00 h » vide tous les jours de l'année.
    expect(minuit.dateIso).toBe("2026-07-26");
    expect(minuit.navDateIso).toBe("2026-07-27");
  });

  it("rend une liste vide plutôt que d'échouer si le snapshot manque", async () => {
    readFileMock.mockImplementation(() => Promise.reject(new Error("absent")));
    const { listEditions } = await freshModule();
    expect(await listEditions()).toEqual([]);
  });
});

describe("loadHeadlineEvents(editionKey)", () => {
  it("rejoue le module tel qu'il était à l'édition demandée", async () => {
    const { loadHeadlineEvents } = await freshModule();

    const courante = await loadHeadlineEvents();
    const passee = await loadHeadlineEvents("2026-07-26T07");

    expect(courante!.top3[0].title).toBe("Vedette du bloc 11");
    expect(passee!.top3[0].title).toBe("Vedette du bloc 7");
  });

  it("ne laisse filtrer aucun bloc POSTÉRIEUR à l'édition demandée", async () => {
    const { loadHeadlineEvents } = await freshModule();
    const passee = await loadHeadlineEvents("2026-07-26T07");

    // Une édition passée ne doit jamais connaître son avenir.
    const titres = passee!.top3.map((s) => s.title);
    for (const futur of [8, 9, 10, 11]) {
      expect(titres).not.toContain(`Vedette du bloc ${futur}`);
    }

    // Le pied de module date l'édition REJOUÉE, pas le snapshot : c'est le
    // témoin le plus visible d'une fuite de blocs postérieurs.
    expect(passee!.lastUpdated).toContain("26 juillet 2026, 8h");

    // La trajectoire s'arrête à l'édition demandée — son dernier point est le
    // bloc courant de CETTE édition, et la fenêtre ne dépasse pas 6 blocs.
    for (const s of passee!.top3) {
      const pts = s.salienceTrend?.points ?? [];
      if (pts.length === 0) continue;
      expect(pts.length).toBeLessThanOrEqual(6);
      expect(pts[pts.length - 1].isNow).toBe(true);
    }
  });

  it("sans argument, se comporte exactement comme avant", async () => {
    const { listEditions, loadHeadlineEvents } = await freshModule();
    const [plusRecente] = await listEditions();

    const sansArg = await loadHeadlineEvents();
    const avecCle = await loadHeadlineEvents(plusRecente.key);
    expect(sansArg!.top3.map((s) => s.title)).toEqual(avecCle!.top3.map((s) => s.title));
    expect(sansArg!.lastUpdated).toBe(avecCle!.lastUpdated);
  });
});
