import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PartisCouvertureClient, ModeEmploi } from "@/components/interactive/PartisCouvertureClient";
import { __test__, PARTY_KEYS } from "@/lib/data/parties";
import type { PartiesData, PartyKey, EnjeuView } from "@/lib/data/parties";

// LE MODULE RÉDUIT À SA CONSOLE (2026-11-24) : filtre Jour / Semaine / Mois à
// droite du titre, Semaine par défaut, plus de palmarès ni de discothèque,
// decks qui ne montrent que leur vitesse, fader alphabétique en noms complets.

function donnees(): PartiesData {
  // 40 jours : assez pour que Mois (30) et Semaine diffèrent du tout.
  const jours = Array.from({ length: 40 }, (_, i) =>
    new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
  );
  const lignes = jours.flatMap((j, n) =>
    PARTY_KEYS.map((p, i) => ({
      party: p.toUpperCase(),
      date_utc: j,
      date_montreal_tz: j,
      weighted_mentions: 0.34 - i * 0.06,
      // Le PQ domine les 10 premiers jours seulement : hors de la fenêtre Mois.
      total_raw_score: p === "pq" && n < 10 ? 1000 : 100 - i * 10,
      weighted_tone: 0,
      computed_at: `${j}T11:31:00Z`,
    })),
  );
  const calcule = __test__.computeStats(lignes);
  if (!calcule) throw new Error("computeStats a rendu null");
  const { stats, dates } = calcule;
  // Les enjeux du dernier jour publié, comme `buildEnjeux` les livre : le plus
  // présent en tête, « Autres enjeux » en queue. Le QS n'en a aucun.
  const enjeu = (label: string, pct: number): EnjeuView => ({ label, pct, toneLabel: "Neutre", toneDirection: "neutral" });
  const enjeux = new Map<PartyKey, EnjeuView[]>([
    ["caq", [enjeu("Santé et politiques sociales", 41), enjeu("Économie et travail", 22), { ...enjeu("Autres enjeux", 37), reste: true }]],
    ["pq", [enjeu("Culture et nationalisme", 55)]],
    ["plq", [enjeu("Économie et travail", 30)]],
    ["pcq", [{ ...enjeu("Autres enjeux", 100), reste: true }]],
  ]);
  const vue = (r: "today" | "week" | "month" | "overall") => __test__.buildRangeView(stats, r, dates, null, enjeux);
  return {
    blocCourant: null,
    ranges: { today: vue("today"), week: vue("week"), month: vue("month"), overall: vue("overall") },
    indisponible: null,
    medias: [
      { id: "RCI", label: "Radio-Canada" },
      { id: "LED", label: "Le Devoir" },
      { id: "TVA", label: "TVA Nouvelles" },
      { id: "LAP", label: "La Presse" },
      { id: "JDM", label: "Le Journal de Montréal" },
      { id: "MG", label: "Montreal Gazette" },
    ],
    byMedia: {},
    enjeuMix: { enjeux: [], parParti: {} },
    surFixtures: false,
    lastDate: jours.at(-1)!,
    lastUpdated: "Dernière mise à jour",
  };
}

const data = donnees();
const html = renderToStaticMarkup(<PartisCouvertureClient data={data} />);

