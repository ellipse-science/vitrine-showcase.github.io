import { describe, it, expect, vi, beforeEach } from "vitest";

// Module expérimental « Les candidats sur les réseaux ». Le chargeur assemble
// les quatre tables du raffineur agora-social ; ce qui doit être prouvé ici,
// c'est ce que le module AFFIRME et que la donnée seule ne garantit pas :
//
//   - tant que le raffineur n'a rien publié, le module est absent (null), sans
//     casser le build ;
//   - la présence rapporte les candidatures officielles, pas les comptes ;
//   - un compte de parti porte le nom officiel du parti ;
//   - les séries partent du déclenchement et s'arrêtent au dernier jour
//     COMPLET : le jour du dernier relevé n'est collecté qu'en partie, et
//     l'afficher dessinerait une chute qui n'existe pas ;
//   - le palmarès ne garde que les sept derniers jours de relevé.
//
// Lignes RÉELLES de l'essai à blanc du raffineur (29 septembre 2026).
const readFileMock = vi.fn();
vi.mock("node:fs/promises", () => ({
  default: { readFile: (...a: unknown[]) => readFileMock(...a) },
}));

const comptes = [
  { compte: "instagram:partiquebecois", plateforme: "instagram", pseudo: "partiquebecois", candidat: "Parti québécois", parti: "PQ", circonscription: null, type: "parti", abonnes: 365846, releve: "2026-09-28 10:00", calcule_le: "2026-09-29 13:54" },
  { compte: "facebook:eduhaime", plateforme: "facebook", pseudo: "eduhaime", candidat: "Éric Duhaime", parti: "PCQ", circonscription: "Bellechasse", type: "candidat", abonnes: 227675, releve: "2026-09-29 12:40", calcule_le: "2026-09-29 13:54" },
  { compte: "tiktok:@farnellmorisset", plateforme: "tiktok", pseudo: "@farnellmorisset", candidat: "Farnell Morisset", parti: "PLQ", circonscription: "Taschereau", type: "candidat", abonnes: 119900, releve: "2026-09-28 20:00", calcule_le: "2026-09-29 13:54" },
];
const jours = [
  { jour: "2026-09-27", parti: "CAQ", plateforme: "facebook", type: "candidat", publications: 170, jaime: 15541, commentaires: 5564 },
  { jour: "2026-09-27", parti: "CAQ", plateforme: "instagram", type: "candidat", publications: 55, jaime: 1249, commentaires: 45 },
  { jour: "2026-09-27", parti: "QS", plateforme: "facebook", type: "candidat", publications: 132, jaime: 8281, commentaires: 2256 },
  { jour: "2026-09-27", parti: "QS", plateforme: "instagram", type: "candidat", publications: 55, jaime: 10975, commentaires: 524 },
  { jour: "2026-09-29", parti: "CAQ", plateforme: "facebook", type: "candidat", publications: 8, jaime: 23, commentaires: 0 },
  { jour: "2026-09-29", parti: "QS", plateforme: "facebook", type: "candidat", publications: 30, jaime: 793, commentaires: 76 },
];
const presence = [
  { parti: "QS", plateforme: "facebook", avec_compte: 100, candidats: 127, part: 0.7874 },
  { parti: "PLQ", plateforme: "facebook", avec_compte: 121, candidats: 127, part: 0.9528 },
  { parti: "PCQ", plateforme: "instagram", avec_compte: 14, candidats: 127, part: 0.1102 },
];
const palmares = [
  { jour: "2026-09-29", plateforme: "facebook", parti: "PQ", type: "candidat", candidat: "Meixia Maltais", pseudo: "meixiamaltaispq", url: "https://www.facebook.com/meixiamaltaispq/posts/pfbid0JY3ZCT68Zfz7AjCNitTvBgA7WSHHV6njVXsVh9fbsbdnHJkV4H15d9Qnm5EV4ezNl", texte: "Quel chemin parcouru depuis le début de cette campagne!", jaime: 581, commentaires: 144 },
  { jour: "2026-09-29", plateforme: "facebook", parti: "PQ", type: "parti", candidat: "Parti québécois", pseudo: "lepartiquebecois", url: "https://www.facebook.com/lepartiquebecois/posts/pfbid02TLAUotZFYVTaf7YffcrxBiStuk4kPXo9xWsgJ6fZ12nArEtij9f9EpdwpfkSWXMal", texte: "Une visite dans Orford qui termine bien le vote par anticipation", jaime: 450, commentaires: 21 },
  { jour: "2026-09-20", plateforme: "facebook", parti: "PQ", type: "parti", candidat: "Parti québécois", pseudo: "lepartiquebecois", url: "https://www.facebook.com/reel/1414952487442509/", texte: "Les joies du terrain", jaime: 5864, commentaires: 554 },
];

