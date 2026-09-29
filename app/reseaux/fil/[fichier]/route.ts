// reseaux/fil/<code>.json — le fil d'une circonscription pour la fiche de la
// carte du module « Les candidats sur les réseaux » (expérimental, dev).
//
// POURQUOI UN FICHIER PAR CIRCONSCRIPTION. Les 127 fils (20 publications
// chacun, raffineur agora-social, table social_fil) pèseraient plus d'un
// mégaoctet dans les props du module. Ils sont donc écrits ici, UNE FOIS au
// build (`force-static`), en fichiers plats servis par le site lui-même ; la
// fiche charge le sien à l'ouverture. Ce n'est pas l'API : le visiteur ne lit
// que des fichiers du CDN, comme pour tout le reste du site.
//
// Hors de `data/` exprès : postbuild.mjs purge les JSON de out/data.
// En prod, où le module est masqué, un seul fichier vide est écrit (l'export
// statique exige au moins un paramètre).

import geo from "@/lib/geo/circonscriptions-2026.json";
import { cleCirco, loadSocialFil, type FondCarte } from "@/lib/data/social";

export const dynamic = "force-static";
export const dynamicParams = false;

const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";
const VIDE = "vide.json";
const circos = (geo as FondCarte).circonscriptions;

export function generateStaticParams() {
  if (isProd) return [{ fichier: VIDE }];
  return [...circos.map((c) => ({ fichier: `${c.code}.json` })), { fichier: VIDE }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ fichier: string }> }) {
  const { fichier } = await params;
  const circo = circos.find((c) => `${c.code}.json` === fichier);
  const fil = isProd || !circo ? [] : ((await loadSocialFil()).get(cleCirco(circo.nom)) ?? []);
  return Response.json(fil);
}
