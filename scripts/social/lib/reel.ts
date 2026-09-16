// Moteur commun des reels : une page HTML animée → des images → un MP4.
//
// POURQUOI UNE PAGE HTML. Les reels reprennent le langage visuel du site
// (papier/encre, Playfair Display, Source Serif, IBM Plex Mono). Le décrire en
// HTML/CSS, c'est le même outil que le site, relisible par toute l'équipe.
//
// POURQUOI IMAGE PAR IMAGE. Filmer la page en temps réel ferait dépendre la
// vidéo de la vitesse de la machine (saccades, animations tronquées). Ici,
// chaque image est posée à un instant exact via `setTime(t)` : les animations
// CSS sont mises en pause puis positionnées à la milliseconde. Deux exécutions
// sur les mêmes données donnent la même vidéo, sur n'importe quel poste.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import { chromium, type Browser, type Page } from "playwright";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SymboleEnjeu } from "@/components/interactive/SymboleEnjeu";
import { instantPublicationBloc } from "@/lib/data/headlineEvents";

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
/** Étirement global de la timeline. 1,4 = le rythme validé le 2026-09-16
 *  (« un peu moins rapide » que la première version). Les gabarits décrivent
 *  leurs scènes au rythme de base ; seul ce facteur règle la vitesse. */
export const SLOW = 1.4;

export const SITE_URL = "https://vitrinedemocratique.com";

/** Zones sûres des Reels (mesurées sur l'interface Instagram, 2026) : l'en-tête
 *  couvre le haut, la légende et les boutons le bas et la droite. Le texte
 *  essentiel reste DANS ce cadre ; les graphiques et images peuvent déborder
 *  jusqu'aux bords pour remplir l'écran. Le recadrage 3:4 de la grille du
 *  profil garde la bande 240–1680 : l'accroche doit y tenir. */
export const SAFE = { top: 220, bottom: 1500, left: 60, right: 960 };

/** Intérieur de l'encadré du reel (filet à 28 px, épaisseur 2). RÈGLE : rien
 *  ne dépasse du cadre, ni image, ni bandeau, ni texte. Les scènes sont
 *  rognées à ce rectangle, et `checkFrame` signale tout élément qui le franchit. */
export const FRAME = { left: 30, top: 30, right: WIDTH - 30, bottom: HEIGHT - 30 };

/** Palette du site (app/globals.css) et bandes de saillance
 *  (lib/shareCardTemplate.tsx, rangs calibrés 1 à 6). */
export const COLORS = {
  paper: "#F3ECDD",
  deep: "#ECE3CF",
  ink: "#1C1917",
  soft: "#433F38",
  softer: "#6E685F",
  rule: "#C8BDA6",
  blue: "#224F7D",
  red: "#A8302C",
};
export const SALIENCE_COLORS: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#E4DCC6", fg: COLORS.ink },
  2: { bg: "#DCCBA2", fg: COLORS.ink },
  3: { bg: "#D2B488", fg: COLORS.ink },
  4: { bg: "#C99A76", fg: COLORS.ink },
  5: { bg: "#BE7C6A", fg: COLORS.paper },
  6: { bg: "#A85A52", fg: COLORS.paper },
};

