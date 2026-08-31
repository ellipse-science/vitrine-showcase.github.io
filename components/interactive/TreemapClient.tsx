"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TreemapIssueTile, TreemapHistoryPoint, TreemapAllPeriods } from "@/lib/data/headlineEvents";
import { ShareButton } from "@/components/interactive/ShareButton";
import { InfoTip } from "@/components/interactive/InfoTip";
import { SymboleEnjeu } from "@/components/interactive/SymboleEnjeu";
import { jourMontreal, rankMovement, rankPointsForPeriod, type RankPeriod } from "@/lib/treemapRank";
import { heurePublicationMontreal } from "@/lib/dates";
import { useKonamiCode } from "./useKonamiCode";
import { FlappyEnjeux } from "./FlappyEnjeux";

// --- Treemap de croissance (onglet « Jour ») : partition + tuiles Proto A avec % de croissance ---
interface Rect { x: number; y: number; w: number; h: number; }
interface LayoutNode extends TreemapIssueTile { rect: Rect; }

// Partition récursive (« slice-and-dice » équilibré) : rectangles proportionnels au score.
function computeTreemapLayout(tiles: TreemapIssueTile[]): LayoutNode[] {
  const nodes: LayoutNode[] = tiles.map((t) => ({ ...t, rect: { x: 0, y: 0, w: 0, h: 0 } }));
  function partition(slice: LayoutNode[], rect: Rect) {
    if (slice.length === 0) return;
    if (slice.length === 1) { slice[0].rect = rect; return; }
    const total = slice.reduce((s, t) => s + Math.max(t.score, 0.001), 0);
    let leftSum = 0, splitIdx = 1, minDiff = Infinity;
    for (let i = 0; i < slice.length - 1; i++) {
      leftSum += Math.max(slice[i].score, 0.001);
      const diff = Math.abs(leftSum - total / 2);
      if (diff < minDiff) { minDiff = diff; splitIdx = i + 1; }
    }
    const leftSlice = slice.slice(0, splitIdx);
    const rightSlice = slice.slice(splitIdx);
    const ratio = leftSlice.reduce((s, t) => s + Math.max(t.score, 0.001), 0) / total;
    if (rect.w > rect.h) {
      const wLeft = rect.w * ratio;
      partition(leftSlice, { x: rect.x, y: rect.y, w: wLeft, h: rect.h });
      partition(rightSlice, { x: rect.x + wLeft, y: rect.y, w: rect.w - wLeft, h: rect.h });
    } else {
      const hTop = rect.h * ratio;
      partition(leftSlice, { x: rect.x, y: rect.y, w: rect.w, h: hTop });
      partition(rightSlice, { x: rect.x, y: rect.y + hTop, w: rect.w, h: rect.h - hTop });
    }
  }
  partition(nodes, { x: 0, y: 0, w: 100, h: 100 });
  return nodes;
}

