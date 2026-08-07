"use client";

import { useState } from "react";
import type { AssembleeData, PeriodKey, PeriodView } from "@/lib/data/assemblee";
import { ShareButton } from "@/components/interactive/ShareButton";
import { AssembleeBilliard } from "@/components/interactive/AssembleeBilliard";
import { AssembleeVestiaire } from "@/components/interactive/AssembleeVestiaire";

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
          Leur publication peut prendre quelques semaines après les séances — la date affichée reflète la dernière version disponible.
        </span>
      )}
    </button>
  );
}

const PERIODS: PeriodKey[] = ["last_pdq", "session", "legislature"];

export function AssembleeClient({ data }: { data: AssembleeData }) {
  const [period, setPeriod] = useState<PeriodKey>("last_pdq");
  const [playing, setPlaying] = useState(false);
  const view: PeriodView = data.periods[period];

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
            <ShareButton title="L'alignement de l'Assemblée nationale" anchor="assemblee-nationale" />
          </div>
        </div>
      </div>

      <section className="assemblee">
        {playing ? (
          <>
            <button type="button" className="ass-back-btn" onClick={() => setPlaying(false)}>
              ← Retour aux dossiers
            </button>
            <AssembleeBilliard rows={visibleRows} shadowRows={shadowRows} />
          </>
        ) : (
          <AssembleeVestiaire key={period} rows={visibleRows} shadowRows={shadowRows} />
        )}
      </section>
      <div className="module-last-updated">
        {view.lastUpdated}
        {!playing && (
          <button
            type="button"
            className="ass-easter-btn"
            onClick={() => setPlaying(true)}
            aria-label="Easter egg : jeu de billard"
            title="🎱"
          >
            🎱
          </button>
        )}
      </div>
    </>
  );
}