/** Fleur de lys du site (même tracé que lib/shareCardTemplate.tsx). */
export const FLEUR_PATH =
  "M297.69,147.804c-47.642-5.459-97.763,27.791-107.192,94.289c-0.329,2.318-0.605,4.685-0.824,7.076h-2.81c4.056-45.102,22.727-76.399,33.905-97.214c14.49-26.98,2.729-53.559-2.997-65.452C211.276,73.013,181.848,18.486,174.354,0c-7.494,18.486-36.702,73.013-43.198,86.503c-5.728,11.893-17.488,38.472-2.998,65.452c11.103,20.673,29.87,52.316,34.226,97.214h-3.208c-0.219-2.392-0.495-4.758-0.824-7.076c-9.43-66.499-59.551-99.748-107.192-94.289c-53.284,6.105-81.882,90.319,0.496,110.666c-13.399-24.813,7.443-69.477,55.583-44.167c15.656,8.232,26.561,21.383,31.072,34.866h-8.065c-7.608,0-13.776,4.469-13.776,9.983c0,5.514,6.168,9.983,13.776,9.983h9.817c-0.803,4.348-2.456,8.464-5.034,12.162c-11.416,16.377-49.649,7.444-28.31-28.286c-36.065-4.747-45.649,29.279-35.228,47.641c11.453,23.411,61.479,30.428,80.41-2.978c4.54-8.012,6.819-18.047,7.555-28.539h3.864c-0.033,7.932-0.53,16.224-1.59,24.887c-12.647,8.146-7.717,25.725-23.735,36.234c10.062,0.265,18.271-1.708,20.92-5.415c0,10.75,9.617,19.812,15.886,32.858c5.824-13.119,15.208-24.094,15.208-32.858c2.648,3.707,10.857,5.68,20.92,5.415c-14.687-9.01-8.898-25.516-23.261-37.306c-1.015-8.293-1.508-16.22-1.589-23.815h3.312c0.735,10.492,3.016,20.527,7.555,28.539c18.931,33.405,68.957,26.389,80.41,2.978c10.422-18.361,0.838-52.388-35.228-47.641c21.34,35.73-16.894,44.663-28.31,28.286c-2.577-3.698-4.23-7.814-5.033-12.162h10.572c7.608,0,13.776-4.47,13.776-9.983c0-5.515-6.168-9.983-13.776-9.983h-8.821c4.512-13.483,15.416-26.634,31.072-34.866c48.14-25.31,68.982,19.354,55.583,44.167C379.573,238.124,350.974,153.91,297.69,147.804z";

export function fleur(color: string, size: number): string {
  return `<svg viewBox="-0.864 -0.333 350 359" width="${size}" height="${Math.round(size * 1.03)}"><path fill="${color}" d="${FLEUR_PATH}"/></svg>`;
}

/** Pictogrammes des six éditions, repris de l'en-tête du site
 *  (static-content/top.html) : pleine lune 0h, lune 4h, petit soleil 8h,
 *  soleil plein 12h, soleil 16h, croissant inversé 20h. */
const RAYS = (r: number, w: number, a: number, b: number, c: number, d: number) =>
  `<circle cx="12" cy="12" r="${r}" fill="currentColor"/><g stroke="currentColor" stroke-width="${w}" stroke-linecap="round">` +
  `<line x1="12" y1="${a}" x2="12" y2="${b}"/><line x1="12" y1="${24 - b}" x2="12" y2="${24 - a}"/>` +
  `<line x1="${a}" y1="12" x2="${b}" y2="12"/><line x1="${24 - b}" y1="12" x2="${24 - a}" y2="12"/>` +
  `<line x1="${c}" y1="${c}" x2="${d}" y2="${d}"/><line x1="${24 - d}" y1="${24 - d}" x2="${24 - c}" y2="${24 - c}"/>` +
  `<line x1="${c}" y1="${24 - c}" x2="${d}" y2="${24 - d}"/><line x1="${24 - d}" y1="${d}" x2="${24 - c}" y2="${c}"/></g>`;
const MOON = `<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" fill="currentColor"/>`;
const CELESTIAL: Record<number, string> = {
  0: `<circle cx="12" cy="12" r="7.4" fill="currentColor"/>`,
  4: MOON,
  8: RAYS(3.5, 1.2, 4, 5.5, 6.3, 7.4),
  12: RAYS(5, 1.4, 1.5, 4, 4.4, 6.3),
  16: RAYS(4.3, 1.3, 2.5, 4.5, 5.2, 6.6),
  20: `<g transform="translate(24,0) scale(-1,1)">${MOON}</g>`,
};

export function celestial(hour: number, color: string, size: number): string {
  const h = (Math.round(hour / 4) * 4) % 24;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}">${CELESTIAL[h]}</svg>`;
}

/** Pictogramme d'un des 12 enjeux du CAP, rendu par le composant même du site
 *  (components/interactive/SymboleEnjeu.tsx) : un dessin modifié là-bas l'est
 *  ici aussi. Chaîne vide pour un enjeu inconnu, comme le composant. */
export function enjeuGlyph(cle: string | null | undefined, color: string, size: number): string {
  return renderToStaticMarkup(createElement(SymboleEnjeu, { cle, style: { width: size, height: size, color, display: "block" } }));
}

/** Heure de PUBLICATION (Montréal, 0-23) d'un bloc de données (`2026-09-16T15`),
 *  même règle que le site (instantPublicationBloc : fin du bloc + 1 h). */
