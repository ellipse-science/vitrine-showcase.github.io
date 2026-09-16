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

import {
  listEditions, loadHeadlineEvents,
  type EditionRef, type SolitudeAxis, type SolitudeData, type UneEvent,
} from "@/lib/data/headlineEvents";
import { COULEUR_ENJEU_DEFAUT, ISSUE_COLORS } from "@/lib/enjeux";
import { MEDIA_LABELS, MEDIA_PANEL_QC } from "@/lib/medias";
import { matchesCurrentUneArt } from "@/lib/shareUneArt";
import {
  COLORS, SALIENCE_COLORS, SITE_URL, buildPage, celestial, enjeuGlyph, esc, fleur, frNum, parseArgs, produce,
  publicationHour, txt, type Scene,
} from "./lib/reel";

/** Mots-clics ajoutés à la légende. À ajuster par l'équipe des réseaux. */
const HASHTAGS = ["#polqc", "#QC2026", "#VitrineDémocratique"];

/** Crédit de l'illustration de la Une. */
const ART_CREDIT = "Image générée sous la direction de Mathieu Fortin";

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
const coverageLabel = (n: number) => (n > 1 ? "des médias québécois en parlent" : "des médias québécois en parle");

/** « Le Journal de Montréal » (lib/medias.ts) et « Journal de Montréal »
 *  (mediaToday) désignent le même média. */
const sameOutlet = (a: string, b: string) => a.replace(/^Le /, "") === b.replace(/^Le /, "");

/** « 20h hier soir » → « hier soir » : l'heure est déjà portée par le pictogramme. */
const momentOf = (label: string) => label.replace(/^\d{1,2}h\s*/, "");

