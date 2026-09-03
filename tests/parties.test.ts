import { describe, it, expect } from "vitest";
import { __test__, PARTY_KEYS, PARTY_COLORS } from "@/lib/data/parties";

const {
  buildLookup,
  computeStats,
  sparkPoints,
  samplePoints,
  buildRangeView,
  buildChart,
  buildChartIntraday,
  axisTop,
  samediDOuverture,
} = __test__;

/** computeStats renvoie désormais { stats, dates } — les dates servent à
 *  étiqueter l'axe horizontal de la course. */
function statsOf(day: SR[], week: SR[], month: SR[]) {
  const c = computeStats(day, week, month)!;
  return c;
}

type SR = { party: string; date_utc: string; date_montreal_tz: string; weighted_mentions: number; weighted_tone: number; computed_at?: string };

function row(party: string, date: string, mentions: number, tone = 0): SR {
  return { party, date_utc: date, date_montreal_tz: date, weighted_mentions: mentions, weighted_tone: tone };
}

const DATE_A = "2026-06-10";

describe("buildLookup", () => {
  it("indexe par date puis parti en minuscules", () => {
    const lut = buildLookup([row("PLQ", DATE_A, 0.4)]);
    expect(lut[DATE_A]["plq"].mentions).toBeCloseTo(0.4);
  });
  it("garde le relevé le PLUS RÉCENT en cas de doublon (date, parti)", () => {
    // Décisif dès que le raffineur publiera plusieurs relevés par jour : la
    // série quotidienne doit prendre la valeur accumulée de fin de journée,
    // pas un instantané intermédiaire arrivé en premier dans le fichier.
    const lut = buildLookup([
      { ...row("caq", DATE_A, 0.5), computed_at: `${DATE_A}T12:00:00Z` },
      { ...row("caq", DATE_A, 0.9), computed_at: `${DATE_A}T20:00:00Z` },
    ]);
    expect(lut[DATE_A]["caq"].mentions).toBeCloseTo(0.9);
  });

  it("l'ordre du fichier ne change rien : c'est computed_at qui tranche", () => {
    const lut = buildLookup([
      { ...row("caq", DATE_A, 0.9), computed_at: `${DATE_A}T20:00:00Z` },
      { ...row("caq", DATE_A, 0.5), computed_at: `${DATE_A}T12:00:00Z` },
    ]);
    expect(lut[DATE_A]["caq"].mentions).toBeCloseTo(0.9);
  });
});

describe("computeStats", () => {
  it("renvoie null quand les trois fichiers sont vides", () => {
    expect(computeStats([], [], [])).toBeNull();
  });
  it("renvoie null si l'un des fichiers est vide", () => {
    const rows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2));
    expect(computeStats(rows, [], rows)).toBeNull();
  });
  it("renvoie une stat par parti et des SOV qui somment à ~1", () => {
    const dayRows = [
      row("caq", DATE_A, 0.43), row("pq", DATE_A, 0.26),
      row("qs",  DATE_A, 0.18), row("plq", DATE_A, 0.09), row("pcq", DATE_A, 0.04),
    ];
    const { stats } = statsOf(dayRows, dayRows, dayRows);
    expect(stats.length).toBe(PARTY_KEYS.length);
    const sumToday = stats.reduce((s, st) => s + st.sov.today, 0);
    expect(sumToday).toBeCloseTo(1, 5);
  });
});

describe("buildRangeView", () => {
  it("met en sourdine le DERNIER du classement, quelle que soit sa part", () => {
    const dayRows = [
      row("caq", DATE_A, 0.60), row("pq",  DATE_A, 0.25),
      row("qs",  DATE_A, 0.10), row("plq", DATE_A, 0.04), row("pcq", DATE_A, 0.01),
    ];
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    // Le dernier, et LUI SEUL : la sourdine est un rang, plus un seuil. À 4 %,
    // le PLQ reste actif alors que l'ancien seuil de 5 % l'aurait éteint — sans
    // quoi il ne resterait pas toujours quatre decks à remplir.
    expect(view.rows.find((r) => r.key === "pcq")!.inShadow).toBe(true);
    expect(view.rows.find((r) => r.key === "plq")!.inShadow).toBe(false);
    expect(view.rows.find((r) => r.key === "qs")!.inShadow).toBe(false);
  });

  it("met en sourdine TOUS les ex æquo du plus bas", () => {
    const dayRows = [
      row("caq", DATE_A, 0.50), row("pq",  DATE_A, 0.28),
      row("qs",  DATE_A, 0.16), row("plq", DATE_A, 0.03), row("pcq", DATE_A, 0.03),
    ];
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    // Départager deux néants donnerait un classement que la donnée ne soutient
    // pas : les deux passent en sourdine, et un deck reste vide.
    expect(view.rows.find((r) => r.key === "plq")!.inShadow).toBe(true);
    expect(view.rows.find((r) => r.key === "pcq")!.inShadow).toBe(true);
    expect(view.rows.filter((r) => !r.inShadow)).toHaveLength(3);
  });
  it("barWidthPct est dans [0, 100] pour tous les partis", () => {
    const dayRows = PARTY_KEYS.map((p, i) => row(p, DATE_A, [0.5, 0.25, 0.15, 0.07, 0.03][i]));
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    for (const r of view.rows) {
      expect(r.barWidthPct).toBeGreaterThanOrEqual(0);
      expect(r.barWidthPct).toBeLessThanOrEqual(100);
    }
  });
  it("showLeaderLabel uniquement pour le premier parti non-ombre", () => {
    const dayRows = [
      row("caq", DATE_A, 0.60), row("pq",  DATE_A, 0.25),
      row("qs",  DATE_A, 0.10), row("plq", DATE_A, 0.04), row("pcq", DATE_A, 0.01),
    ];
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    const leaders = view.rows.filter((r) => r.showLeaderLabel);
    expect(leaders.length).toBe(1);
    expect(leaders[0].key).toBe("caq");
  });
  it("toneDirection est positive, negative ou neutral", () => {
    const dayRows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2, 0.1));
    const { stats, dates } = statsOf(dayRows, dayRows, dayRows);
    const view = buildRangeView(stats, "today", dates);
    for (const r of view.rows) {
      expect(["positive", "negative", "neutral"]).toContain(r.toneDirection);
    }
  });
});

