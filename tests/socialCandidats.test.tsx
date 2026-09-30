import { afterEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  chargeFil,
  chargeFilComplet,
  filtresModifies,
  Infobulle,
  InfobulleCompte,
  resumeFiltres,
  suggestionsCandidats,
  trouverCandidat,
} from "@/components/interactive/SocialClient";
import { CarteCandidat } from "@/components/interactive/CircoPage";
import {
  construirePageCandidat,
  construirePageCirco,
  construireSocial,
  slugCandidat,
  type FilItem,
  type FondCarte,
} from "@/lib/data/social";
import { AUDIENCE_MAX, classementAudience, meneur } from "@/lib/data/social-calc";
import fond from "@/lib/geo/circonscriptions-2026.json";

// Pages de candidat, infobulle et recherche de l'onglet Candidats, libellés de
// l'infobulle de la carte quand les filtres écartent tout.
const base = {
  releve: "2026-09-29 12:40", calcule_le: "2026-09-29 13:54", candidatures_parti: 127,
  publications_7j: 0, jaime_7j: 0, publications_campagne: 0, jaime_campagne: 0, derniere_publication: null,
};
const comptes = [
  { ...base, compte: "facebook:qs", plateforme: "facebook", pseudo: "AnjouQS", candidat: "Alice", parti: "QS", circonscription: "Anjou–Louis-Riel", type: "candidat", abonnes: 1200, publications_7j: 5, jaime_7j: 50 },
  { ...base, compte: "instagram:qs", plateforme: "instagram", pseudo: "anjou.qs", candidat: "Alice", parti: "QS", circonscription: "Anjou–Louis-Riel", type: "candidat", abonnes: 300, publications_7j: 1, jaime_7j: 40 },
  { ...base, compte: "facebook:caq", plateforme: "facebook", pseudo: "AnjouCAQ", candidat: "Bruno", parti: "CAQ", circonscription: "Anjou–Louis-Riel", type: "candidat", abonnes: 900, publications_7j: 2, jaime_7j: 900 },
  { ...base, compte: "facebook:pq", plateforme: "facebook", pseudo: "lepartiquebecois", candidat: "Parti québécois", parti: "PQ", circonscription: null, type: "parti", abonnes: 99 },
];
const jours = [
  { jour: "2026-09-27", parti: "QS", plateforme: "facebook", type: "candidat", publications: 5, jaime: 5, commentaires: 1 },
  { jour: "2026-09-28", parti: "QS", plateforme: "facebook", type: "candidat", publications: 5, jaime: 5, commentaires: 1 },
];
const f = fond as FondCarte;
const anjou = f.circonscriptions.find((c) => c.nom === "Anjou-Louis-Riel")!;
// Candidatures officielles : les 127 circonscriptions, cinq partis, noms accentués.
const PARTIS = ["PLQ", "CAQ", "QS", "PQ", "PCQ"];
const officiels = f.circonscriptions.flatMap((c) =>
  PARTIS.map((p) => ({
    circonscription: c.nom.replace(/-/g, "–"),
    parti: p,
    candidat: c.code === anjou.code ? ({ QS: "Alice", CAQ: "Bruno" } as Record<string, string>)[p] ?? `Élise ${p}` : `${p} de ${c.nom}`,
  })),
);
const data = construireSocial(comptes, jours, [], f, () => false, new Map(), null, officiels)!;

const pub = (party: FilItem["party"], plateforme: FilItem["plateforme"], jour: string, texte: string): FilItem => ({
  jour, nom: "x", party, plateforme, url: null, texte, jaime: 7, commentaires: 0, vignette: null, media: "texte",
});