// « 14,2 % » : virgule décimale, un chiffre, espace insécable avant le %.
// Part et variation se lisent côte à côte sur une même tuile : elles doivent
// se composer pareil, d'où une seule primitive.
function formatPct(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} %`;
}

// « +7,8 % » / « −22,0 % » : le signe porte le sens de la variation, ce qui
// interdit de le réutiliser dans une phrase qui dit déjà « en baisse de ».
function formatGrowth(growth: number): string {
  const sign = growth > 0 ? "+" : growth < 0 ? "−" : "";
  return `${sign}${formatPct(Math.abs(growth))}`;
}

/** Le nom d'un enjeu ne doit JAMAIS s'afficher rogné. S'il ne tient pas dans la
 *  tuile, on n'y montre que le symbole (règle d'Adrien, 30-08 : « quand ça
 *  rentre pas, on voit juste le symbole »). Le nom complet reste au survol,
 *  dans la tuile dépliée et dans l'aria-label.
 *
 *  Pourquoi mesurer plutôt que de régler ça en CSS : « est-ce que ça rentre ? »
 *  dépend de la LONGUEUR du nom autant que de la taille de la tuile.
 *  « Immigration » tient là où « Droits, libertés, minorités et discrimination »
 *  déborde de deux lignes. Ni une requête de conteneur ni un seuil d'aire ne
 *  peuvent répondre à ça — seule la boîte rendue le sait.
 *
 *  ⚠️ LE PIÈGE, et comment il est évité : cacher le nom libère la place, donc
 *  il « rentre » de nouveau, donc on le remontre, donc il déborde… Le cycle est
 *  brisé en ne mesurant JAMAIS un nom déjà caché : à chaque changement de
 *  taille on le remet, on mesure, puis on tranche une fois. */
function useNomTient(ref: React.RefObject<HTMLDivElement | null>, cle: string) {
  const [tient, setTient] = useState(true);
  const [taille, setTaille] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setTaille(`${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // On mesure TOUJOURS la mise en page AVEC le nom : la classe est retirée le
    // temps de la lecture, puis React la remet s'il le faut. Un premier jet
    // faisait ça avec deux effets d'état qui se répondaient — il cachait des
    // noms qui tenaient, parce que la mesure tombait parfois sur une boîte déjà
    // privée de son nom. Ici la lecture est synchrone et sans aller-retour.
    // ⚠️ On RESTAURE nous-mêmes la classe après la lecture. Un premier jet
    // comptait sur React pour la remettre au rendu suivant : quand `tient`
    // valait déjà `false`, `setTient(false)` ne changeait rien, React ne
    // re-rendait pas, et la classe restait retirée. Le nom réapparaissait donc
    // rogné — exactement le défaut que ce crochet doit empêcher, et il est
    // parti en dev avant d'être vu (« ouvernements et gouvernanc », 30-08).
    const etaitCache = el.classList.contains("gt-title-sans-nom");
    el.classList.remove("gt-title-sans-nom");
    // ⚠️ Ne PAS se fier à `scrollHeight` : la boîte est un flex en colonne
    // centré, et un contenu trop haut y déborde des DEUX côtés. Le débordement
    // vers le haut n'entre pas dans `scrollHeight`, qui reste alors égal à
    // `clientHeight` — le nom était rogné et la mesure disait que tout allait
    // bien (constaté sur « Environnement et énergie » et « Droits, libertés… »).
    // On additionne donc la hauteur des enfants, ce que le centrage ne cache pas.
    // ⛔ MESURER L'ÉTENDUE RÉELLE DU TEXTE, avec un `Range`, et rien d'autre.
    //
    // Trois métriques ont échoué avant celle-ci, chacune pour une raison
    // différente, et toutes les trois annonçaient « ça rentre » pendant que le
    // lecteur voyait un nom écrasé :
    //   1. la BOÎTE du nom contre celle de la tuile — le nom est un élément
    //      flex, il rétrécissait, sa boîte tenait toujours (d'où `flex-shrink: 0`) ;
    //   2. `offsetHeight` des enfants — cette propriété N'EXISTE PAS sur un
    //      élément SVG, et le symbole en est un : la somme valait `NaN`, et
    //      `NaN > x` est toujours faux ;
    //   3. `scrollWidth` / `scrollHeight` — ils ne comptent QUE le débordement
    //      vers la droite et vers le bas. Le nom est centré : quand il est trop
    //      large, il déborde des DEUX côtés, et `scrollWidth` renvoie 0. Mesuré
    //      sur « Gouvernements et gouvernance » : 14px perdus à gauche, 14 à
    //      droite, `scrollWidth - clientWidth = 0`.
    //
    // Un `Range` sur le contenu rend l'union des lignes de texte réellement
    // peintes, débordements compris, dans les quatre directions. C'est la seule
    // mesure qui s'accorde avec la capture d'écran.
    const boite = el.getBoundingClientRect();
    const nom = el.querySelector<HTMLElement>(".gt-title-nom");
    let deborde = false;
    if (nom) {
      const portee = document.createRange();
      portee.selectNodeContents(nom);
      const texte = portee.getBoundingClientRect();
      // 1px de tolérance : les bords tombent souvent sur des demi-pixels.
      deborde =
        texte.left < boite.left - 1 ||
        texte.right > boite.right + 1 ||
        texte.top < boite.top - 1 ||
        texte.bottom > boite.bottom + 1;
    }
    if (etaitCache) el.classList.add("gt-title-sans-nom");
    setTient(!deborde);
  }, [taille, cle, ref]);

  return tient;
}

