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


/** Un jeu avec un VRAI détail horaire : six blocs de 4 h, donc une courbe à
 *  tracer. C'est le seul chemin qui fait rendre le graphique en markup statique
 *  — l'onglet ouvert est « Jour », et sans table intra-journée il n'a qu'un
 *  point. */
function donneesAvecCourbe(): PartiesData {
  const jours = ["2026-08-25", "2026-08-26", "2026-08-27"];
  const lignes = jours.flatMap((j) =>
    PARTY_KEYS.map((p, i) => ({
      party: p.toUpperCase(),
      date_utc: j,
      date_montreal_tz: j,
      weighted_mentions: 0.3 - i * 0.05,
      total_raw_score: 100 - i * 10,
      weighted_tone: 0,
      computed_at: `${j}T11:31:00Z`,
    })),
  );

  // Des minutes qui MONTENT puis REDESCENDENT : le profil où un lissage
  // ordinaire déborde, et donc celui qu'il faut faire passer par le rendu.
  const paliers = [10, 90, 20, 80, 15, 60];
  const intra = [0, 4, 8, 12, 16, 20].flatMap((h, k) =>
    PARTY_KEYS.map((p, i) => ({
      party: p.toUpperCase(),
      date_utc: "2026-08-27",
      date_montreal_tz: "2026-08-27",
      weighted_mentions: 0.3 - i * 0.05,
      total_raw_score: Math.max(0, paliers[k] - i * 8),
      weighted_tone: 0,
      computed_at: "2026-08-27T11:31:00Z",
      block_hour: h,
      block_label: `${String(h).padStart(2, "0")}h`,
    })),
  );

  const calcule = __test__.computeStats(lignes, lignes, lignes);
  if (!calcule) throw new Error("computeStats a rendu null sur un jeu valide");
  const { stats, dates } = calcule;
  const chartJour = __test__.buildChartIntraday(intra, [...PARTY_KEYS]);
  if (!chartJour) throw new Error("buildChartIntraday a rendu null sur six blocs");

  return {
    blocCourant: { date: "2026-08-27", hour: 20, label: "16-20" },
    ranges: {
      today: __test__.buildRangeView(stats, "today", dates, chartJour),
      week: __test__.buildRangeView(stats, "week", dates, chartJour),
      overall: __test__.buildRangeView(stats, "overall", dates, chartJour),
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

describe("le palmarès dépouillé — la course aux rangs", () => {
  const html = renderToStaticMarkup(<PartisCouvertureClient data={donneesAvecCourbe()} />);

  /** Les cinq rangées, en unités du viewBox : `hauteurDuRang(r, 5, 30)`. */
  const RANGEES = [3, 9, 15, 21, 27];

  it("trace des lignes de rang, en paliers reliés par des S", () => {
    expect(html).not.toContain("<polyline");
    const chemins = [...html.matchAll(/class="palmares-trait[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    expect(chemins.length).toBe(PARTY_KEYS.length);
    for (const d of chemins) {
      expect(d.startsWith("M ")).toBe(true);
      expect(d).toContain(" C ");
      expect(d).not.toContain("NaN");
    }
  });

  it("une ligne ne passe JAMAIS par une place qu'elle n'occupe pas", () => {
    // Les points de contrôle d'une ligne de rang n'ont que deux ordonnées
    // possibles, celles de ses deux extrémités. Une valeur intermédiaire
    // signifierait que la courbe traverse une rangée où personne n'est.
    const chemins = [...html.matchAll(/class="palmares-trait[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    for (const d of chemins) {
      const ys = d
        .split(/[A-Z]/)
        .flatMap((bloc) => bloc.trim().split(/\s+/).filter(Boolean))
        .map(Number)
        .filter((v, i) => Number.isFinite(v) && i % 2 === 1);
      expect(ys.length).toBeGreaterThan(0);
      for (const y of ys) expect(RANGEES).toContain(y);
    }
  });

  it("chaque ligne porte un HALO — sans lui, un croisement est illisible", () => {
    const halos = [...html.matchAll(/class="palmares-halo" d="([^"]+)"/g)].map((m) => m[1]);
    expect(halos.length).toBe(PARTY_KEYS.length);
    // Le halo suit EXACTEMENT son trait : un décalage creuserait à côté.
    const traits = [...html.matchAll(/class="palmares-trait[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    expect([...halos].sort()).toEqual([...traits].sort());
  });

  it("chaque ligne porte son NOM et sa DURÉE à son extrémité", () => {
    const etiquettes = [...html.matchAll(/<button[^>]*class="palmares-etiquette[ "]/g)];
    expect(etiquettes.length).toBe(PARTY_KEYS.length);
    for (const p of PARTY_KEYS) {
      expect(html).toContain(`>${p.toUpperCase()}</span>`);
    }
    // Le rang dit qui mène, jamais de combien : sans la durée, le module
    // n'affiche plus une seule minute.
    expect(html).toContain("palmares-etiquette-duree");
    // Ni légende sous l'axe, ni encadré de classement.
    expect(html).not.toContain("palmares-legende");
    expect(html).not.toContain("palmares-classement");
  });

  it("une étiquette par RANGÉE, exactement — c'est ce que garantit la permutation", () => {
    const tops = [...html.matchAll(/class="palmares-etiquette[^"]*"[^>]*top:([\d.]+)%/g)].map(
      (m) => Number(m[1]),
    );
    expect(tops.length).toBe(PARTY_KEYS.length);
    // Les cinq rangées, en pourcentage du cadre : 10, 30, 50, 70, 90.
    expect([...tops].sort((a, b) => a - b)).toEqual([10, 30, 50, 70, 90]);
    // Aucun doublon : deux partis ne peuvent pas finir à la même place.
    expect(new Set(tops).size).toBe(PARTY_KEYS.length);
  });

  it("il n'y a PLUS d'axe des y — le rang est dans l'étiquette", () => {
    // La colonne de graduations a porté des durées, puis des rangs ; les deux
    // faisaient double emploi avec l'étiquette de bout de ligne, qui dit la
    // place ET la durée là où le regard va de toute façon. C'est elle qui
    // empêchait le tracé d'occuper toute la largeur.
    expect(html).not.toContain('class="palmares-y"');
    // Le rang est une pastille dans l'étiquette, et les cinq places y sont.
    const pastilles = [...html.matchAll(/class="palmares-rang"[^>]*>(\d)</g)].map((m) => m[1]);
    expect(pastilles.sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("la ligne part TOUJOURS de l'origine, même sans relevé avant", () => {
    // Le raffineur ne publie ses blocs qu'à mesure que la journée avance : à
    // 16h, les deux seuls relevés sont ceux de 12h et 16h. Sans ce palier, les
    // deux premiers tiers du cadre restaient vides — ce qui ne se lit pas
    // « il ne s'est rien passé » mais rien du tout.
    const chemins = [...html.matchAll(/class="palmares-trait[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    expect(chemins.length).toBe(PARTY_KEYS.length);
    for (const d of chemins) expect(d.startsWith("M 0 ")).toBe(true);
  });

  it("les étiquettes sont tabulables — c'est la seule prise du clavier", () => {
    // Les bandes de saisie du SVG ne sont pas focalisables. Sans un vrai
    // <button> par étiquette, isoler une ligne devient impossible au clavier.
    expect(html).toMatch(/<button[^>]*class="palmares-etiquette/);
  });

  it("n'écrit l'étiquette d'arrivée qu'UNE fois sur l'axe des x", () => {
    // `xLabels` porte déjà « 20h » à l'abscisse de l'arrivée ; en ajouter un
    // second l'écrirait exactement par-dessus, et les deux se mélangeraient.
    const axeX = html.split('class="palmares-x"')[1] ?? "";
    const fin = axeX.split("</ul>")[0];
    expect(fin.split(">20h<").length - 1).toBe(1);
  });

  it("ne dessine plus aucune graduation en pointillé sur l'axe des y", () => {
    expect(html).not.toContain("palmares-grille");
    // La verticale d'arrivée, elle, reste : ce n'est pas une graduation.
    expect(html).toContain("palmares-arrivee");
  });
});

describe("le prolongement jusqu'à l'arrivée", () => {
  /** Une journée PARTIELLE : le raffineur n'a publié que jusqu'à midi, comme il
   *  le fait tout au long d'une vraie journée. C'est le cas ordinaire, et celui
   *  où le cadre restait blanc de midi à l'arrivée. */
  function donneesJourneePartielle(blocs: number[]): PartiesData {
    const jours = ["2026-08-25", "2026-08-26", "2026-08-27"];
    const lignes = jours.flatMap((j) =>
      PARTY_KEYS.map((p, i) => ({
        party: p.toUpperCase(),
        date_utc: j,
        date_montreal_tz: j,
        weighted_mentions: 0.3 - i * 0.05,
        total_raw_score: 100 - i * 10,
        weighted_tone: 0,
        computed_at: `${j}T11:31:00Z`,
      })),
    );
    const intra = blocs.flatMap((h, k) =>
      PARTY_KEYS.map((p, i) => ({
        party: p.toUpperCase(),
        date_utc: "2026-08-27",
        date_montreal_tz: "2026-08-27",
        weighted_mentions: 0.3 - i * 0.05,
        total_raw_score: 20 * (k + 1) - i * 3,
        weighted_tone: 0,
        computed_at: "2026-08-27T11:31:00Z",
        block_hour: h,
        block_label: `${h}h`,
      })),
    );
    const calcule = __test__.computeStats(lignes, lignes, lignes)!;
    const chartJour = __test__.buildChartIntraday(intra, [...PARTY_KEYS])!;
    return {
      blocCourant: { date: "2026-08-27", hour: blocs.at(-1)!, label: null },
      ranges: {
        today: __test__.buildRangeView(calcule.stats, "today", calcule.dates, chartJour),
        week: __test__.buildRangeView(calcule.stats, "week", calcule.dates, chartJour),
        overall: __test__.buildRangeView(calcule.stats, "overall", calcule.dates, chartJour),
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

  it("chaque ligne tient son rang à plat jusqu'à l'arrivée", () => {
    // Publié jusqu'à 12h sur un axe qui va à 20h : le prolongement court de 60
    // à 100 (unités du viewBox), et il est HORIZONTAL — un rang tenu, pas une
    // trajectoire devinée.
    const html = renderToStaticMarkup(
      <PartisCouvertureClient data={donneesJourneePartielle([0, 4, 8, 12])} />,
    );
    const attentes = [...html.matchAll(/class="palmares-attente[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    expect(attentes.length).toBe(PARTY_KEYS.length);
    for (const d of attentes) {
      const [, x0, y0, x1, y1] = d.match(/^M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)$/)!;
      expect(Number(x0)).toBeCloseTo(60, 6);
      expect(Number(x1)).toBeCloseTo(100, 6);
      expect(Number(y0)).toBe(Number(y1)); // à plat : le rang est TENU
    }
  });

  it("les étiquettes s'alignent au bout de l'axe, pas au dernier relevé", () => {
    const html = renderToStaticMarkup(
      <PartisCouvertureClient data={donneesJourneePartielle([0, 4, 8, 12])} />,
    );
    const gauches = [...html.matchAll(/class="palmares-etiquette[^"]*" style="[^"]*left:([\d.]+)%/g)]
      .map((m) => Number(m[1]));
    expect(gauches.length).toBe(PARTY_KEYS.length);
    for (const g of gauches) expect(g).toBeCloseTo(100, 6);
  });

  it("ne prolonge RIEN quand la course est courue", () => {
    // Le dernier relevé EST l'arrivée : il n'y a plus rien à tenir, et un
    // tireté au-delà serait une prédiction sans objet.
    const html = renderToStaticMarkup(
      <PartisCouvertureClient data={donneesJourneePartielle([0, 4, 8, 12, 16, 20])} />,
    );
    expect(html).not.toContain("palmares-attente");
    // Et les lignes pleines TOUCHENT l'arrivée.
    const traits = [...html.matchAll(/class="palmares-trait[^"]*" d="([^"]+)"/g)].map((m) => m[1]);
    expect(traits.length).toBe(PARTY_KEYS.length);
    for (const d of traits) expect(d.trim().endsWith(" 100 " + d.trim().split(" ").at(-1))).toBe(true);
  });
});

describe("les deux knobs du palmarès", () => {
  const html = renderToStaticMarkup(<PartisCouvertureClient data={donneesAvecCourbe()} />);
  const panneau = html.split('class="palmares-commandes"')[1]?.split("<figure")[0] ?? "";

  /** Les deux cadrans, dans l'ordre du panneau. */
  const cadrans = [...panneau.matchAll(/<button[^>]*class="knob-cadran"[^>]*aria-label="([^"]*)"/g)]
    .map((m) => m[1]);

  it("deux knobs, au-dessus du graphique", () => {
    // Ils choisissent ce que le palmarès montre : ils appartiennent donc au
    // cadre qui est juste dessous, et non à l'en-tête de section.
    expect(cadrans.length).toBe(2);
    expect(html.indexOf('class="palmares-commandes"')).toBeLessThan(html.indexOf("<figure"));
  });

  it("chaque cadran annonce SA VOIE ET SA POSITION", () => {
    // Un bouton nommé « Mesure » seul ne dirait pas où il en est. C'est le nom
    // accessible qui porte l'information ; l'aiguille la redit en image.
    expect(cadrans[0]).toContain("Mesure");
    expect(cadrans[0]).toContain("Écouté");
    expect(cadrans[1]).toContain("Vitesse");
    expect(cadrans[1]).toContain("Jour");
    for (const nom of cadrans) expect(nom).toContain("Tourner pour changer");
  });

  it("deux crans pour la mesure, trois pour la vitesse", () => {
    // Les crans montrent qu'il y a d'AUTRES positions : sans eux, l'aiguille
    // pointerait dans le vide et rien ne dirait que le bouton tourne.
    const parKnob = panneau.split('class="knob-cadran"').slice(1);
    expect(parKnob.length).toBe(2);
    expect([...parKnob[0].matchAll(/<i[^>]*--a:/g)].length).toBe(2);
    expect([...parKnob[1].matchAll(/<i[^>]*--a:/g)].length).toBe(3);
    // Un seul cran allumé par cadran.
    for (const k of parKnob) expect([...k.matchAll(/class="actif"/g)].length).toBe(1);
  });

  it("l'aiguille POINTE le cran choisi, au degré près", () => {
    // Le cadran balaie 120°, de -60 à +60. Position 0 sur 2 crans = -60° ;
    // position 0 sur 3 crans = -60° aussi. Une aiguille désalignée de son cran
    // ferait mentir la seule information que le knob donne sans mot.
    const aiguilles = [...panneau.matchAll(/class="knob-aiguille"[^>]*--a:(-?[\d.]+)deg/g)]
      .map((m) => Number(m[1]));
    expect(aiguilles.length).toBe(2);
    for (const a of aiguilles) expect(a).toBe(-60);
  });

  it("la position s'écrit AUSSI en toutes lettres", () => {
    // Un angle seul se devine, il ne se lit pas.
    expect(panneau).toContain('class="knob-valeur"');
    expect(panneau).toContain("Écouté");
    expect(panneau).toContain("Jour");
  });

  it("chaque knob se nomme comme le fader se nomme", () => {
    // « Mesure » et « Vitesse » reprennent `.fader-label`, le « Source » du
    // fader : les trois réglages du module se nomment de la même façon.
    const etiquettes = [...panneau.matchAll(/class="fader-label">([^<]+)/g)].map((m) => m[1]);
    expect(etiquettes).toEqual(["Mesure", "Vitesse"]);
  });

  it("l'en-tête ne porte plus d'onglets de période", () => {
    // Ils y vivaient loin de ce qu'ils commandaient, et un onglet ne se tourne
    // pas. C'étaient en plus des `<span>` cliquables, hors d'atteinte du clavier.
    const entete = html.split('class="control-row"')[1]?.split("</div></div>")[0] ?? "";
    expect(entete).not.toContain("legend-toggle");
    expect(entete).not.toContain("cursor:pointer");
  });

  it("le titre VISIBLE annonce la course en cours", () => {
    // Sur le markup entier, « apprécié » apparaît aussi — dans le gabarit
    // invisible qui empêche le titre de se recentrer à chaque bascule.
    const visible = html.match(/course-tete-gabarit"[^>]*>[^<]+<\/span><span>([^<]+)</);
    expect(visible![1]).toContain("le disque le plus écouté");
    expect(visible![1]).not.toContain("apprécié");
  });
});
