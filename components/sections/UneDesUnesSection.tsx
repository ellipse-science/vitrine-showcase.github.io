import fs from "node:fs/promises";
import path from "node:path";

import React from "react";
import { loadHeadlineEvents, type UneEvent } from "@/lib/data/headlineEvents";
import { AudioPlayer } from "@/components/interactive/AudioPlayer";
import { SaillanceTip } from "@/components/interactive/SaillanceTip";
import { InfoTip } from "@/components/interactive/InfoTip";
import { SaillanceTrend } from "@/components/interactive/SaillanceTrend";
import { SaillanceInfoCard } from "@/components/interactive/SaillanceInfoCard";
import { ShareButton } from "@/components/interactive/ShareButton";
import { HeadlineLink } from "@/components/interactive/HeadlineLink";

// Titre cliquable d'une Une : ouvre un article au hasard parmi les médias QC
// qui la couvrent (chance égale). Repli sur l'article représentatif si besoin.
// Rendu en texte simple si aucun lien connu.
function HeadlineTitle({ event, children }: { event: UneEvent; children: React.ReactNode }) {
  const urls = event.mediaToday.map((m) => m.url).filter((u): u is string => !!u);
  const fallback = event.representativeUrl ?? urls[0];
  return fallback
    ? <HeadlineLink urls={urls} fallback={fallback}>{children}</HeadlineLink>
    : <>{children}</>;
}

