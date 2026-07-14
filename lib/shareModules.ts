// Contenu des cartes de partage par module (#210). Un slug = une ancre de
// app/page.tsx (#199) = une mini-page /partage/<slug>/ avec ses propres
// balises Open Graph/Twitter, faute de quoi les réseaux sociaux ignorent le
// fragment #module et affichent tous la carte globale du site (#209).

import { loadHeadlineEvents } from "@/lib/data/headlineEvents";

export const SHARE_MODULE_SLUGS = [
  "une-des-unes",
  "deux-solitudes",
  "partis-et-couverture",
  "enjeux-saillants",
  "assemblee-nationale",
  "polimetre-plus",
] as const;

export type ShareModuleSlug = (typeof SHARE_MODULE_SLUGS)[number];

export function isShareModuleSlug(value: string): value is ShareModuleSlug {
  return (SHARE_MODULE_SLUGS as readonly string[]).includes(value);
}

export type ShareModuleContent = {
  title: string;
  description: string;
};

// Descriptions statiques — suffisantes pour la carte de partage. Seules « Une
// des unes » et « Deux solitudes » ont une ligne calculée à partir de la
// donnée du jour (titre en tête, % de divergence), le reste étant un résumé
// éditorial stable du module.
const STATIC_CONTENT: Record<ShareModuleSlug, ShareModuleContent> = {
  "une-des-unes": {
    title: "Les Unes du jour",
    description: "Les nouvelles qui font la Une des médias québécois et canadiens en ce moment.",
  },
  "deux-solitudes": {
    title: "Deux solitudes ?",
    description: "La couverture médiatique diverge-t-elle entre le Québec et le Canada ?",
  },
  "partis-et-couverture": {
    title: "Couverture médiatique des partis politiques",
    description: "Saillance et ton de la couverture médiatique de chaque parti québécois.",
  },
  "enjeux-saillants": {
    title: "De quoi parle-t-on ?",
    description: "Les enjeux qui dominent l'actualité, jour après jour.",
  },
  "assemblee-nationale": {
    title: "Que dit-on à l'Assemblée nationale ?",
    description: "Répartition des enjeux, ton et richesse lexicale des débats parlementaires.",
  },
  "polimetre-plus": {
    title: "Polimètre+ : promesses sous la loupe médiatique",
    description: "Les promesses électorales de la CAQ (2022), classées selon leur écho médiatique.",
  },
};

export async function getShareModuleContent(slug: ShareModuleSlug): Promise<ShareModuleContent> {
  if (slug === "une-des-unes") {
    const data = await loadHeadlineEvents();
    const top = data?.top3[0];
    if (top) {
      return { title: STATIC_CONTENT[slug].title, description: top.title };
    }
  }
  if (slug === "deux-solitudes") {
    const data = await loadHeadlineEvents();
    if (data) {
      return {
        title: STATIC_CONTENT[slug].title,
        description: `${data.solitudes.divPct} % de divergence aujourd'hui entre les médias québécois et canadiens.`,
      };
    }
  }
  return STATIC_CONTENT[slug];
}
