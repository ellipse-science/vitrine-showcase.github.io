import { describe, it, expect, vi, beforeEach } from "vitest";

// Module expérimental « Les candidats sur les réseaux ». Le chargeur assemble
// les quatre tables du raffineur agora-social ; ce qui doit être prouvé ici,
// c'est ce que le module AFFIRME et que la donnée seule ne garantit pas :
//
//   - tant que le raffineur n'a rien publié, le module est absent (null), sans
//     casser le build ;
//   - la présence rapporte les candidatures officielles, pas les comptes ;
//   - un compte de parti porte le nom officiel du parti ;
//   - les séries partent du déclenchement et s'arrêtent au dernier jour
//     COMPLET : le jour du dernier relevé n'est collecté qu'en partie, et
//     l'afficher dessinerait une chute qui n'existe pas ;
//   - le palmarès ne garde que les sept derniers jours de relevé.
//
// Lignes RÉELLES de l'essai à blanc du raffineur (29 septembre 2026).
const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  default: { readFile: (...a: unknown[]) => readFileMock(...a) },
}));

const comptes = [
  { compte: "instagram:partiquebecois", plateforme: "instagram", pseudo: "partiquebecois", candidat: "Parti québécois", parti: "PQ", circonscription: null, type: "parti", abonnes: 365846, releve: "2026-09-28 10:00", calcule_le: "2026-09-29 13:54", candidatures_parti: 127 },
  { compte: "facebook:eduhaime", plateforme: "facebook", pseudo: "eduhaime", candidat: "Éric Duhaime", parti: "PCQ", circonscription: "Bellechasse", type: "candidat", abonnes: 227675, releve: "2026-09-29 12:40", calcule_le: "2026-09-29 13:54", candidatures_parti: 127 },
  { compte: "tiktok:@farnellmorisset", plateforme: "tiktok", pseudo: "@farnellmorisset", candidat: "Farnell Morisset", parti: "PLQ", circonscription: "Taschereau", type: "candidat", abonnes: 119900, releve: "2026-09-28 20:00", calcule_le: "2026-09-29 13:54", candidatures_parti: 127 },
];
const jours = [
  { jour: "2026-09-27", parti: "CAQ", plateforme: "facebook", type: "candidat", publications: 170, jaime: 15541, commentaires: 5564 },
  { jour: "2026-09-27", parti: "CAQ", plateforme: "instagram", type: "candidat", publications: 55, jaime: 1249, commentaires: 45 },
  { jour: "2026-09-27", parti: "QS", plateforme: "facebook", type: "candidat", publications: 132, jaime: 8281, commentaires: 2256 },
  { jour: "2026-09-27", parti: "QS", plateforme: "instagram", type: "candidat", publications: 55, jaime: 10975, commentaires: 524 },
  { jour: "2026-09-29", parti: "CAQ", plateforme: "facebook", type: "candidat", publications: 8, jaime: 23, commentaires: 0 },
  { jour: "2026-09-29", parti: "QS", plateforme: "facebook", type: "candidat", publications: 30, jaime: 793, commentaires: 76 },
];
const palmares = [
  { jour: "2026-09-29", plateforme: "facebook", parti: "PQ", type: "candidat", candidat: "Meixia Maltais", pseudo: "meixiamaltaispq", url: "https://www.facebook.com/meixiamaltaispq/posts/pfbid0JY3ZCT68Zfz7AjCNitTvBgA7WSHHV6njVXsVh9fbsbdnHJkV4H15d9Qnm5EV4ezNl", texte: "Quel chemin parcouru depuis le début de cette campagne!", jaime: 581, commentaires: 144 },
  { jour: "2026-09-29", plateforme: "facebook", parti: "PQ", type: "parti", candidat: "Parti québécois", pseudo: "lepartiquebecois", url: "https://www.facebook.com/lepartiquebecois/posts/pfbid02TLAUotZFYVTaf7YffcrxBiStuk4kPXo9xWsgJ6fZ12nArEtij9f9EpdwpfkSWXMal", texte: "Une visite dans Orford qui termine bien le vote par anticipation", jaime: 450, commentaires: 21 },
  { jour: "2026-09-20", plateforme: "facebook", parti: "PQ", type: "parti", candidat: "Parti québécois", pseudo: "lepartiquebecois", url: "https://www.facebook.com/reel/1414952487442509/", texte: "Les joies du terrain", jaime: 5864, commentaires: 554 },
];

