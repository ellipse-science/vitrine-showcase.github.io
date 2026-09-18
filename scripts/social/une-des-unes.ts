// Reel Instagram du module 1 — La Une des Unes : ce qui domine l'actualité du
// Québec en ce moment.
//
//   npm run reel:une-des-unes                        # aperçu animé (navigateur)
//   npm run reel:une-des-unes -- --mp4               # la vidéo, après validation
//   npm run reel:une-des-unes -- --edition 2026-09-16T15
//   npm run reel:une-des-unes -- --apercu 5,20,40     # images fixes seulement
//
// Sortie : social-out/une-des-unes_<date>_<heure>.mp4 et la légende .txt.
//
// LES DONNÉES VIENNENT DES LOADERS DU SITE (`loadHeadlineEvents`), pas du HTML
// publié : le reel montre exactement ce que calcule la section, avec les mêmes
// libellés de saillance et la même phrase de trajectoire. Corollaire : il
// montre ce que contient le dépôt LOCAL. `git pull` avant de tourner.
//
// LA DONNÉE D'ABORD. Chaque scène porte un chiffre ou un graphique ; le texte
// ne sert qu'à les lire. La scène centrale est la trajectoire de saillance.
// RIEN NE DÉPASSE DU CADRE : toutes les positions restent dans FRAME
// (lib/reel.ts), et le rendu refuse de produire la vidéo sinon.

import fs from "node:fs/promises";
import path from "node:path";

import { listEditions, loadHeadlineEvents, type EditionRef, type UneEvent } from "@/lib/data/headlineEvents";
import { MEDIA_LABELS, MEDIA_PANEL_QC } from "@/lib/medias";
import { MODULES } from "@/lib/modules";
import { TRAIT, oqlf } from "./lib/post";
import { RESPONSABLE, formats, type Matiere, type Reseau } from "./lib/reseaux";
import { matchesCurrentUneArt } from "@/lib/shareUneArt";
import {
  COLORS, FIN_CSS, INTRO_CSS, LINKEDIN, SALIENCE_COLORS, SITE_URL, buildPage, celestial, enjeuGlyph, esc, fleur, frNum,
  parseArgs, produce, publicationHour, chargerPartenaires, sceneFin, sceneIntro, loadLogos, txt, type Scene,
} from "./lib/reel";

/** Identité du module : couleur, nom et lignes d'accroche (lib/modules.ts). */
const MODULE = MODULES["une-des-unes"];

/** Crédit de l'illustration de la Une. */
const ART_CREDIT = "Image générée sous la direction de Mathieu Fortin";

/** Logo de la Vitrine (même fichier que les cartes de partage,
 *  `lib/globalShareCard.tsx`) : une seule version de la marque. */
async function loadLogo(): Promise<string | null> {
  try {
    const png = await fs.readFile(path.resolve(process.cwd(), "public", "images", "brand", "logo_vitrinedemocratique_bg-none_theme-black.png"));
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    console.warn("  logo introuvable : scènes d'ouverture et de fin sans logo.");
    return null;
  }
}

// ── Illustration ────────────────────────────────────────────────────────────
// Même garde que le module (UneDesUnesSection) : `latest.png` est écrasée à
// chaque cycle, elle n'illustre donc que l'édition COURANTE, et seulement si
// elle appartient bien à la Une n°1. Dans le doute, pas d'image : une Une
// sans illustration vaut mieux qu'une illustration de la mauvaise Une.
async function resolveArt(edition: EditionRef, current: EditionRef, top: UneEvent): Promise<string | null> {
  if (edition.key !== current.key) return null;

  // 1. Illustration rapatriée localement par scripts/fetch_art.mjs (clé d'API).
  const dir = path.resolve(process.cwd(), "public", "data", "generated-art");
  try {
    const meta = JSON.parse(await fs.readFile(path.join(dir, "latest.json"), "utf8"));
    if (matchesCurrentUneArt(meta, top)) {
      const png = await fs.readFile(path.join(dir, "latest.png"));
      return `data:image/png;base64,${png.toString("base64")}`;
    }
  } catch { /* pas de copie locale : on tente le site */ }

  // 2. Illustration publiée. Le site la sert à côté de hero-selection.json,
  //    qui nomme la Une de CE déploiement : les deux viennent du même build.
  try {
    const hero = (await (await fetch(`${SITE_URL}/data/hero-selection.json`)).json()) as { storyline_id?: string; event_id?: string };
    if (!matchesCurrentUneArt(hero, top)) {
      console.warn("  illustration ignorée : le site publié illustre une autre Une que le dépôt local.");
      return null;
    }
    const res = await fetch(`${SITE_URL}/data/generated-art/latest.png`);
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    console.warn("  illustration indisponible (site injoignable) : mise en page sans image.");
    return null;
  }
}

// ── Formulations ────────────────────────────────────────────────────────────
/** Le centile se lit comme sur le site (`hintFromCentile`, arrêté avec Adrien
 *  le 2026-08-09) : borné à [1, 99], et on compte ce que la nouvelle DÉPASSE
 *  au-dessus de la médiane, ce qui la dépasse en dessous. « Plus saillante que
 *  92 % des Unes », jamais « 92 % plus saillante » : ce serait un écart de
 *  score, pas un rang. */
function centileMessage(centile: number): { c: number; big: number; before: string; after: string } {
  const c = Math.max(1, Math.min(99, Math.round(centile)));
  return c >= 50
    ? { c, big: c, before: "Cette actualité est plus saillante que", after: "des Unes québécoises de l’année" }
    : { c, big: 100 - c, before: "", after: "des Unes québécoises de l’année sont plus saillantes que cette actualité" };
}

/** « 6/6 des médias québécois en parlent ». */
const coverageLabel = (n: number) => (n > 1 ? "des grands médias québécois en parlent" : "des grands médias québécois en parle");

/** « Le Journal de Montréal » (lib/medias.ts) et « Journal de Montréal »
 *  (mediaToday) désignent le même média. */
const sameOutlet = (a: string, b: string) => a.replace(/^Le /, "") === b.replace(/^Le /, "");

/** « 20h hier soir » → « hier soir » : l'heure est déjà portée par le pictogramme. */
const momentOf = (label: string) => label.replace(/^\d{1,2}h\s*/, "");

// ── Mise en page ────────────────────────────────────────────────────────────
// Repères : intérieur du cadre 30 → 1050 (x) et 30 → 1890 (y) ; marge de texte 76.
/** Hauteur de la boîte .chart de la trajectoire — CSS et viewBox de la ligne. */
const TRAJ_H = LINKEDIN ? 640 : 580;

