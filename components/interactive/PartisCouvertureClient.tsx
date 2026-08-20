"use client";

import { useState, useRef } from "react";
import type { PartiesData, RangeKey, RangeView, RowView, ChartView, Indisponibilite } from "@/lib/data/parties";
import { TOUS_MEDIAS, MEDIA_ORDER, MEDIA_SIGLES, MEDIA_DANS } from "@/lib/medias";
import { couleurEnjeu } from "@/lib/enjeux";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { DoomGame } from "@/components/interactive/DoomGame";

/** L'enjeu de reste : les phrases qui nomment un parti sans qu'aucun modèle CAP
 *  ne franchisse son seuil. Il EST sélectionnable — sans lui, cocher tous les
 *  pads ne redonnerait pas la vue d'ensemble — mais il se rend à part : ce n'est
 *  pas un sujet, c'est ce qui n'en a pas.
 *
 *  ⚠️ DUPLIQUÉ à dessein, et non importé de `parties.ts`. Un import de VALEUR
 *  depuis ce module embarquerait tout son contenu dans le paquet client, y
 *  compris `node:fs/promises`, et le build échoue (« the chunking context does
 *  not support external modules »). Seuls les imports de TYPE s'effacent à la
 *  compilation. La chaîne doit rester identique ici, dans `parties.ts` et dans
 *  `radar-party-score-salient-shadow/runtime.R`. */
const SANS_ENJEU = "Aucun enjeu identifié";

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

/** La phrase que porte une colonne du vumètre, en toutes lettres.
 *
 *  Elle dit la BASE du calcul, qui est l'incompréhension la plus fréquente sur
 *  ce module : les cinq partis se partagent 100 %, pas toute l'actualité. Un
 *  pourcentage nu la laissait deviner.
 *
 *  Le même texte sert au survol ET aux lecteurs d'écran. Un `title` seul ne
 *  suffit pas : il n'est pas atteignable au clavier et son annonce est
 *  irrégulière d'un lecteur à l'autre — c'est le défaut qui rendait la tonalité
 *  muette avant 3158d9d9. */