describe("pages de candidat", () => {
  it("un slug stable et unique par candidature officielle : 635 pages", () => {
    expect(data.candidatures).toHaveLength(635);
    const slugs = data.candidatures!.map(([nom, , code]) => slugCandidat(nom, f.circonscriptions.find((c) => c.code === code)!.nom));
    expect(new Set(slugs).size).toBe(635);
    expect(slugCandidat("Serge Bergeron", "Jonquière")).toBe("serge-bergeron-jonquiere");
    expect(slugCandidat("Élise PQ", "Anjou–Louis-Riel")).toBe(slugCandidat("Élise PQ", "Anjou-Louis-Riel"));
  });

  it("le fil de la page : celui de la circonscription, restreint à son parti ; rang dans la circonscription", () => {
    const fil = [pub("qs", "facebook", "2026-09-28", "a"), pub("caq", "facebook", "2026-09-28", "b"), pub("qs", "instagram", "2026-09-27", "c")];
    const cj = [
      { compte: "facebook:qs", jour: "2026-09-01", publications: 3, jaime: 30, commentaires: 2 },
      { compte: "facebook:caq", jour: "2026-09-02", publications: 1, jaime: 900, commentaires: 0 },
    ];
    const page = construirePageCirco(anjou, comptes, fil, cj, "2026-09-28", officiels);
    const alice = page.candidats.find((c) => c.nom === "Alice")!;
    expect(alice.slug).toBe("alice-anjou-louis-riel");
    const p = construirePageCandidat({ code: anjou.code, page, tout: fil, connu: fil }, alice as typeof alice & { slug: string });
    expect(p.fil.map((x) => x.texte)).toEqual(["a", "c"]);
    expect(p.total).toBe(2);
    expect(p.rang).toBe(2);
    expect(p.nbActifs).toBe(2);
    expect(p.circo).toMatchObject({ slug: "anjou-louis-riel", code: anjou.code });
  });

  it("un candidat sans compte a sa page : « Aucun compte suivi »", () => {
    const page = construirePageCirco(anjou, comptes, [], null, "2026-09-28", officiels);
    const sans = page.candidats.find((c) => c.party === "pq")!;
    expect(sans.slug).toBe("elise-pq-anjou-louis-riel");
    const html = renderToStaticMarkup(
      <CarteCandidat c={sans} partiInfo={data.partiInfo} rang={null} nbActifs={2} jours={[]} campagne="" max={1} grand />,
    );
    expect(html).toContain("Aucun compte suivi");
    expect(html).toContain("<h2");
  });
});

describe("routes : 635 pages en dev, aucune en prod", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("dev : une page par candidature officielle publiée par le raffineur", async () => {
    vi.resetModules();
    const { generateStaticParams } = await import("@/app/reseaux/candidats/[slug]/page");
    const brut = (await import("@/public/data/agora/agora_social_candidats.json")).default as unknown[];
    const params = await generateStaticParams();
    expect(params).toHaveLength(brut.length);
    expect(brut.length).toBe(635);
    expect(new Set(params.map((p) => p.slug)).size).toBe(635);
    expect(params.every((p) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(p.slug))).toBe(true);
  }, 60_000);
  it("prod : la seule sentinelle, qui rend une 404", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "prod");
    vi.resetModules();
    const { generateStaticParams } = await import("@/app/reseaux/candidats/[slug]/page");
    expect(await generateStaticParams()).toEqual([{ slug: "indisponible" }]);
  });
});

