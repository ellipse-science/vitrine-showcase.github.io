import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import {
  isShareModuleSlug,
  getShareModuleContent,
  SHARE_MODULE_SLUGS,
  type ShareModuleContent,
  type ShareModuleSlug,
} from "@/lib/shareModules";

describe("isShareModuleSlug", () => {
  it("reconnaît les 6 slugs valides", () => {
    for (const slug of SHARE_MODULE_SLUGS) {
      expect(isShareModuleSlug(slug)).toBe(true);
    }
  });
  it("rejette un slug inconnu", () => {
    expect(isShareModuleSlug("pas-un-module")).toBe(false);
  });
});

describe("SHARE_MODULE_SLUGS — visibilité par environnement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("inclut en production les Partis, sortis du rodage", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "prod");
    vi.resetModules();

    const prodShareModules = await import("@/lib/shareModules");

    expect(prodShareModules.SHARE_MODULE_SLUGS).toContain("partis-et-couverture");
    expect(prodShareModules.isShareModuleSlug("partis-et-couverture")).toBe(true);
  });

  // Le mécanisme de rodage reste, sa liste est vide : c'est ce qui doit être
  // vrai après ce démasquage, et ce test le dira si quelqu'un y remet un module
  // sans le vouloir.
  it("sert la même liste en production et sur dev", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "prod");
    vi.resetModules();
    const prodSlugs = [...(await import("@/lib/shareModules")).SHARE_MODULE_SLUGS];

    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "dev");
    vi.resetModules();
    const devSlugs = [...(await import("@/lib/shareModules")).SHARE_MODULE_SLUGS];

    expect(prodSlugs).toEqual(devSlugs);
  });

  it("inclut en production l'Assemblée, sortie du rodage le 2026-08-27", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_ENV", "prod");
    vi.resetModules();

    const prodShareModules = await import("@/lib/shareModules");

    expect(prodShareModules.SHARE_MODULE_SLUGS).toContain("assemblee-nationale");
    expect(prodShareModules.isShareModuleSlug("assemblee-nationale")).toBe(true);
  });
});

// UNE SEULE DÉRIVATION PAR MODULE, POUR TOUT LE FICHIER (#768).
//
// `getShareModuleContent` ne lit pas un fichier : il rejoue la chaîne de
// données complète du module. Mesuré le 2026-09-09 : 1,8 s pour
// « partis-et-couverture » (loadParties, puis computeStats), et ~0,3 s pour
// ceux qui passent par loadHeadlineEvents et ses 5,7 Mo.
//
// Rien ne mémoïse ces appels ici. Le `cache()` de React ne vaut qu'à
// l'intérieur d'un rendu, et il n'y en a aucun sous vitest ; le `datasetCache`
// de `lib/data/source.ts` ne couvre que les modes distants (API et
// instantané), pas le chemin fichiers qu'empruntent les tests.
//
// Les cas ci-dessous redemandaient le MÊME module jusqu'à trois fois — trois
// dérivations entières de « partis-et-couverture » à elles seules. D'où 7,5 s
// pour dix tests, et deux cas qui dépassaient le délai de 5 s dès que la suite
// complète chargeait la machine.
//
// On dérive donc chaque module UNE fois, ici, et les cas n'assertent plus que
// sur le résultat. Le travail n'est pas déplacé, il est supprimé : six
// dérivations au lieu de douze — le strict minimum pour couvrir les six
// modules.
const contenus = new Map<ShareModuleSlug, ShareModuleContent>();

beforeAll(async () => {
  for (const slug of SHARE_MODULE_SLUGS) {
    contenus.set(slug, await getShareModuleContent(slug));
  }
});

/** Le contenu dérivé d'un module, ou une erreur qui nomme le slug manquant.
 *
 *  Un slug absent voudrait dire que `SHARE_MODULE_SLUGS` a bougé sans que ces
 *  cas suivent. Le dire vaut mieux qu'asserter sur `undefined`, qui échouerait
 *  plus loin en accusant la mauvaise chose. */
function contenuDe(slug: ShareModuleSlug): ShareModuleContent {
  const contenu = contenus.get(slug);
  if (!contenu) {
    throw new Error(`Aucun contenu dérivé pour « ${slug} » : SHARE_MODULE_SLUGS a-t-il changé ?`);
  }
  return contenu;
}

describe("getShareModuleContent — modules à description statique", () => {
  it("renvoie un titre et une description non vides pour chaque module sans donnée live", () => {
    const staticSlugs = ["partis-et-couverture", "enjeux-saillants", "assemblee-nationale", "polimetre-plus"] as const;
    for (const slug of staticSlugs) {
      const content = contenuDe(slug);
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.description.length).toBeGreaterThan(0);
    }
  });
});

describe("getShareModuleContent — chiffre choc (stat)", () => {
  it("renvoie un stat.value et stat.label non vides pour chaque module", () => {
    for (const slug of SHARE_MODULE_SLUGS) {
      const { stat } = contenuDe(slug);
      expect(stat.value.length).toBeGreaterThan(0);
      expect(stat.label.length).toBeGreaterThan(0);
    }
  });

  it("deux-solitudes : le stat reflète le % de divergence déjà utilisé dans la description", () => {
    const content = contenuDe("deux-solitudes");
    const pctInDescription = content.description.match(/(\d+) %/)?.[1];
    if (pctInDescription) {
      expect(content.stat.value).toBe(`${pctInDescription} %`);
    }
  });

  it("une-des-unes : transmet le niveau calibré qui porte la carte de partage", () => {
    const { stat } = contenuDe("une-des-unes");

    if (stat.kicker) {
      expect(stat.salienceLabel).toBeTruthy();
      expect(stat.salienceRank).toBeGreaterThanOrEqual(1);
      expect(stat.salienceRank).toBeLessThanOrEqual(6);
    }
  });

  it("partis-et-couverture : quand un parti mène aujourd'hui, le libellé le nomme et le ton pilote la pointe éditoriale", () => {
    const content = contenuDe("partis-et-couverture");
    if (content.stat.value.endsWith("%")) {
      expect(content.stat.label).toMatch(/domine la couverture/);
      expect(content.stat.contextHighlight).toMatch(/en bien\.|en mal\.|c'est qu'on en parle\./);
    }
  });
});
