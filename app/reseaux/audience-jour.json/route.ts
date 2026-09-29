// reseaux/audience-jour.json — l'activité de chaque compte, jour par jour
// (table social_comptes_jour, environ 45 000 lignes), pour les classements de
// l'Audience sur la période choisie. Trop lourde pour les props du module :
// écrite UNE fois au build (`force-static`), chargée par le navigateur seulement
// quand on choisit une autre mesure que les abonnés. Fichier du site, pas l'API.
// Hors de `data/` : postbuild.mjs purge les JSON de out/data. Vide en prod.

import { loadSocial } from "@/lib/data/social";

export const dynamic = "force-static";

export async function GET() {
  if (process.env.NEXT_PUBLIC_SITE_ENV === "prod") return Response.json([]);
  return Response.json((await loadSocial())?.audienceJour ?? []);
}
