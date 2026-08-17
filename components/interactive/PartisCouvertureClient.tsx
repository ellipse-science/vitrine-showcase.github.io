"use client";

import { useState, useRef } from "react";
import type { PartiesData, RangeKey, RangeView, RowView, ChartView, Indisponibilite } from "@/lib/data/parties";
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
    return "De quel parti parle-t-on dans les médias?";
  }
  const tone =
    leader.toneDirection === "positive"
      ? "on en parle en bien"
      : leader.toneDirection === "negative"
        ? "on en parle en mal"
        : "l'important, c'est qu'on en parle";
  return `Quand les médias parlent d'un parti, c'est ${leader.label} ${leader.sovPct}\u00a0% du temps\u00a0: ${tone}`;
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
      : { ranges: data.ranges };
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
          <h2 className="partis-title">De quel parti parle-t-on dans les médias?</h2>
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

      {data.indisponible && <AvisIndisponible info={data.indisponible} />}

      <div className="pupitre">
        <div className="pupitre-aide">
          <InfoTip size="lg" label="Comment lire cette visualisation">
              <b>Comment lire cette visualisation&nbsp;:</b>
              <br />
              <br />• Chaque parti a sa <b>colonne</b>. Sa hauteur indique la part du temps que
              les médias lui consacrent <i>quand ils parlent d&apos;un parti</i>, et non sur
              l&apos;ensemble de l&apos;actualité, où les partis occupent une place bien plus
              petite. Les cinq colonnes se partagent 100&nbsp;%.
              <br />
              <br />• Les <b>couleurs</b> comparent un média à l&apos;ensemble des médias. Vert :
              ce média donne à ce parti autant de temps que les autres, ou moins. Jaune puis rouge :
              il lui en donne davantage.
              <br />
              <br />• Le curseur <b>Source</b> change de média. Au centre, «&nbsp;tous les médias&nbsp;»&nbsp;: là
              tout est vert, puisqu&apos;il n&apos;y a rien à comparer. Les couleurs
              n&apos;apparaissent qu&apos;en choisissant un média en particulier.
              <br />
              <br />• <b>Sourdine</b> : sous 5&nbsp;% du temps, un parti est trop peu présent pour
              qu&apos;on puisse en tirer quelque chose. Sa colonne reste affichée, en gris.
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
          indisponible={data.indisponible}
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


        {/* La course vit DANS le pupitre : c'est le même appareil, et la
            séparer par un filet la faisait lire comme un second module. */}
        <section className="partis-course">
          <p className="course-tete">La tendance</p>
          <Course chart={view.chart} />
        </section>
      </div>

      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

/**
 * Le module n'a rien à affirmer — et il le dit.
 *
 * Placé AVANT le pupitre, pas après : le lecteur doit savoir ce qu'il regarde
 * avant de lire des colonnes à zéro, sinon il en tire une conclusion (« on ne
 * parle pas des partis ») que la donnée ne permet pas.
 *
 * Le module reste affiché plutôt que d'être masqué. Le retirer effacerait
 * l'information la plus utile du moment : que la mesure existe, qu'elle est
 * en panne, et pourquoi.
 *
 * Vocabulaire visuel repris du bandeau d'archive (`.archive-notice`) : pastille
 * cordovan et filets fins, sans barre latérale ni ombre portée — le site emploie
 * déjà cet idiome pour signaler un état, et Adrien avait écarté les autres.
 */
