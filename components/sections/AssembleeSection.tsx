import { loadAssemblee } from "@/lib/data/assemblee";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";

export async function AssembleeSection({ asOfIso }: { asOfIso?: string } = {}) {
  const data = await loadAssemblee(asOfIso);
  if (!data) return null;
  return <AssembleeClient data={data} />;
}
