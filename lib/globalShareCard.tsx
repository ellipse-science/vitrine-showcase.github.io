import fs from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { loadShareFonts } from "@/lib/shareCardFonts";
import { INK, PAPER, RULE } from "@/lib/shareImageTokens";

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
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        background: PAPER,
        color: INK,
        padding: "50px 70px 42px",
        fontFamily: "Source Serif 4",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 18,
          right: 18,
          bottom: 18,
          left: 18,
          border: `2px solid ${RULE}`,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          flex: 1,
          width: "100%",
        }}
      >
        {/* Identité officielle : les deux PNG sont ceux du masthead du site. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pngDataUrl(vitrineLogo)}
          alt=""
          width="760"
          height="251"
          style={{ width: "760px", height: "251px", objectFit: "contain" }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: -34,
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "IBM Plex Mono",
              fontSize: 15,
              letterSpacing: 4.2,
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
            width="390"
            height="123"
            style={{ width: "390px", height: "123px", objectFit: "contain" }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          width: "100%",
          borderTop: `2px solid ${RULE}`,
          paddingTop: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            maxWidth: 790,
            fontSize: 22,
            lineHeight: 1.25,
          }}
        >
          Analyse scientifique de la couverture médiatique et des discours politiques au Québec.
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
    </div>,
    { ...GLOBAL_SHARE_SIZE, fonts },
  );
}
