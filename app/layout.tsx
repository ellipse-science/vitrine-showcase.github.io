import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/interactive/ServiceWorkerRegistration";

// Icônes servies depuis public/ : jamais résolues automatiquement par le
// navigateur (requête implicite sur /favicon.ico à la racine du domaine),
// car le site est publié sous un basePath sur GitHub Pages.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "La Vitrine démocratique",
  description:
    "Analyse scientifique en continu de la couverture médiatique et des discours politiques au Québec, par le Centre d'analyse des politiques publiques (CAPP) de l'Université Laval.",
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
        {children}
      </body>
    </html>
  );
}
