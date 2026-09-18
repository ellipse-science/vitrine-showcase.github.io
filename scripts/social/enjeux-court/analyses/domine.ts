// 1. LA CONCENTRATION — combien les trois premiers enjeux pèsent, à eux seuls,
// dans l'attention des douze. La treemap montre les douze parts ; leur SOMME,
// elle, n'est écrite nulle part sur le site.
//
// UN CLASSEMENT, PAS UNE BANDE (Jules Piral, 2026-09-18 : « rends le graphique
// plus simple, un classement serait mieux »). La bande de 100 % découpée en
// douze disait bien « trois sur douze dépassent la moitié », mais elle
// demandait un mode d'emploi : il fallait d'abord comprendre que la largeur
// totale valait le tout. Un classement numéroté se lit sans rien expliquer —
// un rang, un nom, une barre, une part — et c'est déjà la forme du reel
// `grimpe`, ce qui donne au module une seule grammaire visuelle.

import { libelleEnjeuCourt } from "@/lib/enjeux";

import { esc } from "../../lib/reel";
import { BOITE, LARGEUR, PLAFOND_AXE, axeLabel, type Analyse } from "../plan";

/** Sous ce seuil, trois enjeux sur douze ne « dominent » rien : les douze se
 *  partagent l'attention à peu près également et il n'y a pas d'histoire.
 *  Un partage parfaitement égal donnerait 25 % pour trois enjeux sur douze. */
const SEUIL = 45;

/** Six lignes : le podium, et assez de suite pour qu'on voie qu'il y en a d'autres. */
const LIGNES = 6;

const HAUTEUR = Math.floor(BOITE.hauteur / LIGNES);

/** Colonnes d'une ligne. La barre est à l'échelle du PLAFOND, pas du maximum du
 *  jour : deux éditions se comparent donc à l'œil, et le plafond est écrit sous
 *  le graphique. */
const COL_RANG = 56;
const COL_NOM = 300;
const COL_PART = 104;
const COL_BARRE = LARGEUR - COL_RANG - COL_NOM - COL_PART - 60;

export const domine: Analyse = {
  id: "domine",
  idee: "Ce que les trois premiers enjeux pèsent, à eux seuls, dans l’attention des douze",
  construire({ tuiles }) {
    if (tuiles.length < LIGNES) return null;
    const trois = tuiles.slice(0, 3);
    const somme = Math.round(trois.reduce((t, x) => t + x.share, 0));
    if (somme < SEUIL) return null;

    const rangs = tuiles.slice(0, LIGNES).map((t, i) => {
      const part = Math.round(t.share);
      const large = (part / PLAFOND_AXE) * COL_BARRE;
      // Le podium à sa couleur, la suite en sourdine : c'est le podium qu'on
      // additionne, et l'œil doit voir où il s'arrête.
      const couleur = i < 3 ? t.color : "#C6BBA4";
      const d = +(0.5 + i * 0.16).toFixed(2);
      return `
        <div class="rang" style="top:${i * HAUTEUR}px;animation:fadeUp .5s ${d}s both">
          <span class="n mono">${i + 1}</span>
          <b class="nom">${esc(libelleEnjeuCourt(t.issueFr))}</b>
          <i class="barre" style="width:${large.toFixed(1)}px;background:${couleur};animation:growX .6s ${(d + 0.2).toFixed(2)}s both"></i>
          <span class="part mono" style="color:${couleur}">${part}&nbsp;%</span>
        </div>`;
    }).join("");

    return {
      visuel: `<div class="classement">${rangs}</div>`,
      css: `
#plan .classement{position:absolute;inset:0}
#plan .classement .rang{position:absolute;left:0;right:0;height:${HAUTEUR}px;display:flex;align-items:center;gap:20px;padding-right:12px;border-bottom:2px solid var(--rule)}
#plan .classement .n{flex:none;width:${COL_RANG}px;text-align:right;font-size:36px;color:var(--soft)}
#plan .classement .nom{flex:none;width:${COL_NOM}px;text-align:left;font-family:"Playfair Display",serif;font-weight:700;font-size:40px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#plan .classement .barre{flex:none;display:block;height:44px;transform-origin:left}
#plan .classement .part{flex:none;margin-left:auto;width:${COL_PART}px;text-align:right;font-size:36px}
@keyframes growX{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
      phrases: [
        {
          // DIRE DE QUOI ON PARLE, EN MOTS SIMPLES (Jules Piral, 2026-09-18) :
          // le cadre (l'actualité), l'objet (les enjeux), la période
          // (aujourd'hui), avant de montrer quoi que ce soit.
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
      methode: axeLabel("Part des 12 enjeux", PLAFOND_AXE),
      legende: `Aujourd’hui (depuis minuit), les trois enjeux les plus présents — ${trois.map((t) => libelleEnjeuCourt(t.issueFr)).join(", ")} — pèsent ${somme} % de l’attention que les Unes de l’actualité consacrent aux douze enjeux de la campagne. Les douze parts somment à 100 %.`,
    };
  },
};
