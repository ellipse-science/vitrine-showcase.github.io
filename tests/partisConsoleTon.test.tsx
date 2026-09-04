import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData } from "@/lib/data/parties";

// LE PETIT VUMÈTRE DE TON — sous chaque colonne de la console : l'aiguille dévie
// selon le ton (`--ct-angle`, d'après `tonePct`) et sa couleur reprend le
// dégradé de « Ton en chambre » (`--ct-ton`). La colonne EN SOURDINE en a un
// aussi, mais CASSÉ (`console-ton--casse`), et sa pile de segments reste vide.

/** Cinq partis, parts de voix décroissantes (le dernier passe en sourdine) et
 *  tons étalés : un favorable, un défavorable, un neutre. `tons` keyé par
 *  sigle. */
function donnees(): PartiesData {
  const tons: Record<string, number> = { plq: 0.2, caq: 0.6, qs: 0, pq: -0.6, pcq: -0.1 };
  const jours = ["2026-08-25", "2026-08-26", "2026-08-27"];
  const lignes = jours.flatMap((j) =>
    PARTY_KEYS.map((p, i) => ({
      party: p.toUpperCase(),
      date_utc: j,
      date_montreal_tz: j,
      weighted_mentions: 0.34 - i * 0.06,
      total_raw_score: 100 - i * 10,
      weighted_tone: tons[p],
      computed_at: `${j}T11:31:00Z`,
    })),
  );
  const calcule = __test__.computeStats(lignes);
  if (!calcule) throw new Error("computeStats a rendu null");
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

const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees()} />);
const styles = [...html.matchAll(/class="console-ton(?:[^"]*)"[^>]*?style="([^"]*)"/g)].map((m) => m[1]);
const anglesActifs = [...html.matchAll(/class="console-ton"[^>]*?style="([^"]*)"/g)].map((m) => m[1]);

const angleDe = (s: string) => parseFloat(/--ct-angle:\s*(-?[\d.]+)deg/.exec(s)![1]);
const rgbDe = (s: string) => {
  const m = /--ct-ton:\s*rgb\((\d+), (\d+), (\d+)\)/.exec(s)!;
  return { r: +m[1], g: +m[2], b: +m[3] };
};
const tonDont = (pred: (deg: number) => boolean) => {
  const s = anglesActifs.find((x) => pred(angleDe(x)));
  if (!s) throw new Error("aucun console-ton actif ne satisfait le prédicat d'angle");
  return s;
};

describe("le petit vumètre de ton, sous chaque colonne", () => {
  it("un par colonne — cinq, dont un CASSÉ pour la sourdine", () => {
    expect(styles).toHaveLength(5);
    expect((html.match(/console-ton--casse/g) ?? []).length).toBe(1);
    expect(anglesActifs).toHaveLength(4);
  });

  it("la colonne en sourdine garde SON étiquette « Sourdine », sous le boîtier", () => {
    expect(html).toContain("console-sourdine");
  });

  it("la colonne en sourdine n'a plus aucun segment allumé — pas même les deux gris", () => {
    expect(html).not.toContain("seg mute on");
  });

  it("l'échelle porte un segment rouge à gauche, vert à droite", () => {
    expect(html).toContain("ct-echelle--defav");
    expect(html).toContain("ct-echelle--fav");
  });

  it("couverture FAVORABLE → aiguille vers la droite, teinte verte", () => {
    const s = tonDont((d) => d >= 10);
    expect(angleDe(s)).toBeGreaterThan(0);
    const { r, g } = rgbDe(s);
    expect(g).toBeGreaterThan(r);
  });

  it("couverture DÉFAVORABLE → aiguille vers la gauche, teinte rouge", () => {
    const s = tonDont((d) => d <= -10);
    expect(angleDe(s)).toBeLessThan(0);
    const { r, g } = rgbDe(s);
    expect(r).toBeGreaterThan(g);
  });

  it("couverture NEUTRE → aiguille droite (0°), teinte parchemin", () => {
    const s = tonDont((d) => d === 0);
    expect(rgbDe(s)).toEqual({ r: 200, g: 189, b: 166 });
  });

  it("les colonnes actives frémissent en décalé — des --ct-phase distincts", () => {
    const phases = anglesActifs.map((s) => /--ct-phase:\s*([\d.]+)/.exec(s)![1]);
    expect(new Set(phases).size).toBeGreaterThan(1);
  });
});
