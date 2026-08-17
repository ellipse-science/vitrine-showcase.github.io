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

export async function DeuxSolitudesSection({ editionKey }: { editionKey?: string } = {}) {
  const data = await loadHeadlineEvents(editionKey);
  if (!data) return null;
  const s = data.solitudes;

  return (
    <>
      <section className="solitudes">
        <div className="sol-title-row">
          <h3 className="sol-title">Deux solitudes?</h3>
          {/* Le partage reprend le grand chiffre du module, mot pour mot
              (relDiffPct + relLabel). L'ancienne formule basculait de grandeur
              selon la journée — « X % de convergence » au-dessus de 50 %,
              « X % de divergence » en dessous — donc un même module se
              partageait dans deux vocabulaires d'un jour à l'autre. */}
          <ShareButton title={`Deux solitudes : ${s.relDiffPct} % ${s.relLabel}`} anchor="deux-solitudes" />
        </div>
        <div className="sol-rule" aria-hidden />
        <p className="sol-sub">Les sujets qui dominent l&apos;actualité québécoise<br />et canadienne des 24 dernières heures.</p>
        <DeuxSolitudesRadar solitudes={s} />
      </section>
      {/* Hors du cadre, comme la Une des Unes (uniformité inter-modules). */}
      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}
