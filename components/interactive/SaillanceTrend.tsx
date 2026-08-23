"use client";

import { useState } from "react";
import type { SalienceTrend, SalienceTrendPoint } from "@/lib/data/headlineEvents";

// Trajectoire de saillance sous le badge (#274) : mini-courbe des 6 derniers
// blocs, flèche de tendance, puis la phrase (#304). La courbe trace la PART
// D'ATTENTION ; chaque point est survolable (tap sur mobile) et révèle le
// niveau que le BADGE portait à ce bloc — même grandeur, même échelle que la
// pastille, qui suit désormais la saillance cumulée 24 h et non plus le pic.
// La trajectoire est TOUJOURS rendue, y compris « stable ».
// Boîte volontairement basse : une sparkline trop haute lit « en dessous » du
// texte (sa masse — les blocs au plancher — s'enfonce sous la ligne de base).
// Compacte, elle s'aligne optiquement avec le libellé.
// PADX = 8 et non 5 (relevé en review sur #432) : le dernier point est posé à
// x = W − PADX, et son rayon maximal atteint 4,8 px + 1,8 px de grossissement au
// survol + 0,8 px de demi-contour pour l'anneau « maintenant » — soit 7,4 px.
// À 5 px de marge il débordait de 2,4 px hors du cadre. `overflow: visible` le
// sauvait de l'écrêtage mais le laissait peindre par-dessus ce qui suit.
const W = 124, H = 24, PADX = 8, PADY = 4;

// Diamètre d'un point = PALIER DE SAILLANCE de ce bloc (demande Adrien) : la
// courbe dit l'attention cumulée 24 h par sa hauteur, la grosseur redit le même
// niveau en plus lisible (vitrine#430 B3 : une seule grandeur dans toute la
// bande — hauteur, diamètre et mot ne peuvent plus se contredire).
// Écart volontairement marqué — 1,9 px à 4,8 px entre
// « Très faible » et « Exceptionnelle » — pour que la différence se voie à cette
// échelle. Un bloc sans Une garde un petit anneau creux, lisible mais discret.
// Les repères sommet / maintenant passent par la COULEUR (cf. CSS), pas par la
// taille, pour que le diamètre n'encode qu'une seule chose.
function rayon(p: { rank: number; isAbsent: boolean }, survol: boolean) {
  const base = p.isAbsent ? 2 : 1.9 + (Math.max(1, p.rank) - 1) * 0.58;
  return Number((survol ? base + 1.8 : base).toFixed(2));
}

