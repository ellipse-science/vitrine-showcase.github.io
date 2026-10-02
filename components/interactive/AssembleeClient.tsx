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
  const fiches = new Map<string, Partial<Record<PeriodKey, DeputyRow>>>();
  const maxAbs = {} as Record<PeriodKey, number>;
  for (const cle of PERIODES) {
    const vue = data.periods[cle];
    const tous = vue ? [...vue.rows.flatMap((r) => r.deputies ?? []), ...(vue.independants ?? [])] : [];
    maxAbs[cle] = tous.reduce((m, r) => Math.max(m, Math.abs(r.toneScore)), 0);
    for (const r of tous) {
      const s = slugCirco(r);
      fiches.set(s, { ...(fiches.get(s) ?? {}), [cle]: r });
    }
  }
  // « Dernière mise à jour du module : vendredi 12 juin 2026 » → la date seule.
  const derniereSeance = data.periods[periode].lastUpdated.replace(/^[^:]*:\s*/, "");
  return { periode, fiches, maxAbs, libelles: cartes.libelles, derniereSeance, signatures: new Set(cartes.signatures) };
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
            <div className="legend-toggle inline">
              {PERIODS.map((p) => (
                <span
                  key={p}
                  className={p === period ? "active" : undefined}
                  onClick={() => setPeriod(p)}
                  style={{ cursor: "pointer" }}
                >
                  {data.periods[p].tabLabel}
                </span>
              ))}
            </div>
            <ShareButton title="L'alignement de l'Assemblée nationale" anchor="assemblee-nationale" editionKey={editionKey} />
          </div>
        </div>
      </div>

      <section className="assemblee">
        <AssembleeVestiaire key={period} rows={visibleRows} shadowRows={shadowRows} cartes={cartes?.parPeriode[period]?.cartes} contexte={contexte} />
      </section>
      <div className="module-last-updated">{view.lastUpdated}</div>
    </>
  );
}
