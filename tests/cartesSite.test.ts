import { describe, expect, it } from "vitest";

import { slugCirco } from "@/lib/cartes/fonctions";
import { preparerCartesSite } from "@/lib/cartes/site";
import { loadAssemblee } from "@/lib/data/assemblee";
import { symboleEnjeuSVG } from "@/lib/enjeux-glyphes";

// Les cartes du vestiaire sont celles du carton imprimé (lib/cartes). Ce que
// ce test garantit : chaque élu d'un casier retrouve une fiche de carte, sans
// quoi il retomberait sur l'ancienne carte du site — un filet, pas le résultat
// voulu. Les données sont celles du dépôt (public/data/agora).

describe("symboleEnjeuSVG", () => {
  it("rend le glyphe avec le style demandé, et rien pour un enjeu inconnu", () => {
    const svg = symboleEnjeuSVG("education", "width:26px;height:26px;color:#fff;display:block");
    expect(svg).toContain('class="symbole-enjeu"');
    expect(svg).toContain('style="width:26px;height:26px;color:#fff;display:block"');
    expect(svg).toContain("<path");
    expect(symboleEnjeuSVG("bidon", "")).toBe("");
    expect(symboleEnjeuSVG(null, "")).toBe("");
  });
});

describe("preparerCartesSite", () => {
  it("donne une fiche de carte à chaque élu de chaque casier, sans emporter les DeputyRow", async () => {
    const data = await loadAssemblee();
    if (!data) return; // pas de données locales : rien à vérifier
    const cartes = await preparerCartesSite(data);
    for (const periode of ["legislature", "session", "last_pdq"] as const) {
      const vue = data.periods[periode];
      const serie = cartes.parPeriode[periode];
      expect(serie, periode).toBeDefined();
      const parSlug = new Map<string, number>();
      for (const c of serie!.cartes) {
        expect((c as unknown as { deputy?: unknown }).deputy, "une carte ne porte pas de DeputyRow").toBeUndefined();
        parSlug.set(c.elu, (parSlug.get(c.elu) ?? 0) + 1);
      }
      const sansCarte = vue.rows.flatMap((r) => r.deputies ?? []).filter((d) => !parSlug.has(slugCirco(d)));
      expect(sansCarte.map((d) => `${d.name} (${d.circonscription})`), `${periode} : élus sans carte`).toEqual([]);
      // Numéros et raretés sur la série entière : au moins une carte rare.
      expect(serie!.serie.total).toBe(serie!.cartes.length);
      expect(serie!.serie.raretes.rare).toBeGreaterThan(0);
    }
  }, 60_000);
});
