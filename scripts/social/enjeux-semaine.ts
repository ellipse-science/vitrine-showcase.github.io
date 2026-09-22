// Reel Instagram du module « Les 12 enjeux » — évolution du classement pendant
// les sept derniers jours.
//
//   npm run reel:enjeux-semaine
//   npm run reel:enjeux-semaine -- --mp4
//   npm run reel:enjeux-semaine -- --edition 2026-09-17T15
//
// Les parts d'attention, les rangs quotidiens et les actualités viennent du même
// loader que la page (`loadTreemap`). Le Reel ne recalcule aucun résultat à
// partir d'une autre source et ne contient aucun chiffre écrit à la main.

import fs from "node:fs/promises";
import path from "node:path";

import { libelleEnjeuCourt } from "@/lib/enjeux";
import { loadTreemap, type TreemapIssueTile } from "@/lib/data/headlineEvents";
import { MODULES } from "@/lib/modules";
import { jourMontreal, rankMovement, rankPointsForPeriod } from "@/lib/treemapRank";

import { captionTypo, footerEdition, pubHourLabel, resolveEdition } from "./lib/commun";
import { DECALE, CONTENT_TOP, COL, FORMAT,
  COLORS, FIN_CSS, INTRO_CSS, buildPage, chargerPartenaires, enjeuGlyph, esc,
  frNum, loadLogos, parseArgs, produce, sceneFin, sceneIntro, txt, type Scene,
} from "./lib/reel";

const MODULE = MODULES["enjeux-saillants"];
const HASHTAGS = ["#VitrineDémocratique", "#12Enjeux", "#polqc", "#QC2026"];

const COURSE_PRE = 1;
const COURSE_STEP = 1.15;
const COURSE_HOLD = .34;
const ROW_STEP = 62;

const CSS = `
.kick{font-size:28px;color:var(--softer)}

/* Accroche commune : une miniature du classement réel de la semaine. */
/* La miniature remonte : à 72 px du bas, elle passait sous la légende et la barre
   de navigation d'Instagram en plein écran (mesuré au simulateur, 17-09). */
#intro .mini-ranks{position:absolute;left:46px;right:46px;bottom:40px;height:min(430px,calc(var(--vis-h,470px) - 40px))}
#intro .mini-ranks svg{display:block;width:100%;height:100%;overflow:visible}
@keyframes traceRank{to{stroke-dashoffset:0}}

/* Classement animé : les douze lignes changent réellement de place chaque jour. */
#course .head{position:absolute;left:${COL}px;right:${COL}px;top:${CONTENT_TOP + 8}px}
#course h2{font-size:70px;line-height:1.02;margin-top:12px}
#course .day{position:absolute;left:${COL}px;right:${COL}px;top:${500 + DECALE}px;display:flex;align-items:baseline;justify-content:space-between;border-top:3px solid var(--ink);padding-top:14px}
#course .day strong{font-family:"Playfair Display",serif;font-size:42px;line-height:1}
#course .day span{font-size:28px;color:var(--soft)}
#course .board{position:absolute;left:${COL}px;right:${COL}px;top:${570 + DECALE}px;height:744px}
#course .runner{position:absolute;left:0;right:0;top:0;height:54px;box-shadow:0 0 0 0 rgba(28,25,23,0);transition:none;display:grid;grid-template-columns:54px 44px minmax(0,1fr) 84px;align-items:center;gap:12px;padding:0 14px 0 10px;border-left:9px solid var(--c);background:color-mix(in srgb,var(--c) 10%,var(--paper));will-change:transform}
#course .place{font-family:"Playfair Display",serif;font-weight:900;font-size:36px;line-height:1;text-align:center}
#course .ico{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--c)}
#course .name{font-family:"Playfair Display",serif;font-weight:700;font-size:30px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#course .delta{font-family:"IBM Plex Mono",monospace;font-size:28px;text-align:right;color:var(--c)}
#course .note{position:absolute;left:${COL}px;right:${COL}px;top:${1350 + DECALE}px;font-size:30px;line-height:1.2;color:var(--soft);font-style:italic}

/* Bilan : un résultat principal et les six déplacements les plus grands. */
#bilan .head{position:absolute;left:${COL}px;right:${COL}px;top:${CONTENT_TOP + 8}px}
#bilan h2{font-size:72px;line-height:1.02;margin-top:12px}
#bilan .body{position:absolute;left:${COL}px;right:${COL}px;top:${492 + DECALE}px;height:810px}
#bilan .leader{height:156px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:6px solid var(--c);border-bottom:2px solid var(--rule);padding:18px 8px 18px 0}
#bilan .leader-name{display:grid;grid-template-columns:62px minmax(0,1fr);align-items:center;gap:16px;min-width:0}
#bilan .leader-icon{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--c)}
#bilan .leader-name b{display:block;font-family:"Playfair Display",serif;font-size:40px;line-height:1}
#bilan .leader-name span{display:block;font-size:28px;color:var(--soft);margin-top:7px}
#bilan .share{flex:none;text-align:right}
#bilan .share b{display:block;font-family:"Playfair Display",serif;font-weight:900;font-size:78px;line-height:.85;color:var(--c)}
#bilan .share span{display:block;font-size:28px;line-height:1.05;margin-top:8px;color:var(--soft)}
#bilan .sub{font-size:28px;color:var(--soft);margin:22px 0 10px}
#bilan .movers{display:flex;flex-direction:column;gap:10px}
#bilan .mover{height:88px;display:grid;grid-template-columns:50px minmax(0,1fr) 150px 92px;align-items:center;gap:14px;padding:0 14px 0 10px;border-left:9px solid var(--c);background:color-mix(in srgb,var(--c) 9%,var(--paper))}
#bilan .mover-icon{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--c)}
#bilan .mover-name{font-family:"Playfair Display",serif;font-weight:700;font-size:32px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#bilan .route{font-size:28px;color:var(--soft);text-align:right}
#bilan .move{font-family:"IBM Plex Mono",monospace;font-size:34px;text-align:right;color:var(--c)}
#bilan .note{position:absolute;left:${COL}px;right:${COL}px;top:${1334 + DECALE}px;font-size:30px;line-height:1.2;color:var(--soft);font-style:italic}
`;

