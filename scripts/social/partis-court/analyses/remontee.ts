// 9. LA REMONTÉE — en une semaine, qui a le plus gagné et qui a le plus perdu :
// deux traits qui se croisent, de « il y a une semaine » à « aujourd'hui ».

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { esc } from "../../lib/reel";
import { BOITE, LARGEUR, type Analyse } from "../plan";

export const remontee: Analyse = {
  id: "remontee",
  idee: "En une semaine : le parti qui a le plus gagné et celui qui a le plus perdu, en deux traits",
  construire({ rows }) {
    const parEvo = [...rows].sort((a, b) => b.evolutionPts - a.evolutionPts);
    const monte = parEvo[0], baisse = parEvo[parEvo.length - 1];
    if (!monte || monte.evolutionPts < 10 || baisse.evolutionPts > -5) return null;
    const W = LARGEUR, H = BOITE.hauteur - 120, X0 = 130, X1 = W - 250;
    const y = (v: number) => 40 + H - (v / 100) * H;
    const trait = (r: typeof rows[number], t0: number) => {
      const de = Math.max(0, r.sovPct - r.evolutionPts);
      const len = Math.hypot(X1 - X0, y(r.sovPct) - y(de));
      return `<line x1="${X0}" y1="${y(de)}" x2="${X1}" y2="${y(r.sovPct)}" stroke="${r.color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len}" style="animation:trace 1.2s ${t0}s ease-out forwards"/>
        <circle cx="${X0}" cy="${y(de)}" r="16" fill="${r.color}" style="animation:fadeIn .2s ${t0}s both"/>
        <circle cx="${X1}" cy="${y(r.sovPct)}" r="16" fill="${r.color}" style="animation:fadeIn .2s ${t0 + 1.1}s both"/>`;
    };
    // Départs trop proches : une étiquette au-dessus du point, l'autre dessous.
    const d0 = (r: typeof rows[number]) => Math.max(0, r.sovPct - r.evolutionPts);
    const serre = Math.abs(y(d0(monte)) - y(d0(baisse))) < 70;
    const etiq = (r: typeof rows[number], t0: number) => {
      const de = d0(r);
      const decal = !serre ? -30 : ((d0(r) > d0(r === monte ? baisse : monte) || (d0(r) === d0(r === monte ? baisse : monte) && r === monte)) ? -70 : 14);
      return `<div class="et disp" style="left:0;top:${y(de) + decal}px;color:${r.color};animation:fadeIn .3s ${t0}s both">${de}&nbsp;%</div>
        <div class="et disp" style="right:0;top:${y(r.sovPct) - 30}px;color:${r.color};text-align:right;animation:fadeIn .3s ${t0 + 1.1}s both">${esc(r.label)} ${r.sovPct}&nbsp;%</div>`;
    };
    return {
      visuel: `<svg class="pente" viewBox="0 0 ${W} ${BOITE.hauteur}">
          <line x1="${X0}" y1="30" x2="${X0}" y2="${H + 50}" stroke="var(--rule)" stroke-width="3"/><line x1="${X1}" y1="30" x2="${X1}" y2="${H + 50}" stroke="var(--rule)" stroke-width="3"/>
          ${trait(monte, .5)}${trait(baisse, 3.3)}</svg>
        ${etiq(monte, .5)}${etiq(baisse, 3.3)}
        <div class="axe mono" style="left:${X0 - 110}px">Il y a une semaine</div><div class="axe mono" style="left:${X1 - 110}px">Aujourd’hui</div>`,
      css: `
@keyframes trace{to{stroke-dashoffset:0}}
#plan .pente{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#plan .et{position:absolute;font-size:46px;line-height:1;white-space:nowrap}
#plan .axe{position:absolute;bottom:0;width:220px;text-align:center;font-size:26px;letter-spacing:.04em;color:var(--soft)}`,
      phrases: [
        { a: "En une semaine, dans les Unes :", b: `${cap(SIGLE_ARTICLE[monte.key])} gagne ${monte.evolutionPts} points`, couleur: monte.color, debut: .15, fin: 3.0 },
        { a: "Pendant ce temps,", b: `${SIGLE_ARTICLE[baisse.key]} en perd ${-baisse.evolutionPts}`, couleur: baisse.color, debut: 3.2 },
      ],
      legende: `En une semaine, la part de ${SIGLE_ARTICLE[monte.key]} dans le temps que les Unes consacrent aux partis a gagné ${monte.evolutionPts} points (${Math.max(0, monte.sovPct - monte.evolutionPts)} % → ${monte.sovPct} %). Celle de ${SIGLE_ARTICLE[baisse.key]} en a perdu ${-baisse.evolutionPts}.`,
    };
  },
};
