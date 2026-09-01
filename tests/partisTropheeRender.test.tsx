import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData, RowView } from "@/lib/data/parties";
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
 *  plutôt que deviné, pour rester fidèle au tri réel plutôt qu'à une
 *  hypothèse sur les fixtures. */
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

  it("se nomme « Le single d'or » — dans l'aria-label, plus à l'écran depuis le 2026-09-07", () => {
    // Le nom en toutes lettres sous le disque (`.trophee-legende`) a été
    // retiré à cette date : c'est l'encadré (`--palier`, éprouvé plus bas)
    // qui dit maintenant de quel palier il s'agit, en permanence. Le nom
    // complet du trophée reste lisible au clic comme au survol.
    expect(html).not.toContain('class="trophee-legende"');
    expect(html).toMatch(/aria-label="Le single d&#x27;or/);
  });

  it("dit « en production » plutôt que d'afficher une image qui pourrait mentir", () => {
    expect(html).toContain("Single en production");
    expect(html).not.toContain('class="trophee-disque termine"');
  });

  it("montre l'étiquette de disque vierge — le sigle sur un cercle, pas le hachurage retiré", () => {
    expect(html).toContain('class="trophee-etiquette"');
    expect(html).toContain('class="trophee-etiquette-disque"');
    expect(html).toMatch(new RegExp(`class="trophee-etiquette-sigle">${meneur.label}<`));
  });

  it("annonce une date de sortie — la même ligne d'arrivée que le graphique juste à côté", () => {
    // Publié jusqu'à midi (blocs [0,4,8,12]), l'arrivée du jour est à 20 h —
    // `chart.finish.label` pour la vue Jour (`buildChartIntraday`).
    expect(html).toContain("Sortie prévue à 20h");
  });

  it("nomme quand même le meneur du moment, en texte", () => {
    expect(trophee).toContain(`>${meneur.label}<`);
  });

  it("le nom du trophée est dans l'aria-label, jamais écrit sous le disque", () => {
    expect(html).toMatch(/aria-label="Le single d&#x27;or\. Single en production\./);
  });

  it("le panneau reste FERMÉ par défaut — pas de rendu tant qu'on n'a pas cliqué", () => {
    // Le panneau (`TropheePanel`) se rend en pleine largeur SOUS toute la
    // rangée du palmarès, pas dans la colonne du disque : le rendu statique
    // ne peut pas simuler le clic qui l'ouvre, donc son contenu (les cinq
    // cartes, chacune avec ses quatre grandeurs) reste NON éprouvé ici — seul
    // son absence par défaut l'est.
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-controls="trophee-panel"/);
    expect(html).not.toContain('id="trophee-panel"');
    expect(html).not.toContain('class="trophee-panel"');
  });

  it("l'encadré prend la couleur du palier du jour — l'or", () => {
    expect(html).toContain('style="--palier:var(--brass)"');
  });

  it("un second lien, distinct du disque, mène vers /discotheque — une flèche, pas une phrase", () => {
    // « Voir toute la discothèque » en toutes lettres ajoutait souvent plus de
    // hauteur que le disque lui-même ; le texte complet survit dans
    // `aria-label`/`title`, pas dans le lien visible.
    const lien = html.match(/<a class="trophee-voir-tout"[^>]*>([^<]*)<\/a>/);
    expect(lien).not.toBeNull();
    expect(lien![1]).toBe("→");
    expect(html).toMatch(/class="trophee-voir-tout"[^>]*href="[^"]*\/discotheque\/"/);
    expect(html).toMatch(/class="trophee-voir-tout"[^>]*aria-label="Voir toute la discothèque"/);
  });
});