describe("buildChart — la course", () => {
  // ⚠️ Dates DANS la campagne. Depuis que `ELECTION_CALL_DATE` est renseignée
  // (2026-08-27), la fenêtre « overall » commence au déclenchement : des
  // fixtures de juin en sortaient entièrement et la courbe naissait vide.
  // Ces tests portent sur la GÉOMÉTRIE du graphique, pas sur la fenêtre.
  const DATES = ["2026-08-28", "2026-08-29", "2026-08-30"];
  /** Cinq partis sur trois jours, parts de voix stables et bien séparées. */
  function threeDays(): SR[] {
    const vals: Record<string, number> = { caq: 0.4, pq: 0.3, qs: 0.15, plq: 0.1, pcq: 0.05 };
    return DATES.flatMap((d) => PARTY_KEYS.map((p) => row(p, d, vals[p])));
  }

  it("place toutes les lignes sur UNE échelle commune : à part de voix égale, même hauteur", () => {
    const rows = DATES.flatMap((d) => PARTY_KEYS.map((p) => row(p, d, 0.2)));
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, dates, "overall");
    const ys = chart.series.map((s) => s.lastY);
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 6);
  });

  it("un parti deux fois plus couvert est deux fois plus haut au-dessus de zéro", () => {
    const rows = DATES.flatMap((d) => [
      row("caq", d, 0.4), row("pq", d, 0.2),
      row("qs", d, 0.2), row("plq", d, 0.1), row("pcq", d, 0.1),
    ]);
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, dates, "overall");
    const caq = chart.series.find((s) => s.key === "caq")!;
    const pq = chart.series.find((s) => s.key === "pq")!;
    // y est mesuré depuis le HAUT du viewBox : la hauteur au-dessus de zéro
    // vaut donc (height - y). C'est ELLE qui doit doubler, pas y.
    expect(chart.height - caq.lastY).toBeCloseTo(2 * (chart.height - pq.lastY), 6);
  });

  it("l'axe vertical plafonne au-dessus du maximum observé, jamais en dessous", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, dates, "overall");
    const leader = chart.series[0];
    expect(leader.lastY).toBeGreaterThanOrEqual(0);
    expect(leader.lastPct).toBe(40);
  });

  it("axisTop : tronqué au-dessus du maximum observé, plancher à 20 %", () => {
    expect(axisTop(4)).toBe(20);
    expect(axisTop(35)).toBe(40);
    expect(axisTop(40)).toBe(40);
  });

  it("les lignes sont triées par part de voix décroissante", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, dates, "overall");
    const pcts = chart.series.map((s) => s.lastPct);
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a));
  });

  it("une seule date ⇒ tooShort, pour que le composant n'affiche pas une « courbe » d'un point", () => {
    const rows = PARTY_KEYS.map((p) => row(p, DATE_A, 0.2));
    const { stats, dates } = statsOf(rows, rows, rows);
    expect(buildChart(stats, dates, "overall").tooShort).toBe(true);
  });

  it("écarte les étiquettes de partis au coude à coude, sans déplacer les points", () => {
    // Course serrée : quatre partis en un point d'écart. Sans répulsion, les
    // quatre étiquettes se superposeraient.
    const rows = DATES.flatMap((d) => [
      row("caq", d, 0.251), row("pq", d, 0.250),
      row("qs", d, 0.249), row("plq", d, 0.248), row("pcq", d, 0.002),
    ]);
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, dates, "overall");

    const serres = chart.series.filter((s) => s.lastPct >= 20);
    expect(serres.length).toBe(4);
    for (let i = 1; i < serres.length; i++) {
      expect(serres[i].labelY - serres[i - 1].labelY).toBeGreaterThanOrEqual(4.19);
    }
    // Les points, eux, restent sur la donnée : presque confondus.
    const ys = serres.map((s) => s.lastY);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });

  it("les étiquettes restent dans le cadre même quand tout le monde est au plancher", () => {
    const rows = DATES.flatMap((d) => PARTY_KEYS.map((p) => row(p, d, 0.2)));
    const { stats, dates } = statsOf(rows, rows, rows);
    const chart = buildChart(stats, dates, "overall");
    for (const s of chart.series) {
      expect(s.labelY).toBeGreaterThanOrEqual(0);
      expect(s.labelY).toBeLessThanOrEqual(chart.height);
    }
  });

  it("étiquette l'axe en jj/mm sur toute la période, jusqu'au scrutin", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, dates, "overall");
    // L'axe se construit sur le TEMPS et non sur les dates publiées : il court
    // jusqu'au scrutin, donc bien au-delà des trois jours de données.
    expect(chart.xLabels.length).toBeGreaterThan(2);
    for (const l of chart.xLabels) expect(l.label).toMatch(/^\d{2}\/\d{2}$/);
    expect(chart.xLabels.at(-1)!.x).toBeGreaterThan(chart.xLabels[0].x);
  });

  it("étiquette la semaine en SEPT jours, fin de semaine comprise", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, dates, "week");

    // LA RÉGRESSION QUE CE TEST VERROUILLE. La semaine allait du lundi au
    // vendredi et n'en montrait donc que cinq : les repères s'arrêtent à
    // l'arrivée, et samedi comme dimanche tombaient au-delà. En OUVRANT la
    // semaine le samedi, la fin de semaine passe avant l'arrivée et les sept
    // jours tiennent — sans que le vendredi 20h bouge.
    expect(chart.xLabels.map((l) => l.label)).toEqual([
      "sam.", "dim.", "lun.", "mar.", "mer.", "jeu.", "vendredi",
    ]);

    // Les six premiers écarts valent 24 h ; l'axe est donc régulier, et ce qui
    // reste entre dimanche 00h et l'arrivée est le reste de la journée.
    // Tolérance d'un centième : les abscisses sont arrondies à deux décimales
    // avant d'être publiées, et l'écart hérite donc de cet arrondi.
    const ecarts = chart.xLabels.slice(1).map((l, i) => l.x - chart.xLabels[i].x);
    for (const e of ecarts) expect(Math.abs(e - ecarts[0])).toBeLessThanOrEqual(0.02);

    // LE VENDREDI TOMBE SUR LA LIGNE D'ARRIVÉE, et non vingt heures avant elle.
    // Les repères étaient posés au minuit de chaque journée alors que l'arrivée
    // est à 20 h : l'axe se lisait comme mal calé, et le dernier intervalle
    // valait 44 h contre 24 h partout ailleurs. Repères et arrivée sont
    // maintenant sur les mêmes éditions de 20 h.
    expect(chart.xLabels.at(-1)!.label).toBe("vendredi");
    expect(chart.xLabels.at(-1)!.x).toBeCloseTo(chart.finish.x, 6);
  });

  it("la ligne d'arrivée touche le bord DROIT, sur les trois vues", () => {
    // `CHART_PAD_R` réservait 9 % au-delà de l'arrivée pour loger les étiquettes
    // de bout de ligne. Elles vivent maintenant dans `--marge-fin`, hors de la
    // zone de tracé : la réserve faisait double emploi, et le vide qu'elle
    // laissait après l'arrivée se lisait comme du chemin restant à courir alors
    // que la course y était finie.
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    for (const vue of ["today", "week", "overall"] as const) {
      const chart = buildChart(stats, dates, vue);
      expect(chart.finish.x, vue).toBeCloseTo(chart.width, 6);
    }
  });
});

