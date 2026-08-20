import fs from "node:fs/promises";
import path from "node:path";

import React from "react";
import { loadHeadlineEvents, listEditions, type UneEvent } from "@/lib/data/headlineEvents";
import { editionHrefs } from "@/lib/editionLinks";
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
function SaillanceHead({ event, className, hrefs }: {
  event: UneEvent;
  className: string;
  hrefs?: Record<string, string>;
}) {
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
          <SaillanceInfoCard rank={event.saillanceRank} level={event.saillanceLabel} centile={event.saillanceCentile}
            peak={event.scoreQcSum24h} sommet={event.sommetSum} sommetLabel={event.sommetLabel}
            sommetCentile={event.sommetCentile} sommetTier={event.sommetTier}
            thresholds={event.salThresholds}
            qcOutlets={event.qcOutletCount} totalQcOutlets={event.totalQcOutlets}
            since={event.saillantSince} />
        </InfoTip>
        {event.salienceTrend && <SaillanceTrend trend={event.salienceTrend} editionHrefs={hrefs} />}
      </span>
    </div>
  );
}

// Résonance cross-région (#230) : « le même sujet est aussi en Une ailleurs ».
// Deux libellés SÉPARÉS — canadienne / américaine — et jamais un « Résonance
// internationale » unique : c'est précisément la distinction QC/CAN ↔ US qui
// était demandée, et la fondre reviendrait à qualifier d'internationale une
// fusillade à Toronto. Une Une peut porter les deux tags.
//
// Posée SOUS la byline (« À la Une aujourd'hui sur … »), pas dans l'en-tête :
// c'est la même question que la byline — qui a mis ce sujet en Une — posée
// ailleurs, et les deux se lisent d'affilée. L'en-tête, lui, reste la suite
// arbitrée rubrique → badge → trajectoire (#286). Rien n'est rendu sans
// résonance : l'absence de tag dit déjà « sujet d'ici seulement ».
//
// Chaque tag porte SON ⓘ : la bulle est propre à une région (part d'attention
// + médias de cette région-là), une bulle commune mélangerait deux mesures.
function ResonanceRow({ event }: { event: UneEvent }) {
  const { resonanceCan: can, resonanceUs: us } = event;
  if (!can && !us) return null;
  return (
    <p className="resonance-row">
      {can && <ResonanceTag label="Résonance canadienne" region="canadiennes-anglaises" echo={can} />}
      {us && <ResonanceTag label="Résonance américaine" region="américaines" echo={us} />}
    </p>
  );
}

