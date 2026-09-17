// Reel Instagram du module 1 — La Une des Unes : les faits saillants au Québec.
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
// LE GABARIT (scripts/social/GABARIT.md) tient en trois contraintes, vérifiées
// par `checkFrame` avant tout aperçu ou vidéo :
//   · rien ne dépasse de l'encadré ;
//   · toute information reste dans la zone sûre (SAFE : x 60 → 960,
//     y 220 → 1520, boutons à droite sous y 640), hors de ce que cache Instagram ;
//   · aucun texte sous 26 px (lisible sur un téléphone).
// Seul le décor (`data-deco` : illustration, bandeaux) sort de la zone sûre.

import fs from "node:fs/promises";
import path from "node:path";

import { listEditions, loadHeadlineEvents, type EditionRef, type UneEvent } from "@/lib/data/headlineEvents";
import { MEDIA_LABELS, MEDIA_PANEL_QC } from "@/lib/medias";
import { matchesCurrentUneArt } from "@/lib/shareUneArt";
import {
  COLORS, SALIENCE_COLORS, SITE_URL, buildPage, celestial, enjeuGlyph, esc, fleur, frNum, parseArgs, produce,
  publicationHour, txt, type Scene,
} from "./lib/reel";

/** Titre du reel. */
const TITLE = "Les faits saillants au Québec";

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

  // 1. Illustration rapatriée localement par scripts/fetch_art.mjs (clé d'API) :
  //    latest.json nomme l'histoire illustrée, la comparaison est directe.
  const dir = path.resolve(process.cwd(), "public", "data", "generated-art");
  try {
    const meta = JSON.parse(await fs.readFile(path.join(dir, "latest.json"), "utf8"));
    if (matchesCurrentUneArt(meta, top)) {
      const png = await fs.readFile(path.join(dir, "latest.png"));
      return `data:image/png;base64,${png.toString("base64")}`;
    }
  } catch { /* pas de copie locale : on tente le site */ }

  // 2. Illustration publiée. DEUX conditions, parce que l'image est générée
  //    APRÈS chaque mise en ligne : juste après une nouvelle édition, le site
  //    peut déjà annoncer une nouvelle Une (hero-selection.json) alors que
  //    latest.png illustre encore l'ancienne. Le site, lui, masque alors
  //    l'image ; on exige donc aussi qu'il l'AFFICHE en page d'accueil.
  try {
    const hero = (await (await fetch(`${SITE_URL}/data/hero-selection.json`, { cache: "no-store" })).json()) as { storyline_id?: string; event_id?: string };
    if (!matchesCurrentUneArt(hero, top)) {
      console.warn("  illustration ignorée : le site publié présente une autre Une que le dépôt local.");
      return null;
    }
    const home = await (await fetch(SITE_URL, { cache: "no-store" })).text();
    const start = home.indexOf('id="une-des-unes"');
    const section = start >= 0 ? home.slice(start, home.indexOf('id="deux-solitudes"', start)) : "";
    if (!section.includes("generated-art/latest")) {
      console.warn("  illustration ignorée : le site ne l'affiche pas (pas encore générée pour cette Une).");
      return null;
    }
    const res = await fetch(`${SITE_URL}/data/generated-art/latest.png`, { cache: "no-store" });
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    console.warn("  illustration indisponible (site injoignable) : mise en page sans image.");
    return null;
  }
}

// ── Formulations ────────────────────────────────────────────────────────────
/** « 6/6 des médias québécois en parlent ». */
const coverageLabel = (n: number) => (n > 1 ? "des médias québécois en parlent" : "des médias québécois en parle");

/** « Le Journal de Montréal » (lib/medias.ts) et « Journal de Montréal »
 *  (mediaToday) désignent le même média. */
const sameOutlet = (a: string, b: string) => a.replace(/^Le /, "") === b.replace(/^Le /, "");

/** « 20h hier soir » → « hier soir » : l'heure est déjà portée par le pictogramme. */
const momentOf = (label: string) => label.replace(/^\d{1,2}h\s*/, "");

/** Corps du titre de la Une selon sa longueur, pour tenir en trois lignes. */
const titleSize = (title: string) => (title.length <= 70 ? 72 : title.length <= 90 ? 62 : 54);

