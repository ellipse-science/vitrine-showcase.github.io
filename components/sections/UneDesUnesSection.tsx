import { loadHeadlineEvents, type UneEvent, type SolitudeStory } from "@/lib/data/headlineEvents";

function SaillanceDots({ filled }: { filled: number }) {
  return (
    <span className="saillance-dots">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={i < filled ? "d" : "e"} />
      ))}
    </span>
  );
}

function Byline({ mediaPresent, mediaAbsent }: { mediaPresent: string[]; mediaAbsent: string[] }) {
  return (
    <>
      <div className="byline">
        {mediaPresent.map((name, i) => (
          <span key={name}>
            <span>{name}</span>
            {i < mediaPresent.length - 1 && <span className="sep">·</span>}
          </span>
        ))}
      </div>
      {mediaAbsent.length > 0 && (
        <div className="byline-absent">
          Absent de {mediaAbsent.join(" · ")}
        </div>
      )}
    </>
  );
}

function MainUne({ event }: { event: UneEvent }) {
  return (
    <div className="une-main">
      <span className="une-enjeu" style={{ "--c": event.issueColor } as React.CSSProperties}>
        {event.issueFr}
      </span>
      <span className={`saillance-tag ${event.saillanceCls}`}>
        {event.saillanceLabel} · {event.qcOutletCount} / 6
      </span>
      <h1 data-saillance={event.saillanceFilled}>{event.title}</h1>
      <div className="saillance-row">
        <span className="region-label">Québec</span>
        <SaillanceDots filled={event.saillanceFilled} />
        <span className="time">{event.timeMtl}h en manchette</span>
      </div>
      <Byline mediaPresent={event.mediaPresent} mediaAbsent={[]} />
    </div>
  );
}

function SideUne({ event, side }: { event: UneEvent; side: "left" | "right" }) {
  return (
    <div className={`une-side une-side-${side}`}>
      <span className="une-enjeu" style={{ "--c": event.issueColor } as React.CSSProperties}>
        {event.issueFr}
      </span>
      <span className={`saillance-tag ${event.saillanceCls}`}>
        {event.saillanceLabel} · {event.qcOutletCount} / 6
      </span>
      <h2 data-saillance={event.saillanceFilled}>{event.title}</h2>
      <div className="saillance-row">
        <span className="region-label">Québec</span>
        <SaillanceDots filled={event.saillanceFilled} />
        <span className="time">{event.timeMtl}h en manchette</span>
      </div>
      <Byline
        mediaPresent={event.mediaPresent}
        mediaAbsent={side === "right" ? event.mediaAbsent : []}
      />
    </div>
  );
}

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
      <h3 className="sol-title">Deux solitudes ?</h3>
      <div className="sol-viz">
        <div className="sol-axis" />
        <div className="sol-symbol qc">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="glyph fleur" src="/images/fleur-de-lys.png" alt="Québec" aria-label="Québec" />
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
        Les nouvelles dont la couverture diffère le plus entre les médias québécois et canadiens.
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

import React from "react";

export async function UneDesUnesSection() {
  const data = await loadHeadlineEvents();
  if (!data || data.top3.length === 0) return null;

  const [main, sideLeft, sideRight] = data.top3;

  return (
    <>
      <div className="section-label">
        <span>Les unes du jour</span>
        <span className="section-date">{data.dateLabel}</span>
      </div>

      <section className="hero-trio">
        {main && <MainUne event={main} />}
        {sideLeft && <SideUne event={sideLeft} side="left" />}
        {sideRight && <SideUne event={sideRight} side="right" />}
      </section>

      <DeuxSolitudes
        qcPos={data.solitudesQcPos}
        rocPos={data.solitudesRocPos}
        divPct={data.solitudesDivPct}
        stories={data.solitudesStories}
      />
    </>
  );
}
