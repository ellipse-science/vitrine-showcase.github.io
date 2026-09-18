// 3. LA REMONTÉE DE LA SEMAINE — l'enjeu qui a gagné le plus de rangs en sept
// jours. Le graphique de rang est sur le site ; le nombre de rangs gagnés, dit
// en clair, ne l'est pas.

import { libelleEnjeuCourt } from "@/lib/enjeux";
import { rankMovement, rankPointsForPeriod } from "@/lib/treemapRank";

import { esc } from "../../lib/reel";
import { BOITE, type Analyse } from "../plan";

/** Sous trois rangs, un enjeu n'a pas « remonté » : il a bougé dans le bruit. */
const SEUIL_RANGS = 3;

/** Un rang, en gros, dans un pastillon de la couleur de l'enjeu. */
const badge = (rang: number, couleur: string, delai: number, eteint = false) => `
  <div class="rang" style="background:${eteint ? "#C6BBA4" : couleur};animation:pop .5s ${delai}s both">
    <b>${rang}</b><i>e</i>
  </div>`;

export const grimpe: Analyse = {
  id: "grimpe",
  idee: "L’enjeu qui a gagné le plus de rangs en sept jours",
  construire({ data, tuiles }) {
    const points = rankPointsForPeriod(data.week.history, "week");
    // Il faut deux points pour qu'un rang ait bougé.
    if (points.length < 2) return null;

    const mouvements = tuiles
      .map((tile) => ({ tile, ...rankMovement(points, tile.issueKey) }))
      .filter((m) => Number.isFinite(m.startRank) && Number.isFinite(m.endRank));
    if (!mouvements.length) return null;

    const meilleur = mouvements.reduce((a, b) => (b.delta > a.delta ? b : a));
    if (meilleur.delta < SEUIL_RANGS) return null;

    const { tile, startRank, endRank } = meilleur;
    const nom = libelleEnjeuCourt(tile.issueFr);

    return {
      visuel: `<div class="course">
        ${badge(startRank, tile.color, .5, true)}
        <div class="fleche disp" style="color:${tile.color};animation:pop .4s 1.6s both">→</div>
        ${badge(endRank, tile.color, 1.2)}
      </div>`,
      css: `
#plan .course{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:48px}
#plan .course .rang{width:${Math.round((BOITE.hauteur - 180) * .62)}px;height:${Math.round((BOITE.hauteur - 180) * .62)}px;border-radius:50%;display:flex;align-items:baseline;justify-content:center;color:var(--paper)}
#plan .course .rang b{font-family:"Playfair Display",serif;font-weight:900;font-size:180px;line-height:1}
#plan .course .rang i{font-family:"Playfair Display",serif;font-style:normal;font-size:64px;line-height:1;align-self:flex-start;margin-top:26px}
#plan .course .fleche{font-size:104px;line-height:1}`,
      phrases: [
        {
          a: "En sept jours, l’enjeu qui remonte le plus :",
          b: esc(nom),
          couleur: tile.color,
          debut: .15,
          fin: 3.0,
        },
        {
          a: `De la ${startRank}e à la ${endRank}e place :`,
          b: `${meilleur.delta} rangs gagnés.`,
          couleur: tile.color,
          debut: 3.2,
        },
      ],
      methode: "Rang parmi les 12 enjeux · 7 derniers jours",
      legende: `En sept jours, ${nom} est l’enjeu qui a gagné le plus de rangs parmi les douze de la campagne : de la ${startRank}e à la ${endRank}e place, soit ${meilleur.delta} rangs.`,
    };
  },
};