describe("recherche de l'onglet Candidats", () => {
  it("porte sur les 635 candidatures, insensible aux accents et à la casse", () => {
    const r = suggestionsCandidats(data, "ELISE");
    expect(r.map((x) => x.nom)).toEqual(["Élise PCQ", "Élise PLQ", "Élise PQ"]);
    expect(suggestionsCandidats(data, "plq de")).toHaveLength(8); // 126 candidatures, 8 suggestions au plus
    expect(suggestionsCandidats(data, "plq de trois rivieres")[0].nom).toBe("PLQ de Trois-Rivières");
    expect(suggestionsCandidats(data, "alice")[0]).toMatchObject({ nom: "Alice", party: "qs", comptes: 2, fiche: "alice-anjou-louis-riel" });
    expect(suggestionsCandidats(data, "a")).toEqual([]);
  });
  it("un candidat sans compte le dit, pour mener droit à sa page", () => {
    const e = suggestionsCandidats(data, "elise pq").find((x) => x.code === anjou.code)!;
    expect(e.comptes).toBe(0);
    expect(e.sous).toContain("aucun compte suivi");
  });
  it("dans les 40 : sa page de pagination ; au-delà : son rang réel, à part", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      nom: `c${i}`, party: "qs" as const, plateforme: "facebook" as const, type: "candidat" as const, abonnes: 1000 - i, code: i,
    }));
    const complet = classementAudience(items, [], "abonnes", { plateformes: ["facebook"], partis: ["qs"], types: ["candidat"], d0: 0, d1: 0 }, Infinity);
    expect(complet).toHaveLength(60);
    expect(trouverCandidat(complet, { code: 25, party: "qs" }, 20)).toEqual({ index: 25, rang: 26, dans: true, page: 1 });
    expect(trouverCandidat(complet, { code: 25, party: "qs" }, 10)).toMatchObject({ page: 2 });
    expect(trouverCandidat(complet, { code: 52, party: "qs" }, 20)).toEqual({ index: 52, rang: 53, dans: false, page: null });
    expect(trouverCandidat(complet, { code: 52, party: "caq" }, 20)).toMatchObject({ rang: null, dans: false });
    expect(AUDIENCE_MAX).toBe(40);
  });
});

describe("infobulle d'un compte (onglet Candidats)", () => {
  const bulle = { index: 0, x: 0, y: 20, largeur: 900 };
  afterEach(() => vi.unstubAllGlobals());

  it("candidat : ses 10 dernières publications, sur sa plateforme, lues dans le fichier de sa circonscription", async () => {
    const fil = [
      ...Array.from({ length: 12 }, (_, i) => pub("qs", "facebook", `2026-09-${String(28 - i).padStart(2, "0")}`, `fb${i}`)),
      pub("qs", "instagram", "2026-09-28", "ig"),
      pub("caq", "facebook", "2026-09-28", "caq"),
    ];
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(u);
      return { ok: true, json: async () => fil };
    });
    const alice = data.audience.find((a) => a.nom === "Alice" && a.plateforme === "facebook")!;
    expect(alice).toMatchObject({ code: anjou.code, fiche: "alice-anjou-louis-riel" });
    await chargeFilComplet(anjou.code);
    expect(urls).toEqual([`/reseaux/fil-complet/${anjou.code}.json`]);
    const html = renderToStaticMarkup(<InfobulleCompte data={data} a={alice} bulle={bulle} epinglee />);
    const textes = [...html.matchAll(/class="social-infobulle-texte">([^<]+)</g)].map((m) => m[1]);
    expect(textes).toEqual(Array.from({ length: 10 }, (_, i) => `fb${i}`));
    expect(html).toContain('href="/reseaux/candidats/alice-anjou-louis-riel/"');
    expect(html).toContain("Voir la fiche du candidat");
    expect(html).toContain('role="dialog"');
  });

  it("chargement : un état « chargement », jamais l'API ; repli sur le fil court", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(u);
      return u.includes("fil-complet") ? { ok: false, json: async () => null } : { ok: true, json: async () => [pub("qs", "facebook", "2026-09-28", "court")] };
    });
    const code = f.circonscriptions.find((c) => c.code !== anjou.code)!.code;
    const a = { nom: "Z", party: "qs" as const, plateforme: "facebook" as const, type: "candidat" as const, abonnes: 1, code };
    expect(renderToStaticMarkup(<InfobulleCompte data={data} a={a} bulle={bulle} />)).toContain("Chargement du fil");
    await chargeFilComplet(code);
    expect(urls).toEqual([`/reseaux/fil-complet/${code}.json`, `/reseaux/fil/${code}.json`]);
    expect(urls.every((u) => !u.includes("/v1/"))).toBe(true);
    expect(renderToStaticMarkup(<InfobulleCompte data={data} a={a} bulle={bulle} />)).toContain("court");
  });

  it("compte de parti : son nom complet, pas de fil ni de fiche", () => {
    const pq = data.audience.find((a) => a.type === "parti")!;
    const html = renderToStaticMarkup(<InfobulleCompte data={data} a={pq} bulle={bulle} epinglee />);
    expect(html).toContain("Parti québécois");
    expect(html).not.toContain("Dernières publications");
    expect(html).not.toContain("Voir la fiche");
    expect(pq.code).toBeUndefined();
  });
});

