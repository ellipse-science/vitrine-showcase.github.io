import { loadTreemap } from "@/lib/data/headlineEvents";
import { TreemapClient } from "@/components/interactive/TreemapClient";

export async function TreemapSection({ editionKey, asOfIso }: { editionKey?: string; asOfIso?: string } = {}) {
  const data = await loadTreemap(editionKey, asOfIso);
  if (!data) return null;
  return <TreemapClient data={data} editionKey={editionKey} />;
}
