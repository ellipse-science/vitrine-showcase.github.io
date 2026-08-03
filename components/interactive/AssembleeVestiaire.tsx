"use client";

import { useEffect, useState } from "react";
import type { AssembleeRow, DeputyRow } from "@/lib/data/assemblee";
import type { PartyKey } from "@/lib/data/parties";

// Vestiaire : un casier par parti actif. La porte porte le bilan du parti ;
// l'ouvrir dévoile le présentoir de cartes de ses députés. Retourner une carte
// montre son verso statistique.
//
// La carte reprend la grammaire des cartes de collection : le macaron de parti
// tient lieu d'écusson d'équipe, et l'enjeu dominant tient lieu de position.
// Le portrait est une trame de similigravure calculée à la taille d'impression
// (scripts/build_deputy_cards.py) : c'est ce qui permet à la carte d'être
// imprimée pour de vrai malgré le petit format servi par l'Assemblée.

function RichnessDots({ level }: { level: number }) {
  const dots = [];
  for (let i = 1; i <= 5; i++) {
    dots.push(i <= level ? <span key={i}>●</span> : <span key={i} className="empty">○</span>);
  }
  return <>{dots}</>;
}

// On n'affiche que le SENS du ton, jamais son intensité chiffrée.
// La valeur d'affichage est amplifiée puis bornée en amont (TONE_AMPLIFY),
// si bien que les trois quarts des députés arrivent ici collés à la butée :
// un « 100 » à côté du mot laisserait croire à une mesure fine là où il n'y a
// qu'un plafond. Le signe, lui, reste fiable.
function toneLabel(toneLeftPct: number): string {
  return toneLeftPct >= 50 ? "favorable" : "défavorable";
}

function DeputyCard({ deputy, party, color, flipped, onFlip }: {
  deputy: DeputyRow;
  party: PartyKey;
  color: string;
  flipped: boolean;
  onFlip: () => void;
}) {
  const tone = toneLabel(deputy.toneLeftPct);
  const partyLabel = party.toUpperCase();
  const enjeux = deputy.enjeuStack.filter((s) => !s.isReste).slice(0, 5);

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
          : `${deputy.name}, ${partyLabel} — voir les statistiques au verso`
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
              <i>richesse</i>
            </span>
          </span>
          <span className="carte-v-ton">
            Ton <b>{tone}</b> en chambre
          </span>

          {enjeux.length > 0 && (
            <>
              <span className="carte-v-titre">Répartition par enjeu</span>
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
            </>
          )}

          {deputy.signatureWord && (
            <>
              <span className="carte-v-titre">Concept distinctif</span>
              <span className="carte-v-concept">{deputy.signatureWord}</span>
              {deputy.signatureWordContext && (
                <span className="carte-v-citation">
                  «&nbsp;{deputy.signatureWordContext}&nbsp;»
                </span>
              )}
            </>
          )}

          <span className="carte-v-pied">
            Vitrine démocratique · portrait&nbsp;: Assemblée nationale du Québec
          </span>
        </span>
      </span>
    </button>
  );
}

function Locker({ row, open, onToggle }: {
  row: AssembleeRow;
  open: boolean;
  onToggle: () => void;
}) {
  const [flipped, setFlipped] = useState<string | null>(null);
  const deputies = row.deputies ?? [];
  const tone = toneLabel(row.toneLeftPct ?? 50);

  return (
    <div className={`casier${open ? " est-ouvert" : ""}`} style={{ ["--pc" as string]: row.color }}>
      {/* Intérieur : révélé quand les portes s'ouvrent. */}
      <div className="casier-interieur" hidden={!open}>
        <div className="casier-etiquette">
          <span className="casier-etiquette-parti">{row.label}</span>
          <span className="casier-etiquette-compte">
            {deputies.length} député.es qui ont pris la parole
          </span>
          {/* Deuxième sortie, en clair : les battants se cliquent aussi, mais
              rien ne le dit à l'écran, et la touche Échap ne se découvre pas. */}
          <button type="button" className="casier-refermer" onClick={onToggle}>
            Refermer le casier
          </button>
        </div>

        {deputies.length > 0 ? (
          <div className="casier-presentoir">
            {deputies.map((dep) => (
              <DeputyCard
                key={dep.name}
                deputy={dep}
                party={row.key}
                color={row.color}
                flipped={flipped === dep.name}
                onFlip={() => setFlipped(flipped === dep.name ? null : dep.name)}
              />
            ))}
          </div>
        ) : (
          <p className="casier-vide">
            Aucune prise de parole attribuée à ce parti pour la période.
          </p>
        )}
      </div>

      {/* Portes : deux battants qui pivotent vers l'extérieur. */}
      <button
        type="button"
        className="casier-portes"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={
          open
            ? `Refermer le casier ${row.label}`
            : `Ouvrir le casier ${row.label} et voir ses ${deputies.length} cartes`
        }
      >
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
            <span>
              <b>{row.interventions ?? 0}</b>
              <i>interventions</i>
            </span>
          </span>
        </span>
        <span className="casier-battant droite">
          <span className="casier-fentes" aria-hidden="true" />
          <span className="casier-bilan">
            <span>
              <b>{deputies.length}</b>
              <i>député.es</i>
            </span>
            <span className="casier-ton">
              Ton {tone}
            </span>
          </span>
          {row.enjeuStack && row.enjeuStack.length > 0 && (
            <span className="casier-enjeux" aria-hidden="true">
              {row.enjeuStack.map((seg, i) => (
                <span
                  key={`${seg.label}-${i}`}
                  style={{ width: `${seg.widthPct}%`, background: seg.color || "transparent" }}
                  className={seg.isReste ? "reste" : undefined}
                />
              ))}
            </span>
          )}
          <span className="casier-poignee" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export function AssembleeVestiaire({ rows, shadowRows }: {
  rows: AssembleeRow[];
  shadowRows: AssembleeRow[];
}) {
  const [openParty, setOpenParty] = useState<PartyKey | null>(null);

  // Échap referme le casier ouvert : c'est le réflexe attendu de tout panneau
  // qui s'étale par-dessus le reste de la page.
  useEffect(() => {
    if (!openParty) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenParty(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openParty]);

  return (
    <div className="vestiaire">
      <div className="vestiaire-rangee">
        {rows.map((row) => (
          <Locker
            key={row.key}
            row={row}
            open={openParty === row.key}
            onToggle={() => setOpenParty(openParty === row.key ? null : row.key)}
          />
        ))}
      </div>

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
