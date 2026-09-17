// 10. LE MULTIPLE — le parti en tête d'aujourd'hui, comparé à sa propre moyenne
// de campagne : une barre qui s'arrête à sa moyenne, puis repart et la
// dépasse plusieurs fois.

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { esc } from "../../lib/reel";
import { BOITE, fois, type Analyse } from "../plan";

export const multiple: Analyse = {
  id: "multiple",
  idee: "Le parti en tête, comparé à sa propre moyenne de campagne : combien de fois plus",
  construire({ data, rows }) {
    const lead = rows[0];
    const moi = data.ranges.overall.rows.find((r) => r.key === lead.key);
    if (!moi || moi.sovPct <= 0 || lead.sovPct / moi.sovPct < 1.5) return null;
    const x = fois(lead.sovPct / moi.sovPct);
    const H = BOITE.hauteur - 120;
    const yMoy = 60 + H - (moi.sovPct / 100) * H;
    const tours = Math.floor(lead.sovPct / moi.sovPct);
    const blocs = Array.from({ length: tours }, (_, i) => `<div class="bloc" style="bottom:${60 + i * (moi.sovPct / 100) * H}px;height:${(moi.sovPct / 100) * H}px;animation:growY .45s ${i === 0 ? .5 : 3.2 + (i - 1) * .45}s both"><span class="disp">×${i + 1}</span></div>`).join("");
    return {
      visuel: `<div class="mult">
          <div class="plein" style="height:${(lead.sovPct / 100) * H}px;background:${lead.color};animation:growY 1s ${3.2 + (tours - 1) * .45}s both"></div>
          ${blocs}
          <div class="moy" style="top:${yMoy}px;animation:fadeIn .3s 1s both"><i></i><span class="mono">Sa moyenne de campagne : ${moi.sovPct} %</span></div>
          <div class="lab pf" style="background:${lead.color}">${esc(lead.label)}</div>
        </div>`,
      css: `
#plan .mult{position:absolute;inset:0}
#plan .mult .plein{position:absolute;left:60px;width:300px;bottom:60px;transform-origin:bottom}
#plan .mult .bloc{position:absolute;left:60px;width:300px;transform-origin:bottom;border-top:6px solid var(--paper);display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25)}
#plan .mult .bloc span{font-size:60px;color:var(--paper)}
#plan .mult .moy{position:absolute;left:0;right:0;height:0}
#plan .mult .moy i{position:absolute;left:0;right:0;border-top:5px dashed var(--ink)}
#plan .mult .moy span{position:absolute;right:0;top:12px;font-size:28px;letter-spacing:.04em;background:var(--paper);padding:2px 8px}
#plan .mult .lab{position:absolute;left:60px;width:300px;bottom:0;height:56px;line-height:56px;text-align:center;color:#fff;font-size:40px}`,
      phrases: [
        { a: `D’habitude, dans les Unes, ${SIGLE_ARTICLE[lead.key]} c’est`, b: `${moi.sovPct} % du temps consacré aux partis`, debut: .15, fin: 3.0 },
        { a: "Aujourd’hui :", b: `${lead.sovPct} %, ${x} plus`, couleur: lead.color, debut: 3.2 },
      ],
      legende: `Depuis le début de la campagne, ${SIGLE_ARTICLE[lead.key]} occupe en moyenne ${moi.sovPct} % du temps que les Unes consacrent aux partis. Depuis minuit : ${lead.sovPct} %, ${x} plus.`,
    };
  },
};
