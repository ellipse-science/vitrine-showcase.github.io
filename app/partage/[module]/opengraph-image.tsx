import { ImageResponse } from "next/og";

import { SHARE_MODULE_SLUGS, getShareModuleContent, isShareModuleSlug, type ShareModuleSlug } from "@/lib/shareModules";
import { PAPER, INK, CORDOVAN, GREEN } from "@/lib/shareImageTokens";
import { SHARE_BACKGROUND_IMAGES, loadShareBackgroundDataUri } from "@/lib/shareImageBackgrounds";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Même identité visuelle « affiche » que la story Instagram (story/route.tsx)
// : fond teinté de la couleur de la donnée, chiffre choc, tampon rotatif,
// bandeau ticker — pour que le lien partagé sur X/Facebook/LinkedIn ait la
// même punch que la story, peu importe où l'aperçu apparaît.
const DEFAULT_ACCENT: Partial<Record<ShareModuleSlug, string>> = {
  "polimetre-plus": GREEN,
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function generateStaticParams() {
  return SHARE_MODULE_SLUGS.map((module) => ({ module }));
}

export default async function Image({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const isValid = isShareModuleSlug(module);
  const { title, stat } = isValid
    ? await getShareModuleContent(module)
    : { title: "La Vitrine démocratique", stat: { value: "", label: "", color: undefined as string | undefined } };

  const accent = stat.color ?? (isValid ? DEFAULT_ACCENT[module] : undefined) ?? CORDOVAN;
  const watermark = stat.value.replace(/[^0-9]/g, "").slice(0, 2) || "•";
  // « • » plutôt que « ✦ » — évite un fetch réseau vers Google Fonts pour un
  // glyphe hors de la police par défaut de Satori (cf. story/route.tsx).
  const ticker = Array(8).fill("LA VITRINE DÉMOCRATIQUE").join("   •   ");
  const bgConfig = isValid ? SHARE_BACKGROUND_IMAGES[module] : undefined;
  const bgDataUri = isValid ? await loadShareBackgroundDataUri(module) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: bgDataUri ? INK : accent,
          fontFamily: "Georgia, serif",
        }}
      >
        {bgDataUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgDataUri}
            width={size.width}
            height={size.height}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: bgConfig?.objectPositionOg ?? bgConfig?.objectPosition }}
          />
        )}
        {bgDataUri && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background:
                "linear-gradient(180deg, rgba(28,25,23,0.75) 0%, rgba(28,25,23,0.25) 38%, rgba(28,25,23,0.35) 62%, rgba(28,25,23,0.85) 100%)",
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 34,
            right: -30,
            transform: "rotate(9deg)",
            background: INK,
            color: PAPER,
            fontSize: 16,
            letterSpacing: 3,
            textTransform: "uppercase",
            padding: "8px 34px",
          }}
        >
          En direct
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "48px 64px 0" }}>
          <div style={{ display: "flex", width: 90, height: 7, background: INK }} />
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 5, textTransform: "uppercase", color: PAPER, opacity: 0.85 }}>
            La Vitrine démocratique
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: PAPER, lineHeight: 1.2, maxWidth: 900 }}>
            {title}
          </div>
        </div>

        {stat.kicker ? (
          // Une des unes est une manchette, pas une statistique : le titre
          // domine, le ratio « X/Y médias » devient une preuve de second plan.
          <div style={{ display: "flex", flex: 1, position: "relative", flexDirection: "column", justifyContent: "center", padding: "0 64px", gap: 14 }}>
            <div style={{ display: "flex", background: INK, color: PAPER, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", padding: "6px 16px", alignSelf: "flex-start" }}>
              {stat.kicker}
            </div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 900, color: PAPER, lineHeight: 1.15, maxWidth: 1000 }}>
              {truncate(stat.context ?? "", 100)}
            </div>
            {stat.excerpt && (
              <div style={{ display: "flex", fontSize: 20, fontStyle: "italic", color: PAPER, opacity: 0.82, lineHeight: 1.4, maxWidth: 980 }}>
                {truncate(stat.excerpt, 140)}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 900, color: PAPER }}>{stat.value}</div>
              <div style={{ display: "flex", fontSize: 18, letterSpacing: 1, textTransform: "uppercase", color: PAPER, opacity: 0.85 }}>
                {stat.label}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flex: 1,
              position: "relative",
              alignItems: "center",
              padding: "0 64px",
              gap: 48,
            }}
          >
            <div style={{ display: "flex", position: "relative", alignItems: "center" }}>
              {!bgDataUri && (
                <div
                  style={{
                    display: "flex",
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: 320,
                    fontWeight: 900,
                    color: INK,
                    opacity: 0.14,
                    lineHeight: 1,
                    letterSpacing: -4,
                    whiteSpace: "nowrap",
                  }}
                >
                  {watermark}
                </div>
              )}
              <div style={{ display: "flex", fontSize: 176, fontWeight: 900, color: PAPER, lineHeight: 1, letterSpacing: -6 }}>
                {stat.value}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 620 }}>
              <div style={{ display: "flex", fontSize: 30, letterSpacing: 1, textTransform: "uppercase", color: PAPER, lineHeight: 1.3 }}>
                {stat.label}
              </div>
              {stat.context && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10 }}>
                  <div style={{ display: "flex", fontSize: 24, fontStyle: "italic", color: PAPER, opacity: 0.78, lineHeight: 1.4 }}>
                    {truncate(stat.context, 110)}
                  </div>
                  {stat.contextHighlight && (
                    <div style={{ display: "flex", background: INK, color: PAPER, fontWeight: 900, fontSize: 24, padding: "1px 10px" }}>
                      {stat.contextHighlight}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", background: INK, padding: "16px 0", overflow: "hidden" }}>
          <div style={{ display: "flex", fontSize: 17, letterSpacing: 3, textTransform: "uppercase", color: PAPER, opacity: 0.8, whiteSpace: "nowrap" }}>
            {ticker}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