describe("la seconde course — le disque le plus APPRÉCIÉ", () => {
  // Dates DANS la campagne (`ELECTION_CALL_DATE` = 2026-08-27) : la fenêtre
  // « overall » écarte tout ce qui la précède (voir plus bas « le portrait
  // global part du déclenchement du scrutin ») — sans ce décalage, ces trois
  // jours sortaient entièrement et les séries naissaient vides.
  const JOURS = ["2026-08-27", "2026-08-28", "2026-08-29"];
  const mk = (party: string, date: string, minutes: number, part: number, ton: number) => ({
    party, date_utc: date, date_montreal_tz: date,
    weighted_mentions: part, weighted_tone: ton, total_raw_score: minutes,
  });

  /** La CAQ occupe le plus de Une et y récolte le pire ton ; le PLQ l'inverse.
   *  Les trois autres partis n'ont AUCUNE ligne : ils n'ont donc pas de ton, et
   *  c'est tout l'objet de la moitié des tests ci-dessous. */
  function jeu() {
    return JOURS.flatMap((d) => [
      mk("caq", d, 300, 0.75, -0.40),
      mk("plq", d, 100, 0.25, 0.35),
    ]);
  }

  it("la piste du TON suit les abscisses des minutes, là où il y en a", () => {
    const { stats, dates } = statsOf(jeu(), jeu(), jeu());
    const chart = buildChart(stats, dates, "overall");
    for (const cle of ["caq", "plq"] as const) {
      const s = chart.series.find((x) => x.key === cle)!;
      const xMin = s.polylineMin.split(" ").map((p) => p.split(",")[0]);
      const xTon = s.polylineTon.split(" ").map((p) => p.split(",")[0]);
      // Basculer d'une course à l'autre ne déplace aucun point sur l'axe du
      // temps : seules les hauteurs changent.
      expect(xTon).toEqual(xMin);
    }
  });

  it("un TON FAVORABLE donne un bon rang — l'ordonnée est inversée", () => {
    const { stats, dates } = statsOf(jeu(), jeu(), jeu());
    const chart = buildChart(stats, dates, "overall");
    const derY = (cle: string, piste: "polylineMin" | "polylineTon") =>
      Number(chart.series.find((s) => s.key === cle)![piste].split(" ").at(-1)!.split(",")[1]);

    // La CAQ mène la course À L'ÉCOUTE (y plus petit)…
    expect(derY("caq", "polylineMin")).toBeLessThan(derY("plq", "polylineMin"));
    // … et la perd à L'APPRÉCIATION. Les deux classements sont inversés, ce que
    // le graphique ne pourrait pas montrer avec une seule piste.
    expect(derY("caq", "polylineTon")).toBeGreaterThan(derY("plq", "polylineTon"));
  });

  it("publie un ÉCART AUX AUTRES PARTIS, jamais un score absolu", () => {
    // « +35 % de mots favorables » ne dit rien à un lecteur sans repère.
    // L'écart en fournit un, et la référence EXCLUT le parti lui-même : comparé
    // à une moyenne qui le contient, il se comparerait en partie à lui-même.
    const { stats, dates } = statsOf(jeu(), jeu(), jeu());
    const chart = buildChart(stats, dates, "overall");
    // Deux partis mesurés : chacun a l'autre pour seule référence.
    expect(chart.series.find((s) => s.key === "plq")!.lastEcartTon).toBeCloseTo(0.35 - -0.4, 3);
    expect(chart.series.find((s) => s.key === "caq")!.lastEcartTon).toBeCloseTo(-0.4 - 0.35, 3);
  });

  it("un parti dont on n'a PAS parlé n'a pas de ton, et pas un ton neutre", () => {
    // LE DÉFAUT CORRIGÉ. Le raffineur écrit `weighted_tone = 0` pour un parti
    // sans article, valeur indistinguable d'une couverture équilibrée : le
    // module le classait au MILIEU du peloton, au-dessus de partis réellement
    // malmenés. Les minutes tranchent — zéro minute, aucune phrase à classer.
    const { stats, dates } = statsOf(jeu(), jeu(), jeu());
    const chart = buildChart(stats, dates, "overall");
    for (const cle of PARTY_KEYS.filter((k) => k !== "caq" && k !== "plq")) {
      const s = chart.series.find((x) => x.key === cle)!;
      expect(s.lastEcartTon, `${cle} : sans couverture`).toBeNull();
      // Et rien n'est tracé : lui donner une place inventerait un classement.
      expect(s.polylineTon).toBe("");
    }
  });

  it("un parti sans couverture ne sert pas non plus de RÉFÉRENCE", () => {
    // Son zéro tirerait la moyenne des autres vers le neutre, et tasserait
    // l'écart de tout le monde.
    const { stats, dates } = statsOf(jeu(), jeu(), jeu());
    const chart = buildChart(stats, dates, "overall");
    // Si les trois silencieux comptaient, la référence du PLQ vaudrait
    // (-0,4 + 0 + 0 + 0) / 4 et l'écart serait bien plus petit.
    const siLesMuetsComptaient = 0.35 - (-0.4 + 0 + 0 + 0) / 4;
    expect(chart.series.find((s) => s.key === "plq")!.lastEcartTon).not.toBeCloseTo(
      siLesMuetsComptaient,
      3,
    );
  });

  it("un ton hors de [-1, 1] est BORNÉ plutôt que tracé hors cadre", () => {
    // Sur de très petits volumes la mesure peut sortir de l'intervalle. Un point
    // hors du cadre se lirait comme une erreur de tracé, pas comme un extrême.
    const fous = JOURS.flatMap((d) => [mk("caq", d, 300, 0.75, 4), mk("plq", d, 100, 0.25, -9)]);
    const { stats, dates } = statsOf(fous, fous, fous);
    const chart = buildChart(stats, dates, "overall");
    for (const s of chart.series.filter((x) => x.polylineTon !== "")) {
      for (const point of s.polylineTon.split(" ")) {
        const y = Number(point.split(",")[1]);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(chart.height);
      }
    }
  });

  it("l'infobulle du ton ne prétend PLUS compter des mots", () => {
    // Elle a annoncé « Proportion nette de mots favorables » jusqu'au
    // 2026-08-31. Aucun mot n'est compté nulle part : le raffineur classe des
    // PHRASES et pondère par la confiance puis par les minutes en Une. Un
    // journaliste citant l'ancienne phrase aurait décrit une méthode qui
    // n'existe pas.
    const { stats, dates } = statsOf(jeu(), jeu(), jeu());
    const vue = buildRangeView(stats, "overall", dates);
    const titre = vue.rows[0].toneTitle;
    expect(titre).not.toContain("mots favorables");
    expect(titre).not.toContain("Proportion nette");
    expect(titre).toContain("phrases qui nomment le parti");
    expect(titre).toContain("temps passé en Une");
    // Et l'échelle est dite, sans quoi le nombre reste illisible.
    expect(titre).toMatch(/échelle de .1 .défavorable. à \+1 .favorable./);
  });
});

