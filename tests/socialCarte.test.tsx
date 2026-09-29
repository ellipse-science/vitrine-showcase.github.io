import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Carte, CartePublication, Infobulle, cadreChemin, commentaires, suggestions } from "@/components/interactive/SocialClient";
import {
  cleCirco,
  construireCarte,
  construireFil,
  construirePageCirco,
  construireSocial,
  joindreCompteurs,
  sansGrasUnicode,
  slugCirco,
  urlCompte,
  type FondCarte,
} from "@/lib/data/social";
import { classementAudience, integration, meneur, type MesureAudience } from "@/lib/data/social-calc";
import { nombreFr, nombreGrand } from "@/lib/data/social-meta";
import { CandidatsCirco } from "@/components/interactive/CircoPage";
import fond from "@/lib/geo/circonscriptions-2026.json";

// Carte des circonscriptions et vignettes du palmarès. Ce qui doit être
// prouvé : la jointure par nom résiste aux tirets typographiques du raffineur,
// le parti « en tête » suit la période et les filtres, la fiche dit qui est
// suivi sans rien inventer, et une vignette n'est servie que si le build l'a
// rapatriée.
const base = {
  releve: "2026-09-29 12:40", calcule_le: "2026-09-29 13:54", candidatures_parti: 127,
  publications_7j: 0, jaime_7j: 0, publications_campagne: 0, jaime_campagne: 0, derniere_publication: null,
};
const comptes = [
  { ...base, compte: "facebook:qs", plateforme: "facebook", pseudo: "AnjouQS", candidat: "Alice", parti: "QS", circonscription: "Anjou–Louis-Riel", type: "candidat", abonnes: 1200, publications_7j: 5, jaime_7j: 50, publications_campagne: 10, jaime_campagne: 100 },
  { ...base, compte: "instagram:qs", plateforme: "instagram", pseudo: "anjou.qs", candidat: "Alice", parti: "QS", circonscription: "Anjou–Louis-Riel", type: "candidat", abonnes: 300, publications_7j: 1, jaime_7j: 40, publications_campagne: 2, jaime_campagne: 80 },
  { ...base, compte: "facebook:caq", plateforme: "facebook", pseudo: "AnjouCAQ", candidat: "Bruno", parti: "CAQ", circonscription: "Anjou–Louis-Riel", type: "candidat", abonnes: 900, publications_7j: 2, jaime_7j: 900, publications_campagne: 30, jaime_campagne: 2000 },
  // un compte de parti n'entre pas dans les fiches
  { ...base, compte: "facebook:pq", plateforme: "facebook", pseudo: "lepartiquebecois", candidat: "Parti québécois", parti: "PQ", circonscription: null, type: "parti", abonnes: 99 },
];
const jours = [
  { jour: "2026-09-27", parti: "QS", plateforme: "facebook", type: "candidat", publications: 5, jaime: 5, commentaires: 1 },
  { jour: "2026-09-28", parti: "QS", plateforme: "facebook", type: "candidat", publications: 5, jaime: 5, commentaires: 1 },
];

describe("fond de carte (donnée de référence)", () => {
  it("couvre les 127 circonscriptions de la carte électorale 2026, avec encarts", () => {
    const f = fond as FondCarte;
    expect(f.circonscriptions).toHaveLength(127);
    expect(new Set(f.circonscriptions.map((c) => c.code)).size).toBe(127);
    expect(f.circonscriptions.every((c) => /^M-?\d/.test(c.d))).toBe(true);
    expect(Object.keys(f.encarts).sort()).toEqual(["montreal", "quebec"]);
  });
});

describe("jointure et adresses", () => {
  it("les tirets et apostrophes typographiques ne cassent pas la jointure", () => {
    expect(cleCirco("Anjou–Louis-Riel")).toBe(cleCirco("Anjou-Louis-Riel"));
    expect(cleCirco("Arthabaska-L’Érable")).toBe(cleCirco("Arthabaska-L'Érable"));
  });

  it("l'adresse d'un compte est reconstruite de son pseudo, jamais d'un pseudo douteux", () => {
    expect(urlCompte("tiktok", "@farnellmorisset")).toBe("https://www.tiktok.com/@farnellmorisset");
    expect(urlCompte("instagram", "anjou.qs")).toBe("https://www.instagram.com/anjou.qs/");
    expect(urlCompte("facebook", "a/b?c")).toBeNull();
    expect(urlCompte("facebook", null)).toBeNull();
  });
});

