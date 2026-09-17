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
  COLORS, FIN_CSS, TONE, buildPage, celestial, enjeuGlyph, esc, fleur, loadLogos, logoAnime, parseArgs, produce, sceneFin, typo,
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
    site: "Les nouvelles à la Une de nos médias, classées selon leur saillance.",
  },
  "deux-solitudes": {
    question: "Le Québec et le Canada anglais parlent-ils des mêmes sujets?",
    site: "Les Unes québécoises et canadiennes comparées, sujet par sujet.",
  },
  "enjeux-saillants": {
    question: "Quels enjeux occupent l’espace médiatique?",
    site: "L’attention des médias répartie entre 12 grands enjeux.",
  },
  "partis-et-couverture": {
    question: "De quel parti parle-t-on dans les médias, et sur quel ton?",
    site: "Le temps passé en Une par chaque parti, et le ton des phrases qui le nomment.",
  },
  "polimetre-plus": {
    question: "Quelles promesses électorales font parler?",
    site: "Les promesses de la CAQ de 2022, leur verdict et leur écho dans les médias.",
  },
  "assemblee-nationale": {
    question: "De quoi parlent les partis au Salon bleu, et sur quel ton?",
    site: "Les débats de l’Assemblée nationale, analysés chaque jour de débat.",
  },
};

// ── Schémas des modules ─────────────────────────────────────────────────────
// Des dessins, pas des données : aucune valeur, aucun rang.

/** La Une des Unes : une pile de Unes, celle du dessus en évidence. */
function schemaUne(accent: string): string {
  const feuilles = [0, 1, 2, 3].map((i) =>
    `<div class="feuille" data-deco style="left:${120 + i * 150}px;top:${40 + (3 - i) * 16}px;transform:rotate(${(i - 1.5) * 4}deg);${anim("fadeUp", .5, .5 + i * .15)}">
      <i style="width:70%"></i><i style="width:90%"></i><i style="width:55%"></i><i style="width:80%"></i></div>`).join("");
  return `<div class="schema">${feuilles}
    <div class="une" style="${anim("pop", .6, 1.3)}"><b class="mono" style="background:${accent}">À la Une</b><i style="width:88%;height:22px"></i><i style="width:64%;height:22px"></i><i style="width:92%"></i><i style="width:76%"></i><i style="width:84%"></i></div>
  </div>`;
}

/** Deux solitudes : deux cercles qui se recoupent (ou pas). */
function schemaSolitudes(): string {
  return `<div class="schema">
    <div class="cercle" data-deco style="left:190px;border-color:${COLORS.blue};background:color-mix(in srgb, ${COLORS.blue} 12%, transparent);${anim("fadeIn", .6, .5)}"></div>
    <div class="cercle" data-deco style="left:370px;border-color:${COLORS.red};background:color-mix(in srgb, ${COLORS.red} 12%, transparent);${anim("fadeIn", .6, .8)}"></div>
    <div class="etiq" style="left:110px;width:340px;color:${COLORS.blue};${anim("fadeUp", .5, .7)}">${fleur(COLORS.blue, 36)}<span>Québec</span></div>
    <div class="etiq" style="left:450px;width:340px;color:${COLORS.red};${anim("fadeUp", .5, 1)}"><span>Canada anglais</span></div>
    <div class="inter disp" style="${anim("pop", .6, 1.4)}">?</div>
  </div>`;
}

/** Les 12 enjeux : les douze pictogrammes du site, dans leurs couleurs. */
function schemaEnjeux(): string {
  const cles = Object.keys(ISSUE_COLORS);
  const pastilles = cles.map((k, i) =>
    `<div class="pastille" style="background:${ISSUE_COLORS[k]};${anim("pop", .45, .5 + i * .1)}">${enjeuGlyph(k, COLORS.paper, 62)}</div>`).join("");
  return `<div class="schema"><div class="grille">${pastilles}</div></div>`;
}