// ── Mise en page ────────────────────────────────────────────────────────────
// Repères : intérieur du cadre 30 → 1050 (x) et 30 → 1890 (y) ; marge de texte 76.
const CSS = `
.kick{font-size:30px;color:var(--softer)}

/* 1. Accroche */
#accroche .brand{position:absolute;top:220px;left:76px;right:76px;display:flex;align-items:center;gap:20px;font-size:28px;color:var(--soft)}
#accroche .brand i{display:block;width:120px;height:10px;background:var(--blue);transform-origin:left}
#accroche h1{position:absolute;top:320px;left:76px;right:60px;font-size:156px;line-height:.97}
#accroche h1 em{font-style:normal;color:var(--blue)}
#accroche .band{position:absolute;left:30px;right:30px;bottom:30px;height:730px;background:var(--ink);overflow:hidden}
#accroche .ghost{position:absolute;left:46px;right:46px;bottom:0;height:540px;display:flex;align-items:flex-end;gap:18px}
#accroche .ghost div{flex:1;transform-origin:bottom}
#accroche .ed{position:absolute;left:76px;right:76px;top:1210px;color:var(--paper);font-size:30px}

/* 2. Une n°1 */
#une .art{position:absolute;left:30px;top:30px;width:1020px;height:1060px;overflow:hidden}
#une .art img{width:100%;height:100%;object-fit:cover}
#une .art::after{content:"";position:absolute;inset:auto 0 0 0;height:200px;background:linear-gradient(transparent,var(--paper))}
#une .noart{position:absolute;left:30px;top:30px;width:1020px;height:1060px;display:flex;align-items:center;justify-content:center}
#une .rank{position:absolute;top:230px;left:76px;background:var(--ink);color:var(--paper);font-size:30px;padding:12px 20px}
#une .credit{position:absolute;top:1046px;right:76px;display:flex;align-items:center;gap:14px;font-style:italic;font-size:21px;color:var(--softer);opacity:.85}
#une .credit::before{content:"";width:48px;height:1px;background:var(--softer)}
#une .body{position:absolute;left:76px;right:76px;top:1100px}
#une .tag{display:inline-block;color:var(--paper);font-size:26px;padding:10px 18px}
#une h2{font-size:82px;line-height:1.02;margin-top:24px}
#une .stats{display:flex;gap:26px;margin-top:50px}
#une .stat{flex:1;border-top:6px solid var(--ink);padding-top:16px}
#une .stat b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:84px;line-height:1.05}
#une .stat span{font-size:28px;color:var(--soft)}

/* 3. Trajectoire */
#trajectoire .head{position:absolute;top:200px;left:76px;right:76px}
#trajectoire .une{display:flex;gap:18px;align-items:flex-start;margin-top:14px}
#trajectoire .une svg{flex:none;margin-top:6px}
#trajectoire .une h3{font-size:50px;line-height:1.08;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#trajectoire .live{display:flex;align-items:flex-end;gap:22px;margin-top:22px}
#trajectoire .counter{font-family:"Playfair Display",serif;font-weight:900;font-size:150px;line-height:.85;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
#trajectoire .unit{font-size:26px;color:var(--softer);padding-bottom:16px}
#trajectoire .chip{position:absolute;left:76px;top:590px;font-size:28px;padding:9px 16px}
#trajectoire .when{position:absolute;right:76px;top:582px;display:flex;align-items:center;gap:14px;font-size:24px;color:var(--soft)}
#trajectoire .chart{position:absolute;left:60px;right:60px;top:690px;height:900px}
#trajectoire .grid{position:absolute;left:0;right:0;height:2px;background:var(--rule);opacity:.6}
#trajectoire .bar{position:absolute;transform-origin:bottom}
#trajectoire .bar.absent{background:repeating-linear-gradient(135deg,var(--rule) 0 12px,transparent 12px 24px)!important;outline:3px dashed var(--softer);outline-offset:-3px}
#trajectoire .val{position:absolute;font-family:"Playfair Display",serif;font-weight:700;font-size:40px;text-align:center}
#trajectoire .peak{position:absolute;font-size:22px;background:var(--ink);color:var(--paper);padding:8px 0;text-align:center}
#trajectoire .xl{position:absolute;text-align:center;color:var(--soft)}
#trajectoire .xl b{display:block;font-family:"IBM Plex Mono",monospace;font-size:28px;margin-top:6px;color:var(--ink)}
#trajectoire .xl span{display:block;font-family:"IBM Plex Mono",monospace;font-size:18px;letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
#trajectoire .xl.now b{color:var(--blue)}
#trajectoire .cap{position:absolute;left:76px;right:76px;top:1630px;font-size:50px;line-height:1.15}

/* 4. Centile */
#centile .head{position:absolute;top:200px;left:76px;right:76px}
#centile .lead{font-style:italic;font-size:46px;color:var(--soft);margin-top:18px}
#centile .big{font-family:"Playfair Display",serif;font-weight:900;font-size:200px;line-height:.9;letter-spacing:-.04em;margin-top:6px}
#centile .big small{font-size:100px;letter-spacing:0;margin-left:10px}
#centile .of{font-family:"Playfair Display",serif;font-weight:700;font-size:52px;line-height:1.1;margin-top:8px}
#centile .scale{position:absolute;left:76px;width:250px}
#centile .scale i{position:absolute;left:0;right:0;height:1px;background:var(--rule)}
#centile .scale i.on{height:4px;margin-top:-1px}
#centile .tick{position:absolute;left:76px;width:250px;font-size:17px;letter-spacing:.12em;color:var(--softer)}
#centile .mark{position:absolute;left:76px;right:76px;height:3px;background:var(--ink);transform-origin:left}
#centile .mark::before{content:"";position:absolute;left:262px;top:-9px;width:21px;height:21px;border-radius:50%;background:var(--ink)}
#centile .mlabel{position:absolute;right:76px;font-family:"Playfair Display",serif;font-style:italic;font-weight:400;font-size:40px}
#centile .note{position:absolute;left:380px;right:76px}
#centile .note b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:72px;line-height:1}
#centile .note span{display:block;font-size:32px;line-height:1.25;margin-top:6px;color:var(--soft)}
#centile .src{position:absolute;left:76px;right:76px;top:1745px;font-size:15px;white-space:nowrap;letter-spacing:.1em;color:var(--softer)}

/* 5. Couverture */
#couverture .head{position:absolute;top:210px;left:76px;right:76px}
#couverture .big{font-family:"Playfair Display",serif;font-weight:900;font-size:280px;line-height:.9;color:var(--blue)}
#couverture .lab{font-size:50px;margin-top:10px}
#couverture ul{position:absolute;left:76px;right:76px;top:660px;list-style:none;border-top:3px solid var(--ink)}
#couverture li{height:148px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--rule)}
#couverture li b{font-family:"Playfair Display",serif;font-weight:700;font-size:62px}
#couverture li span{font-size:26px;color:var(--blue)}
#couverture li.off b{color:var(--rule)}
#couverture li.off span{color:var(--rule)}
#couverture .since{position:absolute;left:76px;right:76px;top:1620px;font-size:42px;font-style:italic;color:var(--soft)}

/* 6. Classement */
#classement .head{position:absolute;top:186px;left:76px;right:76px}
#classement h3{font-size:72px;line-height:1.02;margin-top:14px}
#classement .leg{position:absolute;left:76px;right:76px;top:392px}
#classement .item{display:flex;gap:20px;align-items:flex-start;padding:13px 0;border-top:2px solid var(--rule)}
#classement .badge{flex:none;width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--paper)}
#classement .item .txt{min-width:0}
#classement .item .k{font-size:19px;letter-spacing:.12em;display:flex;align-items:center;gap:12px}
#classement .item .k i{flex:none;display:block;width:46px;height:6px}
#classement .item .t{font-size:28px;line-height:1.1;margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#classement .chart{position:absolute;left:60px;right:60px;top:950px;height:640px}
#classement .chart > svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
#classement .end{position:absolute;display:flex;align-items:center;gap:12px;white-space:nowrap}
#classement .end .badge{width:54px;height:54px}
#classement .end b{font-family:"Playfair Display",serif;font-weight:900;font-size:42px}
#classement .xl{position:absolute;top:600px;text-align:center;color:var(--soft)}
#classement .xl b{display:block;font-family:"IBM Plex Mono",monospace;font-size:24px;margin-top:4px;color:var(--ink)}
#classement .note{position:absolute;left:76px;right:76px;top:1720px;font-size:20px;color:var(--softer)}

/* 6b. Pendant ce temps, au Canada — le radar */
#radar .head{position:absolute;top:150px;left:76px;right:76px}
#radar h3{font-size:74px;line-height:1;margin-top:12px}
#radar .chart{position:absolute;left:60px;right:60px;top:380px;height:960px}
#radar .chart > svg{position:absolute;left:0;top:0;width:100%;height:100%}
#radar .keys{position:absolute;left:76px;right:76px;top:1398px;display:flex;gap:56px;font-size:30px}
#radar .keys div{display:flex;align-items:center;gap:14px}
#radar .keys i{display:block;width:44px;height:8px}
#radar .vx{position:absolute;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--paper)}
#radar .conv{position:absolute;left:76px;right:76px;top:1470px;border-top:3px solid var(--ink);padding-top:20px;display:flex;align-items:center;gap:24px}
#radar .conv b{font-family:"Playfair Display",serif;font-weight:900;font-size:100px;line-height:.86}
#radar .conv span{font-size:30px;font-style:italic;color:var(--soft);line-height:1.25}
#radar .conv u{text-decoration:none;font-style:normal;font-family:"IBM Plex Mono",monospace;font-size:24px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink)}
#radar .edito{position:absolute;left:76px;right:76px;top:1636px;font-size:34px;line-height:1.2;font-style:italic;color:var(--soft)}
#radar .note{position:absolute;left:76px;right:76px;top:1342px;font-size:20px;color:var(--softer)}
@keyframes vanish{to{opacity:0}}
@keyframes sweep{from{transform:rotate(0deg)}to{transform:rotate(720deg)}}
@keyframes bloom{from{transform:scale(.04);opacity:0}to{transform:scale(1);opacity:1}}

/* 6c. Ce que le Québec en a retenu */
#echo .head{position:absolute;top:170px;left:76px;right:76px}
#echo h3{font-size:70px;line-height:1.02;margin-top:12px}
/* La liste occupe toute la hauteur utile : deux nouvelles ou quatre, pas de
   grand vide en bas (GABARIT, « remplir l'espace du cadre »). */
#echo .list{position:absolute;left:76px;right:76px;top:410px;height:1230px;display:flex;flex-direction:column;justify-content:space-around}
#echo .row{padding:18px 0;border-top:2px solid var(--rule)}
#echo .top{display:flex;gap:18px;align-items:flex-start}
#echo .badge{flex:none;width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--paper)}
#echo .top .txt{min-width:0}
#echo .top .k{font-size:18px;letter-spacing:.12em}
#echo .top .t{font-size:30px;line-height:1.1;margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#echo .bars{margin:14px 0 0 76px;display:flex;flex-direction:column;gap:9px}
#echo .bar{display:flex;align-items:center;gap:14px;font-size:22px}
#echo .bar em{font-style:normal;width:112px;flex:none;color:var(--soft)}
#echo .bar i{display:block;height:20px;transform-origin:left}
#echo .bar b{font-family:"IBM Plex Mono",monospace;font-size:26px}
#echo .chip{display:inline-block;font-size:20px;padding:7px 14px;margin-left:16px;vertical-align:middle}
#echo .note{position:absolute;left:76px;right:76px;top:1700px;font-size:20px;color:var(--softer)}

/* 7. Fin */
#fin{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:330px}
#fin .kick{margin-top:50px;color:var(--soft)}
#fin .url{font-size:84px;margin-top:30px;border-bottom:8px solid var(--blue);padding-bottom:10px}
#fin .band{position:absolute;left:30px;right:30px;bottom:30px;height:600px;background:var(--blue);transform-origin:bottom}
#fin .foot{position:absolute;left:30px;right:30px;top:1370px;display:flex;flex-direction:column;align-items:center}
#fin .six{font-size:52px;font-style:italic;margin-bottom:46px;color:var(--paper)}
#fin .hours{display:flex;gap:12px}
#fin .hours div{width:144px;padding:18px 0 16px;border:3px solid rgba(243,236,221,.5);font-size:32px;color:var(--paper);display:flex;flex-direction:column;align-items:center;gap:10px}
#fin .hours div.on{background:var(--paper);border-color:var(--paper);color:var(--blue)}
`;

