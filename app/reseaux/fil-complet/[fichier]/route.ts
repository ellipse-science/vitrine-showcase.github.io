// reseaux/fil-complet/<code>.json — toutes les publications d'une
// circonscription, pour « Voir plus » sur sa page. Écrit UNE fois au build
// (`force-static`) à partir du fil complet du raffineur agora-social, s'il est
// présent (fichier jamais commité, cf. .gitignore) ; la page le charge à la
// demande. Fichier du site, pas l'API. Hors de `data/` : postbuild.mjs purge
// les JSON de out/data.
//
// En prod, ou sans fil complet, un seul fichier vide est écrit (l'export
// statique exige au moins un paramètre) ; les pages masquent alors « Voir plus ».

import geo from "@/lib/geo/circonscriptions-2026.json";
import { cleCirco, loadFilComplet, type FondCarte } from "@/lib/data/social";

export const dynamic = "force-static";
export const dynamicParams = false;

const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";
const VIDE = "vide.json";
const circos = (geo as FondCarte).circonscriptions;

export async function generateStaticParams() {
  const complet = isProd ? null : await loadFilComplet();
  if (!complet) return [{ fichier: VIDE }];
  return [...circos.filter((c) => complet.has(cleCirco(c.nom))).map((c) => ({ fichier: `${c.code}.json` })), { fichier: VIDE }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ fichier: string }> }) {
  const { fichier } = await params;
  const circo = circos.find((c) => `${c.code}.json` === fichier);
  const complet = isProd || !circo ? null : await loadFilComplet();
  return Response.json(complet?.get(cleCirco(circo!.nom)) ?? []);
}
