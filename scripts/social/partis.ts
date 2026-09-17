// Reel Instagram du module « Partis et couverture » : de quel parti parlent les
// médias québécois en Une, dans quel média, sur quel ton.
//
//   npm run reel:partis                        # aperçu animé (navigateur)
//   npm run reel:partis -- --mp4               # la vidéo, après validation
//   npm run reel:partis -- --edition 2026-09-16T19
//
// DONNÉES : `loadParties` (lib/data/parties.ts), la fonction de la section du
// site, y compris sa ventilation par média (le fader « Source »).
//
// PRINCIPE ÉDITORIAL (Instagram) : chaque scène dit son RÉSULTAT dans le titre,
// en une phrase construite sur les données, sans sous-titre. L'accroche fait
// exception au gabarit commun : résultat + visuel (GABARIT.md, section 0). Pas de vocabulaire propre à la console du
// site (vitesses, trophées, sourdine) : il ne se comprend pas hors contexte.
// Du module, on garde ce qui MONTRE un résultat : le vumètre et les cadrans.
//
// Le « Palmarès » du module (rang bloc par bloc) n'est pas repris.
//
// Gabarit commun : scripts/social/GABARIT.md (cadre, zone sûre, 26 px minimum,
// logos partout, aperçu obligatoire avant --mp4). Décisions : section 4.

import fs from "node:fs/promises";
import path from "node:path";

import { instantPublicationBloc, type EditionRef } from "@/lib/data/headlineEvents";
import { PARTY_FULL_NAMES, loadParties, type PartiesData, type PartyKey, type RowView } from "@/lib/data/parties";
import { MEDIA_DANS } from "@/lib/medias";
import { MODULES } from "@/lib/modules";

import { anim, captionTypo, footerEdition, joinFr, pubHourLabel, resolveEdition } from "./lib/commun";
import { HASHTAGS as HASHTAGS_UNE } from "./lib/post";
import { COLORS, FIN_CSS, SLOW, TONE, buildPage, chargerPartenaires, loadLogos, esc, parseArgs, produce, sceneFin, txt, type Scene } from "./lib/reel";

const IDENTITE = MODULES["partis-et-couverture"];
const MODULE = IDENTITE.nom;

/** Mots-clics : ceux du gabarit commun (lib/post.ts), sans celui de la Une des Unes. */
const HASHTAGS = ["#PartisEtCouverture", ...HASHTAGS_UNE.filter((h) => h !== "#LaUnedesUnes")];

// ── Formulations ────────────────────────────────────────────────────────────
// Gabarits finis, nourris par les données (règle #7 : à relire avant publication).

/** Nom complet avec article (« le Parti québécois »). */
const NOM_ARTICLE: Record<PartyKey, string> = {
  pq: `le ${PARTY_FULL_NAMES.pq}`,
  plq: `le ${PARTY_FULL_NAMES.plq}`,
  caq: `la ${PARTY_FULL_NAMES.caq}`,
  pcq: `le ${PARTY_FULL_NAMES.pcq}`,
  qs: PARTY_FULL_NAMES.qs,
};
/** Sigle avec article (« le PQ », « la CAQ », « QS »). */
const SIGLE_ARTICLE: Record<PartyKey, string> = { pq: "le PQ", plq: "le PLQ", caq: "la CAQ", pcq: "le PCQ", qs: "QS" };
/** « du PQ », « de la CAQ », « de QS ». */
const SIGLE_DE: Record<PartyKey, string> = { pq: "du PQ", plq: "du PLQ", caq: "de la CAQ", pcq: "du PCQ", qs: "de QS" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TONE_MOT = { negative: "défavorable", positive: "favorable", neutral: "neutre" } as const;

// ── Par média ──────────────────────────────────────────────────────────────
// Le fader « Source » du site : chaque média a sa propre ventilation des cinq
// partis (les parts d'un média se somment à 100 % de SA couverture des partis).
type MediaMix = { id: string; nom: string; dans: string; rows: RowView[]; minutes: number };

function mediaMixes(data: PartiesData): MediaMix[] {
  return data.medias.flatMap((m) => {
    const view = data.byMedia[m.id];
    if (!view) return [];
    const rows = [...view.ranges.today.rows];
    const minutes = rows.reduce((t, r) => t + r.minutesUne, 0);
    if (minutes <= 0) return [];
    const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());
    return [{
      id: m.id,
      nom: m.label.replace(/^Le Journal/, "Journal"),
      dans: lower(MEDIA_DANS[m.id] ?? `Dans ${m.label}`),
      rows,
      minutes,
    }];
  });
}

