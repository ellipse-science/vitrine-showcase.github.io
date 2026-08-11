import { loadParties } from "@/lib/data/parties";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";

export async function PartisCouvertureSection({ asOfIso }: { asOfIso?: string } = {}) {
  const data = await loadParties(asOfIso);
  if (!data) return null;
  return <PartisCouvertureClient data={data} />;
}
