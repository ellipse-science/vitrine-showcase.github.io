"use client";

import { useState, useRef } from "react";
import type { PartiesData, RangeKey, RangeView, RowView, ChartView } from "@/lib/data/parties";
import { TOUS_MEDIAS, MEDIA_ORDER, MEDIA_DANS } from "@/lib/medias";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { DoomGame } from "@/components/interactive/DoomGame";

const RANGES: RangeKey[] = ["today", "week", "overall"];

/** Article défini de chaque parti — « LA CAQ », « LE PQ », mais « Québec
 *  solidaire » n'en prend pas. Sans ça la manchette écrit « CAQ occupe… ». */
const ARTICLE: Record<string, string> = {
  caq: "La ",
  pq: "Le ",
  plq: "Le ",
  pcq: "Le ",
  qs: "",
};

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
  return `${leader.label} domine la couverture des partis (${leader.sovPct} %) : ${tone}`;
}

export function PartisCouvertureClient({ data }: { data: PartiesData }) {
  const [range, setRange] = useState<RangeKey>("today");
  const [media, setMedia] = useState<string>(TOUS_MEDIAS);
  // Les deux platines : la dernière sélection à gauche, la précédente à droite.
  // Cliquer un canal fait donc glisser A vers B — on compare toujours les deux
  // derniers partis regardés, sans avoir à choisir un « emplacement ».
  const [platines, setPlatines] = useState<[string | null, string | null]>([null, null]);

  const chargerPlatine = (key: string) =>
    setPlatines(([a]) => (a === key ? [a, null] : [key, a]));
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
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline compact">
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

      <div className="pupitre">
        <div className="pupitre-aide">
          <InfoTip size="lg" label="Comment lire cette visualisation">
              <b>Comment lire cette visualisation :</b>
              <br />
              <br />• Chaque parti a sa <b>colonne</b>. Sa hauteur indique la place qu&apos;il
              occupe dans la couverture <i>accordée aux partis</i> — et non dans toute
              l&apos;actualité. Les cinq colonnes se partagent 100&nbsp;%.
              <br />
              <br />• Les <b>couleurs</b> comparent chaque parti à lui-même. Vert : il est dans sa
              moyenne habituelle, ou en dessous. Jaune puis rouge : ce média lui donne plus de place
              que d&apos;ordinaire.
              <br />
              <br />• Le curseur <b>Source</b> change de média. Au centre, « tous les médias » — et
              là tout est vert, puisque chaque parti y est par définition à sa propre moyenne. Les
              couleurs n&apos;apparaissent qu&apos;en choisissant un média.
              <br />
              <br />• <b>Sourdine</b> : sous 5&nbsp;% de la couverture, un parti est trop peu
              présent pour qu&apos;on puisse en tirer quelque chose. Sa colonne reste affichée, en
              gris.
              <br />
              <br />• <b>Cliquez un parti</b> pour l&apos;examiner sur l&apos;un des deux plateaux.
              <br />
              <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#partis-et-couverture`}>
                En savoir plus sur la méthodologie →
              </a>
            </InfoTip>
        </div>

      <Manchette
        rows={view.rows}
        reference={data.ranges[range].rows}
        media={media === TOUS_MEDIAS ? null : media}
        mediaLabel={data.medias.find((m) => m.id === media)?.label ?? null}
      />

      <div className="regie">
        <Platine
          cote="A"
          row={view.rows.find((r) => r.key === platines[0]) ?? null}
          moyennePct={
            data.ranges[range].rows.find((r) => r.key === platines[0])?.sovPct ?? 0
          }
        />

        <Console
          rows={view.rows}
          reference={data.ranges[range].rows}
          selection={platines}
          onSelect={chargerPlatine}
          onPcqTap={handlePcqTap}
        />

        <Platine
          cote="B"
          row={view.rows.find((r) => r.key === platines[1]) ?? null}
          moyennePct={
            data.ranges[range].rows.find((r) => r.key === platines[1])?.sovPct ?? 0
          }
        />
      </div>

      {data.medias.length > 0 && (
        <Fader
          medias={data.medias}
          valeur={media}
          onChange={setMedia}
        />
      )}

      </div>

      <section className="partis-course">
        <Course chart={source.chart} headLabel="La course jusqu'au scrutin, jour par jour" />
      </section>

      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

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

/**
 * La couleur d'un canal dit son ÉCART À LA MOYENNE, pas son niveau.
 *
 * Deux encodages distincts, donc deux informations : la HAUTEUR porte la part
 * de voix, la COULEUR porte la sur-représentation par rapport à ce que ce parti
 * obtient tous médias confondus.
 *
 * Conséquence voulue : sur « tous les médias », chaque parti est exactement à
 * sa propre moyenne, donc tout reste vert. Les couleurs ne s'allument qu'en
 * bougeant le fader — un canal part dans le rouge parce que CE média-LÀ le
 * pousse au-dessus de sa moyenne.
 */
const SEUIL_ROUGE = 1.3;

/**
 * Zone d'UN segment, d'après la part de voix qu'il représente et la moyenne du
 * parti. Le dégradé se lit donc DANS la colonne : vert jusqu'à la moyenne,
 * ambre au-dessus, rouge bien au-dessus.
 *
 * La frontière verte devient ainsi visible sans repère supplémentaire — c'est
 * exactement là où le canal dépasse ce que ce parti obtient d'habitude.
 */
function zoneSegment(i: number, moyennePct: number): "green" | "amber" | "red" {
  // On compare la BASE du segment, pas son sommet. Avec le sommet, le segment
  // le plus haut d'un canal exactement à sa moyenne dépassait celle-ci par le
  // seul effet de l'arrondi du nombre de segments allumés, et virait à l'ambre
  // — ce qui cassait la propriété « tout est vert sur tous les médias ».
  const base = (i / METER_SEGMENTS) * METER_FULL_SCALE;
  if (moyennePct <= 0) return "green"; // pas de moyenne ⇒ rien à dépasser
  if (base >= moyennePct * SEUIL_ROUGE) return "red";
  if (base >= moyennePct) return "amber";
  return "green";
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
  reference,
  selection,
  onSelect,
  onPcqTap,
}: {
  rows: RowView[];
  /** Les mêmes partis, tous médias confondus — le point de comparaison des
   *  couleurs. Identique à `rows` quand le fader est sur « tous ». */
  reference: RowView[];
  selection: [string | null, string | null];
  onSelect: (key: string) => void;
  onPcqTap: () => void;
}) {
  // L'ORDRE DES TRANCHES SUIT L'AGRÉGAT, jamais le média affiché : bouger le
  // fader ne doit pas faire sauter les partis d'une position à l'autre. Un
  // canal reste à sa place, et seul son niveau change — c'est ce qui rend la
  // comparaison entre médias lisible.
  const ordre = new Map(reference.map((r, i) => [r.key, i]));
  const tranches = rows
    .slice()
    .sort((a, b) => (ordre.get(a.key) ?? 99) - (ordre.get(b.key) ?? 99));

  // Les canaux en sourdine RESTENT sur la console : un canal muet se voit, il
  // ne disparaît pas. C'est aussi ce que montre un afficheur de table de mix.
  const tete = rows.filter((r) => !r.inShadow)[0];

  if (!tete || tete.sovPct <= 0) {
    return (
      <p className="console-vide">
        Aucun signal sur cette période — tous les canaux sont silencieux.
      </p>
    );
  }

  return (
    <section className="console" aria-label="Niveaux de couverture médiatique par parti">
      <div className="console-corps">
        <ol className="console-tranches" style={{ ["--n" as string]: tranches.length }}>
          {tranches.map((row, i) => (
            <Tranche
              key={row.key}
              row={row}
              rang={i + 1}
              total={tranches.length}
              moyennePct={reference.find((r) => r.key === row.key)?.sovPct ?? 0}
              charge={selection[0] === row.key ? "A" : selection[1] === row.key ? "B" : null}
              onSelect={onSelect}
              onPcqTap={row.key === "pcq" ? onPcqTap : undefined}
            />
          ))}
        </ol>

        {/* Graduations, à droite comme sur une tranche de console. */}
        <ul className="console-graduations" aria-hidden="true">
          {[50, 40, 30, 20, 10, 0].map((v) => (
            <li key={v} style={{ ["--v" as string]: v / METER_FULL_SCALE }}>
              {v === 20 ? <b>{v} %</b> : `${v} %`}
            </li>
          ))}
        </ul>
      </div>

    </section>
  );
}

