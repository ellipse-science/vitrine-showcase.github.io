import { RawMaquette } from "@/components/sections/RawMaquette";
import { PartisCouvertureSection } from "@/components/sections/PartisCouvertureSection";
import { AssembleeSection } from "@/components/sections/AssembleeSection";
import { PulseCountdown } from "@/components/interactive/PulseCountdown";

export default function Home() {
  return (
    <div className="page">
      {/* Masthead, sub-nav, pulse-band, headlines (Une des unes) — raw maquette HTML */}
      <RawMaquette chunk="top" />

      <PartisCouvertureSection />

      {/* Treemap fusionné: objets saillants × enjeu CAPP — raw maquette HTML */}
      <RawMaquette chunk="middle" />

      <AssembleeSection />

      {/* Partenaires + footer-note — raw maquette HTML */}
      <RawMaquette chunk="bottom" />

      <PulseCountdown />
    </div>
  );
}
