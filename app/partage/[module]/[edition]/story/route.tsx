import { ImageResponse } from "next/og";

import {
  SHARE_MODULE_SLUGS,
  getShareModuleContent,
  isShareModuleSlug,
  listShareEditions,
  shareEditionLabel,
} from "@/lib/shareModules";
import { ShareCard, getShareCardFormat, toShareCardContent } from "@/lib/shareCardTemplate";
import { loadShareFonts } from "@/lib/shareCardFonts";

// Story verticale d'une édition PASSÉE. Même gabarit que la story courante
// (app/partage/[module]/story/route.tsx) : seule la donnée change, plus le
// pied de carte qui nomme l'édition rejouée.
const FORMAT = getShareCardFormat("story");

export async function generateStaticParams() {
  const editions = await listShareEditions();
  return SHARE_MODULE_SLUGS.flatMap((module) => editions.map((e) => ({ module, edition: e.key })));
}

export async function GET(_request: Request, { params }: { params: Promise<{ module: string; edition: string }> }) {
  const { module, edition: key } = await params;
  const edition = (await listShareEditions()).find((e) => e.key === key);

  const content =
    isShareModuleSlug(module) && edition
      ? await getShareModuleContent(module, edition)
      : { title: "La Vitrine démocratique", subtitle: "Six fois par jour", stat: { value: "", label: "" } };

  const fonts = await loadShareFonts();

  return new ImageResponse(
    <ShareCard content={toShareCardContent(content, edition && shareEditionLabel(edition))} format="story" />,
    { width: FORMAT.width, height: FORMAT.height, fonts },
  );
}
