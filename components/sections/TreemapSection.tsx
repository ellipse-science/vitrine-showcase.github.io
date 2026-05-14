import { loadHeadlineEvents, type TreemapTile } from "@/lib/data/headlineEvents";

function Tile({ tile }: { tile: TreemapTile }) {
  return (
    <div className="tm-tile" style={{ "--c": tile.color } as React.CSSProperties}>
      <div className="tm-enjeu">{tile.enjeu}</div>
      <div className="tm-context">{tile.context}</div>
      <div className="tm-name">{tile.name}</div>
    </div>
  );
}

import React from "react";

export async function TreemapSection() {
  const data = await loadHeadlineEvents();
  if (!data) return null;

  const { treemapTier1, treemapTier2, treemapTier3, treemapTier4, treemapMobile } = data;

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">De quoi parle-t-on ?</h2>
        </div>
        <div className="treemap-legend">
          <div className="legend-toggle">
            <span className="active">Aujourd&apos;hui</span>
          </div>
          <span>{data.snapshotInterval}h · {data.dateLabel}</span>
        </div>
      </div>

      <div className="treemap">
        {treemapTier1.length > 0 && (
          <div className="tm-row tm-row-1">
            {treemapTier1.map((tile) => <Tile key={tile.name} tile={tile} />)}
          </div>
        )}
        {treemapTier2.length > 0 && (
          <div className="tm-row tm-row-2">
            {treemapTier2.map((tile) => <Tile key={tile.name} tile={tile} />)}
          </div>
        )}
        {treemapTier3.length > 0 && (
          <div className="tm-row tm-row-3">
            {treemapTier3.map((tile) => <Tile key={tile.name} tile={tile} />)}
          </div>
        )}
        {treemapTier4.length > 0 && (
          <div className="tm-row tm-row-4">
            {treemapTier4.map((tile) => (
              <div
                key={tile.name}
                className="tm-tile"
                style={{ "--c": tile.color } as React.CSSProperties}
              >
                <div className="tm-name">{tile.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="treemap-mobile" aria-label="Sujets du jour par enjeu et saillance">
        <div className="tm-bar-legend">
          <span>Couleur = enjeu</span>
          <span>Largeur = saillance</span>
        </div>
        {treemapMobile.map((tile) => (
          <div
            key={tile.name}
            className="tm-bar-item"
            style={{ "--c": tile.color, "--w": `${tile.relWidth}%` } as React.CSSProperties}
          >
            <div className="tm-bar-meta">
              <span className="tm-bar-name">{tile.name}</span>
              <span className="tm-bar-enjeu">{tile.enjeu}</span>
            </div>
            <div className="tm-bar-track"><div className="tm-bar-fill" /></div>
            <span className="tm-bar-context">{tile.context}</span>
          </div>
        ))}
      </div>
    </>
  );
}
