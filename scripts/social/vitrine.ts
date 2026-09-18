// Reel de PRÉSENTATION de la Vitrine : les six modules, un par un.
//
//   npm run reel:vitrine                 # aperçu animé (navigateur)
//   npm run reel:vitrine -- --mp4        # la vidéo, après l'aperçu
//
// MESSAGE (Jules Piral, 2026-09-16) : « 6 modules pour mieux comprendre la
// démocratie au Québec ». Ce reel EXPLIQUE plus qu'il ne montre de résultats :
// chaque module dit la question à laquelle il répond et ce qu'on trouve sur le
// site, dans sa couleur (lib/modules.ts). Aucune donnée du jour : les visuels
// sont des SCHÉMAS du module, sans chiffre, pour que le reel reste vrai d'une
// édition à l'autre et qu'aucun dessin ne se lise comme un résultat.
//
// Les phrases sur la collecte reprennent le pied de page du site
// (static-content/bottom.html) et le rappel commun (lib/post.ts).
//
// Gabarit commun : scripts/social/GABARIT.md (section 5).

import fs from "node:fs/promises";
import path from "node:path";

import { ISSUE_COLORS } from "@/lib/enjeux";
import { MODULES, type CleModule } from "@/lib/modules";
import { PARTY_COLORS, PARTY_KEYS, PARTY_LABELS } from "@/lib/data/parties";

import { captionTypo } from "./lib/commun";
import { HASHTAGS as HASHTAGS_UNE } from "./lib/post";
import {
  COLORS, FIN_CSS, SALIENCE_COLORS, buildPage, celestial, chargerPartenaires, enjeuGlyph, esc, fleur, loadLogos, logoAnime, parseArgs, produce, RESERVE_BAS, sceneFin, typo,
  type Scene,
} from "./lib/reel";

const anim = (name: string, dur: number, delay: number) => `animation:${name} ${dur}s ${delay}s both`;
const t = (s: string) => typo(esc(s));

// ── Ce que dit chaque module ────────────────────────────────────────────────
// Une QUESTION (ce à quoi le module répond, en français courant) et une phrase
// « sur le site » (ce qu'on y trouve). Règle #7 : à relire avant publication.
const ORDRE: CleModule[] = [
  "une-des-unes", "deux-solitudes", "enjeux-saillants", "partis-et-couverture", "polimetre-plus", "assemblee-nationale",
];

const TEXTES: Record<CleModule, { question: string; site: string }> = {
  "une-des-unes": {
    question: "Quelle nouvelle domine l’actualité au Québec en ce moment?",
    site: "Les nouvelles à la Une et leur saillance, de très faible à exceptionnelle.",
  },
  "deux-solitudes": {
    question: "Le Québec et le Canada anglais parlent-ils des mêmes sujets?",
    site: "Le radar des sujets qui retiennent l’attention au Québec et au Canada anglais.",
  },
  "enjeux-saillants": {
    question: "Quels enjeux occupent l’espace médiatique?",
    site: "La bourse des 12 enjeux : la part d’attention de chacun, en hausse ou en baisse.",
  },
  "partis-et-couverture": {
    question: "De quel parti parle-t-on dans les médias, et sur quel ton?",
    site: "Le vu-mètre des partis : leur temps en Une, et le ton des phrases qui les nomment.",
  },
  "polimetre-plus": {
    question: "Quelles promesses électorales font parler?",
    site: "Les promesses de la CAQ de 2022, leur verdict et leur écho dans les médias.",
  },
  "assemblee-nationale": {
    question: "De quoi parlent les partis au Salon bleu, et sur quel ton?",
    site: "Une carte par député·e : son enjeu, son ton et son mot distinctif au Salon bleu.",
  },
};

// ── L'élément distinctif de chaque module ───────────────────────────────────
// Jules Piral, 2026-09-16 : chaque module se reconnaît à SON objet — la
// saillance, le radar, la bourse, le vu-mètre, les promesses, les cartes de
// hockey. On les redessine d'après le CSS et les composants du site, mais SANS
// DONNÉES : aucune valeur, aucun nom, aucun rang réel. Ce sont des schémas.
// Zone du schéma : 900 × 410 px.

