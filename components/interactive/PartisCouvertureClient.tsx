"use client";

import { useState, useRef } from "react";
import type { PartiesData, RangeKey, RangeView, RowView, ChartView, Indisponibilite } from "@/lib/data/parties";
import { TOUS_MEDIAS, MEDIA_ORDER, MEDIA_SIGLES, MEDIA_DANS, MEDIA_DE } from "@/lib/medias";
import { couleurEnjeu } from "@/lib/enjeux";
import { formatDuree } from "@/lib/duree";
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

      {/* Le palmarès EN TÊTE du module : le mouvement d'abord, l'examen
          ensuite, ce qui est l'ordre dans lequel on lit un classement. */}
      {!data.indisponible && !data.ranges[range].chart.tooShort && (
        <section className="partis-course partis-course--tete">
          <p className="course-tete">Le palmarès, en minutes de Une</p>
          {/* Le palmarès lit TOUJOURS l'agrégat, quelle que soit la position
              du fader : c'est une course entre partis, pas entre médias. Le
              curseur ne commande que le vumètre. */}
          <Palmares chart={data.ranges[range].chart} rows={data.ranges[range].rows} />
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
            media={media}
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
  media,
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
  /** Le média affiché, ou `TOUS_MEDIAS`. Le titre le nomme. */
  media: string;
}) {
  // L'ORDRE DES TRANCHES SUIT L'AGRÉGAT, jamais le média affiché : bouger le
  // fader ne doit pas faire sauter les partis d'une position à l'autre. Un
  // canal reste à sa place, et seul son niveau change — c'est ce qui rend la
  // comparaison entre médias lisible.
  /* Le titre nomme la SOURCE : bouger le fader change ce qu'on mesure, et un
     titre qui ne bouge pas laisse croire qu'on lit encore l'ensemble.
     La forme génitive ne se déduit pas du libellé — « de Le Devoir » est
     fautif — d'où la table `MEDIA_DE`. */
  const titre =
    media === TOUS_MEDIAS
      ? "Part de temps passé en Une de l\u2019actualité"
      : `Part de temps passé en Une ${MEDIA_DE[media] ?? `de ${media}`}`;

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
      <p className="console-tete">{titre}</p>
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

  const pistes: [string, string, string?][] = [
    ["Temps en Une", formatDuree(row.minutesUne)],
    ["Part de temps", `${row.sovPct} %`],
    ["Enjeu clé", enjeu?.label ?? SANS_ENJEU],
    // Le troisième champ est la forme COURTE, servie sur téléphone où la
    // pochette n'a pas la largeur du libellé entier. Les deux sont dans le DOM
    // et le CSS choisit : un lecteur d'écran entend donc toujours le libellé
    // complet, quelle que soit la taille de l'écran.
    ["Ton de la couverture", row.toneLabel, "Ton"],
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
            {pistes.map(([nom, valeur, court]) => (
              <span className="deck-piste" key={nom}>
                <span className="deck-piste-nom">
                  {court ? (
                    <>
                      <span className="piste-long">{nom}</span>
                      <span className="piste-court" aria-hidden="true">{court}</span>
                    </>
                  ) : (
                    nom
                  )}
                </span>
                {/* Les pointillés vivent ENTRE le titre et la valeur, comme au
                    dos d'un disque, et non sous le titre. */}
                <i className="deck-piste-fil" aria-hidden="true" />
                <span className="deck-piste-val" title={valeur}>
                  {valeur}
                </span>
              </span>
            ))}
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
 * Le palmarès — les cinq partis sur UN seul graphique, en minutes de Une.
 *
 * L'axe des X est celui de l'onglet (heures, jours, dates) ; l'axe des Y porte
 * des durées, sur une échelle commune aux cinq. C'est la comparaison des durées
 * qui fait le palmarès : « la CAQ a occupé 2 h 15 » se cite, un pourcentage
 * oblige le lecteur à faire le calcul.
 *
 * ⚠️ Les cinq courbes partagent la même bande, et le validateur de palette
 * ÉCHOUE sur ces couleurs : QS et le PLQ sont à ΔE 10,9 en vision normale, sous
 * le plancher de 15 — deux lecteurs sur trois les confondront à l'œil. Les
 * couleurs des partis ne sont pas réétalonnables. C'est pourquoi le NOM de
 * chaque parti est écrit au bout de sa courbe : c'est lui qui porte l'identité,
 * la couleur ne fait que la rappeler.
 *
 * La zone est étirée (`preserveAspectRatio="none"`) pour occuper toute la
 * largeur du module. Les têtes de courbe sont donc des éléments HTML placés en
 * pourcentage, et non des formes SVG : sous un étirement non uniforme, un carré
 * SVG deviendrait un rectangle.
 */
function Palmares({ chart, rows }: { chart: ChartView; rows: RowView[] }) {
  if (chart.tooShort) {
    return (
      <p className="course-vide">
        {chart.raison === "sans-detail-horaire"
          ? "Le détail heure par heure n'existe que pour l'ensemble des médias. Ramenez le curseur au centre pour suivre la journée."
          : "Une seule journée de données. Pas encore de tendance à lire."}
      </p>
    );
  }

  const parKey = new Map(rows.map((r) => [r.key, r]));
  // De haut en bas : le plus de minutes en premier, comme un classement.
  const series = chart.series.slice().sort((a, b) => b.lastMinutes - a.lastMinutes);

  /* Mettre un parti EN VEDETTE : les autres s'effacent sans disparaître.
   *
   *  C'est ce qui rend la course jouable — on suit un coureur du regard — et
   *  c'est aussi ce qui rattrape la faiblesse mesurée de la palette : QS et le
   *  PLQ sont à ΔE 10,9 en vision normale, sous le plancher de 15. Tant que les
   *  cinq courbes se croisent, la couleur seule ne les sépare pas ; isolée, la
   *  courbe ne se confond avec rien.
   *
   *  Deux entrées : le SURVOL, qui ne fait que prévisualiser, et le CLIC, qui
   *  fixe. Le survol l'emporte tant qu'il dure, sinon on ne pourrait plus rien
   *  regarder d'autre sans d'abord relâcher sa sélection. */
  const [isole, setIsole] = useState<string | null>(null);
  const [survole, setSurvole] = useState<string | null>(null);
  const vedette = survole ?? isole;

  /* La période est-elle COURUE ? Le dernier point a-t-il atteint la ligne
     d'arrivée — 20h pour la journée, la fin de semaine, le jour du scrutin.
     C'est là seulement qu'on peut désigner un gagnant. */
  const termine = series.length > 0 && series[0].lastX >= chart.finish.x - 0.5;
  const gagnant = termine ? series[0] : null;

  return (
    <figure className={`palmares-figure${vedette ? " a-vedette" : ""}`}>
      <div className="palmares-corps">
        <div className="palmares-zone">
          <svg
            className="palmares-svg"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {chart.yLabels.map((g) => (
              <line key={g.label} className="palmares-grille" x1="0" x2={chart.width} y1={g.y} y2={g.y} />
            ))}
            {/* Le sol. Sans lui les courbes flottaient : le zéro n'a pas de
                graduation, c'est ce trait qui le dit. */}
            <line
              className="palmares-base"
              x1="0"
              x2={chart.width}
              y1={chart.height}
              y2={chart.height}
            />
            {/* La ligne d'ARRIVÉE : le vide à sa gauche est ce qu'il reste à
                courir. C'est elle qui fait de la mesure une course. */}
            <line
              className="palmares-arrivee"
              x1={chart.finish.x}
              x2={chart.finish.x}
              y1="0"
              y2={chart.height}
            />
            {series.map((s, i) => (
              <polyline
                key={s.key}
                className={
                  `palmares-trait${s.inShadow ? " shadow" : ""}` +
                  (vedette === s.key ? " vedette" : "") +
                  (i === 0 ? " meneur" : "")
                }
                points={s.polylineMin}
                style={{
                  ["--party" as string]: s.color,
                  ["--retard" as string]: `${(series.length - 1 - i) * 110}ms`,
                }}
              />
            ))}
            {/* Bande de SAISIE, large et invisible : un trait fin ne se vise pas
                à la souris. Le clavier passe par la liste, pas par ici. */}
            {series.map((s) => (
              <polyline
                key={`touche-${s.key}`}
                className="palmares-touche"
                points={s.polylineMin}
                onMouseEnter={() => setSurvole(s.key)}
                onMouseLeave={() => setSurvole(null)}
                onClick={() => setIsole((k) => (k === s.key ? null : s.key))}
              />
            ))}
          </svg>

          {/* Du DERNIER au premier : deux partis proches en minutes ont leurs
              pochettes à quelques pixels l'une de l'autre, et c'est le dernier
              dessiné qui passe dessus. Le meneur doit être celui-là. */}
          {series
            .slice()
            .reverse()
            .map((s) => (
            <i
              key={s.key}
              className={
                `palmares-pochette${s.inShadow ? " shadow" : ""}` +
                (vedette === s.key ? " vedette" : "")
              }
              style={{
                ["--party" as string]: s.color,
                left: `${(s.lastX / chart.width) * 100}%`,
                top: `${(s.lastYMin / chart.height) * 100}%`,
              }}
              aria-hidden="true"
            />
            ))}

          <i
            className="palmares-damier"
            style={{ left: `${(chart.finish.x / chart.width) * 100}%` }}
            aria-hidden="true"
          />

          <ul className="palmares-y" aria-hidden="true">
            {chart.yLabels.map((g) => (
              <li key={g.label} style={{ top: `${(g.y / chart.height) * 100}%` }}>
                {g.label}
              </li>
            ))}
          </ul>
        </div>

        {/* LE CLASSEMENT, en colonne fixe à droite.
            Les noms vivaient au bout des courbes, écartés par un jeu exprimé en
            unités de viewBox : l'écart valait 14 % de la hauteur, soit 26 px
            dans une zone de 190 mais 17 px dès qu'on l'aplatit. Ils se
            chevauchaient PAR CONSTRUCTION, et aplatir ne pouvait qu'empirer.
            Une colonne ne dépend d'aucune hauteur. */}
        <div className="palmares-classement">
          {gagnant && (
            <div
              className="palmares-gagnant"
              style={{ ["--party" as string]: gagnant.color }}
            >
              <i className="palmares-gagnant-album" aria-hidden="true" />
              <span className="palmares-gagnant-txt">
                <span className="palmares-gagnant-nom">{gagnant.label}</span>
                <b>{formatDuree(gagnant.lastMinutes)}</b> d&apos;écoute
              </span>
            </div>
          )}

          <ol className="palmares-liste">
            {series.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  className={
                    `palmares-nom${s.inShadow ? " shadow" : ""}` +
                    (vedette === s.key ? " vedette" : "")
                  }
                  style={{ ["--party" as string]: s.color }}
                  onMouseEnter={() => setSurvole(s.key)}
                  onMouseLeave={() => setSurvole(null)}
                  onFocus={() => setSurvole(s.key)}
                  onBlur={() => setSurvole(null)}
                  onClick={() => setIsole((k) => (k === s.key ? null : s.key))}
                  aria-pressed={isole === s.key}
                  title={
                    `${parKey.get(s.key)?.fullLabel ?? s.label} : ` +
                    `${formatDuree(s.lastMinutes)} de Une cumulées sur la période. ` +
                    `Cliquez pour ne garder que cette courbe.`
                  }
                >
                  <i className="palmares-rang">{i + 1}</i>
                  <span className="palmares-sigle">{s.label}</span>
                  <b className="palmares-duree">{formatDuree(s.lastMinutes)}</b>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Le repère d'arrivée MARQUE celui qui existe déjà, au lieu d'en poser
          un second : `xLabels` porte un point à l'abscisse de l'arrivée sur les
          deux vues (« 20h » sur la journée, le dernier jour sur les autres), et
          en ajouter un l'écrivait exactement par-dessus. On ne l'ajoute que si
          aucun ne coïncide. */}
      <ul className="palmares-x" aria-hidden="true">
        {chart.xLabels.map((l) => (
          <li
            key={l.label}
            className={Math.abs(l.x - chart.finish.x) < 0.5 ? "palmares-x-arrivee" : undefined}
            style={{ left: `${(l.x / chart.width) * 100}%` }}
          >
            {l.label}
          </li>
        ))}
        {!chart.xLabels.some((l) => Math.abs(l.x - chart.finish.x) < 0.5) && (
          <li
            className="palmares-x-arrivee"
            style={{ left: `${(chart.finish.x / chart.width) * 100}%` }}
          >
            {chart.finish.label}
          </li>
        )}
      </ul>
    </figure>
  );
}