describe("fiches et parti en tête", () => {
  const carte = construireCarte(comptes, fond as FondCarte)!;
  const anjou = carte.circos.find((c) => cleCirco(c.nom) === cleCirco("Anjou-Louis-Riel"))!;

  it("rattache les comptes de candidat à leur circonscription, avec le nom typographique", () => {
    expect(anjou.nom).toBe("Anjou–Louis-Riel");
    expect(anjou.comptes.map((c) => `${c.party}:${c.plateforme}`)).toEqual(["caq:facebook", "qs:facebook", "qs:instagram"]);
    expect(carte.circos.flatMap((c) => c.comptes).some((c) => c.party === "pq")).toBe(false);
  });

  it("le parti en tête est celui qui reçoit le plus de j'aime, pas celui qui publie le plus", () => {
    const tous = ["facebook", "instagram", "tiktok"] as const;
    const partis = ["qs", "caq", "pq", "plq", "pcq"] as const;
    // 7 jours : QS publie plus (6 contre 2) mais la CAQ reçoit plus de j'aime (900 contre 90)
    expect(meneur(anjou.comptes, "7j", tous, partis).party).toBe("caq");
    // sur Instagram seul, QS (40 j'aime) ; la période change les totaux
    expect(meneur(anjou.comptes, "7j", ["instagram"], partis).party).toBe("qs");
    expect(meneur(anjou.comptes, "campagne", tous, partis).jaime).toBe(2180);
  });

  it("et les filtres : sans la CAQ, QS mène ; égalité parfaite ou rien, pas de meneur", () => {
    expect(meneur(anjou.comptes, "campagne", ["facebook", "instagram", "tiktok"], ["qs", "pq"]).party).toBe("qs");
    expect(meneur(anjou.comptes, "7j", ["tiktok"], ["qs", "caq"]).party).toBeNull();
    const egal = anjou.comptes.map((c) => ({ ...c, publications7j: 1, jaime7j: 5 })).filter((c) => c.plateforme === "facebook");
    expect(meneur(egal, "7j", ["facebook"], ["qs", "caq"]).party).toBeNull();
  });

  it("rend null sans fond de carte ou sans compte de candidat", () => {
    expect(construireCarte(comptes, null)).toBeNull();
    expect(construireCarte(comptes.slice(3), fond as FondCarte)).toBeNull();
  });

  it("la fiche nomme les candidats suivis, les comptes et la source, sans valeur vide", () => {
    const data = construireSocial(comptes, jours, [], fond as FondCarte)!;
    const html = renderToStaticMarkup(
      <Carte data={data} plateformes={["facebook", "instagram", "tiktok"]} partis={data.partis} />,
    );
    expect(html).toContain('id="sc-circo-');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain("<select");
    expect(html).toContain("Anjou–Louis-Riel");
    expect(html).toContain("dgeq.org");
    expect(html).not.toMatch(/undefined|NaN/);
  });
});

describe("vignettes du palmarès", () => {
  const ligne = {
    jour: "2026-09-27", plateforme: "instagram", parti: "QS", type: "candidat", candidat: "Alice", pseudo: "anjou.qs",
    url: "https://www.instagram.com/p/abc/", texte: "Bonjour", jaime: 10, commentaires: 1, post_id: "abc",
  };
  const vignette = (v: string | null, dispo: boolean) =>
    construireSocial(comptes, jours, [{ ...ligne, vignette: v }], null, () => dispo)!.palmares[0].vignette;

  it("servie seulement si le build l'a rapatriée", () => {
    expect(vignette("social/instagram/abc.jpg", true)).toBe("/data/generated-art/social/instagram/abc.jpg");
    expect(vignette("social/instagram/abc.jpg", false)).toBeNull();
    expect(vignette(null, true)).toBeNull();
  });

  it("une clé hors du motif attendu est ignorée", () => {
    expect(vignette("../../etc/passwd", true)).toBeNull();
    expect(vignette("social/youtube/abc.jpg", true)).toBeNull();
  });
});