describe("le filtre de période", () => {
  it("trois onglets, Jour / Semaine / Mois, à droite du titre", () => {
    const filtre = html.split('class="legend-toggle inline partis-periodes"')[1]?.split("</div>")[0] ?? "";
    const mots = [...filtre.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(mots).toEqual(["Jour", "Semaine", "Mois"]);
    expect(html).not.toContain("Campagne");
  });

  it("Semaine est la vue de départ", () => {
    expect(html).toMatch(/aria-selected="true" class="active"[^>]*>Semaine</);
  });
});

describe("la vue Mois", () => {
  it("compte les 30 derniers jours, pas tout le suivi", () => {
    const pqMois = data.ranges.month.rows.find((r) => r.key === "pq")!;
    const pqTout = data.ranges.overall.rows.find((r) => r.key === "pq")!;
    expect(pqMois.minutesUne).toBeLessThan(pqTout.minutesUne);
    expect(data.ranges.month.depuisLabel).toBe("sur 30 jours");
  });
});

describe("ce qui a quitté le module", () => {
  it("plus de palmarès, de knobs, de disque d'or ni de lien vers la discothèque", () => {
    for (const absent of ["palmares", "knob", "trophee", "discotheque", "flip-carte"]) {
      expect(html).not.toContain(absent);
    }
  });
});

describe("les decks", () => {
  // Leur vitesse redisait la part, déjà lue sur la hauteur de la colonne
  // (retour de Jules, 2026-11-25). Ils montrent désormais l'enjeu qui « joue »
  // pour le parti : ce que le vumètre ne dit nulle part. Immobiles, peints de
  // la couleur de l'enjeu, son nom écrit sur le plateau, le parti dessous.
  const decks = [...html.matchAll(/<div class="deck( [^"]*)?"[\s\S]*?class="deck-parti"[^>]*>([^<]*)</g)].map((m) => m[0]);
  const enjeux = [...html.matchAll(/class="deck-enjeu-nom"[^>]*>([^<]*)</g)].map((m) => m[1].trim());
  const rangs = [...html.matchAll(/class="deck-rang"[^>]*>([^<]*)</g)].map((m) => m[1]);
  const partis = [...html.matchAll(/class="deck-parti"[^>]*>([^<]*)</g)].map((m) => m[1].trim());

  it("quatre decks, l'enjeu écrit sur le plateau, le parti dessous", () => {
    expect(decks).toHaveLength(4);
    // Le libellé court du site (« Santé », pas « Santé et politiques
    // sociales ») : le plateau n'a la place que pour un mot ou deux.
    expect(enjeux).toEqual(expect.arrayContaining(["Santé", "Culture", "Économie", "—"]));
    expect(rangs).toEqual(["1", "2", "3", "4"]);
    expect(partis).toEqual(["PLQ", "CAQ", "QS", "PQ"]);
  });

  it("le plateau prend la couleur de l'enjeu", () => {
    const sante = decks.find((d) => d.includes(">Santé<"))!;
    expect(sante).toMatch(/--enjeu:\s*#852244/);
  });

  it("jamais « Autres enjeux » sur un plateau : sans enjeu identifié, un tiret", () => {
    expect(enjeux).not.toContain("Autres enjeux");
  });

  it("l'écran affiche la part de l'enjeu dans la couverture du parti", () => {
    const sante = decks.find((d) => d.includes(">Santé<"))!;
    expect(sante).toMatch(/class="deck-enjeu-part"[^>]*>41\s%</);
  });

  // À 375 px, le deck fait ~79 px : le texte du plateau (viewBox 100) tombait
  // à 5 et 4 px (revue d'Adrien sur #1057, 2026-11-26). Sur mobile, l'enjeu
  // et sa part passent sous le deck en texte HTML, et l'écran ne garde que le
  // symbole, centré. Le CSS choisit la variante ; les deux sont dans le HTML.
  it("sous chaque deck, une légende HTML de l'enjeu et de sa part, pour le mobile", () => {
    const legendes = [...html.matchAll(/<span class="deck-legende"[^>]*>([\s\S]*?)<\/span><\/button>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    expect(legendes).toHaveLength(4);
    expect(legendes).toEqual(expect.arrayContaining(["Santé 41 %", "Culture 55 %", "Économie 30 %", "—"]));
    expect(legendes).not.toContain("Autres enjeux");
  });

  it("l'écran porte aussi un symbole centré, seul affiché sur mobile", () => {
    const sante = html.split('data-parti="caq"')[1]?.split("</button>")[0] ?? "";
    expect(sante).toMatch(/class="[^"]*\bdeck-symbole deck-symbole--seul"/);
  });

  it("les decks restent immobiles et les quatre partis ouvrent les sources", () => {
    expect(html).not.toContain("--tour");
    expect(html).not.toContain("deck-jog");
    expect(html).not.toContain("deck-bague-tournante");
    expect([...html.matchAll(/<button class="deck-carre[^"]*"[^>]*data-parti="([^"]+)"/g)].map((m) => m[1]))
      .toEqual(["plq", "caq", "qs", "pq"]);
  });

  it("le mode d'emploi dit ce que montrent les decks, et plus leur vitesse", () => {
    const aide = renderToStaticMarkup(<ModeEmploi />);
    expect(aide).toContain("<b>decks</b>");
    expect(aide).toMatch(/enjeu/);
    expect(aide).not.toMatch(/vitesse|tourne/);
  });
});

describe("le fader", () => {
  it("Tous les médias au centre, les médias en ordre alphabétique de part et d'autre", () => {
    const noms = [...html.matchAll(/class="fader-cran[^"]*"[^>]*><i><\/i><b>([^<]+)<\/b>/g)].map((m) => m[1]);
    expect(noms).toEqual([
      "La Presse",
      "Le Devoir",
      "Le Journal de Montréal",
      "Tous les médias",
      "Montreal Gazette",
      "Radio-Canada",
      "TVA Nouvelles",
    ]);
  });
});
