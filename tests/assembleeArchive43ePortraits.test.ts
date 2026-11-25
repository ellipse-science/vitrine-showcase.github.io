import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { loadArchiveAssemblee43e, DOSSIER_ARCHIVE_ASSEMBLEE_43E, LEGISLATURE_SUIVANTE } from "@/lib/data/assemblee";
import { trameDuPortrait } from "@/lib/cartes/portraits";

// Revue d'Adrien sur #1043 : l'archive portait l'index des portraits de la 44e
// (97 élus de la 43e sans photo) et pointait vers des images que le
// rafraîchissement de nuit remplace par le nouvel élu de la circonscription.

const index = JSON.parse(
  readFileSync(path.resolve(DOSSIER_ARCHIVE_ASSEMBLEE_43E, "portraits.json"), "utf8"),
) as { recupere_le: string; deputes: { circonscription: string; nom: string }[] };

it("fige l'index des portraits relevé avant l'élection de la 44e", () => {
  expect(index.recupere_le < LEGISLATURE_SUIVANTE.election).toBe(true);
  const abitibiEst = index.deputes.find((d) => d.circonscription === "Abitibi-Est");
  expect(abitibiEst?.nom).toBe("Pierre Dufour");
});

it("donne un portrait figé aux élus de la 43e, copié dans l'archive", async () => {
  const archive = await loadArchiveAssemblee43e();
  const elus = archive.periods.legislature.rows.flatMap((r) => r.deputies ?? []);
  const avecPortrait = elus.filter((d) => d.portrait);
  expect(avecPortrait.length / elus.length).toBeGreaterThan(0.95);
  for (const d of avecPortrait) {
    expect(d.portrait).toMatch(/^\/images\/deputes\/archive-43e\/cartes\/web\/.+\.jpg$/);
    expect(existsSync(path.join("public", d.portrait!))).toBe(true);
    expect(existsSync(path.join("public", trameDuPortrait(d.portrait)!))).toBe(true);
  }
});

it("dérive la trame des cartes du portrait courant comme du portrait archivé", () => {
  expect(trameDuPortrait("/images/deputes/cartes/web/abitibi-est.jpg"))
    .toBe("/images/deputes/cartes/trame/abitibi-est.webp");
  expect(trameDuPortrait("/images/deputes/archive-43e/cartes/web/historique/17823.jpg"))
    .toBe("/images/deputes/archive-43e/cartes/trame/historique/17823.webp");
  expect(trameDuPortrait(undefined)).toBeNull();
});
