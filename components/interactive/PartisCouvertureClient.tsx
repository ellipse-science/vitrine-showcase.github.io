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

/**
 * Le bloc « Reprendre ces chiffres ».
 *
 * Le module sait déjà MONTRER. Il ne savait pas encore se laisser EMPORTER : un
 * journaliste qui veut citer devait relever les nombres à l'écran, reconstituer
 * la période et deviner le périmètre, avec un risque d'erreur à chaque étape.
 *
 * Trois besoins distincts, donc trois réponses :
 *   1. une PHRASE prête à citer, période et source comprises ;
 *   2. le TABLEAU complet, collable dans un tableur ;
 *   3. la PROVENANCE, pour que la citation soit exacte et non seulement rapide.
 *
 * Replié par défaut : il s'adresse à une minorité de visiteurs, et le déplier
 * est un geste que seul celui qui en a besoin fera. Le module reste plus clair
 * pour tous les autres.
 *
 * Absent quand la mesure est indisponible : on ne propose pas de reprendre des
 * chiffres qu'on refuse d'afficher.
 */
function BlocJournalistes({
  rows,
  periodeLabel,
  mediaLabel,
}: {
  rows: RowView[];
  periodeLabel: string;
  mediaLabel: string | null;
}) {
  const [copie, setCopie] = useState<"phrase" | "tableau" | null>(null);

  const tete = rows.filter((r) => !r.inShadow)[0];
  if (!tete) return null;

  const ou = mediaLabel ? `dans ${mediaLabel}` : "dans les médias québécois";
  // Nom OFFICIEL et non le sigle : c'est cette chaîne qui partira dans un
  // article, où « CAQ » sans antécédent ne se pose pas.
  const phrase =
    `${periodeLabel.charAt(0).toUpperCase()}${periodeLabel.slice(1)}, ${ou}, ` +
    `${tete.fullLabel} a occupé ${tete.sovPct} % du temps consacré aux partis politiques québécois. ` +
    `Source : Vitrine démocratique, CLESSN.`;

  // Tabulations et non virgules : collé dans un tableur, un TSV se répartit en
  // colonnes sans boîte de dialogue d'import, et aucun nom de parti n'a besoin
  // d'être protégé par des guillemets.
  const tableau = [
    ["Parti", "Part du temps (%)", "Ton", "Sommet (%)", "Date du sommet"].join("\t"),
    ...rows.map((r) =>
      [r.fullLabel, r.sovPct, r.toneLabel.replace(/[↑↓—]\s*/g, ""), r.peakPct, r.peakDate].join("\t"),
    ),
  ].join("\n");

  const copier = async (quoi: "phrase" | "tableau") => {
    try {
      await navigator.clipboard.writeText(quoi === "phrase" ? phrase : tableau);
      setCopie(quoi);
      setTimeout(() => setCopie(null), 2000);
    } catch {
      // Presse-papiers refusé (permission, contexte non sécurisé) : on ne fait
      // rien de plus, le texte reste sélectionnable à la main juste au-dessus.
    }
  };

  return (
    <details className="partis-presse">
      <summary>Reprendre ces chiffres</summary>

      <p className="partis-presse-phrase">{phrase}</p>

      <div className="partis-presse-actions">
        <button type="button" onClick={() => copier("phrase")}>
          {copie === "phrase" ? "Phrase copiée ✓" : "Copier la phrase"}
        </button>
        <button type="button" onClick={() => copier("tableau")}>
          {copie === "tableau" ? "Tableau copié ✓" : "Copier le tableau"}
        </button>
      </div>

      <ul className="partis-presse-source">
        <li>
          <b>Période&nbsp;:</b> {periodeLabel}.
        </li>
        <li>
          <b>Périmètre&nbsp;:</b> {mediaLabel ?? "l’ensemble des médias québécois suivis"}.
        </li>
        <li>
          <b>Mesure&nbsp;:</b> la part du temps de Une consacrée à chaque parti, rapportée au
          total des cinq partis québécois. Ce n&apos;est pas une intention de vote.
        </li>
        <li>
          <b>Sourdine&nbsp;:</b> sous 5&nbsp;% du temps, un parti compte trop peu pour
          qu&apos;on en tire une lecture. Sa colonne reste affichée, en gris.
        </li>
      </ul>
    </details>
  );
}