const anim = (name: string, dur: number, delay: number) => `style="animation:${name} ${dur}s ${delay}s both"`;
const pubHourLabel = (edition: EditionRef) => `${edition.pubHour % 24}h`;
const bandOf = (rank: number) => SALIENCE_COLORS[rank] ?? { bg: COLORS.rule, fg: COLORS.ink };

/** Largeur des graphiques : intérieur du cadre moins 30 px de chaque côté. */
const CHART_W = 960;

function sceneAccroche(edition: EditionRef, top: UneEvent): Scene {
  const pts = top.salienceTrend?.points ?? [];
  const max = Math.max(1, ...pts.map((p) => p.cumul));
  const ghost = pts.map((p, i) =>
    `<div style="height:${Math.max(2, (p.cumul / max) * 100)}%;background:${p.rank > 0 ? bandOf(p.rank).bg : COLORS.soft};animation:growY .7s ${1.2 + i * 0.15}s both"></div>`).join("");
  return {
    id: "accroche", duration: 3.6, noFadeIn: true, hideFooter: true,
    html: `
      <div class="brand mono" ${anim("fadeIn", .5, .1)}><i ${anim("grow", .6, .1)}></i>La Une des Unes</div>
      <h1 class="disp" ${anim("fadeUp", .8, .3)}>Ce qui domine l’actualité du <em>Québec</em> en ce moment</h1>
      <div class="band" ${anim("fadeIn", .4, .9)}><div class="ghost">${ghost}</div></div>
      <div class="ed mono" ${anim("fadeIn", .5, 1.6)}>Édition de ${pubHourLabel(edition)} · ${esc(edition.dateLabel)}</div>`,
  };
}

