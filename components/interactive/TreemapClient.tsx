"use client";

import React, { useState } from "react";
import type { TreemapIssueTile, TreemapAllPeriods } from "@/lib/data/headlineEvents";
import { ShareButton } from "@/components/interactive/ShareButton";

function IssueTile({ tile, showContext }: { tile: TreemapIssueTile; showContext: boolean }) {
  const details = [tile.context, tile.topObject].filter(Boolean).join(" · ") || tile.issueFr;
  const tooltip = tile.url
    ? `${details} · Cliquer pour lire l'article →`
    : details;
  const inner = (
    <>
      <div className="tm-enjeu">{tile.issueFr}</div>
      {tile.topObject && <div className="tm-name">{tile.topObject}</div>}
      {showContext && tile.context && <div className="tm-context">{tile.context}</div>}
    </>
  );
  const shared = { className: "tm-tile", style: { "--c": tile.color } as React.CSSProperties, "data-tooltip": tooltip };
  const content = tile.url ? (
    <a href={tile.url} target="_blank" rel="noopener noreferrer" {...shared}>{inner}</a>
  ) : (
    <div {...shared}>{inner}</div>
  );
  return <div className="tm-tile-container">{content}</div>;
}

function toFr(row: TreemapIssueTile[]): string {
  const rowMax = Math.max(...row.map((t) => t.relScore), 1);
  const minFr = Math.max(Math.ceil(rowMax * 0.30), 1);
  return row.map((t) => `${Math.max(t.relScore, minFr)}fr`).join(" ");
}

export function TreemapClient({ data }: { data: TreemapAllPeriods }) {
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const current = data[period];
  const tiles = current.tiles;

  const row1 = tiles.slice(0, 4);
  const row2 = tiles.slice(4, 8);
  const row3 = tiles.slice(8, 12);

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

      <div className="treemap">
        <div className="tm-row tm-row-1" style={{ gridTemplateColumns: toFr(row1) }}>
          {row1.map((tile) => (
            <IssueTile key={tile.issueKey} tile={tile} showContext={true} />
          ))}
        </div>
        <div className="tm-row tm-row-2" style={{ gridTemplateColumns: toFr(row2) }}>
          {row2.map((tile) => (
            <IssueTile key={tile.issueKey} tile={tile} showContext={true} />
          ))}
        </div>
        <div className="tm-row tm-row-3" style={{ gridTemplateColumns: toFr(row3) }}>
          {row3.map((tile) => (
            <IssueTile key={tile.issueKey} tile={tile} showContext={true} />
          ))}
        </div>
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
  );
}
