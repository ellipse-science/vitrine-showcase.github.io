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
  rang: 1,
  ...o,
});

const neuves: PromessesNeuvesData = {
  windowEnd: "2026-09-03",
  lastUpdated: "Dernière mise à jour : jeudi 3 septembre 2026",
  ranges: { day: [neuve()], week: [neuve()], campaign: [neuve()] },
  totaux: { day: { qs: 1 }, week: { qs: 1 }, campaign: { qs: 1 } },
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
    // L'état de chaque mandat est accolé à son onglet.
    expect(html).toMatch(/ppl-onglet--pq[^>]*>PQ 2026<span class="ppl-onglet__etat"> \(En cours\)<\/span>/);
    expect(html).toMatch(/ppl-onglet--2022[^>]*>CAQ 2022<span class="ppl-onglet__etat"> \(Terminé\)<\/span>/);
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

  it("le compteur d'une colonne montre le vrai total, pas les cartes chargées", () => {
    // Le chargeur ne transmet que cinq promesses par parti : le compteur doit
    // lire `totaux`, sinon « PLQ 2 » se lit comme deux promesses en tout.
    const n = { ...neuves, totaux: { ...neuves.totaux, day: { qs: 53 } } };
    const html = rendreCampagne(n);
    const col = html.slice(html.indexOf("ppl-kanban__col--parti-qs"));
    expect(col).toMatch(/ppl-kanban__compte">53</);
    // Même règle dans l'onglet PQ 2026, sur la colonne « En suspens ».
    const pq = {
      ...neuves,
      ranges: { ...neuves.ranges, campaign: [neuve({ parti: "pq" })] },
      totaux: { ...neuves.totaux, campaign: { pq: 124 } },
    };
    const htmlPq = rendre(pq);
    expect(htmlPq.slice(htmlPq.indexOf("ppl-kanban__col--en-suspens"))).toMatch(/ppl-kanban__compte">124</);
  });

  it("numérote les cartes dans leur colonne, pas tous partis confondus", () => {
    // Le chargeur donne un rang global (PLQ en 14e, 27e…) : la carte doit
    // afficher son rang dans la colonne, comme dans l'onglet PQ 2026.
    const n = {
      ...neuves,
      ranges: {
        ...neuves.ranges,
        day: [
          neuve({ promesseId: "pn-1", parti: "pq", rang: 1 }),
          neuve({ promesseId: "pn-2", parti: "qs", rang: 14 }),
          neuve({ promesseId: "pn-3", parti: "qs", rang: 27 }),
        ],
      },
    };
    const html = rendreCampagne(n);
    const colQs = html.slice(html.indexOf("ppl-kanban__col--parti-qs"), html.indexOf("ppl-kanban__col--parti-caq"));
    expect(colQs.match(/ppl-kanban__rang">#\d+/g)).toEqual(['ppl-kanban__rang">#1', 'ppl-kanban__rang">#2']);
  });

  it("marque les colonnes vides, que le téléphone réduit à leur en-tête", async () => {
    const pq = { ...neuves, ranges: { ...neuves.ranges, campaign: [neuve({ parti: "pq" })] } };
    const html = rendre(pq);
    // PQ 2026 : seule « En suspens » a des cartes.
    expect(html.match(/ppl-kanban__col--vide/g)).toHaveLength(4);
    expect(html).not.toMatch(/ppl-kanban__col--en-suspens ppl-kanban__col--vide/);
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("app/globals.css", "utf8");
    expect(css).toContain(".ppl-kanban__col--vide .ppl-kanban__cartes { display: none; }");
  });

  it("dit au survol que l'enjeu de la campagne est inféré", () => {
    // L'enjeu de 2022 est codé à la main, celui de la campagne est déduit du
    // texte par un modèle : le module ne doit pas laisser croire qu'ils ont la
    // même provenance.
    expect(rendreCampagne()).toContain('aria-label="Enjeu probable\u00a0: Santé et politiques sociales"');
    expect(rendre(neuves, "2022")).not.toContain("Enjeu probable");
  });

  it("l'onglet PQ 2026 porte la date, l'infobulle, le partage et le bandeau de développement", () => {
    const pq = { ...neuves, ranges: { ...neuves.ranges, campaign: [neuve({ parti: "pq" })] } };
    const html = rendre(pq);
    expect(html).toContain("module-last-updated");
    expect(html).toContain('aria-label="À propos des promesses du PQ"');
    expect(html).not.toContain("ppl-bandeau-fictif");
    expect(rendre({ ...pq, fictif: true })).toContain("ppl-bandeau-fictif");
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

// Filtre d'enjeu et lien vers le Polimètre, réintégrés en bas de chaque onglet
// du kanban (ils existaient dans la liste d'avant #1005).
describe("Polimètre+ — filtre d'enjeu et lien vers le Polimètre sur les trois onglets", () => {
  const onglets: ["pq" | "campagne" | "2022", string][] = [
    ["pq", 'href="https://polimeter.org/fr"'],
    ["2022", 'href="https://polimeter.org/fr/legault-frechette"'],
    ["campagne", 'href="https://polimeter.org/fr"'],
  ];
  for (const [onglet, href] of onglets) {
    it(`onglet ${onglet} : filtre sur la ligne des onglets, liens dans le cadre du kanban`, () => {
      const html = rendre(neuves, onglet);
      expect(html).toContain("Tous les enjeux");
      // Même ligne que les onglets, à leur droite.
      const ligne = html.indexOf("ppl-onglets-ligne");
      expect(ligne).toBeGreaterThan(-1);
      expect(html.indexOf('class="ppl-onglets"')).toBeGreaterThan(ligne);
      expect(html.indexOf("ppl-kanban-filtre")).toBeGreaterThan(html.indexOf('class="ppl-onglets"'));
      // Méthodologie et Polimètre côte à côte, dans le pied du cadre.
      const cadre = html.indexOf("ppl-kanban-cadre");
      const pied = html.indexOf("ppl-kanban-cadre__pied");
      expect(cadre).toBeGreaterThan(-1);
      expect(pied).toBeGreaterThan(cadre);
      expect(html.indexOf("ppl-metho-kanban")).toBeGreaterThan(pied);
      expect(html.indexOf("ppl-discover")).toBeGreaterThan(html.indexOf("ppl-metho-kanban"));
      expect(html).toContain(href);
      expect(html).toContain("ppl-discover__mark");
    });
  }
});

// Onglet PQ 2026 : la série des 535 promesses (polimetre_plus_stpierreplamondon)
// dès qu'elle est publiée ; d'ici là, repli sur les promesses de la campagne.
describe("Polimètre+ — onglet PQ 2026 sur la série des 535 promesses", () => {
  const pq: PolimetreData = {
    weekEndDate: "2026-12-01",
    lastUpdated: "Dernière mise à jour : mardi 1er décembre 2026",
    ranges: {
      week: [{
        pledgeNumber: "1.10.104", title: "Créer 10 000 places en CPE", fullTitle: "Un gouvernement du Parti Québécois…",
        summary: null, verdict: "en-suspens", verdictLabel: "En suspens", category: "Santé et politiques sociales",
        salienceIndex: 9, trend: { dir: "flat", delta: 0 }, articles: [],
      }],
      month: [],
    },
  };
  const rendrePq = (n: PromessesNeuvesData | null, onglet?: "pq" | "campagne" | "2022") =>
    renderToStaticMarkup(<PolimetrePlusClient data={polimetre} neuves={n} pq={pq} ongletInitial={onglet} />);

  it("série publiée : l'onglet PQ montre les promesses officielles, sans avis de gel", () => {
    const html = rendrePq(neuves);
    expect(html).toContain("Promesses électorales du Parti québécois (élections de 2026)");
    expect(html).toContain("Créer 10 000 places en CPE");
    expect(html).not.toContain("ppl-fige");
    expect(html).toContain('href="https://polimeter.org/fr"');
  });

  it("série publiée sans promesses de campagne : onglets PQ et CAQ seulement", () => {
    const html = rendrePq(null);
    expect(html).toContain("ppl-onglet--pq");
    expect(html).toContain("ppl-onglet--2022");
    expect(html).not.toContain("ppl-onglet--campagne");
  });

  it("série absente : repli sur les promesses de la campagne", () => {
    const html = rendre(neuves);
    expect(html).not.toContain("Promesses électorales du Parti québécois (élections de 2026)");
    expect(html).toContain("ppl-onglet--pq");
  });
});
