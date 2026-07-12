import fs from "node:fs/promises";
import path from "node:path";

import React from "react";
import { loadHeadlineEvents, type UneEvent, type SolitudeStory } from "@/lib/data/headlineEvents";
import { AudioPlayer } from "@/components/interactive/AudioPlayer";
import { SaillanceTip } from "@/components/interactive/SaillanceTip";
import { InfoTip } from "@/components/interactive/InfoTip";
import { ShareButton } from "@/components/interactive/ShareButton";

// Introduit volontairement le mot « saillant » (cf. #126) : « Saillant au
// Québec depuis ce matin, 8 h ». Le moment est pré-calculé dans le loader.
function saillantLabel(event: UneEvent): string {
  return event.saillantSince
    ? `Saillant au Québec depuis ${event.saillantSince}`
    : "Saillant au Québec";
}

function MediaLinkList({ media }: { media: { name: string; url: string | null }[] }) {
  return (
    <span className="byline-media">
      {media.map(({ name, url }, i) => (
        <span key={name}>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
          ) : (
            <span>{name}</span>
          )}
          {i < media.length - 1 && <span className="sep">·</span>}
        </span>
      ))}
    </span>
  );
}

function Byline({ mediaToday, mediaAbsent }: {
  mediaToday: { name: string; url: string | null }[];
  mediaAbsent: string[];
}) {
  // Une seule ligne de présence (décision Adrien 2026-07-11) : « À la Une
  // aujourd'hui sur » = union des médias QC ayant mis l'histoire en Une sur la
  // fenêtre 24h (#213/#215/#51) — remplace l'ancien « À lire en Une sur »,
  // limité au bloc 4h courant. Les liens pointent vers le DERNIER article mis
  // en Une par chaque média, même s'il vient d'un bloc précédent (#129).
  return (
    <div className="byline-block">
      {mediaToday.length > 0 && (
        <p className="byline-line">
          <span className="byline-label">À la Une aujourd&apos;hui sur</span>{" "}
          <MediaLinkList media={mediaToday} />
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

function MainUne({ event, generatedArtUrl, audioUrl }: { event: UneEvent; generatedArtUrl?: string; audioUrl?: string }) {
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
          {/* La Une principale ne descend jamais sous le rang 3 pour garder l’impact du hero. */}
          <h1 data-saillance={Math.max(3, event.saillanceRank)}>
            {event.representativeUrl ? (
              <a href={event.representativeUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
            ) : event.title}
          </h1>
          {event.excerpt && <p className="dek">{event.excerpt}</p>}
          <div className="saillance-row">
            <span className="time">{saillantLabel(event)}</span>
          </div>
          <Byline mediaToday={event.mediaToday} mediaAbsent={event.mediaAbsent} />
        </div>

        {audioUrl && (
          <div className="hero-audio-overlay">
            <AudioPlayer src={audioUrl} compact />
            <p className="hero-audio-desc"><i>Composition originale et éphémère générée par intelligence artificielle selon un morceau de l&apos;artiste Félix Doré. L&apos;humeur musicale est modulée en fonction de la une du jour, selon les recherches sur les émotions et la musique de Zentner et al. (2008). Le tout est supervisé par la professeure Josiane Bissonette de la Faculté de musique de l&apos;Université Laval.</i></p>
          </div>
        )}

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
              <span className="cap-body">Image générée par intelligence artificielle, inspirée du style de l&apos;artiste Mathieu Fortin, partenaire du projet.</span>
            </figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}

function SideUne({ event, wide = false }: { event: UneEvent; wide?: boolean }) {
  const heading = (
    <h2 data-saillance={event.saillanceRank}>
      {event.representativeUrl ? (
        <a href={event.representativeUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
      ) : event.title}
    </h2>
  );
  const saillantRow = (
    <div className="saillance-row">
      <span className="time">{saillantLabel(event)}</span>
    </div>
  );
  // QC seulement — Shannon: "Médias Qc seulement", "Conserver logique présent/absent", "Supprimer ROC, US pour les deux"
  const byline = <Byline mediaToday={event.mediaToday} mediaAbsent={event.mediaAbsent} />;
  return (
    <div className={`une-side${wide ? " une-side-wide" : ""}`}>
      <div className="une-side-head">
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
      {wide ? (
        // Secondaire seule (2 Unes) : la carte occupe toute la largeur — le
        // titre à gauche, le lead (généré pour chaque Une mais affiché
        // seulement ici, l'espace le permet) et la byline à droite.
        <div className="une-side-wide-grid">
          <div>
            {heading}
            {saillantRow}
          </div>
          <div>
            {event.excerpt && <p className="dek">{event.excerpt}</p>}
            {byline}
          </div>
        </div>
      ) : (
        <>
          {heading}
          {saillantRow}
          {byline}
        </>
      )}
    </div>
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
  // Choix assumé : le seuil est « Exceptionnelle » = rang 6 = p95, et non p99 comme le
  // suggéraient #124/#122, pour rester cohérent avec les 6 bandes symétriques de
  // #35. Le noir se déclenche donc un peu plus souvent, c'est voulu. Cf. #35.
  const breaking = main?.saillanceRank === 6;
  const editionLabel = data.dateLabel;

  // Titre STATIQUE (décision Adrien 2026-07-09) : l'édition affichée vit dans
  // l'en-tête (#edition-name) et la fraîcheur réelle dans « Dernière mise à
  // jour du module » en bas — le titre, lui, ne doit pas trahir un retard de
  // données. Partagé avec le ShareButton pour éviter toute divergence.
  const sectionTitle = "Les Unes saillantes du moment";

  // L'anchor #une-des-unes + le data-section vivent sur le wrapper dans
  // app/page.tsx (convention PR #199) ; le module 2 « Deux solitudes » est une
  // section top-level distincte (DeuxSolitudesSection).
  // À 2 ou 1 Unes (dédup storyline / bloc creux), le module a moins de
  // contenu : l'illustration s'élargit pour garder une page pleine (#124).
  const countCls =
    data.top3.length === 2 ? " deux-unes" : data.top3.length === 1 ? " une-seule" : "";

  return (
    <div className={`unes-jour${breaking ? " breaking" : ""}${countCls}`}>
        <div className="section-label">
          <span className="section-title-wrap">
            <span className="section-title">{sectionTitle}</span>
            <SaillanceTip />
          </span>
          <span className="section-right">
            <span className="section-date">{editionLabel}</span>
            <ShareButton title={sectionTitle} anchor="une-des-unes" />
          </span>
        </div>

        {/* Disposition simple : Une #1 (la plus saillante) en grand, #2 et #3
            en secondaires côte-à-côte. Ordre = ordre de saillance. */}
        <section className="hero-main">
          {main && <MainUne event={main} generatedArtUrl={generatedArtUrl} audioUrl={audioUrl} />}
        </section>

        {/* Mise en page 1 à 3 Unes (#124 obj. 2, phase C) : le module vise
            toujours 3 Unes, mais quand les données n'en offrent que 2 (dédup
            storyline #231, bloc creux), la secondaire restante prend toute la
            largeur (.solo) ; à 1 seule Une, pas de rangée secondaire du tout. */}
        {(sideLeft || sideRight) && (
          <section className={`hero-secondaries${sideLeft && sideRight ? "" : " solo"}`}>
            {sideLeft && <SideUne event={sideLeft} wide={!sideRight} />}
            {sideRight && <SideUne event={sideRight} />}
          </section>
        )}
        <div className="module-last-updated">{data.lastUpdated}</div>
    </div>
  );
}
