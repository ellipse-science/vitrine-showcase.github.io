// Reel Instagram du module 2 — Deux solitudes : le Québec et le Canada anglais
// regardent-ils la même journée ?
//
//   npm run reel:deux-solitudes                      # aperçu animé (navigateur)
//   npm run reel:deux-solitudes -- --mp4             # la vidéo, après validation
//   npm run reel:deux-solitudes -- --edition 2026-09-16T15
//
// UN SEUL PLAN, PAS DES SLIDES (décision de Jules Piral et d'Adrien, 2026-09-16,
// fil #02_vitrine_comm) : le radar tourne d'un bout à l'autre du reel, comme un
// sonar, et chaque passage du balayage « détecte » un sujet — deux points sur
// son axe, le rouge pour la part d'attention du Canada anglais, le bleu pour
// celle du Québec. Quand les six sujets sont détectés, on relie les points : les
// deux solitudes apparaissent d'elles-mêmes.
//
// LE BALAYAGE EST SYNCHRONE. Un tour dure TOUR secondes et il y a autant d'axes
// que de sujets : le sujet k est détecté à T0 + k·(TOUR + TOUR/n), c'est-à-dire
// exactement quand le rayon passe sur son axe. Changer TOUR ou l'ordre des axes
// sans refaire ce calcul casse l'effet — le point apparaîtrait à côté du rayon.
//
// LES DONNÉES VIENNENT DU LOADER DU SITE (`loadHeadlineEvents` → `solitudes`) :
// mêmes axes, mêmes parts d'attention, même chiffre de convergence que la page.

import fs from "node:fs/promises";
import path from "node:path";

import { COULEUR_ENJEU_DEFAUT, ISSUE_COLORS } from "@/lib/enjeux";
import {
  listEditions, loadHeadlineEvents,
  type EditionRef, type SolitudeAxis, type SolitudeData,
} from "@/lib/data/headlineEvents";
import { MODULES } from "@/lib/modules";

import { footerEdition } from "./lib/commun";
import {
  COLORS, FIN_CSS, INTRO_CSS, SALIENCE_COLORS, buildPage, chargerPartenaires, enjeuGlyph, esc, fleur, parseArgs, produce, RESERVE_BAS,
  sceneFin, sceneIntro, loadLogos, txt, type Scene,
} from "./lib/reel";

/** Identité du module : couleur, nom et lignes d'accroche (lib/modules.ts). */
const MODULE = MODULES["deux-solitudes"];

/** Mots-clics ajoutés à la légende. À ajuster par l'équipe des réseaux. */
const HASHTAGS = ["#polqc", "#QC2026", "#VitrineDémocratique"];

/** Niveau de saillance : la classe du site dit le rang, le rang dit la couleur. */
const RANK_BY_CLS: Record<string, number> = {
  "s-tres-faible": 1, "s-faible": 2, "s-moyenne": 3,
  "s-eleve": 4, "s-tres-eleve": 5, "s-extreme": 6,
};

// Minutage du sonar, en secondes de base (étirées par SLOW au rendu).
const T0 = 1.8;    // le temps de lire le titre avant la première détection
const TOUR = 2.1;  // un tour de balayage — six sujets en ~15 s
const OUTRO = 2.2; // les polygones, puis le chiffre de convergence

const bandOf = (rank: number) => SALIENCE_COLORS[rank] ?? { bg: COLORS.rule, fg: COLORS.ink };
const couleur = (a: SolitudeAxis) => (a.issueKey ? ISSUE_COLORS[a.issueKey] ?? COULEUR_ENJEU_DEFAUT : COULEUR_ENJEU_DEFAUT);

/** Logo de la Vitrine (même fichier que les cartes de partage). */
async function loadLogo(): Promise<string | null> {
  try {
    const png = await fs.readFile(path.resolve(process.cwd(), "public", "images", "brand", "logo_vitrinedemocratique_bg-none_theme-black.png"));
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    console.warn("  logo introuvable : scène de fin sans logo.");
    return null;
  }
}

