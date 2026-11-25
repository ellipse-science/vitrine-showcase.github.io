"use client";

import { useState, useRef } from "react";
import type { PartiesData, PartyKey, RangeKey, RangeView, RowView, Indisponibilite, EnjeuView } from "@/lib/data/parties";
import { TOUS_MEDIAS, MEDIA_PANEL_QC, MEDIA_DE, MEDIA_DANS, MEDIA_LABELS, MEDIA_ORDER } from "@/lib/medias";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { DoomGame } from "@/components/interactive/DoomGame";
import { SymboleEnjeu } from "@/components/interactive/SymboleEnjeu";
import { couleurEnjeu, libelleEnjeuCourt } from "@/lib/enjeux";

/* LE MODULE RÉDUIT À SA CONSOLE (2026-11-24, demande de Jules).
 *
 * Retirés le même jour : la vue Campagne, le palmarès et son disque d'or (la
 * frise sous la console), la discothèque et les pochettes engendrées. Il reste
 * la console, le vumètre, les quatre decks et le sélecteur de source, pilotés
 * par un filtre Jour / Semaine / Mois posé à droite du titre, comme sur les
 * autres modules. La vue de départ est Semaine.
 *
 * LES DECKS MONTRENT L'ENJEU QUI JOUE (2026-11-25, retour de Jules). Leur
 * vitesse suivait la part du parti, que la hauteur de sa colonne donne déjà.
 * Chaque disque porte maintenant l'enjeu le plus associé au parti dans la
 * dernière journée publiée, tous médias confondus, et tourne à vitesse fixe :
 * la rotation dit « en lecture », elle ne mesure rien.
 *
 * `overall` existe toujours dans `PartiesData` : les scripts sociaux
 * (`scripts/social/partis*.ts`) le lisent. Le module ne l'affiche plus. */

/** Les trois périodes du filtre, dans l'ordre d'affichage. */
const PERIODES: readonly RangeKey[] = ["today", "week", "month"];

/** Ce que chaque période couvre, en toutes lettres, pour l'infobulle. */
const PERIODE_INFOBULLE: Record<string, string> = {
  today: "La journée en cours, depuis minuit.",
  week: "La semaine en cours, depuis samedi.",
  month: "Les 30 derniers jours publiés.",
};

// Doom RETIRÉ DE PROD, gardé sur dev (décision du 2026-08-20) : l'easter egg
// des partis reste un jeu d'équipe, pas une porte du site public. Même signal
// d'environnement que `app/robots.ts`, `lib/data/parties.ts` et les retraits
// de #544 — un seul signal, pas de divergence. Flappy Enjeux n'est PAS visé :
// il reste accessible en prod, c'est le seul jeu autorisé en ligne.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

const RANGES: RangeKey[] = ["today", "week", "overall"];

/** UN CHOIX DÉTERMINISTE, PAS UN VRAI HASARD.
 *
 *  `Math.random()` dans le rendu d'un composant client donnerait une valeur
 *  différente au serveur (l'export statique) et au navigateur (l'hydratation)
 *  — exactement le mésappariement qu'un `useSearchParams()` sur du
 *  `force-static` a déjà coûté sur cette branche. Une fonction de `cle` reste
 *  stable d'un rendu à l'autre, et varie déjà assez d'un jour à l'autre :
 *  c'est la LISTE des médias disponibles qui change avec la donnée, pas ce
 *  hachage. Sert à choisir « un média au hasard, parmi ceux qui ont un
 *  article pour ce parti » (le deck sur « Tous les médias », voir
 *  `lienArticle`). */
