import { loadAssemblee } from "@/lib/data/assemblee";
import { preparerCartesSite } from "@/lib/cartes/site";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";

export async function AssembleeSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  const data = await loadAssemblee(asOfIso);
  if (!data) return null;
  // Les fiches des cartes de député (numéro, rareté, fonctions, parcours…),
  // AU BUILD, par la même fabrique que les cartes imprimées (lib/cartes).
  const cartes = await preparerCartesSite(data);
  return <AssembleeClient data={data} cartes={cartes} editionKey={editionKey} />;
}
