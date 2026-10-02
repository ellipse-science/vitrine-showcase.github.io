// 7. LES MÉDIAS — le parti en tête, média par média : là où il écrase tout, et
// dans combien de médias il mène.

import { SIGLE_ARTICLE, cap, leaders } from "../../lib/partis";
import { esc } from "../../lib/reel";
import { type Analyse } from "../plan";

export const medias: Analyse = {
  id: "medias",
  idee: "Média par média, la part du parti en tête : le média où il écrase tout, et combien il en mène",
  construire({ rows, mixes }) {
    const lead = rows[0];
    if (mixes.length < 3) return null;
    const parts = mixes.map((m) => ({ m, pct: m.rows.find((r) => r.key === lead.key)?.sovPct ?? 0 }));
    const top = [...parts].sort((a, b) => b.pct - a.pct)[0];
    const mene = mixes.filter((m) => leaders(m).some((r) => r.key === lead.key)).length;
    if (top.pct < 50) return null;
    const lignes = parts.map(({ m, pct }, i) => `
      <div class="lm" data-top="${m.id === top.m.id ? 1 : 0}" style="animation:fadeUp .35s ${.35 + i * .22}s both">
        <div class="nom pf">${esc(m.nom)}</div>
        <div class="piste"><div class="rempli" style="width:${pct}%;background:${lead.color};animation:grow .5s ${.5 + i * .22}s both"></div></div>
        <div class="pct disp" style="color:${lead.color}">${pct}&nbsp;%</div></div>`).join("");
    return {
      visuel: `<div class="medias">${lignes}</div>`,
      css: `
#plan .medias{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:22px}
#plan .lm{display:grid;grid-template-columns:300px 1fr 150px;align-items:center;gap:18px;transition:none}
#plan .lm .nom{font-size:36px;line-height:1.05}
#plan .lm .piste{height:60px;background:var(--deep)}
#plan .lm .rempli{height:100%;transform-origin:left}
#plan .lm .pct{font-size:52px;text-align:right}`,
      script: `
  racine.querySelectorAll(".lm").forEach(function(l){
    l.style.opacity=l.dataset.top==="1"?1:(1-.6*clamp((t-3.0)/.5));
  });`,
      phrases: [
        { a: `En Une de l’actualité, depuis minuit, ${top.m.nom} :`, b: `${top.pct} % du temps, c’est ${SIGLE_ARTICLE[lead.key]}`, couleur: lead.color, debut: .15, fin: 3.0 },
        { a: `${cap(SIGLE_ARTICLE[lead.key])} est en tête`, b: `dans ${mene} médias sur ${mixes.length}`, debut: 3.2 },
      ],
      legende: `Depuis minuit, ${top.m.dans}, ${top.pct} % du temps que les Unes de l’actualité consacrent aux partis va ${lead.key === "caq" ? "à la" : lead.key === "qs" ? "à" : "au"} ${lead.label}. ${cap(SIGLE_ARTICLE[lead.key])} est en tête dans ${mene} médias sur ${mixes.length}.`,
    };
  },
};
