import type { NextConfig } from "next";
import path from "node:path";

const isProd = process.env.NODE_ENV === "production";
const repoBasePath = "/vitrine-showcase.github.io";
// Per-host base path. `next build` sets NODE_ENV=production on every host, so we
// can't use it to tell GitHub Pages (served under /vitrine-showcase.github.io)
// apart from Cloudflare Pages (served at the vitrinedemocratique.com root). An
// explicit NEXT_PUBLIC_BASE_PATH wins; "" is a valid value (root), so use ?? not ||.
//   - GitHub Pages (deploy.yml):  NEXT_PUBLIC_BASE_PATH=/vitrine-showcase.github.io
//   - Cloudflare Pages (prod):    NEXT_PUBLIC_BASE_PATH=""  (root domain)
//   - Local dev/build (unset):    falls back to today's behavior
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (isProd ? repoBasePath : "");

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