const CSS = `
.kick{font-size:30px;color:var(--softer)}

/* Le sonar : un seul plan, du début à la fin */
#sonar .head{position:absolute;top:282px;left:180px;right:180px}
#sonar .kick{display:flex;align-items:center;gap:18px}
#sonar .kick i{display:block;width:70px;height:8px;transform-origin:left}
#sonar .chart{position:absolute;left:180px;right:180px;top:430px;height:600px}
#sonar .chart > svg{position:absolute;left:0;top:0;width:100%;height:100%}
#sonar .vx{position:absolute;width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--paper)}
#sonar .zone{position:absolute;left:180px;right:180px;top:1046px;bottom:${RESERVE_BAS}px}
#sonar .carte{position:absolute;left:0;right:0;top:0}
#sonar .carte .t{font-size:44px;line-height:1.06;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#sonar .bars{margin-top:18px;display:flex;flex-direction:column;gap:14px}
#sonar .bar{display:flex;align-items:center;gap:18px;font-size:28px}
#sonar .bar em{font-style:normal;width:128px;flex:none;color:var(--soft)}
#sonar .bar i{display:block;height:30px;transform-origin:left}
#sonar .bar b{font-family:"IBM Plex Mono",monospace;font-size:44px;font-weight:500;line-height:1}
#sonar .conv{position:absolute;left:0;right:0;bottom:0;border-top:3px solid var(--ink);padding-top:22px;display:flex;align-items:center;gap:26px}
#sonar .conv b{font-family:"Playfair Display",serif;font-weight:900;font-size:110px;line-height:.86}
#sonar .conv span{font-size:30px;font-style:italic;color:var(--soft);line-height:1.3}
#sonar .conv u{text-decoration:none;font-style:normal;font-family:"IBM Plex Mono",monospace;font-size:28px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink)}
#intro .mini{position:absolute;left:50%;bottom:40px;width:620px;transform:translateX(-50%)}
@keyframes tourne{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes carte{0%,3%{opacity:0;transform:translateY(26px)}9%,88%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-14px)}}
@keyframes ping{from{transform:scale(.2);opacity:0}60%{transform:scale(1.25);opacity:1}to{transform:scale(1);opacity:1}}
@keyframes estompe{to{opacity:.32}}
@keyframes veille{to{opacity:.5}}
@keyframes eteint{to{opacity:0}}
`;

const anim = (name: string, dur: number, delay: number) => `style="animation:${name} ${dur}s ${delay}s both"`;