describe("fil d'une circonscription", () => {
  const r = {
    circonscription: "Anjou–Louis-Riel", plateforme: "facebook", parti: "QS", type: "candidat", candidat: "Alice",
    pseudo: "AnjouQS", url: "https://www.facebook.com/p/1", texte: "Bonjour", jaime: 3, commentaires: 1, post_id: "1",
  };
  const fil = construireFil(
    [
      { ...r, jour: "2026-09-20", media_type: "texte" },
      { ...r, jour: "2026-09-28", media_type: "video", vignette: "social/facebook/2.jpg", post_id: "2" },
      { ...r, jour: "2026-09-28", parti: "XYZ" }, // parti hors des cinq : écarté
    ],
    (cle) => cle === "social/facebook/2.jpg",
  ).get(cleCirco("Anjou-Louis-Riel"))!;

  it("rattaché par nom normalisé, plus récent d'abord, hors des cinq partis écarté", () => {
    expect(fil.map((p) => p.jour)).toEqual(["2026-09-28", "2026-09-20"]);
    expect(fil[0].media).toBe("video");
    expect(fil[0].vignette).toBe("/data/generated-art/social/facebook/2.jpg");
  });

  it("vidéo avec vignette : ▶ en surimpression ; sans image : emplacement ▶ + logo ; texte : logo seul", () => {
    const rendu = (p: (typeof fil)[number]) =>
      renderToStaticMarkup(<CartePublication partiInfo={construireSocial(comptes, jours, [], null)!.partiInfo} p={p} />);
    const avec = rendu(fil[0]);
    expect(avec).toContain("<img");
    expect(avec).toContain("social-lecture");
    expect(avec).toContain('aria-label="Vidéo de Alice sur Facebook"');
    // Vidéo intégrable : un bouton qui ouvre le lecteur, sans iframe avant le clic.
    expect(avec).not.toContain("<iframe");
    const tiktok = rendu({ ...fil[0], plateforme: "tiktok", url: "https://www.tiktok.com/@a/video/7555123456789012345" });
    expect(tiktok).toContain('aria-label="Lire la vidéo de Alice (TikTok)"');
    expect(tiktok).toContain("<dialog");
    expect(tiktok).not.toContain("<iframe");
    const sans = rendu({ ...fil[0], vignette: null });
    expect(sans).toContain("social-media-vide video");
    expect(sans).toContain("social-lecture");
    // Publication texte sans image : carte compacte, une pastille à la place du média.
    const texte = rendu(fil[1]);
    expect(texte).not.toContain("social-lecture");
    expect(texte).toContain("social-media-pastille");
    expect(texte).toContain('href="https://www.facebook.com/p/1"');
  });
});

describe("lecteur intégré", () => {
  it("adresse du lecteur officiel de chaque plateforme", () => {
    expect(integration("tiktok", "https://www.tiktok.com/@ericduhaime_pcq/video/7555123456789012345")?.src).toBe(
      "https://www.tiktok.com/embed/v2/7555123456789012345",
    );
    expect(integration("instagram", "https://www.instagram.com/reel/DPabc12_-x/")?.src).toBe(
      "https://www.instagram.com/reel/DPabc12_-x/embed",
    );
    const fb = integration("facebook", "https://www.facebook.com/reel/1103447469038415");
    expect(fb).toEqual({
      src: "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1103447469038415&show_text=false",
      format: "portrait",
    });
    expect(integration("facebook", "https://www.facebook.com/x/posts/pfbid0abc")?.src).toContain("/plugins/post.php?href=");
  });

  it("rien pour une adresse qui ne s'y prête pas", () => {
    expect(integration("tiktok", "https://www.tiktok.com/@a")).toBeNull();
    expect(integration("facebook", "https://evil.example/facebook.com/reel/1")).toBeNull();
    expect(integration("instagram", null)).toBeNull();
  });
});