function sceneUne(top: UneEvent, art: string | null): Scene {
  const visual = art
    ? `<div class="art" ${anim("fadeIn", .6, .1)}><img id="art" src="${art}"></div>
       <div class="credit" ${anim("fadeIn", .8, 1.4)}>${txt(ART_CREDIT)}</div>`
    : `<div class="noart" style="background:${top.issueColor};animation:fadeIn .6s .1s both">${fleur(COLORS.paper, 320)}</div>`;
  // Les bandes 1 à 3 sont trop pâles pour un texte sur papier : encre.
  const salColor = top.saillanceRank >= 4 ? bandOf(top.saillanceRank).bg : COLORS.ink;
  return {
    id: "une", duration: 4.6,
    html: `
      ${visual}
      <div class="rank mono" ${anim("pop", .5, .6)}>Une n°1</div>
      <div class="body">
        <div class="tag mono" style="background:${top.issueColor};animation:wipe .6s .7s both">${txt(top.issueFr)}</div>
        <h2 class="disp" ${anim("fadeUp", .8, .9)}>${txt(top.title)}</h2>
        <div class="stats">
          <div class="stat" ${anim("fadeUp", .5, 1.8)}><b style="color:${salColor}">${txt(top.saillanceLabel)}</b><span class="pf">Saillance sur 24 heures</span></div>
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

function sceneTrajectoire(top: UneEvent): { scene: Scene; data: unknown } | null {
  const trend = top.salienceTrend;
  if (!trend || trend.points.length < 2) return null;
  const pts = trend.points;
  const max = Math.max(...pts.map((p) => p.cumul), 1);
  const BASE = 720, H = 580; // ligne de base et hauteur utile (repère .chart)
  const n = pts.length, gap = 24, bw = (CHART_W - gap * (n - 1)) / n;
  const left = (i: number) => i * (bw + gap);
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
      ${p.isPeak ? `<div class="peak mono" style="left:${left(i)}px;width:${bw}px;top:${y(p.cumul) - 58}px;animation:pop .5s ${d + GROW + .1}s both">Sommet</div>` : ""}
      <div class="xl${p.isNow ? " now" : ""}" style="left:${left(i)}px;width:${bw}px;top:${BASE + 16}px;animation:fadeIn .3s ${d}s both">
        <div style="display:flex;justify-content:center">${celestial(hours[i], p.isNow ? COLORS.blue : COLORS.soft, 52)}</div><b>${hours[i]}h</b><span>${esc(momentOf(p.timeLabel))}</span>
      </div>`;
  }).join("");

  const end = STEP0 + (n - 1) * STEP + GROW;
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
        <div class="head">
          <div class="kick mono" ${anim("fadeIn", .5, .1)}>Saillance · 24 dernières heures</div>
          <div class="une" ${anim("fadeUp", .5, .2)}>${enjeuGlyph(top.issueKey, top.issueColor, 50)}<h3 class="disp">${txt(top.title)}</h3></div>
          <div class="live" ${anim("fadeIn", .4, .6)}><div class="counter" id="t-counter">0,0</div><div class="unit mono">points</div></div>
        </div>
        <div class="chip mono" id="t-chip" ${anim("fadeIn", .3, STEP0)}></div>
        <div class="when mono" id="t-when" ${anim("fadeIn", .3, STEP0)}></div>
        <div class="chart">${grid}${bars}</div>
        <div class="cap disp" ${anim("fadeUp", .6, end + .3)}>${txt(trend.capLabel)}</div>`,
    },
  };
}

// Le centile en une phrase, puis sur une échelle de cent graduations : une
// graduation = 1 % des nouvelles de la dernière année, les plus saillantes en
// haut. Les graduations se remplissent jusqu'à la nouvelle, puis un trait la
// situe et deux annotations disent ce qu'il y a au-dessus et au-dessous.
const SCALE_TOP = 840, SCALE_H = 840, FILL0 = 0.9, FILL = 2.2;

function sceneCentile(top: UneEvent): Scene | null {
  if (top.saillanceCentile == null) return null;
  const c = Math.max(1, Math.min(99, Math.round(top.saillanceCentile)));
  const color = bandOf(Math.max(4, top.saillanceRank)).bg;
  const step = SCALE_H / 100;
  const markY = SCALE_TOP + SCALE_H * (1 - c / 100);
  const ticks = Array.from({ length: 100 }, (_, i) =>
    `<i data-i="${i}" style="top:${SCALE_H - (i + .5) * step}px;${i % 10 === 9 ? "right:-18px;" : ""}"></i>`).join("");
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
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Par rapport à la dernière année</div>
        ${lead}
      </div>
      <div class="tick mono" style="top:${SCALE_TOP - 44}px;animation:fadeIn .4s .6s both">Plus saillantes ↑</div>
      <div class="scale" id="c-scale" data-c="${c}" data-color="${color}" style="top:${SCALE_TOP}px;height:${SCALE_H}px;animation:fadeIn .4s .6s both">${ticks}</div>
      <div class="tick mono" style="top:${SCALE_TOP + SCALE_H + 16}px;animation:fadeIn .4s .6s both">↓ Moins saillantes</div>
      <div class="mark" style="top:${markY - 1}px;animation:grow .6s ${done}s both"></div>
      <div class="mlabel" style="top:${markY + 14}px;animation:fadeIn .4s ${done + .3}s both">Cette actualité</div>
      <div class="note" style="top:${markY - 200}px;animation:fadeUp .5s ${done + .5}s both"><b>${100 - c}&nbsp;%</b><span>des nouvelles de la dernière année ont été plus saillantes</span></div>
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
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Couverture</div>
        <div class="big" ${anim("slam", .6, .2)}>${top.qcOutletCount}/${top.totalQcOutlets}</div>
        <div class="lab pf" ${anim("fadeIn", .5, .6)}>${coverageLabel(top.qcOutletCount)}</div>
      </div>
      <ul>${rows}</ul>
      ${top.saillantSince ? `<div class="since" ${anim("fadeUp", .6, 2.6)}>En Une depuis ${txt(top.saillantSince)}</div>` : ""}`,
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
  const PAD = 76, GUT = 196, BASE = 580, H = 520, CHART_H = 640;
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

  // Pastille et valeur au bout de chaque courbe, à gauche du point d'arrivée.
  // Les fins se tassent (trois nouvelles à 6 points arrivent au même endroit) :
  // on les écarte d'au moins GAP, puis on ramène toute la colonne dans le
  // graphique — l'ordre vertical reste celui des valeurs.
  const GAP = 66;
  const ends = stories.map((e, k) => {
    const pts = e.salienceTrend!.points;
    const last = pts[pts.length - 1].cumul, prev = pts[pts.length - 2].cumul;
    return { e, k, v: last, top: y(last) + (prev > last ? 8 : -62) };
  }).sort((a, b) => a.top - b.top);
  for (let i = 1; i < ends.length; i++) ends[i].top = Math.max(ends[i].top, ends[i - 1].top + GAP);
  const debord = ends.length ? ends[ends.length - 1].top + 62 - (CHART_H - 70) : 0;
  if (debord > 0) for (const l of ends) l.top -= debord;
  for (const l of ends) l.top = Math.max(0, l.top);
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
    ? "La première Une face à la deuxième"
    : `Les ${NOMBRES[stories.length] ?? stories.length} nouvelles les plus saillantes`;
  const scene: Scene = {
    id: "classement", duration: DRAW0 + DRAW + 3,
    html: `
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Édition de ${pubHourLabel(edition)} · 24 dernières heures</div>
        <h3 class="disp" ${anim("fadeUp", .6, .2)}>${txt(title)}</h3>
      </div>
      <div class="leg">${legend}</div>
      <div class="chart">
        <svg viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none">
          <line x1="0" x2="${CHART_W}" y1="${BASE}" y2="${BASE}" stroke="${COLORS.ink}" stroke-width="3"/>
          ${lines}
        </svg>
        ${endLabels}${axis}
      </div>
      <div class="note mono" ${anim("fadeIn", .5, DRAW0)}>Saillance cumulée sur 24 heures, en points, à chacune des six éditions du jour</div>`,
  };
  return { scene, draw0: DRAW0 };
}