/**
 * La manchette — ce qu'on doit comprendre sans effort, avant tout le reste.
 *
 * Le module est un instrument : on y lit des hauteurs, on les compare, on
 * remarque une position centrale. C'est riche, mais ça demande un travail. La
 * manchette dit la réponse en une phrase, et l'instrument la prouve — c'est
 * l'ordre d'un journal, pas celui d'un tableau de bord.
 *
 * Elle se réécrit quand le fader bouge : filtrée sur un média, elle nomme ce
 * média et l'écart à la moyenne, parce que c'est LÀ que se trouve l'information
 * que ce média-là apporte.
 *
 * Elle absorbe aussi le doute sur la victoire : une seule phrase éditoriale
 * plutôt que deux blocs de prose qui se disputent l'attention.
 */
function Manchette({
  rows,
  reference,
  media,
  mediaLabel,
}: {
  rows: RowView[];
  reference: RowView[];
  media: string | null;
  mediaLabel: string | null;
}) {
  const tete = rows.filter((r) => !r.inShadow)[0];
  if (!tete || tete.sovPct <= 0) return null;

  const moyenne = reference.find((r) => r.key === tete.key)?.sovPct ?? 0;
  const ratio = moyenne > 0 ? tete.sovPct / moyenne : 1;
  const ecart = Math.round((ratio - 1) * 100);

  return (
    <p className="manchette">
      {media ? (
        <>
          {(() => {
            const dans = MEDIA_DANS[media] ?? `Dans ${mediaLabel ?? media}`;
            const [tete0, ...reste] = dans.split(" ");
            return (
              <>
                {tete0}{" "}
                <b>{reste.join(" ")}</b>,{" "}
              </>
            );
          })()}
          {ARTICLE[tete.key]?.toLowerCase() ?? ""}
        </>
      ) : (
        ARTICLE[tete.key]
      )}
      <b className="manchette-parti">{tete.label}</b> occupe{" "}
      <b className="manchette-chiffre">{tete.sovPct}&nbsp;%</b> de la couverture
      accordée aux partis
      {mediaLabel && Math.abs(ecart) >= 10 && (
        <>
          {" "}—{" "}
          {/* Mêmes seuils que les segments : la manchette ne peut pas annoncer
              en rouge un écart que le vumètre montre en ambre. */}
          <span
            className={
              ecart <= 0
                ? "manchette-sous"
                : ratio > SEUIL_ROUGE
                  ? "manchette-sur-fort"
                  : "manchette-sur"
            }
          >
            {ecart > 0 ? `${ecart} % de plus` : `${Math.abs(ecart)} % de moins`}
          </span>{" "}
          que sa moyenne
        </>
      )}
      .
      {tete.toneDirection === "negative" && (
        <>
          {" "}Et on en parle surtout en mal
          <InfoTip size="sm" label="Fort ne veut pas dire bon">
            Ce module mesure un VOLUME de couverture, pas sa faveur. Un parti peut dominer parce
            qu&apos;on le critique. L&apos;adage veut qu&apos;il n&apos;y ait pas de mauvaise
            publicité — cette page ne prétend pas savoir s&apos;il a raison.
          </InfoTip>
          .
        </>
      )}
    </p>
  );
}

