import type { Metadata } from "next";
import "./globals.css";
import ActualisationAuto from "@/components/interactive/ActualisationAuto";
import ServiceWorkerRegistration from "@/components/interactive/ServiceWorkerRegistration";

// Icônes servies depuis public/ : jamais résolues automatiquement par le
// navigateur (requête implicite sur /favicon.ico à la racine du domaine),
// car le site est publié sous un basePath sur GitHub Pages.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Origin par hôte — même logique multi-hôte que next.config.ts (basePath) :
//   - GitHub Pages (défaut) : https://ellipse.science + basePath /vitrine-showcase.github.io
//   - Cloudflare Pages      : NEXT_PUBLIC_SITE_ORIGIN=https://vitrinedemocratique.com + basePath ""
const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://ellipse.science";

const SITE_DESCRIPTION =
  "Analyse scientifique en continu de la couverture médiatique et des discours politiques au Québec, par le Centre d'analyse des politiques publiques (CAPP) de l'Université Laval.";

export const metadata: Metadata = {
  // Base absolue pour les URLs Open Graph/Twitter, dérivée de l'hôte + du
  // basePath (les chemins relatifs des images OG se résolvent contre elle).
  metadataBase: new URL(`${basePath}/`, siteOrigin),
  title: "La Vitrine démocratique",
  description: SITE_DESCRIPTION,
  // Canonique par page, résolue contre metadataBase : l'apex fait foi. Sans
  // elle, www, *.pages.dev et le miroir GitHub Pages servent le même contenu
  // en 200 et se disputent le référencement au moment où les liens entrants
  // arrivent (lancement médias).
  alternates: { canonical: "./" },
  // Cartes de partage (Facebook/LinkedIn via Open Graph, X via Twitter card).
  // NB : les réseaux ignorent le fragment #module — tous les liens partagés
  // affichent cette carte globale. Cartes PAR module = mini-pages OG dédiées
  // (ticket séparé).
  openGraph: {
    type: "website",
    siteName: "La Vitrine démocratique",
    title: "La Vitrine démocratique",
    description: SITE_DESCRIPTION,
    locale: "fr_CA",
    images: [
      {
        url: "images/brand/logo_vitrinedemocratique_bg-none_theme-black.png",
        width: 1788,
        height: 591,
        alt: "La Vitrine démocratique",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "La Vitrine démocratique",
    description: SITE_DESCRIPTION,
    images: ["images/brand/logo_vitrinedemocratique_bg-none_theme-black.png"],
  },
  manifest: `${basePath}/manifest.json`,
  icons: {
    icon: [
      { url: `${basePath}/favicon.ico`, sizes: "any", media: "(prefers-color-scheme: light)" },
      { url: `${basePath}/favicon-16x16.png`, sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: `${basePath}/favicon-32x32.png`, sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: `${basePath}/dark-favicon.ico`, sizes: "any", media: "(prefers-color-scheme: dark)" },
      { url: `${basePath}/dark-favicon-16x16.png`, sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: `${basePath}/dark-favicon-32x32.png`, sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: `${basePath}/apple-touch-icon.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Source+Serif+4:ital,wght@0,400;0,500;0,700;0,900;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <ActualisationAuto />
        {children}
        {/* Cloudflare Web Analytics — PROD seulement. Sans témoin ni profil
            individuel : la mesure d'audience qui manquait à l'audit du
            2026-08-19 (« l'afflux sera invisible »). Le jeton est public par
            nature (il figure dans le HTML de toute façon) ; l'injection
            automatique côté edge ne s'applique pas aux sites Pages, d'où la
            balise posée ici. Même signal d'environnement que robots.ts. */}
        {process.env.NEXT_PUBLIC_SITE_ENV === "prod" && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon='{"token": "adcd14712b6f44c1b083efde8096353b"}'
          />
        )}
      </body>
    </html>
  );
}
