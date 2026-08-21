import { ImageResponse } from "next/og";

import { loadShareFonts } from "@/lib/shareCardFonts";
import { CORDOVAN, INK, PAPER, RULE } from "@/lib/shareImageTokens";

export const GLOBAL_SHARE_SIZE = { width: 1200, height: 630 };

export async function renderGlobalShareCard(): Promise<ImageResponse> {
  const fonts = await loadShareFonts();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: PAPER,
        color: INK,
        padding: 58,
        fontFamily: "Source Serif 4",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          inset: 18,
          border: `2px solid ${RULE}`,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          width: "70%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", width: 82, height: 6, background: CORDOVAN }} />
          <div
            style={{
              display: "flex",
              fontFamily: "IBM Plex Mono",
              fontSize: 17,
              letterSpacing: 4.5,
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Centre d&apos;analyse des politiques publiques
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Playfair Display",
              fontWeight: 900,
              fontSize: 78,
              lineHeight: 0.92,
              letterSpacing: -2.5,
              textTransform: "uppercase",
            }}
          >
            <span>La Vitrine</span>
            <span>démocratique</span>
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 690,
              fontSize: 27,
              lineHeight: 1.25,
            }}
          >
            Une lecture scientifique de la couverture médiatique et des discours politiques au Québec.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: "IBM Plex Mono",
            fontSize: 15,
            letterSpacing: 2.6,
            textTransform: "uppercase",
          }}
        >
          <span>Médias</span>
          <span style={{ color: CORDOVAN }}>◆</span>
          <span>Décideurs</span>
          <span style={{ color: CORDOVAN }}>◆</span>
          <span>Promesses</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          width: "30%",
          borderLeft: `2px solid ${RULE}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 236,
            height: 236,
            border: `5px solid ${CORDOVAN}`,
            borderRadius: 118,
            fontFamily: "Playfair Display",
            fontWeight: 900,
            fontSize: 176,
            lineHeight: 1,
            color: CORDOVAN,
          }}
        >
          V
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontFamily: "IBM Plex Mono",
            fontSize: 14,
            letterSpacing: 1.8,
          }}
        >
          vitrinedemocratique.com
        </div>
      </div>
    </div>,
    { ...GLOBAL_SHARE_SIZE, fonts },
  );
}