/** La Une des Unes : l'échelle de SAILLANCE à six bandes (couleurs et libellés
 *  du site, lib/data/headlineEvents.ts), et une Une qui monte au sommet. */
function schemaUne(): string {
  const NIVEAUX = ["Très faible", "Faible", "Modérée", "Élevée", "Très élevée", "Exceptionnelle"];
  const bandes = NIVEAUX.map((n, i) => {
    const c = SALIENCE_COLORS[i + 1];
    return `<div class="bande" style="bottom:${i * 66}px;background:${c.bg};color:${c.fg};${i === 5 ? "box-shadow:inset 0 0 0 4px var(--ink);" : ""}${anim("wipe", .35, .5 + i * .12)}">${t(n)}</div>`;
  }).join("");
  return `<div class="schema saillance">
    <div class="journal" style="${anim("fadeUp", .5, .4)}"><b class="mono">À la Une</b><i style="width:90%;height:20px"></i><i style="width:70%;height:20px"></i><i style="width:92%"></i><i style="width:80%"></i><i style="width:86%"></i></div>
    <div class="echelle">${bandes}</div>
    <div class="curseur" style="animation:monte 1.6s cubic-bezier(.3,.7,.3,1) 1.4s both">◀</div>
  </div>`;
}

/** Deux solitudes : le RADAR — anneaux ronds, six axes, un polygone Québec
 *  (bleu) et un polygone Canada anglais (rouge), comme DeuxSolitudesRadar. */
function schemaSolitudes(): string {
  const cx = 450, cy = 205, R = 190, n = 6;
  const pt = (k: number, r: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  };
  const anneaux = [.25, .5, .75, 1].map((f, i) =>
    `<circle cx="${cx}" cy="${cy}" r="${R * f}" fill="none" stroke="var(--rule)" stroke-width="3" ${i < 3 ? `stroke-dasharray="6 8"` : ""}/>`).join("");
  const axes = Array.from({ length: n }, (_, k) => `<line x1="${cx}" y1="${cy}" x2="${pt(k, R).split(",")[0]}" y2="${pt(k, R).split(",")[1]}" stroke="var(--rule)" stroke-width="3"/>`).join("");
  // Formes de dessin, pas des parts d'attention.
  const qc = [.85, .62, .4, .3, .45, .72].map((f, k) => pt(k, R * f)).join(" ");
  const ca = [.42, .78, .7, .58, .3, .36].map((f, k) => pt(k, R * f)).join(" ");
  return `<div class="schema">
    <svg class="radar" viewBox="0 0 900 410">
      ${anneaux}${axes}
      <g class="balai"><path d="M${cx} ${cy} L${cx} ${cy - R} A${R} ${R} 0 0 1 ${pt(1, R).replace(",", " ")} Z" fill="${COLORS.ink}" fill-opacity=".08"/></g>
      <polygon points="${ca}" fill="${COLORS.red}" fill-opacity=".18" stroke="${COLORS.red}" stroke-width="6" style="${anim("pop", .7, 1.4)};transform-box:fill-box;transform-origin:center"/>
      <polygon points="${qc}" fill="${COLORS.blue}" fill-opacity=".18" stroke="${COLORS.blue}" stroke-width="6" style="${anim("pop", .7, 1.1)};transform-box:fill-box;transform-origin:center"/>
    </svg>
    <div class="legende" style="left:0;color:${COLORS.blue};${anim("fadeIn", .4, 1.1)}"><span>Québec</span></div>
    <div class="legende" style="right:0;color:${COLORS.red};${anim("fadeIn", .4, 1.4)}"><span>Canada anglais</span></div>
  </div>`;
}

/** Les 12 enjeux : la BOURSE — la mosaïque de tuiles du site (treemap), une par
 *  enjeu, avec son pictogramme et sa flèche de hausse ou de baisse. */