describe("le disque d'or — couronné, sans image confirmée", () => {
  const data = donnees([0, 4, 8, 12, 16, 20]); // publié jusqu'à l'arrivée
  const html = renderToStaticMarkup(<PartisCouvertureClient data={data} />);
  const meneur = meneurDuJour(data);

  it("garde son encadré en or — présent tout le temps depuis le 2026-09-07, pas seulement une fois couronné", () => {
    // `.termine` ne distingue plus le style du disque : l'encadré (`--palier`)
    // est désormais TOUJOURS là, que la course soit courue ou non (voir
    // l'autre fixture, plus haut, où il est déjà présent en production).
    expect(html).toMatch(/class="trophee-disque"/);
    expect(html).not.toContain('class="trophee-disque termine"');
    expect(html).toContain('style="--palier:var(--brass)"');
  });

  it("garde le sigle en texte sur l'aplat du parti plutôt que d'inventer une image", () => {
    expect(html).toContain('class="trophee-repli"');
    expect(html).toContain(`<b>${meneur.label}</b>`);
    expect(html).not.toContain("<picture");
  });

  it("l'étiquette de disque vierge a disparu — la course est courue", () => {
    expect(html).not.toContain('class="trophee-etiquette"');
    expect(html).not.toContain("Sortie prévue");
  });

  it("aucune légende écrite sous le disque", () => {
    // Retirée le 2026-09-07 : l'encadré (`--palier`, éprouvé plus haut) dit
    // maintenant de quel palier il s'agit, en permanence — plus besoin de
    // l'écrire aussi en toutes lettres à côté. Le nom complet du gagnant, lui,
    // reste lisible dans `aria-label`/`title` — voir le test suivant.
    expect(html).not.toContain('class="trophee-legende"');
  });

  it("le nom complet et la durée restent lisibles au clic comme au survol", () => {
    expect(html).toMatch(new RegExp(`aria-label="[^"]*${meneur.fullLabel}[^"]*"`));
    expect(html).toMatch(new RegExp(`title="[^"]*${meneur.fullLabel}[^"]*"`));
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
    // Le graphique GARDE sa hauteur (139 px) ; ce sont les knobs et le disque
    // qui s'y tassent (voir le commentaire de `.palmares-rangee`) — le rendu
    // statique ne calcule aucune mise en page, il ne peut donc prouver que
    // l'ORDRE des enfants dans le DOM, pas leur position réelle une fois la
    // CSS appliquée.
    const rangee = html.split('class="palmares-rangee"')[1] ?? "";
    const iKnobs = rangee.indexOf('class="palmares-commandes"');
    const iFigure = rangee.indexOf("<figure");
    const iTrophee = rangee.indexOf('class="trophee"');
    expect(iKnobs).toBeGreaterThan(-1);
    expect(iFigure).toBeGreaterThan(iKnobs);
    expect(iTrophee).toBeGreaterThan(iFigure);
  });

  it("le disque et son lien vers la discothèque restent une seule boîte (`.trophee`)", () => {
    // La légende (le nom du trophée en toutes lettres) a quitté cette boîte
    // le 2026-09-07 — l'encadré du disque dit maintenant le palier à sa
    // place. Il ne reste que le disque et la flèche vers `/discotheque`.
    expect(html).toContain('class="trophee"');
    expect(html).not.toContain('class="trophee-sous"');
    expect(html).not.toContain('class="trophee-legende"');
  });

  it("le bac du jour et l'ancienne vitrine de la discothèque ont disparu du module", () => {
    expect(html).not.toContain('class="bacs"');
    expect(html).not.toContain('class="bac"');
    expect(html).not.toContain('class="disco-vedette"');
  });
});