function servir(tables: Partial<Record<"comptes" | "publications_jour" | "palmares", unknown[]>>) {
  readFileMock.mockImplementation((p: string) => {
    const nom = (["comptes", "publications_jour", "palmares"] as const).find((n) =>
      String(p).endsWith(`agora_social_${n}.json`),
    );
    const rows = nom ? tables[nom] : undefined;
    if (!rows) {
      const e = Object.assign(new Error(`ENOENT ${p}`), { code: "ENOENT" });
      return Promise.reject(e);
    }
    return Promise.resolve(JSON.stringify(rows));
  });
}

beforeEach(() => {
  readFileMock.mockReset();
  vi.resetModules();
});

const charger = async () => (await import("@/lib/data/social")).loadSocial();

describe("chargeur du module « Les candidats sur les réseaux »", () => {
  it("rend null tant que le raffineur n'a rien publié (fichiers absents)", async () => {
    servir({});
    expect(await charger()).toBeNull();
  });

  it("rend null sur des tables vides", async () => {
    servir({ comptes: [], publications_jour: [], palmares: [] });
    expect(await charger()).toBeNull();
  });

  it("la présence compte les circonscriptions des comptes de candidat, sur les candidatures du parti", async () => {
    const plus = [
      ...comptes,
      // un second compte Facebook dans la même circonscription ne compte qu'une fois
      { ...comptes[1], compte: "facebook:duhaime2", pseudo: "duhaime2", abonnes: 10 },
      // un compte de parti ne compte pas
      { ...comptes[0], compte: "facebook:pcq", plateforme: "facebook", parti: "PCQ", type: "parti", circonscription: null },
    ];
    servir({ comptes: plus, publications_jour: jours, palmares });
    const d = (await charger())!;
    expect(d.presence.pcq.facebook).toEqual({ avecCompte: 1, candidats: 127, part: 1 / 127 });
    expect(d.presence.plq.tiktok.avecCompte).toBe(1);
    // Aucun compte sur la plateforme : 0 %, pas une erreur.
    expect(d.presence.pcq.instagram).toEqual({ avecCompte: 0, candidats: 127, part: 0 });
    // Un parti sans aucun compte n'a pas de dénominateur : 0 %.
    expect(d.presence.caq.instagram).toEqual({ avecCompte: 0, candidats: 0, part: 0 });
  });

  it("l'audience garde tous les comptes, du plus suivi au moins suivi, parti nommé en toutes lettres", async () => {
    servir({ comptes, publications_jour: jours, palmares });
    const d = (await charger())!;
    expect(d.audience.map((a) => a.abonnes)).toEqual([365846, 227675, 119900]);
    expect(d.audience[0]).toMatchObject({ nom: "Parti québécois", type: "parti", party: "pq" });
  });

  it("l'axe part du 1er avril et s'arrête au dernier jour complet ; le cube est additif", async () => {
    servir({ comptes, publications_jour: jours, palmares });
    const d = (await charger())!;
    expect(d.jours[0]).toBe("2026-04-01");
    expect(d.jours.at(-1)).toBe("2026-09-28"); // le 29, jour du relevé, est partiel
    expect(d.jours[d.campagne]).toBe("2026-08-27"); // déclenchement du site
    // Les lignes du 29 (jour partiel) sont hors de l'axe.
    expect(d.cube).toHaveLength(4);
    const i = d.jours.indexOf("2026-09-27");
    expect(d.cube.every((r) => r[0] === i)).toBe(true);
  });

  it("le palmarès garde le top quotidien de l'axe, texte tronqué", async () => {
    const long = { ...palmares[2], texte: "x".repeat(400) };
    servir({ comptes, publications_jour: jours, palmares: [...palmares, long] });
    const d = (await charger())!;
    // Les lignes du 29 (hors axe) sortent ; celles du 20 restent.
    expect(d.palmares.map((p) => p.jour)).toEqual(["2026-09-20", "2026-09-20"]);
    expect(d.palmares[1].texte.length).toBeLessThanOrEqual(120);
  });

  it("un palmarès absent ne masque pas le module", async () => {
    servir({ comptes, publications_jour: jours });
    const d = await charger();
    expect(d).not.toBeNull();
    expect(d!.palmares).toEqual([]);
  });
});

