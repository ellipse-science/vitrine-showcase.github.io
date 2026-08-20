// data/hero-selection.json — la Une n°1 que CE build affiche, publiée dans
// l'export statique.
//
// POURQUOI. Le raffineur vitrine-art (aws-refiners) illustre la Une des unes.
// Pour savoir LAQUELLE, il ne recalcule rien : il lit ce fichier sur le site
// déployé. C'est la même parade que scripts/select_hero.ts en son temps
// (issue #259) : `selectHeroFromRawEvents` est l'API publique du loader, et le
// verdict publié ici est par construction celui du rendu — même snapshot de
// données, même code, même build. Si le classement évolue, ce fichier suit.
//
// `force-static` : la route est rendue UNE FOIS au build et devient un fichier
// plat dans out/. Aucun visiteur ne déclenche de calcul. postbuild.mjs épargne
// ce fichier quand il purge les JSON de out/data (une Une déjà affichée en
// page d'accueil n'est pas une donnée vendue).

import { readDatasetText } from "@/lib/data/source";
import { selectHeroFromRawEvents, type RawEvent } from "@/lib/data/headlineEvents";

export const dynamic = "force-static";

export async function GET() {
  // `null` plutôt qu'un échec de build : sans données, il n'y a pas de Une à
  // illustrer, et le raffineur sait quoi faire d'un null — rien.
  try {
    const raw = await readDatasetText("public/data/headline-events.json");
    const selection = selectHeroFromRawEvents(JSON.parse(raw) as RawEvent[]);
    return Response.json(selection);
  } catch {
    return Response.json(null);
  }
}
