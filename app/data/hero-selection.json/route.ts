// data/hero-selection.json — la Une n°1 que CE build affiche, publiée dans
// l'export statique.
//
// POURQUOI. Le raffineur vitrine-art (aws-refiners) illustre la Une des unes.
// Pour savoir LAQUELLE, il lit ce fichier sur le site déployé. C'est la même
// parade que scripts/select_hero.ts en son temps (issue #259) : le verdict
// publié ici est par construction celui du rendu — même snapshot de données,
// même code, même build.
//
// ⚠️ LE CALCUL N'EST PLUS ICI. Il vit dans `lib/data/heroSelectionCore.ts`
// (`heroSelectionPayload`), un module PUR que le Worker peut charger lui aussi
// — c'est ce qui permettra à l'illustration d'être prête AVANT le build plutôt
// qu'après (aws-refiners#490). Les deux côtés appellent LA MÊME fonction,
// jamais une copie : c'est la seule chose qui garantit qu'ils ne divergeront
// pas, et la divergence est précisément la panne de #259.
//
// `force-static` : la route est rendue UNE FOIS au build et devient un fichier
// plat dans out/. Aucun visiteur ne déclenche de calcul. postbuild.mjs épargne
// ce fichier quand il purge les JSON de out/data (une Une déjà affichée en
// page d'accueil n'est pas une donnée vendue).

import { readDatasetText } from "@/lib/data/source";
import { parseEvents } from "@/lib/data/headlineEvents";
import { heroSelectionPayload } from "@/lib/data/heroSelectionCore";

export const dynamic = "force-static";

export async function GET() {
  // `null` plutôt qu'un échec de build : sans données, il n'y a pas de Une à
  // illustrer, et le raffineur sait quoi faire d'un null — rien.
  try {
    const raw = await readDatasetText("public/data/headline-events.json");
    return Response.json(heroSelectionPayload(parseEvents(raw)));
  } catch {
    return Response.json(null);
  }
}