// ── Mise en page ────────────────────────────────────────────────────────────
// Zone sûre (Reels organiques) : texte de x 76 à 960, y 220 → 1520. Décor : tout l'encadré.
const CSS = `
.kick{font-size:28px;color:var(--softer);letter-spacing:.14em}

/* 1. Accroche */
#accroche .brand{position:absolute;top:240px;left:76px;right:120px;display:flex;align-items:center;gap:20px;font-size:28px;color:var(--soft)}
#accroche .brand i{display:block;width:110px;height:10px;background:var(--blue);transform-origin:left}
#accroche h1{position:absolute;top:300px;left:76px;right:120px;font-size:176px;line-height:.95}
#accroche h1 em{font-style:normal;color:var(--blue)}
#accroche .band{position:absolute;left:30px;right:30px;top:900px;bottom:30px;background:var(--ink);overflow:hidden}
#accroche .ghost{position:absolute;left:46px;right:46px;bottom:0;height:660px;display:flex;align-items:flex-end;gap:18px}
#accroche .ghost div{flex:1;transform-origin:bottom}
#accroche .ed{position:absolute;left:76px;right:120px;top:950px;color:var(--paper);font-size:34px;line-height:1.35}

/* 2. Une n°1 */
#une .art{position:absolute;left:30px;top:30px;width:1020px;height:820px;overflow:hidden}
#une .art img{width:100%;height:100%;object-fit:cover}
#une .art::after{content:"";position:absolute;inset:auto 0 0 0;height:170px;background:linear-gradient(transparent,var(--paper))}
#une .noart{position:absolute;left:30px;top:30px;width:1020px;height:820px;display:flex;align-items:center;justify-content:center}
#une .rank{position:absolute;top:244px;left:76px;background:var(--ink);color:var(--paper);font-size:30px;padding:10px 18px}
#une .credit{position:absolute;top:842px;right:120px;display:flex;align-items:center;gap:14px;font-style:italic;font-size:26px;color:var(--softer)}
#une .credit::before{content:"";width:48px;height:1px;background:var(--softer)}
#une .body{position:absolute;left:76px;right:120px;top:904px}
#une .tag{display:inline-block;color:var(--paper);font-size:28px;padding:8px 16px}
#une h2{line-height:1.02;margin-top:18px}
#une .stats{display:flex;gap:26px;margin-top:28px}
#une .stat{flex:1;border-top:6px solid var(--ink);padding-top:12px}
#une .stat b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:78px;line-height:1.05}
#une .stat span{display:block;font-size:28px;line-height:1.15;color:var(--soft)}

/* 3. Trajectoire */
#trajectoire .head{position:absolute;top:236px;left:76px;right:120px}
#trajectoire .une{display:flex;gap:16px;align-items:flex-start;margin-top:12px}
#trajectoire .une svg{flex:none;margin-top:4px}
#trajectoire .une h3{font-size:44px;line-height:1.08;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#trajectoire .live{display:flex;align-items:flex-end;gap:20px;margin-top:14px}
#trajectoire .counter{font-family:"Playfair Display",serif;font-weight:900;font-size:132px;line-height:.85;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
#trajectoire .unit{font-size:26px;color:var(--softer);padding-bottom:10px}
#trajectoire .chip{position:absolute;left:76px;top:540px;font-size:28px;padding:8px 14px}
#trajectoire .when{position:absolute;right:120px;top:540px;display:flex;align-items:center;gap:12px;font-size:26px;color:var(--soft);letter-spacing:.08em}
#trajectoire .chart{position:absolute;left:76px;right:120px;top:610px;height:760px}
#trajectoire .grid{position:absolute;left:0;right:0;height:2px;background:var(--rule);opacity:.6}
#trajectoire .bar{position:absolute;transform-origin:bottom}
#trajectoire .bar.absent{background:repeating-linear-gradient(135deg,var(--rule) 0 12px,transparent 12px 24px)!important;outline:3px dashed var(--softer);outline-offset:-3px}
#trajectoire .val{position:absolute;font-family:"Playfair Display",serif;font-weight:700;font-size:34px;text-align:center}
#trajectoire .peak{position:absolute;font-size:26px;background:var(--ink);color:var(--paper);padding:6px 0;text-align:center;letter-spacing:.1em}
#trajectoire .xl{position:absolute;text-align:center;color:var(--soft)}
#trajectoire .xl b{display:block;font-family:"IBM Plex Mono",monospace;font-size:30px;line-height:1.1;margin-top:2px;color:var(--ink)}
#trajectoire .xl span{display:block;font-size:26px;line-height:1.05}
#trajectoire .xl.now b{color:var(--blue)}
#trajectoire .cap{position:absolute;left:76px;right:120px;top:1372px;font-size:42px;line-height:1.12}

/* 4. Centile */
#centile .head{position:absolute;top:236px;left:76px;right:60px}
#centile .lead{font-family:"Playfair Display",serif;font-weight:700;font-size:52px;line-height:1.08;margin-top:14px}
#centile .big{font-family:"Playfair Display",serif;font-weight:900;font-size:150px;line-height:.95;letter-spacing:-.04em;margin-top:4px}
#centile .big small{font-size:72px;letter-spacing:0;margin-left:8px}
#centile .of{font-family:"Playfair Display",serif;font-weight:700;font-size:52px;line-height:1.08}
#centile .scale{position:absolute;left:76px;right:120px}
#centile .scale i{position:absolute;bottom:0;width:2px;height:100%;background:var(--rule)}
#centile .scale i.ten{height:calc(100% + 14px)}
#centile .scale i.on{width:5px;margin-left:-1px}
#centile .mark{position:absolute;width:4px;background:var(--ink);transform-origin:bottom}
#centile .mark::before{content:"";position:absolute;left:-9px;top:-11px;width:22px;height:22px;border-radius:50%;background:var(--ink)}
#centile .mlabel{position:absolute;font-family:"Playfair Display",serif;font-style:italic;font-size:36px;white-space:nowrap}
#centile .ends{position:absolute;font-size:26px;color:var(--softer);letter-spacing:.08em}
#centile .note{position:absolute;width:420px}
#centile .note b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:72px;line-height:1}
#centile .note span{display:block;font-size:30px;line-height:1.2;margin-top:6px;color:var(--soft)}
#centile .src{position:absolute;left:76px;right:120px;top:1370px;font-style:italic;font-size:26px;line-height:1.25;color:var(--softer)}

/* 5. Couverture */
#couverture .head{position:absolute;top:236px;left:76px;right:120px}
#couverture .big{font-family:"Playfair Display",serif;font-weight:900;font-size:270px;line-height:.9;color:var(--blue)}
#couverture .lab{font-size:50px;margin-top:8px}
#couverture ul{position:absolute;left:76px;right:120px;top:640px;list-style:none;border-top:3px solid var(--ink)}
#couverture li{height:128px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--rule)}
#couverture li b{font-family:"Playfair Display",serif;font-weight:700;font-size:60px}
#couverture li span{font-size:28px;color:var(--blue);letter-spacing:.14em}
#couverture li.off b,#couverture li.off span{color:var(--rule)}
#couverture .since{position:absolute;left:76px;right:120px;top:1438px;font-size:40px;font-style:italic;color:var(--soft)}

/* 6. Course */
#course .head{position:absolute;top:236px;left:76px;right:120px}
#course .kick{letter-spacing:.08em}
#course h3{font-size:58px;line-height:1.04;margin-top:10px}
#course .leg{position:absolute;left:76px;right:120px;top:450px}
#course .item{display:flex;gap:20px;align-items:center;padding:12px 0;border-top:2px solid var(--rule)}
#course .badge{flex:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--paper)}
#course .item .k{font-size:26px;letter-spacing:.06em;line-height:1.15}
#course .item .t{font-size:30px;line-height:1.1;margin-top:4px}
#course .chart{position:absolute;left:76px;right:120px}
#course .chart > svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
#course .end{position:absolute;display:flex;align-items:center;gap:10px;white-space:nowrap}
#course .end .badge{width:54px;height:54px}
#course .end b{font-family:"Playfair Display",serif;font-weight:900;font-size:40px}
#course .xl{position:absolute;text-align:center;color:var(--soft)}
#course .xl b{display:block;font-family:"IBM Plex Mono",monospace;font-size:28px;line-height:1.1;margin-top:2px;color:var(--ink)}

/* 7. Fin */
#fin{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:250px}
#fin .kick{margin-top:30px;color:var(--soft);font-size:30px}
#fin .url{font-size:72px;margin-top:22px;border-bottom:7px solid var(--blue);padding-bottom:8px}
#fin .band{position:absolute;left:30px;right:30px;top:920px;bottom:30px;background:var(--blue);transform-origin:bottom}
#fin .foot{position:absolute;left:76px;right:120px;top:1000px;display:flex;flex-direction:column;align-items:center}
#fin .six{font-size:46px;font-style:italic;margin-bottom:36px;color:var(--paper)}
#fin .hours{display:flex;gap:10px}
#fin .hours div{width:132px;padding:14px 0;border:3px solid rgba(243,236,221,.5);font-size:28px;color:var(--paper);display:flex;flex-direction:column;align-items:center;gap:8px}
#fin .hours div.on{background:var(--paper);border-color:var(--paper);color:var(--blue)}
`;

