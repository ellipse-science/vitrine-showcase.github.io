"use client";

import type { ReactNode } from "react";

/**
 * LA TRACKLISTE — catégorie à gauche, points de suite, métrique à droite,
 * comme au dos d'un vrai disque. PARTAGÉE par trois endroits qui publient
 * tous les mêmes grandeurs (temps, part, enjeu, ton) sur un même parti, à des
 * échelles différentes :
 *  - la pochette qu'un clic sur un deck ouvre (`PartisCouvertureClient`,
 *    `GatefoldInfos`) ;
 *  - le panneau du disque d'or, une carte par parti (`PartisCouvertureClient`,
 *    `TropheePanel`) ;
 *  - chaque pochette de `/discotheque` (`DiscothequeClient`), qu'on y
 *    parcoure des singles, des albums ou des discographies.
 *
 * Un seul balisage, une seule feuille de style (`.tracklist-*` dans
 * `globals.css`) : les trois composants au-dessus des trois lieux ci-dessus
 * ne posent que leurs propres libellés et valeurs.
 */

/** La jauge de ton, reprise du module de l'Assemblée (`.ass-tone`) : mêmes
 *  couleurs, même repère. Deux modules qui mesurent un ton doivent le montrer
 *  de la même façon. */
export function JaugeTon({ pct, title }: { pct: number; title?: string }) {
  return (
    <span className="pochette-ton" title={title}>
      <span className="pochette-ton-repere" style={{ left: `${pct}%` }} />
    </span>
  );
}

/** Une rangée ordinaire — une catégorie, une valeur simple.
 *
 *  TOUTES LES VALEURS PARTAGENT LA MÊME TYPOGRAPHIE. La durée portait une
 *  emphase à part (Playfair 900, 16 px, cordovan) ; sur un dos de 130 px, trois
 *  valeurs dans trois styles ne se lisaient plus comme une fiche technique.
 *  Seul le TON garde la sienne (`LigneTracklistTon`) : c'est une jauge, pas un
 *  texte. */
export function LigneTracklist({
  categorie,
  title,
  children,
}: {
  categorie: string;
  /** Précision de survol, quand la métrique a besoin d'être qualifiée sans
   *  qu'on puisse l'écrire en toutes lettres — cinq cartes de front n'en ont
   *  pas la place. `undefined` ne pose aucun attribut. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="tracklist-ligne" title={title}>
      <dt className="tracklist-cat">{categorie}</dt>
      <span className="tracklist-points" aria-hidden="true" />
      <dd className="tracklist-metrique">{children}</dd>
    </div>
  );
}

/** La rangée du TON, à part : sa métrique n'est pas un simple mot mais une
 *  jauge, qui a besoin de sa propre mise en page (voir `.tracklist-ligne--ton`
 *  dans `globals.css`). */
export function LigneTracklistTon({
  categorie,
  tonMot,
  tonPct,
  tonTitle,
}: {
  categorie: string;
  tonMot: string;
  tonPct: number;
  tonTitle?: string;
}) {
  return (
    <div className="tracklist-ligne tracklist-ligne--ton">
      <dt className="tracklist-cat">{categorie}</dt>
      <span className="tracklist-points" aria-hidden="true" />
      <dd className="tracklist-metrique">
        <JaugeTon pct={tonPct} title={tonTitle} />
        {/* LA BARRE SEULE, ET PLUS LE MOT. « Défavorable » redisait en toutes
            lettres ce que le repère de la jauge montre déjà, et il prenait la
            moitié d'une rangée large de 130 px — la même contrainte qui avait
            imposé d'abréger les enjeux.

            Le mot n'est pas SUPPRIMÉ, il devient invisible à l'œil seul : sans
            lui, un lecteur d'écran n'aurait plus qu'une barre muette, la jauge
            étant purement graphique. */}
        <span className="visually-hidden">{tonMot}</span>
      </dd>
    </div>
  );
}
