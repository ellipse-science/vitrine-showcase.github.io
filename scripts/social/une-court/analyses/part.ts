// 2. CE QU'ELLE PREND AUX AUTRES — la part de la Une n°1 dans l'attention des
// cinq nouvelles les plus saillantes. Le site donne les points de chacune ; il
// ne dit jamais quelle fraction du total la première accapare.

import { esc } from "../../lib/reel";
import { corpsTitre, type Analyse } from "../plan";

export const part: Analyse = {
  id: "part",
  idee: "La part de la nouvelle n°1 dans l’attention des cinq plus saillantes",
  construire({ classement, top }) {
    const cinq = classement.slice(0, 5).filter((e) => (e.scoreQcSum24h ?? 0) > 0);
    if (cinq.length < 3 || cinq[0] !== top) return null;
    const total = cinq.reduce((t, e) => t + (e.scoreQcSum24h ?? 0), 0);
    const pct = Math.round(((top.scoreQcSum24h ?? 0) / total) * 100);
    // Sous le tiers, la première ne « prend » rien de remarquable.
    if (pct < 33) return null;
    const segs = cinq.map((e, i) => {
      const p = ((e.scoreQcSum24h ?? 0) / total) * 100;
      return `<div class="seg" style="flex:0 0 ${p}%;background:${i === 0 ? top.issueColor : "#CFC5AE"};animation:wipe .8s ${.5 + i * .18}s both"><span class="pf">${i === 0 ? `${pct}&nbsp;%` : ""}</span></div>`;
    }).join("");
    return {
      visuel: `<div class="barre">${segs}</div>
        <div class="socle mono" style="animation:fadeIn .5s 1.8s both">Les 5 nouvelles les plus saillantes des 24 dernières heures</div>`,
      css: `
#plan .barre{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:220px;display:flex;overflow:hidden}
#plan .seg{display:flex;align-items:center;justify-content:center;transform-origin:left;border-right:4px solid var(--paper)}
#plan .seg span{color:#fff;font-size:72px}
#plan .socle{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:28px;letter-spacing:.04em;color:var(--soft);line-height:1.2}`,
      phrases: [
        { a: "Ce soir, une nouvelle prend toute la place…", b: esc(top.title), taille: corpsTitre(top.title), couleur: top.issueColor, debut: .15, fin: 3.0 },
        { a: "À elle seule, dans les Unes…", b: `${pct} % de l’attention des cinq premières.`, couleur: top.issueColor, debut: 3.2 },
      ],
      legende: `« ${top.title} » accapare ${pct} % de l’attention que les Unes consacrent aux cinq nouvelles les plus saillantes des 24 dernières heures.`,
    };
  },
};
