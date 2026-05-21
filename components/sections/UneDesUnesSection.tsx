import fs from "node:fs/promises";
import path from "node:path";

import React from "react";
import { loadHeadlineEvents, type UneEvent, type SolitudeStory } from "@/lib/data/headlineEvents";

function headlineTimeLabel(event: UneEvent): string {
  if (event.headlineHours && event.headlineHours > 0) {
    return `${event.headlineHours} h en manchette`;
  }
  return `${event.timeMtl} h en manchette`;
}

function SaillanceDots({ filled }: { filled: number }) {
  return (
    <span className="saillance-dots">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={i < filled ? "d" : "e"} />
      ))}
    </span>
  );
}

function Byline({ mediaPresent, mediaAbsent }: {
  mediaPresent: { name: string; url: string | null }[];
  mediaAbsent: string[];
}) {
  return (
    <>
      <div className="byline">
        {mediaPresent.map(({ name, url }, i) => (
          <span key={name}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
            ) : (
              <span>{name}</span>
            )}
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

function MainUne({ event, generatedArtUrl }: { event: UneEvent; generatedArtUrl?: string }) {
  return (
    <div className="une-main">
      <div className="une-main-head">
        <span className="une-enjeu" style={{ "--c": event.issueColor } as React.CSSProperties}>
          {event.issueFr}
        </span>
        <span className={`saillance-tag ${event.saillanceCls}`}>
          {event.saillanceLabel} · {event.qcOutletCount} / {event.totalQcOutlets}
        </span>
      </div>

      <div className={`une-main-grid ${generatedArtUrl ? "has-art" : "no-art"}`}>
        <div className="une-main-copy">
          <h1 data-saillance={event.saillanceFilled}>
            {event.representativeUrl ? (
              <a href={event.representativeUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
            ) : event.title}
          </h1>
          <div className="saillance-row">
            <span className="region-label">Québec</span>
            <SaillanceDots filled={event.saillanceFilled} />
            <span className="time">{headlineTimeLabel(event)}</span>
          </div>
          <Byline mediaPresent={event.mediaPresent} mediaAbsent={event.mediaAbsent} />
        </div>

        {generatedArtUrl && (
          <figure className="hero-figure hero-figure-inline">
            <div className="figure-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedArtUrl}
                alt={event.title}
                className="editorial-img"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <figcaption>
              <span className="cap-tag">Illustration</span>
              <span className="cap-body">Image générée par intelligence artificielle, inspirée du style de l’artiste Mathieu Fortin, partenaire du projet.</span>
            </figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}

function SideUne({ event }: { event: UneEvent }) {
  return (
    <div className="une-side">
      <span className="une-enjeu" style={{ "--c": event.issueColor } as React.CSSProperties}>
        {event.issueFr}
      </span>
      <span className={`saillance-tag ${event.saillanceCls}`}>
        {event.saillanceLabel} · {event.qcOutletCount} / {event.totalQcOutlets}
      </span>
      <h2 data-saillance={event.saillanceFilled}>
        {event.representativeUrl ? (
          <a href={event.representativeUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
        ) : event.title}
      </h2>
      <div className="saillance-row">
        <span className="region-label">Québec</span>
        <SaillanceDots filled={event.saillanceFilled} />
        <span className="time">{headlineTimeLabel(event)}</span>
      </div>
      {/* QC seulement — Shannon: "Médias Qc seulement", "Conserver logique présent/absent", "Supprimer ROC, US pour les deux" */}
      <Byline mediaPresent={event.mediaPresent} mediaAbsent={event.mediaAbsent} />
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

export async function UneDesUnesSection() {
  const artJsonPath = path.resolve(
    process.cwd(), "public", "data", "generated-art", "latest.json",
  );
  const [data, artExists] = await Promise.all([
    loadHeadlineEvents(),
    fs.access(artJsonPath).then(() => true).catch(() => false),
  ]);
  if (!data || data.top3.length === 0) return null;

  const generatedArtUrl = artExists ? "data/generated-art/latest.png" : undefined;
  const [main, sideLeft, sideRight] = data.top3;

  return (
    <>
      <div className="section-label">
        <span>Les unes du jour</span>
        <span className="section-date">{data.dateLabel}</span>
      </div>

      {/* Hero principal — pleine largeur (Figma: "hero") */}
      <section className="hero-main">
        {main && <MainUne event={main} generatedArtUrl={generatedArtUrl} />}
      </section>

      {/* Secondaires — 2 colonnes côte-à-côte en dessous (Figma: "hero-secondaries") */}
      {(sideLeft || sideRight) && (
        <section className="hero-secondaries">
          {sideLeft && <SideUne event={sideLeft} />}
          {sideRight && <SideUne event={sideRight} />}
        </section>
      )}

      <DeuxSolitudes
        qcPos={data.solitudesQcPos}
        rocPos={data.solitudesRocPos}
        divPct={data.solitudesDivPct}
        stories={data.solitudesStories}
      />
    </>
  );
}
