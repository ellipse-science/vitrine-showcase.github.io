"use client";

import { useEffect, useMemo, useState } from "react";
import type { AffiliationSegment, AssembleeRow, DeputyRow } from "@/lib/data/assemblee";
import type { PartyKey } from "@/lib/data/parties";

// Le site est publié sous un basePath sur GitHub Pages (même logique que
// app/layout.tsx, SaillanceTip.tsx, TreemapClient.tsx…) : un chemin
// racine codé en dur ("/images/…") n'est PAS réécrit automatiquement par
// l'export statique de Next, contrairement à un <Image> ou un import. Sans
// ce préfixe, le portrait pointe vers <domaine>/images/… au lieu de
// <domaine>/vitrine-showcase.github.io/images/… et 404 en production tout
// en fonctionnant en local (où le basePath est vide).
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Vestiaire : un banc de casiers, un par parti actif.
//
// Disposition — le banc est FIXE. Les casiers gardent la même largeur et la
// même place quoi qu'il arrive ; ouvrir un casier fait pivoter ses battants et
// déroule un tiroir sous le banc, relié au casier ouvert par une encoche. Le
// premier jet faisait grandir le casier ouvert jusqu'à toute la largeur de la
// grille, ce qui réorganisait la rangée à chaque clic : les autres casiers
// sautaient, et on ne savait plus lequel on venait d'ouvrir.
//
// La carte reprend la grammaire des cartes de collection : macaron de parti en
// guise d'écusson, enjeu dominant en guise de position. Le portrait est un
// duotone redressé (scripts/build_deputy_cards.py).

// Garde-fou d'affichage, VOLONTAIREMENT MINIMAL. Le nettoyage réel vit dans
// le raffineur (aws-refiners, `refiners/agora-decideurs-qc/runtime.R`), qui
// depuis le 2026-07-29 nettoie le corpus AVANT le calcul TF-IDF :
// `strip_speaker_tag()` retire les étiquettes « M. Tanguay : » (la cause du
// mot distinctif « tanguay » chez Marc Tanguay), `build_name_exclusions()`
// écarte les noms d'élus et les sigles de partis, et STOPWORDS_FR /
// STOPWORDS_EN / PROCEDURAL_TERMS couvrent « the », « cède », « considérant ».
//
// Ne PAS réimplémenter ces règles ici. Filtrer la sortie après coup est plus
// faible que nettoyer le corpus en amont (le mot écarté laisse alors la place
// au suivant, au lieu de laisser un trou), et deux listes concurrentes
// divergent. Ce Set ne reste qu'en filet pour un JSON antérieur au correctif :
// un snapshot de `public/data/agora/` plus ancien que le dernier passage du
// raffineur contient encore ces valeurs.
const MOTS_OUTILS = new Set([
  "the", "and", "of", "to", "for", "with", "that", "this",
  "le", "la", "les", "des", "une", "un", "du", "de", "et", "ou",
  "que", "qui", "dans", "pour", "avec", "sur", "par", "aux", "ce", "cette",
]);

function conceptPubliable(mot?: string): string | undefined {
  const m = (mot ?? "").trim();
  if (m.length < 3) return undefined;
  return MOTS_OUTILS.has(m.toLowerCase()) ? undefined : m;
}

// L'intitulé seul ne dit pas d'où vient la distinction. Le calcul retient
// l'expression bien plus fréquente dans CE sous-ensemble (un.e député.e, un
// parti) que dans le reste de l'Assemblée, pas la plus fréquente dans
// l'absolu. Le premier jet disait « ici qu'ailleurs » sans préciser ici-QUOI :
// on nomme donc la base de comparaison. Formulation NEUTRE en genre, la même
// pour les 125 sièges : la carte ne connaît pas le genre de la personne.
// « Concept » et non « mot » : l'extraction produit des expressions d'un OU
// deux mots, et c'est le terme retenu par le raffineur et par la méthodologie.
//
// Ces gloses restent COURTES et VISIBLES en permanence. Une carte finit
// imprimée (tirage impression dans images/deputes/cartes/, cf. assemblee.ts) :
// tout ce qui n'existe qu'au survol disparaît du carton, et ne s'atteint pas
// non plus au doigt sur mobile. Rien d'essentiel ne se cache derrière un
// survol.
function conceptGlose(sujet: "deputy" | "party"): string {
  return sujet === "party"
    ? "Mot bien plus fréquent que chez les autres partis."
    : "Mot bien plus fréquent que chez les autres élu.es.";
}

