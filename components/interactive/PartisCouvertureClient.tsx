"use client";

import { useState, useRef } from "react";
import type { PartiesData, PartyKey, RangeKey, RangeView, RowView, ChartView, Indisponibilite } from "@/lib/data/parties";
import { TOUS_MEDIAS, MEDIA_ORDER, MEDIA_PANEL_QC, MEDIA_SIGLES, MEDIA_DANS, MEDIA_DE, MEDIA_LABELS } from "@/lib/medias";
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
/** Quand le fader quitte le centre, le raffineur ne croise pas parti × enjeu ×
 *  média : il n'y a rien à afficher, mais ce n'est PAS « aucun enjeu ». Dire la
 *  limite de la mesure plutôt qu'inventer un fait sur la couverture. */
const ENJEU_NON_VENTILE = "Non ventilé par média";

// Doom RETIRÉ DE PROD, gardé sur dev (décision du 2026-08-20) : l'easter egg
// des partis reste un jeu d'équipe, pas une porte du site public. Même signal
// d'environnement que `app/robots.ts`, `lib/data/parties.ts` et les retraits
// de #544 — un seul signal, pas de divergence. Flappy Enjeux n'est PAS visé :
// il reste accessible en prod, c'est le seul jeu autorisé en ligne.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

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
  editionKey,
}: {
  data: PartiesData;
  /** Rang de saillance de la Une du moment, 1 (très faible) → 6
   *  (exceptionnelle), 0 si la donnée manque. Ne pilote QUE le tempo des
   *  vumètres : aucune lecture n'en dépend. */
  saillanceRang?: number;
  /** L'édition affichée, pour la carte de partage du module (venu de main
   *  avec #partage-cartes). Absent sur l'accueil. */
  editionKey?: string;
}) {
  const [range, setRange] = useState<RangeKey>("today");
  const [media, setMedia] = useState<string>(TOUS_MEDIAS);
  const [showDoom, setShowDoom] = useState(false);
  /** La pochette SORTIE du bac, ou `null` quand le bac est refermé. L'état vit
   *  ici et non dans le bac : c'est un clic sur un DECK qui la sort, et les
   *  deux composants sont frères. */
  const [pochette, setPochette] = useState<PartyKey | null>(null);
  const pcqTapRef = useRef({ count: 0, lastTime: 0 });

  const handlePcqTap = () => {
    if (isProd) return;
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
  const mediaLabel =
    media === TOUS_MEDIAS ? null : (data.medias.find((m) => m.id === media)?.label ?? null);

  // La garde de PROD vient de main (#547) : l'easter egg reste sur dev.
  if (showDoom && !isProd) {
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
            <ShareButton title={shareTitle(data)} anchor="partis-et-couverture" editionKey={editionKey} />
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
          ensuite, ce qui est l'ordre dans lequel on lit un classement.

          La condition ne teste PLUS `chart.tooShort` : `Palmares` le teste déjà
          et rend une phrase qui dit pourquoi il n'y a pas de courbe. Testé aux
          deux étages, c'est le parent qui gagnait — la section disparaissait
          sans un mot et les trois messages de l'enfant étaient du code mort.
          Le cas n'a rien d'exceptionnel : le raffineur remet ses blocs de 4 h à
          zéro à minuit, donc chaque matin, jusqu'au deuxième bloc publié,
          l'onglet « Jour » n'a qu'un point et rien à tracer. Un trou muet s'y
          lit comme une panne du site. */}
      {!data.indisponible && (
        <section className="partis-course partis-course--tete">
          <p className="course-tete">Le palmarès, en minutes passées en Une</p>
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
              <br />• Le curseur <b>Source</b> change de média&nbsp;: les hauteurs se recalculent
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
          <Deck row={decks[0]} rang={1} indisponible={data.indisponible} mediaLabel={mediaLabel}
            onSelect={setPochette} selectionne={pochette === decks[0]?.key} />
          <Deck row={decks[2]} rang={3} indisponible={data.indisponible} mediaLabel={mediaLabel}
            onSelect={setPochette} selectionne={pochette === decks[2]?.key} />
        </div>

        <div className="regie-centre">
          <Console
            rows={view.rows}
            reference={data.ranges[range].rows}
            onPcqTap={handlePcqTap}
            indisponible={data.indisponible}
            saillanceRang={saillanceRang}
            media={media}
            depuis={view.depuisLabel}
          />
        </div>

        <div className="regie-flanc regie-flanc--droite">
          <Deck row={decks[1]} rang={2} indisponible={data.indisponible} mediaLabel={mediaLabel}
            onSelect={setPochette} selectionne={pochette === decks[1]?.key} />
          <Deck row={decks[3]} rang={4} indisponible={data.indisponible} mediaLabel={mediaLabel}
            onSelect={setPochette} selectionne={pochette === decks[3]?.key} />
        </div>
      </div>

      {/* Le fader reste EN PLACE tant que la ventilation par média n'est pas
          publiée (aws-refiners#324) — QUE la mesure soit suspendue ou non.
          La condition portait sur `data.indisponible` : elle affichait le
          repli inerte pendant la suspension, puis se réduisait à `null` dès
          que #542 a levé le drapeau, alors que la VRAIE raison de l'absence
          — pas de ventilation par média — n'avait pas changé. Le fader
          disparaissait donc précisément au moment où le module redevenait
          actif. Le panel de médias est une CONSTANTE, connue indépendamment
          de toute donnée : on peut le montrer. Inerte, parce qu'il n'y a rien
          à filtrer, et le dire vaut mieux que de le faire disparaître. */}
      {data.medias.length > 0 ? (
        <Fader medias={data.medias} valeur={media} onChange={setMedia} />
      ) : (
        <Fader
          medias={MEDIA_PANEL_QC.map((id) => ({
            id,
            label: MEDIA_LABELS[id] ?? id,
          }))}
          valeur={TOUS_MEDIAS}
          onChange={() => {}}
          inerte
        />
      )}
      </div>

      {/* LE BAC, sous la console. Il montre les CINQ pochettes, y compris celles
          des partis en sourdine, qui n'ont pas de deck et n'avaient donc aucune
          pochette auparavant. Masqué quand la mesure est indisponible : des
          pochettes à zéro affirmeraient un classement que la donnée ne soutient
          pas, exactement comme les decks. */}
      {!data.indisponible && (
        <BacAVinyles
          rows={view.rows}
          mediaLabel={mediaLabel}
          ouverte={pochette}
          onOuvrir={setPochette}
          onFermer={() => setPochette(null)}
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
  depuis,
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
  /** Depuis quand la mesure court : « depuis minuit », « depuis lundi »… */
  depuis: string;
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
  // La console MUETTE garde tout son cadre : titre, échelle, cinq pistes. Seuls
  // les NIVEAUX disparaissent.
  //
  // Elle se réduisait à une ligne de texte, et le module tout entier rapetissait
  // avec elle. L'état sans donnée doit être celui de l'état plein aux niveaux
  // près : c'est la seule façon de voir que l'instrument est là et n'affiche
  // rien, plutôt que de croire qu'il a disparu.
  //
  // « Tous les canaux sont silencieux » n'est vrai que si l'instrument
  // fonctionne. Quand il est en panne, le dire ainsi imputerait aux médias un
  // silence qui est le nôtre : c'est le bandeau au-dessus qui l'explique.
  const muet = Boolean(indisponible) || !tete || tete.sovPct <= 0;
  if (!indisponible && muet) {
    return <p className="console-vide">Aucun parti n&apos;a été détecté sur cette période.</p>;
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
      <p className="console-tete">
        {titre}
        <span className="console-depuis">{depuis}</span>
      </p>
      <div className="console-corps">
        <ol className="console-tranches" style={{ ["--n" as string]: tranches.length }}>
          {tranches.map((row, i) => (
            <Tranche
              muet={muet}
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

/**
 * L'ILLUSTRATION d'une pochette, seule pièce partagée entre le bac et la
 * pochette ouverte.
 *
 * EMPLACEMENT DE L'IMAGE GÉNÉRÉE. `row.illustration` est l'URL d'une image
 * produite en amont, sur le modèle exact de celle de la Une des Unes : un
 * raffineur l'engendre, la dépose sur R2, et le build la rapatrie dans
 * `public/data/generated-art/` (cf. `scripts/fetch_art.mjs`). Tant qu'elle
 * n'existe pas, on rend la composition géométrique d'origine.
 *
 * Le repli n'est PAS un pis-aller : il porte déjà les trois grandeurs du parti
 * (sa couleur, l'enjeu de tête, le ton) et reste lisible. Une pochette qui
 * disparaîtrait faute d'image serait pire qu'une pochette dessinée.
 */
function PochetteArt({
  row,
  mediaLabel,
  grande,
}: {
  row: RowView;
  mediaLabel: string | null;
  /** Vrai dans la pochette ouverte, où l'illustration occupe un volet entier. */
  grande?: boolean;
}) {
  const enjeu = row.enjeux.find((e) => !e.reste) ?? null;
  return (
    <span
      className={`pochette-art${grande ? " pochette-art--grande" : ""}`}
      style={{
        ["--party" as string]: row.color,
        ["--enjeu" as string]: couleurEnjeu(enjeu?.label),
        ["--ton" as string]: `var(--ton-${row.toneDirection})`,
      }}
    >
      {/* Le média, en bandeau le long du haut. Fond d'encre et non transparent :
          il doit rester lisible sur les cinq couleurs de parti, dont l'orange de
          Québec solidaire. */}
      {mediaLabel && <span className="pochette-media">{mediaLabel}</span>}
      {row.illustration ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pochette-image" src={row.illustration} alt="" aria-hidden="true" />
      ) : (
        <svg className="pochette-formes" viewBox="0 0 100 100" aria-hidden="true">
          {/* UNE POCHETTE DE 33 TOURS. Le disque dépasse par la droite, comme
              quand on le sort à demi de sa pochette : c'est ce détail, plus que
              le carré coloré, qui fait reconnaître l'objet immédiatement. */}
          <defs>
            <linearGradient id={`grd-${row.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
              <stop offset="55%" stopColor="rgba(255,255,255,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
            </linearGradient>
          </defs>
          {/* Le disque, derrière la pochette, dépassant à droite. */}
          <g className="disque">
            <circle cx="88" cy="50" r="33" />
            {[27, 22, 17, 12].map((r) => (
              <circle key={r} className="sillon" cx="88" cy="50" r={r} fill="none" />
            ))}
            <circle className="etiquette" cx="88" cy="50" r="8" />
            <circle className="trou" cx="88" cy="50" r="1.6" />
          </g>
          {/* La pochette par-dessus, qui recouvre les trois quarts du disque. */}
          <rect className="carton" x="0" y="0" width="78" height="100" />
          <rect className="carton-lumiere" x="0" y="0" width="78" height="100" fill={`url(#grd-${row.key})`} />
          {/* L'ouverture, à droite : le liseré crème par où sort le disque. */}
          <rect className="ouverture" x="75.5" y="0" width="2.5" height="100" />
          {/* Le bandeau du ton, en pied, comme la bande d'un label. */}
          <rect className="bandeau-ton" x="0" y="86" width="78" height="14" />
        </svg>
      )}
      <b className="pochette-sigle">{row.label}</b>
    </span>
  );
}

/**
 * LA JAUGE DE TON, reprise du module de l'Assemblée nationale.
 *
 * Même objet visuel que le « Ton en chambre » (`.ass-tone`) : une barre en
 * dégradé, défavorable à gauche, favorable à droite, et un repère qui s'y
 * déplace. Deux modules qui mesurent un ton doivent le montrer de la même
 * façon, sinon le lecteur croit lire deux grandeurs différentes.
 */
function JaugeTon({ pct, title }: { pct: number; title?: string }) {
  return (
    <span className="pochette-ton" title={title}>
      <span className="pochette-ton-repere" style={{ left: `${pct}%` }} />
    </span>
  );
}

/**
 * LE BAC À VINYLES : toutes les pochettes, rangées par temps d'écoute.
 *
 * Pourquoi un bac plutôt que le dos des decks. La pochette vivait au verso du
 * disque : il fallait retourner chaque deck l'un après l'autre pour comparer
 * quoi que ce soit, et les partis en sourdine n'avaient pas de deck du tout,
 * donc pas de pochette. Le bac les montre TOUS, côte à côte, dans l'ordre du
 * temps d'écoute.
 *
 * Le classement est celui des MINUTES, pas de la part de voix : c'est la
 * grandeur que le module publie et celle qui se cite.
 *
 * Au survol, les pochettes s'écartent comme on feuillette un bac de disquaire.
 * C'est du CSS seul : aucun état, donc rien à désynchroniser.
 */
function BacAVinyles({
  rows,
  mediaLabel,
  ouverte,
  onOuvrir,
  onFermer,
}: {
  rows: RowView[];
  mediaLabel: string | null;
  ouverte: PartyKey | null;
  onOuvrir: (key: PartyKey) => void;
  onFermer: () => void;
}) {
  // Le tri se fait sur les MINUTES. À égalité (deux partis à zéro, cas
  // ordinaire quand la mesure ne détecte rien), on départage par le sigle pour
  // que l'ordre ne saute pas d'un rendu à l'autre.
  const triees = rows
    .slice()
    .sort((a, b) => b.minutesUne - a.minutesUne || a.label.localeCompare(b.label, "fr"));
  const choisie = triees.find((r) => r.key === ouverte) ?? null;

  return (
    <section className="bac" aria-label="Bac à vinyles">
      <p className="bac-tete">
        Le bac, par temps d’écoute
        <span className="bac-aide">cliquez une pochette pour l’ouvrir</span>
      </p>

      {/* LA BOÎTE À LAIT. Les parois et le fond sont dessinés autour des
          disques : sans contenant, une rangée de pochettes reste une rangée de
          vignettes. C'est le cadre qui fait comprendre l'objet d'un coup d'œil. */}
      <div className="boite">
        <div className="boite-paroi boite-paroi--g" aria-hidden="true" />
        <ol className="bac-rangee">
        {triees.map((row, i) => (
          <li
            className={`bac-case${row.key === ouverte ? " sortie" : ""}${row.inShadow ? " shadow" : ""}`}
            key={row.key}
            style={{ ["--i" as string]: i, ["--party" as string]: row.color }}
          >
            <button
              type="button"
              className="bac-pochette"
              onClick={() => (row.key === ouverte ? onFermer() : onOuvrir(row.key))}
              aria-expanded={row.key === ouverte}
              title={`${row.fullLabel}\u00a0: ${formatDuree(row.minutesUne)} en Une. Ouvrir la pochette.`}
            >
              {/* LA LANGUETTE, seule partie visible au repos : c’est la tranche
                  du disque rangé dans le bac. Elle porte le sigle et la durée,
                  à la verticale, comme le dos d’un vinyle sur une étagère.
                  Écarter la pochette (survol, clavier, sélection) découvre la
                  couverture qui se cache dessous. */}
              <span className="bac-couv">
                <PochetteArt row={row} mediaLabel={mediaLabel} />
              </span>
              <span className="bac-languette">
                <b>{row.label}</b>
                <span>{formatDuree(row.minutesUne)}</span>
              </span>
            </button>
          </li>
        ))}
        </ol>
        <div className="boite-paroi boite-paroi--d" aria-hidden="true" />
        <div className="boite-fond" aria-hidden="true" />
      </div>

      {choisie && <PochetteOuverte row={choisie} mediaLabel={mediaLabel} onFermer={onFermer} />}
    </section>
  );
}

/**
 * LA POCHETTE OUVERTE, en double volet.
 *
 * À gauche l’illustration, à droite les quatre grandeurs que le module publie :
 * temps en Une, part de temps, enjeu du parti, et le ton sur sa jauge. Ce sont
 * exactement les chiffres qui vivaient au dos du deck, mais lisibles : le verso
 * d’un disque de 4 cm ne pouvait porter ni libellé entier ni jauge.
 */
function PochetteOuverte({
  row,
  mediaLabel,
  onFermer,
}: {
  row: RowView;
  mediaLabel: string | null;
  onFermer: () => void;
}) {
  const enjeu = row.enjeux.find((e) => !e.reste) ?? null;

  return (
    <div className="gatefold" role="group" aria-label={`Pochette de ${row.fullLabel}`}>
      <div className="gatefold-volet gatefold-volet--art">
        <PochetteArt row={row} mediaLabel={mediaLabel} grande />
      </div>

      <div className="gatefold-volet gatefold-volet--info" style={{ ["--party" as string]: row.color }}>
        <p className="gatefold-nom">
          <span className="gatefold-rang">{row.rang}</span>
          {row.fullLabel}
        </p>

        <dl className="gatefold-pistes">
          <div>
            <dt>Temps en Une</dt>
            <dd className="gatefold-chiffre">{formatDuree(row.minutesUne)}</dd>
          </div>
          <div>
            <dt>Part de temps</dt>
            <dd className="gatefold-chiffre">{row.sovPct} %</dd>
          </div>
          <div>
            <dt>Enjeu du parti</dt>
            <dd>{enjeu?.label ?? (row.enjeuxVentiles ? SANS_ENJEU : ENJEU_NON_VENTILE)}</dd>
          </div>
          <div className="gatefold-ton">
            <dt>Ton de la couverture</dt>
            <dd>
              <JaugeTon pct={row.tonePct} title={row.toneTitle} />
              <span className="gatefold-ton-mot">{row.toneLabel}</span>
            </dd>
          </div>
        </dl>

        <button type="button" className="gatefold-fermer" onClick={onFermer}>
          Refermer la pochette
        </button>
      </div>
    </div>
  );
}

function Deck({
  row,
  rang,
  indisponible,
  mediaLabel,
  onSelect,
  selectionne,
}: {
  row: RowView | null;
  /** Le rang affiché, de 1 à 4 — la position du deck, pas le rang du parti dans
   *  les cinq (ils coïncident, la sourdine ne retirant que la queue). */
  rang: number;
  indisponible: Indisponibilite | null;
  /** Nom du média affiché, ou `null` sur « tous les médias ». Il s'inscrit
   *  autour du disque et en bandeau sur la pochette : sans lui, rien sur le deck
   *  ne dit que les chiffres portent sur UNE source.
   *
   *  ⚠️ Ce n'est PAS une clé de remontage — celle-ci ne porte que le parti, pour
   *  que le changement de disque ne se rejoue que sur un vrai changement de
   *  piste. */
  mediaLabel: string | null;
  /** Sélectionner ce parti : sa pochette vient au premier plan du bac, en
   *  dessous. Le deck ne se retourne plus — cf. le commentaire du bac. */
  onSelect?: (key: PartyKey) => void;
  /** Vrai quand c'est CE parti dont la pochette est sortie du bac. Le deck le
   *  montre, sans quoi rien ne relierait le clic à ce qui bouge plus bas. */
  selectionne?: boolean;
}) {

  /** Un deck vide n'est pas une erreur : il dit qu'il n'y avait pas de parti à
   *  ce rang, deux partis s'étant partagé la dernière place en sourdine. */
  /* Un deck vide garde EXACTEMENT la géométrie d'un deck plein : le carré, puis
     la ligne du rang. Seule la molette est nue.

     Sans cette ligne, le deck perdait une vingtaine de pixels, la rangée entière
     se resserrait et le cadre du module rapetissait — l'absence de donnée
     changeait la forme du module au lieu de n'en changer que le contenu.

     Le rang reste écrit : c'est une position, pas une mesure. Il dit qu'il y a
     bien quatre places, et que celle-ci attend. */
  if (indisponible || !row) {
    return (
      <div
        className={`deck deck--vide${indisponible ? " deck--suspendu" : ""}`}
        title={
          indisponible
            ? "La mesure est suspendue\u00a0: voir l'avis en tête du module."
            : `Aucun parti au ${rang}${rang === 1 ? "er" : "e"} rang sur cette période.`
        }
      >
        <div className="deck-carre">
          <span className="deck-jog deck-jog--vide" aria-hidden="true">
            <span className="deck-jog-cap deck-jog-cap--vide" />
          </span>
        </div>
        <p className="deck-nom deck-nom--vide">
          <span className="deck-rang">{rang}</span>
        </p>
      </div>
    );
  }

  // L'enjeu de tête, hors « Autres enjeux » : ce dernier agrège la queue de
  // distribution et ne nomme rien, donc il ne peut pas être un « enjeu clé ».
  const enjeu = row.enjeux.find((e) => !e.reste) ?? null;
  const ton = row.toneDirection;

  /* Le survol du disque annonce ce que le clic FAIT, et surtout OÙ. Le deck ne
     se retourne plus : il sort une pochette du bac, plus bas. Sans le dire, le
     clic paraîtrait sans effet — ce qui bouge n'est pas sous le doigt. */
  const annonceDisque = selectionne
    ? `${row.fullLabel} : sa pochette est déjà sortie du bac, plus bas`
    : `${row.fullLabel}, ${rang}${rang === 1 ? "er" : "e"} au classement. ` +
      `Sortir sa pochette du bac, plus bas, pour voir combien de temps ce parti a ` +
      `occupé la Une, quelle part de la couverture il représente, l'enjeu dont on ` +
      `parle le plus à son sujet et le ton de cette couverture.`;

  const pistes: [string, string, string?][] = [
    ["Temps en Une", formatDuree(row.minutesUne)],
    ["Part de temps", `${row.sovPct} %`],
    ["Enjeu clé", enjeu?.label ?? (row.enjeuxVentiles ? SANS_ENJEU : ENJEU_NON_VENTILE)],
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
      {/* La clé ne porte QUE le parti, et non la source.
          Changer de média ne change pas forcément qui occupe ce deck : keyer sur
          la source rejouait le changement de disque à chaque coup de fader, y
          compris quand la piste restait la même. Ici le carré ne se remonte que
          si le parti change vraiment — et c'est ce remontage qui rejoue la
          sortie de pochette.
          Il referme aussi la pochette ouverte, ce qui est juste : ce n'est plus
          le même disque. */}
      <button
        key={row.key}
        type="button"
        className={`deck-carre${selectionne ? " deck-carre--choisi" : ""}`}
        onClick={() => onSelect?.(row.key)}
        aria-pressed={selectionne}
        aria-label={annonceDisque}
        title={annonceDisque}
      >
        {/* Face avant — la molette. Purement décorative : tout ce qu'elle porte
            (la couleur, donc l'identité) est déjà dit par le nom en dessous. */}
        <span className="deck-face deck-face--disque" aria-hidden="true">
          <span className="deck-jog">
            {/* Le capuchon n'est plus un aplat : il reprend la composition de la
                pochette, découpée en rond. On voit ce qu'on va retourner. */}
            {mediaLabel && (
              <svg className="deck-jog-media" viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                  {/* Un cercle de rayon 25,5, soit deux unités et demie au-delà
                      du capuchon (23) : le nom lui est collé, et non posé au
                      milieu du plateau. Le tracé part de la gauche et tourne
                      dans le sens horaire, si bien qu'un décalage d'un quart
                      place le texte en haut, à l'endroit. */}
                  <path
                    id={`arc-${row.key}`}
                    d="M 50,50 m -25.5,0 a 25.5,25.5 0 1,1 51,0 a 25.5,25.5 0 1,1 -51,0"
                    fill="none"
                  />
                </defs>
                <text>
                  <textPath href={`#arc-${row.key}`} startOffset="25%" textAnchor="middle">
                    {mediaLabel}
                  </textPath>
                </text>
              </svg>
            )}
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
  muet,
}: {
  row: RowView;
  rang: number;
  total: number;
  moyennePct: number;
  onPcqTap?: () => void;
  /** Mesure suspendue : la piste garde sa place et son échelle, mais AUCUN
   *  segment ne s'allume et rien ne s'écrit dessous. */
  muet?: boolean;
}) {
  // Sourdine : DEUX segments GRIS en bas — le signal résiduel qu'affiche une
  // table de mix pour une tranche muette. Ni zéro (la tranche aurait l'air
  // absente), ni son vrai niveau (il n'est justement pas retenu comme audible).
  // Gris et non vert : le vert appartient à l'échelle des canaux qui jouent, et
  // une tranche en sourdine n'est pas sur cette échelle.
  const coupe = !muet && row.inShadow;
  const niveau = Math.min(1, row.sovPct / METER_FULL_SCALE);
  const allumes = muet ? 0 : coupe ? 2 : Math.max(1, Math.round(niveau * METER_SEGMENTS));
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
  inerte,
}: {
  medias: { id: string; label: string }[];
  valeur: string;
  onChange: (v: string) => void;
  /** Mesure suspendue : le curseur garde sa place mais ne commande rien — il
   *  n'y a aucune donnée à filtrer. */
  inerte?: boolean;
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
    <div className={`fader${inerte ? " fader--inerte" : ""}`}>
      <div className="fader-piste">
        <input
          type="range"
          min={0}
          max={positions.length - 1}
          step={1}
          value={idx}
          onChange={(e) => onChange(positions[Number(e.target.value)].id)}
          disabled={inerte}
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
  // Un troisième message invitait à « ramener le curseur au centre », pour le
  // cas où le détail horaire n'existe que sur l'agrégat. Il ne pouvait pas
  // s'afficher — le palmarès reçoit TOUJOURS l'agrégat, jamais une vue par
  // média — et il aurait été trompeur s'il l'avait pu, le fader ne commandant
  // pas ce graphique.
  if (chart.tooShort) {
    return (
      <p className="course-vide">
        {chart.raison === "detail-horaire-absent"
          ? "Le détail heure par heure n'est pas encore publié pour cette période."
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
  /* Le CLAVIER prévisualise, la souris non. Passer le pointeur sur une courbe
     mettait un parti en vedette : le graphique changeait sous le curseur au
     moindre déplacement, et l'on ne pouvait plus lire le peloton sans écarter
     la souris. La mise en vedette se demande maintenant d'un clic.
     Le focus reste, lui : c'est le seul moyen pour qui navigue au clavier de
     savoir sur quelle courbe il se trouve avant de la choisir. */
  const [focalise, setFocalise] = useState<string | null>(null);
  const vedette = focalise ?? isole;

  /* La période est-elle COURUE ? Le dernier point a-t-il atteint la ligne
     d'arrivée — 20h pour la journée, la fin de semaine, le jour du scrutin.
     C'est là seulement qu'on peut désigner un gagnant. */
  const termine = series.length > 0 && series[0].lastX >= chart.finish.x - 0.5;
  /* Le bloc de tête est PERMANENT : pendant la course il montre qui mène, à
     l'arrivée il couronne. Ne l'afficher qu'au terme faisait grandir la colonne
     d'une cinquantaine de pixels d'un coup, et la rangée de grille prend la
     hauteur du plus grand — tout le module sautait au moment même où le
     graphique devenait intéressant. */
  const tete = series[0] ?? null;

  return (
    <figure
      className={
        "palmares-figure" +
        (vedette ? " a-vedette" : "") +
        // Sur téléphone, cet état décide de CE QU'ON MONTRE : les courbes tant
        // que la course dure, le classement une fois l'arrivée franchie.
        (termine ? " termine" : "")
      }
    >
      <div className="palmares-corps">
        <div className="palmares-zone">
          <svg
            className="palmares-svg"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Le zéro porte son filet comme les autres graduations : c'est un
                pointillé de grille, pas le trait plein de l'axe des x qui a été
                retiré. */}
            {/* Les filets s'arrêtent à l'ARRIVÉE et non au bord du cadre : au-delà
                il n'y a plus de piste, et une grille qui la dépasse laisse croire
                qu'on peut encore y lire quelque chose. */}
            {chart.yLabels.map((g) => (
              <line key={g.label} className="palmares-grille" x1="0" x2={chart.finish.x} y1={g.y} y2={g.y} />
            ))}
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
          {tete && (
            <div
              className={`palmares-gagnant${termine ? " termine" : ""}`}
              style={{ ["--party" as string]: tete.color }}
            >
              <i className="palmares-gagnant-album" aria-hidden="true" />
              <span className="palmares-gagnant-txt">
                <span className="palmares-gagnant-etat">
                  {termine ? "Disque d\u2019or" : "En tête"}
                </span>
                <span className="palmares-gagnant-nom">{tete.label}</span>
                <b>{formatDuree(tete.lastMinutes)}</b> d&apos;écoute
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
                  onFocus={() => setFocalise(s.key)}
                  onBlur={() => setFocalise(null)}
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
            className={
              Math.abs(l.x - chart.finish.x) < 0.5 || l.label === chart.finish.label
                ? "palmares-x-arrivee"
                : undefined
            }
            style={{ left: `${(l.x / chart.width) * 100}%` }}
          >
            {l.label}
          </li>
        ))}
        {/* On dédoublonne aussi sur le TEXTE : sur la semaine, le repère du
            vendredi porte déjà le nom de l'arrivée sans être à sa position. */}
        {!chart.xLabels.some(
          (l) => Math.abs(l.x - chart.finish.x) < 0.5 || l.label === chart.finish.label,
        ) && (
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