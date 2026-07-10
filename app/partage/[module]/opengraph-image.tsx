import { ImageResponse } from "next/og";

import { SHARE_MODULE_SLUGS, getShareModuleContent, isShareModuleSlug } from "@/lib/shareModules";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return SHARE_MODULE_SLUGS.map((module) => ({ module }));
}

// Jetons de couleur du thème clair (app/globals.css) — Satori ne comprend
// pas var(), il faut des valeurs littérales.
const PAPER = "#F3ECDD";
const INK = "#1C1917";
const CORDOVAN = "#6B1E2A";
const RULE = "#C8BDA6";

export default async function Image({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const { title, description } = isShareModuleSlug(module)
    ? await getShareModuleContent(module)
    : { title: "La Vitrine démocratique", description: "" };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "64px 72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 24,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: CORDOVAN,
          }}
        >
          La Vitrine démocratique
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          {description && (
            <div style={{ display: "flex", fontSize: 32, color: INK, opacity: 0.75, lineHeight: 1.3 }}>
              {description.length > 160 ? `${description.slice(0, 157)}…` : description}
            </div>
          )}
        </div>

        <div style={{ display: "flex", borderTop: `2px solid ${RULE}`, paddingTop: 24, fontSize: 20, color: INK, opacity: 0.6 }}>
          Centre d&apos;analyse des politiques publiques (CAPP) — Université Laval
        </div>
      </div>
    ),
    { ...size },
  );
}
