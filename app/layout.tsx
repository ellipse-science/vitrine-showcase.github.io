import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/interactive/ServiceWorkerRegistration";

const SITE_URL = "https://ellipse.science/vitrine-showcase.github.io";

export const metadata: Metadata = {
  title: "La Vitrine démocratique",
  description:
    "Analyse scientifique en continu de la couverture médiatique et des discours politiques au Québec, par le CAPP de l'Université Laval.",
  openGraph: {
    title: "La Vitrine démocratique",
    description:
      "Analyse scientifique en continu de la couverture médiatique et des discours politiques au Québec.",
    url: SITE_URL,
    siteName: "La Vitrine démocratique",
    locale: "fr_CA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "La Vitrine démocratique",
    description:
      "Analyse scientifique en continu de la couverture médiatique et des discours politiques au Québec.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
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