describe("les graduations des trois vues", () => {
  /** Une ligne intra-journée, telle que le raffineur la publie. */
  const bloc = (party: string, h: number, minutes: number) => ({
    party,
    date_utc: "2026-08-27",
    date_montreal_tz: "2026-08-27",
    weighted_mentions: minutes / 1000,
    total_raw_score: minutes,
    weighted_tone: 0,
    computed_at: "2026-08-27T19:32:58Z",
    block_hour: h,
    block_label: `${h}h`,
  });

  it("Jour : six repères de quatre heures, de minuit à l'arrivée", () => {
    const rows = [7, 11].flatMap((h) =>
      PARTY_KEYS.map((p, i) => bloc(p.toUpperCase(), h, 100 * h - i * 10)),
    );
    const chart = buildChartIntraday(rows, [...PARTY_KEYS])!;
    expect(chart.xLabels.map((l) => l.label)).toEqual(["00h", "04h", "08h", "12h", "16h", "20h"]);
    expect(chart.finish.label).toBe("20h");
  });

  it("Jour : un bloc bâtard se pose sur la graduation de FIN de sa période", () => {
    // Un bloc se lit à la FIN de sa période. `surLaGraduation` cale d'abord une
    // heure bâtarde sur la grille (7h → 8h, 11h → 12h), puis on ajoute les
    // quatre heures de la période : 7h → 12h, 11h → 16h. Vers la fin, jamais
    // vers le début — dater le point d'avant les heures qu'il couvre le
    // vieillirait à tort.
    const rows = [7, 11].flatMap((h) =>
      PARTY_KEYS.map((p, i) => bloc(p.toUpperCase(), h, 100 * h - i * 10)),
    );
    const chart = buildChartIntraday(rows, [...PARTY_KEYS])!;
    const graduations = new Set(chart.xLabels.map((l) => l.x));

    // TOUT point tracé tombe sur un repère de l'axe, sans exception.
    for (const serie of chart.series) {
      const xs = serie.polylineMin.split(" ").map((p) => Number(p.split(",")[0]));
      expect(xs.length).toBe(2);
      for (const x of xs) expect(graduations).toContain(x);
    }
    // 7h → 12h et 11h → 16h : les deux repères visés, et pas d'autres.
    const x12 = chart.xLabels.find((l) => l.label === "12h")!.x;
    const x16 = chart.xLabels.find((l) => l.label === "16h")!.x;
    const xs = chart.series[0].polylineMin.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs).toEqual([x12, x16]);
  });

  it("Jour : deux blocs bâtards sur la même graduation gardent le PLUS RÉCENT", () => {
    // 9h et 11h remontent tous deux à 12h. La mesure cumulant depuis minuit,
    // c'est celle de 11h qui est complète — donc la plus grande.
    const rows = [
      ...PARTY_KEYS.map((p) => bloc(p.toUpperCase(), 3, 100)),
      ...PARTY_KEYS.map((p) => bloc(p.toUpperCase(), 11, 900)),
      ...PARTY_KEYS.map((p) => bloc(p.toUpperCase(), 9, 400)),
    ];
    const chart = buildChartIntraday(rows, [...PARTY_KEYS])!;
    // Deux points seulement : 3h → 04h, et 9h comme 11h → 12h.
    const xs = chart.series[0].polylineMin.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs.length).toBe(2);
    expect(chart.series[0].lastMinutes).toBe(900);
  });

  it("Période : des repères réguliers, tous distincts", () => {
    const vals: Record<string, number> = { caq: 0.4, pq: 0.3, qs: 0.15, plq: 0.1, pcq: 0.05 };
    const jours = ["2026-08-25", "2026-08-26", "2026-08-27"];
    const quotidien = () => jours.flatMap((d) => PARTY_KEYS.map((k) => row(k, d, vals[k])));
    const { stats, dates } = statsOf(quotidien(), quotidien(), quotidien());
    const chart = buildChart(stats, dates, "overall");
    const xs = chart.xLabels.map((l) => l.x);
    // Strictement croissants, donc jamais deux repères l'un sur l'autre.
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    // Et aucun libellé répété : sur une fenêtre courte, six repères pourraient
    // retomber deux fois sur la même journée.
    expect(new Set(chart.xLabels.map((l) => l.label)).size).toBe(chart.xLabels.length);
  });
});

