import { expect, it } from "vitest";
import { loadAssemblee } from "@/lib/data/assemblee";

// Tant qu'Agora ne publie que la 43e (avant la première séance de la 44e), le
// module affiche la 43e depuis le fichier courant. L'index courant des
// portraits est celui de la 44e : 97 élus de la 43e restaient sans photo.
it("donne leur portrait aux élus de la 43e affichée avant les débats de la 44e", async () => {
  const data = await loadAssemblee();
  expect(data?.legislatureCourante).toBeUndefined();
  const elus = data!.periods.legislature.rows.flatMap((r) => r.deputies ?? []);
  const avecPortrait = elus.filter((d) => d.portrait);
  expect(avecPortrait.length / elus.length).toBeGreaterThan(0.95);
  for (const d of avecPortrait) expect(d.portrait).toMatch(/^\/images\/deputes\/archive-43e\/cartes\/web\//);
  // La 44e en attente garde l'index courant.
  const attente = data!.prochaine!.rows.flatMap((r) => r.deputes);
  expect(attente.length).toBeGreaterThan(120);
  for (const d of attente) expect(d.portrait).toMatch(/^\/images\/deputes\/cartes\/web\//);
});