function schemaEnjeux(): string {
  const cles = Object.keys(ISSUE_COLORS);
  // [x, y, largeur, hauteur, hausse ?] — un pavage de dessin, sans proportion réelle.
  const TUILES: [number, number, number, number, boolean][] = [
    [0, 0, 330, 240, true], [330, 0, 220, 240, false], [550, 0, 190, 140, true], [740, 0, 160, 140, true],
    [550, 140, 350, 100, false], [0, 240, 200, 170, true], [200, 240, 160, 170, false], [360, 240, 140, 170, true],
    [500, 240, 120, 170, false], [620, 240, 110, 170, true], [730, 240, 90, 170, false], [820, 240, 80, 170, true],
  ];
  const tuiles = TUILES.map(([x, y, w, h, up], i) => {
    const size = Math.round(Math.min(w, h) * .42);
    return `<div class="tuile-b" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${ISSUE_COLORS[cles[i]]};${anim("pop", .4, .45 + i * .08)}">
      ${enjeuGlyph(cles[i], COLORS.paper, size)}
      <b class="fleche" style="color:${up ? "#A3E635" : "#FFAAAA"};animation:clignote 1.4s ${(i * .23).toFixed(2)}s infinite alternate">${up ? "▲" : "▼"}</b></div>`;
  }).join("");
  return `<div class="schema bourse">${tuiles}</div>`;
}

/** Partis et couverture : le VU-MÈTRE — une colonne de segments par parti, qui
 *  vit comme un vu-mètre (animation en boucle, aucune hauteur n'est une donnée). */
function schemaPartis(): string {
  const partis = (["caq", "plq", "pq", "qs", "pcq"] as const).filter((k) => PARTY_KEYS.includes(k));
  const colonnes = partis.map((k, i) => {
    const segs = Array.from({ length: 12 }, (_, s) => `<i data-s="${s}"></i>`).reverse().join("");
    return `<div class="colonne" style="${anim("fadeUp", .45, .5 + i * .12)}"><div class="segs" data-deco data-p="${i}" style="--c:${PARTY_COLORS[k]}">${segs}</div><span class="sigle pf" style="background:${PARTY_COLORS[k]}">${esc(PARTY_LABELS[k])}</span></div>`;
  }).join("");
  return `<div class="schema vumetre">${colonnes}</div>`;
}

/** Polimètre+ : les PROMESSES — la liste du site, pastille de rang à l'anneau
 *  du verdict, titre, étiquette de verdict. Titres et rangs sont des traits. */
function schemaPolimetre(): string {
  const V = [["Réalisée", "#228B22"], ["Partiellement réalisée", "#F3C349"], ["Rompue", "#C1121F"]] as const;
  const lignes = [0, 1, 2, 0].map((v, i) => {
    const [label, c] = V[v];
    return `<div class="promesse" style="${anim("fadeUp", .45, .5 + i * .22)}">
      <span class="rangp" style="border-color:${c};background:color-mix(in srgb, ${c} 20%, transparent)"></span>
      <span class="titre"><i style="width:${[92, 70, 84, 64][i]}%"></i><i style="width:${[55, 80, 48, 72][i]}%"></i></span>
      <span class="verdict mono"><s style="background:${c}"></s>${t(label)}</span></div>`;
  }).join("");
  return `<div class="schema">${lignes}</div>`;
}

/** L'Assemblée : les CARTES DE HOCKEY du vestiaire — cadre à la couleur du
 *  parti, bandeau « Assemblée nationale », portrait, position (enjeu dominant),
 *  plaque nominative, macaron. Portraits en silhouette : aucun élu désigné. */
