// MOTEUR DES REELS COURTS « Partis et couverture ».
//
// Décisions de Jules Piral (2026-09-17) : 12 secondes au plus, fin comprise ;
// UN SEUL PLAN, pas des slides (« quelque chose qui sorte de l'ordinaire ») ;
// deux ou trois informations au plus ; des phrases qu'on comprend du premier
// coup ; une statistique INÉDITE, calculée à partir du module et jamais affichée
// telle quelle sur le site.
//
// Une ANALYSE (dossier `analyses/`) ne décrit que son idée : son visuel, ses
// phrases et sa légende. Ce fichier s'occupe du reste — le plan, la caméra, le
// passage des phrases, la fin commune, la limite de 12 s et le gabarit.

import type { EditionRef } from "@/lib/data/headlineEvents";
import type { PartiesData, RowView } from "@/lib/data/parties";

import { captionTypo } from "../lib/commun";
import { HASHTAGS, MODULE, type MediaMix } from "../lib/partis";
import { COL, CONTENT_TOP, COLORS, TONE, esc, txt } from "../lib/reel";

/** Ce que reçoit une analyse. `rows` : les partis depuis minuit, du plus au
 *  moins présent. */
export type Contexte = { data: PartiesData; rows: RowView[]; mixes: MediaMix[]; edition: EditionRef };

/** Une phrase à l'écran : une petite ligne d'amorce (`a`), une grande ligne
 *  (`b`), de `debut` à `fin` (secondes au rythme de base). */
export type Phrase = { a?: string; b: string; couleur?: string; debut: number; fin?: number };

export type Plan = {
  /** Le visuel, posé dans la boîte caméra (884 × 700 px, y 700 → 1400). */
  visuel: string;
  css?: string;
  /** Corps d'une fonction `(t, racine)` appelée à chaque image : `t` en secondes
   *  (rythme de base) depuis le début du plan, `racine` = la boîte caméra. */
  script?: string;
  phrases: Phrase[];
  /** Moment d'un éclair blanc (le visuel franchit quelque chose). */
  eclair?: number;
  /** Mouvement de caméra : léger travelling avant (défaut) ou zoom sur un point
   *  de la boîte (x, y en % de la boîte). */
  zoom?: { x: number; y: number; de: number; a: number; debut: number };
  /** Légende Instagram : une ou deux phrases, sans lien ni mots-clics. */
  legende: string;
};

export type Analyse = {
  id: string;
  /** Ce que l'analyse raconte, en une ligne (pour la liste). */
  idee: string;
  /** Le plan, ou `null` quand les données du jour ne s'y prêtent pas. */
  construire(ctx: Contexte): Plan | null;
};

/** Durée du plan, au rythme de base (× SLOW à l'écran). */
export const DUREE_PLAN = 5.6;
export const MAX_SECONDES = 12;

/** Boîte caméra. */
// La boîte descend jusqu'à y 1500 : le BAS DU CARRÉ CENTRAL, puisqu'elle porte
// `data-cle` — c'est elle qu'on doit voir dans la grille du profil. À 650 px de
// haut elle s'arrêtait à 1356 et laissait 184 px vides sous le plan.
export const BOITE = { gauche: 116, droite: 180, haut: 706, hauteur: 794 };
export const LARGEUR = 1080 - BOITE.gauche - BOITE.droite;

export function scenePlanHtml(plan: Plan): { html: string; css: string; script: string } {
  const phrases = plan.phrases.map((p, i) => {
    const sortie = p.fin != null ? `, sortie .35s ${p.fin}s forwards` : "";
    return `${p.a ? `<div class="phr a pf" style="animation:fadeUp .45s ${p.debut}s both${sortie}">${txt(p.a)}</div>` : ""}
      <div class="phr b disp" data-i="${i}" style="${p.couleur ? `color:${p.couleur};` : ""}animation:fadeUp .45s ${p.debut + (p.a ? .45 : 0)}s both${sortie}">${txt(p.b)}</div>`;
  }).join("");
  const z = plan.zoom;
  const camera = z
    ? `transform-origin:${z.x}% ${z.y}%;animation:zoomPlan ${DUREE_PLAN}s linear both`
    : `transform-origin:50% 100%;animation:cameraPlan ${DUREE_PLAN}s linear both`;
  const html = `
    <div class="cadre-camera" data-cle><div class="camera" style="${camera}">${plan.visuel}</div></div>
    ${plan.eclair != null ? `<div class="eclair" data-deco style="animation:eclair .7s ${plan.eclair}s both"></div>` : ""}
    ${phrases}`;
  const css = `
#plan .cadre-camera{position:absolute;left:${BOITE.gauche}px;right:${BOITE.droite}px;top:${BOITE.haut}px;height:${BOITE.hauteur}px;overflow:hidden}
#plan .camera{position:absolute;inset:0}
@keyframes cameraPlan{from{transform:scale(.94)}to{transform:scale(1)}}
${z ? `@keyframes zoomPlan{0%{transform:scale(${z.de})}${Math.round((z.debut / DUREE_PLAN) * 100)}%{transform:scale(${z.de})}100%{transform:scale(${z.a})}}` : ""}
#plan .eclair{position:absolute;left:30px;right:180px;top:30px;bottom:30px;background:#fff;opacity:0;pointer-events:none}
@keyframes eclair{0%{opacity:0}15%{opacity:.55}100%{opacity:0}}
@keyframes sortie{to{opacity:0;transform:translateY(-40px)}}
#plan .phr{position:absolute;left:${COL}px;right:${COL}px}
/* Sous la barre de marque de LA PLATEFORME : 288 px était la valeur d'Instagram.
   Les dix courts n'avaient jamais été essayés en format fil, où la barre est
   plus haute — 32 écarts, un par phrase (mesuré le 2026-09-22). */
#plan .phr.a{top:${CONTENT_TOP + 14}px;font-size:46px;line-height:1.12;font-weight:700}
#plan .phr.b{top:${CONTENT_TOP + 122}px;font-size:88px;line-height:1.02;color:var(--ink)}
${plan.css ?? ""}`;
  const script = plan.script ? `
(function(){
const ease=k=>1-Math.pow(1-k,3), clamp=k=>Math.max(0,Math.min(1,k));
const anime=function(t,racine){${plan.script}};
const prev=window.onSceneTime;
window.onSceneTime=function(id,t,d){ if(prev)prev(id,t,d); if(id==="plan")anime(t,document.querySelector("#plan .camera")); };
})();` : "";
  return { html, css, script };
}

