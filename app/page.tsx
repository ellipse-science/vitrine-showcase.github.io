import { RawMaquette } from "@/components/sections/RawMaquette";
import { PartisCouvertureSection } from "@/components/sections/PartisCouvertureSection";
import { AssembleeSection } from "@/components/sections/AssembleeSection";
import { UneDesUnesSection } from "@/components/sections/UneDesUnesSection";
import { DeuxSolitudesSection } from "@/components/sections/DeuxSolitudesSection";
import { TreemapSection } from "@/components/sections/TreemapSection";
import { PolimetrePlusSection } from "@/components/sections/PolimetrePlusSection";
import { EditionNav } from "@/components/interactive/EditionNav";
import { IssueReporter } from "@/components/interactive/IssueReporter";
import { listEditions } from "@/lib/data/headlineEvents";

// Module RETIRÉ DE PROD, gardé sur dev (2026-08-20) : sa section se garde
// déjà elle-même (elle rend null en prod) — on retire AUSSI l'enveloppe
// <div data-section> pour ne pas laisser d'ancre vide dans la page.
// L'Assemblée a quitté ce régime le 2026-08-27 : identités stables validées,
// cache de performance validé sur Lambda réelle, parcours des député·es
// vérifié sur dev (Christian Dubé, CAQ → IND).
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export default async function Home() {
  // Les éditions consultables du snapshot (#434) : le bandeau de l'en-tête ne
  // devine pas ce qui existe, il le reçoit.
  const editions = await listEditions();

  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <div id="une-des-unes" data-section="Une des Unes">
        <UneDesUnesSection shareEditionKey={editions[0]?.key} />
      </div>

      <div id="deux-solitudes" data-section="Deux solitudes">
        <DeuxSolitudesSection />
      </div>

      {/* Du plus général au plus spécifique : les enjeux dont on parle avant
          les partis qui les portent, l'ensemble des promesses avant le détail
          de la chambre. L'ordre d'affichage ne suit plus la numérotation des
          modules, qui reste attachée à chaque bloc (labels de signalement). */}
      <div id="enjeux-saillants" data-section="Enjeux saillants">
        <TreemapSection />
      </div>

      {!isProd && (
        <div id="partis-et-couverture" data-section="Partis et couverture">
          <PartisCouvertureSection />
        </div>
      )}

      <div id="polimetre-plus" data-section="Polimètre+">
        <PolimetrePlusSection />
      </div>

      <div id="assemblee-nationale" data-section="Assemblée nationale">
        <AssembleeSection />
      </div>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>

      <EditionNav editions={editions} />
      <IssueReporter />
    </div>
  );
}
