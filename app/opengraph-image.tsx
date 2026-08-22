import { renderGlobalShareCard } from "@/lib/globalShareCard";

export const alt =
  "La Vitrine démocratique, analyse de la couverture médiatique et des discours politiques au Québec";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Image() {
  return renderGlobalShareCard();
}
