import { ImageResponse } from "next/og";

import { SHARE_MODULE_SLUGS, getShareModuleContent, isShareModuleSlug } from "@/lib/shareModules";
import { ShareCard, getShareCardFormat, toShareCardContent } from "@/lib/shareCardTemplate";
import { loadShareFonts } from "@/lib/shareCardFonts";

// Story verticale (1080×1920, ratio 9:16 Instagram Stories) — pensée pour le
// partage natif mobile (ShareButton.tsx), pas pour l'unfurl de lien. Le
// cadrage portrait de la même affiche que la carte OG : toute la mise en page
// vit dans lib/shareCardTemplate.tsx.
const FORMAT = getShareCardFormat("story");

export function generateStaticParams() {
  return SHARE_MODULE_SLUGS.map((module) => ({ module }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const content = isShareModuleSlug(module)
    ? await getShareModuleContent(module)
    : { title: "La Vitrine démocratique", subtitle: "Six fois par jour", stat: { value: "", label: "" } };

  const fonts = await loadShareFonts();

  return new ImageResponse(<ShareCard content={toShareCardContent(content)} format="story" />, {
    width: FORMAT.width,
    height: FORMAT.height,
    fonts,
  });
}