describe("infobulle : dernière publication", () => {
  it("la tête du fil de la circonscription, texte coupé", () => {
    const long = "x".repeat(200);
    const f = construireFil([
      { circonscription: "Anjou-Louis-Riel", jour: "2026-09-28", plateforme: "tiktok", parti: "QS", type: "candidat",
        candidat: "Alice", pseudo: "a", url: null, texte: long, jaime: 1, commentaires: 0 },
    ]);
    const carte = construireCarte(comptes, fond as FondCarte, f)!;
    const d = carte.circos.find((c) => cleCirco(c.nom) === cleCirco("Anjou-Louis-Riel"))!.derniere!;
    expect(d.jour).toBe("2026-09-28");
    expect(d.plateforme).toBe("tiktok");
    expect(d.extrait.length).toBeLessThanOrEqual(90);
    expect(carte.circos.filter((c) => c.derniere).length).toBe(1);
  });
});

describe("recherche sur la carte", () => {
  const data = construireSocial(comptes, jours, [], fond as FondCarte)!;
  it("insensible aux accents, circonscription et candidat (sa circonscription en sous-titre)", () => {
    const circo = suggestions(data, "anjou louis");
    expect(circo[0]).toMatchObject({ nom: "Anjou–Louis-Riel" });
    const cand = suggestions(data, "BRUNO");
    expect(cand).toHaveLength(1);
    expect(cand[0].sous).toBe("Anjou–Louis-Riel · CAQ");
    expect(suggestions(data, "rimouski")[0].nom).toBe("Rimouski");
    expect(suggestions(data, "trois-rivieres")[0].nom).toBe("Trois-Rivières");
  });
  it("8 suggestions au plus, rien sous deux lettres", () => {
    expect(suggestions(data, "sa").length).toBeLessThanOrEqual(8);
    expect(suggestions(data, "s")).toEqual([]);
  });
});

describe("pages de circonscription", () => {
  it("slug stable, comme la démo", () => {
    expect(slugCirco("Anjou–Louis-Riel")).toBe("anjou-louis-riel");
    expect(slugCirco("Arthabaska-L’Érable")).toBe("arthabaska-l-erable");
    expect(slugCirco("Maurice-Richard")).toBe("maurice-richard");
  });

  it("candidats, comptes, activité depuis le déclenchement ; séries masquées sans la table", () => {
    const page = construirePageCirco({ nom: "Anjou-Louis-Riel", region: "Montréal" }, comptes, [], null, "2026-09-28");
    expect(page.nom).toBe("Anjou–Louis-Riel");
    expect(page.candidats.map((c) => `${c.party}:${c.nom}`)).toEqual(["caq:Bruno", "qs:Alice"]);
    const alice = page.candidats.find((c) => c.nom === "Alice")!;
    expect(alice.comptes.map((c) => c.plateforme)).toEqual(["facebook", "instagram"]);
    expect(alice.publications).toBe(12);
    expect(alice.serie).toBeNull();
    expect(page.sansCompte).toEqual(["plq", "pq", "pcq"]);
  });

  it("avec la table : une série par candidat, ses comptes additionnés, jours sans activité à 0", () => {
    const page = construirePageCirco({ nom: "Anjou-Louis-Riel", region: "Montréal" }, comptes, [], [
      { compte: "facebook:qs", jour: "2026-08-02", publications: 2, jaime: 10 },
      { compte: "instagram:qs", jour: "2026-08-02", publications: 1, jaime: 5 },
    ], "2026-08-03");
    const alice = page.candidats.find((c) => c.nom === "Alice")!;
    expect(alice.serie).toEqual([
      { jour: "2026-08-01", publications: 0, jaime: 0 },
      { jour: "2026-08-02", publications: 3, jaime: 15 },
      { jour: "2026-08-03", publications: 0, jaime: 0 },
    ]);
  });
});

