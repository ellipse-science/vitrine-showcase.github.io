import { describe, it, expect } from "vitest";
import { __test__, PARTY_KEYS, PARTY_COLORS } from "@/lib/data/parties";

const { buildLookup, computeStats, sparkPoints, samplePoints, buildRangeView, buildChart, axisTop, lundiDeLaSemaine } =
  __test__;

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

  it("étiquette la semaine en jours, y compris ceux à venir", () => {
    const { stats, dates } = statsOf(threeDays(), threeDays(), threeDays());
    const chart = buildChart(stats, dates, "week");
    // Trois jours de données, mais l'axe montre la semaine entière jusqu'à son
    // arrivée : c'est ce qui laisse voir le chemin restant.
    expect(chart.xLabels.length).toBeGreaterThan(3);
    for (const l of chart.xLabels) {
      // « vendredi » en toutes lettres : c'est le jour d'ARRIVÉE, et le
      // distinguer évite de poser une étiquette de plus au bout de l'axe.
      expect(["lun.", "mar.", "mer.", "jeu.", "sam.", "dim.", "vendredi"]).toContain(l.label);
    }
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


describe("une seule durée par parti — régression PR #539", () => {
  /** Le raffineur filtre les mêmes articles sur `stop_mtl >= start_date_mtl`
   *  puis somme `headline_minutes` : le total d'une semaine EST la somme des
   *  totaux de ses jours depuis le LUNDI
   *  (radar-party-score-salient-shadow/runtime.R:269-302).
   *
   *  L'axe du palmarès ouvrait la semaine le SAMEDI. Il cumulait donc deux
   *  jours que la table n'agrège pas, et la pochette annonçait 14h40 quand le
   *  palmarès finissait à 17h16 pour le même parti, sur le même écran — le
   *  classement des deux pouvait diverger avec. Rien ne le signalait : les
   *  deux nombres étaient justes chacun dans sa fenêtre.
   */
  it("lundiDeLaSemaine tombe un lundi, y compris quand on part d'un lundi", () => {
    for (const jour of ["2026-08-17", "2026-08-18", "2026-08-21", "2026-08-23"]) {
      const t = lundiDeLaSemaine(Date.parse(`${jour}T14:00:00Z`));
      expect(new Date(t).getUTCDay(), `${jour} → ${new Date(t).toISOString()}`).toBe(1);
      expect(t).toBeLessThanOrEqual(Date.parse(`${jour}T00:00:00Z`));
    }
  });

  it("la pochette et le palmarès affichent le MÊME nombre de minutes", () => {
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

    for (const ligne of vue.rows) {
      const serie = vue.chart.series.find((s) => s.key === ligne.key);
      if (!serie) continue;
      expect(serie.lastMinutes, `${ligne.key} : pochette ${ligne.minutesUne} vs palmarès ${serie.lastMinutes}`)
        .toBe(ligne.minutesUne);
    }
    expect(vue.rows[0].minutesUne).toBe(sCaq);
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
