// 3. L'HORLOGE — le temps en Une, en heures et minutes, tous médias confondus :
// le parti en tête face aux autres partis réunis. Deux rubans d'heures qui se
// remplissent, avec un compteur.

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { esc } from "../../lib/reel";
import { COLORS, LARGEUR, duree, type Analyse } from "../plan";

export const horloge: Analyse = {
  id: "horloge",
  idee: "Le temps passé en Une, en heures et minutes : le parti en tête contre tous les autres",
  construire({ rows }) {
    const [lead, ...autres] = rows;
    const autresMin = autres.reduce((t, r) => t + r.minutesUne, 0);
    if (lead.minutesUne < 60) return null;
    const maxH = Math.ceil(Math.max(lead.minutesUne, autresMin) / 60);
    const ruban = (min: number, color: string, t0: number, dur: number, lab: string) => `
      <div class="ruban" style="animation:fadeIn .3s ${t0 - .3}s both"><div class="lab mono">${esc(lab)}</div>
        <div class="piste">${Array.from({ length: maxH }, () => "<i></i>").join("")}
          <div class="rempli" style="width:${(min / (maxH * 60)) * 100}%;background:${color};animation:grow ${dur}s ${t0}s linear both"></div></div>
        <div class="cpt disp" style="color:${color}" data-min="${min}" data-t0="${t0}" data-d="${dur}">0 min</div></div>`;
    return {
      visuel: `<div class="horloge">${ruban(lead.minutesUne, lead.color, .4, 2.2, `${lead.label}`)}${ruban(autresMin, COLORS.soft, 3.3, 1.4, `Les ${autres.length} autres partis réunis`)}
        <div class="note mono" style="animation:fadeIn .3s .2s both">Une case = une heure en Une, tous médias confondus</div></div>`,
      css: `
#plan .horloge{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:60px}
#plan .ruban .lab{font-size:30px;letter-spacing:.06em;margin-bottom:10px}
#plan .ruban .piste{position:relative;display:flex;gap:4px;height:110px}
#plan .ruban .piste i{flex:1;background:var(--deep)}
#plan .ruban .rempli{position:absolute;left:0;top:0;bottom:0;transform-origin:left;mix-blend-mode:multiply}
#plan .ruban .cpt{font-size:84px;line-height:1;margin-top:12px;font-variant-numeric:tabular-nums}
#plan .horloge .note{font-size:26px;letter-spacing:.04em;color:var(--soft);max-width:${LARGEUR}px}`,
      script: `
  racine.querySelectorAll(".cpt").forEach(function(c){
    var m=Math.round(+c.dataset.min*clamp((t-+c.dataset.t0)/+c.dataset.d));
    var h=Math.floor(m/60), r=m%60;
    c.textContent=h?(h+"\\u00A0h\\u00A0"+String(r).padStart(2,"0")):(r+"\\u00A0min");
  });`,
      phrases: [
        { a: `Depuis minuit, temps en Une pour ${SIGLE_ARTICLE[lead.key]} :`, b: duree(lead.minutesUne), couleur: lead.color, debut: .15, fin: 3.0 },
        { a: `Pour les ${autres.length} autres partis réunis :`, b: `${duree(autresMin)} seulement`, debut: 3.2 },
      ],
      legende: `Depuis minuit, ${SIGLE_ARTICLE[lead.key]} a occupé ${duree(lead.minutesUne)} de temps en Une, tous médias confondus. ${cap(`les ${autres.length} autres partis réunis : ${duree(autresMin)}`)}.`,
    };
  },
};