describe("audience : classements sur la période", () => {
  const base = { party: "qs" as const, plateforme: "facebook" as const, type: "candidat" as const };
  const items = [
    { ...base, nom: "A", abonnes: 100 },
    { ...base, nom: "B", abonnes: null },
    { ...base, nom: "C", abonnes: 50 },
  ];
  // [compte, jour, publications, j'aime, commentaires]
  const jours: [number, number, number, number, number][] = [
    [0, 0, 2, 900, 3],
    [1, 1, 6, 300, 1],
    [1, 5, 4, 200, 0],
    [2, 5, 1, 1, 0],
  ];
  const f = { plateformes: ["facebook" as const], partis: ["qs" as const], types: ["candidat" as const], d0: 0, d1: 4 };
  it("abonnés au dernier relevé ; sans valeur ou à 0, absent", () => {
    expect(classementAudience(items, jours, "abonnes", f).map((x) => x.item.nom)).toEqual(["A", "C"]);
  });
  it("les autres mesures suivent la période, comme les tuiles", () => {
    expect(classementAudience(items, jours, "jaime", f).map((x) => [x.item.nom, x.valeur])).toEqual([["A", 900], ["B", 300]]);
    expect(classementAudience(items, jours, "jaime", { ...f, d0: 5, d1: 5 }).map((x) => x.valeur)).toEqual([200, 1]);
    expect(classementAudience(items, jours, "commentaires", f).map((x) => x.valeur)).toEqual([3, 1]);
  });
  it("moyennes : 5 publications au moins sur la période", () => {
    expect(classementAudience(items, jours, "parPublication", f)).toEqual([{ item: items[1], valeur: 50 }]);
    expect(classementAudience(items, jours, "parJour", f)).toEqual([{ item: items[1], valeur: 6 / 5 }]);
    expect(classementAudience(items, jours, "parJour", { ...f, d0: 0, d1: 5 })).toEqual([{ item: items[1], valeur: 10 / 6 }]);
  });
  it("40 comptes au plus", () => {
    const beaucoup = Array.from({ length: 80 }, (_, i) => ({ ...base, nom: `x${i}`, abonnes: i + 1 }));
    expect(classementAudience(beaucoup, [], "abonnes", f)).toHaveLength(40);
  });
});

describe("carte zoomable et cartes de publication", () => {
  it("cadre d'un tracé précalculé, pour le zoom vers une circonscription", () => {
    expect(cadreChemin("M10 20l5 0 0 5-5 0z")).toEqual({ x: 10, y: 20, w: 5, h: 5 });
    expect(cadreChemin("M0 0l2 2zM10 10l-1 3z")).toEqual({ x: 0, y: 0, w: 10, h: 13 });
  });
  it("accord : 0 et 1 commentaire, 2 commentaires", () => {
    expect(commentaires(1)).toBe("1\u00a0commentaire");
    expect(commentaires(0)).toBe("0\u00a0commentaire");
    expect(commentaires(2)).toBe("2\u00a0commentaires");
  });
  it("partage sans texte ni image : carte compacte et libellé, pas d'emplacement vide", () => {
    const partiInfo = construireSocial(comptes, jours, [], null)!.partiInfo;
    const html = renderToStaticMarkup(
      <CartePublication
        partiInfo={partiInfo}
        p={{ jour: "2026-09-28", nom: "Sonia", party: "pq", plateforme: "facebook", url: "https://www.facebook.com/x/posts/1",
          texte: "", jaime: 4, commentaires: 1, vignette: null, media: "texte", nature: "partage", origine: null }}
      />,
    );
    expect(html).toContain("compacte");
    expect(html).toContain("Publication partagée");
    expect(html).not.toContain("social-media-vide");
    expect(html).toContain("1\u00a0commentaire ·".replace(" ·", ""));
  });
});

describe("fil complet : contenu et compteurs", () => {
  it("les compteurs rejoignent le contenu par l'identifiant ; sans compteur, 0", () => {
    const contenu = [
      { id: "aaa111bbb222", circonscription: "Anjou–Louis-Riel", jour: "2026-09-28", plateforme: "facebook", parti: "QS",
        candidat: "Alice", url: "https://www.facebook.com/p/1", texte: "Bonjour", nature: "texte" },
      { id: "ccc333ddd444", circonscription: "Anjou–Louis-Riel", jour: "2026-09-27", plateforme: "tiktok", parti: "QS",
        candidat: "Alice", url: null, texte: "", nature: "video" },
    ];
    const rows = joindreCompteurs(contenu, { aaa111bbb222: [12, 3] });
    expect(rows.map((r) => [r.jaime, r.commentaires])).toEqual([[12, 3], [0, 0]]);
    const fil = construireFil(rows).get(cleCirco("Anjou-Louis-Riel"))!;
    expect(fil.map((p) => p.jour)).toEqual(["2026-09-28", "2026-09-27"]);
    expect(fil[0].jaime).toBe(12);
  });
});