function ResonanceTag({ label, region, echo }: {
  label: string;
  /** Accord au féminin pluriel : « … des Unes canadiennes-anglaises ». */
  region: string;
  echo: NonNullable<UneEvent["resonanceCan"]>;
}) {
  return (
    <span className="resonance-item">
      <span className="resonance-tag">{label}</span>
      <InfoTip size="sm" label={`${label} : détail de la couverture`}>
        <span className="resonance-card">
          {/* La fenêtre était TUE (demande d'Adrien, 2026-08-09) : « 61 % de
              l'attention des Unes canadiennes-anglaises » se lisait comme un
              état permanent, alors que la part est calculée sur la fenêtre
              glissante de 24 h pondérée par la récence — la même que le
              classement, le badge et les axes du radar (`sumRoc / totalRoc`,
              issus de storiesFrom24h). Un pourcentage sans période n'est pas
              interprétable. */}
          <span className="resonance-card-share">
            {echo.share}&nbsp;% de l&apos;attention des Unes {region} sur les 24 dernières heures
          </span>
          {echo.media.length > 0 && (
            <span className="resonance-card-media">
              <MediaLinkList media={echo.media} />
            </span>
          )}
        </span>
      </InfoTip>
    </span>
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

function Byline({ event }: { event: UneEvent }) {
  // Une seule ligne de présence : « À la Une aujourd'hui sur » = union des
  // médias QC ayant mis l'histoire en Une sur la fenêtre 24h (#213/#215/#51).
  // Les liens pointent vers le DERNIER article mis en Une par chaque média,
  // même s'il vient d'un bloc précédent (#129). (« Absent de la Une sur »
  // retiré 2026-07-20 — décision Adrien, peu utile.)
  //
  // La résonance (#230) vient juste dessous : même question — qui a mis ce
  // sujet en Une — posée ailleurs qu'ici. Le bloc s'affiche donc dès que l'une
  // OU l'autre existe : une Une sans média QC connu mais reprise au Canada
  // anglais garde sa ligne de résonance.
  const { mediaToday, resonanceCan, resonanceUs } = event;
  if (mediaToday.length === 0 && !resonanceCan && !resonanceUs) return null;
  return (
    <div className="byline-block">
      {mediaToday.length > 0 && (
        <p className="byline-line">
          <span className="byline-label">À la Une aujourd&apos;hui sur</span>{" "}
          <MediaLinkList media={mediaToday} />
        </p>
      )}
      <ResonanceRow event={event} />
    </div>
  );
}

/** L'illustration est rendue DEUX fois (variante desktop en colonne 2 de la
 *  grille, variante mobile dans la colonne texte juste sous le titre) et la
 *  bascule se fait en CSS. Sur mobile, la grille passe en 1 colonne et suit
 *  l'ordre DOM : la figure en fin de grille arrivait à ~2 écrans de défilement
 *  (#310) — la variante mobile la ramène sous le h1, fidèle à l'intention
 *  « titre → image → métadonnées ». Même URL des deux côtés = un seul
 *  téléchargement ; la variante cachée l'est via display:none. */
type ArtSource = { src: string; type: string };

// Formats modernes de l'illustration, du plus léger au plus lourd — l'ordre est
// celui que <picture> évalue, premier format supporté gagnant.
const ART_FORMATS: { file: string; type: string }[] = [
  { file: "latest.avif", type: "image/avif" },
  { file: "latest.webp", type: "image/webp" },
];

/** Ne retient que les formats RÉELLEMENT présents sur disque au build.
 *
 *  Le rapatriement (scripts/fetch_art.mjs) est best-effort et l'encodeur AVIF
 *  du raffineur est optionnel : n'importe lequel de ces fichiers peut manquer
 *  sans que ce soit une anomalie. Déclarer un <source> vers un fichier absent
 *  afficherait une image cassée au lieu de retomber sur le PNG. */
/** Métadonnées de l'illustration (latest.json), rapatriées par
 *  scripts/fetch_art.mjs. `storyline_id`/`event_id` alimentent la garde
 *  d'appariement ci-dessous ; un fichier absent ou illisible vaut « pas
 *  d'illustration », jamais une erreur — la génération est best-effort. */
type ArtMeta = { storyline_id?: string | null; event_id?: string | null };

async function readArtMeta(jsonPath: string): Promise<ArtMeta | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(jsonPath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ArtMeta;
    return null;
  } catch {
    return null;
  }
}

async function detectArtSources(): Promise<ArtSource[]> {
  const found = await Promise.all(ART_FORMATS.map((f) =>
    fs.access(path.resolve(process.cwd(), "public", "data", "generated-art", f.file))
      .then((): ArtSource => ({ src: `data/generated-art/${f.file}`, type: f.type }))
      .catch(() => null),
  ));
  return found.filter((s): s is ArtSource => s !== null);
}

function HeroFigure({ src, sources = [], alt, variant }: {
  src: string;
  /** Formats modernes réellement présents, du plus léger au plus lourd. */
  sources?: ArtSource[];
  alt: string;
  variant: "desktop" | "mobile";
}) {
  return (
    <figure className={`hero-figure hero-figure-inline hero-figure-${variant}`}>
      <div className="figure-frame">
        {/* Le PNG de gpt-image-1 pèse ~1,5 Mo ; l'AVIF/WebP tombe sous 200 Ko.
            `sources` ne liste que les fichiers présents au build : si le
            rapatriement échoue (fetch_art.mjs est best-effort), la liste est
            vide et <picture> se réduit au <img> PNG — jamais d'image cassée. */}
        <picture>
          {sources.map((s) => (
            <source key={s.type} srcSet={s.src} type={s.type} />
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="editorial-img"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </picture>
      </div>
      <figcaption>
        <span className="cap-tag">Illustration</span>
        <span className="cap-body">Image générée par intelligence artificielle. Direction artistique de Mathieu Fortin (Anorak Studio).</span>
      </figcaption>
    </figure>
  );
}

function MainUne({ event, secondEvent, generatedArtUrl, generatedArtSources, audioUrl, hrefs }: {
  event: UneEvent;
  hrefs?: Record<string, string>;
  /** À 2 Unes (décision Adrien 2026-07-12) : la 2e nouvelle s'empile SOUS la
   *  première dans la colonne de gauche — sans lead — et l'illustration garde
   *  toute la hauteur des deux à droite. (L'essai « carte large » pleine
   *  largeur sous le hero laissait un vide, rejeté.) */
  secondEvent?: UneEvent;
  generatedArtUrl?: string;
  generatedArtSources?: ArtSource[];
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
          <SaillanceHead event={event} className="une-main-head" hrefs={hrefs} />
          {/* La Une principale ne descend jamais sous le rang 3 pour garder l’impact du hero. */}
          <h1 data-saillance={Math.max(3, event.saillanceRank)}>
            <HeadlineTitle event={event}>{event.title}</HeadlineTitle>
          </h1>
          {/* alt="" : le titre est adjacent (h1 juste au-dessus) — un alt
              identique ferait lire le titre deux fois aux lecteurs d'écran. */}
          {generatedArtUrl && (
            <HeroFigure src={generatedArtUrl} sources={generatedArtSources} alt="" variant="mobile" />
          )}
          {event.excerpt && <p className="dek">{event.excerpt}</p>}
          <Byline event={event} />
          {secondEvent && (
            <div className="une-side une-second">
              <SaillanceHead event={secondEvent} className="une-side-head" hrefs={hrefs} />
              <h2 data-saillance={secondEvent.saillanceRank}>
                <HeadlineTitle event={secondEvent}>{secondEvent.title}</HeadlineTitle>
              </h2>
              <Byline event={secondEvent} />
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
          <HeroFigure src={generatedArtUrl} sources={generatedArtSources} alt={event.title} variant="desktop" />
        )}
      </div>
    </div>
  );
}

function SideUne({ event, hrefs }: { event: UneEvent; hrefs?: Record<string, string> }) {
  return (
    <div className="une-side">
      <SaillanceHead event={event} className="une-side-head" hrefs={hrefs} />
      <h2 data-saillance={event.saillanceRank}>
        <HeadlineTitle event={event}>{event.title}</HeadlineTitle>
      </h2>
      {/* QC seulement — Shannon: "Médias Qc seulement" */}
      <Byline event={event} />
    </div>
  );
}

export async function UneDesUnesSection({ editionKey }: { editionKey?: string } = {}) {
  // ÉDITIONS PASSÉES (#434). L'illustration et la musique ne sont PAS
  // archivées : `generated-art/latest.png` et `audio/latest.mp3` sont écrasés à
  // chaque rafraîchissement, et ne décrivent donc que l'édition courante. Les
  // servir sur une édition passée collerait l'image d'aujourd'hui sur les Unes
  // d'avant-hier — une illustration qui affirme un faux. Une édition passée
  // s'affiche donc sans image ni musique, et la mise en page « no-art » du
  // module (déjà prévue pour les blocs sans illustration) s'en charge.
  const isArchive = Boolean(editionKey);
  const artJsonPath = path.resolve(
    process.cwd(), "public", "data", "generated-art", "latest.json",
  );
  const [data, editions, artMeta, artSources, audioUrl] = await Promise.all([
    loadHeadlineEvents(editionKey),
    listEditions(),
    isArchive ? null : readArtMeta(artJsonPath),
    isArchive ? Promise.resolve<ArtSource[]>([]) : detectArtSources(),
    isArchive ? undefined : fs.access(path.resolve(process.cwd(), "public", "audio", "latest.mp3"))
      .then(() => "audio/latest.mp3")
      .catch(() => fs.access(path.resolve(process.cwd(), "public", "audio", "latest.wav"))
        .then(() => "audio/latest.wav")
        .catch(() => undefined)),
  ]);
  if (!data || data.top3.length === 0) return null;

  // Chaque point de trajectoire EST une édition : on lui donne son adresse.
  const hrefs = editionHrefs(editions);
  const [main, sideLeft, sideRight] = data.top3;

  // GARDE D'APPARIEMENT. L'illustration n'est plus générée dans le même job
  // que les données (raffineur vitrine-art, cycle séparé) : rien ne garantit
  // mécaniquement qu'elle dépeint la Une de CE build. On ne l'affiche que si
  // sa clé d'histoire correspond — sinon mise en page « sans illustration »,
  // déjà prévue. Une image absente est un manque ; une image d'une autre Une
  // est un mensonge. Clé = storyline d'abord : l'event_id change à chaque bloc
  // de 4 h alors que l'illustration suit l'HISTOIRE (cf. workers/api/src/art.ts).
  const mainKey = main.storylineId ?? main.eventId;
  const artKey = artMeta?.storyline_id ?? artMeta?.event_id ?? null;
  const artMatches = Boolean(artKey && mainKey && artKey === mainKey);
  const generatedArtUrl = artMatches ? "data/generated-art/latest.png" : undefined;
  const generatedArtSources = artMatches ? artSources : [];

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
  // « au Québec » (demande d'Adrien, A9) : le module ne disait pas de quelle
  // population il parlait, alors que son voisin « Deux solitudes » compare deux
  // régions et que les niveaux affichés se situent parmi les Unes QUÉBÉCOISES.
  // Le titre porte donc la même règle que les phrases de distribution.
  // « L'actualité saillante » plutôt que « Les Unes saillantes » (Adrien,
  // 2026-08-10, closes #307) : au pluriel, le titre PROMETTAIT des Unes, donc
  // plusieurs. Les jours où le module n'en affiche qu'une, Yannick lisait un
  // bug (« on dirait qu'il manque quelque chose ») alors que c'est le résultat
  // normal d'une journée dominée par une seule histoire. Le singulier ne promet
  // plus de compte, et l'infobulle ⓘ à côté du titre (SaillanceTip) dit
  // explicitement pourquoi il varie.
  // « du moment » est vrai de l'édition courante et faux de toutes les autres :
  // sur une archive, le titre est le seul élément qui daterait le contenu à tort
  // (la pastille de date, elle, porte déjà le bon jour). On retire donc les deux
  // mots plutôt que d'affirmer un présent qui n'est plus (#434) — le reste du
  // libellé approuvé en #307 est intact.
  const sectionTitle = isArchive
    ? "L'actualité saillante au Québec"
    : "L'actualité saillante du moment au Québec";

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
              generatedArtSources={generatedArtSources}
              audioUrl={audioUrl}
              hrefs={hrefs}
            />
          )}
        </section>

        {sideLeft && sideRight && (
          <section className="hero-secondaries">
            <SideUne event={sideLeft} hrefs={hrefs} />
            <SideUne event={sideRight} hrefs={hrefs} />
          </section>
        )}
        <div className="module-last-updated">{data.lastUpdated}</div>
    </div>
  );
}
