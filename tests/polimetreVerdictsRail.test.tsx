import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PolimetrePlusClient } from "@/components/interactive/PolimetrePlusClient";
import type { PolimetreData, PromiseView, VerdictSlug } from "@/lib/data/polimetre-meta";

// Le rail des verdicts n'offre « En cours » et « En suspens » que si la période
// affichée en contient : mandat clos, chaque promesse est réalisée, partielle
// ou rompue, et ces deux boutons ne mèneraient qu'à une liste vide. Les trois
// verdicts finaux restent toujours là — le rail sert aussi de légende.
//
// Ce qui se prouve ici tient dans le balisage (un bouton est un nœud ou n'en
// est pas), d'où un test de rendu et non de chargeur. Rendu SSR : c'est la
// période par défaut (« week ») qui est examinée.

const promesse = (verdict: VerdictSlug, n: number): PromiseView => ({
  pledgeNumber: `2.10.00${n}`,
  title: `Promesse ${n}`,
  fullTitle: `Promesse ${n} en toutes lettres`,
  summary: null,
  verdict,
  verdictLabel: verdict,
  category: "Environnement et énergie",
  salienceIndex: 10 - n,
  url: `https://polimeter.org/fr/legault-frechette/2.10.00${n}`,
  trend: { dir: "flat", delta: 0 },
  articles: [],
});

const donnees = (week: PromiseView[]): PolimetreData => ({
  weekEndDate: "2026-09-20",
  lastUpdated: "Dernière mise à jour : dimanche 21 septembre 2026",
  ranges: { week, month: [] },
});

const boutons = (html: string): string[] =>
  [...html.matchAll(/data-verdict="([^"]+)"/g)].map((m) => m[1]);

describe("rail des verdicts du Polimètre+", () => {
  it("masque « En cours » et « En suspens » quand la période n'en a aucune", () => {
    const html = renderToStaticMarkup(
      <PolimetrePlusClient
        data={donnees([promesse("realisee", 1), promesse("partielle", 2), promesse("rompue", 3)])}
      />,
    );
    expect(boutons(html)).toEqual(["all", "realisee", "partielle", "rompue"]);
  });

  it("garde les trois verdicts finaux même sans promesse qui les porte", () => {
    const html = renderToStaticMarkup(
      <PolimetrePlusClient data={donnees([promesse("realisee", 1)])} />,
    );
    expect(boutons(html)).toEqual(["all", "realisee", "partielle", "rompue"]);
  });

  it("montre chaque verdict transitoire dès qu'une promesse de la période le porte", () => {
    const html = renderToStaticMarkup(
      <PolimetrePlusClient
        data={donnees([promesse("en-cours", 1), promesse("rompue", 2)])}
      />,
    );
    expect(boutons(html)).toEqual(["all", "realisee", "partielle", "en-cours", "rompue"]);
  });

  it("compte sur toute la période, pas seulement sur les cinq affichés", () => {
    // Six promesses : la seule « En suspens » est sixième, donc hors du top 5.
    const html = renderToStaticMarkup(
      <PolimetrePlusClient
        data={donnees([
          promesse("realisee", 1),
          promesse("realisee", 2),
          promesse("realisee", 3),
          promesse("realisee", 4),
          promesse("realisee", 5),
          promesse("en-suspens", 6),
        ])}
      />,
    );
    expect(boutons(html)).toContain("en-suspens");
  });
});
