// 4. L'IMAGE, LA NOUVELLE, LE DEGRÉ DE SAILLANCE (Jules Piral, 2026-09-19).
// L'illustration du jour, le titre de la Une n°1 EN ENTIER et sa place sur les
// six niveaux de saillance. Le site affiche le niveau et sa valeur, jamais
// l'échelle complète : voir le cran occupé parmi les six est inédit.
//
// UN SEUL TEXTE À L'ÉCRAN, DU DÉBUT À LA FIN. Les autres analyses font passer
// deux phrases l'une après l'autre ; ici le titre RESTE (Jules Piral,
// 2026-09-19 : « le titre de la nouvelle doit être présent en entier pour que
// ce soit clair de quoi on parle »). Rien ne se superpose donc jamais : le
// texte est au-dessus de la boîte, l'image et l'échelle dedans.

import { MODULES } from "@/lib/modules";

import { ART_CREDIT } from "../../lib/illustration";
import { COLORS, SALIENCE_COLORS, enjeuGlyph, esc, fleur, frNum } from "../../lib/reel";
import { LARGEUR, corpsTitre, type Analyse } from "../plan";

/** Les six niveaux de l'échelle de saillance du site (SALIENCE_COLORS). */
const NIVEAUX = 6;

/** Hauteur de l'image dans la boîte caméra ; le reste porte l'échelle. */
const IMAGE_H = 420;

/** Marge intérieure de la boîte. La caméra pousse jusqu'à 1,04 : ce qui est
 *  collé au bord finirait rogné par la boîte, qui coupe ce qui dépasse. */
const MARGE = 18;

/** Le papier du module, pour le fondu de l'image (un `transparent` de dégradé
 *  passe par du gris chez Chromium : on écrit le papier avec alpha 0). */
