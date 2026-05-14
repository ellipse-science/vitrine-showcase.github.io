import { PartisCouvertureSection } from "@/components/sections/PartisCouvertureSection";
import { AssembleeSection } from "@/components/sections/AssembleeSection";

export default function Home() {
  return (
    <div className="page">
      <PartisCouvertureSection />
      <AssembleeSection />
    </div>
  );
}