function sceneSonar(sol: SolitudeData, edition: EditionRef): Scene {
  const axes = sol.axes;
  const n = axes.length;
  const CX = 420, CY = 352, R = 288;
  const at = (i: number, f: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [CX + R * f * Math.cos(a), CY + R * f * Math.sin(a)] as const;
  };
  // Détection du sujet k : un tour complet plus le temps d'arriver sur son axe.
  const detect = (k: number) => T0 + k * (TOUR + TOUR / n);
  const fin = detect(n - 1) + TOUR / n;

  const rings = [.25, .5, .75, 1].map((f) =>
    `<circle cx="${CX}" cy="${CY}" r="${R * f}" fill="none" stroke="${COLORS.rule}" stroke-width="${f === 1 ? 3 : 1.5}"${f === 1 ? "" : ' stroke-dasharray="6 12"'}/>`).join("");
  const spokes = axes.map((_, i) => {
    const [px, py] = at(i, 1);
    return `<line x1="${CX}" y1="${CY}" x2="${px}" y2="${py}" stroke="${COLORS.rule}" stroke-width="1.5" opacity=".6"/>`;
  }).join("");

  // Le rayon et sa traîne, en rotation continue : c'est lui qui donne le rythme.
  const a0 = -Math.PI / 2, a1 = a0 + Math.PI / 5;
  const pt = (a: number, f = 1) => `${CX + R * f * Math.cos(a)},${CY + R * f * Math.sin(a)}`;
  const balayage = `
    <g style="transform-box:view-box;transform-origin:${CX}px ${CY}px;animation:tourne ${TOUR}s linear infinite">
      <path d="M${CX},${CY} L${pt(a0)} A${R},${R} 0 0 0 ${pt(a1 - 2 * (a1 - a0))} Z" fill="${COLORS.blue}" opacity=".12"/>
      <line x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R}" stroke="${COLORS.blue}" stroke-width="4" opacity=".85"/>
    </g>`;

  // UN SUJET À LA FOIS, SINON ON S'Y PERD (retour d'Adrien, 2026-09-16 : « les
  // points qui apparaissent, c'est cool, mais un peu mêlant »). Pendant sa
  // fenêtre, le sujet détecté tient tout : sa tranche du radar s'éclaire, son
  // rayon s'épaissit, ses deux points sont pleins. Dès le sujet suivant, tout
  // ça s'estompe — les points restent, en retrait, pour que les deux formes se
  // dessinent à la fin.
  const off = (k: number) => (k < n - 1 ? detect(k + 1) : fin + .2);
  const enVeille = (k: number, nom: string, dur = .35) => `${nom} ${dur}s ${off(k)}s forwards`;
  const h = Math.PI / n;
  const tranches = axes.map((a, k) => {
    const ang = -Math.PI / 2 + (k * 2 * Math.PI) / n;
    const p = (x: number) => `${CX + R * Math.cos(x)},${CY + R * Math.sin(x)}`;
    const col = a.side === "qc" ? COLORS.blue : COLORS.red;
    return `<path d="M${CX},${CY} L${p(ang - h)} A${R},${R} 0 0 1 ${p(ang + h)} Z" fill="${col}" fill-opacity=".13" style="animation:fadeIn .3s ${detect(k)}s both,${enVeille(k, "eteint", .4)}"/>`;
  }).join("");
  const rayons = axes.map((a, k) => {
    const [px, py] = at(k, 1);
    const col = a.side === "qc" ? COLORS.blue : COLORS.red;
    return `<line x1="${CX}" y1="${CY}" x2="${px}" y2="${py}" stroke="${col}" stroke-width="4" style="animation:fadeIn .3s ${detect(k)}s both,${enVeille(k, "eteint", .4)}"/>`;
  }).join("");
  const points = axes.map((a, k) => {
    const d = detect(k);
    const dot = (radial: number, col: string, delay: number) => {
      if (radial <= 0) return "";
      const [px, py] = at(k, Math.min(100, radial) / 100);
      return `<circle cx="${px}" cy="${py}" r="15" fill="${col}" style="transform-box:fill-box;transform-origin:center;animation:ping .45s ${delay}s both,${enVeille(k, "estompe")}"/>`;
    };
    return dot(a.canRadial, COLORS.red, d) + dot(a.qcRadial, COLORS.blue, d + .1);
  }).join("");

  // Pastilles d'enjeu au bout des axes (HTML : le pictogramme du site est un
  // <svg> complet, qui ne s'affiche pas imbriqué dans un autre <svg>).
  const vertices = axes.map((a, k) => {
    const [px, py] = at(k, 1.15);
    const col = a.side === "qc" ? COLORS.blue : COLORS.red;
    return `<div class="vx" style="left:${px - 31}px;top:${py - 31}px;background:${col};animation:ping .45s ${detect(k)}s both,${enVeille(k, "veille", .4)}">${enjeuGlyph(a.issueKey, COLORS.paper, 34)}</div>`;
  }).join("");

  // Les six sujets détectés, on relie les points : les deux formes apparaissent.
  const shape = (pick: (a: SolitudeAxis) => number) =>
    axes.map((a, i) => at(i, Math.min(100, pick(a)) / 100).join(",")).join(" ");
  const forme = (pts: string, col: string, fill: string, delay: number) =>
    `<polygon points="${pts}" fill="${fill}" stroke="${col}" stroke-width="5" stroke-linejoin="round" style="animation:fadeIn .7s ${delay}s both"/>`;

  // Une carte par détection, toutes au même endroit : le sonar reste maître de
  // l'écran, la carte ne fait que nommer ce qu'il vient de trouver.
  const maxShare = Math.max(...axes.flatMap((a) => [a.canShare, a.qcShare]), 1);
  const w = (v: number) => Math.max(v > 0 ? 10 : 0, (v / maxShare) * 380);
  // MOINS DE STOCK (Jules Piral, 2026-09-16 : « ya trop d'information, j'arrive
  // pas à tout lire […] ce qui est important c'est les titres et la distinction
  // qc/can »). Une carte = UN TITRE et DEUX BARRES. Sont partis : l'enjeu, le
  // niveau de saillance, les médias couvrants, le compteur de sujets et la note
  // de bas de scène. Ils restent sur le site, où on a le temps de lire.
  const cartes = axes.map((a, k) => {
    const d = detect(k);
    const bar = (lab: string, v: number, col: string, delay: number) =>
      `<div class="bar"><em class="mono">${lab}</em><i style="width:${w(v)}px;background:${col};animation:grow .5s ${delay}s both"></i><b style="color:${col}">${v}&nbsp;%</b></div>`;
    return `<div class="carte" style="animation:carte ${TOUR + TOUR / n}s ${d}s both">
      <div class="t pf">${txt(a.label)}</div>
      <div class="bars">${bar("Canada", a.canShare, COLORS.red, d + .3)}${bar("Québec", a.qcShare, COLORS.blue, d + .45)}</div>
    </div>`;
  }).join("");

  return {
    id: "sonar", duration: fin + OUTRO + 3.4,
    html: `
      <div class="head">
        <div class="kick mono" ${anim("fadeIn", .5, .1)}><i style="background:${MODULE.accent};animation:grow .5s .1s both"></i>Six sujets · Édition de ${edition.pubHour % 24}h</div>
      </div>
      <div class="chart" data-cle>
        <svg viewBox="0 0 840 720">
          <g ${anim("fadeIn", .6, .5)}>${rings}${spokes}</g>
          ${tranches}${rayons}
          ${balayage}
          ${forme(shape((a) => a.canRadial), COLORS.red, "rgba(168,48,44,.15)", fin + .2)}
          ${forme(shape((a) => a.qcRadial), COLORS.blue, "rgba(34,79,125,.18)", fin + .8)}
          ${points}
        </svg>
        ${vertices}
      </div>
      <div class="zone">
        ${cartes}
        <div class="conv" ${anim("fadeUp", .6, fin + OUTRO)}>
          <b style="color:${COLORS.blue}">${sol.convPct}&nbsp;%</b>
          <span>de convergence<br><u>${sol.relDiffPct}&nbsp;% ${txt(sol.relLabel)}</u></span>
        </div>
      </div>`,
  };
}

