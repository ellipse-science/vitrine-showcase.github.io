import fs from "node:fs/promises";
import path from "node:path";

import React from "react";
import { loadHeadlineEvents, type UneEvent, type SolitudeStory } from "@/lib/data/headlineEvents";
import { AudioPlayer } from "@/components/interactive/AudioPlayer";
import { SaillanceTip } from "@/components/interactive/SaillanceTip";
import { InfoTip } from "@/components/interactive/InfoTip";

// Introduit volontairement le mot « saillant » (cf. #126) : « Saillant au
// Québec depuis ce matin, 8 h ». Le moment est pré-calculé dans le loader.
function saillantLabel(event: UneEvent): string {
  return event.saillantSince
    ? `Saillant au Québec depuis ${event.saillantSince}`
    : "Saillant au Québec";
}

function Byline({ mediaPresent, mediaAbsent }: {
  mediaPresent: { name: string; url: string | null }[];
  mediaAbsent: string[];
}) {
  return (
    <div className="byline-block">
      {mediaPresent.length > 0 && (
        <p className="byline-line">
          <span className="byline-label">À lire en Une sur</span>{" "}
          <span className="byline-media">
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
          </span>
        </p>
      )}
      {mediaAbsent.length > 0 && (
        <p className="byline-line">
          <span className="byline-label">Absent de la Une sur</span>{" "}
          <span className="byline-absent-media">{mediaAbsent.join(" · ")}</span>
        </p>
      )}
    </div>
  );
}