describe("audience : toutes les combinaisons de filtres", () => {
  // Jeu synthétique reproductible : 150 comptes, 60 jours, des zéros et des
  // comptes sans abonnés ; le résultat est comparé à un calcul naïf.
  let graine = 7;
  const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const PF = ["facebook", "instagram", "tiktok"] as const;
  const PA = ["plq", "caq", "qs", "pq", "pcq"] as const;
  const TY = ["candidat", "parti"] as const;
  const comptes = Array.from({ length: 150 }, (_, i) => ({
    nom: `c${i}`,
    plateforme: PF[i % 3],
    party: PA[Math.floor(hasard() * 5)],
    type: TY[hasard() < 0.85 ? 0 : 1],
    abonnes: hasard() < 0.1 ? null : Math.floor(hasard() * 5000),
  }));
  const N = 60;
  const jours: [number, number, number, number, number][] = [];
  comptes.forEach((_, c) => {
    for (let j = 0; j < N; j++) {
      if (hasard() < 0.3) jours.push([c, j, 1 + Math.floor(hasard() * 3), Math.floor(hasard() * 200), Math.floor(hasard() * 20)]);
    }
  });
  const periodes = { "7 j": [N - 7, N - 1], "30 j": [N - 30, N - 1], campagne: [N - 34, N - 1], tout: [0, N - 1] } as const;
  const mesures: MesureAudience[] = ["abonnes", "publications", "parJour", "jaime", "commentaires", "parPublication"];
  const sous = <T,>(l: readonly T[]) => Array.from({ length: 2 ** l.length - 1 }, (_, m) => l.filter((_, i) => (m + 1) & (1 << i)));
  const naif = (mesure: MesureAudience, f: { plateformes: string[]; partis: string[]; types: string[]; d0: number; d1: number }) => {
    const vals: number[] = [];
    comptes.forEach((a, c) => {
      if (!f.plateformes.includes(a.plateforme) || !f.partis.includes(a.party) || !f.types.includes(a.type)) return;
      let p = 0, l = 0, k = 0;
      for (const r of jours) if (r[0] === c && r[1] >= f.d0 && r[1] <= f.d1) { p += r[2]; l += r[3]; k += r[4]; }
      const v =
        mesure === "abonnes" ? a.abonnes
        : mesure === "publications" ? p
        : mesure === "jaime" ? l
        : mesure === "commentaires" ? k
        : p < 5 ? null
        : mesure === "parPublication" ? l / p
        : p / (f.d1 - f.d0 + 1);
      if (v != null && v > 0) vals.push(v);
    });
    return vals.sort((a, b) => b - a);
  };

  it("affiche min(40, comptes éligibles), dans l'ordre, pour chaque combinaison", () => {
    let combinaisons = 0;
    for (const plateformes of sous(PF))
      for (const partis of sous(PA))
        for (const types of sous(TY))
          for (const mesure of mesures)
            for (const [d0, d1] of Object.values(periodes)) {
              const f = { plateformes: [...plateformes], partis: [...partis], types: [...types], d0, d1 };
              const attendu = naif(mesure, f);
              const obtenu = classementAudience(comptes, jours, mesure, f as never).map((x) => x.valeur);
              expect(obtenu.length).toBe(Math.min(40, attendu.length));
              expect(obtenu).toEqual(attendu.slice(0, 40));
              combinaisons++;
            }
    expect(combinaisons).toBe(7 * 31 * 3 * 6 * 4);
  });
});

