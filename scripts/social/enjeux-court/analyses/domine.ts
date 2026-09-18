// 1. LA CONCENTRATION — combien les trois premiers enjeux pèsent, à eux seuls,
// dans l'attention des douze. La treemap montre les douze parts ; leur SOMME,
// elle, n'est écrite nulle part sur le site.
//
// LE VISUEL MONTRE LE TOUT, PAS UN CLASSEMENT (Jules Piral, 2026-09-18 : « les
// gens ne comprennent pas nécessairement de quoi on parle »). Des barres
// répondaient à « lequel est le plus gros ? » ; la question ici est « combien
// pèsent trois enjeux sur douze ? ». On dessine donc les DOUZE bouts d'une même
// bande de 100 % : les trois premiers en couleur, les neuf autres en sourdine,
// et un repère à la moitié. Qu'ils dépassent la moitié se voit sans lire un
// seul chiffre — et l'axe n'a plus besoin d'être expliqué, puisqu'on voit le
// tout dont on parle.

import { libelleEnjeuCourt } from "@/lib/enjeux";

import { esc } from "../../lib/reel";
import { BOITE, LARGEUR, type Analyse } from "../plan";

/** Sous ce seuil, trois enjeux sur douze ne « dominent » rien : les douze se
 *  partagent l'attention à peu près également et il n'y a pas d'histoire.
 *  Un partage parfaitement égal donnerait 25 % pour trois enjeux sur douze. */
const SEUIL = 45;

/** Hauteur de la bande des 100 %. */
const BANDE = 150;

export const domine: Analyse = {
  id: "domine",
  idee: "Ce que les trois premiers enjeux pèsent, à eux seuls, dans l’attention des douze",
  construire({ tuiles }) {
    if (tuiles.length < 4) return null;
    const trois = tuiles.slice(0, 3);
    const somme = Math.round(trois.reduce((t, x) => t + x.share, 0));
    if (somme < SEUIL) return null;

    // Les douze bouts de la bande, dans l'ordre du classement. Les largeurs
    // viennent des parts elles-mêmes : elles somment à 100 par construction.
    const segments = tuiles.map((t, i) => {
      const large = (t.share / 100) * LARGEUR;
      return `<div class="seg" style="width:${large.toFixed(1)}px;background:${i < 3 ? t.color : "#CFC4AC"};animation:growX .8s ${(.4 + i * .06).toFixed(2)}s both"></div>`;
    }).join("");

    // L'accolade sur les trois premiers, et le repère de la moitié.
    const finTrois = (somme / 100) * LARGEUR;
    const moitie = LARGEUR / 2;

    const legende = trois.map((t, i) => `
      <li style="animation:fadeUp .5s ${(2.4 + i * .18).toFixed(2)}s both">
        <i style="background:${t.color}"></i>
        <b>${esc(libelleEnjeuCourt(t.issueFr))}</b>
        <span class="mono">${Math.round(t.share)}&nbsp;%</span>
      </li>`).join("");

    return {
      visuel: `
        <div class="tout">
          <div class="accolade" style="width:${finTrois.toFixed(1)}px;animation:growX .6s 1.9s both">
            <div class="trait"></div>
            <div class="somme disp" style="animation:fadeIn .4s 2.2s both">${somme}&nbsp;%</div>
          </div>
          <div class="bande">${segments}</div>
          <div class="moitie" style="left:${moitie.toFixed(1)}px;animation:fadeIn .5s 1.6s both">
            <i></i><span class="mono">la moitié</span>
          </div>
          <ul class="podium">${legende}</ul>
        </div>`,
      css: `
#plan .tout{position:absolute;inset:0}
#plan .tout .bande{position:absolute;left:0;top:${Math.round(BANDE * .62)}px;width:${LARGEUR}px;height:${BANDE}px;display:flex;gap:3px}
#plan .tout .seg{height:100%;transform-origin:left}
#plan .tout .accolade{position:absolute;left:0;top:0;height:${Math.round(BANDE * .62)}px;transform-origin:left}
#plan .tout .accolade .trait{position:absolute;left:0;right:0;bottom:10px;height:8px;background:var(--ink)}
#plan .tout .accolade .somme{position:absolute;left:0;right:0;bottom:28px;text-align:center;font-size:84px;line-height:1;color:var(--ink)}
#plan .tout .moitie{position:absolute;top:${Math.round(BANDE * .62) - 14}px;height:${BANDE + 28}px}
#plan .tout .moitie i{position:absolute;left:0;top:0;bottom:22px;width:5px;background:var(--ink)}
#plan .tout .moitie span{position:absolute;left:0;bottom:-16px;transform:translateX(-50%);font-size:28px;letter-spacing:.04em;color:var(--soft);white-space:nowrap;background:var(--paper);padding:0 10px}
#plan .tout .podium{position:absolute;left:0;right:0;top:${Math.round(BANDE * .62) + BANDE + 96}px;list-style:none}
#plan .tout .podium li{display:flex;align-items:center;gap:20px;height:96px;border-bottom:2px solid var(--rule)}
#plan .tout .podium i{flex:none;display:block;width:44px;height:44px}
#plan .tout .podium b{font-family:"Playfair Display",serif;font-weight:700;font-size:44px;line-height:1.05;text-align:left;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#plan .tout .podium span{flex:none;font-size:36px;color:var(--soft)}
@keyframes growX{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
      phrases: [
        {
          // DIRE DE QUOI ON PARLE, EN MOTS SIMPLES (Jules Piral, 2026-09-18) :
          // « Dans l'actualité, les thèmes qui dominent aujourd'hui ». On nomme
          // le cadre (l'actualité), l'objet (les thèmes) et la période
          // (aujourd'hui) avant de montrer quoi que ce soit.
          a: "Dans l’actualité, les enjeux qui dominent aujourd’hui :",
          b: esc(libelleEnjeuCourt(trois[0].issueFr)),
          couleur: trois[0].color,
          debut: .15,
          fin: 3.0,
        },
        {
          a: "Les trois premiers, sur douze :",
          b: `${somme} % à eux seuls.`,
          couleur: trois[0].color,
          debut: 3.2,
        },
      ],
      methode: "Les 12 enjeux = 100 % · aujourd’hui",
      legende: `Aujourd’hui (depuis minuit), les trois enjeux les plus présents — ${trois.map((t) => libelleEnjeuCourt(t.issueFr)).join(", ")} — pèsent ${somme} % de l’attention que les Unes de l’actualité consacrent aux douze enjeux de la campagne. Les douze parts somment à 100 %.`,
    };
  },
};