function caption(edition: EditionRef, sol: SolitudeData): string {
  const can = sol.axes.filter((a) => a.side === "can").slice(0, 3);
  const qc = sol.axes.filter((a) => a.side === "qc").slice(0, 3);
  const ligne = (a: SolitudeAxis) => `· ${a.label} — Canada ${a.canShare} %, Québec ${a.qcShare} %`;
  const lines = [
    `Le Québec et le Canada anglais regardent-ils la même journée ? · Édition de ${edition.pubHour % 24}h, ${edition.dateLabel.toLowerCase()}`,
    "",
    `Aujourd’hui : ${sol.convPct} % de convergence, ${sol.relDiffPct} % ${sol.relLabel}.`,
    sol.edito,
    ...(qc.length ? ["", "Ce que le Québec avait en Une :", ...qc.map(ligne)] : []),
    ...(can.length ? ["", "Ce que le Canada anglais avait en Une :", ...can.map(ligne)] : []),
    "",
    "Les deux agendas, côte à côte, six fois par jour : vitrinedemocratique.com",
    "",
    HASHTAGS.join(" "),
  ];
  return lines.join("\n").replace(/[ \t]*:(?=\s|$)/gm, " :").replace(/[ \t]*%/g, " %") + "\n";
}

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
  const sol = data?.solitudes;
  if (!sol || sol.axes.length < 3) throw new Error(`Pas assez d'axes pour le radar à l'édition ${edition.key}.`);
  const logo = await loadLogo();
  console.log(`Deux solitudes · ${edition.key} (édition de ${edition.pubHour % 24}h, ${edition.dateLabel})`);
  console.log(`  convergence : ${sol.convPct} % — ${sol.relDiffPct} % ${sol.relLabel}`);

  // Visuel d'accroche du module 2 : le radar en ombre, dans le bandeau d'encre.
  const visuel = (() => {
    const cercles = [.34, .67, 1].map((f) =>
      `<circle cx="240" cy="250" r="${150 * f}" fill="none" stroke="${COLORS.paper}" stroke-width="2" opacity=".35"/>`).join("");
    const forme = (pick: (a: SolitudeAxis) => number, col: string, delay: number) =>
      `<polygon points="${sol.axes.map((a, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sol.axes.length;
        const r = 150 * Math.min(100, pick(a)) / 100;
        return `${240 + r * Math.cos(ang)},${250 + r * Math.sin(ang)}`;
      }).join(" ")}" fill="${col}" fill-opacity=".45" stroke="${col}" stroke-width="4" style="animation:fadeIn .8s ${delay}s both"/>`;
    return `<svg class="mini" viewBox="0 0 480 500">${cercles}${forme((a) => a.canRadial, COLORS.red, 1.5)}${forme((a) => a.qcRadial, COLORS.blue, 1.9)}</svg>`;
  })();

  const scenes = [
    sceneIntro({
      logo, module: MODULE.nom, accent: MODULE.accent, lignes: MODULE.lignes, visuel,
      edition: `Édition de ${edition.pubHour % 24}h · ${edition.dateLabel}`,
    }),
    sceneSonar(sol, edition),
    sceneFin({ pubHour: edition.pubHour, signature: "Deux solitudes, une seule journée", logo, accent: MODULE.accent, partenaires: await chargerPartenaires(), date: footerEdition(edition) }),
  ];

  const html = buildPage({
    title: `Deux solitudes · ${edition.key}`,
    css: CSS + INTRO_CSS + FIN_CSS, scenes,
    theme: { paper: MODULE.papier, accent: MODULE.accent },
    logos: await loadLogos(),
    footerLeft: "La Vitrine démocratique",
    footerRight: footerEdition(edition),
  });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, `deux-solitudes_${edition.navDateIso}_${edition.pubHour % 24}h`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${base}.txt`, caption(edition, sol));
  console.log(`  légende → ${base}.txt`);

  await produce({ html, scenes, title: `Deux solitudes · édition de ${edition.pubHour % 24}h`, base, args });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
