// reseaux/fil/<code>.json — le fil d'une circonscription pour la fiche de la
// carte du module « La guerre des clics » (expérimental).
//
// POURQUOI UN FICHIER PAR CIRCONSCRIPTION. Les 127 fils (20 publications
// chacun, raffineur agora-social, table social_fil) pèseraient plus d'un
// mégaoctet dans les props du module. Ils sont donc écrits ici, UNE FOIS au
// build (`force-static`), en fichiers plats servis par le site lui-même ; la
// fiche charge le sien à l'ouverture. Ce n'est pas l'API : le visiteur ne lit
// que des fichiers du CDN, comme pour tout le reste du site.
//
// Hors de `data/` exprès : postbuild.mjs purge les JSON de out/data.
// Un fichier vide est toujours écrit en plus (l'export statique exige au moins
// un paramètre).

import geo from "@/lib/geo/circonscriptions-2026.json";
import { cleCirco, loadSocialFil, type FondCarte } from "@/lib/data/social";

export const dynamic = "force-static";
export const dynamicParams = false;

const VIDE = "vide.json";
const circos = (geo as FondCarte).circonscriptions;

export function generateStaticParams() {
  return [...circos.map((c) => ({ fichier: `${c.code}.json` })), { fichier: VIDE }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ fichier: string }> }) {
  const { fichier } = await params;
  const circo = circos.find((c) => `${c.code}.json` === fichier);
  const fil = !circo ? [] : ((await loadSocialFil()).get(cleCirco(circo.nom)) ?? []);
  return Response.json(fil);
}
