// Un seul repli pour l'origine du site et le chemin de base, partagé par
// app/layout.tsx, app/robots.ts et app/sitemap.ts : trois copies en dur
// pouvaient diverger (retour de revue sur #641). next.config.ts garde sa
// propre lecture de NEXT_PUBLIC_BASE_PATH parce qu'il l'injecte dans `env`.
export const SITE_ORIGIN_DEFAUT = "https://vitrinedemocratique.com";
export const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? SITE_ORIGIN_DEFAUT;
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
