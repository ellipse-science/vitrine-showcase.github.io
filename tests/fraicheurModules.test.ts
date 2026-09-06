import { describe, it, expect } from "vitest";
import { editionDeLaDonnee, plusAncienneEdition, cleEdition, lastUpdatedLabel } from "@/lib/dates";
import { editionDesArticles } from "@/lib/data/fraicheur";

// L'heure affichée sous un module est celle de sa DONNÉE, jamais celle d'une
// passe de raffineur (règle d'Adrien, 2026-09-06). Le cas fondateur : INFER en
// panne, le dernier article annoté date du samedi 5 septembre 15h52 ; la passe
// de dimanche 11h37 republiait cette journée et le module disait « 12h ».

describe("editionDeLaDonnee — un instant DANS un bloc de collecte", () => {
  it("place la dernière capture de samedi 14h58 dans l'édition de 16h", () => {
    expect(editionDeLaDonnee("2026-09-05T18:58:11Z")).toEqual({ date: "2026-09-05", heure: 16 });
  });
  it("une capture pile à 15h00 appartient au bloc qui FINIT là (11h-15h → 16h)", () => {
    expect(editionDeLaDonnee("2026-09-05T19:00:00Z")).toEqual({ date: "2026-09-05", heure: 16 });
  });
  it("une minute plus tard, c'est le bloc suivant (15h-19h → 20h)", () => {
    expect(editionDeLaDonnee("2026-09-05T19:01:00Z")).toEqual({ date: "2026-09-05", heure: 20 });
  });
  it("le bloc 19h-23h est servi à minuit, sous le jour qui finit", () => {
    expect(editionDeLaDonnee("2026-09-06T02:30:00Z")).toEqual({ date: "2026-09-05", heure: 24 });
    // Le libellé porte une insécable avant le deux-points (garde-redaction) : on ne le recopie pas.
    expect(lastUpdatedLabel("2026-09-05", 24)).toMatch(/^Dernière mise à jour du module\s*:\ssamedi 5 septembre 2026, minuit$/);
  });
  it("le bloc 23h-3h franchit minuit : servi à 4h le LENDEMAIN", () => {
    expect(editionDeLaDonnee("2026-09-06T03:30:00Z")).toEqual({ date: "2026-09-06", heure: 4 }); // samedi 23h30
    expect(editionDeLaDonnee("2026-09-06T06:30:00Z")).toEqual({ date: "2026-09-06", heure: 4 }); // dimanche 2h30
    expect(editionDeLaDonnee("2026-09-06T07:00:00Z")).toEqual({ date: "2026-09-06", heure: 4 }); // dimanche 3h00 pile
    expect(editionDeLaDonnee("2026-09-06T07:01:00Z")).toEqual({ date: "2026-09-06", heure: 8 });
  });
  it("suit l'heure d'hiver (−5) et pas une soustraction fixe", () => {
    expect(editionDeLaDonnee("2026-01-15T20:30:00Z")).toEqual({ date: "2026-01-15", heure: 20 }); // 15h30 EST
  });
  it("rend null sur un instant illisible", () => {
    expect(editionDeLaDonnee("")).toBeNull();
    expect(editionDeLaDonnee("pas une date")).toBeNull();
  });
});

describe("editionDesArticles — le plus récent article annoté", () => {
  const articles = [
    { fin_utc: "2026-09-05T14:58:14Z" },
    { fin_utc: "2026-09-05T18:58:11Z" },
    { fin_utc: null },
    { fin_utc: "n'importe quoi" },
  ];
  it("retient le plus récent et ignore les entrées sans date", () => {
    expect(editionDesArticles(articles)).toEqual({ date: "2026-09-05", heure: 16 });
  });
  it("une archive ne voit pas les articles parus après sa publication", () => {
    expect(editionDesArticles(articles, "2026-09-05T16:00:00.000Z")).toEqual({ date: "2026-09-05", heure: 12 });
  });
  it("rend null sans aucun article daté — le module dira la date seule", () => {
    expect(editionDesArticles([{ fin_utc: null }, {}])).toBeNull();
    expect(editionDesArticles([])).toBeNull();
  });
  it("le cas fondateur : la passe de dimanche 11h37 ne fait pas avancer l'heure", () => {
    const e = editionDesArticles(articles)!;
    expect(lastUpdatedLabel(e.date, e.heure)).toMatch(/^Dernière mise à jour du module\s*:\ssamedi 5 septembre 2026, 16h$/);
  });
});

describe("plusAncienneEdition — un module n'est jamais plus frais que son étage le plus lent", () => {
  it("minuit de samedi vient avant 4h de dimanche", () => {
    expect(cleEdition({ date: "2026-09-05", heure: 24 })).toBeLessThan(cleEdition({ date: "2026-09-06", heure: 4 }));
    expect(plusAncienneEdition({ date: "2026-09-06", heure: 4 }, { date: "2026-09-05", heure: 24 })).toEqual({ date: "2026-09-05", heure: 24 });
  });
  it("le bloc des partis publié à minuit ne masque pas des articles arrêtés à 16h", () => {
    expect(plusAncienneEdition({ date: "2026-09-05", heure: 24 }, { date: "2026-09-05", heure: 16 })).toEqual({ date: "2026-09-05", heure: 16 });
  });
  it("un seul côté connu suffit ; aucun → null", () => {
    expect(plusAncienneEdition(null, { date: "2026-09-05", heure: 16 })).toEqual({ date: "2026-09-05", heure: 16 });
    expect(plusAncienneEdition({ date: "2026-09-05", heure: 16 }, null)).toEqual({ date: "2026-09-05", heure: 16 });
    expect(plusAncienneEdition(null, null)).toBeNull();
  });
});
