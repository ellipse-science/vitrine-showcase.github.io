import fs from "node:fs/promises";
import path from "node:path";

import { listEditions, loadHeadlineEvents } from "@/lib/data/headlineEvents";

type ArtMeta = {
  event_id?: string;
  storyline_id?: string;
};

export function matchesCurrentUneArt(
  art: ArtMeta | undefined,
  event: { eventId?: string | null; storylineId?: string | null } | undefined,
): boolean {
  if (!art || !event) return false;
  const artKey = art.storyline_id ?? art.event_id;
  const eventKey = event.storylineId ?? event.eventId;
  return Boolean(artKey && eventKey && artKey === eventKey);
}

/**
 * Illustration temporaire de la carte de partage de la Une des Unes.
 *
 * `latest.png` n'est pas une archive : il est écrasé à chaque cycle. On ne
 * l'utilise donc que pour la plus récente édition disponible, et seulement si
 * sa storyline correspond encore à la manchette principale. Dès qu'une
 * nouvelle édition arrive, l'ancienne carte redevient volontairement
 * textuelle au prochain build.
 */
export async function loadCurrentUneShareImage(editionKey?: string): Promise<string | undefined> {
  const currentEdition = (await listEditions())[0];
  if (!currentEdition || (editionKey && editionKey !== currentEdition.key)) return undefined;

  const data = await loadHeadlineEvents(editionKey ?? currentEdition.key);
  const event = data?.top3[0];
  if (!event) return undefined;

  const directory = path.resolve(process.cwd(), "public", "data", "generated-art");
  try {
    const [metaRaw, image] = await Promise.all([
      fs.readFile(path.join(directory, "latest.json"), "utf8"),
      fs.readFile(path.join(directory, "latest.png")),
    ]);
    const meta = JSON.parse(metaRaw) as ArtMeta;
    if (!matchesCurrentUneArt(meta, event)) return undefined;
    return `data:image/png;base64,${image.toString("base64")}`;
  } catch {
    // L'illustration est best-effort, comme dans le module : une absence vaut
    // mieux qu'une image périmée attribuée à la mauvaise Une.
    return undefined;
  }
}
