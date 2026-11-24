// Image fixe Facebook du module 1 — La Une des Unes, récapitulatif de la journée.
//
//   npm run image:une-des-unes                        # l'édition la plus récente
//   npm run image:une-des-unes -- --edition 2026-09-24T23
//   npm run image:une-des-unes -- --sans-illustration
//
// Sortie : social-out/une-des-unes_<date>_<heure>_facebook-image.png et sa
// légende `_facebook-image.txt`. Le premier commentaire est celui du reel de la
// même édition (`_commentaire.txt`), le même partout.
//
// Pendant fixe du reel `une-des-unes.ts`, pour le fil Facebook : 1080 × 1350
// (4:5), le plus grand format portrait que le fil affiche sans le rogner. Pensé
// pour l'édition de 20h, dont la fenêtre de 24 heures couvre la journée.
//
// Mêmes règles que le reel (GABARIT.md) : les données viennent des loaders du
// site (`loadHeadlineEvents`), aucun chiffre ni phrase n'est inventé, logos de
// la Vitrine et du CAPP, palette du module. Il montre le dépôt LOCAL : `git pull`
// avant de tourner.

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

import { listEditions, loadHeadlineEvents, type EditionRef, type UneEvent } from "@/lib/data/headlineEvents";
import { MODULES } from "@/lib/modules";
import { matchesCurrentUneArt } from "@/lib/shareUneArt";
import { formats, type Matiere } from "./lib/reseaux";
import { COLORS, SALIENCE_COLORS, SITE_URL, celestial, enjeuGlyph, esc, frNum, loadLogos, openInBrowser, parseArgs, txt } from "./lib/reel";

const MODULE = MODULES["une-des-unes"];
const W = 1080;
const H = 1350;
/** Plus petit texte admis. Le fil affiche l'image à ~390 points de large, soit
 *  36 % : 26 px ≈ 9,5 points, comme le plancher des reels. */
const MIN_FONT = 26;
const ART_CREDIT = "Image générée sous la direction de Mathieu Fortin";

// ── Illustration ────────────────────────────────────────────────────────────
// Même garde que le reel (`resolveArt`, une-des-unes.ts) et que le module :
// `latest.png` n'illustre que l'édition COURANTE, et seulement si elle
// appartient à la nouvelle n°1. Dans le doute, pas d'image.
async function resolveArt(edition: EditionRef, current: EditionRef, top: UneEvent): Promise<string | null> {
  if (edition.key !== current.key) return null;
  const dir = path.resolve(process.cwd(), "public", "data", "generated-art");
  try {
    const meta = JSON.parse(await fs.readFile(path.join(dir, "latest.json"), "utf8"));
    if (matchesCurrentUneArt(meta, top)) {
      return `data:image/png;base64,${(await fs.readFile(path.join(dir, "latest.png"))).toString("base64")}`;
    }
  } catch { /* pas de copie locale : on tente le site */ }
  try {
    const hero = (await (await fetch(`${SITE_URL}/data/hero-selection.json`)).json()) as { storyline_id?: string; event_id?: string };
    if (!matchesCurrentUneArt(hero, top)) {
      console.warn("  illustration ignorée : le site publié illustre une autre Une que le dépôt local.");
      return null;
    }
    const res = await fetch(`${SITE_URL}/data/generated-art/latest.png?v=${Date.now()}`);
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    console.warn("  illustration indisponible (site injoignable) : mise en page sans image.");
    return null;
  }
}

// ── Formulations (mêmes que le reel) ────────────────────────────────────────
const pubHourLabel = (edition: EditionRef) => `${edition.pubHour % 24}h`;
const band = (rank: number) => SALIENCE_COLORS[rank] ?? { bg: COLORS.rule, fg: COLORS.ink };
const couverture = (e: UneEvent) =>
  `${e.qcOutletCount}/${e.totalQcOutlets} ${e.qcOutletCount > 1 ? "des grands médias québécois en parlent" : "des grands médias québécois en parle"}`;

/** « Saillance très élevée, 43,7 pts, −24 % / ce midi » — `mesure` du reel. */
function mesure(e: UneEvent): string {
  const bouts = [`Saillance ${e.saillanceLabel.toLowerCase()}`];
  if (e.scoreQcSum24h != null) bouts.push(`${frNum(e.scoreQcSum24h)} pts`);
  const pts = e.salienceTrend?.points ?? [];
  const last = pts[pts.length - 1];
  if (last?.delta != null && last.deltaDepuis) {
    bouts.push(`${last.delta > 0 ? "+" : "−"}${Math.abs(Math.round(last.delta))} % / ${last.deltaDepuis}`);
  } else if (last?.isFirst) {
    bouts.push("nouveau");
  }
  return bouts.join(", ");
}