// ── Pendant ce temps, au Canada ─────────────────────────────────────────────
// Le module 2 (Deux solitudes) en deux scènes : le radar qui tourne, puis ce
// que le Québec a retenu des nouvelles du Canada anglais. Tout vient de
// `solitudes` : mêmes axes, mêmes parts d'attention, mêmes niveaux de
// saillance que la page — y compris le chiffre de CONVERGENCE, le seul que le
// module énonce publiquement (la divergence n'a pas de libellé public).
const RANK_BY_CLS: Record<string, number> = {
  "s-tres-faible": 1, "s-faible": 2, "s-moyenne": 3,
  "s-eleve": 4, "s-tres-eleve": 5, "s-extreme": 6,
};
const SPIN = 2.2;

function sceneRadar(sol: SolitudeData): Scene | null {
  const axes = sol.axes;
  if (axes.length < 3) return null;
  const CX = 480, CY = 470, R = 330, n = axes.length;
  const at = (i: number, f: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [CX + R * f * Math.cos(a), CY + R * f * Math.sin(a)] as const;
  };
  const poly = (f: number) => axes.map((_, i) => at(i, f).join(",")).join(" ");
  const shape = (pick: (a: SolitudeAxis) => number) =>
    axes.map((a, i) => at(i, Math.min(100, pick(a)) / 100).join(",")).join(" ");
  // Deux anneaux seulement : quatre hexagones emboîtés se lisent comme un cube.
  const rings = [.5, 1].map((f) =>
    `<polygon points="${poly(f)}" fill="none" stroke="${COLORS.rule}" stroke-width="${f === 1 ? 3 : 2}" ${f === 1 ? "" : 'stroke-dasharray="8 10"'}/>`).join("");
  const spokes = axes.map((_, i) => {
    const [px, py] = at(i, 1);
    return `<line x1="${CX}" y1="${CY}" x2="${px}" y2="${py}" stroke="${COLORS.rule}" stroke-width="1.5" opacity=".7"/>`;
  }).join("");
  // Au bout de chaque axe, le pictogramme de l'enjeu, dans la couleur du camp
  // qui mène cet axe : on voit d'un coup quels sujets sont tirés par le Canada.
  // Pastilles en HTML par-dessus le graphique — le pictogramme du site est un
  // <svg> complet, qui ne se rend pas imbriqué dans un autre <svg>.
  const vertices = axes.map((a, i) => {
    const [px, py] = at(i, 1.14);
    const col = a.side === "qc" ? COLORS.blue : COLORS.red;
    return `<div class="vx" style="left:${px - 36}px;top:${py - 36}px;background:${col};animation:pop .4s ${SPIN + .3 + i * .1}s both">${enjeuGlyph(a.issueKey, COLORS.paper, 40)}</div>`;
  }).join("");
  // Balayage : un secteur qui tourne, comme un vrai radar.
  const wedge = (() => {
    const a0 = -Math.PI / 2, a1 = a0 + Math.PI / 7;
    const p = (a: number) => `${CX + R * 1.02 * Math.cos(a)},${CY + R * 1.02 * Math.sin(a)}`;
    return `<path d="M${CX},${CY} L${p(a0)} A${R * 1.02},${R * 1.02} 0 0 1 ${p(a1)} Z" fill="${COLORS.blue}" opacity=".13"/>`;
  })();
  const layer = (pts: string, col: string, fill: string, delay: number) =>
    `<g style="transform-box:view-box;transform-origin:${CX}px ${CY}px;animation:bloom .7s ${delay}s both"><polygon points="${pts}" fill="${fill}" stroke="${col}" stroke-width="6" stroke-linejoin="round"/></g>`;
  return {
    id: "radar", duration: SPIN + 4.6,
    html: `
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Deux solitudes · 24 dernières heures</div>
        <h3 class="disp" ${anim("fadeUp", .6, .2)}>Pendant ce temps, au&nbsp;Canada…</h3>
      </div>
      <div class="chart">
        <svg viewBox="0 0 960 960">
          <g ${anim("fadeIn", .5, .5)}>${rings}${spokes}</g>
          <g style="transform-box:view-box;transform-origin:${CX}px ${CY}px;animation:sweep ${SPIN}s .4s linear both,vanish .4s ${SPIN + .4}s both">
            ${wedge}
            <line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R * 1.02}" stroke="${COLORS.blue}" stroke-width="4" opacity=".8"/>
          </g>
          ${layer(shape((a) => a.canRadial), COLORS.red, "rgba(168,48,44,.17)", SPIN + .2)}
          ${layer(shape((a) => a.qcRadial), COLORS.blue, "rgba(34,79,125,.20)", SPIN + .6)}
        </svg>
        ${vertices}
      </div>
      <div class="note mono" ${anim("fadeIn", .5, SPIN + .8)}>Part de l’attention de chaque région, sur les six sujets les plus couverts de part et d’autre</div>
      <div class="keys">
        <div ${anim("fadeIn", .4, SPIN + .9)}><i style="background:${COLORS.red}"></i>🍁 Canada anglais</div>
        <div ${anim("fadeIn", .4, SPIN + 1.1)}><i style="background:${COLORS.blue}"></i>${fleur(COLORS.blue, 26)} Québec</div>
      </div>
      <div class="conv" ${anim("fadeUp", .6, SPIN + 1.4)}>
        <b style="color:${COLORS.blue}">${sol.convPct}&nbsp;%</b>
        <span>de convergence<br><u>${txt(sol.modeWord)}</u></span>
      </div>
      <div class="edito pf" ${anim("fadeUp", .6, SPIN + 1.9)}>${txt(sol.edito)}</div>`,
  };
}