/** Le ou les partis en tête d'un média (égalité possible). */
function leaders(mix: MediaMix): RowView[] {
  const max = Math.max(...mix.rows.map((r) => r.sovPct));
  return mix.rows.filter((r) => r.sovPct === max && max > 0);
}

/** « défavorable pour 4 partis, favorable pour QS » : groupes de ton. */
function tonGroupes(rows: RowView[]): string[] {
  return (["negative", "positive", "neutral"] as const).flatMap((dir) => {
    const g = rows.filter((r) => r.toneDirection === dir);
    if (!g.length) return [];
    const qui = g.length >= 3 ? `${g.length} partis` : joinFr(g.map((r) => SIGLE_ARTICLE[r.key]));
    return [`${TONE_MOT[dir]} pour ${qui}`];
  });
}

// ── Objets du module ────────────────────────────────────────────────────────
/** Colonne du vumètre : vingt segments de 5 %, allumés jusqu'à la part (0 → 100 %,
 *  la même échelle que le site). */
function vuColumn(row: RowView, height: number, delay: number): string {
  const lit = Math.round(row.sovPct / 5);
  const segs = Array.from({ length: 20 }, (_, i) => `<i data-i="${i}" style="--on:${row.color}"></i>`).join("");
  return `<div class="vu" data-lit="${lit}" data-d="${delay}" style="height:${height}px">${segs}</div>`;
}

/** Cadran à aiguille du ton : défavorable à gauche (rouge), favorable à droite
 *  (vert) ; l'aiguille part du centre et va à la valeur (tonePct 0 → 100). */
function needle(row: RowView, delay: number): string {
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => `${100 + 78 * Math.sin((a * Math.PI) / 180)},${100 - 78 * Math.cos((a * Math.PI) / 180)}`;
    return `M${p(a0)} A78 78 0 0 1 ${p(a1)}`;
  };
  const ticks = Array.from({ length: 13 }, (_, i) => {
    const a = ((-60 + i * 10) * Math.PI) / 180, r1 = 66, r2 = i % 3 === 0 ? 56 : 61;
    return `<line x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + r2 * Math.sin(a)}" y2="${100 - r2 * Math.cos(a)}" stroke="#6E685F" stroke-width="1.6"/>`;
  }).join("");
  return `<svg viewBox="0 0 200 112" class="needle">
    <rect x="2" y="2" width="196" height="108" rx="10" style="fill:var(--deep);stroke:var(--rule)" stroke-width="3"/>
    <path d="${arc(-60, 0)}" fill="none" stroke="${TONE.negative}" stroke-width="7"/>
    <path d="${arc(0, 60)}" fill="none" stroke="${TONE.positive}" stroke-width="7"/>
    ${ticks}
    <g class="n" data-to="${row.tonePct}" data-d="${delay}" style="transform-origin:100px 100px"><line x1="100" y1="100" x2="100" y2="24" stroke="${COLORS.ink}" stroke-width="3.2" stroke-linecap="round"/></g>
    <circle cx="100" cy="100" r="8" fill="${COLORS.ink}"/>
  </svg>`;
}

const pchip = (row: RowView) => `<span class="pchip" style="background:${row.color}">${esc(row.label)}</span>`;

