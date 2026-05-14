import { loadTreemap } from "@/lib/data/headlineEvents";
import { TreemapClient } from "@/components/interactive/TreemapClient";

export async function TreemapSection() {
  const data = await loadTreemap();
  if (!data) return null;
  return <TreemapClient data={data} />;
}