export function legendeComplete(plan: Plan): string {
  return captionTypo([plan.legende, `${MODULE}, six fois par jour : vitrinedemocratique.com`, HASHTAGS.join(" ")].join("\n\n")) + "\n";
}

// ── Briques de visuel, partagées par les analyses ───────────────────────────

/** Barres verticales des partis. Chaque barre porte `data-de` (valeur de départ)
 *  et `data-a` (valeur d'arrivée) ; `scriptBarres` les anime et affiche la valeur.
 *  Échelle : 1 % = `echelle` px, depuis la ligne de base. */
export const BARRES = { puce: 70, etiquette: 70 };
export const ECHELLE_BARRES = (BOITE.hauteur - BARRES.puce - BARRES.etiquette) / 100;
export const BASE_BARRES = BOITE.hauteur - BARRES.puce;

export function barresHtml(barres: { key: string; label: string; color: string; de: number; a: number }[]): string {
  return `<div class="barres">${barres.map((b) => `
    <div class="bp" data-key="${b.key}" data-de="${b.de}" data-a="${b.a}">
      <div class="p disp" style="color:${b.color}">${b.de}&nbsp;%</div>
      <div class="f" style="background:${b.color}"></div>
      <div class="s pf" style="background:${b.color}">${esc(b.label)}</div>
    </div>`).join("")}</div>`;
}

export const CSS_BARRES = `
#plan .barres{position:absolute;inset:0 20px;display:flex;align-items:flex-end;gap:26px}
#plan .bp{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end}
#plan .bp .p{text-align:center;font-size:52px;line-height:1;margin-bottom:10px;white-space:nowrap}
#plan .bp .s{height:${BARRES.puce - 12}px;margin-top:12px;text-align:center;color:#fff;font-size:40px;line-height:${BARRES.puce - 12}px}
`;

/** Anime les barres de `data-de` à `data-a` entre `t0` et `t0 + d` ; les barres
 *  autres que `garder` pâlissent à partir de `pale`. */
export function scriptBarres(o: { t0: number; d: number; garder?: string; pale?: number; decale?: number }): string {
  return `
  racine.querySelectorAll(".bp").forEach(function(b,i){
    var de=+b.dataset.de, a=+b.dataset.a;
    var k=ease(clamp((t-${o.t0}-i*${o.decale ?? .05})/${o.d}));
    var v=de+(a-de)*k;
    b.querySelector(".f").style.height=(v*${ECHELLE_BARRES.toFixed(3)})+"px";
    b.querySelector(".p").textContent=Math.round(v)+"\\u00A0%";
    ${o.garder ? `b.style.opacity=(b.dataset.key==="${o.garder}")?1:(1-.55*clamp((t-${o.pale ?? 99})/.5));` : ""}
  });`;
}

/** Ligne pointillée horizontale à la valeur `pct` des barres, avec son étiquette. */
export function ligneBarres(pct: number, etiquette: string, debut: number): string {
  return `<div class="ligne" style="top:${(BASE_BARRES - pct * ECHELLE_BARRES).toFixed(0)}px">
    <i style="animation:grow .6s ${debut}s both"></i><span class="mono" style="animation:fadeIn .4s ${debut + .3}s both">${esc(etiquette)}</span></div>`;
}
export const CSS_LIGNE = `
#plan .ligne{position:absolute;left:20px;right:20px;height:0}
#plan .ligne i{position:absolute;left:0;right:0;top:0;border-top:5px dashed var(--ink);transform-origin:left}
#plan .ligne span{position:absolute;right:0;top:14px;max-width:560px;text-align:right;line-height:1.25;font-size:28px;letter-spacing:.04em;color:var(--ink);background:var(--paper);padding:2px 8px}
`;

/** Fraction simple quand elle tombe à 3 points près (« 2 fois sur 3 »). */
const FRACTIONS: [number, number][] = [[1, 2], [2, 3], [3, 4], [4, 5], [1, 3], [1, 4], [2, 5], [3, 5]];
export function commeOnLeDit(pct: number): string | null {
  const f = FRACTIONS.find(([n, d]) => Math.abs((n / d) * 100 - pct) <= 3);
  return f ? `${f[0]} fois sur ${f[1]}` : null;
}

/** « près de 3 fois », « plus de 2 fois », « 4 fois ». */
export function fois(r: number): string {
  const n = Math.round(r);
  return Math.abs(r - n) < .05 ? `${n} fois` : r < n ? `près de ${n} fois` : `plus de ${n} fois`;
}

/** « 7 h 56 », « 42 min ». */
export function duree(minutes: number): string {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export { COLORS, TONE };