const fmtDate = (iso: string) => new Intl.DateTimeFormat("fr-CA", {
  timeZone: "UTC", weekday: "short", day: "numeric", month: "short",
}).format(new Date(`${iso}T12:00:00Z`)).replace(/\.$/, "");

const fmtRank = (rank: number) => rank === 1 ? "1er" : `${rank}e`;

function miniRanks(tiles: TreemapIssueTile[], points: ReturnType<typeof rankPointsForPeriod>): string {
  const width = 720, height = 470, left = 18, right = 702;
  const x = (i: number) => left + i * ((right - left) / Math.max(1, points.length - 1));
  const y = (rank: number) => 15 + (rank - 1) * ((height - 30) / 11);
  const lines = tiles.map((tile, index) => {
    const d = points.map((point, i) => `${x(i).toFixed(1)},${y(point.ranks[tile.issueKey] ?? 12).toFixed(1)}`).join(" ");
    return `<polyline points="${d}" pathLength="1" fill="none" stroke="${tile.color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1" style="animation:traceRank 1.2s ${.7 + index * .05}s forwards"/>`;
  }).join("");
  return `<div class="mini-ranks"><svg viewBox="0 0 ${width} ${height}">${lines}</svg></div>`;
}

function sceneCourse(tiles: TreemapIssueTile[], points: ReturnType<typeof rankPointsForPeriod>, rangeLabel: string): Scene {
  const last = points.at(-1)!;
  const rows = [...tiles]
    .sort((a, b) => (last.ranks[a.issueKey] ?? 12) - (last.ranks[b.issueKey] ?? 12))
    .map((tile, i) => {
      const movement = rankMovement(points, tile.issueKey);
      const delta = movement.delta === 0 ? "=" : `${movement.delta > 0 ? "↑" : "↓"} ${Math.abs(movement.delta)}`;
      const startRank = points[0].ranks[tile.issueKey] ?? 12;
      return `<div class="runner" data-key="${esc(tile.issueKey)}" style="--c:${tile.color};transform:translateY(${(startRank - 1) * ROW_STEP}px);animation:fadeIn .35s ${.18 + i * .035}s both">
        <span class="place">${startRank}</span>
        <span class="ico">${enjeuGlyph(tile.issueKey, COLORS.paper, 30)}</span>
        <span class="name">${txt(libelleEnjeuCourt(tile.issueFr))}</span>
        <span class="delta">${delta}</span>
      </div>`;
    }).join("");

  return {
    id: "course",
    duration: COURSE_PRE + (points.length - 1) * COURSE_STEP + 1.8,
    html: `
      <div class="head">
        <div class="kick mono" style="animation:fadeIn .5s .1s both">Les 12 enjeux · ${txt(rangeLabel)}</div>
        <h2 class="disp" style="animation:fadeUp .6s .15s both">Le classement, jour après jour</h2>
      </div>
      <div class="day"><strong>${txt(fmtDate(jourMontreal(points[0])))}</strong><span class="mono">Jour 1 sur ${points.length}</span></div>
      <div class="board" data-cle>${rows}</div>
      <p class="note">Le rang 1 désigne l’enjeu qui occupe la plus grande part de l’attention médiatique ce jour-là.</p>`,
  };
}