const anim = (name: string, dur: number, delay: number) => `style="animation:${name} ${dur}s ${delay}s both"`;
const pubHourLabel = (edition: EditionRef) => `${edition.pubHour % 24}h`;
const bandOf = (rank: number) => SALIENCE_COLORS[rank] ?? { bg: COLORS.rule, fg: COLORS.ink };

/** Largeur utile des graphiques : la zone sûre moins la marge de texte (76 → 960). */
const CHART_W = 884;

function sceneAccroche(edition: EditionRef, top: UneEvent): Scene {
  const pts = top.salienceTrend?.points ?? [];
  const max = Math.max(1, ...pts.map((p) => p.cumul));
  const ghost = pts.map((p, i) =>
    `<div style="height:${Math.max(2, (p.cumul / max) * 100)}%;background:${p.rank > 0 ? bandOf(p.rank).bg : COLORS.soft};animation:growY .7s ${1.2 + i * 0.15}s both"></div>`).join("");
  const [head, place] = TITLE.split(/ (?=Québec$)/);
  return {
    id: "accroche", duration: 3.6, noFadeIn: true, hideFooter: true,
    html: `
      <div class="brand mono" ${anim("fadeIn", .5, .1)}><i ${anim("grow", .6, .1)}></i>La Une des Unes</div>
      <h1 class="disp" ${anim("fadeUp", .8, .3)}>${esc(head)}${place ? ` <em>${esc(place)}</em>` : ""}</h1>
      <div class="band" data-deco ${anim("fadeIn", .4, .9)}><div class="ghost">${ghost}</div></div>
      <div class="ed mono" ${anim("fadeIn", .5, 1.6)}>Édition de ${pubHourLabel(edition)}<br>${esc(edition.dateLabel)}</div>`,
  };
}