function servir(tables: Partial<Record<"comptes" | "publications_jour" | "presence" | "palmares", unknown[]>>) {
  readFileMock.mockImplementation((p: string) => {
    const nom = (["comptes", "publications_jour", "presence", "palmares"] as const).find((n) =>
      String(p).endsWith(`agora_social_${n}.json`),
    );
    const rows = nom ? tables[nom] : undefined;
    if (!rows) {
      const e = Object.assign(new Error(`ENOENT ${p}`), { code: "ENOENT" });
      return Promise.reject(e);
    }
    return Promise.resolve(JSON.stringify(rows));
  });
}

beforeEach(() => {
  readFileMock.mockReset();
  vi.resetModules();
});

const charger = async () => (await import("@/lib/data/social")).loadSocial();

describe("chargeur du module « Les candidats sur les réseaux »", () => {
  it("rend null tant que le raffineur n'a rien publié (fichiers absents)", async () => {
    servir({});
    expect(await charger()).toBeNull();
  });

  it("rend null sur des tables vides", async () => {
    servir({ comptes: [], publications_jour: [], presence: [], palmares: [] });
    expect(await charger()).toBeNull();
  });

  it("la présence rapporte les candidatures officielles", async () => {
    servir({ comptes, publications_jour: jours, presence, palmares });
    const d = (await charger())!;
    expect(d.presence.qs.facebook).toEqual({ avecCompte: 100, candidats: 127, part: 100 / 127 });
    expect(d.presence.pcq.instagram.part).toBeCloseTo(14 / 127);
    // Une case absente de la table vaut zéro, pas une erreur.
    expect(d.presence.caq.tiktok.avecCompte).toBe(0);
  });

  it("l'audience trie par abonnés, filtre par plateforme et nomme le parti en toutes lettres", async () => {
    servir({ comptes, publications_jour: jours, presence, palmares });
    const d = (await charger())!;
    expect(d.audience.toutes.map((a) => a.abonnes)).toEqual([365846, 227675, 119900]);
    expect(d.audience.toutes[0]).toMatchObject({ nom: "Parti québécois", estParti: true, party: "pq" });
    expect(d.audience.tiktok.map((a) => a.nom)).toEqual(["Farnell Morisset"]);
  });

  it("les séries partent du déclenchement et s'arrêtent au dernier jour complet", async () => {
    servir({ comptes, publications_jour: jours, presence, palmares });
    const d = (await charger())!;
    expect(d.jours[0]).toBe("2026-08-27");
    expect(d.jours.at(-1)).toBe("2026-09-28"); // le 29, jour du relevé, est partiel
    const i = d.jours.indexOf("2026-09-27");
    const caq = d.publications.toutes.find((s) => s.party === "caq")!;
    expect(caq.valeurs[i]).toBe(170 + 55);
    expect(d.publications.facebook.find((s) => s.party === "caq")!.valeurs[i]).toBe(170);
    expect(d.jaime.instagram.find((s) => s.party === "qs")!.valeurs[i]).toBe(10975);
    // Un parti sans ligne ce jour-là vaut zéro, pas un trou.
    expect(d.publications.toutes.find((s) => s.party === "pcq")!.valeurs[i]).toBe(0);
  });

  it("le palmarès ne garde que les sept derniers jours, du plus aimé au moins aimé", async () => {
    servir({ comptes, publications_jour: jours, presence, palmares });
    const d = (await charger())!;
    expect(d.palmaresDu).toBe("2026-09-23");
    expect(d.palmaresAu).toBe("2026-09-29");
    expect(d.palmares.toutes.map((p) => p.jaime)).toEqual([581, 450]); // le 20 septembre sort
    expect(d.palmares.toutes[1].nom).toBe("Parti québécois");
    expect(d.palmares.instagram).toEqual([]);
  });

  it("un palmarès absent ne masque pas le module", async () => {
    servir({ comptes, publications_jour: jours, presence });
    const d = await charger();
    expect(d).not.toBeNull();
    expect(d!.palmares.toutes).toEqual([]);
  });
});
