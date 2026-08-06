"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssembleeRow, DeputyRow } from "@/lib/data/assemblee";
import type { PartyKey } from "@/lib/data/parties";

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

// Garde-fou d'affichage sur le concept distinctif AU NIVEAU DU PARTI. Le
// raffineur déployé y produit encore des mots-outils : sur les douze valeurs
// publiées, on trouve « the », « and », « considérant » et « cède » (extrait de
// « je cède la parole »). Un mot-outil n'est pas un concept, et le publier tel
// quel n'apprendrait rien à personne.
// Ce filtre ne rattrape QUE les cas indiscutables. Il ne peut rien contre
// « cède » ni contre « bérubé » (le nom d'un député) : la vraie correction est
// dans le raffineur, pas ici.
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
// l'expression bien plus fréquente ici qu'ailleurs, pas la plus fréquente dans
// l'absolu : on l'écrit sous le concept plutôt que de laisser deviner.
// « Concept » et non « mot » : l'extraction produit des expressions d'un OU
// deux mots, et c'est le terme retenu par le raffineur et par la méthodologie.
const GLOSE_CONCEPT = "Bien plus fréquent ici qu'ailleurs à l'Assemblée.";

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

  return (
    <button
      type="button"
      className={`carte${flipped ? " est-retournee" : ""}`}
      style={{ ["--pc" as string]: color }}
      onClick={onFlip}
      aria-pressed={flipped}
      aria-label={
        flipped
          ? `${deputy.name} : revenir au recto de la carte`
          : `${deputy.name}, ${partyLabel}, ${deputy.wordsFormatted} mots, `
            + `${toneWording(deputy.toneScore, maxAbsTone)} — voir les statistiques au verso`
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
                <img src={deputy.portrait} alt="" loading="lazy" decoding="async" />
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

          {concept && (
            <span className="carte-v-bloc">
              <span className="carte-v-titre">Concept distinctif</span>
              <span className="carte-v-concept">{concept}</span>
              <span className="carte-v-glose">{GLOSE_CONCEPT}</span>
              {deputy.signatureWordContext && (
                <span className="carte-v-citation">
                  «&nbsp;{deputy.signatureWordContext}&nbsp;»
                </span>
              )}
            </span>
          )}

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
          : `Ouvrir le casier ${row.label} : ${nb} député.es, `
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
  const [openParty, setOpenParty] = useState<PartyKey | null>(null);
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

          {deputies.length > 0 ? (
            <div className="tiroir-presentoir">
              {deputies.map((dep) => (
                <DeputyCard
                  key={dep.name}
                  deputy={dep}
                  party={openRow.key}
                  color={openRow.color}
                  maxAbsTone={maxAbsTone}
                  flipped={flipped === dep.name}
                  onFlip={() => setFlipped(flipped === dep.name ? null : dep.name)}
                />
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
          {shadowRows.map((r) => r.label).join(", ")} — aucune prise de parole
          relevée pour la période.
        </p>
      )}
    </div>
  );
}