describe("sparkPoints / samplePoints", () => {
  it("sparkPoints: liste vide -> []", () => {
    expect(sparkPoints([], 100, 30)).toEqual([]);
  });
  it("sparkPoints: une seule valeur -> centrée horizontalement", () => {
    const pts = sparkPoints([0.5], 100, 30);
    expect(pts.length).toBe(1);
    expect(pts[0][0]).toBe(50);
  });
  it("samplePoints: retourne au plus n points", () => {
    const pts: [number, number][] = Array.from({ length: 20 }, (_, i) => [i, i] as [number, number]);
    expect(samplePoints(pts, 7).length).toBe(7);
  });
  it("samplePoints: inclut toujours le dernier point", () => {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [i, i] as [number, number]);
    const sampled = samplePoints(pts, 4);
    expect(sampled[sampled.length - 1]).toEqual(pts[pts.length - 1]);
  });
});

describe("le portrait global", () => {
  // Même contrainte que ci-dessus, en gardant l'espacement INÉGAL (6 jours puis
  // 6) qui est tout l'objet du test sur le placement des points.
  const DAYS = ["2026-08-27", "2026-09-02", "2026-09-08"];
  function rows(): SR[] {
    const v: Record<string, number> = { caq: 0.4, pq: 0.3, qs: 0.15, plq: 0.1, pcq: 0.05 };
    return DAYS.flatMap((d) => PARTY_KEYS.map((p) => row(p, d, v[p])));
  }

  it("chaque onglet a sa propre ligne d'arrivée", () => {
    const { stats, dates } = statsOf(rows(), rows(), rows());
    expect(buildChart(stats, dates, "overall").finish.label).toBe("Scrutin");
    expect(buildChart(stats, dates, "week").finish.label).toBe("vendredi");
    expect(buildChart(stats, dates, "week").finish.sub).toBe("20 h");
    expect(buildChart(stats, dates, "today").finish.sub).toBe("20 h");
  });

  it("laisse la donnée s'arrêter bien avant le scrutin — le vide est l'information", () => {
    const { stats, dates } = statsOf(rows(), rows(), rows());
    const chart = buildChart(stats, dates, "overall");
    const finDonnee = Math.max(...chart.series.map((s) => s.lastX));
    // 13 août → 5 octobre : la donnée doit occuper nettement moins que l'axe.
    expect(finDonnee).toBeLessThan(chart.finish.x * 0.6);
  });

  it("place les points selon la DATE et non selon leur rang", () => {
    // Trois dates inégalement espacées : 27 août, 2 et 8 septembre. Le point du
    // milieu doit tomber à mi-chemin, pas au tiers comme le voudrait un rang.
    const { stats, dates } = statsOf(rows(), rows(), rows());
    const chart = buildChart(stats, dates, "overall");
    const xs = chart.series[0].polyline.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs.length).toBe(3);
    expect((xs[1] - xs[0]) / (xs[2] - xs[0])).toBeCloseTo(0.5, 2);
  });

  it("le podium moyenne la période, la courbe montre la dernière journée", () => {
    // Les deux nombres diffèrent désormais LÉGITIMEMENT : le podium annonce la
    // moyenne de la période choisie, la courbe le dernier point. C'est pour ça
    // que le podium n'affiche plus de pourcentage — deux chiffres différents
    // côte à côte, sans explication, était la confusion à éviter.
    const { stats, dates } = statsOf(rows(), rows(), rows());
    const view = buildRangeView(stats, "overall", dates);
    const chart = buildChart(stats, dates, "overall");
    expect(chart.series.map((s) => s.key).sort()).toEqual(
      view.rows.map((r) => r.key).sort(),
    );
  });
});

