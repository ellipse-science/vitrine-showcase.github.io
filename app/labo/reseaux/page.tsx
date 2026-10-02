import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { SocialSection } from "@/components/sections/SocialSection";
import { IssueReporter } from "@/components/interactive/IssueReporter";

// Page de labo, miroir de travail seulement : le module « Les candidats sur
// les réseaux » seul, sans les autres modules. La page d'accueil rend tout le
// site à chaque requête en dev (30 s à 100 s) ; ici, le module se recharge en
// quelques secondes et se partage par une adresse courte.
export const metadata: Metadata = {
  title: "Labo · La guerre des clics",
  robots: { index: false, follow: false },
};

const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export default async function LaboReseauxPage() {
  if (isProd) notFound();
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <div id="candidats-reseaux" data-section="Candidats sur les réseaux">
        <SocialSection />
      </div>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>
      <IssueReporter />
    </div>
  );
}
