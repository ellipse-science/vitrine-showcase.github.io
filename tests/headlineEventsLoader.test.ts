import { describe, it, expect, vi } from "vitest";

// Le mot-jour d'un point de trajectoire (« hier 20h ») se décide au CHARGEUR :
// c'est lui qui choisit par rapport à quel jour se lit « aujourd'hui ». Le
// défaut corrigé ici ne vivait pas dans buildSalienceTrend — la fonction faisait
// bien son travail — mais dans l'argument qu'on lui passait : la date de la
// storyline au lieu de celle de l'édition. Il faut donc traverser le chargeur
// pour l'attraper, d'où le fichier JSON simulé.
const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({ default: { readFile: (...a: unknown[]) => readFileMock(...a) } }));

// Édition du 27 juillet 2026 à 8h. Deux Unes qui partagent exactement les mêmes blocs :
//   · « alpha » est encore à la Une au dernier bloc ;
//   · « bravo » a disparu du radar après le bloc publié à 4h — c'est elle qui
//     traînait un repère de jour en retard et nommait « aujourd'hui » des blocs
//     de la veille (jusqu'à annoncer un « Sommet à 20h » en pleine après-midi).
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
    media_ids: '["LED","LAP"]', media_ids_qc: '["LED","LAP"]',
    articles: '[{"media_id":"LED","url":"https://led/a"},{"media_id":"LAP","url":"https://lap/a"}]',
    interval_convergence_score: null, storyline_id: "s",
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

// Intervalles en UTC (comme dans le vrai fichier). Heure PUBLIQUE d'un bloc =
// fin + 1 h en heure de Montréal, soit début UTC + 5 h ramené à Montréal.
const BLOCS: [string, string, string][] = [
  ["2026-07-26", "11-15", "2026-07-26"],   // → publié 12h, hier
  ["2026-07-26", "15-19", "2026-07-26"],   // → publié 16h, hier
  ["2026-07-26", "19-23", "2026-07-26"],   // → publié 20h, hier
  ["2026-07-26", "23-03", "2026-07-26"],   // → publié minuit, rattaché au jour qui finit
  ["2026-07-27", "03-07", "2026-07-27"],   // → publié 4h, aujourd'hui (le bloc DÉMARRE hier soir)
  ["2026-07-27", "07-11", "2026-07-27"],   // → publié 8h — édition affichée
];

function dataset() {
  const rows: unknown[] = [];
  BLOCS.forEach(([date, interval, dateMtl], i) => {
    rows.push(ev({
      event_id: `alpha-${i}`, storyline_id: "alpha", title: "Alpha reste à la Une",
      score_qc: 30, score_saillance: 30,
      date_utc: date, time_interval_utc: interval, date_montreal_tz: dateMtl,
      time_interval_montreal_tz: interval,
    }));
    // « bravo » s'arrête après le 4e bloc (publié à 4h) : plus aucune ligne
    // ensuite, donc sa dernière date connue est celle de la VEILLE.
    if (i <= 3) rows.push(ev({
      event_id: `bravo-${i}`, storyline_id: "bravo", title: "Bravo est retombée du radar",
      score_qc: 40, score_saillance: 40,
      date_utc: date, time_interval_utc: interval, date_montreal_tz: dateMtl,
      time_interval_montreal_tz: interval,
    }));
  });
  return rows;
}

describe("loadHeadlineEvents — le mot-jour appartient à l'édition, pas à l'histoire", () => {
  it("deux Unes de la même édition nomment le même bloc de la même façon", async () => {
    readFileMock.mockResolvedValue(JSON.stringify(dataset()));
    vi.resetModules();
    const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
    const data = (await loadHeadlineEvents())!;
    expect(data).not.toBeNull();

    const trajectoires = data.top3
      .filter((u) => u.salienceTrend)
      .map((u) => ({ titre: u.title, labels: u.salienceTrend!.points.map((p) => p.timeLabel) }));
    // Les deux Unes doivent être là, sinon le test ne prouve rien.
    expect(trajectoires.length).toBe(2);
    expect(trajectoires[0].labels).toEqual(trajectoires[1].labels);
  });

  it("aucune Une n'annonce une heure encore à venir dans la journée", async () => {
    readFileMock.mockResolvedValue(JSON.stringify(dataset()));
    vi.resetModules();
    const { loadHeadlineEvents } = await import("@/lib/data/headlineEvents");
    const data = (await loadHeadlineEvents())!;

    // Édition de 8h : « aujourd'hui 12h/16h/20h » n'existent pas encore. C'est
    // exactement ce qu'affichait la 3e Une de la capture d'Adrien (« Sommet à
    // 20h » à 16h), phrase de trajectoire comprise.
    const futures = /aujourd’hui (12h|16h|20h)/;
    for (const une of data.top3) {
      const t = une.salienceTrend;
      if (!t) continue;
      for (const p of t.points) expect(p.timeLabel).not.toMatch(futures);
      // Une heure future n'est interdite que SANS mot-jour : « Sommet hier à
      // 12h » est juste, « Sommet à 12h » à l'édition de 8h ne l'est pas.
      expect(t.capLabel).not.toMatch(/(?<!hier )(?:à|depuis) (12h|16h|20h)\b/);
    }

    // Et la lecture positive : les blocs de la veille sont bien nommés « hier ».
    const labels = data.top3[0].salienceTrend!.points.map((p) => p.timeLabel);
    expect(labels).toEqual([
      "hier 12h", "hier 16h", "hier 20h", "hier minuit",
      "aujourd’hui 4h", "aujourd’hui 8h",
    ]);
  });
});
