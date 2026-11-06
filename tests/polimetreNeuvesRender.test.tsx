import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PolimetrePlusClient, messageEtatVide } from "@/components/interactive/PolimetrePlusClient";
import type {
  PolimetreData,
  PromessesNeuvesData,
} from "@/lib/data/polimetre-meta";

// Ce que le bloc « promesses de la campagne » AFFIRME tient dans son balisage,
// pas dans son chargeur : la couleur d'une pastille est une classe CSS, l'absence
// du bloc est une absence de nœud. Un test de chargeur ne verrait rien de tout
// ça — d'où un test de rendu.
//
// Ce qu'il verrouille :
//   - hors campagne (aucune promesse neuve), le module est EXACTEMENT celui
//     d'avant : un seul bloc, avec son h2, donc aucun bloc qui n'offre qu'une
//     liste vide ;
//   - la pastille porte le parti — et il n'y a que les cinq suivis à porter, le
//     chargeur écartant les autres (cf. tests/promessesNeuves.test.ts) ;
//   - dès qu'il y a des promesses neuves, les deux blocs sont empilés, campagne
//     AU-DESSUS de 2022, et un seul h2 : celui du bloc du haut. Le bloc « 2022 »
//     ne garde que son sous-titre (en h3) et son infobulle.

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
  ranges: { day: [neuve()], week: [neuve()], campaign: [neuve()] },
};

const rendre = (n?: PromessesNeuvesData | null, onglet?: "pq" | "campagne" | "2022") =>
  renderToStaticMarkup(<PolimetrePlusClient data={polimetre} neuves={n} ongletInitial={onglet} />);

// Le module s'ouvre sur l'onglet PQ 2026 : on demande l'onglet « campagne »
// pour éprouver sa vue.
const rendreCampagne = (n: PromessesNeuvesData = neuves) => rendre(n, "campagne");

const H2_CAMPAGNE = "les promesses de la campagne</h2>";
const H2_2022 = "promesses électorales à la Une</h2>";
const SOUS_TITRE_2022 = "élections de 2022";

