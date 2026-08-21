import { describe, it, expect, vi, beforeEach } from "vitest";

// Mode « promesses de la campagne » du Polimètre+ : les promesses ne viennent
// plus d'une liste fermée de 150, mais des communiqués des partis, repérées au
// fil de l'eau. Ce qui doit être prouvé ici, c'est ce que le module AFFIRME
// visuellement et que la donnée seule ne garantit pas :
//
//   - la pastille porte le PARTI, donc un party_id inconnu ne doit JAMAIS
//     emprunter la couleur d'un autre parti (il vaut mieux pas de pastille) ;
//   - le rang vient du raffineur et n'est pas recalculé ici — deux classements
//     concurrents divergeraient en silence ;
//   - une promesse sans libellé court est ÉCARTÉE plutôt qu'affichée sans titre ;
//   - un seul instantané est lu à la fois, sinon la même promesse serait comptée
//     deux fois dans la liste.
const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  default: { readFile: (...a: unknown[]) => readFileMock(...a) },
}));

function servir(rows: unknown[]) {
  readFileMock.mockImplementation((p: string) =>
    String(p).includes("polimetre_promesses_neuves")
      ? Promise.resolve(JSON.stringify(rows))
      : Promise.reject(new Error(`pas de fixture pour ${p}`)),
  );
}

beforeEach(() => {
  readFileMock.mockReset();
  vi.resetModules();
});

// Verbatims RÉELS, extraits par le prompt des communiqués de 2026 (QS, Plan
// Habitation du 30 mars). Une fixture inventée laisserait passer une erreur de
// forme que la vraie donnée aurait révélée.
const ligne = (o: Partial<Record<string, unknown>> = {}) => ({
  country_id: "QC",
  window_key: "day",
  window_end: "2026-09-03",
  rank_current: 1,
  promesse_id: "pn-aaaaaaaaaaaa",
  party_id: "QS",
  label: "Injecter 7 M$ pour accélérer le traitement des dossiers",
  promesse_text:
    "Injecter 7 millions de dollars supplémentaires pour accélérer le traitement des dossiers;",
  announce_date: "2026-09-03",
  release_url: "https://quebecsolidaire.net/communique/plan-habitation",
  release_title: "Québec solidaire lance un Plan Habitation",
  n_mentions: 3,
  salience_index: 8.4,
  articles: JSON.stringify([
    { media_id: "LED", title: "QS dévoile son plan habitation", url: "https://ledevoir.com/a" },
    { media_id: "LAP", title: "Logement : QS vise le TAL", url: "https://lapresse.ca/b" },
  ]),
  ...o,
});

async function charger(rows: unknown[], asOf?: string) {
  servir(rows);
  const { loadPromessesNeuves } = await import("@/lib/data/promessesNeuves");
  return loadPromessesNeuves(asOf);
}

describe("chargeur des promesses neuves", () => {
  it("rend une promesse complète, verbatim et articles compris", async () => {
    const d = await charger([ligne()]);
    expect(d).not.toBeNull();
    expect(d!.ranges.day).toHaveLength(1);
    const p = d!.ranges.day[0];
    expect(p.title).toBe("Injecter 7 M$ pour accélérer le traitement des dossiers");
    // Le verbatim est la pièce justificative : il doit sortir tel quel.
    expect(p.verbatim).toContain("7 millions de dollars supplémentaires");
    expect(p.parti).toBe("qs");
    expect(p.nMentions).toBe(3);
    // Ordre canonique des médias (Le Devoir avant La Presse ? non : LAP d'abord).
    expect(p.articles.map((a) => a.media)).toEqual(["La Presse", "Le Devoir"]);
  });

  it("sépare les deux fenêtres et n'invente pas de « mois »", async () => {
    const d = await charger([
      ligne({ window_key: "day" }),
      ligne({ window_key: "week", promesse_id: "pn-bbbbbbbbbbbb", rank_current: 1 }),
    ]);
    expect(d!.ranges.day).toHaveLength(1);
    expect(d!.ranges.week).toHaveLength(1);
    expect(Object.keys(d!.ranges).sort()).toEqual(["day", "week"]);
  });

  it("respecte le rang du raffineur au lieu de reclasser par saillance", async () => {
    // rank_current dit 1 pour la promesse la MOINS saillante : le raffineur a
    // tranché (ex æquo départagés par date d'annonce), la Vitrine obéit.
    const d = await charger([
      ligne({ promesse_id: "pn-basse", rank_current: 1, salience_index: 0 }),
      ligne({ promesse_id: "pn-haute", rank_current: 2, salience_index: 99 }),
    ]);
    expect(d!.ranges.day.map((p) => p.promesseId)).toEqual(["pn-basse", "pn-haute"]);
  });

  it("écarte une promesse dont le libellé court a échoué (« NA » littéral)", async () => {
    const d = await charger([
      ligne({ promesse_id: "pn-ok" }),
      ligne({ promesse_id: "pn-sans-titre", label: "NA" }),
      ligne({ promesse_id: "pn-vide", label: "   " }),
    ]);
    expect(d!.ranges.day.map((p) => p.promesseId)).toEqual(["pn-ok"]);
  });

  it("n'emprunte jamais la couleur d'un autre parti pour un sigle inconnu", async () => {
    const d = await charger([ligne({ party_id: "PVQ" })]);
    const p = d!.ranges.day[0];
    expect(p.parti).toBeNull();       // donc aucune classe de couleur côté CSS
    expect(p.partiLabel).toBe("PVQ"); // mais le sigle reste lisible
  });

  it("ne lit qu'un instantané : le plus récent", async () => {
    const d = await charger([
      ligne({ window_end: "2026-09-02", promesse_id: "pn-vieux" }),
      ligne({ window_end: "2026-09-03", promesse_id: "pn-neuf" }),
    ]);
    expect(d!.windowEnd).toBe("2026-09-03");
    expect(d!.ranges.day.map((p) => p.promesseId)).toEqual(["pn-neuf"]);
  });

  it("respecte la coupe d'édition passée (asOfIso)", async () => {
    const d = await charger(
      [
        ligne({ window_end: "2026-09-05", promesse_id: "pn-apres" }),
        ligne({ window_end: "2026-09-01", promesse_id: "pn-avant" }),
      ],
      "2026-09-02",
    );
    expect(d!.windowEnd).toBe("2026-09-01");
    expect(d!.ranges.day.map((p) => p.promesseId)).toEqual(["pn-avant"]);
  });

  it("rend null quand rien n'a été repéré — le cas ATTENDU hors campagne", async () => {
    expect(await charger([])).toBeNull();
  });

  it("rend null quand le raffineur n'a pas encore publié", async () => {
    readFileMock.mockImplementation(() => Promise.reject(new Error("ENOENT")));
    const { loadPromessesNeuves } = await import("@/lib/data/promessesNeuves");
    expect(await loadPromessesNeuves()).toBeNull();
  });

  it("survit à une colonne articles illisible sans perdre la promesse", async () => {
    const d = await charger([ligne({ articles: "{pas du json" })]);
    expect(d!.ranges.day).toHaveLength(1);
    expect(d!.ranges.day[0].articles).toEqual([]);
  });
});