function phraseColonne(row: RowView, ecartPts: number): string {
  const nom = `${ARTICLE[row.key] ?? ""}${row.label}`;
  const base = "de la couverture médiatique réservée aux partis politiques en Une de l'actualité";

  if (row.inShadow) {
    return (
      `${nom} est le parti dont les médias parlent le moins sur cette période\u00a0: ` +
      `${row.sovPct}\u00a0% ${base}.`
    );
  }

  // Pas de « record sur la période » ici : deux pourcentages côte à côte, l'un
  // courant et l'autre historique, se lisent comme une contradiction plutôt que
  // comme une mise en perspective.
  let phrase = `${nom} occupe ${row.sovPct}\u00a0% ${base}.`;
  if (ecartPts !== 0) {
    phrase +=
      ` Ce média lui en donne ${Math.abs(ecartPts)}\u00a0% ` +
      `${ecartPts > 0 ? "de plus" : "de moins"} que l'ensemble des médias.`;
  }
  return phrase;
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

export function PartisCouvertureClient({
  data,
  saillanceRang = 0,
}: {
  data: PartiesData;
  /** Rang de saillance de la Une du moment, 1 (très faible) → 6
   *  (exceptionnelle), 0 si la donnée manque. Ne pilote QUE le tempo des
   *  vumètres : aucune lecture n'en dépend. */
  saillanceRang?: number;
}) {
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
      : { ranges: data.ranges };
  const view: RangeView = source.ranges[range];
  const visibleRows = view.rows.filter((r) => !r.inShadow);
  const shadowRows = view.rows.filter((r) => r.inShadow);

  // Les quatre decks, dans l'ordre du classement : 1er en haut à gauche, 2e en
  // haut à droite, 3e en bas à gauche, 4e en bas à droite. L'assignation est
  // AUTOMATIQUE — il n'y a plus rien à charger ni à déposer, puisque la sourdine
  // garantit qu'il reste exactement quatre partis actifs.
  //
  // Le tableau est complété à quatre : à égalité au plus bas, deux partis
  // passent en sourdine et le dernier deck reste donc vide. Ce vide est la
  // lecture juste — il dit qu'un seul parti se disputait la dernière place.
  const decks: (RowView | null)[] = [0, 1, 2, 3].map((i) => visibleRows[i] ?? null);

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
              <br />• Chaque colonne porte la <b>couleur de son parti</b>.
              <br />
              <br />• Le curseur <b>Source</b> change de média : les hauteurs se recalculent
              sur les Unes de ce média seul.
              <br />
              <br />• <b>Sourdine</b> : le parti dont on parle le moins sur la période, quelle
              que soit sa part. Le dernier du classement y passe toujours, et sa colonne reste
              affichée sans valeur. À égalité au plus bas, les deux y passent.
              <br />
              <br />• <b>Cliquez un disque</b> pour retourner sa pochette.
              <br />
              <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#partis-et-couverture`}>
                En savoir plus sur la méthodologie →
              </a>
            </InfoTip>
        </div>

      {/* Quatre decks aux quatre coins, le vumètre entre eux.
          La colonne de gauche porte les rangs 1 et 3, celle de droite les rangs
          2 et 4 : la lecture suit l'ordre naturel de la page, le premier en haut
          à gauche. Les decks débordent volontairement au-dessus et au-dessous de
          la console — ce sont eux les objets, la console est l'instrument qui
          les mesure. */}
      <div className="regie">
        <div className="regie-flanc regie-flanc--gauche">
          <Deck row={decks[0]} rang={1} indisponible={data.indisponible} />
          <Deck row={decks[2]} rang={3} indisponible={data.indisponible} />
        </div>

        <div className="regie-centre">
          <Console
            rows={view.rows}
            reference={data.ranges[range].rows}
            onPcqTap={handlePcqTap}
            indisponible={data.indisponible}
            saillanceRang={saillanceRang}
          />
        </div>

        <div className="regie-flanc regie-flanc--droite">
          <Deck row={decks[1]} rang={2} indisponible={data.indisponible} />
          <Deck row={decks[3]} rang={4} indisponible={data.indisponible} />
        </div>
      </div>

      {data.medias.length > 0 && (
        <Fader
          medias={data.medias}
          valeur={media}
          onChange={setMedia}
        />
      )}
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
  onPcqTap,
  indisponible,
  saillanceRang,
}: {
  rows: RowView[];
  /** Les mêmes partis, tous médias confondus — le point de comparaison des
   *  couleurs. Identique à `rows` quand le fader est sur « tous ». */
  reference: RowView[];
  onPcqTap: () => void;
  /** Non nul quand la mesure elle-même est en cause : l'état vide ne peut
   *  alors plus être formulé comme un silence des médias. */
  indisponible: Indisponibilite | null;
  /** Saillance de la Une, 1 → 6. Pilote le tempo, rien d'autre. */
  saillanceRang: number;
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
    <section
      className="console"
      aria-label="Niveaux de couverture médiatique par parti"
      /* Le tempo des vumètres : 2 s quand l'actualité est très faible, 0,7 s
         quand elle est exceptionnelle. Rang 0 (donnée absente) tombe au milieu
         de l'échelle plutôt qu'à une extrémité. */
      style={{ ["--tempo" as string]: `${saillanceRang > 0 ? 2.0 - (saillanceRang - 1) * 0.26 : 1.35}s` }}
    >
      {/* Le titre vit DANS le cadre du vumètre, pas au-dessus : il nomme
          l'instrument, il ne l'introduit pas. */}
      <p className="console-tete">Part de temps passé en Une de l&apos;actualité</p>
      <div className="console-corps">
        <ol className="console-tranches" style={{ ["--n" as string]: tranches.length }}>
          {tranches.map((row, i) => (
            <Tranche
              key={row.key}
              row={row}
              rang={i + 1}
              total={tranches.length}
              moyennePct={reference.find((r) => r.key === row.key)?.sovPct ?? 0}
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

function Deck({
  row,
  rang,
  indisponible,
}: {
  row: RowView | null;
  /** Le rang affiché, de 1 à 4 — la position du deck, pas le rang du parti dans
   *  les cinq (ils coïncident, la sourdine ne retirant que la queue). */
  rang: number;
  indisponible: Indisponibilite | null;
}) {
  const [ouverte, setOuverte] = useState(false);

  /** Un deck vide n'est pas une erreur : il dit qu'il n'y avait pas de parti à
   *  ce rang, deux partis s'étant partagé la dernière place en sourdine. */
  if (indisponible || !row) {
    return (
      <div className={`deck deck--vide${indisponible ? " deck--suspendu" : ""}`}>
        <div className="deck-carre">
          <span className="deck-jog deck-jog--vide" aria-hidden="true">
            <span className="deck-jog-cap deck-jog-cap--vide" />
          </span>
        </div>
        <p className="deck-vide-txt">
          {indisponible
            ? "Mesure suspendue"
            : `Pas de ${rang}${rang === 1 ? "er" : "e"} parti audible`}
        </p>
      </div>
    );
  }

  // L'enjeu de tête, hors « Autres enjeux » : ce dernier agrège la queue de
  // distribution et ne nomme rien, donc il ne peut pas être un « enjeu clé ».
  const enjeu = row.enjeux.find((e) => !e.reste) ?? null;
  const ton = row.toneDirection;

  /* Le survol du disque annonce ce qu'on va LIRE, pas seulement le geste :
     « retourner » ne disait pas qu'il y a des chiffres derrière. */
  const annonceDisque = ouverte
    ? `Refermer la pochette de ${row.fullLabel} et revenir au disque`
    : `${row.fullLabel}, ${rang}${rang === 1 ? "er" : "e"} au classement. ` +
      `Retournez le disque pour voir combien de temps ce parti a occupé la Une, ` +
      `quelle part de la couverture il représente, et l'enjeu dont on parle le plus ` +
      `à son sujet.`;

  const pistes: [string, string][] = [
    ["Temps en Une", formatDuree(row.minutesUne)],
    ["Part de temps", `${row.sovPct} %`],
    ["Enjeu clé", enjeu?.label ?? SANS_ENJEU],
  ];

  return (
    <div
      className="deck"
      style={{
        ["--party" as string]: row.color,
        ["--enjeu" as string]: couleurEnjeu(enjeu?.label),
        ["--ton" as string]: `var(--ton-${ton})`,
      }}
    >
      <button
        type="button"
        className={`deck-carre deck-carre--pivot${ouverte ? " retournee" : ""}`}
        onClick={() => setOuverte((v) => !v)}
        aria-expanded={ouverte}
        aria-label={annonceDisque}
        title={annonceDisque}
      >
        {/* Face avant — la molette. Purement décorative : tout ce qu'elle porte
            (la couleur, donc l'identité) est déjà dit par le nom en dessous. */}
        <span className="deck-face deck-face--disque" aria-hidden="true">
          <span className="deck-jog">
            {/* Le capuchon n'est plus un aplat : il reprend la composition de la
                pochette, découpée en rond. On voit ce qu'on va retourner. */}
            <svg className="deck-jog-cap" viewBox="0 0 100 100" aria-hidden="true">
              <clipPath id={`cap-${row.key}`}>
                <circle cx="50" cy="50" r="50" />
              </clipPath>
              <g clipPath={`url(#cap-${row.key})`}>
                <rect className="forme-parti" x="0" y="0" width="100" height="100" />
                <circle className="forme-enjeu" cx="80" cy="18" r="44" />
                <path className="forme-ton" d="M0 100 L0 48 L62 100 Z" />
              </g>
              <circle className="cap-cercle" cx="50" cy="50" r="49.4" />
              <text className="cap-sigle" x="50" y="50" textAnchor="middle" dominantBaseline="central">
                {row.label}
              </text>
            </svg>
          </span>
        </span>

        {/* Face arrière — la pochette. Le fond porte le ton, le pictogramme
            l'enjeu de tête, et les trois pistes les chiffres à citer.
            `aria-hidden` suit le retournement : les deux faces coexistent dans
            le DOM, et sans cela un lecteur d'écran lirait celle qu'on ne voit
            pas. */}
        <span className="deck-face deck-face--pochette" aria-hidden={!ouverte}>
          {/* L'illustration, à la manière des Unes : des à-plats géométriques
              qui se chevauchent, en trois couleurs — le parti au fond, l'enjeu
              et le ton en formes franches. L'acronyme se pose dessus. */}
          <span className="pochette-art">
            <svg className="pochette-formes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {/* Un filet crème borde chaque forme. Sans lui, elles se perdent
                  quand leur couleur approche celle du parti : le rouge du PLQ
                  contre le rouge du ton défavorable, le bleu du PQ contre celui
                  de « Culture et nationalisme ». `non-scaling-stroke` garde le
                  filet d'épaisseur constante malgré le cadre déformé. */}
              <circle className="forme-enjeu" cx="80" cy="18" r="44" vectorEffect="non-scaling-stroke" />
              <path className="forme-ton" d="M0 100 L0 48 L62 100 Z" vectorEffect="non-scaling-stroke" />
            </svg>
            <b className="pochette-sigle">{row.label}</b>
          </span>

          <span className="deck-pistes">
            {pistes.map(([nom, valeur]) => (
              <span className="deck-piste" key={nom}>
                <span className="deck-piste-nom">{nom}</span>
                {/* Les pointillés vivent ENTRE le titre et la valeur, comme au
                    dos d'un disque, et non sous le titre. */}
                <i className="deck-piste-fil" aria-hidden="true" />
                <span className="deck-piste-val" title={valeur}>
                  {valeur}
                </span>
              </span>
            ))}
            {/* Le ton n'est plus qu'une couleur sur la pochette. Il reste
                énonçable pour les lecteurs d'écran, qui ne voient aucune
                couleur : sans cela l'information disparaîtrait pour eux. */}
            <span className="visually-hidden">Ton de la couverture : {row.toneLabel}</span>
          </span>
        </span>
      </button>

      <p className="deck-nom">
        <span className="deck-rang">{rang}</span>
        {row.label}
      </p>
    </div>
  );
}

/** Une durée en heures collées : `4h12`, `4h`, `45 min`.
 *
 *  Sans espace autour du `h`. Le guide de rédaction est explicite là-dessus et
 *  l'assume comme un écart à l'OQLF : « L'OQLF dit d'en mettre, mais on ne le
 *  fait pas. » Cette fonction écrivait `4 h 12`. */
function formatDuree(minutes: number): string {
  if (minutes < 60) return `${minutes}\u00a0min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
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
  onPcqTap,
}: {
  row: RowView;
  rang: number;
  total: number;
  moyennePct: number;
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
  /** Le rang d'un segment dans la tête du vumètre, de 1 (le plus bas des trois)
   *  à 3 (le sommet), ou 0 s'il n'en fait pas partie.
   *
   *  Les trois derniers segments allumés vacillent comme la tête d'un vrai
   *  vumètre : le sommet plonge fort et souvent, les deux du dessous de moins en
   *  moins. Leurs durées sont volontairement incommensurables, pour qu'ils ne se
   *  resynchronisent jamais — c'est ce désaccord qui fait vivant plutôt que
   *  clignotant. Le mouvement ne mesure rien.
   *
   *  Jamais sur un canal en SOURDINE — un canal muet qui se charge annoncerait
   *  une activité qu'il n'a justement pas. Et jamais plus de segments qu'il n'y
   *  en a d'allumés : sous trois, la cascade se raccourcit au lieu de déborder
   *  sur des segments éteints. */
  const debutVu = Math.max(0, allumes - 3);
  const vu = (i: number) =>
    !coupe && i < allumes && i >= debutVu ? i - debutVu + 1 : 0;

  const ratio = moyennePct > 0 ? row.sovPct / moyennePct : 1;
  const ecart = Math.round((ratio - 1) * 100);
  const phrase = phraseColonne(row, ecart);

  return (
    <li
      className={`console-tranche${coupe ? " coupee" : ""}`}
      style={{
        ["--ordre" as string]: positionVisuelle(rang, total),
        ["--party" as string]: row.color,
      }}
    >
      <div className="console-vumetre" title={phrase}>
        <span className="visually-hidden">{phrase}</span>
        {/* Du haut vers le bas : le segment 19 est en haut de l'échelle. */}
        {Array.from({ length: METER_SEGMENTS }, (_, k) => METER_SEGMENTS - 1 - k).map((idx) => (
          <i
            key={idx}
            className={
              `seg${coupe ? " mute" : ""}${idx < allumes ? " on" : ""}` +
              (vu(idx) ? ` vu vu--${vu(idx)}` : "")
            }
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Le ruban n'est plus une commande : les decks se remplissent seuls, par
          rang. Un <button> annoncerait donc aux lecteurs d'écran un contrôle
          qui ne fait rien. Le clic ne sert plus qu'au jeu caché, volontairement
          hors du parcours clavier. */}
      <span className="console-ruban-nom" onClick={() => onPcqTap?.()}>
        {row.label}
      </span>
      {/* « Sourdine » : le mot tient dans les 44 px de la tranche, contrairement
          à « Trop peu présent » qui débordait par-dessus ses voisines. Il reste
          le seul emprunt au vocabulaire de la table de mixage dans le texte
          visible, et c'est un choix assumé — le mot est court, connu, et dit
          l'état mieux qu'un rang.

          La flèche de ton qui occupait l'autre branche est retirée : le ton vit
          désormais sur la pochette, et une seule fois. */}
      {coupe && (
        <span className="console-sourdine">
          Sourdine
          <InfoTip size="sm" label="Sourdine">
            C&apos;est le parti dont les médias parlent le MOINS sur cette période. Le
            dernier du classement passe toujours en sourdine, quelle que soit sa part,
            et sa colonne reste affichée sans valeur. En cas d&apos;égalité au plus bas,
            les deux y passent.
          </InfoTip>
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
              title={
                p.id === TOUS_MEDIAS
                  ? "Tous les médias réunis, chacun pesé selon son temps de Une"
                  : /* `MEDIA_DANS` est capitalisé pour OUVRIR une phrase
                       (« Dans Le Devoir, … ») : en milieu de phrase il faut
                       décapitaliser la préposition, sinon on lit « les Unes
                       Dans Le Devoir ». Seule la première lettre bouge — le
                       titre du quotidien garde la sienne. */
                    `Ne montrer que les Unes ${
                      MEDIA_DANS[p.id]
                        ? MEDIA_DANS[p.id].charAt(0).toLowerCase() + MEDIA_DANS[p.id].slice(1)
                        : `de ${p.label}`
                    }`
              }
            >
              <i />
              <b>{p.id === TOUS_MEDIAS ? "tous" : (MEDIA_SIGLES[p.id] ?? p.id)}</b>
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