// Sans concept, le bloc disparaissait sans un mot, et l'absence se lisait comme
// une donnée manquante. Elle est en réalité un résultat : le calcul compare le
// vocabulaire d'une entité à celui des autres, et il arrive que rien ne ressorte
// assez nettement. Le raffineur préfère alors ne rien retenir plutôt qu'une
// banalité (« mieux vaut rien qu'une banalité », agora-decideurs-qc).
//
// Le cas s'observe sur les longues périodes : Maïté Blanchette Vézina ressort
// avec « véhicules zéro » sur la session (4 048 mots) et sans rien sur la
// législature (5 637 mots). Plus de texte, donc plus de vocabulaire de
// procédure, qui finit par noyer les enjeux de fond.
function conceptAbsent(sujet: "deputy" | "party"): string {
  return sujet === "party"
    ? "Aucun mot ne ressort assez nettement de ceux des autres partis sur cette période."
    : "Aucun mot ne ressort assez nettement de ceux des autres élu.es sur cette période.";
}

// Bloc du concept distinctif, partagé par la carte de député et le tiroir de
// parti. Tout est VISIBLE en permanence : pas de survol, pas de repli.
//
// Le premier jet cachait la glose et la citation derrière une pastille ⓘ au
// survol, pour gagner de la place. Deux raisons de revenir en arrière : une
// carte finit imprimée (un survol n'existe pas sur du carton), et un doigt
// sur mobile ne survole rien non plus. La place se gagne donc en écrivant
// plus court, pas en cachant.
//
// La citation fait le gros du travail d'explication : elle montre le mot en
// situation, ce qu'aucune glose ne remplace. Elle passe donc avant la
// mécanique du calcul dans la hiérarchie visuelle.
function ConceptBloc({ concept, glose, absence, citation }: {
  concept?: string;
  glose: string;
  absence: string;
  citation?: string;
}) {
  // L'explication de l'absence est écrite en clair, au même endroit que le
  // concept, et non derrière un survol : voir plus haut, la carte s'imprime et
  // le mobile ne survole pas.
  if (!concept) return <i className="concept-glose concept-vide">{absence}</i>;
  return (
    <>
      <span className="concept-mot">{concept}</span>
      {citation && (
        <span className="concept-citation">«&nbsp;{citation}&nbsp;»</span>
      )}
      {!citation && (
        <span className="concept-citation-indisponible">
          Extrait contenant ce concept non disponible.
        </span>
      )}
      <i className="concept-glose">{glose}</i>
    </>
  );
}

function parcoursResume(segments: AffiliationSegment[]): string {
  const reperes: string[] = [];
  if (segments.length > 1 || segments.some((segment) =>
    segment.startReason === "defection" || segment.endReason === "defection"
  )) reperes.push("Changement d’affiliation");
  if (segments.some((segment) => segment.startReason === "byelection")) {
    reperes.push("Élection partielle");
  }
  if (segments.some((segment) => segment.endReason === "resignation")) {
    reperes.push("Démission");
  }
  return reperes.join(" · ");
}

function raisonDebut(segment: AffiliationSegment, index: number): string | undefined {
  if (segment.startReason === "byelection") return "Entrée à l’Assemblée lors d’une élection partielle";
  if (segment.startReason === "election" && index === 0) return "Entrée à l’Assemblée lors de l’élection générale";
  // Lors d'un changement, la fin du segment précédent porte déjà le repère.
  if (segment.startReason === "defection" && index === 0) return "Changement d’affiliation";
  return undefined;
}

function raisonFin(segment: AffiliationSegment): string | undefined {
  if (segment.endReason === "defection") return "Changement d’affiliation";
  if (segment.endReason === "resignation") return "Fin du mandat par démission";
  if (segment.endReason === "dissolution") return "Fin de la législature";
  return undefined;
}

