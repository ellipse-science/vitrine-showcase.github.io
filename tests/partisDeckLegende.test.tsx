import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient, legendeDeck } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData, RowView, EnjeuView } from "@/lib/data/parties";

// LA LÉGENDE SOUS CHAQUE DECK : jours en tête, puis enjeu dominant.
// Les espaces insécables font partie de la formulation (guide de rédaction).

const NBSP = "\u00a0";

/** Une ligne minimale : seuls les champs lus par `legendeDeck` comptent. */
function ligne(partiel: Partial<RowView>): RowView {
  return {
    joursEnTete: 0,
    joursComptes: 5,
    enjeuxVentiles: true,
    enjeux: [],
    ...partiel,
  } as RowView;
}

const enjeu = (label: string, pct: number, extra: Partial<EnjeuView> = {}): EnjeuView => ({
  label,
  pct,
  toneLabel: "Neutre",
  toneDirection: "neutral",
  ...extra,
});

describe("legendeDeck — ligne 1, les journées en tête", () => {
  it("Semaine et Campagne : « En tête N jours sur M », singulier compris", () => {
    expect(legendeDeck(ligne({ joursEnTete: 3, joursComptes: 5 }), "week").tete).toBe(`En tête 3${NBSP}jours sur 5`);
    expect(legendeDeck(ligne({ joursEnTete: 1, joursComptes: 16 }), "overall").tete).toBe(`En tête 1${NBSP}jour sur 16`);
  });

  it("aucun jour en tête : « Jamais en tête »", () => {
    expect(legendeDeck(ligne({ joursEnTete: 0, joursComptes: 5 }), "week").tete).toBe("Jamais en tête");
  });

  it("Jour : la fenêtre des sept derniers jours est écrite en toutes lettres", () => {
    expect(legendeDeck(ligne({ joursEnTete: 4, joursComptes: 7 }), "today").tete).toBe("En tête 4 des 7 derniers jours");
    expect(legendeDeck(ligne({ joursEnTete: 0, joursComptes: 7 }), "today").tete).toBe(`Jamais en tête en 7${NBSP}jours`);
  });

  it("sans journée comptée, pas de ligne plutôt qu'un « 0 sur 0 »", () => {
    expect(legendeDeck(ligne({ joursEnTete: 0, joursComptes: 0 }), "week").tete).toBeNull();
  });
});

describe("legendeDeck — ligne 2, l'enjeu dominant", () => {
  it("« Surtout : nom court (part %) », le premier enjeu qui n'est pas le reste", () => {
    const l = ligne({
      enjeux: [enjeu("Santé et politiques sociales", 70), enjeu("Autres enjeux", 30, { reste: true })],
    });
    expect(legendeDeck(l, "week").enjeu).toBe(`Surtout${NBSP}: Santé (70${NBSP}%)`);
  });

  it("aucun enjeu quand le seul libellé est « Aucun enjeu identifié »", () => {
    expect(legendeDeck(ligne({ enjeux: [enjeu("Aucun enjeu identifié", 100)] }), "week").enjeu).toBeNull();
  });

  it("aucun enjeu sur une position du fader : les enjeux ne sont pas ventilés par média", () => {
    const l = ligne({ enjeuxVentiles: false, enjeux: [enjeu("Santé et politiques sociales", 70)] });
    expect(legendeDeck(l, "week").enjeu).toBeNull();
  });
});

describe("la légende dans le rendu du module", () => {
  function donnees(): PartiesData {
    const jours = ["2026-09-07", "2026-09-08", "2026-09-09"];
    const lignes = jours.flatMap((j) =>
      PARTY_KEYS.map((p, i) => ({
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
    const enjeux = new Map(PARTY_KEYS.map((p) => [p, [enjeu("Gouvernements et gouvernance", 47)]]));
    return {
      blocCourant: null,
      ranges: {
        today: __test__.buildRangeView(c.stats, "today", c.dates, null, enjeux),
        week: __test__.buildRangeView(c.stats, "week", c.dates, null, enjeux),
        overall: __test__.buildRangeView(c.stats, "overall", c.dates, null, enjeux),
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

  it("quatre légendes, une par deck, avec les deux lignes", () => {
    const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees()} />);
    expect((html.match(/class="deck-legende"/g) ?? []).length).toBe(4);
    expect(html).toContain("deck-legende-tete");
    expect(html).toContain(`Surtout${NBSP}: Gouvernance (47${NBSP}%)`);
  });
});
