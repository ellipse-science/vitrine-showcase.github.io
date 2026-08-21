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
import { loadCurrentUneShareImage } from "@/lib/shareUneArt";

const FORMAT = getShareCardFormat("og");

export const size = { width: FORMAT.width, height: FORMAT.height };
export const contentType = "image/png";

export async function generateStaticParams() {
  const editions = await listShareEditions();
  return SHARE_MODULE_SLUGS.flatMap((module) => editions.map((e) => ({ module, edition: e.key })));
}

export default async function Image({ params }: { params: Promise<{ module: string; edition: string }> }) {
  const { module, edition: key } = await params;
  const edition = (await listShareEditions()).find((e) => e.key === key);

  const content =
    isShareModuleSlug(module) && edition
      ? await getShareModuleContent(module, edition)
      : { title: "La Vitrine démocratique", subtitle: "Six fois par jour", stat: { value: "", label: "" } };

  const fonts = await loadShareFonts();
  const imageSrc =
    module === "une-des-unes" && edition
      ? await loadCurrentUneShareImage(edition.key)
      : undefined;
  const card = toShareCardContent(content, edition && shareEditionLabel(edition));

  return new ImageResponse(
    <ShareCard content={{ ...card, imageSrc }} format="og" />,
    { ...size, fonts },
  );
}