function sceneEcho(sol: SolitudeData): Scene | null {
  // Les nouvelles du Canada anglais, les plus couvertes là-bas d'abord ; en
  // face, la part d'attention que le Québec leur a donnée. L'écart entre les
  // deux barres EST la divergence, montrée plutôt qu'énoncée.
  const rows = [...sol.axes].filter((a) => a.canShare > 0).sort((a, b) => b.canShare - a.canShare).slice(0, 4);
  if (rows.length < 2) return null;
  const maxShare = Math.max(...rows.flatMap((a) => [a.canShare, a.qcShare]), 1);
  const w = (v: number) => Math.max(v > 0 ? 8 : 0, (v / maxShare) * 560);
  // Les axes du radar portent la clé d'enjeu, pas sa couleur (le site la tire
  // de la même table) : on la prend à la source, jamais une seconde palette.
  const couleur = (a: SolitudeAxis) => (a.issueKey ? ISSUE_COLORS[a.issueKey] ?? COULEUR_ENJEU_DEFAUT : COULEUR_ENJEU_DEFAUT);
  const items = rows.map((a, k) => {
    const d = .5 + k * .55;
    const rank = a.salienceCls ? RANK_BY_CLS[a.salienceCls] : undefined;
    const band = rank ? bandOf(rank) : null;
    const chip = a.salienceLabel && band
      ? `<span class="chip mono" style="background:${band.bg};color:${band.fg}">${txt(a.salienceLabel)}</span>` : "";
    const bar = (lab: string, v: number, col: string, delay: number) =>
      `<div class="bar"><em class="mono">${lab}</em><i style="width:${w(v)}px;background:${col};animation:grow .5s ${delay}s both"></i><b style="color:${col}">${v}&nbsp;%</b></div>`;
    return `<div class="row" ${anim("fadeUp", .5, d)}>
      <div class="top"><div class="badge" style="background:${couleur(a)}">${enjeuGlyph(a.issueKey, COLORS.paper, 34)}</div>
      <div class="txt"><div class="k mono" style="color:${couleur(a)}">${txt(a.eyebrow ?? "Actualité")}${chip}</div>
      <div class="t pf">${txt(a.label)}</div></div></div>
      <div class="bars">${bar("Canada", a.canShare, COLORS.red, d + .25)}${bar("Québec", a.qcShare, COLORS.blue, d + .4)}</div>
    </div>`;
  }).join("");
  return {
    id: "echo", duration: 1.5 + rows.length * 1.5,
    html: `
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Ce que le Québec en a retenu</div>
        <h3 class="disp" ${anim("fadeUp", .6, .2)}>Les nouvelles du Canada anglais, vues d’ici</h3>
      </div>
      <div class="list">${items}</div>
      <div class="note mono" ${anim("fadeIn", .5, 1)}>Part de l’attention des Unes de chaque région, sur 24 heures</div>`,
  };
}