function AvisIndisponible({ info }: { info: Indisponibilite }) {
  const recalibrage = info.raison === "recalibrage";
  return (
    <div className="partis-avis" role="status">
      <p className="partis-avis-line">
        <span className="partis-avis-tag">
          {recalibrage ? "Mesure suspendue" : "Données périmées"}
        </span>
        <span className="partis-avis-body">
          {recalibrage ? (
            <>
              Le modèle qui repère les partis dans les articles est en cours de
              recalibration&nbsp;: il ne reconnaît plus les partis québécois. Aucune
              détection n&apos;est publiée depuis le {info.lastDateLabel}, et les colonnes
              ci-dessous restent donc à zéro. <b>Ce silence est celui de notre instrument,
              pas celui des médias.</b>
            </>
          ) : (
            <>
              Ce module n&apos;a reçu aucune donnée depuis le {info.lastDateLabel}, soit{" "}
              {info.joursDeRetard}&nbsp;jour{info.joursDeRetard > 1 ? "s" : ""}. Ce qui suit
              décrit cette date-là, pas la couverture d&apos;aujourd&apos;hui.
            </>
          )}
        </span>
      </p>
      <a
        className="partis-avis-lien"
        href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#partis-et-couverture`}
      >
        En savoir plus →
      </a>
    </div>
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
/** 20 crans pour une pleine échelle de 50 % : un cran vaut 2,5 points. */
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
  indisponible,
}: {
  rows: RowView[];
  /** Les mêmes partis, tous médias confondus — le point de comparaison des
   *  couleurs. Identique à `rows` quand le fader est sur « tous ». */
  reference: RowView[];
  selection: [string | null, string | null];
  onSelect: (key: string) => void;
  onPcqTap: () => void;
  /** Non nul quand la mesure elle-même est en cause : l'état vide ne peut
   *  alors plus être formulé comme un silence des médias. */
  indisponible: Indisponibilite | null;
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
    // « Tous les canaux sont silencieux » n'est vrai que si l'instrument
    // fonctionne. Quand il est en panne, le dire ainsi imputerait aux médias
    // un silence qui est le nôtre — c'est le bandeau qui porte l'explication,
    // et la console se contente de constater qu'elle n'affiche rien.
    return (
      <p className="console-vide">
        {indisponible
          ? "Aucun niveau à afficher : la mesure est suspendue (voir l’avis ci-dessus)."
          : "Aucun signal sur cette période. Tous les canaux sont silencieux."}
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

        {/* Graduations, à droite comme sur une tranche de console.
            `--n` est le NOMBRE DE SEGMENTS sous le repère, pas une fraction de
            hauteur : les segments sont séparés par des gouttières, donc la
            pile n'est pas linéaire et une position en pourcentage tombe à côté.
            Chaque graduation choisie est un multiple de 2,5 %, donc elle tombe
            exactement sur une frontière entre deux segments. */}
        <ul className="console-graduations" aria-hidden="true">
          {[50, 40, 30, 20, 10, 0].map((v) => (
            <li
              key={v}
              style={{ ["--n" as string]: (v / METER_FULL_SCALE) * METER_SEGMENTS }}
            >
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

  return (
    <div className="manchette-zone">
    <p className="manchette">
      {media ? (
        <>
          {(() => {
            const dans = MEDIA_DANS[media] ?? `Dans ${mediaLabel ?? media}`;
            const [premier, ...reste] = dans.split(" ");
            return (
              <>
                {premier} <b>{reste.join(" ")}</b>,{" "}
              </>
            );
          })()}
          quand on parle d&apos;un parti, c&apos;est{" "}
          {(ARTICLE[tete.key] ?? "").replace("La ", "de la ").replace("Le ", "du ") || "de "}
        </>
      ) : (
        <>
          Quand les médias parlent d&apos;un parti, c&apos;est{" "}
          {(ARTICLE[tete.key] ?? "").replace("La ", "de la ").replace("Le ", "du ") || "de "}
        </>
      )}
      <b className="manchette-parti">{tete.label}</b>{" "}
      <b className={`manchette-chiffre${media && tete.sovPct !== moyenne ? (tete.sovPct > moyenne ? (ratio > SEUIL_ROUGE ? " sur-fort" : " sur") : " sous") : ""}`}>
        {tete.sovPct}&nbsp;% du temps
      </b>
      {media && tete.sovPct !== moyenne && (
        <>
          , contre <b>{moyenne}&nbsp;%</b>{" "}
          dans l&apos;ensemble des médias
        </>
      )}
      .
      {tete.toneDirection === "negative" && (
        <>
          {" "}Et on en parle surtout en mal
          <InfoTip size="sm" label="Beaucoup parler n'est pas bien parler">
            Ce module compte le TEMPS que les médias consacrent à chaque parti, pas s&apos;ils en
            disent du bien. Un parti peut être le plus présent parce qu&apos;on le critique.
          </InfoTip>
          .
        </>
      )}
    </p>
    </div>
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
          <dt>Écart aux autres médias</dt>
          <dd className={ecart > 0 ? "haut" : ecart < 0 ? "bas" : undefined}>
            {ecart > 0 ? "+" : ""}{ecart}&nbsp;%
          </dd>
        </div>
        <div>
          <dt>Record</dt>
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
          (coupe ? `${row.label}, en sourdine, sous 5\u00a0%\u00a0: ` : `${row.label}\u00a0: `) +
          `${row.sovPct}\u00a0% du temps consacré aux partis (record de la période\u00a0: ${row.peakPct}\u00a0%)` +
          (ecart === 0 ? "" : ` · ${ecart > 0 ? "+" : ""}${ecart}\u00a0% par rapport à l'ensemble des médias`)
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
        title={`${row.label}\u00a0: cliquer pour charger sur une platine`}
      >
        {row.label}
      </button>
      {coupe ? (
        <span className="console-sourdine">
          Sourdine
          <InfoTip size="sm" label="Sourdine">
            Sur cette période, ce parti reçoit moins de 5&nbsp;% du temps que les médias
            consacrent aux partis. Trop peu pour qu&apos;on puisse en tirer quelque chose. Sa
            colonne reste affichée, mais muette.
          </InfoTip>
        </span>
      ) : (
        <span className={`tone-streak tone-streak--${row.toneDirection}`} title={row.toneTitle}>
          {row.toneDirection === "positive" ? "↑" : row.toneDirection === "negative" ? "↓" : "–"}
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
              /* La poignée native ne va pas de 0 à 100 % : elle est rentrée
                 d'une demi-largeur à chaque bout pour rester dans la piste. Les
                 crans suivent la même course, sinon la tirette ne tomberait pas
                 dessus. --pouce porte cette largeur, définie en CSS. */
              style={{
                left: `calc(var(--pouce) / 2 + ${
                  i / (positions.length - 1)
                } * (100% - var(--pouce)))`,
              }}
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
 * La course — épurée jusqu'à la tendance.
 *
 * Ni grille, ni graduations, ni fond dégradé : l'objectif est de VOIR une
 * direction, pas de lire une valeur au pixel près. Les valeurs sont écrites en
 * toutes lettres au bout de chaque ligne, là où l'œil arrive naturellement.
 *
 * La LIGNE D'ARRIVÉE change avec l'onglet — 20 h aujourd'hui, vendredi 20 h,
 * le jour du scrutin. Le vide entre la dernière donnée et elle est l'espace
 * qu'il reste à courir.
 */
function Course({ chart }: { chart: ChartView }) {
  if (chart.tooShort) {
    return (
      <p className="course-vide">
        Une seule journée de données. Pas encore de tendance à lire.
      </p>
    );
  }

  const pct = (v: number, max: number) => `${(v / max) * 100}%`;

  return (
    <figure className="course-figure">
      <div className="course-cadre">
        <svg
          className="course-svg"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {chart.series.map((s) => (
            <polyline
              key={s.key}
              points={s.polyline}
              fill="none"
              stroke={s.color}
              strokeWidth={s.inShadow ? 1 : 1.5}
              strokeDasharray={s.inShadow ? "2 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={s.inShadow ? 0.45 : 1}
            />
          ))}

          <line
            x1={chart.finish.x}
            x2={chart.finish.x}
            y1="0"
            y2={chart.height}
            className="course-arrivee"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {chart.series.map((s) => (
          <i
            key={s.key}
            className={`course-point${s.inShadow ? " shadow" : ""}`}
            style={{ top: pct(s.lastY, chart.height), left: pct(s.lastX, chart.width), background: s.color }}
            aria-hidden="true"
          />
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

        <span className="course-arrivee-label" style={{ left: pct(chart.finish.x, chart.width) }}>
          {chart.finish.label}
          <b>{chart.finish.sub}</b>
        </span>
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