const CSS = `
.kick{font-size:30px;color:var(--softer)}

/* 1. Accroche — le reste est dans INTRO_CSS (lib/reel.ts) */
#intro .ghost{position:absolute;left:46px;right:46px;bottom:0;height:520px;display:flex;align-items:flex-end;gap:18px}
#intro .ghost div{flex:1;transform-origin:bottom}

/* 2. Une n°1 */
/* Instagram : le format de Jules, l'image dès le haut sous la barre des logos.
   LinkedIn (Adrien, 17-09 : « libère le haut avec les logos clairement visibles,
   descends l'image et le texte ») : l'image commence sous la ligne d'édition, à
   280, et le texte prend le bas. */
#une .art{position:absolute;left:30px;top:${LINKEDIN ? 330 : 30}px;width:1020px;height:${LINKEDIN ? 800 : 860}px;overflow:hidden}
#une .art img{width:100%;height:100%;object-fit:cover}
#une .art::after{content:"";position:absolute;inset:auto 0 0 0;height:200px;background:linear-gradient(transparent,var(--paper))}
#une .noart{position:absolute;left:30px;top:${LINKEDIN ? 330 : 30}px;width:1020px;height:${LINKEDIN ? 800 : 860}px;display:flex;align-items:center;justify-content:center}
#une .rank{position:absolute;top:${LINKEDIN ? 380 : 282}px;left:180px;background:var(--ink);color:var(--paper);font-size:30px;padding:12px 20px}
#une .credit{position:absolute;top:${LINKEDIN ? 1074 : 742}px;right:210px;display:flex;align-items:center;gap:14px;font-style:italic;font-size:28px;color:var(--softer);opacity:.85}
#une .credit::before{content:"";width:48px;height:1px;background:var(--softer)}
#une .body{position:absolute;left:180px;right:180px;top:${LINKEDIN ? 1170 : 830}px}
#une .tag{display:inline-block;color:var(--paper);font-size:28px;padding:10px 18px}
#une h2{font-size:82px;line-height:1.02;margin-top:24px}
#une .stats{display:flex;gap:26px;margin-top:30px}
#une .stat{flex:1;border-top:6px solid var(--ink);padding-top:16px}
#une .stat:first-child{flex:1.4}
#une .stat b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:60px;line-height:1.05;white-space:nowrap}
#une .stat span{display:block;margin-top:${LINKEDIN ? 14 : 4}px;text-wrap:balance}
#une .stat span{font-size:28px;color:var(--soft)}

/* 3. Trajectoire */
#trajectoire .head{flex:none}
#trajectoire .une{display:flex;justify-content:center;gap:18px;align-items:flex-start;margin-top:14px}
#trajectoire .une svg{flex:none;margin-top:6px}
#trajectoire .une h3{font-size:44px;line-height:1.08;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#trajectoire .live{display:flex;justify-content:center;align-items:flex-end;gap:22px;margin-top:22px}
#trajectoire .counter{font-family:"Playfair Display",serif;font-weight:900;font-size:132px;line-height:.85;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
#trajectoire .unit{font-size:28px;color:var(--softer);padding-bottom:16px}
#trajectoire .bandeau{flex:none;display:flex;align-items:center;justify-content:space-between;gap:24px}
#trajectoire .chip{font-size:28px;padding:9px 16px}
#trajectoire .when{display:flex;align-items:center;gap:14px;font-size:28px;color:var(--soft)}
#trajectoire .chart{position:relative;flex:none;height:${TRAJ_H}px}
#trajectoire .grid{position:absolute;left:0;right:0;height:2px;background:var(--rule);opacity:.6}
#trajectoire .bar{position:absolute;transform-origin:bottom}
#trajectoire .bar.absent{background:repeating-linear-gradient(135deg,var(--rule) 0 12px,transparent 12px 24px)!important;outline:3px dashed var(--softer);outline-offset:-3px}
#trajectoire .val{position:absolute;font-family:"Playfair Display",serif;font-weight:700;font-size:40px;text-align:center}
#trajectoire .peak{position:absolute;font-size:28px;background:var(--ink);color:var(--paper);padding:8px 0;text-align:center}
#trajectoire .xl{position:absolute;text-align:center;color:var(--soft)}
#trajectoire .xl b{display:block;font-family:"IBM Plex Mono",monospace;font-size:28px;margin-top:6px;color:var(--ink)}
#trajectoire .xl span{display:block;font-size:28px;line-height:1.05;margin-top:4px;margin-left:-40px;margin-right:-40px;white-space:nowrap}
#trajectoire .xl.now b{color:var(--blue)}
#trajectoire .xl.now span{margin-left:-80px;margin-right:0}
#trajectoire .trace{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
#trajectoire .cap{flex:none;font-size:34px;line-height:1.12;text-wrap:balance}
@keyframes draw{to{stroke-dashoffset:0}}

/* 4. Centile */
#centile .head{position:absolute;top:${LINKEDIN ? 310 : 282}px;left:180px;right:180px}
#centile .lead{font-style:italic;font-size:42px;color:var(--soft);margin-top:14px}
#centile .big{font-family:"Playfair Display",serif;font-weight:900;font-size:170px;line-height:1.02;letter-spacing:-.04em;margin-top:6px}
#centile .big small{font-size:100px;letter-spacing:0;margin-left:10px}
#centile .of{font-family:"Playfair Display",serif;font-weight:700;font-size:42px;line-height:1.1;margin-top:${LINKEDIN ? 30 : 16}px}
#centile .scale{position:absolute;left:124px;width:270px}
/* Chaque « feuille » : un filet plus épais que large, posé de travers, avec
   l'ombre de la feuille du dessous — c'est ce qui fait la pile. */
#centile .scale i{position:absolute;left:0;height:6px;background:#E3D9C2;
  background-image:linear-gradient(to bottom,rgba(255,255,255,.6),rgba(255,255,255,0) 60%);
  box-shadow:0 1px 0 rgba(28,25,23,.08);transform-origin:left center}
#centile .scale i.on{height:7px;margin-top:-1px;box-shadow:0 1px 0 rgba(28,25,23,.18)}
#centile .tick{position:absolute;left:180px;white-space:nowrap;font-size:28px;letter-spacing:0;color:var(--softer)}
#centile .mark{position:absolute;left:180px;right:180px;height:3px;background:var(--ink);transform-origin:left;box-shadow:0 0 0 3px var(--paper)}
#centile .mark::before{content:"";position:absolute;left:262px;top:-9px;width:21px;height:21px;border-radius:50%;background:var(--ink)}
#centile .mlabel{position:absolute;right:180px;font-family:"Playfair Display",serif;font-style:italic;font-weight:400;font-size:40px}
#centile .note{position:absolute;left:380px;right:180px}
#centile .note b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:72px;line-height:1}
#centile .note span{display:block;font-size:32px;line-height:1.25;margin-top:6px;color:var(--soft)}
#centile .src{position:absolute;left:180px;right:180px;bottom:${LINKEDIN ? 250 : 380}px;font-size:28px;font-style:italic;line-height:1.25;color:var(--softer)}

/* 5. Couverture */

#couverture .big{font-family:"Playfair Display",serif;font-weight:900;font-size:210px;line-height:1.02;color:var(--blue)}
/* Dans la colonne de 720 px, « des grands médias québécois en parlent » se
   repliait en laissant « parlent » seul : le repli est décidé (deux lignes
   équilibrées), plus subi. */
#couverture .lab{font-size:44px;line-height:1.1;margin-top:${LINKEDIN ? 34 : 22}px;text-wrap:balance}
#couverture .grandir{padding-top:80px}
#couverture ul{flex:none;list-style:none;border-top:3px solid var(--ink)}
#couverture li{height:${LINKEDIN ? 120 : 98}px;display:flex;justify-content:space-between;align-items:center;gap:30px;border-bottom:2px solid var(--rule)}
/* 48 px, pas 56 : « Journal de Montréal » (516 px à 56 px) perdait ses cinq
   dernières lettres dans les 466 px que lui laisse la colonne de #823. */
#couverture li b{font-family:"Playfair Display",serif;font-weight:700;font-size:48px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#couverture li span{flex:none;font-size:28px;color:var(--blue)}
#couverture li.off b{color:var(--rule)}
#couverture li.off span{color:var(--rule)}
#couverture .since{flex:none;font-size:38px;font-style:italic;color:var(--soft)}

/* 6. Classement */
#classement .head{flex:none}
#classement h3{font-size:58px;line-height:1.02;margin-top:10px}
/* La liste des trois nouvelles vit au-dessus de y 1040 : là, la zone sûre de #823
   laisse 110 px de chaque côté (la colonne de boutons n'existe qu'en dessous).
   Elle s'élargit donc à 860 px, symétrique elle aussi — sinon « Affaires
   internationales et défense » (41 caractères) ne tient sur une ligne à aucune
   taille lisible dans les 638 px que laisse la colonne (20h du 17-09). */
#classement .leg{flex:none;margin:0 ${LINKEDIN ? -70 : 0}px}
/* Trois nouvelles : un titre sur une ligne, sinon la légende descend sur le graphique. */
/* Un titre de Une ne se tronque pas : deux lignes même à trois nouvelles. */
#classement .leg.trois .t{-webkit-line-clamp:${LINKEDIN ? 2 : 1}}
#classement .item{display:flex;gap:20px;align-items:flex-start;padding:${LINKEDIN ? 13 : 9}px 0;border-top:2px solid var(--rule)}
#classement .badge{flex:none;width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--paper)}
#classement .item .txt{min-width:0;text-align:left}
/* Sans interlettrage : avec .04em, « N°2 · Affaires internationales et défense »
   faisait 793 px pour 778 de large ; à 28 px (le minimum) et 0, 747. */
#classement .item .k{font-size:28px;letter-spacing:${LINKEDIN ? 0 : ".04em"};display:flex;align-items:center;gap:12px}
#classement .item .k i{flex:none;display:block;width:46px;height:6px}
#classement .item .t{font-size:28px;line-height:1.1;margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#classement .chart{position:relative;flex:none;height:560px}
#classement .chart > svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
#classement .end{position:absolute;display:flex;align-items:center;gap:12px;white-space:nowrap}
#classement .end .badge{width:54px;height:54px}
#classement .end b{font-family:"Playfair Display",serif;font-weight:900;font-size:42px}
#classement .xl{position:absolute;top:480px;text-align:center;color:var(--soft)}
#classement .xl b{display:block;font-family:"IBM Plex Mono",monospace;font-size:28px;margin-top:4px;color:var(--ink)}
#classement .note{flex:none;font-size:28px;line-height:1.2;color:var(--softer)}

`;

