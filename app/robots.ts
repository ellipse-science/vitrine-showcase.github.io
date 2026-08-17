import type { MetadataRoute } from "next";

// robots.txt généré au build, et non servi depuis public/ — parce qu'il doit
// DIFFÉRER selon l'hôte.
//
// Le site tourne sur deux environnements permanents (cf. le plan dev/prod) :
//   - dev  : GitHub Pages, sous basePath /vitrine-showcase.github.io
//   - prod : Cloudflare Pages, à la racine de vitrinedemocratique.com
//
// Les deux sont publics et servent le MÊME contenu. Sans cette distinction, ils
// se disputent le référencement : contenu dupliqué, et rien ne garantit que
// Google retienne le bon. On interdit donc l'indexation du dev.
//
// Signal : basePath non vide ⇒ GitHub Pages. C'est deploy.yml qui l'épingle
// explicitement (NEXT_PUBLIC_BASE_PATH: /vitrine-showcase.github.io), alors que
// Cloudflare le met à "" — la même bascule que next.config.ts et app/layout.tsx.
// Le complément indispensable est NEXT_PUBLIC_SITE_ORIGIN côté Cloudflare, sans
// quoi les URL canoniques de prod pointeraient vers le dev.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const isDevMirror = basePath !== "";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  if (isDevMirror) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return { rules: { userAgent: "*", allow: "/" } };
}