// ── Mise en page ────────────────────────────────────────────────────────────
// Zone sûre (Reels organiques) : texte de x 76 à 960, y 220 → 1520.
const CSS = `
.kick{font-size:28px;color:var(--softer);letter-spacing:.14em}
.head{position:absolute;top:236px;left:76px;right:120px}
.head h2{font-size:70px;line-height:1.04;margin-top:12px}
.pchip{flex:none;display:inline-block;width:118px;text-align:center;color:var(--paper);font-family:"Playfair Display",serif;font-weight:900;font-size:38px;padding:4px 0}
.vu{display:flex;flex-direction:column-reverse;gap:5px;width:100%}
.vu i{flex:1;display:block;background:var(--deep)}
.vu i.on{background:var(--on)}

/* Accroche : le résultat, et rien d'autre */
#accroche .brand,#campagne .brand{position:absolute;top:240px;line-height:1.25;left:76px;right:120px;display:flex;align-items:center;gap:20px;font-size:30px;color:var(--soft)}
#accroche .brand i,#campagne .brand i{display:block;width:110px;height:10px;background:var(--blue);transform-origin:left}
#accroche .result,#campagne .result{position:absolute;top:340px;left:76px;right:120px;display:flex;flex-direction:column;gap:30px}
#accroche .answer,#campagne .answer{line-height:1;letter-spacing:-.03em;white-space:nowrap}
#accroche .then,#campagne .then{font-size:88px;line-height:1.02}
#accroche .mini,#campagne .mini{position:absolute;left:76px;right:120px;top:1070px;height:330px;display:flex;gap:26px}
#accroche .mini .col,#campagne .mini .col{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px}
#accroche .mini b,#campagne .mini b{width:100%;text-align:center;font-family:"Playfair Display",serif;font-weight:900;font-size:38px;color:var(--paper);padding:2px 0}

/* Le jour, en vumètre */
#jour .chart{position:absolute;top:530px;left:76px;right:120px;height:880px;display:flex;gap:28px}
#jour .col{flex:1;display:flex;flex-direction:column;align-items:center}
#jour .pct{font-family:"Playfair Display",serif;font-weight:900;font-size:64px;line-height:1;margin-bottom:14px}
#jour .lab{width:100%;text-align:center;margin-top:14px;font-family:"Playfair Display",serif;font-weight:900;font-size:44px;color:var(--paper);padding:4px 0}

/* Par média */
#playlist .rows{position:absolute;top:520px;left:76px;right:120px}
#playlist .row{height:146px;padding-top:12px;border-top:2px solid var(--rule)}
#playlist .line{display:flex;align-items:baseline;justify-content:space-between;gap:20px}
#playlist .line b{font-family:"Playfair Display",serif;font-weight:900;font-size:40px}
#playlist .line span{font-family:"Playfair Display",serif;font-weight:700;font-size:36px;white-space:nowrap}
#playlist .mix{display:flex;height:60px;margin-top:10px;transform-origin:left;overflow:hidden}
#playlist .mix div{display:flex;align-items:center;justify-content:center;color:var(--paper);font-family:"Playfair Display",serif;font-weight:900;font-size:28px;white-space:nowrap;overflow:hidden}

/* Ton */
#ton .legend{position:absolute;top:548px;left:76px;right:120px;display:flex;justify-content:space-between;font-size:28px;letter-spacing:.06em}
#ton .rows{position:absolute;top:600px;left:76px;right:120px}
#ton .row{height:162px;display:flex;align-items:center;gap:28px;border-top:2px solid var(--rule)}
#ton .needle{width:260px;height:146px;flex:none}
#ton .lab{font-family:"Playfair Display",serif;font-weight:900;font-size:46px}

/* Campagne */
#campagne .rows{position:absolute;top:580px;left:76px;right:120px}
#campagne .row{height:164px;display:flex;align-items:center;gap:24px;border-top:2px solid var(--rule)}
#campagne .hvu{flex:1;display:flex;gap:4px;height:40px}
#campagne .hvu i{flex:1;background:var(--deep)}
#campagne .hvu i.on{background:var(--on)}
#campagne .pct{font-family:"Playfair Display",serif;font-weight:900;font-size:62px;width:150px;text-align:right}
`;

const head = (kicker: string, title: string) => `
  <div class="head">
    <div class="kick mono" ${anim("fadeIn", .5, .1)}>${esc(kicker)}</div>
    <h2 class="disp" ${anim("fadeUp", .6, .2)}>${txt(title)}</h2>
  </div>`;

/** RYTHME : la version longue (défaut) et la version COURTE et punchée
 *  (`--court`, Jules Piral, 2026-09-17 : « plus courte et punchée », les deux
 *  gardées). Mêmes scènes et mêmes données ; la courte enchaîne plus vite, saute
 *  le vumètre du jour (l'accroche le dit déjà) et finit sur le retournement de la
 *  campagne en une seule image. */