export function publicationHour(blockUtc: string): number | null {
  const iso = instantPublicationBloc(blockUtc);
  if (!iso) return null;
  const h = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(iso));
  return parseInt(h, 10);
}

/** Échappement HTML : les titres et résumés viennent des données. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Typographie OQLF (AGENTS.md règle #7) sur un texte déjà échappé :
 *  insécable avant « : » et « % », pas d'espace avant « ; ? ! ». */
export function typo(s: string): string {
  return s
    .replace(/\s*:(?=\s|$)/g, "&nbsp;:")
    .replace(/\s*%/g, "&nbsp;%")
    .replace(/\s+([;?!])/g, "$1");
}

/** Texte issu des données, prêt à insérer dans le gabarit. */
export function txt(s: string): string {
  return typo(esc(s));
}

/** Nombre à la française (virgule décimale). */
export function frNum(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace(".", ",");
}

export type Scene = {
  id: string;
  /** Durée au rythme de base, en secondes (avant SLOW). */
  duration: number;
  html: string;
  /** Pas de fondu d'entrée (première scène) ou de sortie (dernière). */
  noFadeIn?: boolean;
  noFadeOut?: boolean;
  /** Masque le pied de page (scène à fond sombre ou pleine page). */
  hideFooter?: boolean;
};

const BASE_CSS = `
:root{--paper:${COLORS.paper};--deep:${COLORS.deep};--ink:${COLORS.ink};--soft:${COLORS.soft};--softer:${COLORS.softer};--rule:${COLORS.rule};--blue:${COLORS.blue};--red:${COLORS.red}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:var(--paper)}
body{font-family:"Source Serif 4",serif;color:var(--ink);position:relative}
.frame{position:absolute;inset:28px;border:2px solid var(--rule);z-index:50}
.mono{font-family:"IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase}
.disp{font-family:"Playfair Display",serif;font-weight:900;letter-spacing:-.02em}
.pf{font-family:"Playfair Display",serif;font-weight:700}
.scene{position:absolute;inset:0;padding:120px 76px 0;opacity:0;clip-path:inset(30px)}
.footer{position:absolute;left:76px;right:76px;bottom:70px;display:flex;justify-content:space-between;font-size:22px;color:var(--softer);z-index:40}
.progress{position:absolute;left:28px;top:28px;height:8px;width:${WIDTH - 56}px;background:var(--blue);transform-origin:left;z-index:60}
@keyframes fadeUp{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:none}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes slam{from{opacity:0;transform:scale(1.3)}to{opacity:1;transform:scale(1)}}
@keyframes wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes pop{0%{opacity:0;transform:scale(.6)}70%{transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
`;

/** Assemble la page complète. `css` et `script` sont propres au gabarit ;
 *  `script` peut définir `window.onSceneTime(id, local)` pour les effets que
 *  CSS ne sait pas rendre (compteurs, zoom lent). */
