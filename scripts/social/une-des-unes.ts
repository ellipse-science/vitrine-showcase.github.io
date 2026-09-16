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

/* 6. Course */
#course .head{position:absolute;top:200px;left:76px;right:76px}
#course h3{font-size:76px;line-height:1.02;margin-top:14px}
#course .leg{position:absolute;left:76px;right:76px;top:450px}
#course .item{display:flex;gap:24px;align-items:center;padding:18px 0;border-top:2px solid var(--rule)}
#course .badge{flex:none;width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--paper)}
#course .item .k{font-size:20px;letter-spacing:.14em}
#course .item .t{font-size:34px;line-height:1.12;margin-top:4px}
#course .chart{position:absolute;left:60px;right:60px;top:830px;height:740px}
#course .chart > svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
#course .end{position:absolute;display:flex;align-items:center;gap:12px;white-space:nowrap}
#course .end .badge{width:62px;height:62px}
#course .end b{font-family:"Playfair Display",serif;font-weight:900;font-size:46px}
#course .xl{position:absolute;top:700px;text-align:center;color:var(--soft)}
#course .xl b{display:block;font-family:"IBM Plex Mono",monospace;font-size:24px;margin-top:4px;color:var(--ink)}
#course .note{position:absolute;left:76px;right:76px;top:1720px;font-size:20px;color:var(--softer)}

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

// Les Unes du moment sur le même axe. Chaque Une porte la couleur et le
// pictogramme de son enjeu, comme partout sur le site : la légende les
// présente avant que les courbes ne se tracent, et le pictogramme est répété
// au bout de chaque courbe. Deux Unes du même enjeu : la seconde en pointillé.
const DRAW0 = 1.8, DRAW = 3.2;

