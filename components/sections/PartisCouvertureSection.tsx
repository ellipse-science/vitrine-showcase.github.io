import { loadParties } from "@/lib/data/parties";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";

// RETIRÉ DE PROD, gardé sur dev (décision du 2026-08-20, avant l'envoi aux
// médias) : le module reste en rodage. La garde vit ICI, à la source, et non
// aux points de montage : accueil, éditions passées et tout montage futur
// suivent sans qu'on ait à y penser. Même signal d'environnement que
// app/robots.ts et lib/data/parties.ts — un seul signal, pas de divergence.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export async function PartisCouvertureSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  if (isProd) return null;
  const data = await loadParties(asOfIso);
  if (!data) return null;
  return <PartisCouvertureClient data={data} editionKey={editionKey} />;
}