function ParliamentaryHistory({ segments }: { segments: AffiliationSegment[] }) {
  const resume = parcoursResume(segments);
  return (
    <details className="carte-parcours">
      <summary aria-label={`Afficher le parcours parlementaire\u00a0: ${resume}`}>
        <span className="carte-parcours-repere" aria-hidden="true">
          <svg viewBox="0 0 28 28" focusable="false">
            <circle className="carte-parcours-depart" cx="7" cy="5.8" r="1.7" />
            <path d="M8.8 5.9C14.7 4.7 21.1 6.2 21.2 9.7C21.3 13.2 15.3 13.7 11.2 15C7.6 16.1 7.9 19 12.4 20.2L20.5 22.6" />
            <path d="M17.8 19.8L20.8 22.8L17.2 24.6" />
          </svg>
        </span>
        <span className="carte-parcours-entete">
          <b>Parcours parlementaire</b>
          <i>{resume}</i>
        </span>
        <span className="carte-parcours-chevron" aria-hidden="true" />
      </summary>
      <div className="carte-parcours-contenu">
        <p>
          Les interventions restent associées à l’affiliation détenue au moment où elles ont été prononcées.
        </p>
        <ol className="carte-parcours-frise">
          {segments.map((segment, index) => {
            const debut = raisonDebut(segment, index);
            const fin = raisonFin(segment);
            return (
              <li key={`${segment.label}-${segment.startDate}-${index}`}>
                <span className="carte-parcours-parti">{segment.label}</span>
                <span className="carte-parcours-dates">
                  {segment.endDate
                    ? `Du ${fmtAffiliationDate(segment.startDate)} au ${fmtAffiliationDate(segment.endDate)}`
                    : `Depuis le ${fmtAffiliationDate(segment.startDate)}`}
                </span>
                {debut && <span className="carte-parcours-evenement">{debut}</span>}
                {fin && <span className="carte-parcours-evenement">{fin}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}

const MOIS_COURTS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juill.", "août", "sept.", "oct.", "nov.", "déc.",
];

function fmtAffiliationDate(value: string): string {
  const [annee, mois, jour] = value.split("-").map(Number);
  if (!annee || !mois || !jour) return value;
  return `${jour} ${MOIS_COURTS[mois - 1]} ${annee}`;
}

function RichnessDots({ level }: { level: number }) {
  const dots = [];
  for (let i = 1; i <= 5; i++) {
    dots.push(i <= level ? <span key={i}>●</span> : <span key={i} className="empty">○</span>);
  }
  return <>{dots}</>;
}

// Échelle de ton : « favorable » ou « défavorable » tout court ne dit rien à
// personne, et le chiffre d'affichage est inexploitable (amplifié puis borné,
// il colle 81 députés sur 108 à la butée). On place donc un repère sur une
// règle graduée, normalisée sur l'étendue RÉELLEMENT observée dans la période :
// le plus défavorable tient la gauche, le plus favorable la droite, le neutre
// reste au centre. La position se lit par comparaison, ce qui est exactement
// ce que la mesure permet de dire.
function toneScalePct(score: number, maxAbs: number): number {
  if (!(maxAbs > 0)) return 50;
  const ratio = Math.max(-1, Math.min(1, score / maxAbs));
  return Number((50 + ratio * 48).toFixed(1));
}

// Formulation partagée par l'échelle et par les libellés d'accessibilité : le
// nom accessible d'un bouton écrase son contenu, donc la seule façon de rendre
// le ton lisible au lecteur d'écran est de le porter dans l'aria-label parent.
function toneWording(score: number, maxAbs: number): string {
  const sens = score >= 0 ? "favorable" : "défavorable";
  if (!(maxAbs > 0)) return "ton neutre";
  const part = Math.abs(score) / maxAbs;
  if (part < 0.15) return "ton proche du neutre";
  const degre = part > 0.66 ? "nettement" : "plutôt";
  return `ton ${degre} ${sens} par rapport aux autres de la période`;
}

function ToneScale({ score, maxAbs, compact }: {
  score: number;
  maxAbs: number;
  compact?: boolean;
}) {
  const pct = toneScalePct(score, maxAbs);
  return (
    <span
      className={`ton-echelle${compact ? " compacte" : ""}`}
      role="img"
      aria-label={toneWording(score, maxAbs)}
      title={toneWording(score, maxAbs)}
    >
      <span className="ton-piste" aria-hidden="true">
        <span className="ton-neutre" />
        <span className="ton-repere" style={{ left: `${pct}%` }} />
      </span>
      <span className="ton-bornes" aria-hidden="true">
        <i>défavorable</i>
        <i>favorable</i>
      </span>
    </span>
  );
}

function DeputyCard({ deputy, party, color, maxAbsTone, flipped, onFlip }: {
  deputy: DeputyRow;
  party: PartyKey;
  color: string;
  maxAbsTone: number;
  flipped: boolean;
  onFlip: () => void;
}) {
  const partyLabel = party.toUpperCase();
  const concept = conceptPubliable(deputy.signatureWord);
  const enjeux = deputy.enjeuStack.filter((s) => !s.isReste).slice(0, 3);
  // Le verso est un objet fermé au format 5:7. Un concept ou un extrait long
  // peut prendre une ligne de plus lorsque les polices web ne chargent pas et
  // que le navigateur retombe sur Georgia/monospace. On compacte alors les
  // ESPACEMENTS des blocs fixes, jamais le texte, afin de réserver cette ligne
  // sans dépendre des métriques de police propres à une machine.
  const denseBack = (concept?.length ?? 0) > 22
    || (deputy.signatureWordContext?.length ?? 0) > 76;

  return (
    <button
      type="button"
      className={`carte${flipped ? " est-retournee" : ""}${denseBack ? " est-dense" : ""}`}
      style={{ ["--pc" as string]: color }}
      onClick={onFlip}
      aria-pressed={flipped}
      aria-label={
        flipped
          ? `${deputy.name} : revenir au recto de la carte`
          : `${deputy.name}, ${partyLabel}, ${deputy.wordsFormatted} mots, `
            + `${toneWording(deputy.toneScore, maxAbsTone)}. Voir les statistiques au verso`
      }
    >
      <span className="carte-pivot">
        {/* ---------- recto ---------- */}
        <span className="carte-recto">
          <span className="carte-cadre">
            <span className="carte-bandeau">
              <span>Assemblée nationale</span>
              <span aria-hidden="true">◆</span>
            </span>
            <span className="carte-photo">
              {deputy.portrait ? (
                // Le présentoir défile dans un conteneur transformé en 3D.
                // Le lazy-loading natif y laisse certaines cartes hors écran
                // à naturalWidth=0 même après leur arrivée dans la fenêtre.
                // Seul le parti ouvert est monté : charger ses portraits dès
                // l'ouverture reste borné et évite les cadres blancs.
                <img src={`${BASE_PATH}${deputy.portrait}`} alt="" loading="eager" decoding="async" />
              ) : (
                <span className="carte-photo-absente" aria-hidden="true">
                  Portrait non apparié
                </span>
              )}
            </span>
            {deputy.topIssueLabel && (
              <span className="carte-position">{deputy.topIssueLabel}</span>
            )}
            <span className="carte-plaque">
              <span className="carte-nom">{deputy.name}</span>
              {deputy.circonscription && (
                <span className="carte-circo">{deputy.circonscription}</span>
              )}
            </span>
            <span className="carte-macaron">{partyLabel}</span>
          </span>
        </span>

        {/* ---------- verso ---------- */}
        <span className="carte-verso">
          <span className="carte-v-tete">
            <span className="carte-v-nom">{deputy.name}</span>
            <span className="carte-v-macaron">{partyLabel}</span>
          </span>
          {deputy.circonscription && (
            <span className="carte-v-circo">{deputy.circonscription}</span>
          )}

          <span className="carte-v-stats">
            <span>
              <b>{deputy.wordsFormatted}</b>
              <i>mots</i>
            </span>
            <span>
              <b>{deputy.interventions}</b>
              <i>interventions</i>
            </span>
            <span>
              <b className="carte-v-points">
                <RichnessDots level={deputy.richnessLevel} />
              </b>
              <i>richesse lexicale</i>
            </span>
          </span>

          <span className="carte-v-bloc">
            <span className="carte-v-titre">Ton des interventions</span>
            <ToneScale score={deputy.toneScore} maxAbs={maxAbsTone} />
          </span>

          {enjeux.length > 0 && (
            <span className="carte-v-bloc">
              <span className="carte-v-titre">Sujets abordés</span>
              <span className="carte-v-enjeux">
                {enjeux.map((seg) => (
                  <span key={seg.label} className="carte-v-ligne" title={seg.title}>
                    <i className="carte-v-lbl">{seg.label}</i>
                    <i className="carte-v-pct">{seg.widthPct}&nbsp;%</i>
                    <i className="carte-v-piste">
                      <i style={{ width: `${seg.widthPct}%`, background: seg.color }} />
                    </i>
                  </span>
                ))}
              </span>
            </span>
          )}

          <span className="carte-v-bloc bloc-concept">
            <span className="carte-v-titre">Concept distinctif</span>
            <ConceptBloc
              concept={concept}
              glose={conceptGlose("deputy")}
              absence={conceptAbsent("deputy")}
              citation={deputy.signatureWordContext}
            />
          </span>

          <span className="carte-v-pied">
            Portrait&nbsp;: Assemblée nationale du Québec
          </span>
        </span>
      </span>
    </button>
  );
}

// Porte de casier : reste toujours à sa place et à sa taille dans le banc.
function LockerDoor({ row, open, onToggle, maxAbsTone }: {
  row: AssembleeRow;
  open: boolean;
  onToggle: () => void;
  maxAbsTone: number;
}) {
  const deputies = row.deputies ?? [];
  const nb = deputies.length;
  // deputies arrive déjà trié par mots décroissants (buildDeputyList).
  const plusLoquace = deputies[0];
  return (
    <button
      type="button"
      className={`casier${open ? " est-ouvert" : ""}`}
      style={{ ["--pc" as string]: row.color }}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={
        open
          ? `Refermer le casier ${row.label}`
          : `Ouvrir le casier ${row.label} : ${nb} député.es, `
            + `${toneWording(row.toneScore ?? 0, maxAbsTone)}`
      }
    >
      {/* Fond de casier. Ce n'est pas un décor : les battants emportent avec eux
          le bilan du parti en s'ouvrant, donc l'intérieur reprend le relais avec
          ce que les portes ne montraient pas — répartition par enjeu, richesse
          lexicale, concept distinctif. Comme des papiers punaisés au fond d'un
          casier. */}
      <span className="casier-fond">
        <span className="casier-cloison" aria-hidden="true" />
        <span className="casier-dedans">
          <span className="dedans-bloc bloc-chiffre">
            <span className="dedans-titre">Interventions</span>
            <span className="dedans-vedette">{row.interventions ?? 0}</span>
          </span>

          {row.enjeuStack && row.enjeuStack.length > 0 && (
            <span className="dedans-bloc bloc-enjeux">
              <span className="dedans-titre">Sujets abordés</span>
              {row.enjeuStack.filter((s) => !s.isReste).slice(0, 3).map((seg) => (
                <span key={seg.label} className="dedans-enjeu" title={seg.title}>
                  <i className="dedans-lbl">{seg.label}</i>
                  <i className="dedans-piste">
                    <i style={{ width: `${seg.widthPct}%`, background: seg.color }} />
                  </i>
                  <i className="dedans-pct">{seg.widthPct}&nbsp;%</i>
                </span>
              ))}
            </span>
          )}

          {/* Qui a le plus parlé : une mesure directe, contrairement au
              concept, et c'est déjà l'ordre du présentoir. */}
          {plusLoquace && (
            <span className="dedans-bloc bloc-vedette">
              <span className="dedans-titre">A le plus parlé</span>
              <span className="dedans-vedette">{plusLoquace.name}</span>
              <span className="dedans-vedette-mots">{plusLoquace.wordsFormatted} mots</span>
            </span>
          )}

        </span>
      </span>

      <span className="casier-battant gauche">
        <span className="casier-fentes" aria-hidden="true" />
        <span className="casier-plaque">
          <span className="casier-sigle">{row.label}</span>
        </span>
        <span className="casier-bilan">
          <span>
            <b>{row.wordsFormatted}</b>
            <i>mots</i>
          </span>
        </span>
      </span>

      <span className="casier-battant droite">
        <span className="casier-fentes" aria-hidden="true" />
        <span className="casier-bilan">
          <span>
            <b>{nb}</b>
            <i>député.es</i>
          </span>
        </span>
        <ToneScale score={row.toneScore ?? 0} maxAbs={maxAbsTone} compact />
        <span className="casier-poignee" aria-hidden="true" />
      </span>
    </button>
  );
}

export function AssembleeVestiaire({ rows, shadowRows }: {
  rows: AssembleeRow[];
  shadowRows: AssembleeRow[];
}) {
  // Le banc est trié par interventions décroissantes (buildPeriodView) : le
  // premier casier est déjà le parti qui a le plus parlé. On l'ouvre par
  // défaut plutôt que de laisser le tiroir vide au premier coup d'œil.
  const [openParty, setOpenParty] = useState<PartyKey | null>(rows[0]?.key ?? null);
  const [flipped, setFlipped] = useState<string | null>(null);

  // Une seule échelle de ton pour tout le module : les positions ne veulent
  // dire quelque chose que si elles se comparent entre elles.
  const maxAbsTone = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      max = Math.max(max, Math.abs(row.toneScore ?? 0));
      for (const dep of row.deputies ?? []) max = Math.max(max, Math.abs(dep.toneScore));
    }
    return max;
  }, [rows]);

  const openRow = rows.find((r) => r.key === openParty) ?? null;
  const openIndex = openRow ? rows.findIndex((r) => r.key === openRow.key) : 0;
  const deputies = openRow?.deputies ?? [];
  const partyConcept = conceptPubliable(openRow?.signatureWord);

  // Échap referme le tiroir : réflexe attendu de tout panneau qui se déroule.
  useEffect(() => {
    if (!openParty) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenParty(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openParty]);

  const toggle = (key: PartyKey) => {
    setOpenParty(openParty === key ? null : key);
    setFlipped(null);
  };

  return (
    <div className="vestiaire">
      <div className="vestiaire-banc">
        {rows.map((row) => (
          <LockerDoor
            key={row.key}
            row={row}
            open={openParty === row.key}
            onToggle={() => toggle(row.key)}
            maxAbsTone={maxAbsTone}
          />
        ))}
      </div>

      {openRow && (
        <div
          className="vestiaire-tiroir"
          style={{
            ["--pc" as string]: openRow.color,
            ["--i" as string]: openIndex,
            ["--n" as string]: rows.length,
          }}
        >
          <span className="tiroir-encoche" aria-hidden="true" />
          <div className="tiroir-tete">
            <span className="tiroir-parti">{openRow.label}</span>
            <span className="tiroir-compte">
              {deputies.length} député.es qui ont pris la parole
            </span>
            <button type="button" className="tiroir-refermer" onClick={() => toggle(openRow.key)}>
              Refermer
            </button>
          </div>

          {/* L'angle éditorial du parti : une phrase a besoin de largeur, donc
              elle vit dans le tiroir et non sur une porte de casier. */}
          {openRow.editorialAngle && (
            <p className="tiroir-angle">{openRow.editorialAngle}</p>
          )}

          {/* Concept distinctif agrégé au niveau du parti (TF-IDF inter-partis,
              cf. AssembleeRow.signatureWord) — distinct du concept par député,
              qui compare chaque élu.e au reste de l'Assemblée. */}
          <p className="tiroir-concept">
            <span className="tiroir-concept-titre">Concept distinctif du parti</span>
            <ConceptBloc
              concept={partyConcept}
              glose={conceptGlose("party")}
              absence={conceptAbsent("party")}
              citation={openRow.signatureWordContext}
            />
          </p>

          {deputies.length > 0 ? (
            <div className="tiroir-presentoir">
              {deputies.map((dep) => (
                <div
                  className="carte-colonne"
                  key={dep.name}
                  style={{ ["--pc" as string]: openRow.color }}
                >
                  <DeputyCard
                    deputy={dep}
                    party={openRow.key}
                    color={openRow.color}
                    maxAbsTone={maxAbsTone}
                    flipped={flipped === dep.name}
                    onFlip={() => setFlipped(flipped === dep.name ? null : dep.name)}
                  />
                  {dep.affiliationHistory && (
                    <ParliamentaryHistory segments={dep.affiliationHistory} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="tiroir-vide">
              Aucune prise de parole attribuée à ce parti pour la période.
            </p>
          )}
        </div>
      )}

      {shadowRows.length > 0 && (
        <p className="in-shadow">
          <span className="in-shadow-label">Hors chambre&nbsp;:</span>{" "}
          {shadowRows.map((r) => r.label).join(", ")}, aucune prise de parole
          relevée pour la période.
        </p>
      )}
    </div>
  );
}
