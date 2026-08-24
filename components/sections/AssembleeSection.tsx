import { loadAssemblee } from "@/lib/data/assemblee";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";

// RETIRÉ DE PROD, gardé sur dev (décision du 2026-08-20, avant l'envoi aux
// médias) : le module reste en rodage. Garde à la source — voir le même motif
// dans PartisCouvertureSection.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export async function AssembleeSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  if (isProd) return null;
  const data = await loadAssemblee(asOfIso);
  if (!data) return null;
  return <AssembleeClient data={data} editionKey={editionKey} />;
}
