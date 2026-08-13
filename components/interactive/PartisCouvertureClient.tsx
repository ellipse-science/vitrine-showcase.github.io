"use client";

import { useState, useRef } from "react";
import type { PartiesData, RangeKey, RangeView, RowView, ChartView } from "@/lib/data/parties";
import { TOUS_MEDIAS, MEDIA_ORDER } from "@/lib/medias";
import { ELECTION_LABEL } from "@/lib/election";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { DoomGame } from "@/components/interactive/DoomGame";

const RANGES: RangeKey[] = ["today", "week", "overall"];

function shareTitle(data: PartiesData): string {
  const leader = data.ranges.today.rows[0];
  if (!leader || leader.sovPct === 0 || leader.inShadow) {
    return "Couverture médiatique des partis politiques";
  }
  const tone =
    leader.toneDirection === "positive"
      ? "on en parle en bien"
      : leader.toneDirection === "negative"
        ? "on en parle en mal"
        : "l'important, c'est qu'on en parle";
  return `${leader.label} domine la couverture (${leader.sovPct} %) : ${tone}`;
}

export function PartisCouvertureClient({ data }: { data: PartiesData }) {
  const [range, setRange] = useState<RangeKey>("today");
  const [media, setMedia] = useState<string>(TOUS_MEDIAS);
  const [showDoom, setShowDoom] = useState(false);
  const pcqTapRef = useRef({ count: 0, lastTime: 0 });

  const handlePcqTap = () => {
    const now = performance.now();
    if (now - pcqTapRef.current.lastTime < 1500) {
      pcqTapRef.current.count += 1;
    } else {
      pcqTapRef.current.count = 1;
    }
    pcqTapRef.current.lastTime = now;

    if (pcqTapRef.current.count >= 3) {
      pcqTapRef.current.count = 0;
      setShowDoom(true);
    }
  };

  // Position du fader. « Tous les médias » lit la table AGRÉGÉE, jamais une
  // moyenne des vues par média : l'agrégat est pondéré par les minutes de
  // chaque média, donc les deux nombres diffèrent légitimement.
  const source =
    media !== TOUS_MEDIAS && data.byMedia[media]
      ? data.byMedia[media]
      : { ranges: data.ranges, chart: data.chart };
  const view: RangeView = source.ranges[range];
  const visibleRows = view.rows.filter((r) => !r.inShadow);
  const shadowRows = view.rows.filter((r) => r.inShadow);

  if (showDoom) {
    return <DoomGame onExit={() => setShowDoom(false)} />;
  }

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Couverture médiatique des partis politiques</h2>
          <Countdown days={data.daysToElection} />
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline">
              {RANGES.map((r) => (
                <span
                  key={r}
                  className={r === range ? "active" : undefined}
                  onClick={() => setRange(r)}
                  style={{ cursor: "pointer" }}
                >
                  {data.ranges[r].tabLabel}
                </span>
              ))}
            </div>
            <ShareButton title={shareTitle(data)} anchor="partis-et-couverture" />
          </div>
        </div>
      </div>

      <Console rows={view.rows} refLabel={view.refLabel} onPcqTap={handlePcqTap} />

      {data.medias.length > 0 && (
        <Fader
          medias={data.medias}
          valeur={media}
          onChange={setMedia}
        />
      )}

      <section className="partis-course">
        <Course chart={source.chart} headLabel="La course jusqu'au scrutin, jour par jour" />
      </section>

      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

const RANGS = ["1er", "2e", "3e", "4e", "5e"];

/**
 * L'échelle des vumètres, en points de part de voix.
 *
 * FIXE, et non calée sur le meneur : sur une console, un niveau se lit dans
 * l'absolu. Un vumètre auto-calibré mettrait toujours le premier canal à fond,
 * et « dans le rouge » ne voudrait plus rien dire.
 *
 * 50 % est le fond d'échelle : à cinq partis, dominer la moitié de toute la
 * couverture, c'est saturer. Les seuils de couleur ne sont pas décoratifs —
 * 20 % est le PARTAGE ÉGAL entre cinq partis, donc la frontière entre un canal
 * en dessous de sa part et un canal au-dessus.
 */
const METER_SEGMENTS = 20;
const METER_FULL_SCALE = 50;
const SEUIL_AMBRE = 20; // partage égal à cinq
const SEUIL_ROUGE = 40;

/** Zone d'un segment, d'après la part de voix qu'il représente. */
function zoneSegment(i: number): "ink" | "amber" | "red" {
  const pct = ((i + 1) / METER_SEGMENTS) * METER_FULL_SCALE;
  if (pct > SEUIL_ROUGE) return "red";
  if (pct > SEUIL_AMBRE) return "amber";
  return "ink";
}

/**
 * Position visuelle d'une tranche, pour que le canal le plus fort soit AU
 * CENTRE : rangs pairs à gauche, impairs à droite, soit 4-2-1-3-5. Le HTML
 * reste dans l'ordre du classement — c'est lui qu'énonce un lecteur d'écran.
 */
function positionVisuelle(rang: number, total: number): number {
  if (rang === 1) return 0;
  return rang % 2 === 0 ? -Math.ceil(rang / 2) : Math.ceil((rang - 1) / 2) + total;
}

/**
 * La console — une tranche par parti, un vumètre par tranche.
 *
 * La couleur des segments dit le NIVEAU, jamais le parti : c'est ainsi que
 * fonctionne une console, et c'est ce qui règle au passage la confusion entre
 * les deux bleus de la CAQ et du PQ. L'identité du canal est portée par son
 * étiquette, comme le ruban de couleur collé sur une tranche.
 *
 * Le trait qui flotte au-dessus des segments allumés est le PEAK HOLD : le
 * sommet atteint sur la fenêtre, qui reste affiché longtemps après que le
 * niveau soit redescendu.
 *
 * Un parti dans l'ombre médiatique est un CANAL COUPÉ — pas un dernier de
 * classement. Il quitte la console et passe sous la barre des coupés.
 */
function Console({
  rows,
  refLabel,
  onPcqTap,
}: {
  rows: RowView[];
  refLabel: string;
  onPcqTap: () => void;
}) {
  const actifs = rows.filter((r) => !r.inShadow);
  const coupes = rows.filter((r) => r.inShadow);
  const tete = actifs[0];

  if (!tete || tete.sovPct <= 0) {
    return (
      <p className="console-vide">
        Aucun signal sur cette période — tous les canaux sont silencieux.
      </p>
    );
  }

  return (
    <section className="console" aria-label="Niveaux de couverture médiatique par parti">
      <div className="console-tete">
        <span className="console-titre">Niveaux — {refLabel}</span>
        <span className="console-echelle-legende">
          <i className="zone ink" /> sous sa part
          <i className="zone amber" /> au-dessus
          <i className="zone red" /> saturation
        </span>
      </div>

      <div className="console-corps">
        <ol className="console-tranches" style={{ ["--n" as string]: actifs.length }}>
          {actifs.map((row, i) => (
            <Tranche
              key={row.key}
              row={row}
              rang={i + 1}
              total={actifs.length}
              onPcqTap={row.key === "pcq" ? onPcqTap : undefined}
            />
          ))}
        </ol>

        {/* Graduations, à droite comme sur une tranche de console. */}
        <ul className="console-graduations" aria-hidden="true">
          {[50, 40, 30, 20, 10, 0].map((v) => (
            <li key={v} style={{ ["--v" as string]: v / METER_FULL_SCALE }}>
              {v === SEUIL_AMBRE ? <b>{v} %</b> : `${v} %`}
            </li>
          ))}
        </ul>
      </div>

      <VictoireDouteuse tete={tete} />

      {coupes.length > 0 && (
        <p className="console-coupes">
          <span className="console-coupes-label">
            Canaux coupés
            <InfoTip size="sm" label="Ombre médiatique">
              Moins de 2&nbsp;% de la part de voix sur la période — trop peu pour qu&apos;on puisse
              parler d&apos;une présence. Ces partis sortent de la console : leur signal n&apos;est
              pas faible, il est inaudible.
            </InfoTip>
          </span>
          {coupes.map((row) => (
            <span key={row.key} className="console-coupe-item">
              <i className="console-ruban" style={{ background: row.color }} aria-hidden="true" />
              <span
                onClick={row.key === "pcq" ? onPcqTap : undefined}
                style={row.key === "pcq" ? { cursor: "pointer", userSelect: "none" } : undefined}
                title={row.key === "pcq" ? "PCQ (Touchez 3 fois pour une surprise !)" : undefined}
              >
                {row.label}
              </span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/** Une tranche : vumètre segmenté, peak hold, ruban d'identité, ton. */
function Tranche({
  row,
  rang,
  total,
  onPcqTap,
}: {
  row: RowView;
  rang: number;
  total: number;
  onPcqTap?: () => void;
}) {
  const niveau = Math.min(1, row.sovPct / METER_FULL_SCALE);
  const allumes = Math.max(1, Math.round(niveau * METER_SEGMENTS));
  const peak = Math.min(1, row.peakPct / METER_FULL_SCALE);

  return (
    <li
      className={`console-tranche${rang === 1 ? " tete" : ""}`}
      style={{ ["--ordre" as string]: positionVisuelle(rang, total) }}
    >
      <div
        className="console-vumetre"
        title={`${row.label} — ${row.sovPct} % de la part de voix (sommet : ${row.peakPct} %)`}
      >
        {/* Du haut vers le bas : le segment 19 est en haut de l'échelle. */}
        {Array.from({ length: METER_SEGMENTS }, (_, k) => METER_SEGMENTS - 1 - k).map((idx) => (
          <i
            key={idx}
            className={`seg ${zoneSegment(idx)}${idx < allumes ? " on" : ""}`}
            aria-hidden="true"
          />
        ))}
        {row.peakPct > 0 && (
          <span
            className="console-peak"
            style={{ bottom: `${peak * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <span className="console-ruban-nom" style={{ ["--party" as string]: row.color }}>
        <span
          onClick={onPcqTap}
          style={onPcqTap ? { cursor: "pointer", userSelect: "none" } : undefined}
          title={onPcqTap ? "PCQ (Touchez 3 fois pour une surprise !)" : undefined}
        >
          {row.label}
        </span>
      </span>
      <span className="console-rang">{RANGS[rang - 1]}</span>
      <span className={`tone-streak tone-streak--${row.toneDirection}`} title={row.toneTitle}>
        {row.toneLabel}
      </span>
    </li>
  );
}

/**
 * Le canal le plus fort est-il vraiment le meilleur ?
 *
 * Quand le parti le plus couvert l'est en mal, on pose la question sans la
 * trancher : la console mesure un niveau, pas une qualité de son.
 */
function VictoireDouteuse({ tete }: { tete: RowView }) {
  if (tete.toneDirection !== "negative") return null;
  return (
    <p className="console-doute">
      <span className="console-doute-marque" aria-hidden="true">
        ?
      </span>
      <span>
        <b>{tete.label}</b>{" "}
        pousse le niveau le plus haut — mais on en parle en mal. Le canal le plus fort n&apos;est
        pas forcément le mieux joué.
        <InfoTip size="sm" label="Fort ne veut pas dire bon">
          La console mesure un VOLUME de couverture, pas sa faveur. Un parti peut saturer parce
          qu&apos;on le critique. L&apos;adage veut qu&apos;il n&apos;y ait pas de mauvaise
          publicité — cette page ne prétend pas savoir s&apos;il a raison.
        </InfoTip>
      </span>
    </p>
  );
}

/**
 * Le fader — choisir la source qu'on écoute.
 *
 * Un `input[type=range]` à crans plutôt qu'un menu déroulant : sur une
 * console, on ne choisit pas une source dans une liste, on pousse un curseur.
 * Le clavier fonctionne (flèches), et le lecteur d'écran annonce la valeur via
 * `aria-valuetext`, que le rendu visuel ne lui donnerait pas.
 *
 * Position 0 = tous les médias, c'est-à-dire la table AGRÉGÉE — pas la moyenne
 * des positions suivantes.
 */
function Fader({
  medias,
  valeur,
  onChange,
}: {
  medias: { id: string; label: string }[];
  valeur: string;
  onChange: (v: string) => void;
}) {
  // Ordre du crossfader : « tous » AU CENTRE, les médias de part et d'autre.
  // MEDIA_ORDER fixe la disposition ; tout média publié mais absent de cette
  // liste est ajouté à la fin plutôt que d'être escamoté.
  const parId = new Map(medias.map((m) => [m.id, m]));
  const connus = MEDIA_ORDER.flatMap((id) =>
    id === TOUS_MEDIAS
      ? [{ id: TOUS_MEDIAS, label: "Tous les médias" }]
      : parId.has(id)
        ? [parId.get(id)!]
        : [],
  );
  const restants = medias.filter((m) => !MEDIA_ORDER.includes(m.id));
  const positions = [...connus, ...restants];
  const idx = Math.max(0, positions.findIndex((p) => p.id === valeur));
  const courante = positions[idx];

  return (
    <div className="fader">
      <div className="fader-tete">
        <span className="fader-label">Source</span>
        <span className="fader-valeur">{courante.label}</span>
      </div>

      <div className="fader-piste">
        <input
          type="range"
          min={0}
          max={positions.length - 1}
          step={1}
          value={idx}
          onChange={(e) => onChange(positions[Number(e.target.value)].id)}
          aria-label="Source médiatique"
          aria-valuetext={courante.label}
          className="fader-input"
        />
        <div className="fader-crans" aria-hidden="true">
          {positions.map((p, i) => (
            <span
              key={p.id}
              className={`fader-cran${i === idx ? " actif" : ""}${
                p.id === TOUS_MEDIAS ? " tous" : ""
              }`}
              style={{ left: `${(i / (positions.length - 1)) * 100}%` }}
            >
              <i />
              <b>{p.id === TOUS_MEDIAS ? "TOUS" : p.id}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** « J-53 avant le scrutin ». Le jour même, puis après, le libellé change —
 *  un « J-0 » ou un compte négatif ne veut rien dire pour un lecteur. */
function Countdown({ days }: { days: number }) {
  if (days < 0) return null;
  const label = days === 0 ? "Scrutin aujourd'hui" : `J-${days} avant le scrutin`;
  return (
    <span className="partis-countdown" title={`Élections générales québécoises — ${ELECTION_LABEL}`}>
      {label}
    </span>
  );
}

/**
 * La course : toutes les lignes sur une seule échelle verticale.
 *
 * Le SVG ne porte QUE la géométrie (grille + lignes), étiré en largeur via
 * preserveAspectRatio="none" — c'est pourquoi les traits portent
 * vectorEffect="non-scaling-stroke", sans quoi l'étirement les épaissirait.
 * Tout le texte est en HTML positionné par-dessus : dans un SVG étiré, il
 * serait déformé.
 */
function Course({ chart, headLabel }: { chart: ChartView; headLabel: string }) {
  if (chart.tooShort) {
    return (
      <p className="course-vide">
        Une seule journée de données disponible — pas encore de quoi tracer une évolution.
      </p>
    );
  }

  const pct = (v: number, max: number) => `${(v / max) * 100}%`;

  // Le dégradé est ancré sur des PARTS DE VOIX ABSOLUES, pas sur la hauteur du
  // cadre : l'axe étant tronqué au maximum observé, se caler dessus ferait
  // désigner à la même bande de couleur 40 % un jour et 25 % le lendemain.
  // Ici, 30 % de couverture donne toujours exactement la même teinte.
  const arret = (sovPct: number) => `${Math.min(100, (sovPct / chart.topPct) * 100)}%`;
  const fond = [
    `transparent 0%`,
    `color-mix(in srgb, var(--amber) 7%, transparent) ${arret(12)}`,
    `color-mix(in srgb, var(--amber) 15%, transparent) ${arret(28)}`,
    `color-mix(in srgb, var(--red) 22%, transparent) ${arret(50)}`,
  ].join(", ");

  return (
    <figure className="course-figure">
      <figcaption className="course-tete">
        {headLabel}
        <span className="course-echelle" aria-hidden="true">
          <i className="course-echelle-barre" />
          du silence à la saturation
        </span>
      </figcaption>

      <div className="course-cadre" style={{ ["--fond-db" as string]: `linear-gradient(to top, ${fond})` }}>
        <svg
          className="course-svg"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {chart.gridLines.map((g) => (
            <line
              key={g.pct}
              x1="0"
              x2={chart.width}
              y1={g.y}
              y2={g.y}
              className={g.pct === 0 ? "course-axe" : "course-grille"}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {chart.series.map((s) => (
            <polyline
              key={s.key}
              points={s.polyline}
              fill="none"
              stroke={s.color}
              strokeWidth={s.inShadow ? 1 : 1.6}
              strokeDasharray={s.inShadow ? "2 2" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={s.inShadow ? 0.5 : 1}
            />
          ))}

          {chart.election && (
            <line
              x1={chart.election.x}
              x2={chart.election.x}
              y1="0"
              y2={chart.height}
              className="course-scrutin"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {chart.election && (
          <span className="course-scrutin-label" style={{ left: pct(chart.election.x, chart.width) }}>
            Scrutin
            <b>{chart.election.label}</b>
          </span>
        )}

        {/* Le point terminal est en HTML, pas en SVG : dans un viewBox étiré en
            largeur, un <circle> devient une ellipse démesurée. Il marque la
            donnée exacte (lastY), là où l'étiquette peut avoir été déplacée. */}
        {chart.series.map((s) => (
          <i
            key={s.key}
            className={`course-point${s.inShadow ? " shadow" : ""}`}
            style={{ top: pct(s.lastY, chart.height), left: pct(s.lastX, chart.width), background: s.color }}
            aria-hidden="true"
          />
        ))}

        {chart.gridLines.map((g) => (
          <span key={g.pct} className="course-y-label" style={{ top: pct(g.y, chart.height) }}>
            {g.pct} %
          </span>
        ))}

        {chart.series.map((s) => (
          <span
            key={s.key}
            className={`course-bout${s.inShadow ? " shadow" : ""}`}
            style={{ top: pct(s.labelY, chart.height), left: pct(s.lastX, chart.width), color: s.color }}
          >
            {s.label} <b>{s.lastPct}&nbsp;%</b>
          </span>
        ))}
      </div>

      <div className="course-x">
        {chart.xLabels.map((l) => (
          <span key={l.label} style={{ left: pct(l.x, chart.width) }}>
            {l.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

