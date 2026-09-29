import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Carte, CartePublication } from "@/components/interactive/SocialClient";
import { cleCirco, construireCarte, construireFil, construireSocial, urlCompte, type FondCarte } from "@/lib/data/social";
import { integration, meneur } from "@/lib/data/social-calc";
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
    expect(html).toContain("<option");
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
      renderToStaticMarkup(<CartePublication data={construireSocial(comptes, jours, [], null)!} p={p} />);
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
    const texte = rendu(fil[1]);
    expect(texte).not.toContain("social-lecture");
    expect(texte).toContain("social-media-coin");
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