function sceneCourse(top3: UneEvent[], edition: EditionRef): Scene | null {
  const stories = top3.filter((e) => e.salienceTrend && e.salienceTrend.points.length >= 2);
  if (stories.length < 2) return null;
  const ref = stories[0].salienceTrend!.points;
  const n = ref.length;
  const max = Math.max(1, ...stories.flatMap((e) => e.salienceTrend!.points.map((p) => p.cumul)));
  const PAD = 70, BASE = 680, H = 560;
  const x = (i: number) => PAD + (i / (n - 1)) * (CHART_W - 2 * PAD);
  const y = (v: number) => BASE - (v / max) * H;
  const seen = new Set<string | null>();
  const dashed = stories.map((e) => { const d = seen.has(e.issueKey); seen.add(e.issueKey); return d; });
  const badge = (e: UneEvent, size: number) =>
    `<div class="badge" style="background:${e.issueColor}">${enjeuGlyph(e.issueKey, COLORS.paper, size)}</div>`;

  const lines = stories.map((e, k) => {
    const pts = e.salienceTrend!.points;
    return `<polyline class="c-line" points="${pts.map((p, i) => `${x(i)},${y(p.cumul)}`).join(" ")}" pathLength="1" fill="none" stroke="${e.issueColor}" stroke-width="${k === 0 ? 10 : 8}" stroke-dasharray="1" stroke-dashoffset="1" stroke-linejoin="round" stroke-linecap="round"${dashed[k] ? ' data-dashed="1"' : ""}/>`;
  }).join("");

  // Pastille et valeur au bout de chaque courbe, à gauche du point ; sous le
  // point si la courbe descend (elle arrive d'en haut), au-dessus sinon.
  const ends = stories.map((e, k) => {
    const pts = e.salienceTrend!.points;
    const last = pts[pts.length - 1].cumul, prev = pts[pts.length - 2].cumul;
    return { e, k, v: last, top: y(last) + (prev > last ? 10 : -72) };
  }).sort((a, b) => a.top - b.top);
  for (let i = 1; i < ends.length; i++) ends[i].top = Math.max(ends[i].top, ends[i - 1].top + 72);
  const endLabels = ends.map((l) =>
    `<div class="end" style="right:${CHART_W - x(n - 1) - 31}px;top:${l.top}px;animation:pop .4s ${DRAW0 + DRAW}s both"><b style="color:${l.e.issueColor}">${frNum(l.v)}</b>${badge(l.e, 36)}</div>`).join("");

  const colW = (CHART_W - 2 * PAD) / (n - 1);
  const axis = ref.map((p, i) => {
    const h = publicationHour(p.blockUtc) ?? 0;
    return `<div class="xl" style="left:${x(i) - colW / 2}px;width:${colW}px;animation:fadeIn .3s ${DRAW0 + (i / (n - 1)) * DRAW}s both"><div style="display:flex;justify-content:center">${celestial(h, i === n - 1 ? COLORS.blue : COLORS.soft, 42)}</div><b>${h}h</b></div>`;
  }).join("");

  const legend = stories.map((e, k) =>
    `<div class="item" ${anim("fadeUp", .5, .5 + k * .35)}>${badge(e, 50)}<div><div class="k mono" style="color:${e.issueColor}">Une n°${k + 1} · ${txt(e.issueFr)}</div><div class="t pf">${txt(e.title)}</div></div></div>`).join("");

  const title = stories.length === 2 ? "La première Une face à la deuxième" : `Les ${stories.length} Unes de ${pubHourLabel(edition)}, côte à côte`;
  return {
    id: "course", duration: DRAW0 + DRAW + 3,
    html: `
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Les Unes de ${pubHourLabel(edition)} · 24 dernières heures</div>
        <h3 class="disp" ${anim("fadeUp", .6, .2)}>${txt(title)}</h3>
      </div>
      <div class="leg">${legend}</div>
      <div class="chart">
        <svg viewBox="0 0 ${CHART_W} 740" preserveAspectRatio="none">
          <line x1="0" x2="${CHART_W}" y1="${BASE}" y2="${BASE}" stroke="${COLORS.ink}" stroke-width="3"/>
          ${lines}
        </svg>
        ${endLabels}${axis}
      </div>
      <div class="note mono" ${anim("fadeIn", .5, DRAW0)}>Saillance cumulée, en points</div>`,
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
function script(traj: unknown): string {
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
  if(id==="course"){
    const k=ease(clamp((t-${DRAW0})/${DRAW}));
    document.querySelectorAll("#course .c-line").forEach(l=>{
      if(l.dataset.dashed&&k>=1){l.setAttribute("stroke-dasharray",".02 .015");l.style.strokeDashoffset="0";}
      else l.style.strokeDashoffset=String(1-k);
    });
  }
};`;
}

// ── Légende Instagram ───────────────────────────────────────────────────────
function caption(edition: EditionRef, top3: UneEvent[]): string {
  const [top, ...others] = top3;
  const lines = [
    `Ce qui domine l’actualité du Québec en ce moment · Édition de ${pubHourLabel(edition)}, ${edition.dateLabel.toLowerCase()}`,
    "",
    top.title,
    ...(top.excerpt ? ["", top.excerpt] : []),
    "",
    `${top.qcOutletCount}/${top.totalQcOutlets} ${coverageLabel(top.qcOutletCount)} : ${top.mediaToday.map((m) => m.name).join(", ")}.`,
    `Saillance des 24 dernières heures : ${top.saillanceLabel.toLowerCase()}.`,
    ...(others.length ? ["", "Aussi à la Une :", ...others.map((e) => `· ${e.title}`)] : []),
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

  const data = await loadHeadlineEvents(edition.key);
  const top3 = data?.top3 ?? [];
  if (!top3.length) throw new Error(`Aucune Une pour l'édition ${edition.key}.`);
  const top = top3[0];
  console.log(`La Une des Unes · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);
  console.log(`  n°1 : ${top.title}`);

  const art = args["sans-illustration"] ? null : await resolveArt(edition, current, top);
  const traj = sceneTrajectoire(top);
  const scenes = [
    sceneAccroche(edition, top), sceneUne(top, art), traj?.scene ?? null, sceneCentile(top),
    sceneCouverture(top), sceneCourse(top3, edition), sceneFin(edition),
  ].filter((s): s is Scene => s !== null);

  const html = buildPage({
    title: `La Une des Unes · ${edition.key}`,
    css: CSS, scenes, script: script(traj?.data ?? null),
    footerLeft: "⚜ La Vitrine démocratique",
    footerRight: `Édition de ${pubHourLabel(edition)} · ${edition.navDateIso.split("-").reverse().join(".")}`,
  });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, `une-des-unes_${edition.navDateIso}_${pubHourLabel(edition)}`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${base}.txt`, caption(edition, top3));
  console.log(`  légende → ${base}.txt`);

  await produce({ html, scenes, title: `La Une des Unes · édition de ${pubHourLabel(edition)}`, base, args });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