function sceneBilan(tiles: TreemapIssueTile[], points: ReturnType<typeof rankPointsForPeriod>): Scene {
  const last = points.at(-1)!;
  const leader = [...tiles].sort((a, b) => (last.ranks[a.issueKey] ?? 12) - (last.ranks[b.issueKey] ?? 12))[0];
  const joursEnTete = points.filter((point) => point.ranks[leader.issueKey] === 1).length;
  const mouvements = tiles
    .map((tile) => ({ tile, ...rankMovement(points, tile.issueKey) }))
    .filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.endRank - b.endRank)
    .slice(0, 6);
  const rows = mouvements.map(({ tile, startRank, endRank, delta }, i) => `
    <div class="mover" style="--c:${tile.color};animation:fadeUp .45s ${.75 + i * .13}s both">
      <span class="mover-icon">${enjeuGlyph(tile.issueKey, COLORS.paper, 32)}</span>
      <span class="mover-name">${txt(libelleEnjeuCourt(tile.issueFr))}</span>
      <span class="route mono">${fmtRank(startRank)} → ${fmtRank(endRank)}</span>
      <b class="move">${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)}</b>
    </div>`).join("");

  return {
    id: "bilan", duration: 5.8,
    html: `
      <div class="head">
        <div class="kick mono" style="animation:fadeIn .5s .1s both">Bilan des sept derniers jours</div>
        <h2 class="disp" style="animation:fadeUp .6s .15s both">Les mouvements marquants</h2>
      </div>
      <div class="body" data-cle>
        <div class="leader" style="--c:${leader.color};animation:fadeUp .55s .35s both">
          <div class="leader-name"><span class="leader-icon">${enjeuGlyph(leader.issueKey, COLORS.paper, 42)}</span><div><b>${txt(leader.issueFr)}</b><span>En tête ${joursEnTete} jour${joursEnTete > 1 ? "s" : ""} sur ${points.length}</span></div></div>
          <div class="share"><b>${frNum(leader.share, 0)}&nbsp;%</b><span>de l’attention<br>de la semaine</span></div>
        </div>
        <div class="sub mono">Six déplacements à retenir</div>
        <div class="movers">${rows}</div>
      </div>
      <p class="note">La part d’attention additionne la saillance des actualités associées à chaque enjeu.</p>`,
  };
}

function scriptCourse(points: ReturnType<typeof rankPointsForPeriod>, tiles: TreemapIssueTile[]): string {
  const data = {
    dates: points.map((point) => fmtDate(jourMontreal(point))),
    rows: tiles.map((tile) => ({ key: tile.issueKey, ranks: points.map((point) => point.ranks[tile.issueKey] ?? 12) })),
  };
  return `
const COURSE=${JSON.stringify(data)};
window.onSceneTime=function(id,t){
  if(id!=="course")return;
  const raw=Math.max(0,(t-${COURSE_PRE})/${COURSE_STEP});
  const from=Math.min(COURSE.dates.length-1,Math.floor(raw));
  const to=Math.min(COURSE.dates.length-1,from+1);
  const phase=raw-from;
  const p=Math.max(0,Math.min(1,(phase-${COURSE_HOLD})/(1-${COURSE_HOLD})));
  const ease=p*p*(3-2*p);
  const active=ease<.5?from:to;
  const strong=document.querySelector("#course .day strong");
  const count=document.querySelector("#course .day span");
  if(strong)strong.textContent=COURSE.dates[active];
  if(count)count.textContent="Jour "+(active+1)+" sur "+COURSE.dates.length;
  COURSE.rows.forEach(function(row){
    const el=document.querySelector('#course .runner[data-key="'+row.key+'"]');
    if(!el)return;
    const rank=row.ranks[from]+(row.ranks[to]-row.ranks[from])*ease;
    el.style.transform="translateY("+((rank-1)*${ROW_STEP})+"px)";
    const place=el.querySelector(".place");if(place)place.textContent=String(row.ranks[active]);
    // Celle qui bouge passe DEVANT les autres, et se détache le temps du
    // dépassement : sans ça, deux lignes qui se croisent se lisent l'une sur
    // l'autre (relevé le 17-09 dans le simulateur).
    const saut=Math.abs(row.ranks[to]-row.ranks[from]);
    const bouge=saut>0?Math.sin(Math.max(0,Math.min(1,ease))*Math.PI):0;
    el.style.zIndex=String(2+Math.round(saut*10*bouge));
    el.style.boxShadow=bouge>.05?("0 "+(6*bouge).toFixed(1)+"px "+(22*bouge).toFixed(1)+"px rgba(28,25,23,"+(.28*bouge).toFixed(2)+")"):"none";
  });
};`;
}

