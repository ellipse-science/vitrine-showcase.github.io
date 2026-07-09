import React from "react";

import { loadHeadlineEvents, type SolitudeStory } from "@/lib/data/headlineEvents";
import { ShareButton } from "@/components/interactive/ShareButton";

// Module 2 — « Deux solitudes » : bloc convergence/divergence Québec↔Canada.
//
// Section AUTONOME, séparée de « Une des unes » (module 1) même si elle lit la
// même table `headline_events_4h`. Le wrapper de haut niveau — avec l'anchor
// URL (#deux-solitudes) et le data-section pour le signalement — vit dans
// app/page.tsx, comme pour les autres modules (convention PR #199 : un module
// = une section top-level référençable en URL).

function DeuxSolitudes({
  qcPos,
  rocPos,
  divPct,
  stories,
}: {
  qcPos: number;
  rocPos: number;
  divPct: number;
  stories: SolitudeStory[];
}) {
  return (
    <section
      className="solitudes"
      style={{ "--qc-pos": `${qcPos}%`, "--roc-pos": `${rocPos}%` } as React.CSSProperties}
    >
      <div className="sol-title-row">
        <h3 className="sol-title">Deux solitudes?</h3>
        <ShareButton title={`Deux solitudes — ${divPct} % de divergence aujourd'hui`} anchor="deux-solitudes" />
      </div>
      <div className="sol-viz">
        <div className="sol-axis" />
        <div className="sol-symbol qc">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="glyph fleur" src="images/fleur-de-lys.svg" alt="Québec" aria-label="Québec" />
          <span className="caption">Québec</span>
        </div>
        <div className="sol-symbol roc">
          <span className="glyph maple" aria-label="Canada">🍁</span>
          <span className="caption">Canada</span>
        </div>
      </div>
      <div className="sol-stat">
        <span className="stat-big">{divPct} %</span>
        <span className="stat-label">de divergence aujourd&apos;hui</span>
      </div>
      <p className="sol-explain">
        Les trois nouvelles dont la couverture diffère le plus entre les médias québécois et canadiens.
      </p>
      <div className="sol-stories">
        <div className="sol-stories-header">
          <span className="qc-col">Importance au Québec</span>
          <span className="ca-col">Importance au Canada</span>
        </div>
        {stories.map((s, i) => (
          <div key={i} className="sol-story">
            <div className="story-label">{s.label}</div>
            <div className="story-bars">
              <div className="bar-track qc">
                <div className="bar-fill" style={{ width: `${s.qcWidth}%` }} />
                {s.qcZero && <span className="zero-mark">—</span>}
              </div>
              <div className="bar-track ca">
                <div className="bar-fill" style={{ width: `${s.caWidth}%` }} />
                {s.caZero && <span className="zero-mark">—</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function DeuxSolitudesSection() {
  const data = await loadHeadlineEvents();
  if (!data) return null;

  return (
    <DeuxSolitudes
      qcPos={data.solitudesQcPos}
      rocPos={data.solitudesRocPos}
      divPct={data.solitudesDivPct}
      stories={data.solitudesStories}
    />
  );
}