const anim = (name: string, dur: number, delay: number) => `style="animation:${name} ${dur}s ${delay}s both"`;
const pubHourLabel = (edition: EditionRef) => `${edition.pubHour % 24}h`;
const bandOf = (rank: number) => SALIENCE_COLORS[rank] ?? { bg: COLORS.rule, fg: COLORS.ink };

/** Largeur des graphiques : intérieur du cadre moins 30 px de chaque côté. */
const CHART_W = 720;

/** Le visuel d'accroche du module 1 : les barres de saillance de la journée,
 *  en ombre, dans le bandeau d'encre de l'accroche commune. */
function visuelAccroche(top: UneEvent): string {
  const pts = top.salienceTrend?.points ?? [];
  const max = Math.max(1, ...pts.map((p) => p.cumul));
  const barres = pts.map((p, i) =>
    `<div style="height:${Math.max(2, (p.cumul / max) * 100)}%;background:${p.rank > 0 ? bandOf(p.rank).bg : COLORS.soft};animation:growY .7s ${1.2 + i * 0.15}s both"></div>`).join("");
  return `<div class="ghost">${barres}</div>`;
}

function sceneUne(top: UneEvent, art: string | null): Scene {
  const visual = art
    ? `<div class="art" data-deco ${anim("fadeIn", .6, .1)}><img id="art" src="${art}"></div>
       <div class="credit" ${anim("fadeIn", .8, 1.4)}>${txt(ART_CREDIT)}</div>`
    : `<div class="noart" data-deco style="background:${top.issueColor};animation:fadeIn .6s .1s both">${fleur(COLORS.paper, 320)}</div>`;
  // Les bandes 1 à 3 sont trop pâles pour un texte sur papier : encre.
  const salColor = top.saillanceRank >= 4 ? bandOf(top.saillanceRank).bg : COLORS.ink;
  const corps = top.title.length > 62 ? 62 : top.title.length > 46 ? 72 : 82;
  return {
    id: "une", duration: 4.6,
    html: `
      ${visual}
      <div class="rank mono" ${anim("pop", .5, .6)}>Une n°1</div>
      <div class="body">
        <div class="tag mono" style="background:${top.issueColor};animation:wipe .6s .7s both">${txt(top.issueFr)}</div>
        <h2 class="disp" data-cle style="font-size:${corps}px;animation:fadeUp .8s .9s both">${txt(top.title)}</h2>
        <div class="stats">
          <div class="stat" ${anim("fadeUp", .5, 1.8)}><b style="color:${salColor}">${txt(top.saillanceLabel)}</b><span class="pf">${top.scoreQcSum24h != null ? `${frNum(top.scoreQcSum24h)} points de saillance sur 24 heures` : "Saillance sur 24 heures"}</span></div>
          <div class="stat" ${anim("fadeUp", .5, 2.1)}><b style="color:var(--blue)">${top.qcOutletCount}/${top.totalQcOutlets}</b><span class="pf">${coverageLabel(top.qcOutletCount)}</span></div>
        </div>
      </div>`,
  };
}

