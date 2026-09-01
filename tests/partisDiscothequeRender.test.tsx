import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData } from "@/lib/data/parties";
import type { Pochette } from "@/lib/data/pochettes";

// La discothèque a changé de forme deux fois le 2026-08-31 : d'une caisse à
// tranches qui défile, à un mur de tuiles, à une VITRINE D'UN SEUL DISQUE — le
// plus écouté, en lien vers `/discotheque`. Le motif de ces tests suit celui de
// `partisPalmaresRender.test.tsx` : la forme réelle d'un composant client ne se
// prouve qu'en le rendant.

/** Une pochette d'archive minimale, au schéma exact de `lib/data/pochettes.ts`. */
function pochette(over: Partial<Pochette> & { parti: Pochette["parti"]; jour: string }): Pochette {
  return {
    sigle: over.parti.toUpperCase(),
    nom: over.parti.toUpperCase(),
    couleur: "#A03440",
    rang: 1,
    minutesUne: 60,
    tempsLabel: "1h",
    partPct: 30,
    enjeu: "Économie",
    ton: "Neutre",
    tonPct: 50,
    signature: `${over.jour}-${over.parti}`,
    src: `/pochettes/${over.jour}-${over.parti}.png`,
    sources: [{ src: `/pochettes/${over.jour}-${over.parti}.webp`, type: "image/webp" }],
    blocHour: 20,
    jourLabel: "27 août 2026",
    jourCourt: "27 août",
    ...over,
  };
}

function donnees(): PartiesData {
  const lignes = PARTY_KEYS.map((p, i) => ({
    party: p.toUpperCase(),
    date_utc: "2026-08-27",
    date_montreal_tz: "2026-08-27",
    weighted_mentions: 0.3 - i * 0.05,
    total_raw_score: 100 - i * 10,
    weighted_tone: 0,
    computed_at: "2026-08-27T11:31:00Z",
  }));
  const calcule = __test__.computeStats(lignes, lignes, lignes);
  if (!calcule) throw new Error("computeStats a rendu null sur un jeu valide");
  const { stats, dates } = calcule;
  return {
    blocCourant: null,
    ranges: {
      today: __test__.buildRangeView(stats, "today", dates, null),
      week: __test__.buildRangeView(stats, "week", dates, null),
      overall: __test__.buildRangeView(stats, "overall", dates, null),
    },
    indisponible: null,
    medias: [],
    byMedia: {},
    enjeuMix: { enjeux: [], parParti: {} },
    surFixtures: false,
    lastDate: "2026-08-27",
    lastUpdated: "Dernière mise à jour : jeudi 27 août 2026",
  };
}

// TRIÉE PAR TEMPS D'ÉCOUTE, comme le fait réellement `discotheque.pile` en
// amont (`lib/data/pochettes.ts`) : le composant ne retrie rien, il affiche
// `pile[0]` tel quel. Si la pile arrivait mal triée ici, le test le prouverait
// en pointant le mauvais disque.
const PILE: Pochette[] = [
  pochette({
    jour: "2026-08-26", parti: "qs", couleur: "#B85A2C",
    minutesUne: 134, tempsLabel: "2h14", jourLabel: "26 août 2026",
  }),
  pochette({ jour: "2026-08-27", parti: "caq", couleur: "#2B5C7C", minutesUne: 60, tempsLabel: "1h" }),
  pochette({
    jour: "2026-08-26", parti: "plq", couleur: "#A03440",
    minutesUne: 40, tempsLabel: "40 min", jourLabel: "26 août 2026",
  }),
];

describe("la discothèque — la vitrine du disque le plus écouté", () => {
  const html = renderToStaticMarkup(
    <PartisCouvertureClient data={donnees()} discotheque={{ jourCourant: null, duJour: [], pile: PILE, fonds: [] }} />,
  );
  const carte = html.split('class="disco-vedette"')[1]?.split("</a>")[0] ?? "";

  it("met en avant EXACTEMENT le premier de la pile — le plus écouté", () => {
    // QS (134 min) est en tête de `PILE`, pas CAQ (60 min) : si le composant
    // affichait le mauvais disque, ce test pointerait le sigle en trop.
    expect(carte).toContain(">QS</b>");
    expect(carte).not.toContain(">CAQ</b>");
    expect(carte).not.toContain(">PLQ</b>");
  });

  it("écrit le nom, la durée et la date du disque en toutes lettres", () => {
    expect(carte).toContain("2h14");
    expect(carte).toContain("26 août 2026");
  });

  it("toute la carte est UN SEUL lien, pas un bouton qui ouvre un volet en place", () => {
    // La discothèque n'a plus d'état « archive ouverte » depuis le 2026-08-31 :
    // un clic quitte le module, il ne déplie plus rien sur place.
    expect(html).toMatch(/<a[^>]*class="disco-vedette"/);
    expect(carte).not.toContain("<button");
    expect(html).not.toContain('class="gatefold"');
  });

  it("le lien mène à /discotheque, où se parcourt le fonds complet", () => {
    expect(html).toMatch(/class="disco-vedette"[^>]*href="[^"]*\/discotheque\/"/);
  });

  it("annonce le nombre de journées du fonds", () => {
    // Deux journées distinctes dans PILE : 2026-08-26 et 2026-08-27.
    expect(carte).toContain("2 journées");
  });

  it("charge la vraie illustration engendrée, pas un aplat géométrique", () => {
    expect(carte).toContain("<picture");
    expect(carte).toContain(PILE[0].src);
  });

  it("ne s'affiche pas quand la pile est vide", () => {
    const html2 = renderToStaticMarkup(
      <PartisCouvertureClient data={donnees()} discotheque={{ jourCourant: null, duJour: [], pile: [], fonds: [] }} />,
    );
    expect(html2).not.toContain('aria-label="Discothèque"');
  });
});