function schemaAssemblee(): string {
  const cles = Object.keys(ISSUE_COLORS);
  const cartes = ([["caq", -9, 70], ["plq", 0, 320], ["qs", 9, 570]] as const).map(([k, rot, x], i) => {
    const c = PARTY_COLORS[k];
    return `<div class="carte-h" style="left:${x}px;--rot:${rot}deg;background:${c};${anim("donne", .6, .5 + i * .3)}">
      <div class="cadre"><div class="bandeau" data-deco style="background:${c}"></div>
      <div class="photo" style="border-bottom-color:${c}"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet"><circle cx="50" cy="40" r="20" fill="${c}" fill-opacity=".55"/><path d="M12 100 C14 70 32 62 50 62 C68 62 86 70 88 100Z" fill="${c}" fill-opacity=".55"/></svg>
        <span class="position">${enjeuGlyph(cles[[1, 0, 3][i]], COLORS.paper, 40)}</span></div>
      <div class="plaque"><i></i><i style="width:60%"></i></div>
      <span class="macaron pf" style="background:${c}">${esc(PARTY_LABELS[k])}</span></div></div>`;
  }).join("");
  return `<div class="schema">${cartes}</div>`;
}

const SCHEMAS: Record<CleModule, () => string> = {
  "une-des-unes": schemaUne,
  "deux-solitudes": schemaSolitudes,
  "enjeux-saillants": schemaEnjeux,
  "partis-et-couverture": schemaPartis,
  "polimetre-plus": schemaPolimetre,
  "assemblee-nationale": schemaAssemblee,
};

// ── Scènes ──────────────────────────────────────────────────────────────────
/** L'ACCROCHE (Jules Piral, 2026-09-17 : « plus catchy et belle »). Trois temps,
 *  un seul plan :
 *   1. six bandes verticales, aux papiers des six modules, remplissent l'écran ;
 *   2. six questions en rafale, chacune dans l'encre de son module, pendant que
 *      sa bande s'éclaire — on voit défiler ce que la Vitrine mesure ;
 *   3. les bandes s'effacent, le logo et « 6 modules pour mieux comprendre la
 *      démocratie au Québec » arrivent, soulignés par les six encres. */
const QUESTIONS: Record<CleModule, string> = {
  "une-des-unes": "Qu’est-ce qui fait la Une?",
  "deux-solitudes": "Québec, Canada : mêmes sujets?",
  "enjeux-saillants": "Quels enjeux dominent?",
  "partis-et-couverture": "De quel parti parle-t-on?",
  "polimetre-plus": "Les promesses sont-elles tenues?",
  "assemblee-nationale": "Qui parle au Salon bleu?",
};
const Q0 = .5, QPAS = .9, BASCULE = Q0 + ORDRE.length * QPAS + .1;

function sceneAccroche(logo: string): Scene {
  const bandes = ORDRE.map((k, i) => {
    const m = MODULES[k];
    const d = Q0 + i * QPAS;
    return `<div class="bande" data-deco style="left:${(i * 100) / 6}%;background:${m.papier};animation:growY .45s ${(i * .05).toFixed(2)}s both, efface .5s ${BASCULE}s forwards">
      <i style="background:${m.accent};animation:eclaire ${QPAS + .15}s ${d}s both"></i></div>`;
  }).join("");
  const questions = ORDRE.map((k, i) => {
    const d = Q0 + i * QPAS;
    return `<div class="q disp" style="color:${MODULES[k].accent};animation:qentre .22s ${d}s both, qsort .18s ${d + QPAS - .12}s forwards">${t(QUESTIONS[k])}</div>`;
  }).join("");
  const traits = ORDRE.map((k, i) => `<i style="background:${MODULES[k].accent};animation:grow .3s ${BASCULE + 1.7 + i * .07}s both"></i>`).join("");
  return {
    id: "accroche", duration: BASCULE + 3.2, noFadeIn: true, hideBrand: true,
    html: `
      <div class="bandes" data-deco>${bandes}</div>
      <div class="questions">${questions}</div>
      <div class="liseré" data-deco>${ORDRE.map((k, i) => `<i style="background:${MODULES[k].accent};animation:grow .35s ${(i * .06).toFixed(2)}s both"></i>`).join("")}</div>
      <div class="entete" data-deco>
        <div class="logo" style="${anim("pop", .7, .1)}">${logoAnime(logo, { classe: "", taille: 560, passe: .9 })}</div>
      </div>
      <h1 data-cle><span class="six disp" style="${anim("slam", .6, BASCULE + 1.1)}">6 modules</span><span class="pour pf" style="${anim("fadeUp", .5, BASCULE + 1.45)}">pour mieux comprendre la démocratie au Québec</span></h1>
      <div class="traits">${traits}</div>`,
  };
}