// La scène vedette : les barres montent une à une, le compteur suit la valeur
// en direct et l'étiquette de niveau change de couleur au passage de chaque
// édition. Le titre de la Une reste affiché : on sait de quoi on parle. Sous
// chaque barre, le pictogramme de l'en-tête du site dit de quel moment de la
// journée il s'agit. Minutage : barre i de STEP0 + i·STEP, pendant GROW.
const STEP0 = 1.2, STEP = 0.8, GROW = 0.6;

/** LE TITRE DE LA TRAJECTOIRE TIENT EN DEUX LIGNES, quelle qu'en soit la
 *  longueur. La boîte est cadrée à deux lignes pour laisser le compteur
 *  respirer : à 50 px, « Un bébé trouvé dans un campement bouleverse la
 *  campagne électorale » en demandait trois et se faisait couper (édition de
 *  20h du 17-09). On réduit le corps plutôt que d'amputer la nouvelle — un
 *  titre de Une ne se tronque pas. */
// Paliers MESURÉS dans la colonne de #823 (h3 de 652 px) : à 42 px, le titre du
// bébé (66 caractères) prend trois lignes ; à 40 il en prend deux, 38 garde une
// marge. 44 est le corps de base de Jules.
const tailleTitre = (t: string) => (t.length > 58 ? 38 : t.length > 48 ? 41 : 44);

function sceneTrajectoire(top: UneEvent): { scene: Scene; data: unknown } | null {
  const trend = top.salienceTrend;
  if (!trend || trend.points.length < 2) return null;
  const pts = trend.points;
  const max = Math.max(...pts.map((p) => p.cumul), 1);
  const BASE = LINKEDIN ? 470 : 410, H = LINKEDIN ? 380 : 330; // ligne de base et hauteur utile (repère .chart, TRAJ_H px)
  const n = pts.length, gap = 22, bw = (CHART_W - 14 - gap * (n - 1)) / n;
  const left = (i: number) => 7 + i * (bw + gap);
  const y = (v: number) => BASE - (v / max) * H;
  const hours = pts.map((p) => publicationHour(p.blockUtc) ?? 0);

  const nice = max > 40 ? 20 : max > 20 ? 10 : 5;
  const grid = Array.from({ length: Math.floor(max / nice) }, (_, k) => (k + 1) * nice)
    .map((v) => `<div class="grid" style="top:${y(v)}px"></div>`).join("");

  const bars = pts.map((p, i) => {
    const d = STEP0 + i * STEP;
    const h = (p.cumul / max) * H;
    const inside = h > 120;
    const valColor = inside && !p.isAbsent ? bandOf(p.rank).fg : p.isNow ? COLORS.red : COLORS.ink;
    return `
      <div class="bar${p.isAbsent ? " absent" : ""}" style="left:${left(i)}px;width:${bw}px;height:${h}px;top:${y(p.cumul)}px;background:${bandOf(p.rank).bg};animation:growY ${GROW}s ${d}s both"></div>
      <div class="val" style="left:${left(i)}px;width:${bw}px;top:${y(p.cumul) + (inside ? 46 : -62)}px;color:${valColor};animation:fadeIn .3s ${d + GROW}s both">${frNum(p.cumul)}</div>
      ${p.isPeak ? `<div class="peak mono" style="left:${Math.max(0, Math.min(CHART_W - 190, left(i) + bw / 2 - 95))}px;width:190px;top:${y(p.cumul) - 58}px;animation:pop .5s ${d + GROW + .1}s both">Sommet</div>` : ""}
      <div class="xl${p.isNow ? " now" : ""}" style="left:${left(i)}px;width:${bw}px;top:${BASE + 16}px;animation:fadeIn .3s ${d}s both">
        <div style="display:flex;justify-content:center">${celestial(hours[i], p.isNow ? COLORS.blue : COLORS.soft, 52)}</div><b>${hours[i]}h</b>${i === 0 || p.isNow ? `<span>${esc(momentOf(p.timeLabel)).replace("après-midi", "après\u2011midi")}</span>` : ""}
      </div>`;
  }).join("");

  // Ligne qui suit le sommet des barres, avec une flèche au bout — « comme pour
  // la bourse » (demande d'Adrien, 2026-09-16, qui renverse le REJET du 16-09
  // au matin). Elle se trace une fois les barres montées ; la flèche prend
  // l'angle du dernier segment, donc elle pointe vers le bas quand l'attention
  // retombe. Un point sur chaque sommet : la ligne dit le mouvement, les points
  // disent qu'il y a six mesures, pas une courbe continue.
  const cx = (i: number) => left(i) + bw / 2;
  const lastDx = cx(n - 1) - cx(n - 2), lastDy = y(pts[n - 1].cumul) - y(pts[n - 2].cumul);
  const angle = (Math.atan2(lastDy, lastDx) * 180) / Math.PI;
  const trace = STEP0 + (n - 1) * STEP + GROW + .15;
  const DRAWN = 1.1;
  const ligne = `
    <!-- viewBox = la boîte du graphique, en px : avec « 900 », les y de la ligne
         (calculés en px comme les barres) étaient réduits de 580/900 — la ligne
         flottait au-dessus des barres et son dernier point entrait dans le pavé
         « Sommet » (relevé par l'agent design, 17-09). -->
    <svg class="trace" viewBox="0 0 ${CHART_W} ${TRAJ_H}" preserveAspectRatio="none">
      <polyline points="${pts.map((p, i) => `${cx(i)},${y(p.cumul)}`).join(" ")}" pathLength="1" fill="none"
        stroke="${COLORS.ink}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"
        stroke-dasharray="1" stroke-dashoffset="1" style="animation:draw ${DRAWN}s ${trace}s linear forwards"/>
      ${pts.map((p, i) => `<circle cx="${cx(i)}" cy="${y(p.cumul)}" r="9" fill="${COLORS.ink}" style="transform-box:fill-box;transform-origin:center;animation:pop .3s ${trace + (i / (n - 1)) * DRAWN}s both"/>`).join("")}
      <g transform="translate(${cx(n - 1)},${y(pts[n - 1].cumul)}) rotate(${angle.toFixed(1)})"><path d="M0,0 L-34,-15 L-34,15 Z" fill="${COLORS.ink}" style="transform-box:fill-box;transform-origin:center;animation:pop .35s ${trace + DRAWN}s both"/></g>
    </svg>`;

  const end = STEP0 + (n - 1) * STEP + GROW + DRAWN + .5;
  return {
    data: {
      points: pts.map((p, i) => ({
        v: p.cumul,
        label: p.isAbsent ? "Hors des Unes" : p.level,
        when: `${celestial(hours[i], COLORS.soft, 36)}<span>${esc(p.timeLabel)}</span>`,
        bg: p.isAbsent ? COLORS.rule : bandOf(p.rank).bg,
        fg: p.isAbsent ? COLORS.ink : bandOf(p.rank).fg,
      })),
      step0: STEP0, step: STEP, grow: GROW,
    },
    scene: {
      id: "trajectoire", duration: end + 3,
      html: `
        <div class="zone-utile">
        <div class="head">
          ${LINKEDIN ? "" : `<div class="kick mono" ${anim("fadeIn", .5, .1)}>Saillance · 24 dernières heures</div>`}
          <div class="une" ${anim("fadeUp", .5, .2)}>${enjeuGlyph(top.issueKey, top.issueColor, 50)}<h3 class="disp" style="font-size:${tailleTitre(top.title)}px">${txt(top.title)}</h3></div>
          <div class="live" ${anim("fadeIn", .4, .6)}><div class="counter" id="t-counter">0,0</div><div class="unit mono">points</div></div>
        </div>
        <div class="bandeau">
          <div class="chip mono" id="t-chip" ${anim("fadeIn", .3, STEP0)}></div>
          <div class="when mono" id="t-when" ${anim("fadeIn", .3, STEP0)}></div>
        </div>
        <div class="chart" data-cle>${grid}${bars}${ligne}</div>
        <div class="cap disp" ${anim("fadeUp", .6, end + .3)}>${txt(trend.capLabel)}</div></div>`,
    },
  };
}