/**
 * Une platine — le plateau sur lequel on charge un parti pour l'examiner.
 *
 * Deux platines encadrent la console, comme deux lecteurs encadrent un mixeur.
 * Elles occupent aussi l'espace qui restait vide de part et d'autre.
 *
 * La position de l'aiguille sur le plateau porte la part de voix : plus le
 * parti occupe de place, plus l'aiguille a tourné. Ce n'est pas un ornement —
 * c'est la même donnée que la hauteur du vumètre, lue autrement.
 */
function Platine({
  cote,
  row,
  moyennePct,
}: {
  cote: "A" | "B";
  row: RowView | null;
  moyennePct: number;
}) {
  if (!row) {
    return (
      <div className={`platine vide cote-${cote}`}>
        <span className="platine-cote">{cote}</span>
        <div className="platine-plateau" aria-hidden="true">
          <i className="platine-axe" />
        </div>
        <p className="platine-vide-txt">
          Cliquez un parti pour le charger
        </p>
      </div>
    );
  }

  const ratio = moyennePct > 0 ? row.sovPct / moyennePct : 1;
  const ecart = Math.round((ratio - 1) * 100);
  // Balayage dans l'ARC SUPÉRIEUR seulement, de −52° à +52°, comme une aiguille
  // de vumètre. Un balayage large ferait pointer l'aiguille vers le BAS aux
  // valeurs hautes, ce qui se lit à contresens. Pleine échelle = 50 % de part
  // de voix, la même que les colonnes : les deux lectures ne peuvent pas se
  // contredire.
  const angle = Math.min(1, row.sovPct / METER_FULL_SCALE) * 104 - 52;

  return (
    <div className={`platine cote-${cote}`} style={{ ["--party" as string]: row.color }}>
      <span className="platine-cote">{cote}</span>

      <div className="platine-plateau" aria-hidden="true">
        <i className="platine-aiguille" style={{ transform: `rotate(${angle}deg)` }} />
        <i className="platine-axe" />
        <span className="platine-valeur">{row.sovPct}<b> %</b></span>
      </div>

      <p className="platine-nom">{row.label}</p>

      <dl className="platine-donnees">
        <div>
          <dt>Écart à sa moyenne</dt>
          <dd className={ecart > 0 ? "haut" : ecart < 0 ? "bas" : undefined}>
            {ecart > 0 ? "+" : ""}{ecart}&nbsp;%
          </dd>
        </div>
        <div>
          <dt>Sommet</dt>
          <dd>{row.peakPct}&nbsp;% <span>{formatCourt(row.peakDate)}</span></dd>
        </div>
        <div>
          <dt>Ton</dt>
          <dd className={`tone-streak tone-streak--${row.toneDirection}`}>{row.toneLabel}</dd>
        </div>
        {row.inShadow && (
          <div>
            <dt>État</dt>
            <dd>Canal coupé</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

const MOIS_COURTS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** « 2026-08-10 » → « 10 août ». Chaîne vide si la date manque. */
function formatCourt(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MOIS_COURTS[Number(m) - 1] ?? ""}`;
}

/** Une tranche : vumètre segmenté, peak hold, ruban d'identité, ton. */
function Tranche({
  row,
  rang,
  total,
  moyennePct,
  charge,
  onSelect,
  onPcqTap,
}: {
  row: RowView;
  rang: number;
  total: number;
  moyennePct: number;
  charge: "A" | "B" | null;
  onSelect: (key: string) => void;
  onPcqTap?: () => void;
}) {
  // Sourdine : DEUX segments GRIS en bas — le signal résiduel qu'affiche une
  // table de mix pour une tranche muette. Ni zéro (la tranche aurait l'air
  // absente), ni son vrai niveau (il n'est justement pas retenu comme audible).
  // Gris et non vert : le vert appartient à l'échelle des canaux qui jouent, et
  // une tranche en sourdine n'est pas sur cette échelle.
  const coupe = row.inShadow;
  const niveau = Math.min(1, row.sovPct / METER_FULL_SCALE);
  const allumes = coupe ? 2 : Math.max(1, Math.round(niveau * METER_SEGMENTS));
  // Moyenne nulle ⇒ pas d'écart calculable : on reste au vert plutôt que
  // d'inventer une sur-représentation par division par zéro.
  const ratio = moyennePct > 0 ? row.sovPct / moyennePct : 1;
  const ecart = Math.round((ratio - 1) * 100);

  return (
    <li
      className={`console-tranche${charge ? " chargee" : ""}${coupe ? " coupee" : ""}`}
      style={{ ["--ordre" as string]: positionVisuelle(rang, total) }}
    >
      {charge && (
        <span className="console-charge" aria-hidden="true">
          {charge}
        </span>
      )}
      <div
        className="console-vumetre"
        title={
          (coupe ? `${row.label} — en sourdine, sous 5 % : ` : `${row.label} — `) +
          `${row.sovPct} % de la couverture accordée aux partis (sommet : ${row.peakPct} %)` +
          (ecart === 0 ? "" : ` · ${ecart > 0 ? "+" : ""}${ecart} % par rapport à sa moyenne`)
        }
      >
        {/* Du haut vers le bas : le segment 19 est en haut de l'échelle. */}
        {Array.from({ length: METER_SEGMENTS }, (_, k) => METER_SEGMENTS - 1 - k).map((idx) => (
          <i
            key={idx}
            className={`seg ${coupe ? "mute" : zoneSegment(idx, moyennePct)}${
              idx < allumes ? " on" : ""
            }`}
            aria-hidden="true"
          />
        ))}
      </div>

      <button
        type="button"
        className="console-ruban-nom"
        style={{ ["--party" as string]: row.color }}
        onClick={() => {
          onSelect(row.key);
          onPcqTap?.();
        }}
        aria-pressed={charge !== null}
        title={`${row.label} — cliquer pour charger sur une platine`}
      >
        {row.label}
      </button>
      {coupe ? (
        <span className="console-sourdine">
          Sourdine
          <InfoTip size="sm" label="Sourdine">
            Moins de 5&nbsp;% de la couverture accordée aux partis sur la période — trop peu pour
            qu&apos;on puisse parler d&apos;une présence. Le canal reste affiché, mais muet.
          </InfoTip>
        </span>
      ) : (
        <span className={`tone-streak tone-streak--${row.toneDirection}`} title={row.toneTitle}>
          {row.toneDirection === "positive" ? "↑" : row.toneDirection === "negative" ? "↓" : "—"}
        </span>
      )}
    </li>
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

      {/* « Source » SOUS le curseur, et plus de titre du média à droite : la
          manchette nomme déjà le média en toutes lettres et le cran actif porte
          son sigle. Le répéter en gros corps disputait l'attention à la
          manchette, qui est ce qu'on doit lire en premier. */}
      <span className="fader-label">Source</span>
    </div>
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

