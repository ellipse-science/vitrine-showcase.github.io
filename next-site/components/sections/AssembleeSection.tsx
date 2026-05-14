import { loadAssemblee } from "@/lib/data/assemblee";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";

export async function AssembleeSection() {
  const data = await loadAssemblee();
  if (!data) return null;
  return <AssembleeClient data={data} />;
}