type Rythme = { accroche: number; then: number; vu0: number; vuStep: number; playlist0: number; playlistStep: number; playlistTail: number; ton0: number; tonStep: number; tonTail: number };
const LONG: Rythme = { accroche: 3.4, then: .9, vu0: 1.2, vuStep: .12, playlist0: 0.9, playlistStep: 0.75, playlistTail: 2.2, ton0: 1.0, tonStep: 0.28, tonTail: 5.4 };
// COURTE : 12 secondes AU PLUS, fin comprise (Jules Piral, 2026-09-17). Le ton
// n'y tient pas : accroche, médias, campagne, fin. `main` refuse de dépasser.
const COURT: Rythme = { accroche: 1.9, then: .45, vu0: .55, vuStep: .05, playlist0: 0.35, playlistStep: 0.16, playlistTail: 0.75, ton0: 0.6, tonStep: 0.14, tonTail: 3.0 };
const COURT_MAX_S = 12;

function sceneAccroche(rows: RowView[], ry: Rythme = LONG): Scene {
  const lead = rows[0];
  // Une seule ligne, quel que soit le sigle (« Le PQ », « La CAQ »).
  const answer = cap(SIGLE_ARTICLE[lead.key]);
  return {
    id: "accroche", duration: ry.accroche, noFadeIn: true, hideFooter: true,
    html: `
      <div class="brand mono" ${anim("fadeIn", .5, .1)}><i ${anim("grow", .6, .1)}></i>${esc(MODULE)}</div>
      <div class="result">
        <div class="answer disp" style="color:${lead.color};font-size:${answer.length <= 5 ? 270 : 230}px;animation:slam .7s .3s both">${esc(answer)}</div>
        <div class="then disp" ${anim("fadeUp", .5, ry.then)}>est le parti dont on parle le plus aujourd’hui</div>
      </div>
      <div class="mini">${rows.map((r, i) => `<div class="col">${vuColumn(r, 250, ry.vu0 + i * ry.vuStep)}<b style="background:${r.color}">${esc(r.label)}</b></div>`).join("")}</div>`,
  };
}

function sceneJour(rows: RowView[]): Scene {
  const lead = rows[0];
  const cols = rows.map((r, i) => {
    const d = 1.0 + i * 0.22;
    return `<div class="col">
      <div class="pct count" data-n="${r.sovPct}" data-d="${d}" style="color:${r.color}">0&nbsp;%</div>
      ${vuColumn(r, 680, d)}
      <div class="lab" style="background:${r.color}">${esc(r.label)}</div>
    </div>`;
  }).join("");
  return {
    id: "jour", duration: 5.6,
    html: `
      ${head("Temps en Une · depuis minuit", `${cap(SIGLE_ARTICLE[lead.key])} est le parti dont on parle le plus aujourd’hui`)}
      <div class="chart">${cols}</div>`,
  };
}

/** Un média à la fois : chacun a le temps d'être lu avant le suivant
 *  (version longue) ; la courte les fait tomber en rafale. */
function scenePlaylist(mixes: MediaMix[], order: RowView[], ry: Rythme = LONG): Scene | null {
  if (!mixes.length) return null;
  const rank = new Map(order.map((r, i) => [r.key, i]));
  const tetes = new Set(mixes.map((m) => leaders(m)[0]?.key));
  const seule = [...tetes][0];
  const title = tetes.size > 1 || !seule
    ? "Chaque média ne met pas en avant le même parti"
    : `Tous les médias parlent surtout ${SIGLE_DE[seule]}`;
  const list = mixes.map((m, i) => {
    const d = ry.playlist0 + i * ry.playlistStep;
    const l = leaders(m);
    const quoi = l.length > 1 ? `${joinFr(l.map((r) => r.label))} à égalité` : `Surtout ${SIGLE_ARTICLE[l[0].key]}`;
    const segs = [...m.rows].sort((a, b) => (rank.get(a.key) ?? 9) - (rank.get(b.key) ?? 9))
      .filter((r) => r.sovPct > 0)
      .map((r, k, all) => `<div style="flex:${k === all.length - 1 ? `1 1 ${r.sovPct}%` : `0 0 ${r.sovPct}%`};background:${r.color}">${r.sovPct >= 12 ? esc(r.label) : ""}</div>`).join("");
    return `<div class="row" style="animation:fadeUp .6s ${d}s both">
      <div class="line"><b>${esc(m.nom)}</b><span style="color:${l.length > 1 ? COLORS.soft : l[0].color}">${esc(quoi)}</span></div>
      <div class="mix" style="animation:wipe ${ry === LONG ? 1 : .35}s ${d + (ry === LONG ? .25 : .08)}s both">${segs}</div>
    </div>`;
  }).join("");
  return {
    id: "playlist", duration: ry.playlist0 + mixes.length * ry.playlistStep + ry.playlistTail,
    html: `${head("Média par média · depuis minuit", title)}
      <div class="rows">${list}</div>`,
  };
}

