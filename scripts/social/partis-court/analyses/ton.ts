// 6. LE TON — une rangée de cadrans : presque tous les partis penchent du côté
// défavorable ; celui qui s'en tire (ou aucun).

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { esc } from "../../lib/reel";
import { COLORS, TONE, type Analyse } from "../plan";

export const ton: Analyse = {
  id: "ton",
  idee: "Cinq cadrans : combien de partis ont droit à un ton défavorable, et qui s'en tire",
  construire({ rows }) {
    const neg = rows.filter((r) => r.toneDirection === "negative");
    const pos = rows.filter((r) => r.toneDirection === "positive");
    if (neg.length < 3) return null;
    const cadran = (r: typeof rows[number], i: number) => `
      <div class="cad" style="animation:fadeUp .4s ${.3 + i * .12}s both">
        <svg viewBox="0 0 200 120"><path d="M28 100 A72 72 0 0 1 100 28" fill="none" stroke="${TONE.negative}" stroke-width="12"/>
          <path d="M100 28 A72 72 0 0 1 172 100" fill="none" stroke="${TONE.positive}" stroke-width="12"/>
          <g class="n" data-to="${r.tonePct}" data-i="${i}" style="transform-origin:100px 100px"><line x1="100" y1="100" x2="100" y2="34" stroke="${COLORS.ink}" stroke-width="6" stroke-linecap="round"/></g>
          <circle cx="100" cy="100" r="9" fill="${COLORS.ink}"/></svg>
        <b class="pf" style="background:${r.color}">${esc(r.label)}</b></div>`;
    const seul = pos.length === 1 ? pos[0] : null;
    return {
      visuel: `<div class="tons">${rows.map(cadran).join("")}</div>
        <div class="bouts mono"><span style="color:${TONE.negative}">← Défavorable</span><span style="color:${TONE.positive}">Favorable →</span></div>`,
      css: `
#plan .tons{position:absolute;left:0;right:0;top:120px;display:grid;grid-template-columns:repeat(3,1fr);gap:36px 26px}
#plan .cad{display:flex;flex-direction:column;align-items:center;gap:8px}
#plan .cad svg{width:100%;height:auto}
#plan .cad b{color:#fff;font-size:36px;padding:2px 18px}
#plan .bouts{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;font-size:30px;letter-spacing:.06em}`,
      // Les aiguilles s'agitent comme sur une console, puis se posent sur leur valeur.
      script: `
  racine.querySelectorAll(".n").forEach(function(g){
    var i=+g.dataset.i, to=(+g.dataset.to-50)/50*80;
    var k=clamp((t-.6-i*.12)/2.2);
    var bruit=Math.sin(t*9+i*1.7)*40*(1-k);
    g.style.transform="rotate("+(to*ease(k)+bruit*(t>.6?1:0))+"deg)";
  });`,
      phrases: [
        { a: "Depuis minuit, le ton des phrases qui les nomment :", b: `défavorable pour ${neg.length} partis sur ${rows.length}`, couleur: TONE.negative, debut: .15, fin: 3.0 },
        seul
          ? { a: "Un seul s’en tire :", b: `${cap(SIGLE_ARTICLE[seul.key])}`, couleur: seul.color, debut: 3.2 }
          : { a: pos.length ? `${pos.length} partis s’en tirent :` : "Aucun n’y échappe :", b: pos.length ? pos.map((r) => r.label).join(" et ") : "pas un seul ton favorable", debut: 3.2 },
      ],
      legende: `Depuis minuit, le ton des phrases qui nomment les partis dans les Unes est défavorable pour ${neg.length} partis sur ${rows.length}. ${seul ? `Seul ${SIGLE_ARTICLE[seul.key]} a droit à un ton favorable.` : pos.length ? `Ton favorable : ${pos.map((r) => SIGLE_ARTICLE[r.key]).join(" et ")}.` : "Aucun n’a droit à un ton favorable."}`,
    };
  },
};