function caption(tiles: TreemapIssueTile[], points: ReturnType<typeof rankPointsForPeriod>, rangeLabel: string): string {
  const last = points.at(-1)!;
  const leader = [...tiles].sort((a, b) => (last.ranks[a.issueKey] ?? 12) - (last.ranks[b.issueKey] ?? 12))[0];
  const mouvements = tiles
    .map((tile) => ({ tile, ...rankMovement(points, tile.issueKey) }))
    .filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.endRank - b.endRank)
    .slice(0, 3);
  const lignes = mouvements.map(({ tile, startRank, endRank, delta }) =>
    `· ${tile.issueFr} : ${fmtRank(startRank)} → ${fmtRank(endRank)} (${delta > 0 ? "+" : "−"}${Math.abs(delta)} rang${Math.abs(delta) > 1 ? "s" : ""})`);
  return captionTypo([
    `Comment les enjeux ont-ils évolué cette semaine? · ${rangeLabel}`,
    `${leader.issueFr} termine au premier rang avec ${frNum(leader.share, 0)} % de l’attention médiatique de la semaine.`,
    ...lignes,
    "Le classement suit la part de saillance des actualités associées aux douze enjeux, jour après jour.",
    "Explorez les trajectoires et les actualités : vitrinedemocratique.com",
    HASHTAGS.join(" "),
  ].join("\n\n")) + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { edition } = await resolveEdition(args);
  const data = await loadTreemap(edition.key, edition.navDateIso);
  if (!data) throw new Error(`Données des enjeux indisponibles à l’édition ${edition.key}.`);
  const points = rankPointsForPeriod(data.week.history, "week");
  if (points.length < 2) throw new Error(`Pas assez de jours pour raconter l’évolution hebdomadaire à l’édition ${edition.key}.`);
  const firstDay = jourMontreal(points[0]);
  const lastDay = jourMontreal(points.at(-1)!);
  const rangeLabel = `du ${fmtDate(firstDay)} au ${fmtDate(lastDay)}`;
  const logos = await loadLogos();

  const scenes: Scene[] = [
    sceneIntro({
      logo: logos.vitrine,
      module: MODULE.nom,
      accent: MODULE.accent,
      lignes: MODULE.lignes,
      visuel: miniRanks(data.week.tiles, points),
      edition: `${rangeLabel} · Édition de ${pubHourLabel(edition)}`,
    }),
    sceneCourse(data.week.tiles, points, rangeLabel),
    sceneBilan(data.week.tiles, points),
    sceneFin({
      pubHour: edition.pubHour,
      signature: "Les 12 enjeux, jour après jour",
      logo: logos.vitrine,
      accent: MODULE.accent,
      partenaires: await chargerPartenaires(),
    }),
  ];

  const html = buildPage({
    title: `Évolution des enjeux · ${edition.key}`,
    css: CSS + INTRO_CSS + FIN_CSS,
    scenes,
    script: scriptCourse(points, data.week.tiles),
    theme: { paper: MODULE.papier, accent: MODULE.accent },
    logos,
    footerLeft: "La Vitrine démocratique",
    footerRight: footerEdition(edition),
  });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, `enjeux-semaine_${edition.navDateIso}_${edition.pubHour % 24}h${FORMAT === "instagram" ? "" : `_${FORMAT}`}`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${base}_instagram.txt`, caption(data.week.tiles, points, rangeLabel));
  console.log(`Évolution des enjeux · ${rangeLabel} · édition de ${pubHourLabel(edition)}`);
  console.log(`  instagram → ${path.basename(base)}_instagram.txt`);
  await produce({ html, scenes, title: `Évolution des enjeux · ${rangeLabel}`, base, args });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