function sceneTon(rows: RowView[], ry: Rythme = LONG): Scene {
  const list = rows.map((r, i) => {
    const d = ry.ton0 + i * ry.tonStep;
    return `<div class="row" style="animation:fadeUp .5s ${d}s both">
      ${pchip(r)}${needle(r, d + .3)}
      <div class="lab" style="color:${TONE[r.toneDirection]}">${esc(cap(TONE_MOT[r.toneDirection]))}</div>
    </div>`;
  }).join("");
  return {
    id: "ton", duration: ry.tonTail,
    html: `${head("Le ton · depuis minuit", cap(`un ton ${tonGroupes(rows).join(", ")}`))}
      <div class="legend mono" ${anim("fadeIn", .5, .8)}><span style="color:${TONE.negative}">← Défavorable</span><span style="color:${TONE.positive}">Favorable →</span></div>
      <div class="rows">${list}</div>`,
  };
}

function sceneCampagne(data: PartiesData, lead: RowView): Scene | null {
  const view = data.ranges.overall;
  const rows = [...view.rows].sort((a, b) => a.rang - b.rang);
  if (!rows.length) return null;
  const tete = rows[0];
  const depuis = view.depuisLabel.replace(/\s\d{4}$/, "");
  const title = tete.key === lead.key
    ? `Depuis le début de la campagne aussi, ${SIGLE_ARTICLE[tete.key]} mène`
    : `Mais depuis le début de la campagne, c’est ${SIGLE_ARTICLE[tete.key]} qui mène`;
  // Même échelle réelle que le vumètre du jour : barre pleine = 100 %.
  const list = rows.map((r, i) => {
    const d = 0.9 + i * 0.28;
    const lit = Math.round(r.sovPct / 2.5);
    const segs = Array.from({ length: 40 }, (_, k) => `<i data-i="${k}" style="--on:${r.color}"></i>`).join("");
    return `<div class="row" style="animation:fadeUp .5s ${d}s both">
      ${pchip(r)}<div class="hvu vu" data-lit="${lit}" data-d="${d + .2}" style="flex-direction:row">${segs}</div>
      <div class="pct" style="color:${r.color}">${r.sovPct}&nbsp;%</div>
    </div>`;
  }).join("");
  return {
    id: "campagne", duration: 5.4,
    html: `${head(`Temps en Une · ${depuis}`, title)}
      <div class="rows">${list}</div>`,
  };
}

/** Version courte : la campagne en une image, comme l'accroche — le parti qui
 *  mène depuis le début, en très grand, et le vumètre de la campagne. */
function sceneCampagneCourte(data: PartiesData, lead: RowView): Scene | null {
  const view = data.ranges.overall;
  const rows = [...view.rows].sort((a, b) => a.rang - b.rang);
  if (!rows.length) return null;
  const tete = rows[0];
  const answer = cap(SIGLE_ARTICLE[tete.key]);
  return {
    id: "campagne", duration: 1.8,
    html: `
      <div class="brand mono" ${anim("fadeIn", .3, .0)}><i ${anim("grow", .4, .0)}></i>${esc(tete.key === lead.key ? "Et depuis le début de la campagne" : "Mais depuis le début de la campagne")}</div>
      <div class="result">
        <div class="answer disp" style="color:${tete.color};font-size:${answer.length <= 5 ? 270 : 230}px;animation:slam .45s .1s both">${esc(answer)}</div>
        <div class="then disp" ${anim("fadeUp", .4, .35)}>${esc(tete.key === lead.key ? "mène aussi" : "mène")}, avec ${tete.sovPct}&nbsp;%</div>
      </div>
      <div class="mini">${rows.map((r, i) => `<div class="col">${vuColumn(r, 250, .4 + i * .04)}<b style="background:${r.color}">${esc(r.label)}</b></div>`).join("")}</div>`,
  };
}

