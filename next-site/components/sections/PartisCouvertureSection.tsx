import { loadParties } from "@/lib/data/parties";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";

export async function PartisCouvertureSection() {
  const data = await loadParties();
  if (!data) return null;
  return <PartisCouvertureClient data={data} />;
}
