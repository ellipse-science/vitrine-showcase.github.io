import { ImageResponse } from "next/og";

import { SHARE_MODULE_SLUGS, getShareModuleContent, isShareModuleSlug, type ShareModuleSlug } from "@/lib/shareModules";
import { PAPER, INK, CORDOVAN, GREEN } from "@/lib/shareImageTokens";
import { SHARE_BACKGROUND_IMAGES, loadShareBackgroundDataUri } from "@/lib/shareImageBackgrounds";

// Story verticale (1080×1920, ratio 9:16 Instagram Stories) — pensée pour le
// partage natif mobile (ShareButton.tsx), pas pour l'unfurl de lien. Toute la
// carte est teintée de la couleur de la donnée elle-même (parti, enjeu) —
// jamais une teinte inventée — pour que chaque module ait sa propre identité
// visuelle, façon affiche plutôt que capture d'écran. Contraste maximal
// (fond en couleur, texte papier) délibérément réservé à cet « objet à
// part » qu'on partage — pas une page du site (design_language.md « pas de
// mode sombre » vise l'UI du site, pas cet artefact ponctuel).
const width = 1080;
const height = 1920;

// Accent par défaut quand la donnée n'a pas de couleur propre (deux
// solitudes, promesses) : vert « succès » pour Polimètre+ (le token existant
// pour les États de succès), cordovan partout ailleurs.
const DEFAULT_ACCENT: Partial<Record<ShareModuleSlug, string>> = {
  "polimetre-plus": GREEN,
};

export function generateStaticParams() {
  return SHARE_MODULE_SLUGS.map((module) => ({ module }));
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function GET(_request: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const isValid = isShareModuleSlug(module);
  const { title, stat } = isValid
    ? await getShareModuleContent(module)
    : { title: "La Vitrine démocratique", stat: { value: "", label: "", color: undefined as string | undefined } };

  const accent = stat.color ?? (isValid ? DEFAULT_ACCENT[module] : undefined) ?? CORDOVAN;
  const watermark = stat.value.replace(/[^0-9]/g, "").slice(0, 2) || "•";
  // « • » plutôt que « ✦ » — ce glyphe est couvert par la police par défaut de
  // Satori ; un caractère hors de cette police déclenche un fetch réseau vers
  // Google Fonts à la génération de l'image, un aller-retour fragile à la fois
  // en dev et au build statique (CI).
  const ticker = Array(6).fill("LA VITRINE DÉMOCRATIQUE").join("   •   ");
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
            width={width}
            height={height}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: bgConfig?.objectPosition }}
          />
        )}
        {bgDataUri && (
          // Voile pour la lisibilité du texte par-dessus la photo — plus sombre en
          // haut/bas (sous le titre et le ticker), plus clair au centre (sujet visible).
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

        {/* Tampon rotatif — clin d'œil au « six fois par jour » du bandeau du site. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 86,
            right: -34,
            transform: "rotate(9deg)",
            background: INK,
            color: PAPER,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            padding: "12px 46px",
          }}
        >
          En direct
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "84px 72px 0" }}>
          <div style={{ display: "flex", width: 120, height: 9, background: INK }} />
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: PAPER, opacity: 0.85 }}>
            La Vitrine démocratique
          </div>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 700, color: PAPER, lineHeight: 1.25, maxWidth: 820 }}>
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            position: "relative",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "0 32px",
          }}
        >
          {!bgDataUri && (
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: 680,
                fontWeight: 900,
                color: INK,
                opacity: 0.14,
                lineHeight: 1,
                letterSpacing: -6,
                whiteSpace: "nowrap",
              }}
            >
              {watermark}
            </div>
          )}

          <div
            style={{
              display: "flex",
              fontSize: 340,
              fontWeight: 900,
              color: PAPER,
              lineHeight: 1,
              letterSpacing: -10,
            }}
          >
            {stat.value}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 36,
              fontSize: 38,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: PAPER,
              textAlign: "center",
              maxWidth: 880,
            }}
          >
            {stat.label}
          </div>
          {stat.context && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "baseline",
                gap: 12,
                marginTop: 28,
                maxWidth: 860,
              }}
            >
              <div style={{ display: "flex", fontSize: 32, fontStyle: "italic", color: PAPER, opacity: 0.78, lineHeight: 1.45 }}>
                {truncate(stat.context, 150)}
              </div>
              {stat.contextHighlight && (
                <div style={{ display: "flex", background: INK, color: PAPER, fontWeight: 900, fontSize: 32, lineHeight: 1.3, padding: "2px 14px" }}>
                  {stat.contextHighlight}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bandeau ticker — signature graphique en bas de carte, byline incluse. */}
        <div style={{ display: "flex", background: INK, padding: "22px 0", overflow: "hidden" }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: PAPER, opacity: 0.8, whiteSpace: "nowrap" }}>
            {ticker}
          </div>
        </div>
      </div>
    ),
    { width, height },
  );
}