function matiere(edition: EditionRef, classement: UneEvent[]): Matiere {
  return {
    titre: `Récapitulatif de la journée : les faits saillants au Québec (${edition.dateLabel})`,
    items: classement.map((e, i) => `${i + 1}. ${e.title} (${mesure(e)})`),
    titresSeuls: classement.map((e) => e.title),
    lien: "vitrinedemocratique.com",
  };
}

// ── Mise en page ────────────────────────────────────────────────────────────
// Colonne verticale : marque, illustration, titre du récapitulatif, n°1, n°2 et
// n°3, pied. L'illustration prend la hauteur qui reste (flex), de sorte qu'un
// titre long la réduit au lieu de pousser le pied hors de l'image.
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${MODULE.papier};color:${COLORS.ink};font-family:"Source Serif 4",serif;display:flex;flex-direction:column}
.mono{font-family:"IBM Plex Mono",monospace;letter-spacing:.02em}
.pf{font-family:"Playfair Display",serif}
.brand{display:flex;align-items:center;justify-content:center;gap:34px;padding:34px 0 26px;flex:none}
.art{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.art::after{content:"";position:absolute;inset:auto 0 0 0;height:45%;background:linear-gradient(transparent,${MODULE.papier})}
.art .credit{position:absolute;right:64px;bottom:14px;z-index:1;display:flex;align-items:center;gap:12px;font-style:italic;font-size:${MIN_FONT}px;color:${COLORS.softer}}
.art .credit::before{content:"";width:40px;height:1px;background:${COLORS.softer}}
.noart{flex:1 1 auto;min-height:0}
.head{flex:none;padding:18px 64px 0}
.kicker{display:flex;align-items:center;gap:14px;color:${MODULE.accent};font-size:28px;text-transform:uppercase}
.kicker::after{content:"";flex:1;height:2px;background:${MODULE.accent}}
.date{display:flex;align-items:center;gap:12px;margin-top:10px;font-size:30px;color:${COLORS.soft}}
.list{flex:none;padding:18px 64px 0}
.item+.item{margin-top:16px;padding-top:16px;border-top:1px solid color-mix(in srgb, ${MODULE.papier}, #000 20%)}
.tag{display:inline-flex;align-items:center;gap:10px;color:${COLORS.paper};font-size:26px;letter-spacing:0;padding:5px 12px}
.item h2{font-size:34px;line-height:1.1;font-weight:700;margin-top:8px}
.item.n1 h2{font-size:52px;line-height:1.04;font-weight:900}
.stats{display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px;margin-top:8px;font-size:26px;color:${COLORS.soft}}
.stats span{white-space:nowrap}
.n1 .stats{margin-top:12px;font-size:28px}
.badge{padding:3px 12px;font-weight:500}
.foot{flex:none;display:flex;justify-content:space-between;align-items:center;margin:26px 64px 34px;padding-top:16px;border-top:2px solid ${MODULE.accent};font-size:27px;color:${COLORS.soft}}
.foot b{color:${COLORS.ink};font-weight:500}
`;

function item(e: UneEvent, i: number): string {
  const b = band(e.saillanceRank);
  const pts = e.scoreQcSum24h != null ? ` · ${frNum(e.scoreQcSum24h)} pts` : "";
  return `<div class="item${i === 0 ? " n1" : ""}">
  <span class="tag mono" style="background:${e.issueColor}">${enjeuGlyph(e.issueKey, COLORS.paper, i === 0 ? 30 : 26)}N°${i + 1} · ${esc(e.issueFr)}</span>
  <h2 class="pf">${txt(e.title)}</h2>
  <div class="stats"><span class="badge" style="background:${b.bg};color:${b.fg}">Saillance ${esc(e.saillanceLabel.toLowerCase())}${pts}</span><span>${txt(couverture(e))}</span></div>
</div>`;
}

function page(opts: { edition: EditionRef; classement: UneEvent[]; art: string | null; logos: { vitrine: string; capp: string } }): string {
  const { edition, classement, art, logos } = opts;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>La Une des Unes · ${esc(edition.key)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Serif+4:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=block" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="brand"><img src="${logos.vitrine}" alt="La Vitrine démocratique" style="height:58px"><img src="${logos.capp}" alt="CAPP" style="height:29px"></div>
${art ? `<div class="art"><img src="${art}" alt=""><span class="credit">${esc(ART_CREDIT)}</span></div>` : `<div class="noart"></div>`}
<div class="head">
  <div class="kicker mono">La Une des Unes · Récapitulatif de la journée</div>
  <div class="date">${celestial(edition.pubHour, COLORS.soft, 30)}<span>${esc(edition.dateLabel)} · les trois nouvelles les plus saillantes</span></div>
</div>
<div class="list">${classement.map(item).join("\n")}</div>
<div class="foot"><span>Mesuré toutes les 4 heures · <b>vitrinedemocratique.com</b></span><span class="mono">Édition de ${pubHourLabel(edition)}</span></div>
</body></html>`;
}

// ── Contrôle ────────────────────────────────────────────────────────────────
// Rien ne sort de la colonne (marge de 64 px ; l'illustration seule va aux
// bords), aucun texte sous le plancher, et l'illustration
// garde assez de hauteur pour se lire (sinon, mieux vaut s'en passer).
async function controle(p: import("playwright").Page): Promise<string[]> {
  return p.evaluate(({ W, H, MIN_FONT }) => {
    const fautes: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.closest("svg") || !el.getClientRects().length) continue;
      // Seuls les textes et les images comptent : les conteneurs couvrent la
      // largeur entière et portent la marge en padding.
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own && el.tagName !== "IMG") continue;
      const r = el.getBoundingClientRect();
      const bord = el.closest(".art") && !el.closest(".credit") ? 0 : 60;
      if (r.bottom > H - 20 || r.right > W - bord + 0.5 || r.left < bord - 0.5) {
        fautes.push(`déborde : ${el.className || el.tagName} « ${(el.textContent ?? "").trim().slice(0, 30)} » (x ${Math.round(r.left)}→${Math.round(r.right)}, bas ${Math.round(r.bottom)})`);
      }
      if (own && parseFloat(getComputedStyle(el).fontSize) < MIN_FONT) fautes.push(`texte trop petit : « ${el.textContent!.trim().slice(0, 40)} »`);
    }
    const art = document.querySelector(".art");
    if (art && art.getBoundingClientRect().height < 220) fautes.push(`illustration écrasée (${Math.round(art.getBoundingClientRect().height)} px) : relancer avec --sans-illustration`);
    return fautes;
  }, { W, H, MIN_FONT });
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
  if (edition === current && ageH > 5) console.warn(`  ⚠️ La dernière édition du dépôt date de ${Math.round(ageH)} h. Faites « git pull ».`);
  if (edition.pubHour !== 20) console.warn(`  ⚠️ Édition de ${pubHourLabel(edition)} : le récapitulatif de la journée est pensé pour celle de 20h.`);

  // Classement PUR des nouvelles de la fenêtre 24 h, comme la scène
  // « Les trois nouvelles les plus saillantes » du reel ; cinq pour la légende.
  const data = await loadHeadlineEvents(edition.key, { classement: 5 });
  const classement = data?.classement ?? data?.top3 ?? [];
  if (!classement.length) throw new Error(`Aucune Une pour l'édition ${edition.key}.`);
  console.log(`La Une des Unes · image Facebook · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);
  classement.slice(0, 3).forEach((e, i) => console.log(`  n°${i + 1} : ${e.title}`));

  const art = args["sans-illustration"] ? null : await resolveArt(edition, current, classement[0]);
  const html = page({ edition, classement: classement.slice(0, 3), art, logos: await loadLogos() });

  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  const base = path.join(outDir, `une-des-unes_${edition.navDateIso}_${pubHourLabel(edition)}_facebook-image`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${base}.html`, html);
  await fs.writeFile(`${base}.txt`, formats(matiere(edition, classement)).facebook);

  // Page ouverte depuis le disque (goto) : injectée, elle vivrait sur
  // about:blank et Chromium y refuserait les polices (cf. cartes-deputes.ts).
  // Repli sur le Chrome du poste, comme `launch` de lib/reel.ts.
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  try {
    const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await p.goto(pathToFileURL(`${base}.html`).href, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    const fautes = await controle(p);
    if (fautes.length) {
      console.error(`  ✗ gabarit :\n    ${fautes.join("\n    ")}`);
      process.exitCode = 1;
    } else {
      console.log("  gabarit → bords, lisibilité et hauteur de l'illustration respectés");
    }
    await p.screenshot({ path: `${base}.png`, type: "png" });
  } finally {
    await browser.close();
  }
  console.log(`  image    → ${path.basename(base)}.png`);
  console.log(`  légende  → ${path.basename(base)}.txt`);
  if (!args["sans-ouvrir"]) openInBrowser(`${base}.png`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