// Vumètres, compteurs et aiguilles pilotés par le temps.
const SCRIPT = `
const ease=k=>1-Math.pow(1-k,3);
const clamp=k=>Math.max(0,Math.min(1,k));
window.onSceneTime=function(id,t){
  const sc=document.getElementById(id);
  sc.querySelectorAll(".vu").forEach(v=>{
    const lit=Math.round(+v.dataset.lit*ease(clamp((t-+v.dataset.d)/(window.VU_DUREE||1.1))));
    v.querySelectorAll("i").forEach(s=>s.classList.toggle("on",+s.dataset.i<lit));
  });
  sc.querySelectorAll(".count").forEach(n=>{
    n.textContent=Math.round(+n.dataset.n*ease(clamp((t-+n.dataset.d)/1.1)))+"\\u00A0%";
  });
  sc.querySelectorAll(".needle .n").forEach(g=>{
    g.style.transform="rotate("+((+g.dataset.to-50)/50*60*ease(clamp((t-+g.dataset.d)/1.2)))+"deg)";
  });
};`;

// ── Légende Instagram ───────────────────────────────────────────────────────
// Récit suivi, puis le lien, puis les mots-clics (GABARIT.md).
function caption(edition: EditionRef, data: PartiesData, rows: RowView[], mixes: MediaMix[]): string {
  const [lead, ...rest] = rows;
  const date = edition.dateLabel.replace(/\s\d{4}$/, "");

  const p1 = [
    `${date}, édition de ${pubHourLabel(edition)}. Depuis minuit, ${NOM_ARTICLE[lead.key]} est le parti dont on parle le plus dans les Unes des médias québécois : ${lead.sovPct} % du temps que les Unes consacrent aux partis.`,
    rest.length ? `Suivent ${joinFr(rest.map((r) => `${SIGLE_ARTICLE[r.key]} (${r.sovPct} %)`))}.` : null,
  ];

  const parMedia = mixes.map((m) => {
    const l = leaders(m);
    return l.length > 1
      ? `${joinFr(l.map((r) => SIGLE_ARTICLE[r.key]))} à égalité ${m.dans} (${l[0].sovPct} % chacun)`
      : `${SIGLE_ARTICLE[l[0].key]} ${m.dans} (${l[0].sovPct} %)`;
  });
  const p2 = parMedia.length ? [`D’un média à l’autre, le parti le plus présent change : ${joinFr(parMedia)}.`] : [];

  const groupes = tonGroupes(rows);
  const p3 = groupes.length ? [`Le ton des phrases qui les nomment est ${groupes.join(", ")}.`] : [];

  const campagne = [...data.ranges.overall.rows].sort((a, b) => a.rang - b.rang)[0];
  const p4 = campagne ? [
    campagne.key === lead.key
      ? `Depuis le début de la campagne aussi, ${NOM_ARTICLE[campagne.key]} mène, avec ${campagne.sovPct} %.`
      : `Depuis le début de la campagne, c’est ${NOM_ARTICLE[campagne.key]} qui mène, avec ${campagne.sovPct} %.`,
  ] : [];

  const paragraphs = [p1, p2, p3, p4, [`${MODULE}, six fois par jour : vitrinedemocratique.com`], [HASHTAGS.join(" ")]]
    .map((p) => p.filter(Boolean).join(" ")).filter(Boolean);
  return captionTypo(paragraphs.join("\n\n")) + "\n";
}