function GrowthTile({
  tile,
  depuis,
  expanded,
  muted,
  onExpand,
  onPreview,
}: {
  tile: LayoutNode;
  /** À quoi la variation se compare (« 15h », « hier 23h ») ; commun aux 12. */
  depuis: string | null;
  expanded: boolean;
  muted: boolean;
  onExpand: (issueKey: string | null) => void;
  onPreview: (tile: LayoutNode | null) => void;
}) {
  const area = tile.rect.w * tile.rect.h;
  const size = area < 150 ? "tiny" : area < 450 ? "small" : area < 1100 ? "medium" : "large";
  const isTiny = size === "tiny";
  // Une tuile TRÈS PLATE ne peut pas porter le symbole ET la part : mesuré sur
  // la tuile Santé (24 px de haut pour 38 px de contenu), le symbole poussait
  // le chiffre hors du cadre. Or c'est la part qui est le nombre principal.
  // 6,5 % des 680 px du treemap ≈ 44 px, la hauteur en dessous de laquelle les
  // deux ne tiennent plus. Même unité abstraite que les seuils d'aire au-dessus.
  const plat = tile.rect.h < 6.5;
  const needsTip = size === "small" || isTiny;
  const titreRef = useRef<HTMLDivElement>(null);
  const nomTient = useNomTient(titreRef, tile.issueKey);
  const mainArticle = tile.articles[0];
  const mediaLabel = mainArticle?.outlets.map((outlet) => outlet.name).join(" · ") ?? "";

  // « depuis 15h » ne tient que sur une grande tuile ; ailleurs il se lit au
  // survol et dans la tuile dépliée. Même arbitrage que le libellé de la part.
  const depuisSpan = depuis ? <span className="gt-depuis">depuis {depuis}</span> : null;

  const growthSpan = (
    <span className="gt-pct">
      {tile.velocity === 1 && <span className="gt-up">▲</span>}
      {tile.velocity === -1 && <span className="gt-down">▼</span>}
      {tile.growth === null ? (tile.velocity === 1 ? "nouv." : "") : formatGrowth(tile.growth)}
    </span>
  );

  // La surface de la tuile porte déjà la part, mais elle ne se lit pas au
  // chiffre près : deux tuiles voisines se comparent mal à l'oeil. Le libellé
  // n'accompagne que les grandes tuiles, assez pour dire une fois ce qu'est ce
  // nombre; les autres se lisent par analogie.
  const shareSpan = (
    <span className="gt-share">
      <span className="gt-share-num">{formatPct(tile.share)}</span>
      <span className="gt-share-kicker">Part de l&apos;attention</span>
    </span>
  );

  // Sur une tuile minuscule, les deux nombres se chevauchaient et se coupaient
  // au bord. La part reste chiffrée, la variation se réduit à sa flèche : le
  // sens survit, le chiffre exact se lit au survol et dans le panneau déplié
  // (l'aria-label, lui, énonce toujours les deux).
  const inner = isTiny ? (
    <div className="gt-compact">
      {/* Le nom y était rogné jusqu'à ne plus désigner personne (« ducation »
          sur la tuile Éducation, mesuré le 29-08). Le symbole, lui, reste
          entier : à cette taille, c'est LUI l'étiquette. Le nom complet se lit
          au survol et dans la tuile dépliée, et l'aria-label le dit toujours. */}
      {!plat && <SymboleEnjeu cle={tile.issueKey} className="gt-symbole-seul" />}
      <span className="gt-figures">
        {shareSpan}
        <span className="gt-pct gt-pct-arrow" aria-hidden="true">
          {tile.velocity === 1 && <span className="gt-up">▲</span>}
          {tile.velocity === -1 && <span className="gt-down">▼</span>}
        </span>
      </span>
    </div>
  ) : (
    <>
      <div className="gt-head">
        {shareSpan}
        <span className="gt-variation">
          {growthSpan}
          {depuisSpan}
        </span>
      </div>
      <div className="gt-body">
        <div className={`gt-title${nomTient ? "" : " gt-title-sans-nom"}`} ref={titreRef}>
          <SymboleEnjeu cle={tile.issueKey} />
          <span className="gt-title-nom">{tile.issueFr}</span>
        </div>
        {mainArticle && !needsTip && (
          <div className="gt-preview">
            <span className="gt-preview-head">{mainArticle.title}</span>
            {mediaLabel && <span className="gt-preview-media">{mediaLabel}</span>}
          </div>
        )}
      </div>
    </>
  );

  // Un lecteur d'écran ne voit ni la flèche ni la couleur : la variation doit
  // se dire en toutes lettres, sinon une hausse et une baisse s'annoncent pareil.
  const growthAria = tile.growth === null
    ? "variation non calculable"
    : tile.growth === 0
      ? "saillance stable depuis le traitement précédent"
      : `${tile.growth > 0 ? "en hausse de" : "en baisse de"} ${formatPct(Math.abs(tile.growth))} depuis ${depuis ?? "le traitement précédent"}`;

  const containerStyle: React.CSSProperties = expanded
    ? { left: "0%", top: "0%", width: "100%", height: "100%" }
    : {
        left: `${tile.rect.x.toFixed(2)}%`,
        top: `${tile.rect.y.toFixed(2)}%`,
        width: `${tile.rect.w.toFixed(2)}%`,
        height: `${tile.rect.h.toFixed(2)}%`,
      };

  return (
    <div
      className={`gt-container${expanded ? " gt-container-expanded" : ""}${muted ? " gt-container-muted" : ""}`}
      style={containerStyle}
      tabIndex={muted ? -1 : 0}
      aria-expanded={expanded}
      aria-label={`${tile.issueFr}\u00a0: ${formatPct(tile.share)} de l'attention médiatique, ${growthAria}. Cliquer pour afficher toutes les actualités associées`}
      onClick={(event) => {
        if (!expanded && !(event.target as HTMLElement).closest("a, button")) {
          onPreview(null);
          onExpand(tile.issueKey);
        }
      }}
      onMouseEnter={() => {
        if (!expanded && needsTip) onPreview(tile);
      }}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => {
        if (!expanded && needsTip) onPreview(tile);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onPreview(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          onExpand(null);
          event.currentTarget.blur();
        } else if (!expanded && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onPreview(null);
          onExpand(tile.issueKey);
        }
      }}
    >
      <div className={`gt-tile gt-${size}${mainArticle ? " gt-has-news" : ""}`} style={{ "--c": tile.color } as React.CSSProperties}>
        <div className="gt-collapsed" aria-hidden={expanded}>{inner}</div>
        {expanded && (
          <div className="gt-expanded-panel">
            <div className="gt-expanded-header">
              <div>
                <span className="gt-expanded-kicker">Enjeu saillant</span>
                <h3><SymboleEnjeu cle={tile.issueKey} />{tile.issueFr}</h3>
                <span className="gt-expanded-count">
                  {tile.articles.length} actualité{tile.articles.length > 1 ? "s" : ""} associée{tile.articles.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="gt-expanded-growth">
                <button type="button" className="gt-expanded-close" onClick={() => onExpand(null)}>
                  Fermer <span aria-hidden="true">×</span>
                </button>
                <span className="gt-expanded-share">{formatPct(tile.share)}</span>
                <span className="gt-expanded-label">Part de l&apos;attention médiatique</span>
                {growthSpan}
                <span className="gt-expanded-label">
                  {depuis ? `Variation depuis ${depuis}` : "Variation depuis le traitement précédent"}
                </span>
              </div>
            </div>

            {tile.articles.length > 0 ? (
              <div className="gt-expanded-list" role="list">
                {tile.articles.map((article, index) => (
                  <article className="gt-expanded-story" role="listitem" key={`${article.title}-${index}`}>
                    <span className="gt-expanded-index">{String(index + 1).padStart(2, "0")}</span>
                    {article.url ? (
                      <a className="gt-expanded-title" href={article.url} target="_blank" rel="noopener noreferrer">
                        {article.title}<span aria-hidden="true"> ↗</span>
                      </a>
                    ) : (
                      <div className="gt-expanded-title">{article.title}</div>
                    )}
                    {article.sommet && (
                      <div className="gt-expanded-sommet">Sommet {article.sommet.libelle}</div>
                    )}
                    {article.outlets.length > 0 && (
                      <div className="gt-expanded-outlets" aria-label="Médias associés à cette actualité">
                        {article.outlets.map((outlet) => outlet.url ? (
                          <a key={outlet.name} href={outlet.url} target="_blank" rel="noopener noreferrer">{outlet.name}</a>
                        ) : (
                          <span key={outlet.name}>{outlet.name}</span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="gt-expanded-empty">Aucune actualité saillante pour cet enjeu sur cette période.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GrowthTip({ tile, depuis }: { tile: LayoutNode; depuis: string | null }) {
  const article = tile.articles[0];
  if (!article) return null;
  const cx = tile.rect.x + tile.rect.w / 2;
  const cy = tile.rect.y + tile.rect.h / 2;
  const style: React.CSSProperties = { position: "absolute" };
  if (cx > 58) style.right = `${(100 - (tile.rect.x + tile.rect.w)).toFixed(2)}%`;
  else style.left = `${tile.rect.x.toFixed(2)}%`;
  if (cy > 52) style.bottom = `${(100 - tile.rect.y).toFixed(2)}%`;
  else style.top = `${(tile.rect.y + tile.rect.h).toFixed(2)}%`;
  const mediaLabel = article.outlets.map((outlet) => outlet.name).join(" · ");

  return (
    <div className="gt-tip" style={style}>
      <div className="gt-tip-name" style={{ "--c": tile.color } as React.CSSProperties}>
        <SymboleEnjeu cle={tile.issueKey} />
        {tile.issueFr}
      </div>
      <dl className="gt-tip-figures">
        <dt>Part de l&apos;attention</dt>
        <dd>{formatPct(tile.share)}</dd>
        <dt>{depuis ? `Variation depuis ${depuis}` : "Variation"}</dt>
        <dd>
          {tile.velocity === 1 && <span className="gt-up">▲</span>}
          {tile.velocity === -1 && <span className="gt-down">▼</span>}
          {tile.growth === null ? (tile.velocity === 1 ? "nouv." : "n.d.") : formatGrowth(tile.growth)}
        </dd>
      </dl>
      <div className="gt-tip-head">{article.title}</div>
      {mediaLabel && <div className="gt-tip-media">{mediaLabel}</div>}
      <div className="gt-tip-action">Cliquer pour tout voir</div>
    </div>
  );
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function fmtDate(d: string): string {
  const p = d.split("-");
  if (p.length < 3) return d;
  return `${parseInt(p[2], 10)} ${MOIS[parseInt(p[1], 10) - 1] ?? ""}`;
}

/** L'étiquette d'un point de la frise. À la période JOUR, tous les points
 *  partagent la même date et seule l'HEURE les distingue : la date n'y
 *  apprendrait rien et se répéterait six fois. Ailleurs, c'est la date. */
function libelleAxe(pt: TreemapHistoryPoint, period: RankPeriod): string {
  // `jourMontreal` et non `pt.date` : sur les tables hebdo et mensuelle, `date`
  // est une date arbitraire prise DANS la fenêtre du tag, pas le jour de la
  // passe. L'axe portait donc des étiquettes décalées.
  if (period !== "day") return fmtDate(jourMontreal(pt));
  const m = heurePublicationMontreal(pt.tag);
  if (!m) return fmtDate(pt.date);
  return m.heure >= 24 ? "minuit" : `${m.heure}h`;
}
function domainOf(u: string | null): string {
  if (!u) return "";
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Courbe lissée : tangentes horizontales -> S élégant, sans dépassement vertical.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const dx = (p1.x - p0.x) * 0.5;
    d += ` C ${(p0.x + dx).toFixed(1)},${p0.y.toFixed(1)} ${(p1.x - dx).toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}

function rankLabel(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

function movementLabel(delta: number): string {
  if (delta === 0) return "Rang stable";
  const count = Math.abs(delta);
  return `${delta > 0 ? "En hausse" : "En baisse"} de ${count} rang${count > 1 ? "s" : ""}`;
}

function movementCompact(delta: number): string {
  if (delta === 0) return "=";
  return `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)}`;
}

function IssuesRankMobile({
  tiles,
  history,
  period,
}: {
  tiles: TreemapIssueTile[];
  history: TreemapHistoryPoint[];
  period: RankPeriod;
}) {
  const points = rankPointsForPeriod(history, period);
  const latestRanks = points.at(-1)?.ranks ?? {};
  const rankedTiles = [...tiles].sort(
    (a, b) => (latestRanks[a.issueKey] ?? 12) - (latestRanks[b.issueKey] ?? 12),
  );
  const [selectedKey, setSelectedKey] = useState(rankedTiles[0]?.issueKey ?? "");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const selected = tiles.find((tile) => tile.issueKey === selectedKey) ?? rankedTiles[0];

  if (points.length <= 1 || !selected) {
    return (
      <div className="issues-rank-mobile irm-container">
        <p className="irm-empty">Pas assez de données historiques pour générer le graphique de classement.</p>
      </div>
    );
  }

  const VB_W = 360;
  const VB_H = 248;
  const PAD_L = 24;
  const PAD_R = 28;
  const PAD_T = 20;
  const PAD_B = 38;
  const plotW = VB_W - PAD_L - PAD_R;
  const plotH = VB_H - PAD_T - PAD_B;
  const plotRight = PAD_L + plotW;
  const getX = (index: number) => PAD_L + index * (plotW / Math.max(points.length - 1, 1));
  const getY = (rank: number) => PAD_T + (rank - 1) * (plotH / 11);
  const movement = rankMovement(points, selected.issueKey);
  const selectedPoints = points.map((point, index) => ({
    x: getX(index),
    y: getY(point.ranks[selected.issueKey] ?? 12),
    rank: point.ranks[selected.issueKey] ?? 12,
  }));
  const focusArticles = selected.articles.length > 0
    ? selected.articles.slice(0, 5)
    : selected.context
      ? [{ title: selected.context, url: selected.url, outlets: [], sommet: null }]
      : [];
  const orderedLines = [...tiles].sort(
    (a, b) => (a.issueKey === selected.issueKey ? 1 : 0) - (b.issueKey === selected.issueKey ? 1 : 0),
  );

  return (
    <div className="issues-rank-mobile irm-container">
      <div className="irm-focus-header">
        <div>
          <span className="irm-kicker">Trajectoire suivie</span>
          <h3 style={{ "--c": selected.color } as React.CSSProperties}>{selected.issueFr}</h3>
        </div>
        <div className="irm-summary">
          <strong>{rankLabel(movement.endRank)}</strong>
          <span>{movementLabel(movement.delta)}</span>
        </div>
      </div>

      <svg
        className="irm-chart"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Évolution du rang de ${selected.issueFr}, de ${rankLabel(movement.startRank)} à ${rankLabel(movement.endRank)}`}
      >
        {[1, 6, 12].map((rank) => (
          <g key={rank}>
            <line x1={PAD_L} y1={getY(rank)} x2={plotRight} y2={getY(rank)} className="irm-guide" />
            <text x={PAD_L - 7} y={getY(rank) + 3} textAnchor="end" className="irm-rank-axis">{rank}</text>
          </g>
        ))}

        {orderedLines.map((tile) => {
          const linePoints = points.map((point, index) => ({
            x: getX(index),
            y: getY(point.ranks[tile.issueKey] ?? 12),
          }));
          const active = tile.issueKey === selected.issueKey;
          return (
            <path
              key={tile.issueKey}
              d={smoothPath(linePoints)}
              className={active ? "irm-line active" : "irm-line"}
              stroke={active ? tile.color : "var(--ink)"}
            />
          );
        })}

        {selectedPoints.map((point, index) => {
          const previousRank = selectedPoints[index - 1]?.rank;
          if (index !== 0 && index !== selectedPoints.length - 1 && point.rank === previousRank) return null;
          return <circle key={index} cx={point.x} cy={point.y} r={index === selectedPoints.length - 1 ? 13 : 3.5} fill={selected.color} />;
        })}
        <text x={plotRight} y={selectedPoints.at(-1)!.y + 4} textAnchor="middle" className="irm-current-rank">
          {movement.endRank}
        </text>
        <text x={PAD_L} y={VB_H - 8} textAnchor="start" className="irm-date">{libelleAxe(points[0], period)}</text>
        <text x={plotRight} y={VB_H - 8} textAnchor="end" className="irm-date">{libelleAxe(points.at(-1)!, period)}</text>
      </svg>

      <div className="irm-selector" aria-label="Choisir un enjeu à suivre">
        {rankedTiles.map((tile) => {
          const tileMovement = rankMovement(points, tile.issueKey);
          const active = tile.issueKey === selected.issueKey;
          const expanded = tile.issueKey === expandedKey;
          return (
            <div className={`irm-issue-block${active ? " active" : ""}${expanded ? " expanded" : ""}`} key={tile.issueKey}>
              <button
                type="button"
                className={`irm-issue${active ? " active" : ""}${expanded ? " expanded" : ""}`}
                style={{ "--c": tile.color } as React.CSSProperties}
                aria-expanded={expanded}
                onClick={() => {
                  setSelectedKey(tile.issueKey);
                  setExpandedKey((current) => current === tile.issueKey ? null : tile.issueKey);
                }}
              >
                <span className="irm-issue-rank">{tileMovement.endRank}</span>
                <span className="irm-issue-name">{tile.issueFr}</span>
                <span className={`irm-issue-movement ${tileMovement.delta > 0 ? "up" : tileMovement.delta < 0 ? "down" : "flat"}`}>
                  {movementCompact(tileMovement.delta)}
                </span>
                <span className="irm-issue-toggle" aria-hidden="true">{expanded ? "−" : "+"}</span>
              </button>

              {expanded && (
                <div className="irm-news irm-inline-news">
                  <div className="irm-news-heading">
                    <span>À la Une</span>
                    <strong>{selected.issueFr}</strong>
                  </div>
                  {focusArticles.length > 0 ? focusArticles.map((article, index) => (
                    <article className="irm-article" key={`${article.title}-${index}`}>
                      {article.url ? (
                        <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
                      ) : (
                        <span>{article.title}</span>
                      )}
                      {article.outlets.length > 0 && (
                        <div className="irm-article-outlets">
                          {article.outlets.map((outlet) => outlet.url ? (
                            <a key={outlet.name} href={outlet.url} target="_blank" rel="noopener noreferrer">{outlet.name}</a>
                          ) : (
                            <span key={outlet.name}>{outlet.name}</span>
                          ))}
                        </div>
                      )}
                    </article>
                  )) : (
                    <p className="irm-no-news">Aucune actualité saillante pour cet enjeu sur cette période.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Graphique de rang (« bump chart ») : trajectoire du classement des 12 enjeux dans le temps,
 * avec panneau « À la une » qui liste les actualités de l'enjeu sélectionné (clic) ou survolé.
 * Affiché pour les vues « Semaine » (7 derniers jours) et « Campagne » (mois courant).
 */
function IssuesRankChart({ tiles, history, period }: { tiles: TreemapIssueTile[]; history: TreemapHistoryPoint[]; period: RankPeriod }) {
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);

  const containerStyle: React.CSSProperties = {
    background: "var(--paper)",
    border: "0.5px solid var(--rule)",
    padding: "30px 34px 26px",
    marginTop: "4px",
    position: "relative"
  };

  if (history.length <= 1) {
    return (
      <div className="spaghetti-container" style={containerStyle}>
        <p style={{ fontFamily: "Source Serif 4, serif", fontStyle: "italic", textAlign: "center", padding: "40px", color: "var(--ink-soft)" }}>
          Pas assez de données historiques pour générer le graphique de classement.
        </p>
      </div>
    );
  }

  const points = rankPointsForPeriod(history, period);

  const VB_W = 1200;
  const VB_H = 640;
  const PAD_L = 50;
  const PAD_R = 252;
  const PAD_T = 44;
  const PAD_B = 58;
  const plotW = VB_W - PAD_L - PAD_R;
  const plotTop = PAD_T;
  const plotBottom = VB_H - PAD_B;
  const rowStep = (plotBottom - plotTop) / 11;
  const n = points.length;
  const labelEvery = n <= 11 ? 1 : Math.ceil(n / 9);
  const getX = (idx: number) => (n <= 1 ? PAD_L + plotW / 2 : PAD_L + idx * (plotW / (n - 1)));
  const getY = (rank: number) => plotTop + (rank - 1) * rowStep;
  const plotRight = PAD_L + plotW;

  const activeLine = selectedLine ?? hoveredLine;
  const isAnyActive = activeLine !== null;
  const orderedTiles = [...tiles].sort(
    (a, b) => (a.issueKey === activeLine ? 1 : 0) - (b.issueKey === activeLine ? 1 : 0)
  );
  const fadeColor = "rgba(110,104,95,0.13)";

  const focus =
    tiles.find((t) => t.issueKey === selectedLine) ??
    tiles.find((t) => t.issueKey === hoveredLine) ??
    tiles[0];
  const focusArticles = focus
    ? (focus.articles.length > 0 ? focus.articles.slice(0, 5) : (focus.context ? [{ title: focus.context, url: focus.url, outlets: [], sommet: null }] : []))
    : [];

  return (
    <div className="spaghetti-container" style={containerStyle}>
      <div style={{ marginBottom: "18px", fontFamily: "Source Serif 4, serif", fontStyle: "italic", fontSize: "14.5px", color: "var(--ink-soft)", lineHeight: 1.5, maxWidth: "74ch" }}>
        Évolution du rang de saillance des douze enjeux, {period === "day" ? "publication après publication" : "jour après jour"}. Le rang 1 est l&apos;enjeu le plus saillant; cliquez sur un enjeu pour l&apos;isoler et afficher ses actualités.
      </div>

      <div style={{ overflowX: "auto", overflowY: "hidden" }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ display: "block", width: "100%", minWidth: "660px", height: "auto" }}>
        {/* Filets de rang très discrets (les pastilles portent le rang) */}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((rank) => (
          <line key={`guide-${rank}`} x1={PAD_L} y1={getY(rank)} x2={plotRight} y2={getY(rank)} stroke="var(--rule-faint)" strokeWidth="0.75" opacity={0.4} />
        ))}

        {/* Axe des dates */}
        {points.map((pt, idx) => {
          const x = getX(idx);
          const showLabel = idx % labelEvery === 0 || idx === n - 1;
          return (
            <g key={`date-${idx}`}>
              <line x1={x} y1={plotBottom + 10} x2={x} y2={plotBottom + (showLabel ? 17 : 13)} stroke="var(--rule)" strokeWidth="0.75" />
              {showLabel && (
                <text x={x} y={plotBottom + 38} textAnchor="middle" style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "14px", letterSpacing: "0.02em", fill: "var(--ink-softer)" }}>
                  {libelleAxe(pt, period)}
                </text>
              )}
            </g>
          );
        })}

        {/* Courbes de classement */}
        {orderedTiles.map((tile) => {
          const key = tile.issueKey;
          const linePts = points.map((pt, idx) => ({ x: getX(idx), y: getY(pt.ranks[key] ?? 12) }));
          const isActive = activeLine === key;
          const isSelected = selectedLine === key;
          const dimmed = isAnyActive && !isActive;
          const strokeColor = dimmed ? fadeColor : tile.color;
          const strokeWidth = isActive ? 9.5 : dimmed ? 2.5 : 6.5;
          const lastRank = points[points.length - 1]?.ranks[key] ?? 12;
          const endY = getY(lastRank);
          const handlers = {
            onMouseEnter: () => setHoveredLine(key),
            onMouseLeave: () => setHoveredLine(null),
            onClick: () => setSelectedLine((prev) => (prev === key ? null : key))
          };

          return (
            <g key={key} style={{ cursor: "pointer" }} {...handlers}>
              <path
                d={smoothPath(linePts)}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke 0.18s ease, stroke-width 0.18s ease" }}
              />
              <circle cx={linePts[0].x} cy={linePts[0].y} r={isActive ? 7 : 5} fill={dimmed ? fadeColor : tile.color} style={{ transition: "r 0.18s ease, fill 0.18s ease" }} />
              {points.map((pt, idx) => {
                if (idx === 0 || idx === points.length - 1) return null;
                const rank = pt.ranks[key] ?? 12;
                const prevRank = points[idx - 1].ranks[key] ?? 12;
                if (rank === prevRank) return null;
                return (
                  <circle key={idx} cx={getX(idx)} cy={getY(rank)} r={isActive ? 7 : 5} fill={dimmed ? fadeColor : tile.color} style={{ transition: "r 0.18s ease, fill 0.18s ease" }} />
                );
              })}
              {isSelected && (
                <circle cx={plotRight} cy={endY} r={24} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
              )}
              <circle cx={plotRight} cy={endY} r={isActive ? 21 : 19} fill={dimmed ? fadeColor : tile.color} style={{ transition: "r 0.18s ease, fill 0.18s ease" }} />
              <text x={plotRight} y={endY + 7} textAnchor="middle" style={{ fontFamily: "Playfair Display, serif", fontSize: "20px", fontWeight: 900, fill: "var(--paper)", opacity: dimmed ? 0.5 : 1, pointerEvents: "none", transition: "opacity 0.18s ease" }}>
                {lastRank}
              </text>
              <text
                x={plotRight + 32}
                y={endY + 5}
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: "15px",
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.04em",
                  fill: isActive ? "var(--ink)" : "var(--ink-soft)",
                  textTransform: "uppercase",
                  opacity: dimmed ? 0.34 : 1,
                  transition: "fill 0.18s ease, opacity 0.18s ease, font-weight 0.18s ease"
                }}
              >
                {tile.issueFr}
              </text>
            </g>
          );
        })}
      </svg>
      </div>

      {/* À la une : actualités de l'enjeu ciblé (sélectionné par clic, sinon survolé, sinon le meneur) */}
      {focus && (
        <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "0.5px solid var(--rule)", display: "flex", gap: "34px", alignItems: "flex-start", flexWrap: "wrap", minHeight: "120px" }}>
          <div style={{ flex: "0 0 auto", maxWidth: "220px" }}>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "10px", letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--cordovan)" }}>
              À la Une
            </div>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "13px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink)", borderBottom: `2px solid ${focus.color}`, paddingBottom: "5px", marginTop: "10px", display: "inline-block" }}>
              {focus.issueFr}
            </div>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "9.5px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-softer)", marginTop: "12px", lineHeight: 1.6 }}>
              {selectedLine === focus.issueKey ? "Enjeu épinglé. Cliquez de nouveau pour libérer." : "Cliquez un enjeu pour l'épingler."}
            </div>
          </div>
          <div style={{ flex: "1 1 380px", minWidth: "300px" }}>
            {focusArticles.length > 0 ? (
              focusArticles.map((a, i) =>
                a.url ? (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="fil-article">
                    <span className="fil-titre">{a.title}</span>
                    <span className="fil-meta">
                      {a.sommet && <span className="fil-sommet">Sommet {a.sommet.libelle}</span>}
                      {domainOf(a.url) && <span className="fil-source">{domainOf(a.url)} ↗</span>}
                    </span>
                  </a>
                ) : (
                  <div key={i} className="fil-article">
                    <span className="fil-titre">{a.title}</span>
                    {a.sommet && <span className="fil-meta"><span className="fil-sommet">Sommet {a.sommet.libelle}</span></span>}
                  </div>
                )
              )
            ) : (
              <p style={{ fontFamily: "Source Serif 4, serif", fontStyle: "italic", fontSize: "15px", color: "var(--ink-soft)", margin: 0 }}>
                Aucune actualité saillante pour cet enjeu sur cette période.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TreemapClient({ data, editionKey }: { data: TreemapAllPeriods; editionKey?: string }) {
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  // Deux contrôles INDÉPENDANTS depuis le 30-08 : la période et la
  // représentation. Chacune des trois périodes se regarde des deux façons —
  // avant, la répartition n'existait que pour le jour et l'évolution que pour
  // la semaine et la campagne, et on ne pouvait pas comparer autrement.
  // Le mode ne se réinitialise PAS en changeant de période : c'est ce qui
  // permet de suivre la même lecture d'une fenêtre à l'autre.
  const [mode, setMode] = useState<"repartition" | "evolution">("repartition");
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [tipTile, setTipTile] = useState<LayoutNode | null>(null);
  const [secret, setSecret] = useState(false);
  // Flappy vit dans la vue d'ÉVOLUTION du mois : le code force donc les deux.
  useKonamiCode(() => { setTipTile(null); setExpandedIssue(null); setPeriod("month"); setMode("evolution"); setSecret(true); });

  // Déverrouillage mobile / tactile : 3 clics/taps rapides sur le titre du module
  const tapCount = useRef(0);
  const tapTimer = useRef<number | null>(null);
  const handleTitleTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    if (tapCount.current >= 3) {
      tapCount.current = 0;
      setTipTile(null);
      setExpandedIssue(null);
      setPeriod("month");
      setMode("evolution");
      setSecret(true);
    } else {
      tapTimer.current = window.setTimeout(() => {
        tapCount.current = 0;
      }, 1000);
    }
  };

  const current = data[period];
  const tiles = current.tiles;
  const layout = computeTreemapLayout(tiles);
  const selectPeriod = (nextPeriod: "day" | "week" | "month") => {
    setTipTile(null);
    setExpandedIssue(null);
    setPeriod(nextPeriod);
  };
  const expandIssue = (issueKey: string | null) => {
    setTipTile(null);
    setExpandedIssue(issueKey);
  };

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title" onClick={handleTitleTap} style={{ cursor: "pointer" }}>
            Les 12 enjeux de la campagne{" "}
            <InfoTip size="lg" label="Comment interpréter cette visualisation">
              <b>Comment interpréter cette visualisation&nbsp;:</b><br /><br />
              • <b>Répartition</b>&nbsp;: Chaque tuile représente un enjeu. Sa surface est proportionnelle à sa saillance médiatique du jour. Le grand pourcentage donne sa <b>part de l’attention médiatique</b> (les 12 parts totalisent 100&nbsp;%), et le second, fléché, sa <b>variation</b> depuis le traitement précédent. Survolez une tuile pour voir son actualité principale et les médias qui la couvrent; cliquez pour afficher toutes les actualités associées.<br /><br />
              • <b>Évolution</b>&nbsp;: Le graphique retrace l’évolution du classement des 12 enjeux, jour après jour pour la semaine et la campagne, publication après publication pour le jour. «&nbsp;Campagne&nbsp;» couvre le mois courant, la plus large fenêtre dont ce module dispose. Cliquez sur un enjeu pour l’isoler et afficher ses actualités récentes. Sur mobile, touchez un rang pour suivre sa trajectoire et déplier ses actualités; les autres trajectoires restent visibles en arrière-plan.<br />
              <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/methodologie/#enjeux-saillants`}>En savoir plus sur la méthodologie →</a>
            </InfoTip>
          </h2>
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline">
              <span
                className={period === "day" ? "active" : undefined}
                onClick={() => selectPeriod("day")}
                style={{ cursor: "pointer" }}
              >
                Jour
              </span>
              <span
                className={period === "week" ? "active" : undefined}
                onClick={() => selectPeriod("week")}
                style={{ cursor: "pointer" }}
              >
                Semaine
              </span>
              <span
                className={period === "month" ? "active" : undefined}
                onClick={() => selectPeriod("month")}
                style={{ cursor: "pointer" }}
              >
                Campagne
              </span>
            </div>
            <div className="legend-toggle inline mode-toggle">
              <span
                className={mode === "repartition" ? "active" : undefined}
                onClick={() => { setTipTile(null); setExpandedIssue(null); setMode("repartition"); }}
                style={{ cursor: "pointer" }}
                title="La part de chaque enjeu, en tuiles proportionnelles"
              >
                Répartition
              </span>
              <span
                className={mode === "evolution" ? "active" : undefined}
                onClick={() => { setTipTile(null); setExpandedIssue(null); setMode("evolution"); }}
                style={{ cursor: "pointer" }}
                title="L'évolution du rang des douze enjeux"
              >
                Évolution
              </span>
            </div>
            <ShareButton title="Les 12 enjeux de la campagne" anchor="enjeux-saillants" editionKey={editionKey} />
          </div>
        </div>
      </div>

      {mode === "repartition" ? (
        <>
          <div className="treemap-growth">
            {layout.map((tile) => (
              <GrowthTile
                key={tile.issueKey}
                tile={tile}
                depuis={current.growthSince}
                expanded={expandedIssue === tile.issueKey}
                muted={expandedIssue !== null && expandedIssue !== tile.issueKey}
                onExpand={expandIssue}
                onPreview={setTipTile}
              />
            ))}
            {tipTile && expandedIssue === null && <GrowthTip tile={tipTile} depuis={current.growthSince} />}
          </div>

          <div className="treemap-mobile" aria-label="Sujets du jour par enjeu et saillance">
            <div className="tm-bar-legend">
              <span>Couleur = enjeu</span>
              <span>Largeur = score</span>
              <span>% = part de l&apos;attention</span>
            </div>
            {tiles.map((tile) => {
              const barStyle = { "--c": tile.color, "--w": `${tile.relScore}%` } as React.CSSProperties;
              const barInner = (
                <>
                  <div className="tm-bar-meta">
                    <span className="tm-bar-name">
                      <SymboleEnjeu cle={tile.issueKey} />
                      {tile.issueFr}
                    </span>
                    {tile.topObject && <span className="tm-bar-enjeu">{tile.topObject}</span>}
                    <span className="tm-bar-part">{formatPct(tile.share)}</span>
                  </div>
                  <div className="tm-bar-track">
                    <div className="tm-bar-fill" />
                  </div>
                  {tile.context && <span className="tm-bar-context">{tile.context}</span>}
                </>
              );
              if (tile.url) {
                return (
                  <a key={tile.issueKey} href={tile.url} target="_blank" rel="noopener noreferrer" className="tm-bar-item" style={barStyle}>
                    {barInner}
                  </a>
                );
              }
              return <div key={tile.issueKey} className="tm-bar-item" style={barStyle}>{barInner}</div>;
            })}
          </div>
        </>
      ) : secret && period === "month" ? (
        <FlappyEnjeux tiles={tiles} onExit={() => setSecret(false)} />
      ) : (
        <>
          <div className="issues-rank-desktop">
            <IssuesRankChart tiles={tiles} history={current.history} period={period} />
          </div>
          <IssuesRankMobile tiles={tiles} history={current.history} period={period} />
        </>
      )}

      <div className="module-last-updated">{current.lastUpdated}</div>
    </>
  );
}