const PAPIER = MODULES["une-des-unes"].papier;
const PAPIER_RGBA = (a: number) => {
  const n = parseInt(PAPIER.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Le moment de l'édition, dans les mots du site (SAILLANT_TODAY,
 *  lib/data/headlineEvents.ts) : les six heures de publication. */
const MOMENT: Record<number, string> = {
  0: "Cette nuit", 4: "Tôt ce matin", 8: "Ce matin",
  12: "Ce midi", 16: "Cet après-midi", 20: "Ce soir",
};

export const saillance: Analyse = {
  id: "saillance",
  idee: "L’image de la Une, son titre en entier et son degré de saillance sur les six niveaux",
  construire({ top, edition, art }) {
    const rang = top.saillanceRank;
    const points = top.scoreQcSum24h;
    // Sans rang ni valeur, il n'y a pas de degré à montrer.
    if (!rang || rang < 1 || rang > NIVEAUX || points == null || points <= 0) return null;

    const bande = SALIENCE_COLORS[rang] ?? { bg: COLORS.rule, fg: COLORS.ink };
    const moment = MOMENT[edition.pubHour % 24] ?? "En ce moment";

    // L'image, ou l'aplat de l'enjeu quand elle manque (même repli que le module
    // et que le reel long : jamais l'illustration d'une autre Une).
    const image = art
      ? `<img src="${art}" alt="">`
      : `<div class="fleur" style="background:${top.issueColor}">${fleur(PAPIER, 300)}</div>`;

    // Les six crans. L'ÉCHELLE EST LÀ DÈS LE DÉBUT, vide : ce sont ses cases qui
    // se remplissent une à une jusqu'au degré du jour. Un bloc qui apparaîtrait
    // seulement à la moitié du plan laisserait tout le bas du cadre vide
    // pendant deux secondes, pile au centre de la vignette du profil.
    const crans = Array.from({ length: NIVEAUX }, (_, i) => {
      const atteint = i < rang;
      const couleur = SALIENCE_COLORS[i + 1]?.bg ?? COLORS.rule;
      return `<div class="cran">${atteint ? `<i style="background:${couleur};animation:grow .42s ${(0.9 + i * 0.14).toFixed(2)}s both"></i>` : ""}</div>`;
    }).join("");

    return {
      visuel: `
        <div class="img">${image}<div class="fondu"></div></div>
        <div class="enjeu mono" style="background:${top.issueColor};animation:fadeIn .5s .15s both">
          <span class="glyphe">${enjeuGlyph(top.issueKey, PAPIER, 30)}</span>${esc(top.issueFr)}</div>
        <div class="bloc">
          <div class="credit" style="animation:fadeIn .6s .3s both"><i></i>${esc(ART_CREDIT)}</div>
          <div class="tete mono" style="animation:fadeIn .5s .3s both">
            <span>Degré de saillance</span><span class="rang">Niveau ${rang} sur ${NIVEAUX}</span></div>
          <div class="crans" style="animation:fadeIn .4s .45s both">${crans}</div>
          <div class="niv">
            <span class="badge pf" style="background:${bande.bg};color:${bande.fg};animation:pop .4s 1.05s both">${esc(top.saillanceLabel)}</span>
            <span class="val disp" style="animation:fadeIn .4s 1.05s both"><b>0</b> points</span>
          </div>
        </div>`,
      css: `
/* LE TITRE NE TRAVERSE PAS L'IMAGE. Les phrases du moteur montent de 50 px en
   apparaissant : un titre de trois lignes, qui s'arrête à 22 px de la boîte,
   passait donc SUR l'illustration pendant sa demi-seconde de fondu (Jules
   Piral, 2026-09-19 : « rien ne s'empile les uns sur les autres »). Ici il
   monte de 16 px, et il reste au-dessus de la boîte du premier au dernier
   instant. */
@keyframes monteeTitre{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
#plan .phr{animation-name:monteeTitre}
#plan .img{position:absolute;left:0;right:0;top:0;height:${IMAGE_H}px;overflow:hidden}
#plan .img img{width:100%;height:100%;object-fit:cover;display:block}
#plan .img .fleur{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
#plan .img .fondu{position:absolute;left:0;right:0;bottom:0;height:170px;background:linear-gradient(${PAPIER_RGBA(0)},${PAPIER_RGBA(1)})}
#plan .enjeu{position:absolute;left:${MARGE}px;top:${MARGE}px;max-width:${LARGEUR - 2 * MARGE - 60}px;display:flex;align-items:center;gap:12px;padding:9px 18px;color:${PAPIER};font-size:28px;line-height:1.25;text-align:left}
#plan .enjeu .glyphe{flex:none;display:block}
#plan .bloc{position:absolute;left:${MARGE}px;right:${MARGE}px;bottom:${MARGE}px;text-align:left}
#plan .bloc .credit{text-align:right;font-style:italic;font-size:28px;line-height:1.2;color:var(--softer)}
#plan .bloc .credit i{display:inline-block;width:70px;border-top:2px solid var(--rule);vertical-align:middle;margin-right:14px}
#plan .bloc .tete{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin-top:14px;font-size:28px;color:var(--soft)}
#plan .bloc .tete .rang{color:var(--ink)}
#plan .crans{display:flex;gap:10px;margin-top:12px;height:34px}
#plan .cran{flex:1;height:100%;border:3px solid var(--rule);position:relative;overflow:hidden}
#plan .cran i{position:absolute;inset:-3px;transform-origin:left}
#plan .niv{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:18px}
#plan .niv .badge{display:inline-block;padding:7px 20px 8px;font-size:44px;line-height:1.15}
#plan .niv .val{font-size:38px;line-height:1;white-space:nowrap;color:var(--ink)}
#plan .niv .val b{font-size:76px;font-weight:900}`,
      // La valeur se compte à l'écran, comme les autres chiffres des reels.
      script: `
var v=racine.querySelector(".niv .val b");
if(v)v.textContent=(${points}*ease(clamp((t-1.05)/1.25))).toFixed(1).replace(".",",");`,
      zoom: { x: 50, y: 50, de: 1, a: 1.04, debut: 0 },
      methode: "Saillance cumulée sur 24 heures",
      phrases: [
        // Le titre ne repart pas : pas de `fin`, donc pas de seconde phrase qui
        // viendrait s'écrire par-dessus.
        { a: `${moment}, à la Une de l’actualité…`, b: top.title, taille: corpsTitre(top.title), couleur: top.issueColor, debut: .15 },
      ],
      legende: `« ${top.title} » est la Une n°1 de l’actualité québécoise : saillance ${top.saillanceLabel.toLowerCase()}, ${frNum(points)} points cumulés sur 24 heures — le niveau ${rang} des six de l’échelle. Enjeu : ${top.issueFr}.`,
    };
  },
};