describe("infobulle de la carte : filtres ou absence de compte", () => {
  const avecComptes = data.carte!.circos.find((c) => c.code === anjou.code)!;
  const rendu = (circo: typeof avecComptes, plateformes: ("facebook" | "instagram" | "tiktok")[]) =>
    renderToStaticMarkup(
      <Infobulle data={data} circo={circo} m={meneur(circo.comptes, "7j", plateformes, data.partis)} periode="7j"
        plateformes={plateformes} partis={data.partis} x={10} y={10} largeur={800} hauteur={600} epinglee
        onRetirerFiltres={() => {}} />,
    ).replace(/<[^>]+>/g, " ").replace(/[\s ]+/g, " ");

  it("des comptes, tous écartés par les filtres : le dire, filtres résumés, et les retirer", () => {
    const t = rendu(avecComptes, ["tiktok"]);
    expect(t).toContain("Aucun compte ne correspond aux filtres (TikTok)");
    expect(t).toContain("Retirer les filtres");
    expect(t).not.toContain("Aucun compte de candidat suivi");
    expect(resumeFiltres(data, ["tiktok"], ["qs", "pq"])).toBe("TikTok · QS, PQ");
    expect(resumeFiltres(data, ["facebook", "instagram", "tiktok"], data.partis)).toBe("");
  });
  it("aucun compte, tous filtres confondus : « Aucun compte de candidat suivi »", () => {
    const vide = data.carte!.circos.find((c) => c.comptes.length === 0)!;
    const t = rendu(vide, ["tiktok"]);
    expect(t).toContain("Aucun compte de candidat suivi");
    expect(t).not.toContain("ne correspond aux filtres");
    expect(rendu(vide, ["facebook", "instagram", "tiktok"])).toContain("Aucun compte de candidat suivi");
  });
});

describe("fil des infobulles : toujours le plus récent, sans filtre", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("carte : les 10 dernières publications, toutes plateformes et tous partis, même filtrée sur TikTok", async () => {
    const circo = data.carte!.circos.find((c) => c.code === anjou.code)!;
    const fil = [
      pub("caq", "facebook", "2026-09-28", "caq-fb"),
      pub("qs", "instagram", "2026-09-28", "qs-ig"),
      pub("pq", "tiktok", "2026-09-27", "pq-tt"),
    ];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => fil }));
    await chargeFil(anjou.code);
    const html = renderToStaticMarkup(
      <Infobulle data={data} circo={circo} m={meneur(circo.comptes, "7j", ["tiktok"], ["pq"])} periode="7j"
        plateformes={["tiktok"]} partis={["pq"]} x={10} y={10} largeur={800} hauteur={600} epinglee onRetirerFiltres={() => {}} />,
    );
    const textes = [...html.matchAll(/class="social-infobulle-texte">([^<]+)</g)].map((m) => m[1]);
    expect(textes).toEqual(["caq-fb", "qs-ig", "pq-tt"]);
    expect(html.slice(html.indexOf("social-infobulle-fil"))).not.toContain("avec ces filtres");
    // La liste des candidats, elle, suit les filtres.
    expect(html).toContain("Aucun compte ne correspond aux filtres (TikTok · PQ)");
  });
});

describe("bouton « Réinitialiser » des filtres", () => {
  it("absent quand tout est coché, présent dès qu'un filtre diffère du défaut", () => {
    const pf = ["facebook", "instagram", "tiktok"] as const;
    const ty = ["candidat", "parti"] as const;
    expect(filtresModifies(data, [...pf], data.partis, [...ty])).toBe(false);
    expect(filtresModifies(data, ["tiktok"], data.partis, [...ty])).toBe(true);
    expect(filtresModifies(data, [...pf], ["qs"], [...ty])).toBe(true);
    expect(filtresModifies(data, [...pf], data.partis, ["candidat"])).toBe(true);
  });
});