/** Partis et couverture : les cinq partis et un cadran de ton. */
function schemaPartis(): string {
  const partis = (["caq", "plq", "pq", "qs", "pcq"] as const).filter((k) => PARTY_KEYS.includes(k)).map((k, i) =>
    `<span class="sigle pf" style="background:${PARTY_COLORS[k]};${anim("fadeUp", .45, .5 + i * .12)}">${esc(PARTY_LABELS[k])}</span>`).join("");
  return `<div class="schema">
    <div class="sigles">${partis}</div>
    <svg class="cadran" viewBox="0 0 400 230" style="${anim("fadeIn", .5, 1.1)}">
      <path d="M40 200 A160 160 0 0 1 200 40" fill="none" stroke="${TONE.negative}" stroke-width="22"/>
      <path d="M200 40 A160 160 0 0 1 360 200" fill="none" stroke="${TONE.positive}" stroke-width="22"/>
      <g class="aiguille"><line x1="200" y1="200" x2="200" y2="70" stroke="${COLORS.ink}" stroke-width="9" stroke-linecap="round"/></g>
      <circle cx="200" cy="200" r="16" fill="${COLORS.ink}"/>
    </svg>
    <div class="pole" style="left:170px;color:${TONE.negative};${anim("fadeIn", .4, 1.3)}">Défavorable</div>
    <div class="pole" style="right:150px;color:${TONE.positive};${anim("fadeIn", .4, 1.3)}">Favorable</div>
  </div>`;
}

/** Polimètre+ : trois promesses et leur verdict. */
function schemaPolimetre(): string {
  const verdicts = [["Réalisée", TONE.positive], ["Partiellement réalisée", "#94781B"], ["Rompue", TONE.negative]] as const;
  const cartes = verdicts.map(([v, c], i) =>
    `<div class="promesse" style="${anim("fadeUp", .5, .5 + i * .3)}"><div class="lignes"><i style="width:85%"></i><i style="width:60%"></i></div>
      <b class="tampon mono" style="color:${c};border-color:${c};${anim("pop", .45, .9 + i * .3)}">${t(v)}</b></div>`).join("");
  return `<div class="schema">${cartes}</div>`;
}

/** L'Assemblée : l'hémicycle du Salon bleu. */
function schemaAssemblee(accent: string): string {
  const sieges: string[] = [];
  const rangs = [[150, 11], [210, 15], [270, 19], [330, 23]] as const;
  let k = 0;
  for (const [r, n] of rangs) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1 - i / (n - 1));
      sieges.push(`<circle cx="${(450 + r * Math.cos(a)).toFixed(1)}" cy="${(345 - r * Math.sin(a)).toFixed(1)}" r="12" fill="${accent}" style="${anim("pop", .25, .5 + k * .018)};transform-box:fill-box;transform-origin:center"/>`);
      k++;
    }
  }
  return `<div class="schema"><svg class="hemi" viewBox="0 0 900 410">${sieges.join("")}</svg>
    <div class="bulle pf" style="${anim("pop", .5, 2.1)}">« Monsieur le Président… »</div></div>`;
}

const SCHEMAS: Record<CleModule, (accent: string) => string> = {
  "une-des-unes": schemaUne,
  "deux-solitudes": schemaSolitudes,
  "enjeux-saillants": schemaEnjeux,
  "partis-et-couverture": schemaPartis,
  "polimetre-plus": schemaPolimetre,
  "assemblee-nationale": schemaAssemblee,
};

// ── Scènes ──────────────────────────────────────────────────────────────────
function sceneAccroche(logo: string): Scene {
  const tuiles = ORDRE.map((k, i) => {
    const m = MODULES[k];
    return `<div class="tuile" style="background:${m.papier};border-top-color:${m.accent};${anim("fadeUp", .45, 1.6 + i * .18)}"><b class="disp" style="color:${m.accent}">${i + 1}</b><span>${t(m.nom)}</span></div>`;
  }).join("");
  return {
    id: "accroche", duration: 5.4, noFadeIn: true,
    html: `
      <div class="logo" style="${anim("fadeIn", .6, .1)}">${logoAnime(logo, { classe: "", taille: 460, passe: .9 })}</div>
      <h1><span class="six disp" style="${anim("slam", .7, .4)}">6 modules</span><span class="pour pf" style="${anim("fadeUp", .6, .9)}">pour mieux comprendre la démocratie au Québec</span></h1>
      <div class="tuiles">${tuiles}</div>`,
  };
}

function sceneSources(): Scene {
  const heures = [0, 4, 8, 12, 16, 20].map((h, i) => `<span style="${anim("pop", .35, 1.3 + i * .1)}">${celestial(h, COLORS.ink, 40)}</span>`).join("");
  const lignes = [
    `<b class="disp">13</b><div><p class="pf">médias québécois et canadiens</p><small>leurs Unes, analysées six fois par jour</small><div class="heures">${heures}</div></div>`,
    `<b class="disp">${fleur(COLORS.blue, 96)}</b><div><p class="pf">l’Assemblée nationale</p><small>ses débats, chaque jour de débat</small></div>`,
    `<b class="disp ia">IA</b><div><p class="pf">des modèles locaux</p><small>entraînés et validés à l’Université Laval</small></div>`,
  ].map((l, i) => `<div class="ligne" style="${anim("fadeUp", .5, .7 + i * .7)}">${l}</div>`).join("");
  return {
    id: "sources", duration: 6,
    html: `
      <div class="kick mono" style="${anim("fadeIn", .5, .1)}">D’où viennent les données</div>
      <h2 class="disp" style="${anim("fadeUp", .6, .2)}">La Vitrine lit la politique québécoise en continu</h2>
      <div class="lignes">${lignes}</div>
      <div class="gratuit pf" style="${anim("fadeIn", .5, 3)}">Gratuit, sans publicité, méthodologie publique.</div>`,
  };
}