function sceneUne(top: UneEvent, art: string | null): Scene {
  const visual = art
    ? `<div class="art" data-deco ${anim("fadeIn", .6, .1)}><img id="art" src="${art}"></div>
       <div class="credit" ${anim("fadeIn", .8, 1.4)}>${txt(ART_CREDIT)}</div>`
    : `<div class="noart" data-deco style="background:${top.issueColor};animation:fadeIn .6s .1s both">${fleur(COLORS.paper, 300)}</div>`;
  // Les bandes 1 à 3 sont trop pâles pour un texte sur papier : encre.
  const salColor = top.saillanceRank >= 4 ? bandOf(top.saillanceRank).bg : COLORS.ink;
  return {
    id: "une", duration: 4.6,
    html: `
      ${visual}
      <div class="rank mono" ${anim("pop", .5, .6)}>Une n°1</div>
      <div class="body">
        <div class="tag mono" style="background:${top.issueColor};animation:wipe .6s .7s both">${txt(top.issueFr)}</div>
        <h2 class="disp" style="font-size:${titleSize(top.title)}px;animation:fadeUp .8s .9s both">${txt(top.title)}</h2>
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
  const BASE = 590, H = 500; // ligne de base et hauteur utile (repère .chart, qui commence à y 610)
  const n = pts.length, gap = 18, bw = (CHART_W - gap * (n - 1)) / n;
  const left = (i: number) => i * (bw + gap);
  const y = (v: number) => BASE - (v / max) * H;
  const hours = pts.map((p) => publicationHour(p.blockUtc) ?? 0);

  const nice = max > 40 ? 20 : max > 20 ? 10 : 5;
  const grid = Array.from({ length: Math.floor(max / nice) }, (_, k) => (k + 1) * nice)
    .map((v) => `<div class="grid" style="top:${y(v)}px"></div>`).join("");

  const bars = pts.map((p, i) => {
    const d = STEP0 + i * STEP;
    const h = (p.cumul / max) * H;
    const inside = h > 100;
    const valColor = inside && !p.isAbsent ? bandOf(p.rank).fg : p.isNow ? COLORS.red : COLORS.ink;
    return `
      <div class="bar${p.isAbsent ? " absent" : ""}" style="left:${left(i)}px;width:${bw}px;height:${h}px;top:${y(p.cumul)}px;background:${bandOf(p.rank).bg};animation:growY ${GROW}s ${d}s both"></div>
      <div class="val" style="left:${left(i)}px;width:${bw}px;top:${y(p.cumul) + (inside ? 40 : -48)}px;color:${valColor};animation:fadeIn .3s ${d + GROW}s both">${frNum(p.cumul)}</div>
      ${p.isPeak ? `<div class="peak mono" style="left:${left(i)}px;width:${bw}px;top:${y(p.cumul) - 50}px;animation:pop .5s ${d + GROW + .1}s both">Sommet</div>` : ""}
      <div class="xl${p.isNow ? " now" : ""}" style="left:${left(i)}px;width:${bw}px;top:${BASE + 10}px;animation:fadeIn .3s ${d}s both">
        <div style="display:flex;justify-content:center">${celestial(hours[i], p.isNow ? COLORS.blue : COLORS.soft, 40)}</div><b>${hours[i]}h</b><span>${esc(momentOf(p.timeLabel))}</span>
      </div>`;
  }).join("");

  const end = STEP0 + (n - 1) * STEP + GROW;
  return {
    data: {
      points: pts.map((p, i) => ({
        v: p.cumul,
        label: p.isAbsent ? "Hors des Unes" : p.level,
        when: `${celestial(hours[i], COLORS.soft, 34)}<span>${esc(p.timeLabel)}</span>`,
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
          <div class="une" ${anim("fadeUp", .5, .2)}>${enjeuGlyph(top.issueKey, top.issueColor, 44)}<h3 class="disp">${txt(top.title)}</h3></div>
          <div class="live" ${anim("fadeIn", .4, .6)}><div class="counter" id="t-counter">0,0</div><div class="unit mono">points</div></div>
        </div>
        <div class="chip mono" id="t-chip" ${anim("fadeIn", .3, STEP0)}></div>
        <div class="when mono" id="t-when" ${anim("fadeIn", .3, STEP0)}></div>
        <div class="chart">${grid}${bars}</div>
        <div class="cap disp" ${anim("fadeUp", .6, end + .3)}>${txt(trend.capLabel)}</div>`,
    },
  };
}

