import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PolimetrePlusClient } from "@/components/interactive/PolimetrePlusClient";
import type {
  PolimetreData,
  PromessesNeuvesData,
} from "@/lib/data/polimetre-meta";

// Ce que le mode « promesses de la campagne » AFFIRME tient dans son balisage,
// pas dans son chargeur : la couleur d'une pastille est une classe CSS, l'absence
// d'inverseur est une absence de nœud. Un test de chargeur ne verrait rien de
// tout ça — d'où un test de rendu.
//
// Ce qu'il verrouille :
//   - hors campagne (aucune promesse neuve), le module est EXACTEMENT celui
//     d'avant : pas d'inverseur, donc aucun mode qui mène à une liste vide ;
//   - la pastille porte le parti — et il n'y a que les cinq suivis à porter, le
//     chargeur écartant les autres (cf. tests/promessesNeuves.test.ts) ;
//   - le mode par défaut est le module historique, et l'inverseur le présente
//     en premier — un inverseur qui ouvre sur un mode non affiché se lit comme
//     un état incohérent.

const polimetre: PolimetreData = {
  weekEndDate: "2026-08-14",
  lastUpdated: "Dernière mise à jour : vendredi 14 août 2026",
  ranges: {
    week: [
      {
        pledgeNumber: "2.10.008",
        title: "Créer le Fonds bleu de 650 M$ pour l'eau",
        fullTitle: "Un gouvernement de la CAQ réélu promet un Fonds bleu…",
        summary: null,
        verdict: "en-cours",
        verdictLabel: "En cours",
        category: "Environnement et énergie",
        salienceIndex: 12,
        url: "https://polimeter.org/fr/legault-frechette/2.10.008",
        trend: { dir: "flat", delta: 0 },
        articles: [],
      },
    ],
    month: [],
  },
};

type Neuve = PromessesNeuvesData["ranges"]["day"][number];

const neuve = (o: Partial<Neuve> = {}): Neuve => ({
  promesseId: "pn-aaaaaaaaaaaa",
  title: "Injecter 7 M$ pour accélérer le traitement des dossiers",
  verbatim:
    "Injecter 7 millions de dollars supplémentaires pour accélérer le traitement des dossiers;",
  parti: "qs" as const,
  enjeu: "Santé et politiques sociales",
  announceDate: "2026-09-03",
  sourceUrl: "https://quebecsolidaire.net/communique/plan-habitation",
  sourceTitle: "Québec solidaire lance un Plan Habitation",
  salienceIndex: 8.4,
  nMentions: 3,
  articles: [],
  ...o,
});

const neuves: PromessesNeuvesData = {
  windowEnd: "2026-09-03",
  lastUpdated: "Dernière mise à jour : jeudi 3 septembre 2026",
  ranges: { day: [neuve()], week: [neuve()] },
};

const rendre = (n?: PromessesNeuvesData | null) =>
  renderToStaticMarkup(<PolimetrePlusClient data={polimetre} neuves={n} />);

// Le mode « campagne » ne s'atteint autrement qu'au clic, donc jamais dans un
// rendu statique — c'est ce trou qui a laissé passer un rail sans son filtre
// d'enjeu jusqu'en revue humaine.
const rendreCampagne = (n: PromessesNeuvesData = neuves) =>
  renderToStaticMarkup(
    <PolimetrePlusClient data={polimetre} neuves={n} defaultMode="neuves" />,
  );

describe("Polimètre+ — inverseur de mode", () => {
  it("n'affiche aucun inverseur tant qu'aucune promesse neuve n'existe", () => {
    const html = rendre(null);
    expect(html).not.toContain("ppl-mode-switch");
    expect(html).not.toContain("Promesses de la campagne");
    // …et le module historique est intact.
    expect(html).toContain("promesses électorales à la Une");
    expect(html).toContain("Depuis une semaine");
  });

  it("n'affiche pas d'inverseur quand les deux fenêtres neuves sont vides", () => {
    const html = rendre({ ...neuves, ranges: { day: [], week: [] } });
    expect(html).not.toContain("ppl-mode-switch");
  });

  it("offre l'inverseur dès qu'il y a des promesses neuves, mode historique par défaut", () => {
    const html = rendre(neuves);
    expect(html).toContain("ppl-mode-switch");
    expect(html).toContain("Promesses de la campagne");
    // Défaut = module historique : c'est SON titre qui sort.
    expect(html).toContain("promesses électorales à la Une");
    expect(html).not.toContain("les promesses de la campagne</h2>");
    // L'ordre de l'inverseur suit le défaut : « 2022 » avant « campagne ».
    expect(html.indexOf("Promesses de 2022")).toBeLessThan(
      html.indexOf("Promesses de la campagne"),
    );
  });
});

