import { RawMaquette } from "@/components/sections/RawMaquette";
import { PartisCouvertureSection } from "@/components/sections/PartisCouvertureSection";
import { AssembleeSection } from "@/components/sections/AssembleeSection";
import { UneDesUnesSection } from "@/components/sections/UneDesUnesSection";
import { TreemapSection } from "@/components/sections/TreemapSection";
import { PulseCountdown } from "@/components/interactive/PulseCountdown";

export default function Home() {
  return (
    <div className="page">
      {/* Masthead, sub-nav, pulse-band */}
      <RawMaquette chunk="top" />

      {/* Une des unes + Deux solitudes — hydratés depuis headline-events.json */}
      <UneDesUnesSection />

      <PartisCouvertureSection />

      {/* Treemap objets saillants × enjeu — hydraté depuis headline-events.json */}
      <TreemapSection />

      <AssembleeSection />

      {/* Partenaires + footer-note */}
      <RawMaquette chunk="bottom" />

      <PulseCountdown />
    </div>
  );
}
