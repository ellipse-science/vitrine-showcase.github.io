import { ImageResponse } from "next/og";

import { SHARE_MODULE_SLUGS, getShareModuleContent, isShareModuleSlug } from "@/lib/shareModules";
import { ShareCard, getShareCardFormat, toShareCardContent } from "@/lib/shareCardTemplate";
import { loadShareFonts } from "@/lib/shareCardFonts";
import { loadCurrentUneShareImage } from "@/lib/shareUneArt";

const FORMAT = getShareCardFormat("og");

export const size = { width: FORMAT.width, height: FORMAT.height };
export const contentType = "image/png";

export function generateStaticParams() {
  return SHARE_MODULE_SLUGS.map((module) => ({ module }));
}

// Carte de déballage (unfurl) pour X/Facebook/LinkedIn. Même affiche que la
// story Instagram, cadrée en paysage : lib/shareCardTemplate.tsx porte la mise
// en page, ce fichier ne fait que choisir le format et fournir la donnée.
export default async function Image({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const content = isShareModuleSlug(module)
    ? await getShareModuleContent(module)
    : { title: "La Vitrine démocratique", subtitle: "Six fois par jour", stat: { value: "", label: "" } };

  const fonts = await loadShareFonts();
  const imageSrc = module === "une-des-unes" ? await loadCurrentUneShareImage() : undefined;
  const card = toShareCardContent(content);

  return new ImageResponse(<ShareCard content={{ ...card, imageSrc }} format="og" />, { ...size, fonts });
}
