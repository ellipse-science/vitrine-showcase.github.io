import { RawMaquette } from "@/components/sections/RawMaquette";
import { PartisCouvertureSection } from "@/components/sections/PartisCouvertureSection";
import { AssembleeSection } from "@/components/sections/AssembleeSection";
import { UneDesUnesSection } from "@/components/sections/UneDesUnesSection";
import { TreemapSection } from "@/components/sections/TreemapSection";
import { PulseCountdown } from "@/components/interactive/PulseCountdown";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export default function Home() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <div data-section="Une des unes">
        <UneDesUnesSection />
      </div>

      <div data-section="Partis et couverture">
        <PartisCouvertureSection />
      </div>

      <div data-section="Enjeux saillants">
        <TreemapSection />
      </div>

      <div data-section="Assemblée nationale">
        <AssembleeSection />
      </div>

      <div data-section="Polimètre+">
        <RawMaquette chunk="polimeter_plus" />
      </div>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>

      <PulseCountdown />
      <IssueReporter />
    </div>
  );
}