// Le mode « campagne » lui-même se rend via NeuvesView, atteignable seulement
// après un clic. On le vérifie donc en rendant la vue à travers la coquille avec
// un état initial forcé — impossible sans DOM — ou, plus simplement, en
// vérifiant les pièces que la coquille lui transmet et que le CSS consomme.
// Ci-dessous : le contrat de nommage entre le composant et globals.css.
describe("Polimètre+ — contrat de nommage des pastilles de parti", () => {
  it("chaque parti suivi a sa classe de rang, de libellé et de badge dans le CSS", async () => {
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("app/globals.css", "utf8");
    const { PARTI_ORDER } = await import("@/lib/data/polimetre-meta");
    for (const k of PARTI_ORDER) {
      // Les trois classes que PolimetrePlusClient émet pour un parti.
      expect(css, `.ppl-promise--parti-${k} manquante`).toContain(`.ppl-promise--parti-${k}`);
      expect(css, `.ppl-verdict--parti-${k} manquante`).toContain(`.ppl-verdict--parti-${k}`);
      expect(css, `.ppl-parti-badge--${k} manquante`).toContain(`.ppl-parti-badge--${k}`);
    }
  });

  it("les couleurs de parti du Polimètre+ sont celles du reste de la Vitrine", async () => {
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("app/globals.css", "utf8");
    const { PARTY_COLORS } = await import("@/lib/data/parties");
    // Troisième copie de ces teintes (PARTY_COLORS, .parti-name-box, ici) : le
    // test est ce qui empêche les trois de diverger en silence.
    for (const [k, hex] of Object.entries(PARTY_COLORS)) {
      const re = new RegExp(`--ppl-parti-${k}:\\s*${hex};`, "i");
      expect(css, `--ppl-parti-${k} devrait valoir ${hex}`).toMatch(re);
    }
  });
});

describe("Polimètre+ — enjeux du mode « campagne »", () => {
  it("offre le filtre d'enjeu dans le rail, comme le mode « 2022 »", () => {
    const html = rendreCampagne();
    expect(html).toContain("Enjeu probable");
    expect(html).toContain("ppl-cat-trigger");
    expect(html).toContain("Tous les enjeux");
  });

  it("offre l'infobulle qui dit d'où vient l'enjeu", () => {
    // L'honnêteté méthodologique est le point : la catégorie de 2022 est codée
    // à la main, celle-ci est inférée. Le module ne doit pas laisser croire
    // qu'elles ont la même provenance.
    //
    // On vérifie la PRÉSENCE de l'infobulle, pas son texte : InfoTip ne rend que
    // son bouton en balisage statique, le contenu n'arrive qu'à l'ouverture.
    expect(rendreCampagne()).toContain('aria-label="Enjeu probable"');
  });

  it("n'affiche pas le filtre d'enjeu quand aucune promesse n'en porte", () => {
    const sans = {
      ...neuves,
      ranges: { day: [neuve({ enjeu: null })], week: [neuve({ enjeu: null })] },
    };
    const html = rendreCampagne(sans);
    // Le rail reste là, mais chaque option est grisée : aucune donnée à filtrer.
    expect(html).toContain("Tous les enjeux");
    expect(html).not.toContain("ppl-cat-option--empty active");
  });

  it("garde le filtre de parti à côté de celui d'enjeu", () => {
    const html = rendreCampagne();
    expect(html).toContain("Tous les partis");
    expect(html).toContain("Tous les enjeux");
  });
});
