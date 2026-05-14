import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Vitrine démocratique",
  description: "Maquette pour Hugo — CLESSN, Université Laval",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
