import fs from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { loadShareFonts } from "@/lib/shareCardFonts";
import { CORDOVAN, INK, PAPER, RULE } from "@/lib/shareImageTokens";

export const GLOBAL_SHARE_SIZE = { width: 1200, height: 630 };

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

export async function renderGlobalShareCard(): Promise<ImageResponse> {
  const brandDirectory = path.resolve(process.cwd(), "public", "images", "brand");
  const [fonts, vitrineLogo, cappLogo] = await Promise.all([
    loadShareFonts(),
    fs.readFile(path.join(brandDirectory, "logo_vitrinedemocratique_bg-none_theme-black.png")),
    fs.readFile(path.join(brandDirectory, "logo_capp_1row_bg-none_theme-black.png")),
  ]);

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
          justifyContent: "center",
          position: "relative",
          width: "66%",
          paddingRight: 46,
          borderRight: `2px solid ${RULE}`,
        }}
      >
        {/* Identité officielle : les deux PNG sont ceux du masthead du site. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pngDataUrl(vitrineLogo)}
          alt=""
          width="670"
          height="221"
          style={{ width: "670px", height: "221px", objectFit: "contain" }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: -24,
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "IBM Plex Mono",
              fontSize: 14,
              letterSpacing: 4,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Propulsé par le
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pngDataUrl(cappLogo)}
            alt=""
            width="365"
            height="115"
            style={{ width: "365px", height: "115px", objectFit: "contain" }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          width: "34%",
          paddingLeft: 46,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", width: 82, height: 6, background: CORDOVAN }} />
          <div
            style={{
              display: "flex",
              fontFamily: "IBM Plex Mono",
              fontSize: 15,
              letterSpacing: 3.8,
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            Analyse en continu
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "Playfair Display",
            fontWeight: 700,
            fontSize: 34,
            lineHeight: 1.18,
          }}
        >
          Une lecture scientifique de la couverture médiatique et des discours politiques au Québec.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              fontFamily: "IBM Plex Mono",
              fontSize: 14,
              letterSpacing: 2.4,
              textTransform: "uppercase",
            }}
          >
            <span>Médias</span>
            <span style={{ color: CORDOVAN }}>◆</span>
            <span>Décideurs</span>
            <span style={{ color: CORDOVAN }}>◆</span>
            <span>Promesses</span>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "IBM Plex Mono",
              fontSize: 14,
              letterSpacing: 1.5,
            }}
          >
            vitrinedemocratique.com
          </div>
        </div>
      </div>
    </div>,
    { ...GLOBAL_SHARE_SIZE, fonts },
  );
}