function shareTitle(data: PartiesData): string {
  const leader = data.ranges.today.rows[0];
  // `indisponible` en tête, comme partout ailleurs : ce titre part dans le
  // bouton de partage ET dans l'`aria-label`, donc il s'énonce au survol et à
  // voix haute pour les lecteurs d'écran. Sans ce test, il annonçait « c'est
  // CAQ 100 % du temps » alors que la page affiche un avis de suspension.
  if (data.indisponible || !leader || leader.sovPct === 0 || leader.inShadow) {
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
  // Les deux premiers partis sont chargés D'EMBLÉE, au lieu de deux panneaux
  // vides invitant à cliquer. Un lecteur pressé voyait auparavant deux tiers du
  // module lui demander un geste avant de rien montrer ; il voit maintenant la
  // comparaison qui l'intéresse le plus souvent, celle de la tête du
  // classement. Cliquer reste possible et remplace la sélection.
  const [platines, setPlatines] = useState<[string | null, string | null]>(() => {
    const tete = data.ranges.today.rows.filter((r) => !r.inShadow);
    return [tete[0]?.key ?? null, tete[1]?.key ?? null];
  });

  /** Un clic charge, un second retire.
   *
   *  Le geste devient réversible sans chercher de bouton de fermeture : on
   *  reclique le parti pour l'enlever. Chaque emplacement se vide SUR PLACE
   *  (l'autre ne bouge pas), parce que voir la seconde platine sauter à gauche
   *  après avoir désélectionné la première se lit comme une erreur. */
  const chargerPlatine = (key: string) =>
    setPlatines(([a, b]) => {
      if (a === key) return [null, b];
      if (b === key) return [a, null];
      return [key, a];
    });

  /** Déposer un parti sur UNE platine précise l'y met, elle et pas l'autre.
   *
   *  Le clic empile (le nouveau arrive à gauche, l'ancien glisse à droite), ce
   *  qui va bien pour comparer au fil de l'eau. Mais quand on vise une platine,
   *  on a déjà choisi où : respecter ce choix est tout l'intérêt du geste.
   *  Si le parti occupait l'autre platine, les deux s'échangent plutôt que
   *  d'apparaître en double. */
  const deposerSurPlatine = (cote: "A" | "B", key: string) =>
    setPlatines(([a, b]) => {
      if (cote === "A") return [key, b === key ? a : b];
      return [a === key ? b : a, key];
    });
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

      {/* Le marqueur de développement passe AVANT tout le reste, et il est
          volontairement laid : une capture d'écran d'un rendu sur fixtures ne
          doit pas pouvoir circuler comme si c'était le site. Il ne se rend
          jamais en production, `VITRINE_PARTIES_FIXTURES` étant absent. */}
      {data.surFixtures && (
        <p
          role="status"
          style={{
            margin: "0 0 16px",
            padding: "10px 14px",
            background: "#6B1E2A",
            color: "#F3ECDD",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 13,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Données fictives (développement)&nbsp;: ne pas diffuser
        </p>
      )}

      {data.indisponible && <AvisIndisponible info={data.indisponible} />}

      {/* La course EN TÊTE du module.
          Elle vivait sous le fader, tout en bas : le lecteur arrivait donc sur
          un instrument avant d'avoir vu qu'il y avait une course en train de se
          jouer. En tête, elle donne le mouvement d'abord et l'examen ensuite,
          ce qui est l'ordre dans lequel on lit une compétition. */}
      {!data.indisponible && !view.chart.tooShort && (
        <section className="partis-course partis-course--tete">
          <p className="course-tete">La course</p>
          <Course chart={view.chart} rows={view.rows} />
        </section>
      )}

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
              <br />• <b>Sourdine</b> : sous 5&nbsp;% du temps, un parti compte trop peu pour
              qu&apos;on puisse en tirer quelque chose. Sa colonne reste affichée, en gris.
              <br />
              <br />• <b>Cliquez un parti</b> pour l&apos;examiner en détail.
              <br />
              <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#partis-et-couverture`}>
                En savoir plus sur la méthodologie →
              </a>
            </InfoTip>
        </div>

      <div className="regie">
        <Platine
          cote="A"
          onDepot={deposerSurPlatine}
          row={view.rows.find((r) => r.key === platines[0]) ?? null}
          moyennePct={
            data.ranges[range].rows.find((r) => r.key === platines[0])?.sovPct ?? 0
          }
          indisponible={data.indisponible}
          comparaisonMedia={media !== TOUS_MEDIAS}
        />

        {/* La manchette vit DANS la colonne du milieu, collée au-dessus de la
            console. Elle était auparavant un bloc pleine largeur posé au-dessus
            de toute la régie : comme la console se trouve au fond de sa colonne,
            165 px plus bas que les platines, la phrase restait loin de
            l'instrument qu'elle commente, et l'espace au-dessus de la console
            restait vide. Ici, elle remplit cet espace et touche presque le
            cadre. */}
        <div className="regie-centre">
          <Manchette
            rows={view.rows}
            reference={data.ranges[range].rows}
            media={media === TOUS_MEDIAS ? null : media}
            mediaLabel={data.medias.find((m) => m.id === media)?.label ?? null}
            indisponible={data.indisponible}
          />
          <Console
            rows={view.rows}
            reference={data.ranges[range].rows}
            selection={platines}
            onSelect={chargerPlatine}
            onPcqTap={handlePcqTap}
            indisponible={data.indisponible}
          />
        </div>

        <Platine
          cote="B"
          onDepot={deposerSurPlatine}
          row={view.rows.find((r) => r.key === platines[1]) ?? null}
          moyennePct={
            data.ranges[range].rows.find((r) => r.key === platines[1])?.sovPct ?? 0
          }
          indisponible={data.indisponible}
          comparaisonMedia={media !== TOUS_MEDIAS}
        />
      </div>

      {/* Le mode d'emploi des platines, en clair et à leur hauteur.
          Il vivait dans l'infobulle du module, donc invisible pour qui ne
          l'ouvre pas ; et depuis que les deux platines se remplissent d'emblée,
          plus rien à l'écran ne disait qu'elles sont pilotables. Une ligne
          suffit, et elle décrit le geste réel : le clic charge à gauche et
          repousse la sélection précédente à droite. */}
      {!data.indisponible && (
        <p className="regie-aide">
          Cliquez un parti pour l&apos;examiner, ou faites-le glisser sur l&apos;un des
          deux emplacements.
        </p>
      )}

      {data.medias.length > 0 && (
        <Fader
          medias={data.medias}
          valeur={media}
          onChange={setMedia}
        />
      )}
      </div>

      {!data.indisponible && (
        <BlocJournalistes
          rows={view.rows}
          periodeLabel={data.ranges[range].periodeLabel}
          mediaLabel={media === TOUS_MEDIAS ? null : (data.medias.find((m) => m.id === media)?.label ?? null)}
        />
      )}

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
              Le modèle qui repère les partis dans les articles ne distingue pas de façon
              fiable les partis québécois les uns des autres. Le défaut n&apos;est pas
              récent&nbsp;: il touche aussi les valeurs publiées avant le{" "}
              {info.lastDateLabel}. Nous préférons ne rien afficher plutôt qu&apos;un
              classement que nous ne pourrions pas défendre. <b>Ce silence est celui de
              notre instrument, pas celui des médias.</b>
            </>
          ) : (
            <>
              Ce module n&apos;a reçu aucune donnée depuis le {info.lastDateLabel}, soit{" "}
              {info.joursDeRetard}&nbsp;jour{info.joursDeRetard > 1 ? "s" : ""}. Rien
              n&apos;est affiché&nbsp;: nous ne présentons pas une donnée périmée comme la
              couverture d&apos;aujourd&apos;hui.
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
/** 20 crans pour une pleine échelle de 100 % : un cran vaut 5 points. */
const METER_SEGMENTS = 20;
// Pleine échelle à 100 % et non 50 : le vumètre couvre désormais la TOTALITÉ du
// temps consacré aux partis, si bien qu'un canal plein veut dire « ce parti
// occupe tout ». À 50, un parti à la moitié saturait déjà l'échelle, ce qui
// exagérait les écarts en haut du classement.
const METER_FULL_SCALE = 100;

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

  // `indisponible` d'abord, AVANT de regarder s'il y a un meneur : la donnée
  // gelée contient des journées à un seul parti détecté (CAQ à 100 %, les
  // quatre autres à zéro). Elles passaient `sovPct > 0` et se rendaient donc
  // comme une part de voix, sous un bandeau qui les cautionnait. Ce n'est pas
  // une mesure : c'est un classifieur qui déclenche une fois. Tant que le
  // module est déclaré indisponible, il n'affiche AUCUN niveau — y compris
  // dans les éditions archivées, qui traversent le même chemin.
  if (indisponible || !tete || tete.sovPct <= 0) {
    // « Tous les canaux sont silencieux » n'est vrai que si l'instrument
    // fonctionne. Quand il est en panne, le dire ainsi imputerait aux médias
    // un silence qui est le nôtre — c'est le bandeau qui porte l'explication,
    // et la console se contente de constater qu'elle n'affiche rien.
    return (
      <p className="console-vide">
        {indisponible
          ? "Aucun niveau à afficher : la mesure est suspendue (voir l’avis ci-dessus)."
          : "Aucun parti n'a été détecté sur cette période."}
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
            Chaque graduation choisie est un multiple de 5 %, donc elle tombe
            exactement sur une frontière entre deux segments. */}
        <ul className="console-graduations" aria-hidden="true">
          {[100, 80, 60, 40, 20, 0].map((v) => (
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
  indisponible,
}: {
  rows: RowView[];
  reference: RowView[];
  media: string | null;
  mediaLabel: string | null;
  indisponible: Indisponibilite | null;
}) {
  // La manchette est la phrase la plus affirmative du module (« c'est de la CAQ
  // 100 % du temps », en gros et en gras). Elle doit donc être la PREMIÈRE à se
  // taire : sans ce garde, elle énonçait le classement deux blocs sous l'avis
  // qui promet de ne pas le publier.
  if (indisponible) return null;
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
  indisponible,
  comparaisonMedia,
  onDepot,
}: {
  cote: "A" | "B";
  row: RowView | null;
  moyennePct: number;
  indisponible: Indisponibilite | null;
  /** Vrai quand le fader désigne UN média : seul cas où comparer à l'ensemble
   *  des médias veut dire quelque chose. */
  comparaisonMedia: boolean;
  onDepot: (cote: "A" | "B", key: string) => void;
}) {
  const [survole, setSurvole] = useState(false);

  // Glisser-déposer natif : suffisant ici, et sans dépendance. Il ne fonctionne
  // pas au toucher, d'où le maintien du CLIC comme chemin principal — c'est lui
  // que décrit la phrase d'aide, et le seul disponible au clavier et sur
  // téléphone. Le dépôt est un raccourci pour qui vise une platine précise,
  // jamais le seul moyen d'y arriver.
  const cibleDepot = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setSurvole(true);
    },
    onDragLeave: () => setSurvole(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setSurvole(false);
      const key = e.dataTransfer.getData("text/plain");
      if (key) onDepot(cote, key);
    },
  };
  // Aujourd'hui une platine ne peut PAS se remplir sous suspension : elle part
  // à `null` et ne se charge qu'au clic sur une tranche, or la console n'en
  // affiche plus. Elle est donc sûre — mais par accident. Le garde est explicite
  // pour qu'une future sélection par défaut ne rouvre pas la fuite en silence.
  if (indisponible || !row) {
    return (
      <div
        className={`platine vide cote-${cote}${survole ? " survolee" : ""}`}
        {...(indisponible ? {} : cibleDepot)}
      >
        <div className="platine-plateau" aria-hidden="true">
          {/* Démonstration du geste, jouée en boucle sur un emplacement vide.
              Une pastille part de la gauche (là où se trouve la console) et
              vient se poser au centre du disque. Montrer le geste vaut mieux
              que l'écrire : « faites-le glisser » suppose qu'on ait compris
              qu'une tranche se saisit, ce que rien n'indiquait.
              Purement décorative, donc `aria-hidden` sur le disque : la
              consigne écrite juste en dessous porte l'information. */}
          <i className="platine-demo-cible" />
          <i className="platine-demo">Parti</i>
        </div>
        <p className="platine-vide-txt">
          Cliquez un parti, ou faites-le glisser ici
        </p>
      </div>
    );
  }

  // L'écart n'a de sens QUE si l'on regarde un média en particulier : sur
  // « tous les médias », chaque parti est à sa propre moyenne, donc l'écart vaut
  // zéro par construction. Il occupait pourtant une ligne dans la vue par
  // défaut, ce qui donnait un chiffre exact et vide de sens.
  const ecartUtile = comparaisonMedia && moyennePct > 0;
  const ecartPts = ecartUtile ? row.sovPct - moyennePct : 0;

  // Une fenêtre d'un seul jour ne peut rien dire d'une progression ni d'un
  // nombre de journées en tête : « 1 jour sur 1 » et « 0 pt » sont du bruit.
  const fenetreParlante = row.joursComptes > 1;
  return (
    <div
      className={`platine cote-${cote}${survole ? " survolee" : ""}`}
      style={{ ["--party" as string]: row.color }}
      {...cibleDepot}
    >
      {/* Le disque ne porte plus que la COULEUR : il identifie, il ne chiffre
          pas. Tous les nombres descendent dans le tableau, où ils s'alignent et
          se comparent d'une platine à l'autre. */}
      <div className="platine-plateau" aria-hidden="true" />

      <p className="platine-nom">{row.label}</p>

      {/* Un vrai <table>, et non une liste de définitions maquillée.
          Trois raisons : un lecteur d'écran annonce les couples étiquette-valeur
          comme des lignes, la sélection à la souris se colle dans un tableur en
          gardant ses colonnes (ce que demandait le besoin journaliste), et
          l'alignement des chiffres devient l'affaire du navigateur. */}
      <table className="platine-table">
        <caption className="visually-hidden">
          Chiffres de {row.fullLabel} sur la période affichée
        </caption>
        <tbody>
          <tr>
            <th scope="row">Part du temps</th>
            <td className="platine-td-cle">{row.sovPct}&nbsp;%</td>
          </tr>
          <tr>
            <th scope="row">Rang</th>
            <td>
              {row.rang}<sup>{row.rang === 1 ? "er" : "e"}</sup> sur 5
            </td>
          </tr>
          {fenetreParlante && (
            <tr>
              <th scope="row" title="Journées où ce parti a occupé le plus de temps, parmi celles que couvre la période">
                En tête
              </th>
              <td>
                {row.joursEnTete}&nbsp;jour{row.joursEnTete > 1 ? "s" : ""}{" "}
                <span>sur {row.joursComptes}</span>
              </td>
            </tr>
          )}
          {fenetreParlante && (
            <tr>
              {/* La période va dans l'étiquette et l'unité s'écrit en toutes
                  lettres : « Évolution : +7 pts » ne disait ni sur quoi ni
                  entre quand et quand. Le survol précise que la mesure compare
                  les deux bouts de la période, et non une moyenne. */}
              <th scope="row" title="Écart entre le premier et le dernier jour de la période, en points de pourcentage">
                Sur {row.joursComptes}&nbsp;j
              </th>
              <td className={row.evolutionPts > 0 ? "haut" : row.evolutionPts < 0 ? "bas" : undefined}>
                {row.evolutionPts > 0 ? "+" : ""}{row.evolutionPts}&nbsp;point
                {Math.abs(row.evolutionPts) > 1 ? "s" : ""}
              </td>
            </tr>
          )}
          {/* TOUJOURS présente, même sans média choisi.
              Les lignes qui apparaissent et disparaissent changeaient la hauteur
              du tableau, donc celle de la rangée de la régie, donc la taille du
              cadre de la console : le module bougeait à chaque clic. Un tableau
              de hauteur CONSTANTE règle la cause plutôt que de compenser après
              coup. « s. o. » dit honnêtement que la comparaison n'a pas d'objet
              tant qu'on regarde l'ensemble des médias, où chaque parti est par
              construction à sa propre moyenne. */}
          <tr>
            <th
              scope="row"
              title="Écart entre ce média et l'ensemble des médias, en points. Sans objet tant qu'aucun média n'est choisi : chaque parti est alors à sa propre moyenne."
            >
              Écart médias
            </th>
            {ecartUtile ? (
              <td className={ecartPts > 0 ? "haut" : ecartPts < 0 ? "bas" : undefined}>
                {ecartPts > 0 ? "+" : ""}{ecartPts}&nbsp;points
              </td>
            ) : (
              <td className="platine-td-so">s.&nbsp;o.</td>
            )}
          </tr>
          <tr>
            <th scope="row" title="Part du temps la plus élevée atteinte sur la fenêtre suivie">
              Sommet
            </th>
            <td>
              {row.peakPct}&nbsp;% <span>le {formatCourt(row.peakDate)}</span>
            </td>
          </tr>
          <tr>
            <th scope="row">Ton</th>
            <td className={`tone-streak tone-streak--${row.toneDirection}`}>{row.toneLabel}</td>
          </tr>
          {/* Également constante. L'ancienne ligne « État » n'existait que sous
              le seuil ; formulée comme un seuil, elle dit quelque chose dans les
              deux cas et ne fait plus varier la hauteur. */}
          <tr>
            <th scope="row" title="Sous 5 % du temps, un parti compte trop peu pour qu'on tire une lecture de ses variations">
              Seuil
            </th>
            <td className={row.inShadow ? "platine-td-so" : undefined}>
              {row.inShadow ? "Sourdine" : "Audible"}
            </td>
          </tr>
        </tbody>
      </table>

      {/* LES ENJEUX : de quoi on parle quand on parle de ce parti.
          Deux partis peuvent occuper la même place et parler de choses
          entièrement différentes — c'est la dimension que le module annonçait
          sans jamais la montrer. Une barre plutôt qu'un chiffre seul : à cinq
          lignes, l'œil compare des longueurs bien plus vite que des nombres.
          Absent tant que le croisement n'est pas publié, plutôt qu'un bloc vide
          qui laisserait croire à une panne. */}
      {row.enjeux.length > 0 && (
        <div className="platine-enjeux">
          <p className="platine-enjeux-tete">
            On en parle à propos de
            <InfoTip size="sm" label="Enjeux associés">
              Les enjeux dont il est question dans les mêmes phrases que ce parti, sur la
              dernière journée publiée. Les parts se lisent à l&apos;intérieur du parti&nbsp;:
              elles disent de quoi on parle à son sujet, pas son poids dans l&apos;actualité.
              Seuls les cinq premiers sont affichés.
            </InfoTip>
          </p>
          <ul>
            {row.enjeux.map((e) => (
              <li key={e.label}>
                <span className="platine-enjeu-nom">{e.label}</span>
                <span className="platine-enjeu-barre" aria-hidden="true">
                  <i style={{ width: `${e.pct}%`, background: row.color }} />
                </span>
                <span className="platine-enjeu-pct">{e.pct}&nbsp;%</span>
                <span className={`platine-enjeu-ton tone-streak--${e.toneDirection}`}>
                  <span aria-hidden="true">
                    {e.toneDirection === "positive" ? "↑" : e.toneDirection === "negative" ? "↓" : "–"}
                  </span>
                  <span className="visually-hidden">Ton&nbsp;: {e.toneLabel}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
      // Saisissable pour être déposé sur une platine précise. `text/plain`
      // plutôt qu'un type maison : c'est le seul format que tous les
      // navigateurs acceptent d'écrire ET de relire sans réglage.
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", row.key);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
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
        /* Un <button> n'amorce pas un glisser par défaut, et c'est justement la
           cible la plus évidente de la tranche : sans ces deux attributs, la
           moitié des tentatives de glisser échouaient sans rien dire. */
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", row.key);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => {
          onSelect(row.key);
          onPcqTap?.();
        }}
        aria-pressed={charge !== null}
        title={`${row.label}\u00a0: cliquer pour charger, recliquer pour retirer, ou glisser vers un emplacement`}
      >
        {row.label}
      </button>
      {/* « Sourdine » : le mot tient dans les 44 px de la tranche, contrairement
          à « Trop peu présent » qui débordait par-dessus ses voisines. Il reste
          le seul emprunt au vocabulaire de la table de mixage dans le texte
          visible, et c'est un choix assumé — le mot est court, connu, et dit
          l'état mieux qu'un seuil chiffré. */}
      {coupe ? (
        <span className="console-sourdine">
          Sourdine
          <InfoTip size="sm" label="Sourdine">
            Sur cette période, ce parti reçoit moins de 5&nbsp;% du temps que les médias
            consacrent aux partis. Trop peu pour qu&apos;on puisse en tirer quelque chose. Sa
            colonne reste affichée, mais sans valeur.
          </InfoTip>
        </span>
      ) : (
        <span className={`tone-streak tone-streak--${row.toneDirection}`} title={row.toneTitle}>
          <span aria-hidden="true">
            {row.toneDirection === "positive" ? "↑" : row.toneDirection === "negative" ? "↓" : "–"}
          </span>
          {/* Le ton ne tenait QUE dans une flèche colorée et un `title`. La
              flèche n'a pas de nom accessible, et `title` sur un <span> n'est ni
              atteignable au clavier ni annoncé de façon fiable : la tonalité,
              l'une des trois mesures du module, était donc muette pour un
              lecteur d'écran. Le libellé complet part maintenant dans le flux,
              masqué visuellement. */}
          <span className="visually-hidden">{row.toneTitle}</span>
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
 * « Tous les médias » n'est pas la position 0 mais le cran CENTRAL (index 3 de
 * MEDIA_ORDER), la position de repos du crossfader. Il lit la table AGRÉGÉE —
 * pas la moyenne des autres positions.
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
function Course({ chart, rows }: { chart: ChartView; rows: RowView[] }) {
  if (chart.tooShort) {
    return (
      <p className="course-vide">
        Une seule journée de données. Pas encore de tendance à lire.
      </p>
    );
  }

  const parKey = new Map(chart.series.map((s) => [s.key, s]));
  // L'ordre est celui du CLASSEMENT : on lit un tableau de position, donc le
  // premier est en haut.
  const pistes = rows.filter((r) => parKey.has(r.key));

  return (
    <figure className="course-figure">
      <ol className="course-pistes">
        {pistes.map((r, i) => {
          const s = parKey.get(r.key)!;
          return (
            <li
              key={r.key}
              className={`course-piste${r.inShadow ? " shadow" : ""}`}
              style={{ ["--party" as string]: r.color }}
            >
              <span className="course-rang">{r.rang}</span>
              <span className="course-nom">{r.label}</span>

              {/* UNE PISTE PAR PARTI, et non cinq lignes superposées.
                  Le validateur de palette échoue sur ces couleurs : PCQ et PQ
                  sont à ΔE 10,0 en vision normale, sous le plancher de 15. Cinq
                  courbes qui se croisent dans une même bande sont donc
                  illisibles par construction, et pas seulement encombrées. La
                  règle, dans ce cas, est de FACETTER plutôt que d'empiler :
                  chaque parti a sa piste et son nom, la couleur ne portant plus
                  seule l'identité.
                  L'échelle verticale reste COMMUNE (le tracé vient du même
                  calcul qu'avant) : une piste haute est vraiment plus haute. */}
              {/* La piste OCCUPE toute sa colonne, donc `preserveAspectRatio`
                  vaut « none ».
                  « xMidYMid meet » conservait le rapport 100:30 : dans une bande
                  de 26 px de haut, le tracé se réduisait à ~86 px de large,
                  centré au milieu d'une colonne vide, et l'axe des jours ne
                  correspondait plus à rien.
                  L'étirement est ici sans conséquence, contrairement à la
                  version en courbes superposées : toutes les pistes subissent
                  EXACTEMENT la même transformation, donc elles restent
                  comparables entre elles, et l'épaisseur du trait est figée par
                  `non-scaling-stroke`. C'est la convention de toute sparkline.
                  La tête est un élément HTML positionné en pourcentage, et non
                  un <circle> : sous un étirement non uniforme, un cercle SVG
                  deviendrait une ellipse. */}
              <span className="course-piste-zone">
                <svg
                  className="course-piste-svg"
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <line
                    x1={chart.finish.x}
                    x2={chart.finish.x}
                    y1="0"
                    y2={chart.height}
                    className="course-arrivee"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polyline
                    points={s.polylineSolo}
                    fill="none"
                    stroke={r.color}
                    strokeWidth="2"
                    strokeDasharray={r.inShadow ? "3 3" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className={r.inShadow ? undefined : "course-trait"}
                    style={r.inShadow ? undefined : { animationDelay: `${i * 120}ms` }}
                  />
                </svg>
                <i
                  className={`course-tete-point${r.inShadow ? " shadow" : ""}`}
                  style={{
                    left: `${((Number(s.polylineSolo.split(" ").at(-1)?.split(",")[0]) || 0) / chart.width) * 100}%`,
                    top: `${((Number(s.polylineSolo.split(" ").at(-1)?.split(",")[1]) || 0) / chart.height) * 100}%`,
                    background: r.color,
                    animationDelay: `${i * 120 + 700}ms`,
                  }}
                  aria-hidden="true"
                />
              </span>

              <span className="course-valeur">{r.sovPct}&nbsp;%</span>
              <span
                className={`course-delta${r.evolutionPts > 0 ? " haut" : r.evolutionPts < 0 ? " bas" : ""}`}
              >
                {r.evolutionPts > 0 ? "+" : ""}{r.evolutionPts}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="course-x">
        {chart.xLabels.map((l) => (
          <span key={l.label} style={{ left: `${(l.x / chart.width) * 100}%` }}>
            {l.label}
          </span>
        ))}
        <span className="course-x-arrivee" style={{ left: `${(chart.finish.x / chart.width) * 100}%` }}>
          {chart.finish.label}
        </span>
      </div>
    </figure>
  );
}