function sceneModule(k: CleModule, i: number): Scene {
  const m = MODULES[k];
  const points = ORDRE.map((_, j) => `<i style="background:${j === i ? m.accent : "transparent"};border-color:${j <= i ? m.accent : "var(--rule)"}"></i>`).join("");
  return {
    id: `m-${k}`, duration: 5.6,
    html: `
      <div class="fond" data-deco style="background:${m.papier}"></div>
      <div class="rang mono" style="${anim("fadeIn", .4, .1)}"><span>Module ${i + 1} sur 6</span><span class="points">${points}</span></div>
      <div class="tete"><h2 class="nom disp" style="color:${m.accent};${anim("fadeUp", .5, .15)}">${t(m.nom)}</h2>
      <p class="question pf" style="${anim("fadeUp", .6, .45)}">${t(TEXTES[k].question)}</p></div>
      ${SCHEMAS[k](m.accent)}
      <p class="site" style="${anim("fadeIn", .6, 2.2)}"><b class="mono" style="color:${m.accent}">Sur le site</b>${t(TEXTES[k].site)}</p>`,
  };
}

function sceneRecap(): Scene {
  const liste = ORDRE.map((k, i) => {
    const m = MODULES[k];
    return `<li style="background:${m.papier};border-left-color:${m.accent};${anim("fadeUp", .4, .5 + i * .2)}"><b class="disp" style="color:${m.accent}">${i + 1}</b><span class="pf">${t(m.nom)}</span></li>`;
  }).join("");
  return {
    id: "recap", duration: 4.6,
    html: `
      <h2 class="disp" style="${anim("fadeUp", .6, .1)}">6 modules pour mieux comprendre la démocratie au Québec</h2>
      <ul>${liste}</ul>`,
  };
}