function sceneSources(): Scene {
  const heures = [0, 4, 8, 12, 16, 20].map((h, i) => `<span style="${anim("pop", .35, 1.1 + i * .08)}">${celestial(h, COLORS.ink, 36)}</span>`).join("");
  // Trois sources, une ligne chacune ; les modèles locaux en encadré, en dessous
  // (Jules Piral, 2026-09-17 : parler aussi des promesses électorales, mettre
  // l'emphase sur les modèles LOCAUX plutôt que sur « l'IA »).
  const lignes = [
    `<b class="disp">13</b><div><p class="pf">médias québécois et canadiens</p><small>leurs Unes, six fois par jour</small><div class="heures">${heures}</div></div>`,
    `<b class="disp">${fleur(MODULES["assemblee-nationale"].accent, 84)}</b><div><p class="pf">l’Assemblée nationale</p><small>ses débats, chaque jour de débat</small></div>`,
    `<b class="disp coche" style="color:${MODULES["polimetre-plus"].accent}">✓</b><div><p class="pf">les promesses électorales</p><small>leur écho dans les médias, avec le Polimètre</small></div>`,
  ].map((l, i) => `<div class="ligne" style="${anim("fadeUp", .5, .6 + i * .55)}">${l}</div>`).join("");
  return {
    id: "sources", duration: 6.4,
    html: `
      <div class="kick mono" style="${anim("fadeIn", .5, .1)}">D’où viennent les données</div>
      <h2 class="disp" style="${anim("fadeUp", .6, .2)}">La Vitrine lit la politique québécoise en continu</h2>
      <div class="lignes" data-cle>${lignes}</div>
      <div class="local" style="${anim("fadeUp", .6, 2.5)}">
        <div class="mono">Analysé ici</div>
        <p class="disp">Des modèles locaux, entraînés, validés et conservés à l’Université Laval</p>
      </div>
      <div class="gratuit pf" style="${anim("fadeIn", .5, 3.3)}">Gratuit, sans publicité, méthodologie publique.</div>`,
  };
}

function sceneModule(k: CleModule, i: number): Scene {
  const m = MODULES[k];
  const points = ORDRE.map((_, j) => `<i style="background:${j === i ? m.accent : "transparent"};border-color:${j <= i ? m.accent : "var(--rule)"}"></i>`).join("");
  return {
    id: `m-${k}`, duration: 5.6,
    html: `
      <div class="fond" data-deco style="background:${m.papier}"></div>
      <div class="zone-utile"><div class="rang mono" style="${anim("fadeIn", .4, .1)}"><span>Module ${i + 1} sur 6</span><span class="points">${points}</span></div>
      <div class="tete"><h2 class="nom disp" style="color:${m.accent};${anim("fadeUp", .5, .15)}">${t(m.nom)}</h2>
      <p class="question pf" style="${anim("fadeUp", .6, .45)}">${t(TEXTES[k].question)}</p></div>
      <div class="grandir"><div data-cle class="ech">${SCHEMAS[k]()}</div></div>
      <p class="site" style="${anim("fadeIn", .6, 2.2)}"><b class="mono" style="color:${m.accent}">Sur le site</b>${t(TEXTES[k].site)}</p></div>`,
  };
}

function sceneRecap(): Scene {
  const liste = ORDRE.map((k, i) => {
    const m = MODULES[k];
    return `<li style="background:${m.papier};border-left-color:${m.accent};${anim("fadeUp", .4, .5 + i * .2)}"><b class="disp" style="color:${m.accent}">${i + 1}</b><span class="pf" style="color:${m.accent}">${t(m.nom)}</span></li>`;
  }).join("");
  return {
    id: "recap", duration: 4.6,
    html: `
      <h2 class="disp" style="${anim("fadeUp", .6, .1)}">6 modules pour mieux comprendre la démocratie au Québec</h2>
      <ul data-cle>${liste}</ul>`,
  };
}

