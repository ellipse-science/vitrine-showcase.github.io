import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData } from "@/lib/data/parties";

// LE COIN DE LA POCHETTE : chaque deck qui porte un parti montre, derrière son
// disque, la bande basse de sa pochette avec la première ligne du dos (le temps
// en Une). C'est l'indice qu'on peut la retourner. Un deck vide n'en a pas.

function donnees(partis: readonly string[]): PartiesData {
  const jours = ["2026-09-07", "2026-09-08", "2026-09-09"];
  const lignes = jours.flatMap((j) =>
    partis.map((p, i) => ({
      party: p.toUpperCase(),
      date_utc: j,
      date_montreal_tz: j,
      weighted_mentions: 0.34 - i * 0.06,
      total_raw_score: 100 - i * 10,
      weighted_tone: 0,
      computed_at: `${j}T11:31:00Z`,
    })),
  );
  const c = __test__.computeStats(lignes)!;
  return {
    blocCourant: null,
    ranges: {
      today: __test__.buildRangeView(c.stats, "today", c.dates, null),
      week: __test__.buildRangeView(c.stats, "week", c.dates, null),
      overall: __test__.buildRangeView(c.stats, "overall", c.dates, null),
    },
    indisponible: null,
    medias: [],
    byMedia: {},
    enjeuMix: { enjeux: [], parParti: {} },
    surFixtures: false,
    lastDate: "2026-09-09",
    lastUpdated: "Dernière mise à jour : mercredi 9 septembre 2026",
  };
}

const coins = (html: string) => html.match(/class="deck-pochette-coin"/g) ?? [];

describe("le coin de la pochette sur la face avant des decks", () => {
  it("un coin par deck qui porte un parti, avec la première ligne du dos", () => {
    const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees(PARTY_KEYS)} />);
    expect(coins(html)).toHaveLength(4);
    // La ligne du coin est celle du dos : même catégorie, même balisage.
    const coin = /<span class="deck-pochette-coin"[^>]*>[\s\S]*?<\/dl><\/span>/.exec(html)![0];
    expect(coin).toContain('class="tracklist-cat">Temps en Une<');
    expect(coin).toContain('class="tracklist-metrique">');
  });

  it("le coin est masqué aux lecteurs d'écran : le dos annonce déjà la mesure", () => {
    const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees(PARTY_KEYS)} />);
    expect(html).toMatch(/class="deck-pochette-coin" aria-hidden="true"/);
  });

  it("un deck vide n'a pas de pochette à montrer", () => {
    // Deux partis seulement : le dernier passe en sourdine, et trois des quatre
    // places restent vides.
    const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees(["caq", "pq"])} />);
    const vides = (html.match(/class="deck deck--vide"/g) ?? []).length;
    expect(vides).toBeGreaterThan(0);
    expect(coins(html)).toHaveLength(4 - vides);
  });
});