export function buildPage(opts: { title: string; css: string; scenes: Scene[]; footerLeft: string; footerRight: string; script?: string }): string {
  let t = 0;
  const timeline = opts.scenes.map((s) => {
    const entry = { id: s.id, start: t, end: t + s.duration, fadeIn: !s.noFadeIn, fadeOut: !s.noFadeOut, hideFooter: !!s.hideFooter };
    t += s.duration;
    return entry;
  });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Source+Serif+4:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=block" rel="stylesheet">
<style>${BASE_CSS}${opts.css}</style></head><body>
<div class="frame"></div><div class="progress" id="__prog"></div>
${opts.scenes.map((s) => `<section class="scene" id="${s.id}">${s.html}</section>`).join("\n")}
<div class="footer mono" id="__foot"><span>${opts.footerLeft}</span><span>${opts.footerRight}</span></div>
<script>
${opts.script ?? ""}
const TIMELINE=${JSON.stringify(timeline)};
const BASE=${t};
function seek(t){
  let foot=1;
  for(const s of TIMELINE){
    const el=document.getElementById(s.id), local=t-s.start, fade=.35;
    let o=0;
    if(t>=s.start&&t<s.end){o=1;if(s.fadeIn)o=Math.min(o,local/fade);if(s.fadeOut)o=Math.min(o,(s.end-t)/fade);}
    if(!s.fadeOut&&t>=s.end)o=1;
    el.style.opacity=o;
    if(o===0)continue;
    if(s.hideFooter)foot=Math.min(foot,1-o);
    el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=Math.max(0,local)*1000});
    if(window.onSceneTime)window.onSceneTime(s.id,Math.max(0,local),s.end-s.start);
  }
  document.getElementById("__foot").style.opacity=foot;
  document.getElementById("__prog").style.transform="scaleX("+Math.min(1,t/BASE)+")";
}
window.DURATION=BASE*${SLOW};
window.setTime=t=>seek(t/${SLOW});
seek(0);
</script></body></html>`;
}

/** Lecteur de prévisualisation : la page du reel dans un cadre à l'échelle de
 *  la fenêtre, avec lecture, défilement, saut de scène, vitesse et zones
 *  masquées par l'interface Instagram. C'est la MÊME page que celle qui est
 *  filmée pour le MP4, pilotée par le même `setTime` : ce qu'on voit ici est
 *  ce que la vidéo contiendra. */
export function buildPlayer(reelHtml: string, scenes: Scene[], title: string): string {
  let t = 0;
  const marks = scenes.map((s) => { const m = { id: s.id, start: t * SLOW }; t += s.duration; return m; });
  const duration = t * SLOW;
  // `</` échappé : la page du reel voyage dans une chaîne JS, dans un <script>.
  const payload = JSON.stringify(reelHtml).replace(/<\//g, "<\\/");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aperçu · ${esc(title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;height:100vh;background:#1C1917;color:#F3ECDD;font:14px "IBM Plex Mono",ui-monospace,monospace;display:flex;gap:28px;align-items:center;justify-content:center;padding:20px}
#stage{position:relative;flex:none;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#stage iframe{position:absolute;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;border:0;transform-origin:0 0}
#safe{position:absolute;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;transform-origin:0 0;pointer-events:none;display:none}
#safe div{position:absolute;background:rgba(220,40,40,.28);outline:1px dashed rgba(255,80,80,.9)}
#panel{width:320px;display:flex;flex-direction:column;gap:14px}
h1{font-size:15px;margin:0 0 6px;letter-spacing:.08em;text-transform:uppercase}
button{font:inherit;background:#F3ECDD;color:#1C1917;border:0;padding:9px 12px;cursor:pointer;text-align:left}
button.ghost{background:transparent;color:#F3ECDD;outline:1px solid #6E685F}
button.on{background:#224F7D;color:#F3ECDD}
input[type=range]{width:100%}
.row{display:flex;gap:8px;flex-wrap:wrap}
#time{font-size:22px}
.hint{color:#9C9486;line-height:1.5}
</style></head><body>
<div id="stage"><iframe id="reel"></iframe><div id="safe"><div style="left:0;right:0;top:0;height:220px"></div><div style="left:0;right:0;bottom:0;height:420px"></div><div style="right:0;width:120px;top:220px;bottom:420px"></div></div></div>
<div id="panel">
  <h1>${esc(title)}</h1>
  <div id="time">0,0 s / ${duration.toFixed(1).replace(".", ",")} s</div>
  <input id="scrub" type="range" min="0" max="${duration}" step="0.0333" value="0">
  <div class="row"><button id="play">▶ Lecture</button><button class="ghost" id="slow">Vitesse ×1</button><button class="ghost" id="safeBtn">Zones Instagram</button></div>
  <div class="row" id="scenes">${marks.map((m) => `<button class="ghost" data-t="${m.start}">${esc(m.id)}</button>`).join("")}</div>
  <p class="hint">Espace : lecture/pause · ← → : 1 s · rouge : zones couvertes par l’interface Instagram (en-tête, légende, boutons).</p>
</div>
<script>
const REEL=${payload};
const DUR=${duration};
const iframe=document.getElementById("reel"), stage=document.getElementById("stage");
iframe.srcdoc=REEL;
function fit(){const s=Math.min((innerHeight-40)/${HEIGHT},(innerWidth-400)/${WIDTH});stage.style.width=${WIDTH}*s+"px";stage.style.height=${HEIGHT}*s+"px";iframe.style.transform="scale("+s+")";document.getElementById("safe").style.transform="scale("+s+")";}
addEventListener("resize",fit);fit();
let t=0,playing=false,speed=1,last=0;
const scrub=document.getElementById("scrub"),timeEl=document.getElementById("time"),playBtn=document.getElementById("play");
function show(){const w=iframe.contentWindow;if(w&&w.setTime)w.setTime(t);scrub.value=t;timeEl.textContent=t.toFixed(1).replace(".",",")+" s / "+DUR.toFixed(1).replace(".",",")+" s";
  document.querySelectorAll("#scenes button").forEach((b,i,all)=>{const s=+b.dataset.t,e=i+1<all.length?+all[i+1].dataset.t:DUR;b.classList.toggle("on",t>=s&&t<e)});}
function loop(now){if(playing){t+=(now-last)/1000*speed;if(t>=DUR){t=DUR;playing=false;playBtn.textContent="▶ Lecture";}}last=now;show();requestAnimationFrame(loop);}
function toggle(){if(t>=DUR)t=0;playing=!playing;playBtn.textContent=playing?"❚❚ Pause":"▶ Lecture";}
playBtn.onclick=toggle;
scrub.oninput=()=>{t=+scrub.value;};
document.getElementById("slow").onclick=e=>{speed=speed===1?.5:speed===.5?.25:1;e.target.textContent="Vitesse ×"+String(speed).replace(".",",");};
document.getElementById("safeBtn").onclick=e=>{const s=document.getElementById("safe");const on=s.style.display!=="block";s.style.display=on?"block":"none";e.target.classList.toggle("on",on);};
document.querySelectorAll("#scenes button").forEach(b=>b.onclick=()=>{t=+b.dataset.t+.01;});
addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();toggle();}if(e.code==="ArrowRight")t=Math.min(DUR,t+1);if(e.code==="ArrowLeft")t=Math.max(0,t-1);});
iframe.onload=()=>{iframe.contentDocument.fonts.ready.then(()=>{last=performance.now();requestAnimationFrame(loop);});};
</script></body></html>`;
}