describe("infobulle : grands nombres et noms longs", () => {
  it("espace fine insécable entre les milliers, nom long tronqué par la mise en page", () => {
    expect(nombreFr(1432983)).toBe("1\u202f432\u202f983");
    const data = construireSocial(comptes, jours, [], fond as FondCarte)!;
    const circo = {
      ...data.carte!.circos.find((c) => c.comptes.length > 0)!,
      comptes: [{ nom: "Marie-Ève Laflamme-Beauchemin de la Rivière-du-Loup", party: "pcq" as const, plateforme: "facebook" as const,
        url: null, abonnes: 10, publications7j: 3, jaime7j: 1432983, publicationsCampagne: 3, jaimeCampagne: 1432983 }],
    };
    const html = renderToStaticMarkup(
      <Infobulle data={data} circo={circo} m={meneur(circo.comptes, "7j", ["facebook"], ["pcq"])} periode="7j"
        plateformes={["facebook", "instagram", "tiktok"]} partis={data.partis} x={10} y={10} largeur={800} hauteur={600} />,
    );
    expect(html).toContain("1\u202f432\u202f983");
    expect(html).toContain('class="social-infobulle-nom"');
    expect(html).toContain("Marie-Ève Laflamme-Beauchemin de la Rivière-du-Loup");
  });
});

describe("pages de circonscription : candidats officiels et cohérence", () => {
  const f = fond as FondCarte;
  const PARTIS = ["PLQ", "CAQ", "QS", "PQ", "PCQ"];
  // Les 127 circonscriptions, cinq candidatures chacune (noms synthétiques ;
  // les noms de circonscription réels, en tirets typographiques, comme la liste officielle).
  const officiels = f.circonscriptions.flatMap((c) =>
    PARTIS.map((p) => ({ circonscription: c.nom.replace(/-/g, "–"), parti: p, candidat: `${p} de ${c.nom}` })),
  );
  const cj = [
    { compte: "facebook:qs", jour: "2026-08-10", publications: 4, jaime: 40, commentaires: 1 },
    { compte: "facebook:qs", jour: "2026-09-01", publications: 3, jaime: 30, commentaires: 2 },
    { compte: "instagram:qs", jour: "2026-09-02", publications: 1, jaime: 5, commentaires: 0 },
  ];

  it("les 127 pages montrent exactement leurs cinq candidats officiels, nommés, même sans compte", () => {
    for (const c of f.circonscriptions) {
      const page = construirePageCirco(c, comptes, [], cj, "2026-09-28", officiels);
      expect(page.candidats.map((x) => x.party)).toEqual(["plq", "caq", "qs", "pq", "pcq"]);
      expect(page.candidats.every((x) => x.nom.endsWith(`de ${c.nom}`))).toBe(true);
      expect(page.sansCompte).toEqual([]);
    }
  });

  it("chaque candidat : total depuis le 1er août ≥ total depuis le déclenchement (une seule source)", () => {
    for (const c of f.circonscriptions) {
      const page = construirePageCirco(c, comptes, [], cj, "2026-09-28", officiels);
      for (const x of page.candidats) {
        const serie = (x.serie ?? []).reduce((t, j) => t + j.publications, 0);
        expect(serie).toBeGreaterThanOrEqual(x.publications);
      }
    }
    const anjou = construirePageCirco({ nom: "Anjou-Louis-Riel", region: "Montréal" }, comptes, [], cj, "2026-09-28", officiels);
    const qs = anjou.candidats.find((x) => x.party === "qs")!;
    expect([qs.publications, qs.jaime, qs.commentaires]).toEqual([4, 35, 2]); // depuis le 27 août seulement
    expect(qs.parPlateforme).toEqual({ facebook: 3, instagram: 1, tiktok: 0 });
    expect((qs.serie ?? []).reduce((t, j) => t + j.publications, 0)).toBe(8);
    expect(anjou.candidats.find((x) => x.party === "plq")!.comptes).toEqual([]);
  });

  it("gras Unicode ramené aux lettres ordinaires, accents et émojis intacts", () => {
    expect(sansGrasUnicode("𝗡𝗼𝘀 𝗲𝗻𝗴𝗮𝗴𝗲𝗺𝗲𝗻𝘁𝘀")).toBe("Nos engagements");
    expect(sansGrasUnicode("Été 🎉 𝐇𝐨𝐦𝐦𝐚𝐠𝐞")).toBe("Été 🎉 Hommage");
  });
});

