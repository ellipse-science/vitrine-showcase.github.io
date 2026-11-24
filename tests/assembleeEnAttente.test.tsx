import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildLegislatureEnAttente, LEGISLATURE_SUIVANTE } from "@/lib/data/assemblee";
import type { AssembleeData, DeputyPortrait, PeriodView } from "@/lib/data/assemblee";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";

// LA 44e EN ATTENTE DE SA PREMIÈRE SÉANCE (vitrine#1035). Entre l'élection du
// 2026-10-05 et la première séance du 2026-12-01, le site a les 127 élus et
// leurs portraits, mais aucun débat. La vue en attente se construit de
// l'index des portraits, et n'existe QUE tant qu'Agora n'a aucune journée
// postérieure à l'élection : la bascule vient des données, pas d'une date.

function portrait(id: number, nom: string, circonscription: string, parti?: string, historique = false): DeputyPortrait {
  const slug = circonscription.toLowerCase().replace(/[^a-z]/g, "");
  return {
    deputy_id: String(id), nom, circonscription, circonscription_slug: slug,
    asset_slug: historique ? `historique/${id}` : slug, parti,
  } as DeputyPortrait;
}

const PORTRAITS: DeputyPortrait[] = [
  portrait(1, "Paul St-Pierre Plamondon", "Camille-Laurin", "Parti québécois"),
  portrait(2, "Pascal Bérubé", "Matane-Matapédia-Mitis", "Parti québécois"),
  portrait(3, "Charles Milliard", "Saint-Laurent", "Parti libéral du Québec"),
  portrait(4, "Éric Duhaime", "Arthabaska-L'Érable", "Parti conservateur du Québec"),
  portrait(5, "Ruba Ghazal", "Mercier", "Québec solidaire"),
  // Un ancien élu de l'historique : il a une carte de la 43e, pas un siège de la 44e.
  portrait(17897, "Pierre Fitzgibbon", "Terrebonne", "Coalition avenir Québec", true),
];

const AGORA_43E = [{ period_type: "last_pdq", period_end_date: "2026-06-12" }];

describe("buildLegislatureEnAttente", () => {
  it("existe tant qu'Agora n'a aucune journée postérieure à l'élection", () => {
    expect(buildLegislatureEnAttente(PORTRAITS, AGORA_43E)).not.toBeNull();
    const premiere = [...AGORA_43E, { period_type: "last_pdq", period_end_date: "2026-12-01" }];
    expect(buildLegislatureEnAttente(PORTRAITS, premiere)).toBeNull();
  });

  it("range les élus par parti, du plus grand casier au plus petit, et garde les cinq casiers", () => {
    const vue = buildLegislatureEnAttente(PORTRAITS, AGORA_43E)!;
    expect(vue.rows.map((r) => [r.key, r.deputes.length])).toEqual([
      ["pq", 2], ["plq", 1], ["qs", 1], ["pcq", 1], ["caq", 0],
    ]);
    expect(vue.total).toBe(5);
  });

  it("n'y met pas les anciens élus de l'historique", () => {
    const vue = buildLegislatureEnAttente(PORTRAITS, AGORA_43E)!;
    expect(vue.rows.flatMap((r) => r.deputes).map((d) => d.name)).not.toContain("Pierre Fitzgibbon");
  });

  it("dit les élus qu'il ne sait pas ranger, au lieu de les perdre", () => {
    const vue = buildLegislatureEnAttente([...PORTRAITS, portrait(9, "X Y", "Orford", "Indépendant")], AGORA_43E)!;
    expect(vue.horsCasier).toEqual(["X Y"]);
    expect(vue.total).toBe(6);
  });

  it("porte la date de la première séance et le portrait de carte de chaque élu", () => {
    const vue = buildLegislatureEnAttente(PORTRAITS, AGORA_43E)!;
    expect(vue.numero).toBe(LEGISLATURE_SUIVANTE.numero);
    expect(vue.premiereSeanceLibelle).toBe("mardi 1er décembre 2026, 14 h");
    expect(vue.rows[0].deputes[0].portrait).toMatch(/^\/images\/deputes\/cartes\/web\/.+\.jpg$/);
  });
});

function vuePeriode(period: PeriodView["period"]): PeriodView {
  return { period, tabLabel: period, subtitle: "", lastUpdated: "Dernière mise à jour : vendredi 12 juin 2026", rows: [] };
}

function donnees(avecAttente: boolean): AssembleeData {
  return {
    periods: { last_pdq: vuePeriode("last_pdq"), session: vuePeriode("session"), legislature: vuePeriode("legislature") },
    ...(avecAttente ? { prochaine: buildLegislatureEnAttente(PORTRAITS, AGORA_43E)! } : {}),
  };
}

describe("AssembleeClient et la 44e en attente", () => {
  it("ouvre sur la 44e, avec le bandeau d'attente et les portraits", () => {
    const html = renderToStaticMarkup(<AssembleeClient data={donnees(true)} />);
    expect(html).toContain("En attente de la première séance");
    expect(html).toContain("mardi 1er décembre 2026, 14 h");
    expect(html).toMatch(/aria-selected="true"[^>]*>(<[^>]+>)*44e législature/);
    expect(html).toContain("Paul St-Pierre Plamondon");
    // Aucune statistique de débat : ni mots, ni onglets de période.
    expect(html).not.toContain("assemblee-periodes");
  });

  it("propose la 43e, et sans vue en attente, le module est celui d'aujourd'hui", () => {
    expect(renderToStaticMarkup(<AssembleeClient data={donnees(true)} />)).toContain("43e législature");
    const sans = renderToStaticMarkup(<AssembleeClient data={donnees(false)} />);
    expect(sans).not.toContain("En attente de la première séance");
    expect(sans).not.toContain("44e législature");
    expect(sans).toContain("assemblee-periodes");
  });
});