/** Ouvre un fichier dans le navigateur par défaut du poste. */
export function openInBrowser(file: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", file] : [file];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

/** Étape commune à tous les scripts de module, dans l'ordre voulu :
 *  1. par défaut, APERÇU animé dans le navigateur — on regarde, on corrige ;
 *  2. `--mp4` seulement ensuite, pour produire la vidéo à publier.
 *  `--apercu 5,20` donne des images fixes ; `--sans-ouvrir` n'ouvre rien. */
export async function produce(opts: { html: string; scenes: Scene[]; title: string; base: string; args: Record<string, string | true> }): Promise<void> {
  const { html, scenes, title, base, args } = opts;
  const overflow = await checkFrame(html, scenes);
  if (overflow.length) {
    console.warn(`  ⚠️ ${overflow.length} élément(s) dépassent du cadre :`);
    for (const o of overflow) console.warn(`     · ${o}`);
    if (args.mp4) throw new Error("Vidéo non produite : corrigez ce qui dépasse du cadre (voir l'aperçu).");
  } else {
    console.log("  cadre   → rien ne dépasse");
  }
  if (typeof args.apercu === "string") {
    const previewAt = args.apercu.split(",").map(Number).filter(Number.isFinite);
    await renderReel(html, { out: `${base}.mp4`, previewAt });
    return;
  }
  if (args.mp4) {
    await renderReel(html, { out: `${base}.mp4` });
    console.log(`  vidéo   → ${base}.mp4`);
    return;
  }
  const player = `${base}_apercu.html`;
  await fs.writeFile(player, buildPlayer(html, scenes, title));
  console.log(`  aperçu  → ${player}`);
  console.log("  Relisez l'aperçu, puis relancez avec --mp4 pour produire la vidéo.");
  if (!args["sans-ouvrir"]) openInBrowser(player);
}

/** Contrôle du cadre : chaque scène est posée à son état final (juste avant
 *  son fondu de sortie), et tout élément visible dont la boîte franchit FRAME
 *  est signalé. La boîte est d'abord rognée par les ancêtres en
 *  `overflow: hidden` : une image zoomée dans un cadre qui la contient ne
 *  dépasse pas. */
export async function checkFrame(html: string, scenes: Scene[]): Promise<string[]> {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const found: string[] = [];
    let t = 0;
    for (const s of scenes) {
      const at = (t + s.duration - 0.4) * SLOW;
      t += s.duration;
      found.push(...(await overflowAt(page, s.id, at)));
    }
    return found;
  } finally {
    await browser.close();
  }
}

