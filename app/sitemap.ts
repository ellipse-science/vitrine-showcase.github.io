import type { MetadataRoute } from "next";

import { listEditions } from "@/lib/data/headlineEvents";
import { siteOrigin, basePath } from "@/lib/site";

// sitemap.xml généré au build (export statique), absent jusqu'ici — le seul
// vrai manque SEO relevé par l'audit de lancement du 2026-08-19. Les liens
// entrants d'une couverture médiatique s'indexent mieux quand le plan du site
// dit ce qui existe : les pages stables, et les éditions de la fenêtre
// courante (le bandeau du site ne propose rien d'autre non plus).
//
// L'origine vient de NEXT_PUBLIC_SITE_ORIGIN — le même signal que
// metadataBase. Sur le miroir dev, robots.ts interdit déjà tout : un sitemap
// y est inoffensif.

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `${siteOrigin}${basePath}`;
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/methodologie/`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/apropos/`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/journal/`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${base}/abonnement/`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const editions = await listEditions();
  const editionPages: MetadataRoute.Sitemap = editions.map((e) => ({
    url: `${base}/edition/${e.key}/`,
    lastModified: new Date(`${e.dateIso}T00:00:00-04:00`),
    changeFrequency: "never",
    priority: 0.3,
  }));

  return [...staticPages, ...editionPages];
}