function sceneFin(edition: EditionRef): Scene {
  const now = edition.pubHour % 24;
  const hours = [0, 4, 8, 12, 16, 20].map((h, i) =>
    `<div class="mono${h === now ? " on" : ""}" style="animation:pop .4s ${1.2 + i * .12}s both">${celestial(h, "currentColor", 40)}${h}h</div>`).join("");
  return {
    id: "fin", duration: 4, noFadeOut: true, hideFooter: true,
    html: `
      <div style="animation:pop .7s .1s both">${fleur(COLORS.blue, 260)}</div>
      <div class="kick mono" ${anim("fadeIn", .5, .4)}>Ce qui domine l’actualité du Québec</div>
      <div class="url disp" ${anim("fadeUp", .7, .6)}>vitrinedemocratique.com</div>
      <div class="band" ${anim("growY", .8, .2)}></div>
      <div class="foot"><div class="six" ${anim("fadeIn", .6, 1)}>Six éditions par jour</div><div class="hours">${hours}</div></div>`,
  };
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

// ── Légende Instagram ───────────────────────────────────────────────────────
function caption(edition: EditionRef, classement: UneEvent[], sol: SolitudeData | null): string {
  const [top, ...others] = classement;
  const lines = [
    `Ce qui domine l’actualité du Québec en ce moment · Édition de ${pubHourLabel(edition)}, ${edition.dateLabel.toLowerCase()}`,
    "",
    top.title,
    ...(top.excerpt ? ["", top.excerpt] : []),
    "",
    `${top.qcOutletCount}/${top.totalQcOutlets} ${coverageLabel(top.qcOutletCount)} : ${top.mediaToday.map((m) => m.name).join(", ")}.`,
    `Saillance des 24 dernières heures : ${top.saillanceLabel.toLowerCase()}.`,
    ...(others.length ? ["", "Les autres nouvelles les plus saillantes :", ...others.map((e, i) => `${i + 2}. ${e.title}`)] : []),
    // Le même segment que les deux dernières scènes : ce que le Canada anglais a
    // mis en Une, et le chiffre de convergence du module Deux solitudes.
    ...(sol ? ["", `Pendant ce temps, au Canada : ${sol.axes.filter((a) => a.side === "can").map((a) => a.label).slice(0, 1).join("")} (${sol.axes.filter((a) => a.side === "can").map((a) => `${a.canShare} % de l’attention canadienne, ${a.qcShare} % de l’attention québécoise`).slice(0, 1).join("")}).`, `Convergence des deux agendas : ${sol.convPct} % — ${sol.modeWord.toLowerCase()}.`] : []),
    "",
    "L’actualité saillante au Québec, six fois par jour : vitrinedemocratique.com",
    "",
    HASHTAGS.join(" "),
  ];
  // Mêmes règles OQLF que la vidéo, en texte brut (U+00A0).
  return lines.join("\n").replace(/[ \t]*:(?=\s|$)/gm, " :").replace(/[ \t]*%/g, " %") + "\n";
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
  const data = await loadHeadlineEvents(edition.key, { classement: 5 });
  const top3 = data?.top3 ?? [];
  const classement = data?.classement ?? top3;
  if (!top3.length) throw new Error(`Aucune Une pour l'édition ${edition.key}.`);
  const top = top3[0];
  console.log(`La Une des Unes · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);
  console.log(`  n°1 : ${top.title}`);

  const art = args["sans-illustration"] ? null : await resolveArt(edition, current, top);
  const traj = sceneTrajectoire(top);
  const clsmt = sceneClassement(classement, edition);
  const scenes = [
    sceneAccroche(edition, top), sceneUne(top, art), traj?.scene ?? null, sceneCentile(top),
    sceneCouverture(top), clsmt?.scene ?? null,
    data?.solitudes ? sceneRadar(data.solitudes) : null,
    data?.solitudes ? sceneEcho(data.solitudes) : null,
    sceneFin(edition),
  ].filter((s): s is Scene => s !== null);

  const html = buildPage({
    title: `La Une des Unes · ${edition.key}`,
    css: CSS, scenes, script: script(traj?.data ?? null, clsmt?.draw0 ?? drawStart(0)),
    footerLeft: "⚜ La Vitrine démocratique",
    footerRight: `Édition de ${pubHourLabel(edition)} · ${edition.navDateIso.split("-").reverse().join(".")}`,
  });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, `une-des-unes_${edition.navDateIso}_${pubHourLabel(edition)}`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${base}.txt`, caption(edition, classement, data?.solitudes ?? null));
  console.log(`  légende → ${base}.txt`);

  await produce({ html, scenes, title: `La Une des Unes · édition de ${pubHourLabel(edition)}`, base, args });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
