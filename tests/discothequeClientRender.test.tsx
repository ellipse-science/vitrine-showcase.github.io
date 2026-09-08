import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DiscothequeClient } from "@/components/interactive/DiscothequeClient";
import type { Album, Discographie, Single } from "@/lib/data/pochettes";

// Le rendu statique ne peut pas simuler un clic (pas de useState piloté de
// l'extérieur) : ces tests prouvent donc l'état FERMÉ par défaut — la
// couverture, jamais l'endos — exactement comme les tests du palmarès ne
// prouvent que l'état initial des knobs. La logique de groupage elle-même
// (quelles pistes vont dans quel album, quelle discographie, l'ordre
// d'écoute des singles) est déjà éprouvée dans `tests/pochettesGroupes.test.ts`.

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

// DEUX SINGLES DU MÊME JOUR, DEUX PARTIS DIFFÉRENTS — la vue Jour ne les
// compile plus dans une édition commune depuis le 2026-09-05 : chacun doit
// rester sa PROPRE carte, indépendante.
const SINGLES: Single[] = [
  single({ jour: "2026-08-24", parti: "caq", sigle: "CAQ", minutesUne: 100, jourLabel: "Lundi 24 août 2026" }),
  single({ jour: "2026-08-24", parti: "pq", sigle: "PQ", couleur: "#1E3A5F", minutesUne: 50, jourLabel: "Lundi 24 août 2026" }),
];

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

describe("DiscothequeClient — la carte FERMÉE par défaut", () => {
  const html = renderToStaticMarkup(
    <DiscothequeClient singles={SINGLES} albums={ALBUMS} discographies={DISCOGRAPHIES} />,
  );

  it("s'ouvre sur la vue JOUR, pas semaine ni campagne", () => {
    const boutons = [...html.matchAll(/aria-pressed="(true|false)"[^>]*>.*?(Jour|Semaine|Campagne)</g)];
    expect(boutons.length).toBe(3);
    expect(boutons.find((b) => b[2] === "Jour")![1]).toBe("true");
    expect(boutons.find((b) => b[2] === "Semaine")![1]).toBe("false");
    expect(boutons.find((b) => b[2] === "Campagne")![1]).toBe("false");
  });

  it("montre les singles, pas les albums ni les discographies", () => {
    // La journée complète ne s'écrit plus SOUS la pochette (le bandeau est
    // parti le 2026-09-07) : elle vit dans l'`aria-label` du déclencheur, et
    // c'est là qu'on la trouve maintenant.
    expect(html).toMatch(/aria-label="[^"]*Lundi 24 août 2026/);
    expect(html).not.toContain(": Album");
    expect(html).not.toContain(": Discographie");
  });

  it("DEUX cartes indépendantes pour deux partis du même jour — plus de compilation par édition", () => {
    expect([...html.matchAll(/class="fonds-plaque fonds-plaque--single"/g)].length).toBe(2);
    expect(html).toContain(">CAQ<");
    expect(html).toContain(">PQ<");
  });

  it("la pochette d'un single PIVOTE (flip), elle ne se déplie pas en rangée comme une plaque", () => {
    // `CartePlaque` (album, discographie) passe en rangée une fois ouverte
    // (`.fonds-plaque.ouverte`) : la couverture rétrécit, la tracklist
    // s'étale à côté. Un single n'a rien à lister ; sa carte ne prend donc
    // jamais la classe `ouverte` — seule sa pochette, dans `.flip-carte`,
    // tourne pour montrer son endos.
    expect(html).not.toContain('class="fonds-plaque ouverte"');
    expect([...html.matchAll(/class="flip-carte"/g)].length).toBe(2);
    expect([...html.matchAll(/class="flip-face flip-face--recto"/g)].length).toBe(2);
    expect([...html.matchAll(/class="flip-face flip-face--verso"/g)].length).toBe(2);
  });

  it("un single, c'est LA POCHETTE SEULE — aucun bandeau de texte sous elle", () => {
    // Le sigle et le temps qu'il portait sont déjà sur l'étiquette du disque ;
    // le reste est au dos, qu'un clic retourne. Rien n'est perdu pour un
    // lecteur d'écran : le déclencheur annonce les deux.
    expect(html).not.toContain("fonds-plaque-tete");
    expect(html).not.toContain("fonds-plaque-total");
    expect(html).toMatch(/aria-label="[^"]*1h40 en Une/);
  });

  it("l'enjeu s'écrit en libellé COURT au dos, le complet dans l'infobulle", () => {
    // Le plus long libellé du CAP fait 44 caractères et débordait du dos de la
    // pochette. La première ligne de défense est le libellé court, la même
    // qu'utilise le module (`libelleEnjeuCourt`) ; le filet CSS
    // (`.tracklist-metrique`, ellipse) est derrière.
    const long = "Droits, libertés, minorités et discrimination";
    const html = renderToStaticMarkup(
      <DiscothequeClient
        singles={[single({ jour: "2026-08-24", enjeu: long })]}
        albums={[]}
        discographies={[]}
      />,
    );
    expect(html).toContain(">Droits<");
    expect(html).not.toContain(`>${long}<`);
    // Rien n'est perdu : le libellé entier reste au survol et pour un lecteur
    // d'écran.
    expect(html).toContain(`title="${long}"`);
  });

  it("la grille de la vue Jour est marquée « cinq de large »", () => {
    expect(html).toContain('class="fonds-albums fonds-albums--singles"');
  });

  it("la pochette montre son RECTO, pas son endos, tant qu'on n'a pas cliqué", () => {
    // L'endos existe TOUJOURS dans le DOM depuis le 2026-09-06 (le flip anime
    // les deux faces à la fois — voir `.flip-carte` dans `globals.css`) ; ce
    // qui change au clic, c'est la classe `retournee`, pas la présence de
    // l'endos. Le rendu statique ne peut pas simuler le clic : ce test prouve
    // donc l'absence de `retournee` par défaut, pas l'absence de contenu.
    expect(html).toContain("fonds-piste-detail");
    expect(html).not.toContain("retournee");
  });

  it("la couverture SANS image confirmée garde son sigle en texte", () => {
    expect(html).toContain('class="fonds-repli fonds-repli--couverture"');
    expect(html).toContain('<b class="fonds-repli-sigle">CAQ</b>');
  });

  it("le déclencheur annonce l'état et l'action au lecteur d'écran", () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-label="[^"]*Voir le détail au dos de la pochette\.[^"]*"/);
  });

  it("les trois boutons de la bascule sont de VRAIS boutons", () => {
    const plaque = html.split('class="fonds-vue"')[1]?.split("</div>")[0] ?? "";
    expect([...plaque.matchAll(/<button/g)].length).toBe(3);
  });
});

