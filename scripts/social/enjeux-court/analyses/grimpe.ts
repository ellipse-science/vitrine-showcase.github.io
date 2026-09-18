// 3. LA REMONTÉE DE LA SEMAINE — l'enjeu qui a gagné le plus de rangs en sept
// jours. Le graphique de rang est sur le site ; le nombre de rangs gagnés, dit
// en clair, ne l'est pas.
//
// LE VISUEL EST UNE ÉCHELLE DE DOUZE BARREAUX (Jules Piral, 2026-09-18). Deux
// pastilles « 6e → 3e » ne disaient ni sur combien on se classe, ni DE QUOI on
// parle : le nom de l'enjeu vivait dans une phrase qui s'efface à 3 s, si bien
// qu'à la fin du plan on lisait « 3 rangs gagnés » sans sujet. Ici les douze
// places sont dessinées, et le nom voyage AVEC la pastille : il ne quitte plus
// l'écran.

import { libelleEnjeuCourt } from "@/lib/enjeux";
import { rankMovement, rankPointsForPeriod } from "@/lib/treemapRank";

import { esc } from "../../lib/reel";
import { BOITE, LARGEUR, type Analyse } from "../plan";

/** Sous trois rangs, un enjeu n'a pas « remonté » : il a bougé dans le bruit. */
const SEUIL_RANGS = 3;

/** Les douze places, du haut vers le bas. */
const PLACES = 12;
const BARREAU = Math.floor((BOITE.hauteur - 40) / PLACES);

/** Le moment où la pastille monte, au rythme de base. */
const MONTEE = 2.6;

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

    // Les douze barreaux : un par place, numérotés. C'est ce qui manquait pour
    // comprendre « 3e » — 3e SUR DOUZE.
    const barreaux = Array.from({ length: PLACES }, (_, i) => `
      <div class="barreau" style="top:${i * BARREAU}px;animation:fadeIn .4s ${(.3 + i * .04).toFixed(2)}s both">
        <span class="mono">${i + 1}</span><i></i>
      </div>`).join("");

    return {
      visuel: `
        <div class="echelle">
          ${barreaux}
          <div class="pastille" style="--de:${(startRank - 1) * BARREAU}px;--a:${(endRank - 1) * BARREAU}px;background:${tile.color};animation:monte 1.1s ${MONTEE}s both">
            <b>${esc(nom)}</b>
          </div>
        </div>`,
      css: `
#plan .echelle{position:absolute;inset:0}
#plan .echelle .barreau{position:absolute;left:0;right:0;height:${BARREAU}px;display:flex;align-items:center;gap:18px}
#plan .echelle .barreau span{flex:none;width:58px;text-align:right;font-size:28px;color:var(--soft)}
#plan .echelle .barreau i{flex:1;height:2px;background:var(--rule)}
#plan .echelle .pastille{position:absolute;left:92px;width:${LARGEUR - 92}px;height:${BARREAU - 8}px;display:flex;align-items:center;padding:0 24px;color:var(--paper)}
#plan .echelle .pastille b{font-family:"Playfair Display",serif;font-weight:700;font-size:40px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@keyframes monte{0%{top:var(--de);opacity:0}12%{top:var(--de);opacity:1}55%{top:var(--a)}100%{top:var(--a);opacity:1}}`,
      phrases: [
        {
          a: "Le classement des 12 enjeux en Une de l’actualité :",
          b: esc(nom),
          couleur: tile.color,
          debut: .15,
          fin: 3.0,
        },
        {
          a: `En sept jours, de la ${startRank}e à la ${endRank}e place :`,
          b: `${meilleur.delta} rangs gagnés.`,
          couleur: tile.color,
          debut: 3.2,
        },
      ],
      methode: "Rang sur 12 enjeux · 7 derniers jours",
      legende: `En sept jours, ${nom} est l’enjeu qui a gagné le plus de rangs parmi les douze de la campagne : de la ${startRank}e à la ${endRank}e place, soit ${meilleur.delta} rangs. Le classement des douze enjeux est établi chaque jour à partir de leur saillance dans les Unes de l’actualité.`,
    };
  },
};