describe("palette des partis — accord avec le module Assemblée", () => {
  // Les couleurs vivent à deux endroits : PARTY_COLORS (TypeScript, pour la
  // course) et `.parti-name-box.*` (CSS, pour l'alignement de l'Assemblée). Un
  // lecteur qui passe d'un module à l'autre doit suivre les mêmes couleurs, et
  // rien dans le code ne l'impose. Ce test le fait : modifier un côté sans
  // l'autre échoue ici plutôt que de se voir sur le site publié.
  it("PARTY_COLORS et .parti-name-box déclarent exactement les mêmes teintes", async () => {
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("app/globals.css", "utf8");

    const duCss = new Map<string, string>();
    for (const m of css.matchAll(
      /\.parti-name-box\.(\w+)\s*\{\s*--party:\s*(#[0-9A-Fa-f]{6})/g,
    )) {
      duCss.set(m[1], m[2].toUpperCase());
    }

    expect(duCss.size).toBe(PARTY_KEYS.length);
    for (const key of PARTY_KEYS) {
      expect(duCss.get(key), `couleur CSS manquante pour ${key}`).toBe(
        PARTY_COLORS[key].toUpperCase(),
      );
    }
  });
});

/** L'état « le module n'a rien à dire » doit distinguer deux causes que le
 *  module confondait : le silence des médias et la panne de notre mesure.
 *  C'est la seule chose qui l'autorise à parler au présent (aws-refiners#223). */
describe("detecterIndisponibilite", () => {
  const { detecterIndisponibilite } = __test__;
  const AUJOURDHUI = "2026-08-16";

  it("ne signale rien quand la série est fraîche et porte du signal", () => {
    const rows = [row("caq", AUJOURDHUI, 0.6), row("pq", AUJOURDHUI, 0.4)];
    expect(detecterIndisponibilite(rows, AUJOURDHUI, AUJOURDHUI)).toBeNull();
  });

  it("déclare la série périmée au-delà de 3 jours sans publication", () => {
    const rows = [row("caq", "2026-07-31", 1)];
    const info = detecterIndisponibilite(rows, "2026-07-31", AUJOURDHUI)!;
    expect(info.raison).toBe("perimee");
    expect(info.joursDeRetard).toBe(16);
  });

  it("tolère un retard court : la table est republiée plusieurs fois par jour", () => {
    const rows = [row("caq", "2026-08-14", 1)];
    expect(detecterIndisponibilite(rows, "2026-08-14", AUJOURDHUI)).toBeNull();
  });

  it("déclare le recalibrage quand la série est fraîche mais entièrement à zéro", () => {
    // C'est l'état que produit le garde-fou du raffineur : il publie tous les
    // jours, mais le modèle ne détecte plus aucun parti.
    const rows = PARTY_KEYS.map((k) => row(k, AUJOURDHUI, 0));
    const info = detecterIndisponibilite(rows, AUJOURDHUI, AUJOURDHUI)!;
    expect(info.raison).toBe("recalibrage");
    expect(info.lastDateLabel).toContain("2026");
  });

  it("ne crie pas au recalibrage pour un simple jour creux", () => {
    // Un jour à zéro au milieu d'une fenêtre qui porte du signal reste un fait
    // sur les médias, pas une panne : la console le dit avec son état vide.
    const rows = [row("caq", "2026-08-14", 0.7), ...PARTY_KEYS.map((k) => row(k, AUJOURDHUI, 0))];
    expect(detecterIndisponibilite(rows, AUJOURDHUI, AUJOURDHUI)).toBeNull();
  });

  it("une archive n'est pas périmée : elle se juge à SA date d'édition", () => {
    // Sans cela, toute édition passée afficherait un bandeau de panne.
    const rows = [row("caq", "2026-06-30", 0.8)];
    expect(detecterIndisponibilite(rows, "2026-06-30", "2026-06-30")).toBeNull();
  });
});


describe("la semaine du palmarès — samedi → vendredi", () => {
  /** ⚠️ CE BLOC A CHANGÉ DE SENS LE 2026-08-30, ET IL FAUT LE SAVOIR.
   *
   *  Il verrouillait la correction de la PR #539 : l'axe du palmarès ouvrait la
   *  semaine le SAMEDI, il cumulait donc deux jours que la table hebdomadaire du
   *  raffineur n'agrège pas — elle part du LUNDI
   *  (`week_start = 1`, radar-party-score-salient-shadow/runtime.R:269-302) — et
   *  la pochette annonçait 14h40 quand le palmarès finissait à 17h16 pour le
   *  même parti, sur le même écran.
   *
   *  L'ouverture au samedi a été REDEMANDÉE, pour que la fin de semaine
   *  apparaisse sur un axe dont l'arrivée reste le vendredi 20h. La divergence
   *  serait revenue avec elle — le palmarès cumulant samedi et dimanche, la
   *  pochette non.
   *
   *  ELLE N'A PLUS DE SURFACE OÙ SE VOIR. Le palmarès classe désormais sur les
   *  minutes DU JOUR et non sur leur cumul (cf. `minOf`), parce qu'un cumul
   *  verrouille l'ordre et qu'un graphique de rangs sans croisement ne montre
   *  rien. Il ne publie donc plus aucun total de période : sa dernière valeur
   *  est celle du dernier jour publié, et il n'y a plus deux totaux de semaine
   *  à confronter sur un même écran. Le choix de la borne d'ouverture est
   *  redevenu une question d'AXE, sans conséquence sur un chiffre.
   */
  it("samediDOuverture tombe un samedi, y compris quand on part d'un samedi", () => {
    for (const jour of ["2026-08-15", "2026-08-17", "2026-08-21", "2026-08-22"]) {
      const t = samediDOuverture(Date.parse(`${jour}T14:00:00Z`));
      expect(new Date(t).getUTCDay(), `${jour} → ${new Date(t).toISOString()}`).toBe(6);
      expect(t).toBeLessThanOrEqual(Date.parse(`${jour}T00:00:00Z`));
    }
  });

  it("le palmarès ne publie AUCUN total de période, donc ne peut plus contredire la pochette", () => {
    // Le SAMEDI et le DIMANCHE qui précèdent sont présents et non nuls : sans
    // eux, ouvrir l'axe deux jours trop tôt n'ajoute rien et le test ne prouve
    // rien. C'est précisément ce qui rendait la régression invisible.
    const AVANT = ["2026-08-15", "2026-08-16"];
    // Lundi 2026-08-17 au vendredi 2026-08-21, 5 jours, minutes connues.
    const JOURS = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"];
    const MIN: Record<string, number[]> = {
      caq: [120, 90, 140, 60, 100],
      plq: [60, 80, 40, 70, 50],
    };
    const AVANT_MIN: Record<string, number[]> = { caq: [200, 180], plq: [90, 110] };
    const mk = (party: string, date: string, minutes: number, part: number) => ({
      party, date_utc: date, date_montreal_tz: date,
      weighted_mentions: part, weighted_tone: 0, total_raw_score: minutes,
    });

    const jours = [
      ...AVANT.flatMap((d, i) => {
        const tot = AVANT_MIN.caq[i] + AVANT_MIN.plq[i];
        return [mk("caq", d, AVANT_MIN.caq[i], AVANT_MIN.caq[i] / tot),
                mk("plq", d, AVANT_MIN.plq[i], AVANT_MIN.plq[i] / tot)];
      }),
      ...JOURS.flatMap((d, i) => {
        const tot = MIN.caq[i] + MIN.plq[i];
        return [mk("caq", d, MIN.caq[i], MIN.caq[i] / tot), mk("plq", d, MIN.plq[i], MIN.plq[i] / tot)];
      }),
    ];
    // La table semaine, telle que le raffineur la produit : la somme des jours.
    const sCaq = MIN.caq.reduce((a, b) => a + b, 0);
    const sPlq = MIN.plq.reduce((a, b) => a + b, 0);
    const semaine = [
      mk("caq", JOURS.at(-1)!, sCaq, sCaq / (sCaq + sPlq)),
      mk("plq", JOURS.at(-1)!, sPlq, sPlq / (sCaq + sPlq)),
    ];

    const c = computeStats(jours as never, semaine as never, semaine as never)!;
    const vue = buildRangeView(c.stats, "week", c.dates);

    // LA POCHETTE lit la table hebdomadaire du raffineur, qui part du lundi.
    expect(vue.rows[0].minutesUne).toBe(sCaq);

    // LE PALMARÈS affiche la valeur du DERNIER JOUR, pas un total. Les deux
    // nombres ne sont donc plus la même grandeur, et l'un ne peut plus démentir
    // l'autre — quelle que soit la borne d'ouverture de l'axe.
    for (const cle of ["caq", "plq"] as const) {
      const serie = vue.chart.series.find((s) => s.key === cle)!;
      expect(serie.lastMinutes, `${cle} : dernier jour`).toBe(MIN[cle].at(-1));
    }

    // Et le libellé dit ce que ce nombre couvre, sans quoi il se lirait comme
    // un total de semaine.
    expect(vue.chart.mesureLabel).toMatch(/^le \d/);
  });

  it("le classement de la semaine bouge d'un jour à l'autre", () => {
    // La raison d'être du changement : un cumul VERROUILLE l'ordre, et un
    // graphique de rangs sans croisement ne montre rien. Ici la CAQ mène les
    // deux premiers jours, le PLQ le troisième — le classement doit suivre.
    // Dates DANS la campagne (`ELECTION_CALL_DATE` = 2026-08-27), sans quoi
    // `buildChart(..., "overall")` les écarte toutes et les séries naissent
    // vides.
    const JOURS = ["2026-08-27", "2026-08-28", "2026-08-29"];
    const MINUTES: Record<string, number[]> = { caq: [200, 200, 10], plq: [50, 50, 400] };
    const mk = (party: string, date: string, minutes: number, part: number) => ({
      party, date_utc: date, date_montreal_tz: date,
      weighted_mentions: part, weighted_tone: 0, total_raw_score: minutes,
    });
    const jours = JOURS.flatMap((d, i) => {
      const tot = MINUTES.caq[i] + MINUTES.plq[i];
      return [mk("caq", d, MINUTES.caq[i], MINUTES.caq[i] / tot),
              mk("plq", d, MINUTES.plq[i], MINUTES.plq[i] / tot)];
    });

    const c = computeStats(jours as never, jours as never, jours as never)!;
    const chart = buildChart(c.stats, c.dates, "overall");
    const yDe = (cle: string) =>
      chart.series.find((s) => s.key === cle)!.polylineMin.split(" ").map((p) => Number(p.split(",")[1]));

    const caq = yDe("caq");
    const plq = yDe("plq");
    // `y` est l'ordonnée SVG, donc INVERSE de la durée : plus petit = devant.
    expect(caq.at(-3)!).toBeLessThan(plq.at(-3)!);
    expect(caq.at(-1)!).toBeGreaterThan(plq.at(-1)!);
  });

  it("les enjeux non fournis se déclarent tels quels, au lieu de « aucun »", () => {
    // Les vues par média ne reçoivent pas la carte des enjeux : le raffineur ne
    // croise pas parti × enjeu × média. `enjeux: []` s'y lisait « Aucun enjeu
    // identifié », une affirmation sur la couverture au lieu d'un aveu sur la
    // mesure.
    const j = [
      { party: "caq", date_utc: "2026-08-21", date_montreal_tz: "2026-08-21", weighted_mentions: 0.6, weighted_tone: 0, total_raw_score: 100 },
      { party: "plq", date_utc: "2026-08-21", date_montreal_tz: "2026-08-21", weighted_mentions: 0.4, weighted_tone: 0, total_raw_score: 60 },
    ];
    const c = computeStats(j as never, j as never, j as never)!;
    expect(buildRangeView(c.stats, "today", c.dates).rows[0].enjeuxVentiles).toBe(false);
    expect(buildRangeView(c.stats, "today", c.dates, null, new Map()).rows[0].enjeuxVentiles).toBe(true);
  });
});

// La fenêtre « Campagne » du module part du déclenchement du scrutin depuis le
// 2026-08-30. Sans ce test, le jour où quelqu'un remet `ELECTION_CALL_DATE` à
// `null`, la vue reprendrait tout l'historique sans que rien ne le signale.
describe("le portrait global part du déclenchement du scrutin", () => {
  it("écarte les journées antérieures au bref", () => {
    const AVANT = ["2026-08-20", "2026-08-25"];
    const APRES = ["2026-08-28", "2026-08-30"];
    const v: Record<string, number> = { caq: 0.4, pq: 0.3, qs: 0.15, plq: 0.1, pcq: 0.05 };
    const toutes = [...AVANT, ...APRES].flatMap((d) => PARTY_KEYS.map((p) => row(p, d, v[p])));

    const { stats, dates } = statsOf(toutes, toutes, toutes);
    const chart = buildChart(stats, dates, "overall");

    // Deux points, pas quatre : les journées d'avant le 27 août sont hors champ.
    const xs = chart.series[0].polyline.split(" ").filter(Boolean);
    expect(xs).toHaveLength(APRES.length);
  });
});

describe("la vue Jour est alignée sur le bloc intra-journée courant", () => {
  const {
    blocIntradayCourant,
    statsAvecBlocCourant,
    computeStats: cs,
    buildRangeView: brv,
  } = __test__;

  const JOURS = ["2026-08-25", "2026-08-26", "2026-08-27"];
  // Table `_day` : la CAQ mène LARGEMENT la journée en cours.
  const jourRow = (p: string, d: string, m: number) => ({
    party: p,
    date_utc: d,
    date_montreal_tz: d,
    weighted_mentions: m,
    weighted_tone: 0,
    total_raw_score: m * 1000,
  });
  const dayRows = JOURS.flatMap((d) => [
    jourRow("caq", d, 0.55),
    jourRow("plq", d, 0.2),
    jourRow("qs", d, 0.12),
    jourRow("pq", d, 0.1),
    jourRow("pcq", d, 0.03),
  ]);

  // Table `_intraday` : deux blocs pour le 27, et au DERNIER (11h31) c'est le
  // PLQ qui mène, pas la CAQ.
  const blk = (
    p: string,
    h: number,
    ca: string,
    m: number,
    minutes: number,
    tone: number,
  ) => ({
    party: p,
    date_utc: "2026-08-27",
    date_montreal_tz: "2026-08-27",
    weighted_mentions: m,
    weighted_tone: tone,
    total_raw_score: minutes,
    computed_at: ca,
    block_hour: h,
    block_label: `${String(h).padStart(2, "0")}h`,
  });
  const intra = [
    blk("caq", 4, "2026-08-27T11:31:00Z", 0.4, 200, -0.1),
    blk("plq", 4, "2026-08-27T11:31:00Z", 0.3, 150, 0.1),
    blk("qs", 4, "2026-08-27T11:31:00Z", 0.15, 70, 0),
    blk("pq", 4, "2026-08-27T11:31:00Z", 0.1, 50, 0),
    blk("pcq", 4, "2026-08-27T11:31:00Z", 0.05, 20, 0),
    // Dernier bloc (11h31) : le PLQ passe devant.
    blk("plq", 8, "2026-08-27T15:31:00Z", 0.5, 480, 0.42),
    blk("caq", 8, "2026-08-27T15:31:00Z", 0.25, 240, -0.3),
    blk("qs", 8, "2026-08-27T15:31:00Z", 0.15, 140, 0),
    blk("pq", 8, "2026-08-27T15:31:00Z", 0.07, 60, 0),
    blk("pcq", 8, "2026-08-27T15:31:00Z", 0.03, 20, 0),
  ];

  it("blocIntradayCourant sort le bloc au computed_at le plus récent", () => {
    const bloc = blocIntradayCourant(intra)!;
    expect(bloc).not.toBeNull();
    // 11h31, pas 07h31.
    expect(bloc.get("plq")!.mentions).toBeCloseTo(0.5, 6);
    expect(bloc.get("caq")!.mentions).toBeCloseTo(0.25, 6);
    expect(bloc.get("plq")!.minutes).toBe(480);
    expect(bloc.get("plq")!.tone).toBeCloseTo(0.42, 6);
  });

  it("le podium de la vue Jour suit ce bloc, pas la table _day", () => {
    const { stats, dates } = cs(dayRows, dayRows, dayRows)!;
    // Sans le patch : la CAQ mène (table _day).
    expect(brv(stats, "today", dates).rows[0].key).toBe("caq");

    // Avec le patch : le PLQ mène, comme dans le dernier bloc intra-journée.
    const patchees = statsAvecBlocCourant(stats, blocIntradayCourant(intra)!);
    const vue = brv(patchees, "today", dates);
    expect(vue.rows[0].key).toBe("plq");
    expect(vue.rows.find((r) => r.key === "plq")!.sovPct).toBe(50);
    expect(vue.rows.find((r) => r.key === "plq")!.minutesUne).toBe(480);
    // Le ton du PLQ vient aussi du bloc (favorable).
    expect(vue.rows.find((r) => r.key === "plq")!.toneDirection).toBe("positive");
  });

  it("Semaine et Campagne gardent la table _day (stats NON patchées)", () => {
    const { stats, dates } = cs(dayRows, dayRows, dayRows)!;
    const patchees = statsAvecBlocCourant(stats, blocIntradayCourant(intra)!);
    // `patchees` n'est qu'une copie : `stats` reste intact pour les autres vues.
    expect(brv(stats, "week", dates).rows[0].key).toBe("caq");
    expect(brv(stats, "overall", dates).rows[0].key).toBe("caq");
    // Et la vue Jour patchée n'a pas muté la source.
    expect(stats.find((s) => s.key === "plq")!.sov.today).toBeCloseTo(0.2, 6);
    void patchees;
  });
});

describe("la course Jour recule d'un jour quand celui qui s'ouvre n'a qu'un bloc", () => {
  const { buildChartIntraday: bci } = __test__;
  const l = (party: string, h: number, ca: string) => ({
    party,
    block_hour: h,
    block_label: `${String(h).padStart(2, "0")}h`,
    weighted_mentions: 0.2,
    weighted_tone: 0,
    total_raw_score: 60,
    date_utc: ca.slice(0, 10),
    date_montreal_tz: ca.slice(0, 10),
    computed_at: ca,
  });
  const P = ["CAQ", "PLQ", "PQ", "QS", "PCQ"];

  it("entre 23h31 et 03h31, on montre la journée d'hier — complète — pas un point seul", () => {
    // Jour A : quatre blocs (04h → 16h). Jour A+1 : seulement le bloc 20h–00h
    // de la soirée d'A, calculé à 23h31 (03h31 UTC) → sa graduation est 00h,
    // seul point du jour A+1.
    const rows = [
      ...[
        ["2026-08-27T11:31:00Z", 4],
        ["2026-08-27T15:31:00Z", 8],
        ["2026-08-27T19:31:00Z", 12],
        ["2026-08-27T23:31:00Z", 16],
      ].flatMap(([ca, h]) => P.map((p) => l(p, h as number, ca as string))),
      // 20h d'A : 03h31 UTC le 28 → jour de course 28, graduation 00h.
      ...P.map((p) => l(p, 20, "2026-08-28T03:31:00Z")),
    ];
    const chart = bci(rows, ["plq", "caq", "qs", "pq", "pcq"])!;
    expect(chart).not.toBeNull();
    // Ce sont les graduations du jour A (08h → 20h, fins des périodes 04h…16h),
    // pas le point unique 00h du jour A+1.
    const labels = chart.xLabels.map((x) => x.label);
    const tracees = new Set(
      chart.series[0].polylineMin.split(" ").map((pt) => Number(pt.split(",")[0])),
    );
    const xDe = (lab: string) => chart.xLabels.find((x) => x.label === lab)!.x;
    expect([...tracees].sort((a, b) => a - b)).toEqual(
      ["08h", "12h", "16h", "20h"].map(xDe).sort((a, b) => a - b),
    );
    expect(tracees.has(xDe("00h"))).toBe(false);
    void labels;
  });
});
