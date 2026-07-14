import { loadHeadlineEvents } from "@/lib/data/headlineEvents";
import { ShareButton } from "@/components/interactive/ShareButton";
import { DeuxSolitudesRadar } from "@/components/interactive/DeuxSolitudesRadar";

// Module 2 — « Deux solitudes » : radar « qui parle de quoi » Québec↔Canada.
//
// Section AUTONOME, séparée de « Une des unes » (module 1) même si elle lit la
// même table `headline_events_4h`. Le wrapper de haut niveau — avec l'anchor
// URL (#deux-solitudes) et le data-section pour le signalement — vit dans
// app/page.tsx, comme pour les autres modules (convention PR #199 : un module
// = une section top-level référençable en URL).
//
// Server component : charge les données et les passe au radar (client) qui
// gère les interactions (infobulle des points, bulle éditoriale).

export async function DeuxSolitudesSection() {
  const data = await loadHeadlineEvents();
  if (!data) return null;
  const s = data.solitudes;

  return (
    <section className="solitudes">
      <div className="sol-title-row">
        <h3 className="sol-title">Deux solitudes&nbsp;?</h3>
        <ShareButton title={`Deux solitudes — ${s.divPct} % de divergence aujourd'hui`} anchor="deux-solitudes" />
      </div>
      <p className="sol-sub">Les sujets qui dominent l&apos;actualité québécoise et canadienne.</p>
      <DeuxSolitudesRadar solitudes={s} />
      <div className="module-last-updated">{data.lastUpdated}</div>
    </section>
  );
}
