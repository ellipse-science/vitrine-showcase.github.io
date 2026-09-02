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
import { selectHeroFromRawEvents, parseEvents } from "@/lib/data/headlineEvents";

export const dynamic = "force-static";

export async function GET() {
  // `null` plutôt qu'un échec de build : sans données, il n'y a pas de Une à
  // illustrer, et le raffineur sait quoi faire d'un null — rien.
  try {
    const raw = await readDatasetText("public/data/headline-events.json");
    const events = parseEvents(raw);
    const selection = selectHeroFromRawEvents(events);
    // `latest_block` = le bloc le plus récent du jeu servi, indépendant de
    // l'histoire de tête. La Une garde le bloc de sa dernière occurrence (une
    // histoire dominante depuis hier soir affiche « hier soir » à bon droit) ;
    // la sonde de fraîcheur, elle, doit mesurer l'âge du jeu, pas celui de
    // l'histoire — sinon elle sonne quand la tête ne se renouvelle pas (vécu le
    // 2 septembre 2026 : « 22,4 h de retard » sur un site à jour).
    const latest = events.reduce<{ date_utc: string; time_interval_utc: string } | null>(
      (best, e) => {
        if (!e.date_utc || !e.time_interval_utc) return best;
        const key = `${e.date_utc} ${e.time_interval_utc}`;
        return !best || key > `${best.date_utc} ${best.time_interval_utc}`
          ? { date_utc: e.date_utc, time_interval_utc: e.time_interval_utc }
          : best;
      },
      null,
    );
    return Response.json(selection ? { ...selection, latest_block: latest } : selection);
  } catch {
    return Response.json(null);
  }
}
