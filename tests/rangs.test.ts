import { describe, expect, it } from "vitest";

import { cheminDeRang, depuisLOrigine, hauteurDuRang, rangsParInstant } from "@/lib/rangs";

/** Les rangs d'une série, sans les abscisses — plus lisible dans les tests. */
const suite = (m: Map<string, [number, number][]>, cle: string) =>
  (m.get(cle) ?? []).map(([, r]) => r);

describe("rangsParInstant", () => {
  // Rappel : `y` est l'ordonnée SVG, donc INVERSE de la durée. Le plus petit y
  // est le parti qui a le plus de minutes, et c'est lui le premier.
  it("classe du plus grand au plus petit, à chaque instant", () => {
    const r = rangsParInstant([
      { cle: "plq", points: "0,20 50,5" },
      { cle: "caq", points: "0,10 50,25" },
      { cle: "pq", points: "0,30 50,15" },
    ]);
    // Au départ : caq (10) devant plq (20) devant pq (30).
    expect([suite(r, "caq")[0], suite(r, "plq")[0], suite(r, "pq")[0]]).toEqual([1, 2, 3]);
    // À l'arrivée : plq (5) devant pq (15) devant caq (25) — deux doublements.
    expect([suite(r, "plq")[1], suite(r, "pq")[1], suite(r, "caq")[1]]).toEqual([1, 2, 3]);
  });

  it("rend une PERMUTATION à chaque instant, jamais deux séries au même rang", () => {
    const cles = ["plq", "caq", "qs", "pq", "pcq"];
    const r = rangsParInstant(
      cles.map((cle, i) => ({ cle, points: `0,${i * 2} 50,${10 - i * 2} 100,${i}` })),
    );
    for (let instant = 0; instant < 3; instant++) {
      const rangs = cles.map((c) => suite(r, c)[instant]);
      expect([...rangs].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("départage les EX ÆQUO par la clé, de façon stable", () => {
    // Le cas ordinaire du premier bloc : tout le monde à zéro minute, donc
    // toutes les séries sur la même ordonnée. Sans départage, l'ordre sauterait
    // d'un rendu à l'autre et les lignes se croiseraient pour rien.
    const entree = [
      { cle: "qs", points: "0,30" },
      { cle: "caq", points: "0,30" },
      { cle: "plq", points: "0,30" },
    ];
    const a = rangsParInstant(entree);
    const b = rangsParInstant([...entree].reverse());
    expect(suite(a, "caq")).toEqual([1]);
    expect(suite(a, "plq")).toEqual([2]);
    expect(suite(a, "qs")).toEqual([3]);
    // Le même classement, quel que soit l'ordre d'entrée.
    expect(suite(b, "caq")).toEqual(suite(a, "caq"));
    expect(suite(b, "qs")).toEqual(suite(a, "qs"));
  });

  it("prend l'UNION des abscisses : une série incomplète ne décide pas de l'axe", () => {
    const r = rangsParInstant([
      { cle: "a", points: "0,10 50,10 100,10" },
      { cle: "b", points: "0,20" },
    ]);
    expect(suite(r, "a")).toHaveLength(3);
    // `b` n'a qu'un point, et il n'ampute pas la série complète.
    expect(suite(r, "b")).toHaveLength(1);
  });

  it("les cas dégénérés ne lèvent pas", () => {
    expect(rangsParInstant([]).size).toBe(0);
    expect(suite(rangsParInstant([{ cle: "a", points: "" }]), "a")).toEqual([]);
  });
});

describe("hauteurDuRang", () => {
  it("centre chaque rang dans sa bande, sans coller aux bords", () => {
    // Cinq rangs dans 100 : les centres tombent à 10, 30, 50, 70, 90.
    expect([1, 2, 3, 4, 5].map((r) => hauteurDuRang(r, 5, 100))).toEqual([10, 30, 50, 70, 90]);
  });
});

describe("cheminDeRang", () => {
  it("un palier reste PLAT, sans pente molle", () => {
    const d = cheminDeRang([
      [0, 10],
      [50, 10],
    ]);
    // Les deux points de contrôle partagent l'ordonnée du palier.
    expect(d).toBe("M 0 10 C 25 10 25 10 50 10");
  });

  it("un changement de rang bascule au MILIEU de l'intervalle", () => {
    const d = cheminDeRang([
      [0, 10],
      [50, 30],
    ]);
    expect(d).toBe("M 0 10 C 25 10 25 30 50 30");
  });

  it("n'écrit JAMAIS une ordonnée qui n'est pas un rang occupé", () => {
    // Les points de contrôle n'ont que deux ordonnées possibles, celles des
    // deux extrémités : la ligne ne peut pas traverser un rang de passage.
    const rangs = [10, 30, 50];
    const d = cheminDeRang([
      [0, 30],
      [50, 10],
      [100, 50],
    ]);
    const ys = d
      .split(/[A-Z]/)
      .flatMap((bloc) => bloc.trim().split(/\s+/).filter(Boolean))
      .map(Number)
      .filter((v, i) => Number.isFinite(v) && i % 2 === 1);
    for (const y of ys) expect(rangs).toContain(y);
  });

  it("les cas dégénérés ne lèvent pas", () => {
    expect(cheminDeRang([])).toBe("");
    expect(cheminDeRang([[3, 7]])).toBe("M 3 7");
  });
});

describe("depuisLOrigine", () => {
  it("prolonge en arrière le PREMIER rang trouvé, à plat", () => {
    // À 16h, les seuls relevés du jour sont ceux de 12h et 16h : sans ce palier,
    // les deux premiers tiers du cadre restent vides.
    expect(depuisLOrigine([[54.6, 3], [72.8, 1]])).toEqual([[0, 3], [54.6, 3], [72.8, 1]]);
  });

  it("ne touche à rien quand la ligne part déjà de l'origine", () => {
    const pts: [number, number][] = [[0, 2], [50, 1]];
    expect(depuisLOrigine(pts)).toEqual(pts);
  });

  it("n'invente aucun rang : le palier reprend celui du premier relevé", () => {
    const [premier] = depuisLOrigine([[30, 4], [60, 2]]);
    expect(premier).toEqual([0, 4]);
  });

  it("les cas dégénérés ne lèvent pas", () => {
    expect(depuisLOrigine([])).toEqual([]);
  });
});
