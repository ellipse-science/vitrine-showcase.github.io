// Reels COURTS du module « La Une des Unes » : 12 secondes, un seul plan, une
// analyse à la fois. Chaque analyse est un fichier de `une-court/analyses/`.
//
//   npm run reel:une-court                        # toutes les analyses du jour, index des aperçus
//   npm run reel:une-court -- --analyse bond      # une seule
//   npm run reel:une-court -- --analyse bond --mp4
//   npm run reel:une-court -- --liste             # les analyses et si elles s'appliquent aujourd'hui
//
// Une analyse qui ne s'applique pas aux données du jour (pas de bond, pas de
// nouvelle qui s'installe…) est simplement sautée.
//
// Décisions : scripts/social/GABARIT.md, section 4 (version courte).

import fs from "node:fs/promises";
import path from "node:path";

import { loadHeadlineEvents } from "@/lib/data/headlineEvents";
import { MODULES } from "@/lib/modules";

import { dateLongue, pubHourLabel, resolveEdition } from "./lib/commun";
import {
  FIN_CSS, SLOW, buildPage, chargerPartenaires, loadLogos, openInBrowser, parseArgs, produce, sceneFin, type Scene,
} from "./lib/reel";
import { ANALYSES } from "./une-court/analyses";
import { DUREE_PLAN, MAX_SECONDES, verifierDuree, MODULE, legendeComplete, scenePlanHtml, type Contexte } from "./une-court/plan";

/** Identité du module : couleur et papier (lib/modules.ts). */
const IDENTITE = MODULES["une-des-unes"];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { edition } = await resolveEdition(args);
  const data = await loadHeadlineEvents(edition.key, { classement: 5 });
  const classement = data?.classement ?? data?.top3 ?? [];
  if (!classement.length) throw new Error(`Aucune Une pour l'édition ${edition.key}.`);
  const ctx: Contexte = { classement, top: classement[0], edition };
  console.log(`${MODULE} · reels courts · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);
  console.log(`  n°1 : ${ctx.top.title}`);

  const choix = typeof args.analyse === "string" ? ANALYSES.filter((a) => a.id === args.analyse) : ANALYSES;
  if (!choix.length) throw new Error(`Analyse « ${args.analyse} » inconnue. Analyses : ${ANALYSES.map((a) => a.id).join(", ")}`);

  const plans = choix.map((a) => ({ a, plan: a.construire(ctx) }));
  for (const { a, plan } of plans) console.log(`  ${plan ? "✓" : "·"} ${a.id.padEnd(11)} ${a.idee}${plan ? "" : "  (sans objet aujourd’hui)"}`);
  if (args.liste) return;

  const logos = await loadLogos();
  const partenaires = await chargerPartenaires();
  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out");
  await fs.mkdir(outDir, { recursive: true });
  const plusieurs = choix.length > 1;
  const faits: { id: string; idee: string; apercu: string }[] = [];

  for (const { a, plan } of plans) {
    if (!plan) continue;
    const { html: planHtml, css, script } = scenePlanHtml(plan);
    const scenes: Scene[] = [
      // LA DATE RESTE À L'ÉCRAN (Jules Piral, 2026-09-18) : le plan la masquait, et
      // la fin n'en portait aucune — un reel court sortait donc SANS date, du
      // début à la fin. C'est le format qui part sur Instagram et TikTok.
      { id: "plan", duration: DUREE_PLAN, noFadeIn: true, html: planHtml },
      sceneFin({ pubHour: edition.pubHour, signature: "Ce qui domine l’actualité du Québec", logo: logos.vitrine, accent: IDENTITE.accent, partenaires }),
    ];
    // La fin prend ce qui reste sous le plafond, puis on VÉRIFIE la fenêtre.
    scenes[1].duration = Math.min(3.5, MAX_SECONDES / SLOW - DUREE_PLAN);
    verifierDuree((DUREE_PLAN + scenes[1].duration) * SLOW, `reel court « ${a.id} »`);
    const html = buildPage({
      title: `${MODULE} · ${a.id} · ${edition.key}`,
      css: css + FIN_CSS, scenes, script,
      footerLeft: "La Vitrine démocratique",
      date: dateLongue(edition),
      module: { nom: IDENTITE.nom, couleur: IDENTITE.accent },
      logos,
      theme: { paper: IDENTITE.papier, accent: IDENTITE.accent },
    });
    const base = path.join(outDir, `une-court-${a.id}_${edition.navDateIso}_${pubHourLabel(edition)}`);
    await fs.writeFile(`${base}_instagram.txt`, legendeComplete(plan));
    console.log(`\n▶ ${a.id} — ${a.idee}`);
    await produce({ html, scenes, title: `${MODULE} · ${a.id}`, base, args: plusieurs ? { ...args, "sans-ouvrir": true } : args });
    faits.push({ id: a.id, idee: a.idee, apercu: `${path.basename(base)}_apercu.html` });
  }

  // Plusieurs analyses : une page qui les rassemble, pour les comparer d'un coup d'œil.
  if (plusieurs && faits.length && !args.mp4 && typeof args.apercu !== "string") {
    const index = path.join(outDir, `une-court_${edition.navDateIso}_${pubHourLabel(edition)}_index.html`);
    await fs.writeFile(index, `<!doctype html><meta charset="utf-8"><title>Reels courts · ${MODULE}</title>
<style>body{margin:0;background:#1C1917;color:#F3ECDD;font:15px "IBM Plex Mono",monospace;padding:24px}h1{font:700 22px Georgia,serif;margin:0 0 18px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}.c{background:#292524;padding:10px}
.c iframe{width:100%;aspect-ratio:9/16;border:0;background:#000}.c a{color:#F3ECDD}.c b{display:block;margin:8px 0 2px}.c span{opacity:.75}</style>
<h1>Reels courts · ${MODULE} · édition de ${pubHourLabel(edition)} (${edition.dateLabel})</h1><div class="g">
${faits.map((f) => `<div class="c"><iframe src="${f.apercu}?mini" loading="lazy"></iframe><a href="${f.apercu}" target="_blank"><b>${f.id}</b></a><span>${f.idee}</span></div>`).join("\n")}
</div>`);
    console.log(`\n  index   → ${index}`);
    if (!args["sans-ouvrir"]) openInBrowser(index);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
