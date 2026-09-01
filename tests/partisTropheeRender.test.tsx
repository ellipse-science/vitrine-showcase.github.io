import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData } from "@/lib/data/parties";
import type { Pochette } from "@/lib/data/pochettes";
import { signaturePochette } from "@/lib/enjeux";

// LE DISQUE D'OR a remplacé le bac du jour et la vitrine de la discothèque le
// 2026-08-31 : un seul disque, à droite du palmarès, plutôt qu'un bac entier
// ou une carte séparée. Ces tests suivent le même motif que
// `partisPalmaresRender.test.tsx` : la forme réelle d'un composant client ne se
// prouve qu'en le rendant. Comme ailleurs dans ce fichier de tests, le rendu
// statique ne peut pas simuler un clic — ces tests prouvent donc l'état FERMÉ
// par défaut (le disque, jamais le classement déplié).

/** Un jeu à SIX blocs de 4 h (0 à 20 h) : la journée est publiée jusqu'à son
 *  arrivée, donc « la course est courue » pour la vue Jour — exactement le
 *  fixture qui prouve `chartTermine` dans `partisPalmaresRender.test.tsx`
 *  (« ne prolonge RIEN quand la course est courue »). Avec moins de blocs, la
 *  vue Jour reste « en production ». */
function donnees(blocs: number[]): PartiesData {
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
      total_raw_score: Math.max(0, 20 * (k + 1) - i * 3),
      weighted_tone: 0,
      computed_at: "2026-08-27T11:31:00Z",
      block_hour: h,
      block_label: `${h}h`,
    })),
  );
  const calcule = __test__.computeStats(lignes, lignes, lignes);
  if (!calcule) throw new Error("computeStats a rendu null sur un jeu valide");
  const { stats, dates } = calcule;
  const chartJour = __test__.buildChartIntraday(intra, [...PARTY_KEYS]);
  if (!chartJour) throw new Error("buildChartIntraday a rendu null");

  return {
    blocCourant: { date: "2026-08-27", hour: blocs.at(-1)!, label: null },
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

/** Le parti qui MÈNE la vue Jour de `donnees(...)`, dans l'ordre où le disque
 *  d'or le classe (temps en Une décroissant). Calculé sur les VRAIES lignes
 *  plutôt que deviné, pour ne pas dupliquer `rangerParTemps`. */
function meneurDuJour(data: PartiesData) {
  return data.ranges.today.rows
    .slice()
    .sort((a, b) => b.minutesUne - a.minutesUne || a.label.localeCompare(b.label, "fr"))[0];
}

/** Une pochette d'archive dont la SIGNATURE correspond exactement à celle que
 *  `pochetteAppariee` calcule pour `row` — sans enjeu ventilé dans ce fixture
 *  (`enjeuMix` est vide), la clé d'enjeu tombe toujours sur « sans-enjeu ». */
function pochetteAssortie(row: ReturnType<typeof meneurDuJour>): Pochette {
  return {
    jour: "2026-08-27",
    parti: row.key,
    sigle: row.label,
    nom: row.fullLabel,
    couleur: row.color,
    rang: 1,
    minutesUne: row.minutesUne,
    tempsLabel: "1h",
    partPct: 30,
    enjeu: null,
    ton: "Neutre",
    tonPct: 50,
    signature: signaturePochette(row.key, undefined, row.toneDirection),
    src: `/pochettes/2026-08-27-${row.key}.png`,
    sources: [{ src: `/pochettes/2026-08-27-${row.key}.webp`, type: "image/webp" }],
    blocHour: 20,
    jourLabel: "27 août 2026",
    jourCourt: "27 août",
  };
}

describe("le disque d'or — la course n'est pas encore courue", () => {
  const data = donnees([0, 4, 8, 12]); // publié jusqu'à midi, arrivée à 20 h
  const html = renderToStaticMarkup(<PartisCouvertureClient data={data} />);
  const meneur = meneurDuJour(data);
  const trophee = html.split('class="trophee"')[1]?.split("</div>\n\n")[0] ?? html;

  it("se nomme « Le single d'or », le nom de la vue Jour", () => {
    expect(html).toContain("Le single d");
  });

  it("dit « en production » plutôt que d'afficher une image qui pourrait mentir", () => {
    expect(html).toContain("Single en production");
    expect(html).not.toContain('class="trophee-disque termine"');
  });

  it("nomme quand même le meneur du moment, en texte", () => {
    expect(trophee).toContain(`>${meneur.label}<`);
  });

  it("n'écrit ni le nom complet ni la durée du meneur dans la légende — la course n'est pas finie", () => {
    const legende = html.split('class="trophee-legende"')[1]?.split("</p>")[0] ?? "";
    expect(legende).not.toContain(meneur.fullLabel);
  });

  it("le classement reste FERMÉ par défaut", () => {
    expect(html).toMatch(/class="trophee-disque[^"]*" aria-expanded="false"/);
    expect(html).not.toContain('class="trophee-classement"');
  });

  it("un second lien, distinct du disque, mène vers /discotheque", () => {
    expect(html).toMatch(/class="trophee-voir-tout"[^>]*href="[^"]*\/discotheque\/"/);
  });
});

describe("le disque d'or — couronné, sans image confirmée", () => {
  const data = donnees([0, 4, 8, 12, 16, 20]); // publié jusqu'à l'arrivée
  const html = renderToStaticMarkup(<PartisCouvertureClient data={data} />);
  const meneur = meneurDuJour(data);

  it("prend son encadré en or une fois la course courue", () => {
    expect(html).toMatch(/class="trophee-disque termine"/);
  });

  it("garde le sigle en texte sur l'aplat du parti plutôt que d'inventer une image", () => {
    expect(html).toContain('class="trophee-repli"');
    expect(html).toContain(`<b>${meneur.label}</b>`);
    expect(html).not.toContain("<picture");
  });

  it("écrit le nom complet et la durée du gagnant dans la légende", () => {
    const legende = html.split('class="trophee-legende"')[1]?.split("</p>")[0] ?? "";
    expect(legende).toContain(meneur.fullLabel);
  });
});

describe("le disque d'or — couronné, avec une vraie pochette", () => {
  const data = donnees([0, 4, 8, 12, 16, 20]);
  const meneur = meneurDuJour(data);
  const html = renderToStaticMarkup(
    <PartisCouvertureClient
      data={data}
      discotheque={{ jourCourant: "2026-08-27", duJour: [pochetteAssortie(meneur)], pile: [], fonds: [] }}
    />,
  );

  it("charge la VRAIE illustration appariée, pas le repli géométrique", () => {
    expect(html).toContain("<picture");
    expect(html).toContain(`/pochettes/2026-08-27-${meneur.key}.png`);
  });

  it("garde le sigle en légende par-dessus l'image, comme une couverture de la discothèque", () => {
    expect(html).toMatch(/class="pochette-sigle">[^<]*<\/b>/);
  });
});

describe("le disque d'or — mise en page à côté du palmarès", () => {
  const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees([0, 4, 8, 12, 16, 20])} />);

  it("les knobs, le graphique puis le disque, dans cet ordre, sous UNE même rangée", () => {
    const rangee = html.split('class="palmares-rangee"')[1] ?? "";
    const iKnobs = rangee.indexOf('class="palmares-commandes"');
    const iFigure = rangee.indexOf("<figure");
    const iTrophee = rangee.indexOf('class="trophee"');
    expect(iKnobs).toBeGreaterThan(-1);
    expect(iFigure).toBeGreaterThan(iKnobs);
    expect(iTrophee).toBeGreaterThan(iFigure);
  });

  it("le bac du jour et l'ancienne vitrine de la discothèque ont disparu du module", () => {
    expect(html).not.toContain('class="bacs"');
    expect(html).not.toContain('class="bac"');
    expect(html).not.toContain('class="disco-vedette"');
  });
});
