"use client";

import React, { useState } from "react";
import type { TreemapIssueTile, TreemapHistoryPoint, TreemapAllPeriods } from "@/lib/data/headlineEvents";
import { ShareButton } from "@/components/interactive/ShareButton";
import { useKonamiCode } from "./useKonamiCode";
import { FlappyEnjeux } from "./FlappyEnjeux";

// --- Treemap de croissance (vue Aujourd'hui) : partition + tuiles Proto A avec % de croissance ---
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

// « +7,8 % » / « −22,0 % » — virgule décimale, un chiffre, espace insécable avant le %.
function formatGrowth(growth: number): string {
  const sign = growth > 0 ? "+" : growth < 0 ? "−" : "";
  return `${sign}${Math.abs(growth).toFixed(1).replace(".", ",")} %`;
}

function GrowthTile({ tile }: { tile: LayoutNode }) {
  const area = tile.rect.w * tile.rect.h;
  const size = area < 150 ? "tiny" : area < 450 ? "small" : area < 1100 ? "medium" : "large";
  const isTiny = size === "tiny";

  const growthSpan = (
    <span className="gt-pct">
      {tile.velocity === 1 && <span className="gt-up">▲</span>}
      {tile.velocity === -1 && <span className="gt-down">▼</span>}
      {tile.growth === null ? (tile.velocity === 1 ? "nouv." : "") : formatGrowth(tile.growth)}
    </span>
  );

  const inner = isTiny ? (
    <div className="gt-compact">
      <span className="gt-title">{tile.issueFr}</span>
      {growthSpan}
    </div>
  ) : (
    <>
      <div className="gt-head">
        {tile.context && (
          <span className="gt-news">
            <span className="gt-news-head">{tile.context}</span>
            {tile.outlets.length > 0 && (
              <span className="gt-news-media">{tile.outlets.map((o) => o.name).join(" · ")}</span>
            )}
          </span>
        )}
        {growthSpan}
      </div>
      <div className="gt-title">{tile.issueFr}</div>
    </>
  );

  // Infobulle native : nom complet + manchette + médias — utile quand la tuile est trop
  // petite pour tout afficher (le survol révèle toute l'information).
  const titleAttr = [
    tile.issueFr,
    tile.context,
    tile.outlets.length ? tile.outlets.map((o) => o.name).join(" · ") : "",
  ].filter(Boolean).join("\n");
  const shared = { className: `gt-tile gt-${size}`, style: { "--c": tile.color } as React.CSSProperties, title: titleAttr };
  const content = tile.url ? (
    <a href={tile.url} target="_blank" rel="noopener noreferrer" {...shared}>{inner}</a>
  ) : (
    <div {...shared}>{inner}</div>
  );

  return (
    <div
      className="gt-container"
      style={{
        left: `${tile.rect.x.toFixed(2)}%`,
        top: `${tile.rect.y.toFixed(2)}%`,
        width: `${tile.rect.w.toFixed(2)}%`,
        height: `${tile.rect.h.toFixed(2)}%`
      }}
    >
      {content}
    </div>
  );
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function fmtDate(d: string): string {
  const p = d.split("-");
  if (p.length < 3) return d;
  return `${parseInt(p[2], 10)} ${MOIS[parseInt(p[1], 10) - 1] ?? ""}`;
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

/**
 * Graphique de rang (« bump chart ») : trajectoire du classement des 12 enjeux dans le temps,
 * avec panneau « À la une » qui liste les actualités de l'enjeu sélectionné (clic) ou survolé.
 * Affiché pour les vues « Cette semaine » (7 derniers jours) et « Ce mois » (mois courant).
 */
function IssuesRankChart({ tiles, history, period }: { tiles: TreemapIssueTile[]; history: TreemapHistoryPoint[]; period: "week" | "month" }) {
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

  // Fenêtre temporelle : 7 derniers jours (semaine) ou tous les jours du mois courant.
  let points = [...history];
  if (period === "week") {
    points = points.slice(-7);
  } else {
    const latestMonth = points.length ? points[points.length - 1].date.slice(0, 7) : "";
    const inMonth = points.filter((p) => p.date.slice(0, 7) === latestMonth);
    points = inMonth.length > 1 ? inMonth : points.slice(-30);
  }

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
    ? (focus.articles.length > 0 ? focus.articles : (focus.context ? [{ title: focus.context, url: focus.url }] : []))
    : [];

  return (
    <div className="spaghetti-container" style={containerStyle}>
      <div style={{ marginBottom: "18px", fontFamily: "Source Serif 4, serif", fontStyle: "italic", fontSize: "14.5px", color: "var(--ink-soft)", lineHeight: 1.5, maxWidth: "74ch" }}>
        Évolution du rang de saillance des douze enjeux, jour après jour. Le rang 1 est l&apos;enjeu le plus saillant&nbsp;; cliquez sur un enjeu pour l&apos;isoler et afficher ses actualités.
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
                  {fmtDate(pt.date)}
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
              À la une
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
                    {domainOf(a.url) && <span className="fil-source">{domainOf(a.url)} ↗</span>}
                  </a>
                ) : (
                  <div key={i} className="fil-article">
                    <span className="fil-titre">{a.title}</span>
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

export function TreemapClient({ data }: { data: TreemapAllPeriods }) {
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [secret, setSecret] = useState(false);
  useKonamiCode(() => { setPeriod("month"); setSecret(true); });
  const current = data[period];
  const tiles = current.tiles;

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">De quoi parle-t-on?</h2>
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline">
              <span
                className={period === "day" ? "active" : undefined}
                onClick={() => setPeriod("day")}
                style={{ cursor: "pointer" }}
              >
                Aujourd&apos;hui
              </span>
              <span
                className={period === "week" ? "active" : undefined}
                onClick={() => setPeriod("week")}
                style={{ cursor: "pointer" }}
              >
                Cette semaine
              </span>
              <span
                className={period === "month" ? "active" : undefined}
                onClick={() => setPeriod("month")}
                style={{ cursor: "pointer" }}
              >
                Ce mois
              </span>
            </div>
            <ShareButton title="De quoi parle-t-on?" anchor="enjeux-saillants" />
          </div>
        </div>
      </div>

      {period === "day" ? (
        <>
          <div className="treemap-growth">
            {computeTreemapLayout(tiles).map((t) => (
              <GrowthTile key={t.issueKey} tile={t} />
            ))}
          </div>

          <div className="treemap-mobile" aria-label="Sujets du jour par enjeu et saillance">
            <div className="tm-bar-legend">
              <span>Couleur = enjeu</span>
              <span>Largeur = score</span>
            </div>
            {tiles.map((tile) => {
              const barStyle = { "--c": tile.color, "--w": `${tile.relScore}%` } as React.CSSProperties;
              const barInner = (
                <>
                  <div className="tm-bar-meta">
                    <span className="tm-bar-name">{tile.issueFr}</span>
                    {tile.topObject && <span className="tm-bar-enjeu">{tile.topObject}</span>}
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
        <IssuesRankChart tiles={tiles} history={current.history} period={period} />
      )}

      <div className="module-last-updated">{current.lastUpdated}</div>
    </>
  );
}
