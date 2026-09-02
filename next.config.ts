import type { NextConfig } from "next";
import path from "node:path";

// Le site est servi à la RACINE de son domaine sur les trois hôtes qui restent
// (vitrinedemocratique.com, dev.vitrinedemocratique.com, développement local).
// Le sous-chemin n'a jamais servi qu'au miroir GitHub Pages, débranché le
// 2026-08-30 (#638) : le repli qui pointait vers lui préfixait toutes les URL
// d'actifs d'un chemin mort dès qu'un build de production oubliait de poser la
// variable. Le repli est donc la racine.
//
// NEXT_PUBLIC_BASE_PATH reste lue : un hôte qui servirait sous un sous-chemin
// se règle par elle, sans toucher au code. "" est une valeur valide (racine),
// d'où `??` et non `||`.
//   - Cloudflare Pages, prod et dev : NEXT_PUBLIC_BASE_PATH=""
//   - build local (variable absente) : "" aussi
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