// Le centile en une phrase, puis sur une échelle de cent graduations : une
// graduation = 1 % des nouvelles de la dernière année, les plus saillantes en
// haut. Les graduations se remplissent jusqu'à la nouvelle, puis un trait la
// situe et deux annotations disent ce qu'il y a au-dessus et au-dessous.
const SCALE_TOP = LINKEDIN ? 820 : 742, SCALE_H = LINKEDIN ? 640 : 500, FILL0 = 0.9, FILL = 2.2;

function sceneCentile(top: UneEvent): Scene | null {
  if (top.saillanceCentile == null) return null;
  const c = Math.max(1, Math.min(99, Math.round(top.saillanceCentile)));
  const color = bandOf(Math.max(4, top.saillanceRank)).bg;
  const step = SCALE_H / 100;
  const markY = SCALE_TOP + SCALE_H * (1 - c / 100);
  // UNE PILE DE JOURNAUX, PAS UNE RÈGLE GRADUÉE (demande d'Adrien, 2026-09-16).
  // Cent nouvelles de l'année, cent feuilles empilées : chacune décalée, un peu
  // plus courte ou plus longue que sa voisine, légèrement de travers. Le désordre
  // est PSEUDO-ALÉATOIRE MAIS STABLE (fonction de l'indice) : la même édition
  // rejouée donne la même pile, sinon la vidéo tremblerait d'un rendu à l'autre.
  const gigue = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const ticks = Array.from({ length: 100 }, (_, i) => {
    const largeur = 84 + gigue(i) * 16;            // 84 → 100 % de la largeur
    const decale = (gigue(i + 91) - .5) * 26;      // ±13 px : les deux bords bougent
    const angle = (gigue(i + 37) - .5) * 1.2;      // ±0,6°
    const teinte = .82 + gigue(i + 5) * .18;       // toutes les feuilles ne sont pas du même papier
    return `<i data-i="${i}" style="top:${SCALE_H - (i + .5) * step}px;width:${largeur.toFixed(1)}%;margin-left:${decale.toFixed(1)}px;transform:rotate(${angle.toFixed(2)}deg);opacity:${teinte.toFixed(2)}"></i>`;
  }).join("");
  const done = FILL0 + FILL;
  // Au-dessus de la médiane, on dit ce que la nouvelle dépasse ; en dessous, ce
  // qui la dépasse (même bascule que hintFromCentile sur le site).
  const lead = c >= 50
    ? `<div class="lead" ${anim("fadeIn", .5, .2)}>Cette actualité est plus saillante que</div>
       <div class="big" ${anim("fadeUp", .6, .35)}><span id="c-num" data-n="${c}" style="color:${color}">0</span><small style="color:${color}">%</small></div>
       <div class="of" ${anim("fadeIn", .5, .6)}>des nouvelles de la dernière année</div>`
    : `<div class="big" ${anim("fadeUp", .6, .35)}><span id="c-num" data-n="${100 - c}">0</span><small>%</small></div>
       <div class="of" ${anim("fadeIn", .5, .6)}>des nouvelles de la dernière année ont été plus saillantes que celle-ci</div>`;
  return {
    id: "centile", duration: 6,
    html: `
      <div class="head">
        ${LINKEDIN ? "" : `<div class="kick mono" ${anim("fadeIn", .5, .1)}>Par rapport à la dernière année</div>`}
        ${lead}
      </div>
      <div class="tick mono" style="top:${SCALE_TOP - 44}px;animation:fadeIn .4s .6s both">Plus saillantes ↑</div>
      <div class="scale" id="c-scale" data-cle data-c="${c}" data-color="${color}" style="top:${SCALE_TOP}px;height:${SCALE_H}px;animation:fadeIn .4s .6s both">${ticks}</div>
      <div class="tick mono" style="top:${SCALE_TOP + SCALE_H + 16}px;animation:fadeIn .4s .6s both">↓ Moins saillantes</div>
      <div class="mark" style="top:${markY - 1}px;animation:grow .6s ${done}s both"></div>
      <div class="mlabel" style="top:${markY + 14}px;animation:fadeIn .4s ${done + .3}s both">Cette actualité</div>
      ${markY - SCALE_TOP >= 210
        ? `<div class="note" style="top:${markY - 200}px;animation:fadeUp .5s ${done + .5}s both"><b>${100 - c}&nbsp;%</b><span>des nouvelles de la dernière année ont été plus saillantes</span></div>`
        : ""}
      <div class="note" style="top:${(markY + SCALE_TOP + SCALE_H) / 2 - 40}px;animation:fadeUp .5s ${done + .8}s both"><b style="color:${color}">${c}&nbsp;%</b><span>ont été moins saillantes</span></div>
      <div class="src mono" ${anim("fadeIn", .5, done + 1)}>Nouvelles&nbsp;: les Unes des médias québécois suivis, sur une année de référence</div>`,
  };
}