// ── Mise en page ────────────────────────────────────────────────────────────
// Zone utile : x 60 → 960 (1020 au-dessus de y 640), y 220 → 1422 (GABARIT.md).
const CSS = `
#accroche .bandes{position:absolute;left:30px;right:30px;top:414px;bottom:30px;overflow:hidden;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 170px);mask-image:linear-gradient(to bottom,transparent 0,#000 170px)}
#accroche .bande{position:absolute;top:0;bottom:0;width:calc(100% / 6 + 1px);transform-origin:top}
#accroche .bande i{position:absolute;inset:0;opacity:0}
@keyframes eclaire{0%{opacity:0}25%{opacity:.9}75%{opacity:.9}100%{opacity:0}}
@keyframes efface{to{opacity:0}}
#accroche .questions{position:absolute;left:180px;right:180px;top:800px;height:420px}
#accroche .q{position:absolute;left:0;right:0;top:0;font-size:88px;line-height:1.02;opacity:0;background:#F3ECDD;padding:18px 26px 24px;box-shadow:0 14px 40px rgba(28,25,23,.18)}
@keyframes qentre{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
@keyframes qsort{to{opacity:0;transform:translateY(-40px)}}
/* Le logo est là dès l'ouverture, dans un ENCADRÉ en haut ; les bandes partent
   du bas de cet encadré, jamais derrière le logo (Jules, 17-09). */
#accroche .entete{position:absolute;left:180px;right:180px;top:44px;height:370px;background:#F3ECDD;display:flex;align-items:center;justify-content:center;z-index:2}
/* Liseré des six encres tout en haut : l'en-tête d'Instagram le couvre au
   visionnement, mais il habille la vignette et les autres plateformes. */
#accroche .liseré{position:absolute;left:30px;right:30px;top:30px;height:14px;display:flex;z-index:3}
#accroche .liseré i{flex:1;display:block;transform-origin:left}
#accroche h1{position:absolute;top:600px;left:180px;right:180px}
#accroche .six{display:block;font-size:148px;line-height:1;white-space:nowrap;color:var(--ink)}
#accroche .pour{display:block;font-size:76px;line-height:1.06;margin-top:24px}
#accroche .traits{position:absolute;left:180px;right:180px;top:1190px;display:flex;gap:12px;height:18px}
#accroche .traits i{flex:1;display:block;transform-origin:left}

#sources .kick{position:absolute;top:282px;left:180px;right:180px;font-size:28px;color:var(--soft)}
#sources h2{position:absolute;top:330px;left:180px;right:180px;font-size:72px;line-height:1.02}
#sources .lignes{position:absolute;top:560px;left:180px;right:180px}
#sources .ligne{display:flex;align-items:center;gap:26px;padding:14px 0;border-top:3px solid var(--ink);text-align:left}
#sources .ligne > b{flex:none;width:160px;font-size:104px;line-height:1;text-align:center;display:flex;justify-content:center}
#sources .ligne p{font-size:46px;line-height:1.05}
#sources .ligne small{display:block;font-size:32px;color:var(--soft);margin-top:4px;font-style:italic}
#sources .heures{display:flex;gap:16px;margin-top:10px}
#sources .local{position:absolute;top:1125px;left:180px;right:180px;text-align:left;background:var(--ink);color:var(--paper);padding:22px 30px 26px}
#sources .local .mono{font-size:28px;letter-spacing:.14em;opacity:.8}
#sources .local p{font-size:46px;line-height:1.04;margin-top:8px}
#sources .gratuit{position:absolute;bottom:${RESERVE_BAS}px;left:180px;right:180px;font-size:34px;font-style:italic}

.scene .fond{position:absolute;inset:30px}
.scene .rang{display:flex;justify-content:space-between;align-items:center;font-size:28px;color:var(--soft)}
.scene .points{display:flex;gap:12px}
.scene .points i{display:block;width:30px;height:30px;border-radius:50%;border:4px solid}
.scene .tete{flex:none}
.scene .nom{font-size:96px;line-height:1}
.scene .question{font-size:62px;line-height:1.08;margin-top:26px}
.scene .schema{position:absolute;left:0;top:0;width:900px;height:410px}
/* Les schémas sont dessinés dans 900 × 410 ; la zone utile n'en fait plus que
   784 depuis les marges mesurées au simulateur : on les réduit d'un bloc. */
.scene .ech{position:relative;width:900px;height:410px;transform:scale(.8);transform-origin:50% 50%;margin:-41px -90px;flex:none}
.scene .site{text-align:left;font-size:38px;line-height:1.2;border-top:3px solid currentColor;padding-top:20px}
.scene .site b{display:block;font-size:28px;margin-bottom:10px}

.schema.saillance .journal{position:absolute;left:40px;top:40px;width:330px;height:340px;background:#FFFDF8;border:3px solid var(--ink);padding:28px 24px;transform:rotate(-3deg)}
.schema .journal b{display:inline-block;background:var(--ink);color:var(--paper);font-size:28px;padding:8px 14px;margin-bottom:24px}
.schema .journal i{display:block;height:14px;background:var(--ink);margin-bottom:18px}
.schema .echelle{position:absolute;left:430px;right:80px;top:0;height:396px}
.schema .bande{position:absolute;left:0;right:0;height:60px;display:flex;align-items:center;padding:0 22px;font-family:"IBM Plex Mono",monospace;font-size:28px;letter-spacing:.06em;text-transform:uppercase}
.schema .curseur{position:absolute;right:20px;font-size:48px;line-height:60px;color:var(--ink)}
@keyframes monte{from{top:336px}to{top:0}}

.schema .radar{position:absolute;left:0;top:0;width:900px;height:410px;overflow:visible}
.schema .balai{transform-origin:450px 205px;animation:balaye 2.4s linear infinite}
@keyframes balaye{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.schema .legende{position:absolute;bottom:10px;display:flex;align-items:center;gap:10px;font-family:"Playfair Display",serif;font-weight:900;font-size:40px}

.schema .tuile-b{position:absolute;border:3px solid var(--paper);display:flex;align-items:center;justify-content:center}
.schema .fleche{position:absolute;top:8px;right:10px;font-size:28px;line-height:1;font-family:sans-serif}
@keyframes clignote{from{opacity:.35}to{opacity:1}}

.schema.vumetre{display:flex;justify-content:center;gap:40px}
.schema .colonne{display:flex;flex-direction:column;align-items:center;gap:14px}
.schema .segs{display:flex;flex-direction:column;gap:5px;padding:10px;background:color-mix(in srgb, var(--paper), #000 7%);border:3px solid color-mix(in srgb, var(--paper), #000 20%)}
.schema .segs i{display:block;width:110px;height:21px;background:var(--c)}
.schema .sigle{color:#fff;font-size:40px;padding:4px 16px}

.schema .promesse{display:flex;align-items:center;gap:26px;height:100px;border-top:3px solid var(--ink)}
.schema .rangp{flex:none;width:58px;height:58px;border-radius:50%;border:4px solid}
.schema .promesse .titre{flex:1}
.schema .promesse .titre i{display:block;height:16px;background:var(--rule);margin:12px 0}
.schema .verdict{flex:none;display:flex;align-items:center;gap:12px;font-size:28px;letter-spacing:.06em;color:var(--soft)}
.schema .verdict s{display:block;width:22px;height:22px;border-radius:50%}

.schema .carte-h{position:absolute;top:0;width:270px;height:390px;padding:8px;transform:rotate(var(--rot))}
@keyframes donne{from{opacity:0;transform:translateY(80px) rotate(0)}to{opacity:1;transform:rotate(var(--rot))}}
.schema .cadre{position:relative;display:flex;flex-direction:column;height:100%;background:#FBF8F1}
.schema .bandeau{height:30px}
.schema .photo{position:relative;flex:1;border-bottom:5px solid;overflow:hidden}
.schema .photo > svg{position:absolute;inset:0;width:100%;height:100%}
.schema .position{position:absolute;top:18px;right:0;background:#86642C;padding:8px 12px}
.schema .plaque{padding:16px 12px 18px 90px}
.schema .plaque i{display:block;height:14px;background:var(--rule);margin:6px 0 6px auto}
.schema .macaron{position:absolute;left:8px;bottom:8px;width:72px;height:72px;border-radius:50%;border:3px solid #FBF8F1;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center}

#recap h2{position:absolute;top:292px;left:180px;right:180px;font-size:76px;line-height:1.02}
#recap ul{position:absolute;top:660px;bottom:${RESERVE_BAS + 70}px;left:180px;right:180px;list-style:none;display:flex;flex-direction:column;justify-content:space-between;gap:14px}
#recap li{display:flex;align-items:center;gap:26px;min-height:100px;text-align:left;padding:12px 26px;border-left:14px solid}
#recap li b{font-size:64px;width:44px}
#recap li span{font-size:50px;line-height:1}
#fin.scene .band{right:30px}
`;