// ── Mise en page ────────────────────────────────────────────────────────────
// Zone utile : x 60 → 960 (1020 au-dessus de y 640), y 220 → 1422 (GABARIT.md).
const CSS = `
#accroche .logo{position:absolute;top:240px;left:76px}
#accroche h1{position:absolute;top:470px;left:76px;right:120px}
#accroche .six{display:block;font-size:172px;line-height:1;white-space:nowrap;color:var(--ink)}
#accroche .pour{display:block;font-size:72px;line-height:1.08;margin-top:22px}
#accroche .tuiles{position:absolute;left:76px;right:120px;top:1000px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
#accroche .tuile{border-top:10px solid;padding:14px 16px 16px;height:176px;display:flex;flex-direction:column;justify-content:space-between}
#accroche .tuile b{font-size:60px;line-height:1}
#accroche .tuile span{font-size:28px;line-height:1.1;font-weight:700}

#sources .kick{position:absolute;top:240px;left:76px;font-size:28px;color:var(--soft)}
#sources h2{position:absolute;top:290px;left:76px;right:120px;font-size:80px;line-height:1.02}
#sources .lignes{position:absolute;top:600px;left:76px;right:120px}
#sources .ligne{display:flex;align-items:center;gap:34px;padding:26px 0;border-top:3px solid var(--ink)}
#sources .ligne > b{flex:none;width:200px;font-size:130px;line-height:1;text-align:center;display:flex;justify-content:center}
#sources .ligne > b.ia{color:var(--blue)}
#sources .ligne p{font-size:52px;line-height:1.05}
#sources .ligne small{display:block;font-size:34px;color:var(--soft);margin-top:6px;font-style:italic}
#sources .heures{display:flex;gap:18px;margin-top:14px}
#sources .gratuit{position:absolute;top:1320px;left:76px;right:120px;font-size:40px;font-style:italic}

.scene .fond{position:absolute;inset:30px}
.scene .rang{position:absolute;top:236px;left:76px;right:60px;display:flex;justify-content:space-between;align-items:center;font-size:28px;color:var(--soft)}
.scene .points{display:flex;gap:12px}
.scene .points i{display:block;width:30px;height:30px;border-radius:50%;border:4px solid}
.scene .tete{position:absolute;top:300px;left:76px;right:120px}
.scene .nom{font-size:96px;line-height:1}
.scene .question{font-size:62px;line-height:1.08;margin-top:26px}
.scene .schema{position:absolute;left:60px;right:120px;top:800px;height:410px}
.scene .site{position:absolute;left:76px;right:120px;top:1238px;font-size:38px;line-height:1.2}
.scene .site b{display:block;font-size:28px;margin-bottom:8px}

.schema .feuille{position:absolute;width:250px;height:330px;background:#FBF8F1;border:2px solid var(--rule);padding:30px 22px;box-shadow:0 4px 0 rgba(0,0,0,.06)}
.schema .feuille i,.schema .une i{display:block;height:14px;background:var(--rule);margin-bottom:18px}
.schema .une{position:absolute;left:560px;top:10px;width:320px;height:390px;background:#FFFDF8;border:3px solid var(--ink);padding:30px 26px}
.schema .une b{display:inline-block;color:var(--paper);font-size:28px;padding:8px 14px;margin-bottom:26px}
.schema .une i{background:var(--ink)}

.schema .cercle{position:absolute;top:0;width:340px;height:340px;border-radius:50%;border:8px solid}
.schema .etiq{position:absolute;top:356px;display:flex;align-items:center;justify-content:center;gap:10px;font-family:"Playfair Display",serif;font-weight:900;font-size:40px}
.schema .inter{position:absolute;left:390px;width:120px;top:100px;text-align:center;font-size:130px;line-height:1;color:var(--ink)}

.schema .grille{display:grid;grid-template-columns:repeat(6,1fr);gap:26px 20px;padding:20px 0 0}
.schema .pastille{width:118px;height:118px;border-radius:50%;display:flex;align-items:center;justify-content:center}

.schema .sigles{display:flex;justify-content:center;gap:18px}
.schema .sigle{color:#fff;font-size:44px;padding:8px 18px}
.schema .cadran{position:absolute;left:200px;top:110px;width:500px;height:288px}
.schema .aiguille{transform-origin:200px 200px;animation:balance 3.2s ease-in-out .9s infinite alternate}
@keyframes balance{from{transform:rotate(-55deg)}to{transform:rotate(55deg)}}
.schema .pole{position:absolute;top:380px;font-family:"IBM Plex Mono",monospace;font-size:28px;text-transform:uppercase;letter-spacing:.1em}

.schema .promesse{display:flex;align-items:center;justify-content:space-between;gap:24px;height:118px;border-top:3px solid var(--ink);padding:0 4px}
.schema .promesse .lignes{flex:1}
.schema .promesse .lignes i{display:block;height:16px;background:var(--rule);margin:14px 0}
.schema .tampon{flex:none;font-size:28px;letter-spacing:.06em;border:4px solid;padding:10px 16px;transform:rotate(-3deg)}

.schema .hemi{position:absolute;left:0;top:0;width:900px;height:410px}
.schema .bulle{position:absolute;left:0;right:0;top:365px;text-align:center;font-size:38px;font-style:italic}

#recap h2{position:absolute;top:250px;left:76px;right:120px;font-size:86px;line-height:1.02}
#recap ul{position:absolute;top:640px;left:76px;right:120px;list-style:none;display:flex;flex-direction:column;gap:16px}
#recap li{display:flex;align-items:center;gap:30px;height:112px;padding:0 26px;border-left:14px solid}
#recap li b{font-size:64px;width:44px}
#recap li span{font-size:50px}
`;

const SCRIPT = ``;

// ── Légende ─────────────────────────────────────────────────────────────────
function caption(): string {
  const modules = ORDRE.map((k, i) => `${i + 1}. ${MODULES[k].nom} : ${TEXTES[k].question}`);
  const hashtags = ["#VitrineDémocratique", ...HASHTAGS_UNE.filter((h) => h !== "#LaUnedesUnes")];
  return captionTypo([
    "La Vitrine démocratique, c’est 6 modules pour mieux comprendre la démocratie au Québec.",
    "Nous suivons les Unes de 13 médias québécois et canadiens, six fois par jour, et les débats de l’Assemblée nationale, chaque jour de débat. Les analyses viennent de modèles d’IA locaux, entraînés et validés à l’Université Laval.",
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
    sceneFin({ pubHour: -1, signature: "6 modules pour mieux comprendre la démocratie au Québec", logo: logos.vitrine, accent: COLORS.ink }),
  ];

  const html = buildPage({
    title: "La Vitrine démocratique · 6 modules",
    css: CSS + FIN_CSS, scenes, script: SCRIPT,
    footerLeft: "⚜ La Vitrine démocratique",
    footerRight: "vitrinedemocratique.com",
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
