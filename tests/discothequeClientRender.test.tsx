import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DiscothequeClient } from "@/components/interactive/DiscothequeClient";
import type { Album, Discographie, Edition, Single } from "@/lib/data/pochettes";

// Le rendu statique ne peut pas simuler un clic (pas de useState piloté de
// l'extérieur) : ces tests prouvent donc l'état FERMÉ par défaut — la
// couverture, jamais la tracklist — exactement comme les tests du palmarès ne
// prouvent que l'état initial des knobs. La logique de groupage elle-même
// (quelles pistes vont dans quel album, quelle édition) est déjà éprouvée dans
// `tests/pochettesGroupes.test.ts`.

function single(over: Partial<Single> & { jour: string }): Single {
  return {
    parti: "caq",
    sigle: "CAQ",
    couleur: "#2B5C7C",
    rang: 1,
    minutesUne: 60,
    tempsLabel: "1h",
    partPct: 30,
    enjeu: "Économie",
    ton: "Neutre",
    tonPct: 50,
    chiffres: true,
    jourLabel: "Samedi 22 août 2026",
    jourCourt: "22 août",
    ...over,
  };
}

// `pistes[0]` (2026-08-24, 100 min, en tête puisque la plus écoutée) n'a
// délibérément PAS de `src` : c'est elle qui devient la COUVERTURE de la
// plaque, et ce fixture éprouve donc le repli — sigle en texte sur son aplat de
// couleur — plutôt que la vraie illustration.
const ALBUMS: Album[] = [
  {
    parti: "caq",
    sigle: "CAQ",
    nom: "Coalition avenir Québec",
    couleur: "#2B5C7C",
    semaineDebut: "2026-08-22",
    semaineLabel: "du 22 août 2026 au 28 août 2026",
    totalMinutes: 160,
    pistes: [
      single({ jour: "2026-08-24", minutesUne: 100 }),
      single({ jour: "2026-08-22", minutesUne: 40 }),
      single({ jour: "2026-08-28", minutesUne: 20, src: "/pochettes/2026-08-28-caq.png" }),
    ],
  },
];

const DISCOGRAPHIES: Discographie[] = [
  {
    parti: "caq",
    sigle: "CAQ",
    nom: "Coalition avenir Québec",
    couleur: "#2B5C7C",
    totalMinutes: 220,
    pistes: ALBUMS[0].pistes,
  },
];

// UNE ÉDITION : plusieurs PARTIS le même jour, contrairement à un album ou une
// discographie qui ne portent qu'un seul artiste.
const EDITIONS: Edition[] = [
  {
    jour: "2026-08-24",
    titre: "Édition du 24 août 2026",
    couleur: "#2B5C7C",
    totalMinutes: 150,
    pistes: [
      single({ jour: "2026-08-24", parti: "caq", sigle: "CAQ", minutesUne: 100 }),
      single({ jour: "2026-08-24", parti: "pq", sigle: "PQ", couleur: "#1E3A5F", minutesUne: 50 }),
    ],
  },
];

describe("DiscothequeClient — la plaque FERMÉE par défaut", () => {
  const html = renderToStaticMarkup(
    <DiscothequeClient editions={EDITIONS} albums={ALBUMS} discographies={DISCOGRAPHIES} />,
  );

  it("s'ouvre sur la vue JOUR, pas semaine ni campagne", () => {
    const boutons = [...html.matchAll(/aria-pressed="(true|false)"[^>]*>.*?(Jour|Semaine|Campagne)</g)];
    expect(boutons.length).toBe(3);
    expect(boutons.find((b) => b[2] === "Jour")![1]).toBe("true");
    expect(boutons.find((b) => b[2] === "Semaine")![1]).toBe("false");
    expect(boutons.find((b) => b[2] === "Campagne")![1]).toBe("false");
  });

  it("montre les éditions, pas les albums ni les discographies", () => {
    expect(html).toContain("Édition du 24 août 2026");
    expect(html).not.toContain(": Album");
    expect(html).not.toContain(": Discographie");
  });

  it("une édition garde ses PLUSIEURS partis, contrairement à un album", () => {
    // Fermée, seule la vedette (CAQ, la plus écoutée) est visible ; PQ
    // n'apparaît qu'une fois la plaque ouverte, dans la tracklist — non testé
    // ici (rendu statique), mais le sous-titre doit déjà compter les deux.
    expect(html).toContain("2 partis");
  });

  it("ne rend AUCUNE tracklist tant qu'on n'a pas cliqué", () => {
    // Ni les pistes, ni leurs images : une discographie peut compter des
    // dizaines de titres, les charger pour une plaque qu'on n'ouvre jamais
    // serait le même gaspillage que l'ancienne grille de tuiles du module.
    expect(html).not.toContain("fonds-pistes");
    expect(html).not.toContain("fonds-piste-rang");
  });

  it("la couverture SANS image confirmée garde son sigle en texte", () => {
    // Sans lui, parcourir un mur de plaques fermées ne laisserait plus aucun
    // repère que la couleur.
    expect(html).toContain('class="fonds-repli fonds-repli--couverture"');
    expect(html).toContain('<b class="fonds-repli-sigle">CAQ</b>');
  });

  it("le déclencheur annonce l'état et l'action au lecteur d'écran", () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-label="[^"]*Voir la liste des titres\.[^"]*"/);
  });

  it("les trois boutons de la bascule sont de VRAIS boutons", () => {
    const plaque = html.split('class="fonds-vue"')[1]?.split("</div>")[0] ?? "";
    expect([...plaque.matchAll(/<button/g)].length).toBe(3);
  });
});

describe("DiscothequeClient — la couverture quand une image existe", () => {
  it("charge la VRAIE illustration du single le plus écouté, pas un repli", () => {
    // La vue par défaut est Jour : c'est via une édition qu'on éprouve la
    // couverture avec image, `CartePlaque`/`Pochette` étant les MÊMES
    // composants partagés par les trois vues (voir `DiscothequeClient.tsx`) —
    // les éprouver une fois suffit, la logique de groupage elle-même est
    // couverte séparément par `tests/pochettesGroupes.test.ts`.
    const editionAvecImage: Edition[] = [
      {
        jour: "2026-08-24",
        titre: "Édition du 24 août 2026",
        couleur: "#2B5C7C",
        totalMinutes: 100,
        pistes: [single({ jour: "2026-08-24", minutesUne: 100, src: "/pochettes/vedette.png" })],
      },
    ];
    const html = renderToStaticMarkup(
      <DiscothequeClient editions={editionAvecImage} albums={[]} discographies={[]} />,
    );
    expect(html).toContain("<picture");
    expect(html).toContain("/pochettes/vedette.png");
    expect(html).not.toContain("fonds-repli--couverture");
  });
});

describe("DiscothequeClient — sections vides", () => {
  it("le dit en toutes lettres plutôt que de laisser un trou muet", () => {
    const html = renderToStaticMarkup(
      <DiscothequeClient editions={[]} albums={[]} discographies={[]} />,
    );
    expect(html).toContain("Aucune édition");
  });
});
