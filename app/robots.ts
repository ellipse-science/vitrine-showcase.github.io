import type { MetadataRoute } from "next";
import { siteOrigin, basePath } from "@/lib/site";

// robots.txt généré au build, et non servi depuis public/ — parce qu'il doit
// DIFFÉRER selon l'environnement.
//
// Le site tourne sur deux environnements permanents :
//   - dev  : dev.vitrinedemocratique.com, protégé par Cloudflare Access
//   - prod : vitrinedemocratique.com, public
//
// Les deux servent le MÊME contenu. Sans distinction, ils se disputent le
// référencement : contenu dupliqué, et rien ne garantit que Google retienne le
// bon. On interdit donc l'indexation du dev — ceinture et bretelles, puisque
// Access empêche déjà tout robot d'y accéder.
//
// Signal : NEXT_PUBLIC_SITE_ENV, et non plus « basePath vide ». Ce dernier
// distinguait les deux du temps où le dev vivait sous le sous-chemin du miroir
// GitHub Pages, débranché depuis le 2026-08-30 (#638) ; à la racine de son
// propre domaine, le dev a un basePath vide lui aussi. Le même signal pilote le
// garde-fou des fausses données dans lib/data/parties.ts — un seul signal, pour
// qu'ils ne puissent pas diverger.
const isDevEnv = process.env.NEXT_PUBLIC_SITE_ENV === "dev";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  if (isDevEnv) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteOrigin}${basePath}/sitemap.xml`,
  };
}