/** Légende de la version courte : trois phrases, le lien, les mots-clics. */
function captionCourte(edition: EditionRef, data: PartiesData, rows: RowView[]): string {
  const lead = rows[0];
  const campagne = [...data.ranges.overall.rows].sort((a, b) => a.rang - b.rang)[0];
  const groupes = tonGroupes(rows);
  const phrases = [
    `Aujourd’hui, ${NOM_ARTICLE[lead.key]} domine les Unes : ${lead.sovPct} % du temps consacré aux partis.`,
    groupes.length ? `Le ton : ${groupes.join(", ")}.` : null,
    campagne ? (campagne.key === lead.key
      ? `Et depuis le début de la campagne, ${SIGLE_ARTICLE[campagne.key]} mène aussi.`
      : `Mais depuis le début de la campagne, c’est ${SIGLE_ARTICLE[campagne.key]} qui mène.`) : null,
  ].filter(Boolean).join(" ");
  return captionTypo([phrases, `${MODULE}, six fois par jour : vitrinedemocratique.com`, HASHTAGS.join(" ")].join("\n\n")) + "\n";
}

// ── Programme ───────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { edition, current } = await resolveEdition(args);
  // Édition passée : mêmes deux bornes que la section du site (jour + instant).
  const past = edition.key !== current.key;
  const data = await loadParties(past ? edition.navDateIso : undefined, past ? instantPublicationBloc(edition.key) ?? undefined : undefined);
  if (!data) throw new Error("Aucune donnée de partis.");
  if (data.indisponible) throw new Error(`Module indisponible (${data.indisponible.raison}, dernière donnée : ${data.indisponible.lastDateLabel}).`);
  const rows = [...data.ranges.today.rows].sort((a, b) => a.rang - b.rang);
  const mixes = mediaMixes(data);
  console.log(`${MODULE} · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);
  console.log(`  en tête : ${rows[0].label} (${rows[0].sovPct} %) · ${mixes.length} médias`);

  const court = !!args.court;
  const scenes = (court
    ? [sceneAccroche(rows, COURT), scenePlaylist(mixes, rows, COURT), sceneCampagneCourte(data, rows[0])]
    : [sceneAccroche(rows), sceneJour(rows), scenePlaylist(mixes, rows), sceneTon(rows), sceneCampagne(data, rows[0])]
  ).filter((s): s is Scene => s !== null);

  const logos = await loadLogos();
  scenes.push(sceneFin({ pubHour: edition.pubHour, signature: "De quel parti parlent les médias", logo: logos.vitrine, accent: IDENTITE.accent, partenaires: await chargerPartenaires() }));
  // Fin plus brève dans la version courte : les partenaires ont fini d'apparaître à ~2,9 s.
  if (court) {
    // La fin prend ce qui reste (3 s au plus) : un jour à six médias, la
    // playlist est plus longue et la fin raccourcit d'autant.
    const avant = scenes.slice(0, -1).reduce((t, sc) => t + sc.duration, 0);
    scenes[scenes.length - 1].duration = Math.min(3.0, COURT_MAX_S / SLOW - avant);
    const total = scenes.reduce((t, sc) => t + sc.duration, 0) * SLOW;
    if (total > COURT_MAX_S + 1e-6) throw new Error(`Version courte trop longue : ${total.toFixed(1)} s (maximum ${COURT_MAX_S} s).`);
    console.log(`  durée   → ${total.toFixed(1)} s (maximum ${COURT_MAX_S} s)`);
  }
  const html = buildPage({
    title: `${MODULE} · ${edition.key}`,
    css: CSS + FIN_CSS, scenes, script: (court ? "window.VU_DUREE=.5;" : "") + SCRIPT,
    footerLeft: "⚜ La Vitrine démocratique",
    footerRight: footerEdition(edition),
    logos,
    theme: { paper: IDENTITE.papier, accent: IDENTITE.accent },
  });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, `${court ? "partis-court" : "partis"}_${edition.navDateIso}_${pubHourLabel(edition)}`);
  await fs.mkdir(outDir, { recursive: true });
  // Instagram seulement pour l'instant : lib/reseaux.ts est écrit pour la Une des Unes.
  await fs.writeFile(`${base}_instagram.txt`, court ? captionCourte(edition, data, rows) : caption(edition, data, rows, mixes));
  console.log(`  instagram → ${path.basename(base)}_instagram.txt`);

  await produce({ html, scenes, title: `${MODULE}${court ? " (court)" : ""} · édition de ${pubHourLabel(edition)}`, base, args });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