describe("DiscothequeClient — la couverture quand une image existe", () => {
  it("charge la VRAIE illustration du single, pas un repli", () => {
    const singleAvecImage: Single[] = [
      single({ jour: "2026-08-24", minutesUne: 100, src: "/pochettes/vedette.png" }),
    ];
    const html = renderToStaticMarkup(
      <DiscothequeClient singles={singleAvecImage} albums={[]} discographies={[]} />,
    );
    expect(html).toContain("<picture");
    expect(html).toContain("/pochettes/vedette.png");
    expect(html).not.toContain("fonds-repli--couverture");
  });

  it("pose l'étiquette du disque dessus — sigle, date, et la couleur du parti", () => {
    const html = renderToStaticMarkup(
      <DiscothequeClient
        singles={[single({ jour: "2026-08-24", minutesUne: 100, src: "/pochettes/vedette.png" })]}
        albums={[]}
        discographies={[]}
      />,
    );
    expect(html).toMatch(/class="pochette-pastille-sigle">[^<]+<\/b>/);
    expect(html).toMatch(/class="pochette-pastille-date">22 août<\/b>/);
    expect(html).toContain('class="pochette-pastille" style="--party:');
  });

});

describe("DiscothequeClient — sections vides", () => {
  it("le dit en toutes lettres plutôt que de laisser un trou muet", () => {
    const html = renderToStaticMarkup(
      <DiscothequeClient singles={[]} albums={[]} discographies={[]} />,
    );
    expect(html).toContain("Aucun single");
  });
});
