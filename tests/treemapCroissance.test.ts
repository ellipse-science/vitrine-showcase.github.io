import { describe, expect, it } from "vitest";

import { previousDistinctAggregate } from "@/lib/data/headlineEvents";

// Les valeurs ci-dessous sont celles VUES EN PRODUCTION le 2026-08-26, qui ont
// fait afficher « 0,0 % » sur les douze tuiles du module « De quoi parle-t-on ? ».
// Les tags « 11:37 » et « 07:36 » portent la même période et les mêmes scores :
// seuls les libellés d'`issues_meta`, régénérés par le LLM, différaient.
const row = (
  tag: string,
  dateMtl: string,
  pass: string,
  economy: number,
  intl: number,
  meta = "{}",
) => ({
  tag,
  date_utc: "2026-08-26",
  date_montreal_tz: dateMtl,
  pass,
  issues_meta: meta,
  economy_and_labour: economy,
  international_affairs_and_defense: intl,
});

// Deux lignes par tag, comme dans issues_score_day.json (veille + jour courant).
const publication = (tag: string, economy: number, intl: number, meta = "{}") => [
  row(tag, "2026-08-25", "am", 0.4069, 0.2206),
  row(tag, "2026-08-26", "am", economy, intl, meta),
];

describe("previousDistinctAggregate", () => {
  it("saute la republication qui ne change que les libellés", () => {
    const rows = [
      ...publication("2026-08-26 03:36", 0.3629, 0.1274),
      // 07:36 puis 11:37 : mêmes scores, libellés régénérés.
      ...publication("2026-08-26 07:36", 0.2933, 0.1538, '{"economy_and_labour":{"label":"Le Canada renforce sa stratégie"}}'),
      ...publication("2026-08-26 11:37", 0.2933, 0.1538, '{"economy_and_labour":{"label":"Guerre commerciale impacte l\'économie"}}'),
    ];
    const current = { economy_and_labour: 0.4069 + 0.2933, international_affairs_and_defense: 0.2206 + 0.1538 };

    const { aggregate, found } = previousDistinctAggregate(rows, "2026-08-26 11:37", current);

    expect(found).toBe(true);
    // On remonte jusqu'à 03:36, dont les scores diffèrent réellement.
    expect(aggregate.economy_and_labour).toBeCloseTo(0.4069 + 0.3629, 6);
    expect(aggregate.international_affairs_and_defense).toBeCloseTo(0.2206 + 0.1274, 6);
  });

  it("produit une croissance non nulle là où la comparaison naïve donnait 0", () => {
    const rows = [
      ...publication("2026-08-26 03:36", 0.3629, 0.1274),
      ...publication("2026-08-26 07:36", 0.2933, 0.1538),
      ...publication("2026-08-26 11:37", 0.2933, 0.1538),
    ];
    const score = 0.4069 + 0.2933;
    const current = { economy_and_labour: score, international_affairs_and_defense: 0.2206 + 0.1538 };

    const { aggregate } = previousDistinctAggregate(rows, "2026-08-26 11:37", current);
    const prev = aggregate.economy_and_labour;
    const growth = ((score - prev) / prev) * 100;

    expect(prev).toBeGreaterThan(0);
    expect(Math.abs(growth)).toBeGreaterThan(0.05); // ne s'affiche plus « 0,0 % »
  });

  it("garde le tag immédiatement précédent quand il diffère déjà (cas courant)", () => {
    const rows = [
      ...publication("2026-08-26 03:36", 0.3629, 0.1274),
      ...publication("2026-08-26 07:36", 0.2933, 0.1538),
    ];
    const current = { economy_and_labour: 0.4069 + 0.2933, international_affairs_and_defense: 0.2206 + 0.1538 };

    const { aggregate, found } = previousDistinctAggregate(rows, "2026-08-26 07:36", current);

    expect(found).toBe(true);
    expect(aggregate.economy_and_labour).toBeCloseTo(0.4069 + 0.3629, 6);
  });

  it("ne compare RIEN plutôt que zéro si toutes les publications antérieures sont identiques", () => {
    const rows = [
      ...publication("2026-08-26 07:36", 0.2933, 0.1538),
      ...publication("2026-08-26 11:37", 0.2933, 0.1538),
    ];
    const current = { economy_and_labour: 0.4069 + 0.2933, international_affairs_and_defense: 0.2206 + 0.1538 };

    const { found } = previousDistinctAggregate(rows, "2026-08-26 11:37", current);

    // `found: false` => l'appelant affiche une absence, jamais « 0,0 % ».
    expect(found).toBe(false);
  });

  it("ne compare rien s'il n'existe aucune publication antérieure", () => {
    const rows = publication("2026-08-26 11:37", 0.2933, 0.1538);
    const current = { economy_and_labour: 0.4069 + 0.2933, international_affairs_and_defense: 0.2206 + 0.1538 };

    expect(previousDistinctAggregate(rows, "2026-08-26 11:37", current).found).toBe(false);
  });
});
