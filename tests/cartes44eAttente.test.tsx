import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssembleeEnAttente } from "@/components/interactive/AssembleeEnAttente";
import { loadAssemblee } from "@/lib/data/assemblee";
import { readFileSync } from "node:fs";
import { preparerCartesAttente } from "@/lib/cartes/site";
import { PROFIL_44E } from "@/lib/cartes/legislatures";

// Les cartes de la 44e, avant sa première séance : la fabrique de la 43e,
// avec les sources de la 44e (scripts/social/donnees/44e, tirées de la
// dimension) et le profil de la 44e. Aucune parole : pas de classement.
describe("les cartes de la 44e en attente", async () => {
  const data = await loadAssemblee();
  const cartesSite = await preparerCartesAttente(data!.prochaine!);
  const cartes = cartesSite.parPeriode.legislature!.cartes;
  const de = (circo: string) => cartes.find((c) => c.elu === circo)!;

  it("fait une carte par élu·e de la 44e", () => {
    expect(cartes.length).toBe(data!.prochaine!.total - data!.prochaine!.horsCasier.length);
    expect(new Set(cartes.map((c) => c.numero)).size).toBe(cartes.length);
    expect(cartes.every((c) => c.edition.startsWith("44e législature"))).toBe(true);
  });

  it("porte la fonction, la carrière et le scrutin de la 44e", () => {
    const pm = de("camille-laurin");
    expect(pm.rarete).toBe("legendaire");
    expect(pm.codeFonction).toBe("PM");
    expect(pm.chef?.titre).toMatch(/^Premier ministre/);
    expect(pm.mandat).toBe("Élu le 5 octobre 2026");
    expect(pm.scrutin?.pourcentage).toBeGreaterThan(0);
    expect(pm.carriere).toBeTruthy();
    expect(cartes.filter((c) => c.mandat.includes("Élu.e"))).toEqual([]);
    expect(cartes.filter((c) => c.scrutin).length).toBe(cartes.length);
  });

  it("ne garde rien de la 43e : Sanguinet n'est plus le siège de la première ministre", () => {
    expect(de("sanguinet").chef).toBeUndefined();
    expect(de("sanguinet").rarete).not.toBe("legendaire");
  });

  it("sans parole, ne classe personne : toutes communes, sauf le premier ministre et la présidence", () => {
    const autres = cartes.filter((c) => c.rarete !== "legendaire" && !c.presidente);
    expect(autres.every((c) => c.rarete === "commune")).toBe(true);
    expect(cartes.filter((c) => c.rarete === "legendaire").length).toBe(1);
  });

  it("montre la carte de la fabrique dans le casier ouvert, au recto seulement", () => {
    const html = renderToStaticMarkup(<AssembleeEnAttente vue={data!.prochaine!} cartes={cartesSite} />);
    expect(html).toContain("carte--fabrique");
    expect(html).not.toContain("carte-verso");
    expect(html).not.toContain("tiroir-faces");
  });
});

it("arrête la frise de la 44e à la date de référence de ses sources", () => {
  const f = JSON.parse(readFileSync(`${PROFIL_44E.donnees}/fonctions-deputes.json`, "utf8")) as { date_reference: string };
  expect(PROFIL_44E.axe.fin).toBe(f.date_reference);
});