// Symbole de tendance — chemin SVG, coloré par la classe parente : flèche ↘
// (baisse) / ↗ (hausse) / « = » (stable, deux traits parallèles).
function Arrow({ dir }: { dir: SalienceTrend["dir"] }) {
  const d = dir === "down" ? "M3,3 L14,14 M14,14 L14,7.5 M14,14 L7.5,14"
    : dir === "up" ? "M3,14 L14,3 M14,3 L7.5,3 M14,3 L14,9.5"
    : "M3,6.3 L14,6.3 M3,10.7 L14,10.7";
  return (
    <svg className="trend-arrow" width="17" height="17" viewBox="0 0 17 17" aria-hidden="true"
      fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// Le libellé d'un bloc pointé : le NIVEAU que la nouvelle affichait à ce bloc
// (demande Adrien, #274), puis la part qui explique la hauteur du point sur la
// courbe. Sorti du JSX pour servir DEUX fois — au texte affiché et aux doublures
// invisibles qui réservent la hauteur (cf. plus bas).
function capDuPoint(p: SalienceTrendPoint) {
  // Le « X % de l'attention médiatique » a quitté cette ligne (vitrine#430, B3) :
  // il disait la part du bloc de 4 h pendant que le mot juste à côté disait le
  // niveau du cumul 24 h — deux natures, et 39 % des mouvements qui se
  // contredisaient. À la place, la VALEUR du point et sa variation depuis le
  // bloc précédent (demande d'Adrien) : une seule grandeur, et le mouvement
  // chiffré plutôt que laissé à l'appréciation de l'œil.
  // « points » explicite : sans unité, un nombre nu à côté d'un mot de niveau se
  // lit comme un rang ou un pourcentage. Et la variation nomme le bloc auquel
  // elle se compare, sinon « −24 % » ne dit pas depuis quand.
  // EN TAGS, PAS EN PHRASE (demande d'Adrien, 2026-08-09). Quatre grandeurs
  // différentes — un moment, un statut, un niveau, une valeur et sa variation —
  // étaient enfilées sur une seule ligne séparée par des points médians : ça se
  // lisait comme une phrase alors que ce sont cinq faits indépendants, et l'oeil
  // n'avait aucun point d'accroche pour aller chercher celui qu'il voulait.
  // Chaque fait devient donc une pastille, avec son propre registre visuel.
  const val = <span className="tc-chip tc-val">{p.cumul.toFixed(1).replace(".", ",")}&nbsp;pts</span>;
  const bouge = p.delta != null && p.delta !== 0
    ? <span className={`tc-chip tc-delta ${p.delta > 0 ? "is-up" : "is-down"}`}>
        {p.delta > 0 ? "+" : "−"}{Math.abs(p.delta)}&nbsp;%
        {p.deltaDepuis ? <span className="tc-since"> / {p.deltaDepuis}</span> : null}
      </span>
    : null;
  // Le SOMMET se nomme (demande d'Adrien). Il n'était marqué que par la couleur
  // du point : au survol, le plus haut niveau que l'histoire ait atteint se
  // lisait comme n'importe quelle autre édition. C'est pourtant la valeur qui
  // situe la nouvelle dans l'année (A8) et celle qui classera le palmarès.
  const sommet = p.isPeak ? <span className="tc-chip tc-sommet">Sommet</span> : null;
  // Même logique qu'au repos : un point sans variation à afficher est un point
  // d'arrivée. `isFirst` marque le premier bloc où la nouvelle a été en Une.
  const arrivee = p.isFirst && p.delta == null
    ? <span className="tc-chip tc-etat">Nouveau</span> : null;
  // LE TAG OFFICIEL, dans sa vraie couleur (demande d'Adrien) : la pastille du
  // survol reprend `saillance-tag` + la classe de bande, donc exactement le fond
  // et l'encre du badge au-dessus. Un aplat noir maison en faisait une troisième
  // grammaire de couleur dans une bande qui n'en a qu'une.
  //
  // La classe vient du POINT, pas d'une table recopiée ici (relevé en review) :
  // `TIER_BY_RANK` reste la source unique, et une copie locale aurait divergé au
  // premier renommage de bande.
  const niveau = p.isAbsent
    ? <span className="tc-chip tc-niveau is-absent">Hors du radar</span>
    : <span className={`tc-chip tc-niveau saillance-tag ${p.cls}`}>{p.level}</span>;
  // ORDRE (Adrien), le même qu'au repos : la VARIATION collée à la flèche —
  // sens et ampleur d'un seul mouvement de l'oeil — puis la valeur, puis les
  // statuts (sommet, niveau), et la DATE À LA TOUTE FIN. Le moment ouvrait la
  // ligne : il repoussait le pourcentage loin de la flèche qui l'illustre, et
  // c'est pourtant l'information qu'on vient chercher en dernier.
  return (
    <span className="trend-chips">
      {arrivee}{bouge}{val}{sommet}{niveau}
      <span className="tc-time">{p.timeLabel}</span>
    </span>
  );
}

// AU REPOS : la flèche et les pastilles, PLUS DE PHRASE DU TOUT (Adrien). La
// prose — « L'attention est retombée depuis ce midi (Sommet à 4h ce matin) » —
// disait ce que la flèche et la variation disent déjà, en trois fois plus de
// signes. Le mouvement se lit maintenant dans le sens de la flèche et dans la
// pastille de variation, qui nomme le bloc auquel elle se compare.
//
// LES CHIFFRES SONT CEUX DU MOMENT, jamais ceux du sommet. Au repos la bande
// répond à « où en est cette nouvelle MAINTENANT » ; le sommet, lui, a désormais
// sa place dans la bulle ⓘ, où il situe la nouvelle dans l'année (A8). Le mettre
// ici aussi ferait dire deux choses différentes au même endroit.
//
// DEUX absences volontaires, demandées explicitement :
//   · pas de tag de NIVEAU — le badge est juste au-dessus, il le dit déjà ;
//   · pas de « Hors du radar » — c'est l'état d'UN bloc, pas de la journée ;
//     il n'apparaît qu'au survol du point concerné.
// La VALEUR s'affiche même quand la nouvelle a quitté les Unes : le cumul 24 h
// existe toujours, et c'est lui que le badge affiche.
// Quand `delta` est nul, la bande n'a plus que la valeur à montrer et le
// mouvement disparaît. Ça arrive dans deux cas seulement, et ce sont justement
// les deux qui méritent d'être nommés : la nouvelle vient d'ARRIVER (premier
// bloc, rien avant à quoi se comparer) ou elle REVIENT après une absence (le
// bloc précédent valait zéro). Une pastille courte les dit, sans réintroduire
// la phrase qu'on vient de retirer.
function etatSansVariation(situation: SalienceTrend["situation"]) {
  if (situation === "nouvelle") return "Nouveau";
  if (situation === "retour") return "Retour";
  return null;
}

function capAuRepos(trend: SalienceTrend) {
  const maintenant = trend.points.find((p) => p.isNow);
  const etat = maintenant && maintenant.delta == null ? etatSansVariation(trend.situation) : null;
  return (
    <span className="trend-chips">
      {etat ? <span className="tc-chip tc-etat">{etat}</span> : null}
      {maintenant ? (
        <>
          {/* LA VARIATION D'ABORD, collée à la flèche (Adrien) : la flèche donne
              le SENS du mouvement, le pourcentage en donne l'AMPLEUR — c'est une
              seule information en deux signes, les séparer par la valeur cassait
              la lecture. La valeur absolue vient ensuite, c'est l'état, pas le
              mouvement. */}
          {maintenant.delta != null && maintenant.delta !== 0 ? (
            <span className={`tc-chip tc-delta ${maintenant.delta > 0 ? "is-up" : "is-down"}`}>
              {maintenant.delta > 0 ? "+" : "−"}{Math.abs(maintenant.delta)}&nbsp;%
              {maintenant.deltaDepuis ? <span className="tc-since"> / {maintenant.deltaDepuis}</span> : null}
            </span>
          ) : null}
          <span className="tc-chip tc-val">{maintenant.cumul.toFixed(1).replace(".", ",")}&nbsp;pts</span>
        </>
      ) : null}
    </span>
  );
}

export function SaillanceTrend({ trend, editionHrefs }: {
  trend: SalienceTrend;
  /** Clé de bloc → adresse de l'édition (#434). Chaque point de la courbe EST
   *  une édition : pouvoir cliquer le creux ou le sommet qu'on vient de lire est
   *  le chemin le plus court vers l'archive. Les points hors de l'archive
   *  (fenêtre de rétention dépassée) restent de simples repères de survol. */
  editionHrefs?: Record<string, string>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = trend.points;
  // La courbe trace le CUMUL 24 h — la grandeur du badge (vitrine#430, B3).
  // Une seule grandeur dans toute la bande : la pastille, la hauteur des points
  // et le mot au survol disent maintenant tous la même chose.
  const max = Math.max(1, ...pts.map((p) => p.cumul));
  const xs = (i: number) => PADX + i * ((W - 2 * PADX) / Math.max(1, pts.length - 1));
  const ys = (v: number) => H - PADY - (v / max) * (H - 2 * PADY);
  const line = pts.map((p, i) => `${xs(i).toFixed(1)},${ys(p.cumul).toFixed(1)}`).join(" ");

  const active = hover !== null ? pts[hover] : null;
  // La flèche et la couleur décrivaient TOUJOURS la tendance d'ensemble, même
  // quand le survol lisait un point qui, lui, MONTAIT : « ↘ » rouge au-dessus
  // d'un « +29 % depuis hier 20h » (relevé par Adrien). Deux affirmations
  // contraires sur le même point. Tant qu'un point est pointé, toute la bande
  // parle de LUI — flèche, couleur et texte ensemble ; au repos, elle reparle
  // des 24 h. Un point sans variation (le premier, ou un plat) est neutre :
  // garder la flèche globale y réintroduirait exactement la contradiction.
  const dirActif: SalienceTrend["dir"] = active
    ? (active.delta == null || active.delta === 0 ? "flat" : active.delta > 0 ? "up" : "down")
    : trend.dir;

  // Les nombres vivent maintenant DANS la phrase (part actuelle + part au
  // sommet), pas dans une parenthèse séparée : « −40 % » était ambigu (points
  // de part ou chute relative?). Deux valeurs nommées ne peuvent pas se lire de
  // travers.

  // ORDRE : courbe → flèche → libellé (+ ampleur entre parenthèses). La courbe
  // vient en TÊTE, donc ANCRÉE (sa position ne dépend pas du texte ; les
  // trajectoires de plusieurs Unes s'alignent verticalement). La flèche garde sa
  // place devant le libellé ; le chiffre d'ampleur suit le libellé, entre
  // parenthèses (demande Yannick #304, placement ajusté avec Adrien).
  // <span> et non <div> : la trajectoire vit maintenant DANS la bande de
  // saillance, elle-même un <span> (un div y serait un imbriquement invalide).
  return (
    <span className={`saillance-trend trend-${dirActif}`}>
      <span className="trend-spark-wrap">
        <svg className="trend-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          role="img" aria-label={`Niveau de saillance sur 24 heures : ${trend.capLabel.toLowerCase()}`}>
          <polyline points={line} fill="none" className="trend-line" strokeWidth="1.9" strokeLinejoin="round" />
          {/* Les points VISIBLES ne portent plus rien d'interactif : leur rayon
              encode un niveau (1,9 px à 4,8 px), il ne peut pas servir aussi de
              cible de souris. Viser 1,9 px était « tannant » (Adrien). */}
          {pts.map((p, i) => (
            <circle
              key={`pt${i}`}
              className={`trend-pt${p.isAbsent ? " is-absent" : ""}${p.isPeak ? " is-peak" : ""}${p.isNow ? " is-now" : ""}${i === hover ? " is-hover" : ""}`}
              cx={xs(i).toFixed(1)} cy={ys(p.cumul).toFixed(1)}
              r={rayon(p, i === hover)}
            />
          ))}
          {/* CIBLES DE SURVOL — des BANDES, pas des pastilles (#430). Un disque
              plus gros butait sur deux limites : il laissait des zones mortes
              entre voisins, et comme `.trend-spark` est en `overflow: visible`,
              l'agrandir davantage l'aurait fait déborder du cadre pour voler le
              survol au titre. Une bande verticale pleine hauteur, large d'un
              demi-intervalle de chaque côté, règle les deux : les bandes sont
              CONTIGUËS (aucun trou : tout point du graphe appartient au point le
              plus proche) et restent strictement dans la boîte. Cible utile :
              22,8 × 24 px au lieu d'un disque de 8 px de rayon.
              C'est aussi ce qui porte le focus clavier et l'étiquette lue — un
              seul élément focusable par point. */}
          {pts.map((p, i) => {
            const demi = (W - 2 * PADX) / Math.max(1, pts.length - 1) / 2;
            const x = Math.max(0, xs(i) - demi), x2 = Math.min(W, xs(i) + demi);
            const href = editionHrefs?.[p.blockUtc];
            const lecture = p.isAbsent
              ? `${p.timeLabel} : Hors du radar`
              : `${p.timeLabel} : saillance ${p.level}, ${p.cumul.toFixed(1)} points sur 100${p.delta ? `, ${p.delta > 0 ? "en hausse" : "en baisse"} de ${Math.abs(p.delta)} % depuis ${p.deltaDepuis}` : ""}`;
            const cible = (
              <rect
                key={`hit${i}`}
                className={`trend-hit${href ? " is-lien" : ""}`}
                x={x.toFixed(1)} y={0} width={(x2 - x).toFixed(1)} height={H}
                tabIndex={href ? undefined : 0}
                role="img"
                aria-label={p.isAbsent
                  ? `${p.timeLabel} : Hors du radar`
                  : `${p.timeLabel} : saillance ${p.level}, ${p.cumul.toFixed(1)} points sur 100${p.delta ? `, ${p.delta > 0 ? "en hausse" : "en baisse"} de ${Math.abs(p.delta)} % depuis ${p.deltaDepuis}` : ""}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
              />
            );
            // Un point QUI MÈNE QUELQUE PART devient un lien. L'ancre porte
            // alors seule le focus clavier et l'étiquette lue — le rect lui
            // rend son `tabIndex` pour qu'il n'y ait pas deux arrêts de
            // tabulation par point, ni deux libellés concurrents.
            return href ? (
              <a
                key={`lien${i}`}
                href={href}
                className="trend-hit-link"
                aria-label={`${lecture}. Voir cette édition.`}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
              >
                {cible}
              </a>
            ) : cible;
          })}
        </svg>
      </span>
      {/* Flèche et libellé dans le MÊME bloc de retour à la ligne : en mobile, la
          phrase passe sous la courbe, et une flèche laissée seule au bout de la
          première ligne se lit comme un défaut d'affichage. */}
      <span className="trend-say"><Arrow dir={dirActif} />
      {/* Le libellé fait double emploi : tendance + ampleur au repos, lecture du
          bloc pointé au survol. Au survol on donne la PART du bloc pointé — plus
          le niveau (« Très faible »), qui parlait l'échelle du badge et créait la
          contradiction relevée par Laurence-Olivier. L'ampleur ne s'affiche QUE
          si ça bouge — stable = « Stable » seul, sans chiffre. */}
      {/* HAUTEUR RÉSERVÉE : tous les textes que cette bande peut afficher sont
          empilés dans la même cellule de grille, les inactifs en `visibility:
          hidden`. La hauteur de la boîte est donc celle du PLUS LONG à la
          largeur courante, quelle que soit cette largeur — le libellé se replie
          sur deux lignes dans une colonne étroite sans que rien ne saute au
          survol, et ne réserve rien de plus qu'une ligne quand tout tient sur
          une ligne. Avant, le libellé était en `nowrap` sans coupure : le texte
          de survol (428 px) débordait de sa colonne (331 px) et allait se peindre
          par-dessus la Une voisine — les « deux textes en même temps » d'Adrien. */}
      <span className="trend-cap">
        {[trend.capLabel as React.ReactNode, ...pts.map(capDuPoint)].map((n, i) => (
          <span className="trend-cap-ghost" aria-hidden="true" key={i}>{n}</span>
        ))}
        <span className="trend-cap-live" aria-live="polite">
          {active ? capDuPoint(active) : capAuRepos(trend)}
        </span>
      </span>
      </span>
    </span>
  );
}