function sceneCouverture(top: UneEvent): Scene | null {
  if (!top.mediaToday.length) return null;
  let lit = 0;
  const rows = MEDIA_PANEL_QC.map((id, i) => {
    const label = (MEDIA_LABELS[id] ?? id).replace(/^Le Journal/, "Journal");
    const on = top.mediaToday.some((m) => sameOutlet(m.name, label));
    const d = 0.8 + (on ? lit++ : i) * 0.25;
    return `<li class="${on ? "" : "off"}" style="animation:fadeUp .45s ${d}s both"><b>${esc(label)}</b><span class="mono">${on ? "✓ En Une" : "Pas en Une"}</span></li>`;
  }).join("");
  return {
    id: "couverture", duration: 5,
    html: `
      <div class="zone-utile">
      <div class="kick mono" ${anim("fadeIn", .5, .1)}>Couverture</div>
      <div class="grandir">
        <div class="big" data-cle ${anim("slam", .6, .2)}>${top.qcOutletCount}/${top.totalQcOutlets}</div>
        <div class="lab pf" ${anim("fadeIn", .5, .6)}>${coverageLabel(top.qcOutletCount)}</div>
      </div>
      <ul>${rows}</ul>
      ${top.saillantSince ? `<div class="since" ${anim("fadeUp", .6, 2.6)}>En Une depuis ${txt(top.saillantSince)}</div>` : ""}</div>`,
  };
}

// Le classement du moment sur le même axe : les cinq nouvelles les plus
// saillantes des 24 dernières heures et leur évolution d'une édition à
// l'autre. Le rang vient du classement PUR de l'indice (`classement` du
// loader), pas de la règle d'affichage du module — le module, lui, n'expose
// que les Unes qui valent au moins la moitié du meneur (#430, B6). Chaque
// nouvelle porte la couleur et le pictogramme de son enjeu, présentés dans la
// légende AVANT que les courbes ne se tracent ; deux nouvelles du même enjeu
// partagent la couleur, alors la seconde passe en tirets et la troisième en
// pointillé.
const DRAW = 3.2;
const drawStart = (n: number) => 0.9 + n * 0.32;
const DASHES = ["", ".022 .016", ".006 .014"];
/** Le même trait, côté légende (CSS) : plein, tirets, pointillé. */
const DASH_CSS = ["solid", "dashed", "dotted"];
const NOMBRES = ["", "une", "deux", "trois", "quatre", "cinq"];

function sceneClassement(classement: UneEvent[], edition: EditionRef): { scene: Scene; draw0: number } | null {
  // Toutes les courbes se lisent sur le MÊME axe : on écarte une nouvelle dont
  // la série n'a pas les mêmes blocs que le meneur plutôt que de la décaler.
  const lead = classement.find((e) => (e.salienceTrend?.points.length ?? 0) >= 2);
  if (!lead) return null;
  const ref = lead.salienceTrend!.points;
  const n = ref.length;
  const stories = classement.filter((e) => e.salienceTrend?.points.length === n);
  if (stories.length < 2) return null;

  const DRAW0 = drawStart(stories.length);
  const max = Math.max(1, ...stories.flatMap((e) => e.salienceTrend!.points.map((p) => p.cumul)));
  // Gouttière à droite : les valeurs se posent APRÈS le dernier point, jamais
  // par-dessus une courbe qui descend (la n°1 croisait son propre chiffre).
  const PAD = 52, GUT = 170, BASE = 470, H = 380, CHART_H = 560;
  const x = (i: number) => PAD + (i / (n - 1)) * (CHART_W - PAD - GUT);
  const y = (v: number) => BASE - (v / max) * H;
  // Même enjeu, même couleur : le trait change pour qu'on distingue les courbes.
  const seen = new Map<string | null, number>();
  const rangEnjeu = stories.map((e) => {
    const k = seen.get(e.issueKey) ?? 0;
    seen.set(e.issueKey, k + 1);
    return Math.min(k, DASHES.length - 1);
  });
  const dash = rangEnjeu.map((k) => DASHES[k]);
  const badge = (e: UneEvent, size: number) =>
    `<div class="badge" style="background:${e.issueColor}">${enjeuGlyph(e.issueKey, COLORS.paper, size)}</div>`;

  const lines = stories.map((e, k) => {
    const pts = e.salienceTrend!.points;
    return `<polyline class="c-line" points="${pts.map((p, i) => `${x(i)},${y(p.cumul)}`).join(" ")}" pathLength="1" fill="none" stroke="${e.issueColor}" stroke-width="${k === 0 ? 10 : 7}" stroke-dasharray="1" stroke-dashoffset="1" stroke-linejoin="round" stroke-linecap="round"${dash[k] ? ` data-dash="${dash[k]}"` : ""}/>`;
  }).join("");
  // Un point au bout de chaque courbe : c'est LUI que l'étiquette prolonge, et
  // il doit tomber exactement à la même hauteur qu'elle.
  const dots = stories.map((e) => {
    const pts = e.salienceTrend!.points;
    return `<circle cx="${x(n - 1)}" cy="${y(pts[pts.length - 1].cumul)}" r="11" fill="${e.issueColor}" style="transform-box:fill-box;transform-origin:center;animation:pop .3s ${DRAW0 + DRAW}s both"/>`;
  }).join("");

  // Pastille et valeur DANS L'AXE du point d'arrivée : l'étiquette est centrée
  // sur lui (LH = sa demi-hauteur). Deux nouvelles au même niveau se tassent :
  // on les écarte d'au moins GAP, puis on ramène la colonne dans le graphique —
  // l'ordre vertical reste celui des valeurs.
  const GAP = 66, LH = 27;
  const ends = stories.map((e, k) => {
    const pts = e.salienceTrend!.points;
    const last = pts[pts.length - 1].cumul;
    return { e, k, v: last, top: y(last) - LH };
  }).sort((a, b) => a.top - b.top);
  for (let i = 1; i < ends.length; i++) ends[i].top = Math.max(ends[i].top, ends[i - 1].top + GAP);
  const debord = ends.length ? ends[ends.length - 1].top + 62 - (CHART_H - 70) : 0;
  if (debord > 0) for (const l of ends) l.top -= debord;
  for (const l of ends) l.top = Math.max(0, l.top);
  // Les pastilles s'écartent pour ne pas se chevaucher : une pastille peut donc
  // se retrouver à la hauteur d'une AUTRE courbe (relevé par l'agent design,
  // 17-09). Un trait fin, à la couleur de la courbe, relie chaque point
  // d'arrivée à sa pastille.
  const liens = ends.map((l) =>
    `<line x1="${x(n - 1)}" y1="${y(l.v)}" x2="${x(n - 1) + 16}" y2="${l.top + LH}" stroke="${l.e.issueColor}" stroke-width="2.5" stroke-linecap="round" style="animation:fadeIn .3s ${DRAW0 + DRAW}s both"/>`).join("");
  const endLabels = ends.map((l) =>
    `<div class="end" style="left:${x(n - 1) + 16}px;top:${l.top}px;animation:pop .4s ${DRAW0 + DRAW}s both">${badge(l.e, 32)}<b style="color:${l.e.issueColor}">${frNum(l.v)}</b></div>`).join("");

  const colW = (CHART_W - PAD - GUT) / (n - 1);
  const axis = ref.map((p, i) => {
    const h = publicationHour(p.blockUtc) ?? 0;
    return `<div class="xl" style="left:${x(i) - colW / 2}px;width:${colW}px;animation:fadeIn .3s ${DRAW0 + (i / (n - 1)) * DRAW}s both"><div style="display:flex;justify-content:center">${celestial(h, i === n - 1 ? COLORS.blue : COLORS.soft, 42)}</div><b>${h}h</b></div>`;
  }).join("");

  // « N°3 » en mono : le signe numéro flotte en Playfair (GABARIT, typographie).
  const legend = stories.map((e, k) =>
    `<div class="item" ${anim("fadeUp", .5, .4 + k * .3)}>${badge(e, 38)}<div class="txt"><div class="k mono" style="color:${e.issueColor}"><i style="border-top:6px ${DASH_CSS[rangEnjeu[k]]} ${e.issueColor}"></i>N°${k + 1} · ${txt(e.issueFr)}</div><div class="t pf">${txt(e.title)}</div></div></div>`).join("");

  const title = stories.length === 2
    ? "La première nouvelle face à la deuxième"
    : `Les ${NOMBRES[stories.length] ?? stories.length} nouvelles les plus saillantes`;
  const scene: Scene = {
    id: "classement", duration: DRAW0 + DRAW + 3,
    html: `
      <div class="zone-utile">
      <div class="head">
          ${LINKEDIN ? "" : `<div class="kick mono" ${anim("fadeIn", .5, .1)}>24 dernières heures</div>`}
        <h3 class="disp" ${anim("fadeUp", .6, .2)}>${txt(title)}</h3>
      </div>
      <div class="leg${stories.length > 2 ? " trois" : ""}">${legend}</div>
      <div class="chart" data-cle>
        <svg viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none">
          <line x1="0" x2="${CHART_W}" y1="${BASE}" y2="${BASE}" stroke="${COLORS.ink}" stroke-width="3"/>
          ${lines}${liens}${dots}
        </svg>
        ${endLabels}${axis}
      </div>
      <div class="note mono" ${anim("fadeIn", .5, DRAW0)}>Saillance cumulée sur 24 heures, en points, à chacune des six éditions du jour</div></div>`,
  };
  return { scene, draw0: DRAW0 };
}