// Le vu-mètre bouge comme un vu-mètre : niveau pseudo-musical, déterministe
// (même image à la même seconde), qui ne représente aucune donnée.
const SCRIPT = `
window.onSceneTime=function(id,t){
  if(id!=="m-partis-et-couverture")return;
  document.querySelectorAll("#m-partis-et-couverture .segs").forEach(function(col){
    var p=+col.dataset.p, on=t<.8?0:Math.min(1,(t-.8)/.6);
    var lvl=on*(6.5+3.2*Math.sin(t*(3.1+p*.7)+p*1.9)+1.8*Math.sin(t*(7.3-p*.9)+p));
    col.querySelectorAll("i").forEach(function(seg){seg.style.opacity=(+seg.dataset.s<lvl)?1:.13});
  });
};`;

// ── Légende ─────────────────────────────────────────────────────────────────
function caption(): string {
  const modules = ORDRE.map((k, i) => `${i + 1}. ${MODULES[k].nom} : ${TEXTES[k].question}`);
  const hashtags = ["#VitrineDémocratique", ...HASHTAGS_UNE.filter((h) => h !== "#LaUnedesUnes")];
  return captionTypo([
    "La Vitrine démocratique, c’est 6 modules pour mieux comprendre la démocratie au Québec.",
    "Nous suivons les Unes de 13 médias québécois et canadiens six fois par jour, les débats de l’Assemblée nationale chaque jour de débat, et l’écho médiatique des promesses électorales. Les analyses viennent de modèles locaux, entraînés, validés et conservés à l’Université Laval.",
    modules.join("\n"),
    "Gratuit, sans publicité, méthodologie publique : vitrinedemocratique.com",
    hashtags.join(" "),
  ].join("\n\n")) + "\n";
}

// ── Programme ───────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logos = await loadLogos();
  const scenes: Scene[] = [
    sceneAccroche(logos.vitrine), sceneSources(),
    ...ORDRE.map((k, i) => sceneModule(k, i)),
    sceneRecap(),
    // pubHour -1 : aucune édition en surbrillance, ce reel n'appartient à aucune.
    sceneFin({ pubHour: -1, signature: "6 modules pour mieux comprendre la démocratie au Québec", logo: logos.vitrine, accent: COLORS.ink, partenaires: await chargerPartenaires() }),
  ];

  const html = buildPage({
    title: "La Vitrine démocratique · 6 modules",
    css: CSS + FIN_CSS, scenes, script: SCRIPT,
    footerLeft: "La Vitrine démocratique",
    footerRight: "",
    theme: { paper: COLORS.paper, accent: COLORS.ink },
    logos,
  });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, "vitrine_presentation");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${base}_instagram.txt`, caption());
  console.log(`La Vitrine démocratique · présentation des 6 modules`);
  console.log(`  instagram → ${path.basename(base)}_instagram.txt`);

  await produce({ html, scenes, title: "La Vitrine démocratique · 6 modules", base, args });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