function MainUne({ event, generatedArtUrl }: { event: UneEvent; generatedArtUrl?: string }) {
  return (
    <div className="une-main">
      <div className="une-main-head">
        <span className="une-enjeu" style={{ "--c": event.issueColor } as React.CSSProperties}>
          {event.issueFr}
        </span>
        <span className="saillance-tag-row">
          <span className={`saillance-tag ${event.saillanceCls}`}>
            Saillance {event.saillanceLabel}
          </span>
          <InfoTip size="sm" label="Détail du niveau de saillance">{event.saillanceHint}</InfoTip>
        </span>
      </div>

      <div className={`une-main-grid ${generatedArtUrl ? "has-art" : "no-art"}`}>
        <div className="une-main-copy">
          {/* La Une principale ne descend jamais sous le rang 3 pour garder l'impact du hero. */}
          <h1 data-saillance={Math.max(3, event.saillanceRank)}>
            {event.representativeUrl ? (
              <a href={event.representativeUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
            ) : event.title}
          </h1>
          {event.excerpt && <p className="dek">{event.excerpt}</p>}
          <div className="saillance-row">
            <span className="time">{saillantLabel(event)}</span>
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
      <span className="saillance-tag-row">
        <span className={`saillance-tag ${event.saillanceCls}`}>
          Saillance {event.saillanceLabel}
        </span>
        <InfoTip size="sm" label="Détail du niveau de saillance">{event.saillanceHint}</InfoTip>
      </span>
      <h2 data-saillance={event.saillanceRank}>
        {event.representativeUrl ? (
          <a href={event.representativeUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
        ) : event.title}
      </h2>
      <div className="saillance-row">
        <span className="time">{saillantLabel(event)}</span>
      </div>
      {/* QC seulement — Shannon: "Médias Qc seulement", "Conserver logique présent/absent", "Supprimer ROC, US pour les deux" */}
      <Byline mediaPresent={event.mediaPresent} mediaAbsent={event.mediaAbsent} />
    </div>
  );
}

function DeuxSolitudes({
  qcPos,
  rocPos,
  mode,
  convPct,
  divPct,
  intervalLabel,
  focusRegion,
  stories,
}: {
  qcPos: number;
  rocPos: number;
  mode: "convergence" | "mixed" | "divergence";
  convPct: number;
  divPct: number;
  intervalLabel: string;
  focusRegion: "qc" | "can";
  stories: SolitudeStory[];
}) {
  const modeWord = mode === "convergence" ? "Convergence" : mode === "mixed" ? "Mixte" : "Divergence";
  const modePct = mode === "divergence" ? divPct : convPct;
  const subline = mode === "convergence"
    ? "Les médias québécois et canadiens priorisent largement les mêmes sujets."
    : mode === "mixed"
      ? "On observe un socle commun, mais aussi des angles distincts entre les deux espaces médiatiques."
      : "Les priorités éditoriales divergent nettement entre les médias québécois et canadiens.";

  const sharedStories = stories
    .filter((s) => !s.qcZero && !s.caZero)
    .slice()
    .sort((a, b) => (b.convergencePct - a.convergencePct) || ((b.qcWidth + b.caWidth) - (a.qcWidth + a.caWidth)));

  const polarizedStories = stories
    .slice()
    .sort((a, b) => (b.divergencePct - a.divergencePct) || ((b.qcWidth + b.caWidth) - (a.qcWidth + a.caWidth)));

  const divergenceFocusStories = mode === "divergence"
    ? stories
      .filter((s) => s.dominantSide === focusRegion)
      .concat(stories.filter((s) => s.dominantSide !== focusRegion))
      .slice(0, 3)
    : [];

  const consensusStories = sharedStories.slice(0, 3);

  const mixedCommonStories = sharedStories.slice(0, 2);
  const mixedCommonSet = new Set(mixedCommonStories.map((s) => s.label));
  const mixedQcAngle = polarizedStories.find((s) => s.dominantSide === "qc" && !mixedCommonSet.has(s.label));
  const mixedCanAngle = polarizedStories.find((s) => s.dominantSide === "can" && !mixedCommonSet.has(s.label));

  const linksFor = (s: SolitudeStory, side: "qc" | "can") => {
    const links = side === "qc" ? s.qcLinks : s.caLinks;
    if (links.length > 0) return links;
    if (s.representativeUrl) return [{ name: "Lire l'article", url: s.representativeUrl }];
    return [];
  };

  return (
    <section
      className="solitudes"
      data-section="Deux solitudes"
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
        <span className={`sol-mode-word mode-${mode}`}>{modeWord}</span>
        <span className="sol-mode-detail">
          à <strong>{modePct} %</strong> {intervalLabel}
          <InfoTip size="sm" label="Définition de la convergence/différence">
            À quel point les médias québécois et canadiens parlent des mêmes nouvelles dans ce bloc de 4 heures. 100 % = priorités identiques; 0 % = aucune nouvelle en commun.
          </InfoTip>
        </span>
      </div>
      <p className="sol-explain">
        {subline}
      </p>

      {mode === "divergence" && divergenceFocusStories.length > 0 && (
        <div className="sol-focus mode-divergence">
          <p className="sol-focus-title">
            {focusRegion === "can" ? "Les médias canadiens parlent plutôt de :" : "Les médias québécois parlent plutôt de :"}
          </p>
          <ol className="sol-focus-list">
            {divergenceFocusStories.map((s, idx) => {
              const links = linksFor(s, focusRegion);
              return (
                <li key={`${idx}-${s.label}`}>
                  <span className="focus-label">{s.label}</span>
                  <span className="focus-links">
                    {links.map((l) => (
                      <a key={`${s.label}-${l.name}-${l.url}`} href={l.url} target="_blank" rel="noopener noreferrer" title={`Lire sur ${l.name}`}>{l.name}</a>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {mode === "convergence" && consensusStories.length > 0 && (
        <div className="sol-focus mode-convergence">
          <p className="sol-focus-title">Les médias convergent surtout sur :</p>
          <ol className="sol-focus-list">
            {consensusStories.map((s, idx) => (
              <li key={`${idx}-${s.label}`}>
                <span className="focus-label">{s.label}</span>
                <div className="focus-links two-sides">
                  <span className="focus-side">Québec</span>
                  {linksFor(s, "qc").slice(0, 2).map((l) => (
                    <a key={`${s.label}-qc-${l.name}-${l.url}`} href={l.url} target="_blank" rel="noopener noreferrer" title={`Lire sur ${l.name}`}>{l.name}</a>
                  ))}
                  <span className="focus-side">Canada</span>
                  {linksFor(s, "can").slice(0, 2).map((l) => (
                    <a key={`${s.label}-can-${l.name}-${l.url}`} href={l.url} target="_blank" rel="noopener noreferrer" title={`Lire sur ${l.name}`}>{l.name}</a>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {mode === "mixed" && (
        <div className="sol-focus mode-mixed">
          <p className="sol-focus-title">Convergence partielle : socle commun et angles distincts</p>
          {mixedCommonStories.length > 0 && (
            <>
              <p className="sol-focus-kicker">Socle commun</p>
              <ol className="sol-focus-list compact">
                {mixedCommonStories.map((s, idx) => (
                  <li key={`mix-common-${idx}-${s.label}`}>
                    <span className="focus-label">{s.label}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {(mixedQcAngle || mixedCanAngle) && (
            <div className="sol-focus-duo">
              {mixedQcAngle && (
                <div className="sol-focus-duo-item">
                  <p className="sol-focus-kicker">Plutôt au Québec</p>
                  <p className="focus-label">{mixedQcAngle.label}</p>
                  <div className="focus-links">
                    {linksFor(mixedQcAngle, "qc").slice(0, 3).map((l) => (
                      <a key={`mix-qc-${mixedQcAngle.label}-${l.name}-${l.url}`} href={l.url} target="_blank" rel="noopener noreferrer" title={`Lire sur ${l.name}`}>{l.name}</a>
                    ))}
                  </div>
                </div>
              )}

              {mixedCanAngle && (
                <div className="sol-focus-duo-item">
                  <p className="sol-focus-kicker">Plutôt au Canada</p>
                  <p className="focus-label">{mixedCanAngle.label}</p>
                  <div className="focus-links">
                    {linksFor(mixedCanAngle, "can").slice(0, 3).map((l) => (
                      <a key={`mix-can-${mixedCanAngle.label}-${l.name}-${l.url}`} href={l.url} target="_blank" rel="noopener noreferrer" title={`Lire sur ${l.name}`}>{l.name}</a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export async function UneDesUnesSection() {
  const artJsonPath = path.resolve(
    process.cwd(), "public", "data", "generated-art", "latest.json",
  );
  const [data, artExists, audioUrl] = await Promise.all([
    loadHeadlineEvents(),
    fs.access(artJsonPath).then(() => true).catch(() => false),
    fs.access(path.resolve(process.cwd(), "public", "audio", "latest.mp3"))
      .then(() => "audio/latest.mp3")
      .catch(() => fs.access(path.resolve(process.cwd(), "public", "audio", "latest.wav"))
        .then(() => "audio/latest.wav")
        .catch(() => undefined)),
  ]);
  if (!data || data.top3.length === 0) return null;

  const generatedArtUrl = artExists ? "data/generated-art/latest.png" : undefined;
  const [main, sideLeft, sideRight] = data.top3;

  // Traitement « breaking » inversé (noir) quand la Une #1 atteint le niveau
  // critique de saillance, façon vrais sites de médias (demande Shannon, Figma).
  // Choix assumé : le seuil est « Extrême » = rang 6 = p95, et non p99 comme le
  // suggéraient #124/#122, pour rester cohérent avec les 6 bandes symétriques de
  // #35. Le noir se déclenche donc un peu plus souvent, c'est voulu. Cf. #35.
  const breaking = main?.saillanceRank === 6;
  // « Édition du mercredi 3 juin 2026 » : la date du snapshot (sans l'heure).
  const editionLabel = `Édition du ${data.dateLabel.toLowerCase()}`;

  return (
    <>
      <div className={`unes-jour${breaking ? " breaking" : ""}`} data-section="Une des unes">
        <div className="section-label">
          <span className="section-title-wrap">
            <span className="section-title">Les Unes {data.periodLabel}</span>
            <SaillanceTip />
          </span>
          {audioUrl && <AudioPlayer src={audioUrl} compact />}
          <span className="section-date">{editionLabel}</span>
        </div>

        {/* Disposition simple : Une #1 (la plus saillante) en grand, #2 et #3
            en secondaires côte-à-côte. Ordre = ordre de saillance. */}
        <section className="hero-main">
          {main && <MainUne event={main} generatedArtUrl={generatedArtUrl} />}
        </section>

        {(sideLeft || sideRight) && (
          <section className="hero-secondaries">
            {sideLeft && <SideUne event={sideLeft} />}
            {sideRight && <SideUne event={sideRight} />}
          </section>
        )}
      </div>

      <DeuxSolitudes
        qcPos={data.solitudesQcPos}
        rocPos={data.solitudesRocPos}
        mode={data.solitudesMode}
        convPct={data.solitudesConvPct}
        divPct={data.solitudesDivPct}
        intervalLabel={data.solitudesIntervalLabel}
        focusRegion={data.solitudesFocusRegion}
        stories={data.solitudesStories}
      />
    </>
  );
}