describe("mesures communes : abonnés et par jour", () => {
  it("par jour divise par la durée ; les abonnés viennent du dernier relevé", async () => {
    const { valeur, lignesAbonnes, totaux } = await import("@/lib/data/social-calc");
    expect(valeur({ publications: 70, jaime: 0, commentaires: 0 }, "parJour", 7)).toBe(10);
    const data = construireSocial(comptes, jours, [], null)!;
    const f = { d0: 0, d1: data.jours.length - 1, plateformes: ["facebook" as const, "instagram" as const, "tiktok" as const], partis: data.partis, types: ["candidat" as const, "parti" as const] };
    expect(totaux(lignesAbonnes(data, f)).publications).toBe(1200 + 300 + 900 + 99);
    expect(totaux(lignesAbonnes(data, { ...f, partis: ["qs"] })).publications).toBe(1500);
  });
});

describe("cartes candidat : tri, pastille, chiffres", () => {
  const f = fond as FondCarte;
  const officiels = ["PLQ", "CAQ", "QS", "PQ", "PCQ"].map((p) => ({ circonscription: "Anjou–Louis-Riel", parti: p, candidat: `${p} Anjou` }));
  const cj = [
    { compte: "facebook:qs", jour: "2026-09-01", publications: 3, jaime: 30, commentaires: 2 },
    { compte: "facebook:caq", jour: "2026-09-02", publications: 1, jaime: 900, commentaires: 0 },
  ];
  const page = construirePageCirco(f.circonscriptions.find((c) => c.nom === "Anjou-Louis-Riel")!, comptes, [], cj, "2026-09-28", officiels);
  const partiInfo = construireSocial(comptes, jours, [], null)!.partiInfo;
  const html = renderToStaticMarkup(<CandidatsCirco page={page} partiInfo={partiInfo} />);
  const texte = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("classées par j'aime, sans compte à la fin dans l'ordre des partis", () => {
    const ordre = [...html.matchAll(/class="social-nom">([^<]+)</g)].map((m) => m[1]);
    expect(ordre).toEqual(["CAQ Anjou", "QS Anjou", "PLQ Anjou", "PQ Anjou", "PCQ Anjou"]);
  });
  it("pastille de rang en j'aime, seulement pour les candidats avec des données", () => {
    expect(html).toContain('aria-label="1er sur 2 en j’aime depuis le déclenchement"');
    expect(html).toContain('aria-label="2e sur 2 en j’aime depuis le déclenchement"');
    expect(html.match(/class="circo-pastille/g)).toHaveLength(2);
    expect(html).toContain("circo-pastille premier");
  });
  it("trois chiffres (publications, j'aime, commentaires), plus de bascule ni de moyennes", () => {
    expect(texte).toContain("Publications");
    expect(texte).not.toContain("Par jour");
    expect(texte).not.toContain("J’aime par publication");
    expect(html).not.toContain('aria-label="Mesure des séries');
    expect(texte).toContain("j’aime depuis le 1er");
  });
  it("grands chiffres : séparateur de milliers visible (espace insécable)", () => {
    expect(nombreGrand(1432983)).toBe("1\u00a0432\u00a0983");
  });
});

describe("publications sans vignette : l'icône de leur nature", () => {
  const partiInfo = construireSocial(comptes, jours, [], null)!.partiInfo;
  const base = { jour: "2026-09-28", nom: "Charles Page", party: "pq" as const, plateforme: "instagram" as const,
    url: "https://www.instagram.com/p/abc/", texte: "", jaime: 5, commentaires: 0, vignette: null, media: "image" as const };
  it("carrousel et photo : leur icône et leur libellé, pas le document", () => {
    const carrousel = renderToStaticMarkup(<CartePublication partiInfo={partiInfo} p={{ ...base, nature: "carrousel" }} />);
    expect(carrousel).toContain("Carrousel sans texte");
    expect(carrousel).toContain("M7 4h13v13H7V4z");
    const photo = renderToStaticMarkup(<CartePublication partiInfo={partiInfo} p={{ ...base, nature: "photo" }} />);
    expect(photo).toContain("Photo sans texte");
  });
});
