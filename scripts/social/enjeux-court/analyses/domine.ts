// LE GABARIT « CE QUI DOMINE » — un classement des 12 enjeux sur une période.
//
// Retenu par Jules Piral le 2026-09-18 (« celui qui domine est parfait,
// enregistre-le comme template ») et décliné en TROIS périodes : le jour, la
// semaine, la campagne. Ce sont les trois que le module offre sur le site, sous
// ces mots-là — l'onglet `month` de la treemap s'appelle « Campagne », pas
// « Mois » : on reprend le vocabulaire du site, on n'en invente pas.
//
// UN CLASSEMENT, PAS UNE BANDE (même séance). La bande de 100 % découpée en
// douze disait bien « trois sur douze dépassent la moitié », mais elle
// demandait un mode d'emploi : il fallait d'abord comprendre que la largeur
// totale valait le tout. Un classement numéroté se lit sans rien expliquer —
// un rang, un nom, une barre, une part.

import { libelleEnjeuCourt } from "@/lib/enjeux";
import { MODULES } from "@/lib/modules";

import { esc } from "../../lib/reel";
import { BOITE, LARGEUR, PLAFOND_AXE, type Analyse, type Periode } from "../plan";

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
const COULEUR_MODULE = MODULES["enjeux-saillants"].accent;

/** Les mots de chaque période. `phrase` tient en DEUX lignes de 46 px : au-delà,
 *  l'amorce déborde sur la grande ligne (le gabarit le refuse). D'où « la
 *  campagne » à l'écran et « depuis le début de la campagne » dans la légende,
 *  où la place ne manque pas. */
const MOTS: Record<Periode, { id: string; phrase: string; axe: string; legende: string; idee: string }> = {
  day: {
    id: "domine-jour",
    phrase: "aujourd’hui",
    axe: "aujourd’hui",
    legende: "Aujourd’hui (depuis minuit)",
    idee: "Les enjeux qui dominent l’actualité aujourd’hui",
  },
  week: {
    id: "domine-semaine",
    phrase: "cette semaine",
    axe: "cette semaine",
    legende: "Cette semaine (sept derniers jours)",
    idee: "Les enjeux qui dominent l’actualité cette semaine",
  },
  month: {
    id: "domine-campagne",
    phrase: "la campagne",
    axe: "la campagne",
    legende: "Depuis le début de la campagne",
    idee: "Les enjeux qui dominent l’actualité depuis le début de la campagne",
  },
};

function nomAffiche(t: { issueKey: string; issueFr: string }): string {
  if (t.issueKey === "international_affairs_and_defense") {
    return "Aff. Internationales";
  }
  return libelleEnjeuCourt(t.issueFr);
}

function cssString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Fabrique l'analyse « ce qui domine » pour une période. */
export function domine(periode: Periode): Analyse {
  const mots = MOTS[periode];
  return {
    id: mots.id,
    idee: mots.idee,
    construire({ data }) {
      const tuiles = [...data[periode].tiles].sort((a, b) => b.share - a.share);
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
          <b class="nom">${esc(nomAffiche(t))}</b>
          <i class="barre" style="width:${large.toFixed(1)}px;background:${couleur};animation:growX .6s ${(d + 0.2).toFixed(2)}s both"></i>
          <span class="part mono" style="color:${couleur}">${part}&nbsp;%</span>
        </div>`;
      }).join("");

      const deg = Math.max(0, Math.min(100, somme)) * 3.6;
      const amorce = `Dans l’actualité, les enjeux qui dominent ${mots.phrase} :`;
      const phrases = [
        {
          b: esc(nomAffiche(trois[0])),
          couleur: trois[0].color,
          debut: .45,
          fin: 1.25,
        },
        {
          b: esc(nomAffiche(trois[1])),
          couleur: trois[1].color,
          debut: 1.35,
          fin: 2.15,
        },
        {
          b: esc(nomAffiche(trois[2])),
          couleur: trois[2].color,
          debut: 2.25,
          fin: 3.15,
        },
        {
          a: "Les trois premiers enjeux couvrent",
          b: `${somme} % de l’actualité`,
          couleur: COULEUR_MODULE,
          debut: 3.35,
        },
      ];

      return {
        visuel: `<div class="classement">${rangs}</div>
          <div class="couverture" style="--module:${COULEUR_MODULE};--deg:${deg.toFixed(1)}deg">
            <div class="anneau"><span>${somme}&nbsp;%</span></div>
            <b>des Unes consacrées<br>aux 12 enjeux</b>
          </div>`,
        css: `
#plan::before{content:"${cssString(amorce)}";position:absolute;left:180px;right:180px;top:328px;font-family:"Playfair Display",serif;font-weight:700;font-size:46px;line-height:1.12;animation:fadeUp .45s .15s both, sortie .35s 3.15s forwards}
#plan .classement{position:absolute;inset:0}
#plan .classement{animation:sortie .35s 3.15s forwards}
#plan .classement .rang{position:absolute;left:0;right:0;height:${HAUTEUR}px;display:flex;align-items:center;gap:20px;padding-right:12px;border-bottom:2px solid var(--rule)}
#plan .classement .n{flex:none;width:${COL_RANG}px;text-align:right;font-size:36px;color:var(--soft)}
#plan .classement .nom{flex:none;width:${COL_NOM}px;text-align:left;font-family:"Playfair Display",serif;font-weight:700;font-size:40px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#plan .classement .barre{flex:none;display:block;height:44px;transform-origin:left}
#plan .classement .part{flex:none;margin-left:auto;width:${COL_PART}px;text-align:right;font-size:36px}
#plan .couverture{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:42px;opacity:0;animation:fadeIn .45s 3.42s both}
#plan .couverture .anneau{width:360px;height:360px;border-radius:50%;background:conic-gradient(var(--module) 0 var(--deg),var(--rule) var(--deg) 360deg);position:relative;box-shadow:inset 0 0 0 2px rgba(28,25,23,.12)}
#plan .couverture .anneau::after{content:"";position:absolute;inset:58px;border-radius:50%;background:var(--paper)}
#plan .couverture .anneau span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Playfair Display",serif;font-weight:900;font-size:72px;line-height:1;color:var(--module);z-index:1}
#plan .couverture b{max-width:270px;font-family:"Playfair Display",serif;font-weight:700;font-size:48px;line-height:1.08;color:var(--ink)}
@keyframes growX{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
        phrases,
        methode: `12 enjeux · ${mots.axe} · axe 0–${PLAFOND_AXE} %`,
        legende: `${mots.legende}, les trois enjeux les plus présents — ${trois.map(nomAffiche).join(", ")} — couvrent ${somme} % de l’actualité consacrée aux douze enjeux de la campagne. Les douze parts somment à 100 %.`,
      };
    },
  };
}