describe("calculs de période et de filtres", () => {
  const base = async () => {
    servir({ comptes, publications_jour: jours, palmares });
    return (await charger())!;
  };
  const calc = () => import("@/lib/data/social-calc");
  const tout = (d: Awaited<ReturnType<typeof base>>, d0: number, d1: number) => ({
    d0,
    d1,
    plateformes: ["facebook", "instagram", "tiktok"] as ("facebook" | "instagram" | "tiktok")[],
    partis: [...d.partis],
    types: ["candidat", "parti"] as ("candidat" | "parti")[],
  });

  it("les totaux somment la période et respectent les filtres", async () => {
    const d = await base();
    const c = await calc();
    const i = d.jours.indexOf("2026-09-27");
    expect(c.totaux(c.lignes(d, tout(d, i, i)))).toEqual({ publications: 412, jaime: 36046, commentaires: 8389 });
    const fb = { ...tout(d, i, i), plateformes: ["facebook" as const] };
    expect(c.totaux(c.lignes(d, fb)).publications).toBe(302);
    // Hors période : rien.
    expect(c.totaux(c.lignes(d, tout(d, 0, i - 1))).publications).toBe(0);
  });

  it("j'aime par publication = somme des j'aime / publications (pas une médiane)", async () => {
    const c = await calc();
    expect(c.valeur({ publications: 4, jaime: 10, commentaires: 0 }, "parPublication")).toBe(2.5);
    expect(c.valeur({ publications: 0, jaime: 0, commentaires: 0 }, "parPublication")).toBe(0);
  });

  it("par jour jusqu'à 45 jours, par semaine au-delà", async () => {
    const d = await base();
    const c = await calc();
    expect(c.pasDeTemps(tout(d, 0, 44)).hebdo).toBe(false);
    const s = c.pasDeTemps(tout(d, 0, 45));
    expect(s.hebdo).toBe(true);
    expect(s.debuts).toEqual([0, 7, 14, 21, 28, 35, 42]);
  });

  it("découpe par parti : un panneau par parti, les plateformes en éléments", async () => {
    const d = await base();
    const c = await calc();
    const i = d.jours.indexOf("2026-09-27");
    const f = tout(d, i, i);
    const blocs = c.parElement(d, c.lignes(d, f), c.panneaux("parti", f), "publications");
    const qs = blocs.find((b) => b.panneau.party === "qs")!;
    expect(qs.valeurs.map((v) => [v.element.plateforme, v.valeur])).toEqual([
      ["facebook", 132],
      ["instagram", 55],
      ["tiktok", 0],
    ]);
  });

  it("le palmarès suit la période et signale quand il est approché", async () => {
    const d = await base();
    const c = await calc();
    const i = d.jours.indexOf("2026-09-20");
    expect(c.palmares(d, tout(d, i, i)).map((p) => p.jaime)).toEqual([5864]);
    expect(c.palmares(d, tout(d, i + 1, d.jours.length - 1))).toEqual([]);
    expect(c.palmaresApproche(d, tout(d, d.jours.length - 7, d.jours.length - 1))).toBe(false);
    expect(c.palmaresApproche(d, tout(d, 0, d.jours.length - 1))).toBe(true);
    expect(c.palmaresApproche(d, { ...tout(d, i, i), partis: ["qs"] })).toBe(true);
  });

  it("treemap : l'aire de chaque tuile est proportionnelle à sa valeur, les tuiles pavent le cadre", async () => {
    const c = await calc();
    const tuiles = c.treemap(
      [
        { item: "a", valeur: 50 },
        { item: "b", valeur: 30 },
        { item: "c", valeur: 15 },
        { item: "d", valeur: 5 },
        { item: "zero", valeur: 0 },
      ],
      2,
    );
    expect(tuiles.map((t) => t.item)).toEqual(["a", "b", "c", "d"]); // une valeur nulle n'a pas de tuile
    const aire = (t: (typeof tuiles)[number]) => (t.x1 - t.x0) * (t.y1 - t.y0);
    for (const t of tuiles) expect(aire(t)).toBeCloseTo(t.valeur / 100, 10);
    expect(tuiles.reduce((s, t) => s + aire(t), 0)).toBeCloseTo(1, 10);
  });

  it("treemap : coupe le long du côté le plus long à l'écran", async () => {
    const c = await calc();
    const [a, b] = c.treemap([{ item: "a", valeur: 1 }, { item: "b", valeur: 1 }], 3);
    expect([a.x0, a.x1, b.x0, b.x1]).toEqual([0, 0.5, 0.5, 1]); // cadre large : côte à côte
    const [h] = c.treemap([{ item: "a", valeur: 1 }, { item: "b", valeur: 1 }], 0.3);
    expect([h.y0, h.y1]).toEqual([0, 0.5]); // cadre haut : l'une sur l'autre
  });
});
