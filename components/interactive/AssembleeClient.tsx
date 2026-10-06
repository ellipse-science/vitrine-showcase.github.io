"use client";

import { useMemo, useState } from "react";
import type { AssembleeData, DeputyRow, PeriodKey, PeriodView } from "@/lib/data/assemblee";
import { slugCirco } from "@/lib/cartes/fonctions";
import type { CartesSite } from "@/lib/cartes/site";
import { PERIODES } from "@/lib/cartes/types";
import { ShareButton } from "@/components/interactive/ShareButton";
import { AssembleeVestiaire } from "@/components/interactive/AssembleeVestiaire";
import type { ContexteCartes } from "@/components/interactive/CarteDepute";

/** Ce que le verso d'une carte doit savoir des TROIS périodes : la fiche du
 *  même élu dans chacune (indexée par circonscription, le nom ne suffisant
 *  pas — deux Éric Girard à la CAQ) et l'étendue du ton réellement observée,
 *  qui cale l'échelle. Les mêmes règles que le générateur imprimé. */
function contexteCartes(data: AssembleeData, cartes: CartesSite, periode: PeriodKey): ContexteCartes {
  // La fiche d'un élu dans chaque période, par circonscription (le nom ne
  // suffit pas — deux Girard à la CAQ). Pour une personne qui a plusieurs
  // lignes, la fiche RÉUNIE préparée au build remplace celle du casier : la
  // carte parle de la personne (relecture d'Adrien, vitrine#917).
  const fiches = new Map<string, Partial<Record<PeriodKey, DeputyRow>>>();
  for (const cle of PERIODES) {
    const vue = data.periods[cle];
    const surcharges = cartes.personnes[cle] ?? {};
    for (const r of vue ? vue.rows.flatMap((x) => x.deputies ?? []) : []) {
      const s = slugCirco(r);
      fiches.set(s, { ...(fiches.get(s) ?? {}), [cle]: { ...r, ...surcharges[s] } });
    }
  }
  // « Dernière mise à jour du module : vendredi 12 juin 2026 » → la date seule.
  const derniereSeance = data.periods[periode].lastUpdated.replace(/^[^:]*:\s*/, "");
  return { periode, fiches, maxAbs: cartes.maxAbs, libelles: cartes.libelles, derniereSeance, signatures: new Set(cartes.signatures) };
}

function SourceTip() {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className={`assemblee-info-tip${open ? " open" : ""}`}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-label="À propos de la source"
      aria-expanded={open}
    >
      ⓘ
      {open && (
        <span className="assemblee-info-bubble">
          Les données proviennent des transcriptions officielles du Journal des débats de l&apos;Assemblée nationale.
          Leur publication peut prendre quelques semaines après les séances. La date affichée reflète la dernière version disponible.
        </span>
      )}
    </button>
  );
}

const PERIODS: PeriodKey[] = ["last_pdq", "session", "legislature"];
const LIBELLES_COURTS: Record<PeriodKey, string> = { last_pdq: "Journée", session: "Session", legislature: "Législature" };

export function AssembleeClient({ data, cartes, editionKey }: { data: AssembleeData; cartes?: CartesSite; editionKey?: string }) {
  const [period, setPeriod] = useState<PeriodKey>("legislature");
  const view: PeriodView = data.periods[period];
  const contexte = useMemo(() => (cartes ? contexteCartes(data, cartes, period) : null), [data, cartes, period]);

  const visibleRows = view.rows.filter((r) => !r.inShadow);
  const shadowRows = view.rows.filter((r) => r.inShadow);

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">L&apos;alignement de l&apos;Assemblée</h2>
          <div className="period-subtitle">
            {view.subtitle}
            <SourceTip />
          </div>
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline assemblee-periodes" role="tablist" aria-label="Période">
              {PERIODS.map((p) => (
                <span
                  key={p}
                  role="tab"
                  tabIndex={0}
                  aria-selected={p === period}
                  // Nom accessible explicite : sur téléphone, le libellé long est
                  // masqué et le court est aria-hidden (relecture d'Adrien, #924).
                  aria-label={data.periods[p].tabLabel}
                  className={p === period ? "active" : undefined}
                  onClick={() => setPeriod(p)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPeriod(p); } }}
                  style={{ cursor: "pointer" }}
                >
                  {/* Libellé complet sur ordinateur, un mot sur téléphone. */}
                  <span className="periode-long">{data.periods[p].tabLabel}</span>
                  <span className="periode-court" aria-hidden="true">{LIBELLES_COURTS[p]}</span>
                </span>
              ))}
            </div>
            <ShareButton title="L'alignement de l'Assemblée nationale" anchor="assemblee-nationale" editionKey={editionKey} />
          </div>
        </div>
      </div>

      <section className="assemblee">
        {/* Les cinq casiers en tout temps (Jules, 3 oct.) : un parti sans parole
            dans la vue garde le sien, vide, au bout du banc. */}
        <AssembleeVestiaire key={period} rows={[...visibleRows, ...shadowRows]} shadowRows={[]} cartes={cartes?.parPeriode[period]?.cartes} contexte={contexte} />
      </section>
      <div className="module-last-updated">{view.lastUpdated}</div>
    </>
  );
}