async function overflowAt(page: Page, sceneId: string, at: number): Promise<string[]> {
  return page.evaluate(({ sceneId, at, frame }) => {
    (window as unknown as { setTime(t: number): void }).setTime(at);
    const scene = document.getElementById(sceneId)!;
    const out: string[] = [];
    const flagged = new Set<Element>();
    for (const el of Array.from(scene.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
      for (let a = el.parentElement; a && a !== scene; a = a.parentElement) {
        if (getComputedStyle(a).overflow === "visible") continue;
        const ar = a.getBoundingClientRect();
        left = Math.max(left, ar.left); top = Math.max(top, ar.top);
        right = Math.min(right, ar.right); bottom = Math.min(bottom, ar.bottom);
      }
      if (right - left < 1 || bottom - top < 1) continue;
      const d = [
        left < frame.left - .5 ? `gauche ${Math.round(frame.left - left)} px` : "",
        top < frame.top - .5 ? `haut ${Math.round(frame.top - top)} px` : "",
        right > frame.right + .5 ? `droite ${Math.round(right - frame.right)} px` : "",
        bottom > frame.bottom + .5 ? `bas ${Math.round(bottom - frame.bottom)} px` : "",
      ].filter(Boolean);
      if (!d.length) continue;
      // Un seul signalement par débordement : l'ancêtre fautif suffit.
      flagged.add(el);
      let a: Element | null = el.parentElement, inherited = false;
      for (; a && a !== scene; a = a.parentElement) if (flagged.has(a)) { inherited = true; break; }
      if (inherited) continue;
      const label = (el.textContent ?? "").trim().slice(0, 40) || `<${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}">`;
      out.push(`scène ${sceneId} : « ${label} » (${d.join(", ")})`);
    }
    return out;
  }, { sceneId, at, frame: FRAME });
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    // Chromium de Playwright absent (`npx playwright install chromium` pas
    // encore lancé) : on se rabat sur le Chrome installé sur le poste.
    return chromium.launch({ channel: "chrome" });
  }
}

/** Rend la page en MP4 (H.264, 30 i/s, 1080×1920), ou en images fixes si
 *  `previewAt` est fourni (secondes de la vidéo finale). */
export async function renderReel(html: string, opts: { out: string; previewAt?: number[] }): Promise<void> {
  await fs.mkdir(path.dirname(opts.out), { recursive: true });
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    if (opts.previewAt?.length) {
      for (const t of opts.previewAt) {
        await page.evaluate((x) => (window as unknown as { setTime(t: number): void }).setTime(x), t);
        const file = opts.out.replace(/\.mp4$/, `_apercu_${t}s.png`);
        await page.screenshot({ path: file });
        console.log(`  aperçu → ${file}`);
      }
      return;
    }

    if (!ffmpegPath) throw new Error("ffmpeg-static n'a pas de binaire pour cette plateforme.");
    const duration = await page.evaluate(() => (window as unknown as { DURATION: number }).DURATION);
    const frames = Math.round(duration * FPS);
    // Format Reels : H.264 High, yuv420p, 30 i/s, 1080×1920, BT.709, faststart.
    // Piste audio AAC muette : certaines applications refusent une vidéo sans
    // piste son, et Instagram en pose une (la musique) par-dessus de toute façon.
    const ffmpeg = spawn(ffmpegPath, [
      "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-map", "0:v", "-map", "1:a", "-shortest",
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", opts.out,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    ffmpeg.stderr.on("data", (d) => { stderr += d; });
    const done = new Promise<void>((resolve, reject) => {
      ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg a échoué (${code}) :\n${stderr.slice(-2000)}`))));
    });

    for (let i = 0; i < frames; i++) {
      await page.evaluate((x) => (window as unknown as { setTime(t: number): void }).setTime(x), i / FPS);
      const png = await page.screenshot({ type: "png" });
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (i % FPS === 0) process.stdout.write(`\r  rendu ${Math.round((i / frames) * 100)} %`);
    }
    ffmpeg.stdin.end();
    await done;
    process.stdout.write(`\r  rendu 100 % (${frames} images, ${duration.toFixed(1)} s)\n`);
  } finally {
    await browser.close();
  }
}

/** Arguments `--cle valeur` et drapeaux `--cle` de la ligne de commande. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { out[a.slice(2)] = next; i++; }
    else out[a.slice(2)] = true;
  }
  return out;
}
