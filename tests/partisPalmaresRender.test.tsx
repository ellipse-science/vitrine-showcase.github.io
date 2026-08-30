import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData } from "@/lib/data/parties";

// Une section qui DISPARAÎT ne se prouve pas dans le chargeur : côté données,
// `tooShort: true` était déjà correct. C'est le composant qui décidait de ne
// rien rendre du tout — d'où un test de rendu.
//
// Le bogue : `tooShort` était testé DEUX FOIS, une fois par le parent pour
// masquer la section et une fois par `Palmares` pour expliquer. Le parent
// gagnait, la section s'évaporait sans un mot, et les messages de l'enfant
// étaient inatteignables. Le lecteur voyait un trou, ce qui se lit comme une
// panne du site plutôt que comme une donnée pas encore publiée.
//
// Le cas n'a rien d'exceptionnel : le raffineur remet ses blocs de 4 h à zéro à
// minuit, donc chaque matin, jusqu'au deuxième bloc publié, l'onglet « Jour »
// n'a qu'un point et rien à tracer.

/** Un jeu à UNE SEULE date : la fenêtre la plus courte possible, donc une
 *  « courbe » d'un point que le module refuse de tracer. */
function donneesUnSeulJour(): PartiesData {
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
    // Sans table intra-journée, il n'y a pas de bloc courant — c'est le même
    // état que le `null` passé plus bas à `buildRangeView`.
    blocCourant: null,
    // `null` en quatrième argument = l'agrégat sans table intra-journée, le
    // chemin qui produit `detail-horaire-absent`.
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

describe("le palmarès sans courbe à tracer — régression", () => {
  const data = donneesUnSeulJour();

  it("la vue Jour sans détail horaire DIT pourquoi, au lieu de disparaître", () => {
    expect(data.ranges.today.chart.tooShort).toBe(true);
    expect(data.ranges.today.chart.raison).toBe("detail-horaire-absent");

    const html = renderToStaticMarkup(<PartisCouvertureClient data={data} />);

    // La section garde sa place — son titre est là.
    expect(html).toContain("Le palmar");
    // Et elle porte une phrase, pas un vide.
    expect(html).toContain("course-vide");
    expect(html).toContain("pas encore publi");
  });

  it("une fenêtre trop courte se dit aussi, sur les autres onglets", () => {
    // L'onglet ouvert est « Jour » ; on éprouve donc la vue Semaine par sa
    // donnée, faute de pouvoir cliquer dans un rendu statique.
    expect(data.ranges.week.chart.tooShort).toBe(true);
    expect(data.ranges.week.chart.raison).toBeUndefined();
  });

  it("ne publie plus la raison « sans-detail-horaire », que rien ne pouvait afficher", () => {
    // Une vue PAR MÉDIA n'a pas de quatrième argument — c'est le chemin qui
    // portait `sans-detail-horaire`. Elle n'atteint jamais le palmarès, qui lit
    // toujours l'agrégat : les deux chemins portent donc la même raison.
    const lignes = PARTY_KEYS.map((p) => ({
      party: p.toUpperCase(),
      date_utc: "2026-08-27",
      date_montreal_tz: "2026-08-27",
      weighted_mentions: 0.2,
      total_raw_score: 50,
      weighted_tone: 0,
      computed_at: "2026-08-27T11:31:00Z",
    }));
    const calcule = __test__.computeStats(lignes, lignes, lignes)!;
    const parMedia = __test__.buildRangeView(calcule.stats, "today", calcule.dates);

    expect(parMedia.chart.raison).toBe("detail-horaire-absent");
  });
});
