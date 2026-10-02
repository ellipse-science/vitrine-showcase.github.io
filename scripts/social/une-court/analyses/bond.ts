// 1. LE BOND DU SOIR — de combien l'attention portée à la Une n°1 a bougé
// depuis l'édition précédente. La courbe est sur le site ; le POURCENTAGE de
// variation d'une édition à l'autre, lui, n'y est écrit nulle part.

import { esc } from "../../lib/reel";
import { BOITE, corpsTitre, type Analyse } from "../plan";

export const bond: Analyse = {
  id: "bond",
  idee: "De combien l’attention portée à la nouvelle du moment a bougé en quatre heures",
  construire({ top }) {
    const pts = top.salienceTrend?.points ?? [];
    if (pts.length < 2) return null;
    const avant = pts[pts.length - 2].cumul, apres = pts[pts.length - 1].cumul;
    if (avant <= 0 || apres <= 0) return null;
    const variation = Math.round(((apres - avant) / avant) * 100);
    // Un mouvement de moins d'un quart ne fait pas une histoire.
    if (Math.abs(variation) < 25) return null;
    const monte = variation > 0;
    const couleur = top.issueColor;
    const H = BOITE.hauteur - 150;
    const haut = (v: number) => Math.max(26, (v / Math.max(avant, apres)) * H);
    const barre = (v: number, label: string, teinte: string, d: number) => `
      <div class="col">
        <div class="v disp" style="color:${teinte};animation:fadeIn .3s ${d + .7}s both">${v.toFixed(1).replace(".", ",")}</div>
        <div class="b" style="height:${haut(v)}px;background:${teinte};animation:growY .7s ${d}s both"></div>
        <div class="lab mono">${esc(label)}</div>
      </div>`;
    return {
      visuel: `<div class="duo">
        ${barre(avant, pts[pts.length - 2].timeLabel, "#C6BBA4", .5)}
        <div class="fleche disp" style="color:${couleur};animation:pop .4s 1.9s both">${monte ? "↗" : "↘"}</div>
        ${barre(apres, pts[pts.length - 1].timeLabel, couleur, 1.4)}
      </div>`,
      css: `
#plan .duo{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;gap:40px}
#plan .duo .col{flex:1;max-width:260px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
#plan .duo .v{font-size:76px;line-height:1;margin-bottom:14px}
#plan .duo .b{width:100%;transform-origin:bottom}
#plan .duo .lab{margin-top:16px;font-size:28px;line-height:1.15;letter-spacing:.02em;color:var(--soft);text-align:center;height:76px}
#plan .duo .fleche{align-self:center;font-size:96px;line-height:1}`,
      eclair: monte ? 2.1 : undefined,
      phrases: [
        { a: "La nouvelle du moment…", b: esc(top.title), taille: corpsTitre(top.title), couleur, debut: .15, fin: 3.0 },
        { a: "En quatre heures, son attention…", b: `${monte ? "a bondi" : "est retombée"} de ${Math.abs(variation)} %.`, couleur, debut: 3.2 },
      ],
      legende: `En quatre heures, l’attention portée à « ${top.title} » ${monte ? "a bondi" : "est retombée"} de ${Math.abs(variation)} % : ${avant.toFixed(1).replace(".", ",")} points de saillance à l’édition précédente, ${apres.toFixed(1).replace(".", ",")} maintenant.`,
    };
  },
};