// Effets pilotés par le temps : compteurs, étiquette de niveau, tracés.
function script(traj: unknown, draw0: number): string {
  return `
const TRAJ=${JSON.stringify(traj)};
const ease=k=>1-Math.pow(1-k,3);
const clamp=k=>Math.max(0,Math.min(1,k));
const fr=v=>v.toFixed(1).replace(".",",");
window.onSceneTime=function(id,t,len){
  if(id==="une"){const img=document.getElementById("art");if(img)img.style.transform="scale("+(1.02+.1*Math.min(1,t/len))+")";}
  if(id==="trajectoire"&&TRAJ){
    const P=TRAJ.points;
    const i=Math.max(0,Math.min(P.length-1,Math.floor((t-TRAJ.step0)/TRAJ.step)));
    const k=ease(clamp((t-TRAJ.step0-i*TRAJ.step)/TRAJ.grow));
    const prev=i>0?P[i-1].v:0, v=t<TRAJ.step0?0:prev+(P[i].v-prev)*k;
    document.getElementById("t-counter").textContent=fr(v);
    const chip=document.getElementById("t-chip");chip.textContent=P[i].label;chip.style.background=P[i].bg;chip.style.color=P[i].fg;
    const when=document.getElementById("t-when");if(when.dataset.i!==String(i)){when.innerHTML=P[i].when;when.dataset.i=String(i);}
  }
  if(id==="centile"){
    const k=ease(clamp((t-${FILL0})/${FILL}));
    const num=document.getElementById("c-num");num.textContent=String(Math.round(+num.dataset.n*k));
    const sc=document.getElementById("c-scale"),lit=Math.round(+sc.dataset.c*k);
    sc.querySelectorAll("i").forEach(el=>{const on=+el.dataset.i<lit;el.className=on?"on":"";el.style.background=on?sc.dataset.color:""});
  }
  if(id==="classement"){
    const k=ease(clamp((t-${draw0})/${DRAW}));
    document.querySelectorAll("#classement .c-line").forEach(l=>{
      // Le trait plein sert à TRACER la courbe (dasharray 1 + offset) ; le motif
      // des enjeux répétés ne se pose qu'une fois le tracé terminé.
      if(l.dataset.dash&&k>=1){l.setAttribute("stroke-dasharray",l.dataset.dash);l.style.strokeDashoffset="0";}
      else l.style.strokeDashoffset=String(1-k);
    });
  }
};`;
}

// ── Le post quotidien ───────────────────────────────────────────────────────
// GABARIT DEMANDÉ PAR ADRIEN (2026-09-16) : le même texte à chaque édition, que
// le script remplit tout seul — titre, les cinq nouvelles avec leur saillance,
// le rappel de ce qu'est la Vitrine, les mots-clics, puis les comptes à
// identifier. Le premier commentaire sort dans un fichier à part : il porte les
// articles publiés sur la nouvelle n°1, avec leurs liens et leurs signatures.
//
// CE QUI SE MODIFIE À LA MAIN est ici, en haut : les émojis, la phrase de
// rappel, les mots-clics et la liste des comptes. Le reste vient des données.