// En-tête d'une Une : rubrique (enjeu) → badge de saillance (au pic 24 h) + ⓘ →
// trajectoire (#274). Le badge tombe toujours sous l'enjeu (CSS flex-basis 100 %),
// et la trajectoire prend sa propre ligne dessous. Factorisé : hero et secondaires
// partagent exactement la même structure (seule la classe du conteneur change).
function SaillanceHead({ event, className }: { event: UneEvent; className: string }) {
  return (
    <div className={className}>
      <span className="une-enjeu" style={{ "--c": event.issueColor } as React.CSSProperties}>
        {event.issueFr}
      </span>
      {/* UN SEUL badge : la saillance cumulée sur 24 h pondérée par récence — la
          grandeur qui décide déjà de l'ordre des cartes. Elle existe toujours
          (contrairement au bloc courant, absent 38 % du temps) et elle décroît
          d'elle-même (contrairement au sommet, figé). Le sommet, lui, est nommé
          dans la phrase de trajectoire juste dessous. */}
      {/* UNE SEULE bande de saillance, en deux temps :
            ligne 1 — le COUP D'ŒIL : pastille de niveau, ⓘ, courbe
            ligne 2 — la LECTURE  : flèche + phrase
          Une seule ligne pour tout serait plus compact, mais la phrase varie de
          35 à 60 caractères selon la situation : elle déborderait une fois sur
          deux et la bande sauterait d'une hauteur à l'autre d'une édition à
          l'autre. Deux lignes stables valent mieux qu'une ligne intermittente.
          La courbe reste AVANT la phrase : elle est ancrée et ne bouge pas
          quand le libellé s'allonge au survol (décision #286). */}
      <span className="saillance-tag-row">
        <span className={`saillance-tag ${event.saillanceCls}`}>
          Saillance {event.saillanceLabel}
        </span>
        <InfoTip size="sm" label="Détail du niveau de saillance">
          <SaillanceInfoCard rank={event.saillanceRank} level={event.saillanceLabel}
            peak={event.scoreQcSum24h} sommet={event.sommetSum} sommetLabel={event.sommetLabel}
            thresholds={event.salThresholds}
            qcOutlets={event.qcOutletCount} totalQcOutlets={event.totalQcOutlets}
            since={event.saillantSince} />
        </InfoTip>
        {event.salienceTrend && <SaillanceTrend trend={event.salienceTrend} />}
      </span>
    </div>
  );
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

function Byline({ mediaToday }: {
  mediaToday: { name: string; url: string | null }[];
}) {
  // Une seule ligne de présence : « À la Une aujourd'hui sur » = union des
  // médias QC ayant mis l'histoire en Une sur la fenêtre 24h (#213/#215/#51).
  // Les liens pointent vers le DERNIER article mis en Une par chaque média,
  // même s'il vient d'un bloc précédent (#129). (« Absent de la Une sur »
  // retiré 2026-07-20 — décision Adrien, peu utile.)
  if (mediaToday.length === 0) return null;
  return (
    <div className="byline-block">
      <p className="byline-line">
        <span className="byline-label">À la Une aujourd&apos;hui sur</span>{" "}
        <MediaLinkList media={mediaToday} />
      </p>
    </div>
  );
}

function MainUne({ event, secondEvent, generatedArtUrl, audioUrl }: {
  event: UneEvent;
  /** À 2 Unes (décision Adrien 2026-07-12) : la 2e nouvelle s'empile SOUS la
   *  première dans la colonne de gauche — sans lead — et l'illustration garde
   *  toute la hauteur des deux à droite. (L'essai « carte large » pleine
   *  largeur sous le hero laissait un vide, rejeté.) */
  secondEvent?: UneEvent;
  generatedArtUrl?: string;
  audioUrl?: string;
}) {
  return (
    <div className="une-main">
      <div className={`une-main-grid ${generatedArtUrl ? "has-art" : "no-art"}`}>
        <div className="une-main-copy">
          {/* L'en-tête (enjeu + tag) vit DANS la colonne de gauche : hors de la
              grille, il s'étendait sous le bloc Ambiance (remonté en marge
              négative) et le tag « Exceptionnelle » agrandi finissait par le
              chevaucher quand l'enjeu était long. Ici, le chevauchement est
              impossible par construction. */}
          <SaillanceHead event={event} className="une-main-head" />
          {/* La Une principale ne descend jamais sous le rang 3 pour garder l’impact du hero. */}
          <h1 data-saillance={Math.max(3, event.saillanceRank)}>
            <HeadlineTitle event={event}>{event.title}</HeadlineTitle>
          </h1>
          {event.excerpt && <p className="dek">{event.excerpt}</p>}
          <Byline mediaToday={event.mediaToday} />
          {secondEvent && (
            <div className="une-side une-second">
              <SaillanceHead event={secondEvent} className="une-side-head" />
              <h2 data-saillance={secondEvent.saillanceRank}>
                <HeadlineTitle event={secondEvent}>{secondEvent.title}</HeadlineTitle>
              </h2>
              <Byline mediaToday={secondEvent.mediaToday} />
            </div>
          )}
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

function SideUne({ event }: { event: UneEvent }) {
  return (
    <div className="une-side">
      <SaillanceHead event={event} className="une-side-head" />
      <h2 data-saillance={event.saillanceRank}>
        <HeadlineTitle event={event}>{event.title}</HeadlineTitle>
      </h2>
      {/* QC seulement — Shannon: "Médias Qc seulement" */}
      <Byline mediaToday={event.mediaToday} />
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
        {/* Mise en page 1 à 3 Unes (#124 obj. 2, phase C) : le module vise
            toujours 3 Unes. À 3 : hero + 2 secondaires côte-à-côte. À 2 : la
            2e s'empile sous la 1re dans la colonne de gauche du hero,
            l'illustration prend toute la hauteur à droite (pas de rangée
            secondaire). À 1 : le hero seul. */}
        <section className="hero-main">
          {main && (
            <MainUne
              event={main}
              secondEvent={sideLeft && !sideRight ? sideLeft : undefined}
              generatedArtUrl={generatedArtUrl}
              audioUrl={audioUrl}
            />
          )}
        </section>

        {sideLeft && sideRight && (
          <section className="hero-secondaries">
            <SideUne event={sideLeft} />
            <SideUne event={sideRight} />
          </section>
        )}
        <div className="module-last-updated">{data.lastUpdated}</div>
    </div>
  );
}