describe("les knobs — le graphique ne doit pas bouger en changeant de vitesse", () => {
  // RÉGRESSION du 2026-09-03 : le mot affiché sous chaque cadran change de
  // longueur selon la position (« Jour » contre « Campagne 33 T », « Écouté »
  // contre « Apprécié »). Sans gabarit, la colonne des knobs changeait donc de
  // largeur d'une position à l'autre, et poussait le graphique du palmarès à
  // côté d'elle. Le rendu statique ne montre qu'UNE position à la fois ; ces
  // tests prouvent donc que le GABARIT (toutes les positions, superposées et
  // invisibles) est bien présent, pas que le graphique reste immobile — ça,
  // seul un navigateur peut le montrer.
  const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees([0, 4, 8, 12, 16, 20])} />);
  const panneau = html.split('class="palmares-commandes"')[1]?.split("<figure")[0] ?? "";
  const boites = panneau.split('class="knob-valeur-boite"').slice(1);

  it("un gabarit par knob, superposé au mot affiché", () => {
    expect(boites.length).toBe(2);
  });

  it("le gabarit du knob Mesure porte les DEUX positions possibles", () => {
    const gabarits = [...boites[0].matchAll(/class="knob-valeur-gabarit"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(gabarits).toEqual(["Écouté", "Apprécié"]);
  });

  it("le gabarit du knob Vitesse porte les TROIS positions possibles", () => {
    const gabarits = [...boites[1].matchAll(/class="knob-valeur-gabarit"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(gabarits).toEqual(["Jour 78 T", "Semaine 45 T", "Campagne 33 T"]);
  });

  it("chaque gabarit partage la MÊME cellule que le mot visible — `grid-area`, pas un flux normal", () => {
    // C'est cette superposition qui fait que la boîte prend la largeur du
    // gabarit le plus large plutôt que celle du seul mot affiché.
    for (const boite of boites) {
      expect(boite).toContain('class="knob-valeur"');
    }
  });
});

describe("les decks — inertes tant qu'aucun article n'est connu, depuis le 2026-09-01", () => {
  // RÉGRESSION du 2026-09-01 : un clic sur un deck menait au panneau du
  // disque d'or, une carte déjà retournée — mais ce panneau n'a rien à
  // montrer tant que la course n'est pas courue (« disque en production »
  // pour les cinq, sans rapport avec le parti cliqué). Sans `articleUrl`, le
  // deck n'a donc plus rien à faire au clic : ni bouton, ni lien, un `<div>`
  // inerte qui garde la place pour le jour où l'article existe vraiment.
  const html = renderToStaticMarkup(<PartisCouvertureClient data={donnees([0, 4, 8, 12, 16, 20])} />);
  const inertes = [...html.matchAll(/<div[^>]*class="deck-carre deck-carre--inerte"[^>]*>/g)];

  it("quatre decks, quatre VRAIS <div> inertes — ni bouton, ni lien", () => {
    expect(inertes.length).toBe(4);
    expect(html).not.toMatch(/<a[^>]*class="deck-carre"/);
    expect(html).not.toMatch(/<button[^>]*class="deck-carre"/);
  });

  it("aucun `aria-label`, aucun `title` — rien à annoncer tant qu'il n'y a rien à faire", () => {
    for (const [balise] of inertes) {
      expect(balise).not.toContain("aria-label");
      expect(balise).not.toContain("title=");
    }
  });

  it("la table de mix (le pupitre) précède le palmarès dans la page", () => {
    // RÉGRESSION du 2026-09-01 : le palmarès (et son disque d'or) vivait EN
    // TÊTE du module ; il suit maintenant le pupitre (decks + console +
    // fader), l'inverse de l'ordre précédent.
    const iPupitre = html.indexOf('class="pupitre"');
    const iPalmares = html.indexOf('class="partis-course partis-course--tete"');
    expect(iPupitre).toBeGreaterThan(-1);
    expect(iPalmares).toBeGreaterThan(iPupitre);
  });

  it("aucune pochette ne s'ouvre plus EN PLACE, sous le pupitre", () => {
    expect(html).not.toContain('class="gatefold"');
    expect(html).not.toContain("gatefold-nom");
    expect(html).not.toContain("gatefold-fermer");
    expect(html).not.toContain("deck-carre--choisi");
  });
});

describe("les decks — mènent vers l'article représentatif quand il existe (aws-refiners#447)", () => {
  // Sur « Tous les médias » (la position par défaut du fader), un deck n'a
  // pas d'URL propre : `lienArticle` en choisit une parmi les médias qui en
  // ont une pour ce parti (voir le commentaire de `lienArticle`,
  // PartisCouvertureClient.tsx). Ce fixture donne DEUX médias au premier
  // parti du classement, et AUCUN au second — pour prouver les deux issues,
  // pas seulement la présente.
  const base = donnees([0, 4, 8, 12, 16, 20]);
  const visibles = base.ranges.today.rows.filter((r) => !r.inShadow);
  const avecArticle = visibles[0];
  const sansArticle = visibles[1];

  const URL_LED = "https://ledevoir.example/article-a";
  const URL_RCI = "https://rci.example/article-b";
  const avecUrl = (rows: RowView[], url: string): RowView[] =>
    rows.map((r) => (r.key === avecArticle.key ? { ...r, representativeUrl: url } : r));

  const data: PartiesData = {
    ...base,
    medias: [
      { id: "led", label: "Le Devoir" },
      { id: "rci", label: "Radio-Canada" },
    ],
    byMedia: {
      led: { ranges: { ...base.ranges, today: { ...base.ranges.today, rows: avecUrl(base.ranges.today.rows, URL_LED) } } },
      rci: { ranges: { ...base.ranges, today: { ...base.ranges.today, rows: avecUrl(base.ranges.today.rows, URL_RCI) } } },
    },
  };

  const html = renderToStaticMarkup(<PartisCouvertureClient data={data} />);

  it("le deck du parti qui a un article devient un VRAI lien externe", () => {
    const liens = [...html.matchAll(/<a class="deck-carre" href="([^"]*)"[^>]*>/g)];
    expect(liens.length).toBe(1);
    expect([URL_LED, URL_RCI]).toContain(liens[0][1]);
  });

  it("le lien s'ouvre dans un nouvel onglet, comme tout lien externe du site", () => {
    expect(html).toMatch(/<a class="deck-carre" href="[^"]*" target="_blank" rel="noopener noreferrer"/);
  });

  it("l'annonce dit qu'on quitte le site pour un article, pas qu'on ouvre une pochette", () => {
    expect(html).toContain("Lire l&#x27;article qui en parle le plus, dans un nouvel onglet.");
  });

  it("le deck d'un parti SANS article, lui, reste un <div> inerte", () => {
    // `sansArticle` n'a plus de nom dans le DOM (aucun `aria-label` sur
    // l'inerte) : on vérifie sa PRÉSENCE par son sigle, gravé sur le disque
    // lui-même (`.cap-sigle`), pas par une annonce qui n'existe plus.
    const inertes = [...html.matchAll(/<div class="deck-carre deck-carre--inerte">([\s\S]*?)<\/div>\s*<\/div>/g)];
    expect(inertes.some(([, contenu]) => contenu.includes(`>${sansArticle.label}<`))).toBe(true);
  });

  it("trois decks sur quatre restent inertes — un seul a un article", () => {
    const inertes = [...html.matchAll(/<div class="deck-carre deck-carre--inerte">/g)];
    expect(inertes.length).toBe(3);
  });
});