// Le centile en une phrase, puis sur une échelle horizontale de cent
// graduations : une graduation = 1 % des nouvelles de la dernière année, les
// moins saillantes à gauche. Les graduations se remplissent jusqu'à la
// nouvelle, un trait la situe, et deux annotations disent ce qu'il y a de
// chaque côté (à gauche : moins saillantes ; à droite : plus saillantes).
const SCALE_TOP = 720, SCALE_H = 260, FILL0 = 0.9, FILL = 2.2;

function sceneCentile(top: UneEvent): Scene | null {
  if (top.saillanceCentile == null) return null;
  // Borné à [1, 99] comme sur le site (hintFromCentile) : un rang, jamais
  // « 92 % plus saillante ». Au-dessus de la médiane, on dit ce que la nouvelle
  // dépasse ; en dessous, ce qui la dépasse.
  const c = Math.max(1, Math.min(99, Math.round(top.saillanceCentile)));
  const color = bandOf(Math.max(4, top.saillanceRank)).bg;
  const markX = 76 + CHART_W * c / 100;
  const ticks = Array.from({ length: 100 }, (_, i) =>
    `<i data-i="${i}" class="${i % 10 === 9 ? "ten" : ""}" style="left:${(i + .5) * CHART_W / 100 - 1}px"></i>`).join("");
  const done = FILL0 + FILL;
  const lead = c >= 50
    ? `<div class="lead" ${anim("fadeIn", .5, .2)}>Cette actualité est plus saillante que</div>
       <div class="big" ${anim("fadeUp", .6, .35)}><span id="c-num" data-n="${c}" style="color:${color}">0</span><small style="color:${color}">%</small></div>
       <div class="of" ${anim("fadeIn", .5, .6)}>des nouvelles de la dernière année</div>`
    : `<div class="big" ${anim("fadeUp", .6, .35)}><span id="c-num" data-n="${100 - c}">0</span><small>%</small></div>
       <div class="of" ${anim("fadeIn", .5, .6)}>des nouvelles de la dernière année ont été plus saillantes que celle-ci</div>`;
  // L'étiquette du trait se cale du côté où elle a la place.
  const labelPos = c >= 50 ? `right:${Math.max(120, 1080 - markX - 16)}px` : `left:${markX + 16}px`;
  return {
    id: "centile", duration: 6,
    html: `
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Par rapport à la dernière année</div>
        ${lead}
      </div>
      <div class="mlabel" style="top:${SCALE_TOP - 64}px;${labelPos};animation:fadeIn .4s ${done + .3}s both">Cette actualité</div>
      <div class="scale" id="c-scale" data-c="${c}" data-color="${color}" style="top:${SCALE_TOP}px;height:${SCALE_H}px;animation:fadeIn .4s .6s both">${ticks}</div>
      <div class="mark" style="left:${markX - 2}px;top:${SCALE_TOP - 12}px;height:${SCALE_H + 12}px;animation:growY .5s ${done}s both"></div>
      <div class="ends mono" style="left:76px;top:${SCALE_TOP + SCALE_H + 22}px;animation:fadeIn .4s .6s both">← Moins saillantes</div>
      <div class="ends mono" style="right:120px;top:${SCALE_TOP + SCALE_H + 22}px;animation:fadeIn .4s .6s both">Plus saillantes →</div>
      <div class="note" style="left:76px;top:${SCALE_TOP + SCALE_H + 90}px;animation:fadeUp .5s ${done + .5}s both"><b style="color:${color}">${c}&nbsp;%</b><span>des nouvelles de la dernière année ont été moins saillantes</span></div>
      <div class="note" style="right:120px;text-align:right;top:${SCALE_TOP + SCALE_H + 90}px;animation:fadeUp .5s ${done + .8}s both"><b>${100 - c}&nbsp;%</b><span>des nouvelles de la dernière année ont été plus saillantes</span></div>
      <div class="src" ${anim("fadeIn", .5, done + 1)}>Nouvelles&nbsp;: les Unes des médias québécois suivis, sur une année de référence.</div>`,
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
const LEG_TOP = 430, LEG_ITEM = 150, AXIS_Y = 1400; // y absolus

function sceneCourse(top3: UneEvent[], edition: EditionRef): Scene | null {
  const stories = top3.filter((e) => e.salienceTrend && e.salienceTrend.points.length >= 2);
  if (stories.length < 2) return null;
  const ref = stories[0].salienceTrend!.points;
  const n = ref.length;
  const max = Math.max(1, ...stories.flatMap((e) => e.salienceTrend!.points.map((p) => p.cumul)));
  // Le graphique occupe ce que la légende laisse, jusqu'à l'axe.
  const chartTop = LEG_TOP + stories.length * LEG_ITEM + 60;
  // Colonne d'étiquettes réservée à droite du tracé : pastille + valeur de
  // chaque courbe, écartées verticalement même quand les valeurs sont proches.
  const BASE = AXIS_Y - chartTop, H = BASE - 40, PAD = 50, LABELS = 190;
  const x = (i: number) => PAD + (i / (n - 1)) * (CHART_W - PAD - LABELS);
  const y = (v: number) => BASE - (v / max) * H;
  const seen = new Set<string | null>();
  const dashed = stories.map((e) => { const d = seen.has(e.issueKey); seen.add(e.issueKey); return d; });
  const badge = (e: UneEvent, size: number) =>
    `<div class="badge" style="background:${e.issueColor}">${enjeuGlyph(e.issueKey, COLORS.paper, size)}</div>`;

  const lines = stories.map((e, k) => {
    const pts = e.salienceTrend!.points;
    return `<polyline class="c-line" points="${pts.map((p, i) => `${x(i)},${y(p.cumul)}`).join(" ")}" pathLength="1" fill="none" stroke="${e.issueColor}" stroke-width="${k === 0 ? 10 : 8}" stroke-dasharray="1" stroke-dashoffset="1" stroke-linejoin="round" stroke-linecap="round"${dashed[k] ? ' data-dashed="1"' : ""}/>`;
  }).join("");

  const ends = stories.map((e) => {
    const pts = e.salienceTrend!.points;
    return { e, v: pts[pts.length - 1].cumul, top: y(pts[pts.length - 1].cumul) - 27 };
  }).sort((a, b) => a.top - b.top);
  for (let i = 1; i < ends.length; i++) ends[i].top = Math.max(ends[i].top, ends[i - 1].top + 66);
  const overflow = ends.length ? ends[ends.length - 1].top + 54 - BASE : 0;
  if (overflow > 0) ends.forEach((l) => { l.top -= overflow; });
  const endLabels = ends.map((l) =>
    `<div class="end" style="left:${x(n - 1) + 24}px;top:${l.top}px;animation:pop .4s ${DRAW0 + DRAW}s both">${badge(l.e, 32)}<b style="color:${l.e.issueColor}">${frNum(l.v)}</b></div>`).join("");

  const colW = Math.min((CHART_W - PAD - LABELS) / (n - 1), 2 * PAD + 20);
  const axis = ref.map((p, i) => {
    const h = publicationHour(p.blockUtc) ?? 0;
    return `<div class="xl" style="left:${x(i) - colW / 2}px;width:${colW}px;top:${BASE + 10}px;animation:fadeIn .3s ${DRAW0 + (i / (n - 1)) * DRAW}s both"><div style="display:flex;justify-content:center">${celestial(h, i === n - 1 ? COLORS.blue : COLORS.soft, 36)}</div><b>${h}h</b></div>`;
  }).join("");

  const legend = stories.map((e, k) =>
    `<div class="item" ${anim("fadeUp", .5, .5 + k * .35)}>${badge(e, 44)}<div><div class="k mono" style="color:${e.issueColor}">Une n°${k + 1} · ${txt(e.issueFr)}</div><div class="t pf">${txt(e.title)}</div></div></div>`).join("");

  const title = stories.length === 2 ? "La première Une face à la deuxième" : `Les ${stories.length} Unes de ${pubHourLabel(edition)}, côte à côte`;
  return {
    id: "course", duration: DRAW0 + DRAW + 3,
    html: `
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}>Saillance cumulée · 24 dernières heures</div>
        <h3 class="disp" ${anim("fadeUp", .6, .2)}>${txt(title)}</h3>
      </div>
      <div class="leg">${legend}</div>
      <div class="chart" style="top:${chartTop}px;height:${BASE + 80}px">
        <svg viewBox="0 0 ${CHART_W} ${BASE + 80}" preserveAspectRatio="none">
          <line x1="0" x2="${CHART_W}" y1="${BASE}" y2="${BASE}" stroke="${COLORS.ink}" stroke-width="3"/>
          ${lines}
        </svg>
        ${endLabels}${axis}
      </div>`,
  };
}

function sceneFin(edition: EditionRef): Scene {
  const now = edition.pubHour % 24;
  const hours = [0, 4, 8, 12, 16, 20].map((h, i) =>
    `<div class="mono${h === now ? " on" : ""}" style="animation:pop .4s ${1.2 + i * .12}s both">${celestial(h, "currentColor", 38)}${h}h</div>`).join("");
  return {
    id: "fin", duration: 4, noFadeOut: true, hideFooter: true,
    html: `
      <div style="animation:pop .7s .1s both">${fleur(COLORS.blue, 220)}</div>
      <div class="kick mono" ${anim("fadeIn", .5, .4)}>${esc(TITLE)}</div>
      <div class="url disp" ${anim("fadeUp", .7, .6)}>vitrinedemocratique.com</div>
      <div class="band" data-deco ${anim("growY", .8, .2)}></div>
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
    sc.querySelectorAll("i").forEach(el=>{const on=+el.dataset.i<lit;el.classList.toggle("on",on);el.style.background=on?sc.dataset.color:""});
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
// Un RÉCIT suivi, puis le lien, puis les mots-clics. Chaque phrase suit un
// gabarit FINI, listé ici et nourri seulement par les données de l'édition
// (AGENTS.md règle 7 : gabarits relus avant publication). Rien n'est ajouté
// qui ne soit dans les loaders.

/** « A, B et C ». */
const joinFr = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`);

/** Titre de Une entre guillemets français (insécables) ; les guillemets déjà
 *  présents dans le titre passent au second niveau (“ ”). */
const quote = (s: string) => `«\u00A0${s.replace(/«\s*/g, "“").replace(/\s*»/g, "”")}\u00A0»`;

/** Qui a mis l'histoire en Une (fenêtre de 24 heures, comme le module). */
function coverageSentence(top: UneEvent): string {
  const names = top.mediaToday.map((m) => m.name);
  const n = top.qcOutletCount, total = top.totalQcOutlets;
  if (n >= total) return `Au cours des 24 dernières heures, les ${total} médias québécois que nous suivons en ont tous fait leur Une (${joinFr(names)}).`;
  if (n > 1) return `Au cours des 24 dernières heures, ${n} des ${total} médias québécois que nous suivons en ont fait leur Une (${joinFr(names)}).`;
  return `Au cours des 24 dernières heures, ${names[0]} est le seul des ${total} médias québécois que nous suivons à en avoir fait sa Une.`;
}

/** Niveau et rang dans l'année (même bascule que le site à la médiane). */
function salienceSentence(top: UneEvent): string {
  const level = top.saillanceLabel.toLowerCase();
  if (top.saillanceCentile == null) return `Sa saillance sur 24 heures est ${level}.`;
  const c = Math.max(1, Math.min(99, Math.round(top.saillanceCentile)));
  return c >= 50
    ? `Sa saillance sur 24 heures est ${level} : elle est plus saillante que ${c} % des nouvelles de la dernière année.`
    : `Sa saillance sur 24 heures est ${level} : ${100 - c} % des nouvelles de la dernière année ont été plus saillantes.`;
}

/** Où en est l'attention à cette édition (situations du site : SalienceTrend).
 *  L'histoire racontée est la n°1 sur 24 heures : quand elle a quitté les Unes
 *  de l'édition, on le dit sans contredire qu'elle domine la période. */
function trendSentence(top: UneEvent, hour: string): string | null {
  const t = top.salienceTrend;
  if (!t) return null;
  const peak = top.sommetLabel ? `, avec un sommet atteint ${top.sommetLabel}` : "";
  switch (t.situation) {
    case "nouvelle": return `Elle vient d’entrer dans les Unes, à ${hour}.`;
    case "sommet": return `L’attention atteint son sommet à ${hour}.`;
    case "remonte": return `L’attention remonte à ${hour}.`;
    case "baisse": return `L’attention baisse à ${hour}${peak}.`;
    case "retour": return `Elle revient dans les Unes à ${hour}.`;
    case "retombee": return `Elle ne fait plus la Une à ${hour}, mais reste l’histoire la plus saillante des 24 dernières heures${peak}.`;
    case "stable": return `L’attention reste stable à ${hour}.`;
    default: return null;
  }
}

/** Les autres Unes du moment. */
function othersSentence(others: UneEvent[]): string | null {
  if (!others.length) return null;
  if (others.length === 1) return `Une autre histoire est aussi à la Une : ${quote(others[0].title)}.`;
  return `${others.length === 2 ? "Deux" : others.length} autres histoires sont aussi à la Une : ${joinFr(others.map((e) => quote(e.title)))}.`;
}

function caption(edition: EditionRef, top3: UneEvent[]): string {
  const [top, ...others] = top3;
  const date = edition.dateLabel.replace(/\s\d{4}$/, "");
  const paragraphs = [
    [`${date}, édition de ${pubHourLabel(edition)}. L’histoire qui domine l’actualité au Québec : ${quote(top.title)}.`, top.excerpt],
    [top.saillantSince ? `Elle est apparue à la Une ${top.saillantSince.replace(/\s\d{4}$/, "")}.` : null, coverageSentence(top), salienceSentence(top), trendSentence(top, pubHourLabel(edition))],
    [othersSentence(others)],
    [`${TITLE}, six fois par jour : vitrinedemocratique.com`],
    [HASHTAGS.join(" ")],
  ].map((p) => p.filter(Boolean).join(" ")).filter(Boolean);
  // Mêmes règles OQLF que la vidéo, en texte brut (U+00A0).
  return paragraphs.join("\n\n").replace(/[ \t]*:(?=\s|$)/gm, "\u00A0:").replace(/[ \t]*%/g, "\u00A0%") + "\n";
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
