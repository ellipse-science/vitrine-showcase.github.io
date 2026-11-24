import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient, dureeDuTour } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData } from "@/lib/data/parties";

// LE MODULE RÉDUIT À SA CONSOLE (2026-11-24) : filtre Jour / Semaine / Mois à
// droite du titre, Semaine par défaut, plus de palmarès ni de discothèque,
// decks qui ne montrent que leur vitesse, fader alphabétique en noms complets.

function donnees(): PartiesData {
  // 40 jours : assez pour que Mois (30) et Semaine diffèrent du tout.
  const jours = Array.from({ length: 40 }, (_, i) =>
    new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
  );
  const lignes = jours.flatMap((j, n) =>
    PARTY_KEYS.map((p, i) => ({
      party: p.toUpperCase(),
      date_utc: j,
      date_montreal_tz: j,
      weighted_mentions: 0.34 - i * 0.06,
      // Le PQ domine les 10 premiers jours seulement : hors de la fenêtre Mois.
      total_raw_score: p === "pq" && n < 10 ? 1000 : 100 - i * 10,
      weighted_tone: 0,
      computed_at: `${j}T11:31:00Z`,
    })),
  );
  const calcule = __test__.computeStats(lignes);
  if (!calcule) throw new Error("computeStats a rendu null");
  const { stats, dates } = calcule;
  const vue = (r: "today" | "week" | "month" | "overall") => __test__.buildRangeView(stats, r, dates, null);
  return {
    blocCourant: null,
    ranges: { today: vue("today"), week: vue("week"), month: vue("month"), overall: vue("overall") },
    indisponible: null,
    medias: [
      { id: "RCI", label: "Radio-Canada" },
      { id: "LED", label: "Le Devoir" },
      { id: "TVA", label: "TVA Nouvelles" },
      { id: "LAP", label: "La Presse" },
      { id: "JDM", label: "Le Journal de Montréal" },
      { id: "MG", label: "Montreal Gazette" },
    ],
    byMedia: {},
    enjeuMix: { enjeux: [], parParti: {} },
    surFixtures: false,
    lastDate: jours.at(-1)!,
    lastUpdated: "Dernière mise à jour",
  };
}

const data = donnees();
const html = renderToStaticMarkup(<PartisCouvertureClient data={data} />);

describe("le filtre de période", () => {
  it("trois onglets, Jour / Semaine / Mois, à droite du titre", () => {
    const filtre = html.split('class="legend-toggle inline partis-periodes"')[1]?.split("</div>")[0] ?? "";
    const mots = [...filtre.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(mots).toEqual(["Jour", "Semaine", "Mois"]);
    expect(html).not.toContain("Campagne");
  });

  it("Semaine est la vue de départ", () => {
    expect(html).toMatch(/aria-selected="true" class="active"[^>]*>Semaine</);
  });
});

describe("la vue Mois", () => {
  it("compte les 30 derniers jours, pas tout le suivi", () => {
    const pqMois = data.ranges.month.rows.find((r) => r.key === "pq")!;
    const pqTout = data.ranges.overall.rows.find((r) => r.key === "pq")!;
    expect(pqMois.minutesUne).toBeLessThan(pqTout.minutesUne);
    expect(data.ranges.month.depuisLabel).toBe("sur 30 jours");
  });
});

describe("ce qui a quitté le module", () => {
  it("plus de palmarès, de knobs, de disque d'or ni de lien vers la discothèque", () => {
    for (const absent of ["palmares", "knob", "trophee", "discotheque", "flip-carte"]) {
      expect(html).not.toContain(absent);
    }
  });
});

describe("les decks", () => {
  it("quatre disques qui tournent, plus vite pour le parti le plus présent", () => {
    const tours = [...html.matchAll(/deck-carre--lecture[^"]*"[^>]*style="--tour:\s*([\d.]+)s"/g)].map((m) => +m[1]);
    expect(tours).toHaveLength(4);
    // Decks dans l'ordre 1, 3, 2, 4 dans le HTML : le 1er tourne le plus vite.
    expect(tours[0]).toBe(Math.min(...tours));
  });

  it("la vitesse est proportionnelle à la part, bornée, à l'arrêt à zéro", () => {
    expect(dureeDuTour(20)).toBeCloseTo(1.8);
    expect(dureeDuTour(40)).toBeCloseTo(0.9);
    expect(dureeDuTour(100)).toBe(0.45);
    expect(dureeDuTour(1)).toBe(20);
    expect(dureeDuTour(0)).toBeNull();
  });
});

describe("le fader", () => {
  it("Tous les médias au centre, en noms complets", () => {
    const noms = [...html.matchAll(/class="fader-cran[^"]*"[^>]*><i><\/i><b>([^<]+)<\/b>/g)].map((m) => m[1]);
    expect(noms).toEqual([
      "Le Devoir",
      "Radio-Canada",
      "La Presse",
      "Tous les médias",
      "Montreal Gazette",
      "TVA Nouvelles",
      "Le Journal de Montréal",
    ]);
  });
});