/** « Saillance très élevée, 43,7 pts, −24 % / ce midi ». Le dernier point de la
 *  trajectoire EST l'édition du moment : c'est lui qui porte la variation. */
function mesure(e: UneEvent): string {
  const bouts = [`Saillance ${e.saillanceLabel.toLowerCase()}`];
  if (e.scoreQcSum24h != null) bouts.push(`${frNum(e.scoreQcSum24h)} pts`);
  const pts = e.salienceTrend?.points ?? [];
  const last = pts[pts.length - 1];
  if (last?.delta != null && last.deltaDepuis) {
    const signe = last.delta > 0 ? "+" : "−";
    bouts.push(`${signe}${Math.abs(Math.round(last.delta))} % / ${last.deltaDepuis}`);
  } else if (last?.isFirst) {
    bouts.push("nouveau");
  }
  return bouts.join(", ");
}

function matiere(edition: EditionRef, classement: UneEvent[]): Matiere {
  return {
    titre: `Les faits saillants au Québec en ce moment (Édition de ${pubHourLabel(edition)})`,
    items: classement.map((e, i) => `${i + 1}. ${e.title} (${mesure(e)})`),
    titresSeuls: classement.map((e) => e.title),
    lien: "vitrinedemocratique.com",
  };
}

/** Le premier commentaire : les articles publiés sur la nouvelle n°1, un par
 *  média, avec leur signature et leur lien. Les auteurs viennent des données
 *  (`author` de chaque article) ; à identifier à la main s'ils sont sur la
 *  plateforme — on ne devine pas un compte. */
function premierCommentaire(top: UneEvent): string {
  // `articlesUne` (loader) : un article par média, avec sa signature, tirés de
  // la même ligne que le lien. Repli sur les liens du module si la table des
  // articles est vide pour cette édition.
  const liste = top.articlesUne.length
    ? top.articlesUne.map((a) => [
      a.author ? `${a.media} — par ${a.author}` : a.media,
      a.title,
      a.url,
    ].filter(Boolean).join("\n"))
    : top.mediaToday.filter((m) => m.url).map((m) => `${m.name}\n${m.url}`);
  const signes = top.articlesUne.filter((a) => a.author).length;
  return [
    `Ce qui a été publié sur « ${top.title} » :`,
    "",
    liste.join("\n\n"),
    "",
    TRAIT,
    "",
    ...(signes
      ? ["Les signatures ci-dessus viennent des articles eux-mêmes. Identifier les journalistes qui sont sur la plateforme — ne jamais deviner un identifiant."]
      : []),
    "",
    `La courbe de cette nouvelle sur 24 heures, et la méthodologie : ${SITE_URL}`,
  ].join("\n") + "\n";
}

// ── Programme ───────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const editions = await listEditions();
  if (!editions.length) throw new Error("Aucune édition dans public/data/headline-events.json.");
  const current = editions[0];
  const edition = typeof args.edition === "string" ? editions.find((e) => e.key === args.edition) : current;
  if (!edition) throw new Error(`Édition « ${args.edition} » introuvable. Plus récentes : ${editions.slice(0, 6).map((e) => e.key).join(", ")}`);

  const ageH = (Date.now() - new Date(current.pubInstantIso).getTime()) / 3.6e6;
  if (edition === current && ageH > 5) {
    console.warn(`  ⚠️ La dernière édition du dépôt date de ${Math.round(ageH)} h. Faites « git pull » pour publier l'édition du moment.`);
  }

  // `classement` : les cinq nouvelles les plus saillantes de la fenêtre 24 h,
  // classement pur (la scène 6 les montre côte à côte). `top3` reste ce que le
  // module affiche, et c'est lui qui porte les scènes 1 à 5 et la légende.
  // 5 nouvelles pour le post (gabarit quotidien), 3 pour la scène du reel.
  const data = await loadHeadlineEvents(edition.key, { classement: 5 });
  const top3 = data?.top3 ?? [];
  const classement = data?.classement ?? top3;
  if (!top3.length) throw new Error(`Aucune Une pour l'édition ${edition.key}.`);
  const top = top3[0];
  console.log(`La Une des Unes · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);
  console.log(`  n°1 : ${top.title}`);

  const art = args["sans-illustration"] ? null : await resolveArt(edition, current, top);
  const logo = await loadLogo();
  const traj = sceneTrajectoire(top);
  const clsmt = sceneClassement(classement.slice(0, 3), edition);
  const scenes = [
    sceneIntro({
      logo, module: MODULE.nom, accent: MODULE.accent, lignes: MODULE.lignes,
      visuel: visuelAccroche(top),
      edition: `Édition de ${pubHourLabel(edition)} · ${edition.dateLabel}`,
    }),
    sceneUne(top, art), traj?.scene ?? null, sceneCentile(top),
    sceneCouverture(top), clsmt?.scene ?? null,
    sceneFin({ pubHour: edition.pubHour, signature: "Ce qui domine l’actualité du Québec", logo, accent: MODULE.accent, partenaires: await chargerPartenaires() }),
  ].filter((s): s is Scene => s !== null);

  const html = buildPage({
    title: `La Une des Unes · ${edition.key}`,
    css: CSS + INTRO_CSS + FIN_CSS, scenes, script: script(traj?.data ?? null, clsmt?.draw0 ?? drawStart(0)),
    theme: { paper: MODULE.papier, accent: MODULE.accent },
    logos: await loadLogos(),
    footerLeft: "La Vitrine démocratique",
    footerRight: `Édition de ${pubHourLabel(edition)} · ${edition.navDateIso.split("-").reverse().join(".")}`,
  });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, `une-des-unes_${edition.navDateIso}_${pubHourLabel(edition)}${LINKEDIN ? "_linkedin" : ""}`);
  await fs.mkdir(outDir, { recursive: true });
  // Un fichier par réseau, plus le premier commentaire (le même partout).
  const textes = formats(matiere(edition, classement));
  for (const [reseau, texte] of Object.entries(textes) as [Reseau, string][]) {
    await fs.writeFile(`${base}_${reseau}.txt`, texte);
    console.log(`  ${reseau.padEnd(9)} → ${path.basename(base)}_${reseau}.txt   (${RESPONSABLE[reseau]})`);
  }
  await fs.writeFile(`${base}_commentaire.txt`, premierCommentaire(top));
  console.log(`  1er com   → ${path.basename(base)}_commentaire.txt   (sous le post, partout)`);

  await produce({ html, scenes, title: `La Une des Unes · édition de ${pubHourLabel(edition)}`, base, args });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