describe("Polimètre+ — module unifié (campagne / 2022)", () => {
  it("n'affiche que le bloc « 2022 », avec son h2, tant qu'aucune promesse neuve n'existe", () => {
    const html = rendre(null);
    expect(html).not.toContain("les promesses de la campagne");
    expect(html).not.toContain("ppl-sous-titre");
    // …et le module historique est intact.
    expect(html).toContain(H2_2022);
    expect(html).toContain("Depuis une semaine");
  });

  it("n'affiche pas le bloc « campagne » quand les trois fenêtres neuves sont vides", () => {
    const html = rendre({ ...neuves, ranges: { day: [], week: [], campaign: [] } });
    expect(html).not.toContain("les promesses de la campagne");
    expect(html).toContain(H2_2022);
  });

  it("passe au module unifié dès qu'une seule fenêtre neuve a des promesses", () => {
    // Un run manuel peut publier `campaign` un jour où `day` n'a rien à dire.
    const html = rendre({ ...neuves, ranges: { day: [], week: [], campaign: [neuve()] } });
    expect(html).toContain("ppl-onglets");
    expect(html).toContain("polimeter-plus--unifie");
  });

  it("module unifié : un seul panneau, l'onglet PQ 2026 affiché par défaut", () => {
    const html = rendre(neuves);
    // Plus d'empilement : une seule vue rendue à la fois (les colonnes du
    // kanban sont aussi des <section>, d'où le compte sur la classe du module).
    expect(html.match(/<section class="polimeter-plus\b/g)).toHaveLength(1);
    expect(html).not.toContain(SOUS_TITRE_2022);
    // Les onglets du filtre : PQ en premier et sélectionné.
    expect(html).toMatch(/aria-selected="true"[^>]*ppl-onglet--pq/);
    // Ordre : PQ 2026, CAQ 2022, puis la campagne après la barre oblique.
    expect(html.indexOf("ppl-onglet--pq")).toBeLessThan(html.indexOf("ppl-onglet--2022"));
    expect(html.indexOf("ppl-onglet--2022")).toBeLessThan(html.indexOf("ppl-onglets__barre"));
    expect(html.indexOf("ppl-onglets__barre")).toBeLessThan(html.indexOf("ppl-onglet--campagne"));
    expect(html).toContain("ppl-kanban");
  });

  it("module unifié : l'onglet campagne garde sa vue", () => {
    const html = rendreCampagne();
    expect(html).toContain("polimeter-plus--neuves");
    expect(html).toMatch(/aria-selected="true"[^>]*ppl-onglet--campagne/);
    expect(html).toMatch(/aria-selected="false"[^>]*ppl-onglet--2022/);
    // La vue campagne garde ses onglets de période.
    expect(html).toContain("Aujourd&#x27;hui");
  });

  it("module unifié : un seul h2, le titre commun du module", () => {
    const html = rendre(neuves);
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html).toContain(H2_2022);
    expect(html).not.toContain(H2_CAMPAGNE);
    expect(html).not.toContain("ppl-sous-titre");
  });

  it("module unifié : chaque onglet du filtre a son style dans le CSS", async () => {
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("app/globals.css", "utf8");
    for (const cls of [".ppl-onglets", ".ppl-onglet--pq.active", ".ppl-onglet--campagne.active", ".ppl-onglet--2022.active", ".polimeter-plus--unifie"]) {
      expect(css, `${cls} manquante`).toContain(cls);
    }
  });
});

// Le bloc « campagne » se rend via NeuvesView, en kanban. Ci-dessous : le
// contrat de nommage entre le composant et globals.css.
describe("Polimètre+ — contrat de nommage des colonnes de parti", () => {
  it("chaque parti suivi a sa classe de colonne dans le CSS", async () => {
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("app/globals.css", "utf8");
    const { PARTI_ORDER } = await import("@/lib/data/polimetre-meta");
    for (const k of PARTI_ORDER) {
      expect(css, `.ppl-kanban__col--parti-${k} manquante`).toContain(`.ppl-kanban__col--parti-${k}`);
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

describe("Polimètre+ — kanban de la campagne", () => {
  it("range les promesses par parti, dans l'ordre des sièges du 5 octobre", () => {
    const html = rendreCampagne();
    const ordre = ["pq", "plq", "pcq", "qs", "caq"].map((k) => html.indexOf(`ppl-kanban__col--parti-${k}`));
    expect(ordre.every((i) => i > -1)).toBe(true);
    expect([...ordre].sort((x, y) => x - y)).toEqual(ordre);
  });

  it("porte le lien vers le guide du Polimètre sous chaque kanban", () => {
    for (const html of [rendre(neuves), rendreCampagne(), rendre(neuves, "2022")]) {
      expect(html).toContain("ppl-metho-kanban");
      expect(html).toContain("GuidePolimetre2026.pdf");
    }
  });
});

describe("Polimètre+ — onglets de période du mode « campagne »", () => {
  it("offre les trois onglets, dans l'ordre de l'emboîtement, sans « mois »", () => {
    // Le bloc « 2022 » empilé en dessous a lui-même un onglet « Depuis un mois » :
    // la vérification « sans mois » ne porte donc que sur le bloc campagne.
    const html = rendreCampagne();
    const blocCampagne = html.slice(0, html.indexOf("polimeter-plus--second"));
    const auj = blocCampagne.indexOf("Aujourd&#x27;hui");
    const sem = blocCampagne.indexOf("Depuis une semaine");
    const camp = blocCampagne.indexOf(">Campagne<");
    expect(auj).toBeGreaterThan(-1);
    expect(sem).toBeGreaterThan(auj);
    expect(camp).toBeGreaterThan(sem);
    expect(blocCampagne).not.toContain("Depuis un mois");
  });

  // L'onglet ouvert au premier rendu est « Aujourd'hui » : c'est donc lui que
  // le rendu statique laisse observer. Ce que les deux cas suivants prouvent
  // vaut pour les trois onglets, la règle étant la même (messageEtatVide).
  it("un onglet vide sans onglet plus court à le contredire dit « aucune reprise »", () => {
    const html = rendreCampagne({ ...neuves, ranges: { day: [], week: [], campaign: [neuve()] } });
    expect(html).toContain("n&#x27;a été reprise dans les Unes aujourd&#x27;hui");
    expect(html).not.toContain("pas encore été publié");
  });

  it("un onglet vide n'affirme jamais « aucune reprise » sur une fenêtre pas publiée", () => {
    // Le raffineur ne publie pas une fenêtre sans reprise : `campaign` vide
    // alors que `day` est plein ne peut être qu'une fenêtre non calculée. Le
    // rendu statique n'ouvre que « Aujourd'hui » ; on éprouve donc la règle sur
    // la fonction elle-même, avec la donnée telle qu'elle est en production
    // tant que la campagne n'est calculée que sur demande.
    const ranges = { day: [neuve()], week: [], campaign: [] };
    expect(messageEtatVide("campaign", ranges)).toBe(
      "Le classement de cette période n'a pas encore été publié.",
    );
    expect(messageEtatVide("week", ranges)).toBe(
      "Le classement de cette période n'a pas encore été publié.",
    );
    // Rien de plus court que « Aujourd'hui » : lui seul peut dire « aucune reprise ».
    expect(messageEtatVide("day", ranges)).toContain("aujourd'hui");
    // Et une campagne vide sous une semaine vide et un jour vide dit la vérité.
    expect(messageEtatVide("campaign", { day: [], week: [], campaign: [] })).toContain(
      "depuis le début de la campagne",
    );
  });
});