function choisirParmi(cle: string, n: number): number {
  let h = 0;
  for (let i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
  return h % n;
}

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
  /** L'édition affichée, pour la carte de partage du module. Absent sur
   *  l'accueil. */
  editionKey?: string;
}) {
  // SEMAINE PAR DÉFAUT : une journée seule est trop courte pour qu'un
  // classement des partis se lise sans bruit.
  const [range, setRange] = useState<RangeKey>("week");
  const [media, setMedia] = useState<string>(TOUS_MEDIAS);
  /** Le verso du vumètre : une tranche ouvre les pièces publiées qui permettent
   * de remonter de ce parti à ses articles représentatifs. */
  const [partiSources, setPartiSources] = useState<PartyKey | null>(null);
  const [showDoom, setShowDoom] = useState(false);
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

  // Les quatre decks, dans l'ordre du classement : 1er en haut à gauche, 2e en
  // haut à droite, 3e en bas à gauche, 4e en bas à droite. Complété à quatre :
  // à égalité au plus bas, deux partis passent en sourdine et le dernier deck
  // reste vide — la lecture juste.
  const decks: (RowView | null)[] = [0, 1, 2, 3].map((i) => visibleRows[i] ?? null);

  // L'enjeu d'un deck vient TOUJOURS de l'agrégat : le raffineur ne croise pas
  // parti × enjeu × média, donc les vues par média n'en portent aucun. Il est
  // le même pour Jour, Semaine et Mois (dernière journée publiée).
  const enjeuQuiJoue = (row: RowView | null): EnjeuView | null =>
    row ? (data.ranges[range].rows.find((r) => r.key === row.key)?.enjeux.find((e) => !e.reste && e.pct > 0) ?? null) : null;

  /** Une URL représentative est publiée par média, pas par article. Le verso
   * ne prétend donc pas montrer tous les articles : il liste exactement les
   * sources traçables dans l'instantané affiché. */
  const sourcesParti = partiSources
    ? (media === TOUS_MEDIAS ? data.medias : data.medias.filter((m) => m.id === media))
        .map((m) => ({
          url: data.byMedia[m.id]?.ranges[range].rows.find((r) => r.key === partiSources)?.representativeUrl ?? null,
          title: "",
        }))
        .filter((source): source is { title: string; url: string } => !!source.url)
        .map((source) => ({ ...source, title: data.titresArticles?.[source.url] ?? "Article source" }))
        .filter((source, index, toutes) => toutes.findIndex((autre) => autre.url === source.url) === index)
    : [];

  // La garde de PROD : l'easter egg reste sur dev.
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
            {/* LE FILTRE DE PÉRIODE, à droite du titre, au même gabarit que
                les autres modules (`.legend-toggle`, cf. AssembleeClient). */}
            <div className="legend-toggle inline partis-periodes" role="tablist" aria-label="Période">
              {PERIODES.map((p) => (
                <span
                  key={p}
                  role="tab"
                  tabIndex={0}
                  aria-selected={p === range}
                  className={p === range ? "active" : undefined}
                  title={PERIODE_INFOBULLE[p]}
                  onClick={() => {
                    setRange(p);
                    setPartiSources(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setRange(p);
                      setPartiSources(null);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {data.ranges[p].tabLabel}
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

      <div className="pupitre">
        <div className="pupitre-aide">
          <InfoTip size="lg" label="Comment lire cette visualisation">
            <ModeEmploi />
          </InfoTip>
        </div>

        {/* Quatre decks aux quatre coins, le vumètre entre eux. La colonne de
            gauche porte les rangs 1 et 3, celle de droite les rangs 2 et 4. */}
        <div className={`regie${partiSources ? " regie--sources-ouvertes" : ""}`}>
          <div className="regie-flanc regie-flanc--gauche">
            <Deck row={decks[0]} rang={1} enjeu={enjeuQuiJoue(decks[0])} indisponible={data.indisponible} selection={partiSources} />
            <Deck row={decks[2]} rang={3} enjeu={enjeuQuiJoue(decks[2])} indisponible={data.indisponible} selection={partiSources} />
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
              partiSources={partiSources}
              sources={sourcesParti}
              onSelectParti={setPartiSources}
            />
          </div>

          <div className="regie-flanc regie-flanc--droite">
            <Deck row={decks[1]} rang={2} enjeu={enjeuQuiJoue(decks[1])} indisponible={data.indisponible} selection={partiSources} />
            <Deck row={decks[3]} rang={4} enjeu={enjeuQuiJoue(decks[3])} indisponible={data.indisponible} selection={partiSources} />
          </div>
        </div>

        {/* Le panel de médias est une CONSTANTE, connue indépendamment de toute
            donnée : sans ventilation publiée, le fader reste affiché, inerte. */}
        {data.medias.length > 0 ? (
          <Fader medias={data.medias} valeur={media} onChange={setMedia} />
        ) : (
          <Fader
            medias={MEDIA_PANEL_QC.map((id) => ({ id, label: MEDIA_LABELS[id] ?? id }))}
            valeur={TOUS_MEDIAS}
            onChange={() => {}}
            inerte
          />
        )}
      </div>

      <div className="module-last-updated">{data.lastUpdated}</div>
    </>
  );
}

/** Le mode d'emploi de la console, dans l'infobulle « Comment lire ». Une
 *  rubrique par élément affiché, chacun avec ce qu'il apprend de plus que les
 *  autres. Exporté pour le test, qui ne peut pas ouvrir l'infobulle. */
export function ModeEmploi() {
  return (
    <>
      <b>Comment lire cette visualisation&nbsp;:</b>
      <br />
      <br />• Chaque parti a sa <b>colonne</b>. Sa hauteur indique la part du temps que
      les médias lui consacrent <i>quand ils parlent d&apos;un parti</i>, et non sur
      l&apos;ensemble de l&apos;actualité, où les partis occupent une place bien plus
      petite. Les cinq colonnes se partagent 100&nbsp;%.
      <br />
      <br />• Le petit <b>cadran</b> sous chaque colonne donne le ton des phrases qui
      nomment le parti&nbsp;: aiguille à gauche (rouge), défavorable&nbsp;; à droite
      (vert), favorable&nbsp;; au centre, neutre.
      <br />
      <br />• Les quatre <b>disques</b> sont les quatre partis les plus présents. Sous
      chacun, l&apos;enjeu dont on parle le plus à son sujet dans la dernière journée
      publiée, tous médias confondus.
      <br />
      <br />• Le curseur <b>Source</b> change de média&nbsp;: les colonnes et les cadrans
      se recalculent sur les Unes de ce média seul.
      <br />
      <br />• <b>Sourdine</b>&nbsp;: le parti dont on parle le moins sur la période, quelle
      que soit sa part. Sa colonne reste affichée en gris. À égalité au plus bas, les
      deux y passent.
      <br />
      <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#partis-et-couverture`}>
        En savoir plus sur la méthodologie →
      </a>
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
  partiSources,
  sources,
  onSelectParti,
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
  partiSources: PartyKey | null;
  sources: { title: string; url: string }[];
  onSelectParti: (parti: PartyKey | null) => void;
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

  const partiChoisi = partiSources ? rows.find((row) => row.key === partiSources) : null;

  return (
    <section
      className="console"
      aria-label="Niveaux de couverture médiatique par parti"
      /* Le tempo des vumètres : 2 s quand l'actualité est très faible, 0,7 s
         quand elle est exceptionnelle. Rang 0 (donnée absente) tombe au milieu
         de l'échelle plutôt qu'à une extrémité. */
      style={{ ["--tempo" as string]: `${saillanceRang > 0 ? 2.0 - (saillanceRang - 1) * 0.26 : 1.35}s` }}
    >
      {partiChoisi && (
        <div className="console-sources" aria-live="polite">
          <button className="console-sources-retour" type="button" onClick={() => onSelectParti(null)}>
            Retour au vumètre
          </button>
          <p className="console-sources-surtitle">Sources de la mesure</p>
          <h3>{partiChoisi.fullLabel}</h3>
          {sources.length > 0 ? (
            <ul>
              {sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="console-sources-vide">Aucune source représentative n’est publiée pour cette vue.</p>
          )}
        </div>
      )}
      <div className={`console-face${partiChoisi ? " console-face--masquee" : ""}`} aria-hidden={partiChoisi ? true : undefined}>
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
              onSelect={() => onSelectParti(row.key)}
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
              {v === 20 ? <b>{v} %</b> : `${v} %`}
            </li>
          ))}
        </ul>
      </div>
      </div>

    </section>
  );
}

/** La couleur de l'aiguille du petit vumètre de ton, sous chaque colonne —
 *  reprise À L'IDENTIQUE de « Ton en chambre » du module de l'Assemblée
 *  (`.ass-tone` dans `globals.css`) : rouge défavorable `#A8302C`, parchemin
 *  neutre `#C8BDA6`, vert favorable `#3D6B3A`. Deux modules qui mesurent un ton
 *  le montrent pareil.
 *
 *  `tonePct` va de 0 (défavorable) à 100 (favorable), 50 = neutre — le champ
 *  déjà calculé pour le repère de la pochette (`RowView.tonePct`). Interpolation
 *  linéaire entre les deux arrêts qui encadrent la valeur. */
function couleurTon(tonePct: number): string {
  const ROUGE = [0xa8, 0x30, 0x2c];
  const NEUTRE = [0xc8, 0xbd, 0xa6];
  const VERT = [0x3d, 0x6b, 0x3a];
  const p = Math.max(0, Math.min(100, tonePct));
  const [depart, arrivee, f] =
    p <= 50 ? [ROUGE, NEUTRE, p / 50] : [NEUTRE, VERT, (p - 50) / 50];
  const c = depart.map((v, i) => Math.round(v + (arrivee[i] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Une tranche : vumètre segmenté, peak hold, ruban d'identité, ton. */
function Tranche({
  row,
  rang,
  total,
  moyennePct,
  onPcqTap,
  onSelect,
  muet,
}: {
  row: RowView;
  rang: number;
  total: number;
  moyennePct: number;
  onPcqTap?: () => void;
  onSelect: () => void;
  /** Mesure suspendue : la piste garde sa place et son échelle, mais AUCUN
   *  segment ne s'allume et rien ne s'écrit dessous. */
  muet?: boolean;
}) {
  // Sourdine : la colonne montre SA PART, en gris (`.seg.on.mute`), sur la même
  // échelle que les autres — seule la couleur dit « sourdine ». Vide, elle
  // laissait croire à une couverture nulle ; les deux segments gris d'avant, eux,
  // affichaient un niveau fixe qui ne mesurait rien. Une part nulle reste vide :
  // un segment allumé à 0 % serait un niveau inventé.
  const coupe = !muet && row.inShadow;
  const niveau = Math.min(1, row.sovPct / METER_FULL_SCALE);
  const allumes =
    muet || (coupe && row.sovPct <= 0) ? 0 : Math.max(1, Math.round(niveau * METER_SEGMENTS));
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
   *  Le canal en SOURDINE vacille comme les autres : sa barre grise est une
   *  part réelle, et seule la couleur dit « sourdine ». Une part nulle n'a aucun
   *  segment allumé, donc rien ne vacille. Et jamais plus de segments qu'il n'y
   *  en a d'allumés : sous trois, la cascade se raccourcit au lieu de déborder
   *  sur des segments éteints. */
  const debutVu = Math.max(0, allumes - 3);
  const vu = (i: number) =>
    i < allumes && i >= debutVu ? i - debutVu + 1 : 0;

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
      <button className="console-vumetre" type="button" onClick={onSelect} title={`${phrase} Voir les sources.`}>
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
      </button>

      {/* Le ruban n'est plus une commande : les decks se remplissent seuls, par
          rang. Un <button> annoncerait donc aux lecteurs d'écran un contrôle
          qui ne fait rien. Le clic ne sert plus qu'au jeu caché, volontairement
          hors du parcours clavier. */}
      <span className="console-ruban-nom" onClick={() => onPcqTap?.()}>
        {row.label}
      </span>
      {/* LE PETIT VUMÈTRE DE TON, sous la colonne — une fenêtre rectangulaire,
          esprit vumètre de magnéto. L'AIGUILLE dévie de −58° (bout rouge,
          défavorable) à +58° (bout vert, favorable) selon `tonePct`, qui va
          de 0 à 100 : l'angle vaut `(tonePct − 50) × 1,16`. Ce commentaire
          annonçait ±27° ; c'est LUI qui a été réécrit pour dire ce que le
          code fait, et le code n'a pas bougé — personne n'a demandé de
          réduire la course de l'aiguille. Si ±27° était bien l'intention de
          départ, alors c'est le facteur 1,16 qui est à revoir (0,54), et ça
          se décide avec Jules, pas dans un commentaire. Sa
          couleur reprend le dégradé de « Ton en chambre » (`couleurTon`).
          Angle ET couleur disent la même chose. Elle frémit, décalée d'une
          colonne à l'autre (`--ct-phase`) ; coupé pour `prefers-reduced-motion`.

          POUR UN CANAL EN SOURDINE : le même boîtier, mais CASSÉ (`--casse`) —
          aiguille affalée hors échelle, cadran éteint, plus aucun frémissement.
          Rien n'est mesuré là, et ça se voit.

          `aria-hidden` ; le `<title>` porte la phrase de ton au survol. */}
      {!muet && (
        <svg
          className={`console-ton${coupe ? " console-ton--casse" : ""}`}
          viewBox="0 0 64 24"
          aria-hidden="true"
          style={{
            ["--ct-angle" as string]: `${((row.tonePct - 50) * 1.16).toFixed(1)}deg`,
            ["--ct-ton" as string]: couleurTon(row.tonePct),
            ["--ct-phase" as string]: (choisirParmi(row.key, 24) / 10).toFixed(1),
          }}
        >
          <title>{coupe ? "Aucun ton à mesurer : le parti est en sourdine." : row.toneTitle}</title>
          <clipPath id={`ct-${row.key}`}>
            <rect x="0.6" y="0.6" width="62.8" height="22.8" rx="1.6" />
          </clipPath>
          <rect className="ct-cadre" x="0.6" y="0.6" width="62.8" height="22.8" rx="1.6" />
          {/* Cadran, aiguille et couleurs occupent TOUT le boîtier (viewBox
              inchangé) : arc large, traits épais. Le débord est rogné par le
              clip. */}
          <g clipPath={`url(#ct-${row.key})`}>
            <path className="ct-echelle ct-echelle--defav" d="M15.04 16.40 A20 20 0 0 1 25.38 8.13" />
            <path className="ct-echelle" d="M25.38 8.13 A20 20 0 0 1 38.62 8.13" />
            <path className="ct-echelle ct-echelle--fav" d="M38.62 8.13 A20 20 0 0 1 48.96 16.40" />
            <line className="ct-tick" x1="32" y1="7" x2="32" y2="10.5" />
            <g className="ct-pivot">
              <g className="ct-saut">
                {/* L'aiguille en deux traits : un liseré sombre dessous pour
                    qu'elle tienne sur le cadran ivoire quel que soit le ton,
                    la couleur du ton dessus. */}
                <line className="ct-aiguille-fond" x1="32" y1="27" x2="32" y2="4" />
                <line className="ct-aiguille" x1="32" y1="27" x2="32" y2="4" />
              </g>
            </g>
            <circle className="ct-axe" cx="32" cy="27" r="3" />
          </g>
        </svg>
      )}

      {/* « Sourdine » — SOUS le vumètre cassé, dans la 4e rangée réservée de la
          grille (vide pour les colonnes actives, pour que tous les boîtiers
          restent alignés). Le mot reste le seul emprunt visible au vocabulaire
          de la table de mixage : court, connu, il dit l'état mieux qu'un rang. */}
      {coupe && (
        <span className="console-sourdine">
          Sourdine
          <InfoTip size="sm" label="Sourdine">
            C&apos;est le parti dont les médias parlent le MOINS sur cette période. Le
            dernier du classement passe toujours en sourdine, quelle que soit sa part,
            qui reste affichée en gris. En cas d&apos;égalité au plus bas,
            les deux y passent.
          </InfoTip>
        </span>
      )}
    </li>
  );
}


/** « 2026-11-23 » → « 23 novembre », pour dire de quel jour vient un enjeu. */
function jourEnLettres(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * Un deck — un vinyle qui « joue » l'enjeu dont on parle le plus à propos du
 * parti : le titre du morceau en cours, écrit sous le disque. C'est la seule
 * place du module où l'on lit DE QUOI on parle ; le vumètre dit COMBIEN.
 *
 * Le disque tourne à vitesse fixe, la même pour tous : il est en lecture,
 * rien de plus. Sa vitesse suivait la part du parti, ce que la colonne disait
 * déjà (retiré le 2026-11-25). Sans enjeu identifié ce jour-là (seulement
 * « Autres enjeux », ou rien de publié), le titre est un tiret.
 */
function Deck({
  row,
  rang,
  enjeu,
  indisponible,
  selection,
}: {
  row: RowView | null;
  /** La position du deck, de 1 à 4. Ne s'affiche plus : elle ne sert qu'à
   *  l'infobulle du deck vide. */
  rang: number;
  enjeu: EnjeuView | null;
  indisponible: Indisponibilite | null;
  selection?: PartyKey | null;
}) {
  if (indisponible || !row) {
    return (
      <div
        className={`deck deck--vide${indisponible ? " deck--suspendu" : ""}`}
        title={
          indisponible
            ? "La mesure est suspendue : voir l'avis en tête du module."
            : `Aucun parti au ${rang}${rang === 1 ? "er" : "e"} rang sur cette période.`
        }
      >
        <div className="deck-carre deck-carre--inerte">
          <span className="deck-jog deck-jog--vide" aria-hidden="true">
            <span className="deck-jog-cap deck-jog-cap--vide" />
          </span>
        </div>
      </div>
    );
  }

  const quand = enjeu?.dateSource ? `le ${jourEnLettres(enjeu.dateSource)}` : "dans la dernière journée publiée";
  const annonce = enjeu
    ? `${row.fullLabel} : on en parle surtout sous l'angle « ${enjeu.label} » (${enjeu.pct} % de sa couverture ${quand}, tous médias confondus).`
    : `${row.fullLabel} : aucun enjeu dominant identifié ${quand}.`;

  return (
    <div
      className={`deck${selection && selection !== row.key ? " deck--attenue" : ""}`}
      style={{ ["--party" as string]: row.color }}
    >
      <div className="deck-carre deck-carre--inerte deck-carre--lecture" role="img" aria-label={annonce} title={annonce}>
        <span className="deck-jog" aria-hidden="true">
          <svg className="deck-jog-cap" viewBox="0 0 100 100" aria-hidden="true">
            <clipPath id={`cap-${row.key}`}>
              <circle cx="50" cy="50" r="50" />
            </clipPath>
            <g clipPath={`url(#cap-${row.key})`}>
              <rect className="forme-parti" x="0" y="0" width="100" height="100" />
            </g>
            <circle className="cap-cercle" cx="50" cy="50" r="49.4" />
            <circle className="cap-trou" cx="50" cy="50" r="6.5" />
            <text className="cap-sigle" x="50" y="42" textAnchor="middle">
              {row.label}
            </text>
          </svg>
        </span>
      </div>
      <p className={`deck-enjeu${enjeu ? "" : " deck-enjeu--aucun"}`} aria-hidden="true" title={annonce}>
        {/* Le symbole et la couleur de l'enjeu sont ceux du reste du site
            (fond neutre → le glyphe prend la couleur de l'enjeu), et le
            libellé est la forme courte : « Santé », pas « Santé et
            politiques sociales ». Le titre complet reste dans l'infobulle. */}
        {enjeu ? (
          <>
            <SymboleEnjeu libelle={enjeu.label} style={{ color: couleurEnjeu(enjeu.label) }} />
            {libelleEnjeuCourt(enjeu.label)}
          </>
        ) : (
          "—"
        )}
      </p>
    </div>
  );
}

/**
 * Le fader — choisir la source qu'on écoute.
 *
 * Un `input[type=range]` à crans plutôt qu'un menu déroulant : sur une
 * console, on ne choisit pas une source dans une liste, on pousse un curseur.
 * Le clavier fonctionne (flèches), et le lecteur d'écran annonce la valeur via
 * `aria-valuetext`.
 *
 * ORDRE DU CROSSFADER, NOMS COMPLETS : « Tous les médias » au centre (index 3),
 * les médias de part et d'autre selon MEDIA_ORDER, affichés sous leur nom complet.
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
  const parId = new Map(medias.map((m) => [m.id, m]));
  const connus = MEDIA_ORDER.flatMap((id) =>
    id === TOUS_MEDIAS
      ? [{ id: TOUS_MEDIAS, label: "Tous les médias" }]
      : parId.has(id)
        ? [{ id, label: MEDIA_LABELS[id] ?? parId.get(id)!.label }]
        : [],
  );
  const restants = medias.filter((m) => !MEDIA_ORDER.includes(m.id));
  const positions = [...connus, ...restants];
  const idx = Math.max(0, positions.findIndex((p) => p.id === valeur));
  const courante = positions[idx];

  return (
    <div className={`fader fader--noms${inerte ? " fader--inerte" : ""}`}>
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
              className={`fader-cran${i === idx ? " actif" : ""}${p.id === TOUS_MEDIAS ? " tous" : ""}`}
              /* La poignée native est rentrée d'une demi-largeur à chaque bout
                 pour rester dans la piste : les crans suivent la même course. */
              style={{
                left: `calc(var(--pouce) / 2 + ${i / (positions.length - 1)} * (100% - var(--pouce)))`,
              }}
              title={
                p.id === TOUS_MEDIAS
                  ? "Tous les médias réunis, chacun pesé selon son temps de Une"
                  : `Ne montrer que les Unes ${
                      MEDIA_DANS[p.id]
                        ? MEDIA_DANS[p.id].charAt(0).toLowerCase() + MEDIA_DANS[p.id].slice(1)
                        : `de ${p.label}`
                    }`
              }
            >
              <i />
              <b>{p.label}</b>
            </span>
          ))}
        </div>
      </div>
      <span className="fader-label">Source</span>
    </div>
  );
}
