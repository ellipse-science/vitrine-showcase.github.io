// 2. PLUS QUE TOUS LES AUTRES RÉUNIS — le parti en tête pèse plus, à lui seul,
// que les quatre autres ensemble. Deux colonnes : lui, et les autres empilés.

import { esc } from "../../lib/reel";
import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { BOITE, type Analyse } from "../plan";

export const reunis: Analyse = {
  id: "reunis",
  idee: "Le parti en tête pèse plus, à lui seul, que tous les autres partis réunis",
  construire({ rows }) {
    const [lead, ...autres] = rows;
    const somme = autres.reduce((t, r) => t + r.sovPct, 0);
    if (lead.sovPct <= somme) return null;
    const H = BOITE.hauteur - 140;
    const pile = autres.map((r, i) => `<div class="seg" style="height:${(r.sovPct / 100) * H}px;background:${r.color};animation:growY .35s ${3.4 + i * .18}s both"><span class="pf">${esc(r.label)}</span></div>`).join("");
    return {
      visuel: `<div class="duel">
        <div class="col"><div class="v disp" style="color:${lead.color};animation:fadeIn .3s 1.4s both">${lead.sovPct}&nbsp;%</div>
          <div class="pile"><div class="seg" style="height:${(lead.sovPct / 100) * H}px;background:${lead.color};animation:growY 1.1s .4s both"><span class="pf">${esc(lead.label)}</span></div></div>
          <div class="lab mono">${esc(lead.label)} seul</div></div>
        <div class="vs disp" style="animation:pop .4s 3.1s both">contre</div>
        <div class="col"><div class="v disp" style="animation:fadeIn .3s 4.3s both">${somme}&nbsp;%</div>
          <div class="pile">${pile}</div>
          <div class="lab mono">Les ${autres.length} autres réunis</div></div>
      </div>`,
      css: `
#plan .duel{position:absolute;inset:0;display:flex;align-items:flex-end;gap:30px}
#plan .duel .col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end}
#plan .duel .v{text-align:center;font-size:72px;line-height:1;margin-bottom:12px}
#plan .duel .pile{display:flex;flex-direction:column-reverse}
#plan .duel .seg{transform-origin:bottom;display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;overflow:hidden;border-top:3px solid var(--paper)}
#plan .duel .lab{margin-top:14px;text-align:center;font-size:28px;letter-spacing:.04em;height:40px}
#plan .duel .vs{align-self:center;font-size:44px;color:var(--soft)}`,
      phrases: [
        { a: "Depuis minuit, dans les Unes de l’actualité…", b: `${cap(SIGLE_ARTICLE[lead.key])} prend ${lead.sovPct} % de la place des partis.`, couleur: lead.color, debut: .15, fin: 3.0 },
        { a: "Les 4 autres partis ensemble ?", b: `${somme} %. Il pèse plus qu’eux tous.`, debut: 3.2 },
      ],
      legende: `Depuis minuit, ${SIGLE_ARTICLE[lead.key]} occupe ${lead.sovPct} % du temps que les Unes de l’actualité consacrent aux partis : plus que les ${autres.length} autres partis réunis (${somme} %).`,
    };
  },
};
