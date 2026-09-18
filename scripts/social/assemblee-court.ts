// Reels COURTS du module « L'alignement de l'Assemblée » : 8 à 12 secondes, un
// seul plan, une analyse à la fois.
//
//   npm run reel:assemblee-court                      # toutes les analyses
//   npm run reel:assemblee-court -- --analyse chefs   # une seule
//   npm run reel:assemblee-court -- --analyse chefs --mp4
//   npm run reel:assemblee-court -- --liste           # ce qui s'applique
//   npm run reel:assemblee-court -- --periode session # last_pdq | session | legislature
//
// EXACTEMENT LE MÊME GABARIT que `partis-court`, `une-court` et `enjeux-court` :
// en-tête de date, pied à logos et encadré de module, scène de fin commune,
// ligne de méthode, fenêtre 8–12 s.
//
// ⚠️ LA PÉRIODE PAR DÉFAUT EST LA LÉGISLATURE (Jules Piral, 2026-09-18) : c'est
// la seule vue qui couvre le mandat entier, donc la seule où l'absence d'un chef
// se lit comme un fait et non comme un trou de données.

import fs from "node:fs/promises";
import path from "node:path";

import { loadAssemblee, type PeriodKey } from "@/lib/data/assemblee";

import { dateLongue, pubHourLabel, resolveEdition } from "./lib/commun";
import {
  FIN_CSS, SLOW, buildPage, chargerPartenaires, loadLogos, openInBrowser, parseArgs, produce, sceneFin, type Scene,
} from "./lib/reel";
import { ANALYSES } from "./assemblee-court/analyses";
import {
  DUREE_PLAN, IDENTITE, MAX_SECONDES, MODULE, chargerPortraits, legendeComplete, scenePlanHtml, verifierDuree, type Contexte,
} from "./assemblee-court/plan";

const PERIODES: PeriodKey[] = ["last_pdq", "session", "legislature"];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { edition } = await resolveEdition(args);
  const demandee = typeof args.periode === "string" ? args.periode as PeriodKey : "legislature";
  if (!PERIODES.includes(demandee)) throw new Error(`Période « ${args.periode} » inconnue. Périodes : ${PERIODES.join(", ")}`);

  const data = await loadAssemblee();
  if (!data) throw new Error("Aucune donnée de l’Assemblée nationale.");
  const vue = data.periods[demandee];
  const chemins = vue.rows.flatMap((r) => (r.deputies ?? []).map((d) => d.portrait));
  const portraits = await chargerPortraits(chemins);
  const ctx: Contexte = { data, periode: demandee, edition, portraits };
  console.log(`${MODULE} · reels courts · ${vue.tabLabel} (${vue.subtitle})`);
  console.log(`  ${vue.lastUpdated}`);

  const choix = typeof args.analyse === "string" ? ANALYSES.filter((a) => a.id === args.analyse) : ANALYSES;
  if (!choix.length) throw new Error(`Analyse « ${args.analyse} » inconnue. Analyses : ${ANALYSES.map((a) => a.id).join(", ")}`);

  const plans = choix.map((a) => ({ a, plan: a.construire(ctx) }));
  for (const { a, plan } of plans) console.log(`  ${plan ? "✓" : "·"} ${a.id.padEnd(11)} ${a.idee}${plan ? "" : "  (sans objet)"}`);
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
      { id: "plan", duration: DUREE_PLAN, noFadeIn: true, html: planHtml },
      sceneFin({ pubHour: edition.pubHour, logo: logos.vitrine, accent: IDENTITE.accent, partenaires }),
    ];
    scenes[1].duration = Math.min(3.5, MAX_SECONDES / SLOW - DUREE_PLAN);
    verifierDuree((DUREE_PLAN + scenes[1].duration) * SLOW, `reel court « ${a.id} »`);
    const html = buildPage({
      title: `${MODULE} · ${a.id} · ${demandee}`,
      css: css + FIN_CSS, scenes, script,
      footerLeft: "La Vitrine démocratique",
      date: dateLongue(edition),
      module: { nom: IDENTITE.nom, couleur: IDENTITE.accent },
      logos,
      theme: { paper: IDENTITE.papier, accent: IDENTITE.accent },
    });
    const base = path.join(outDir, `assemblee-court-${a.id}_${edition.navDateIso}_${pubHourLabel(edition)}`);
    await fs.writeFile(`${base}_instagram.txt`, legendeComplete(plan));
    console.log(`\n▶ ${a.id} — ${a.idee}`);
    await produce({ html, scenes, title: `${MODULE} · ${a.id}`, base, args: plusieurs ? { ...args, "sans-ouvrir": true } : args });
    faits.push({ id: a.id, idee: a.idee, apercu: `${path.basename(base)}_apercu.html` });
  }

  if (plusieurs && faits.length && !args.mp4 && typeof args.apercu !== "string") {
    const index = path.join(outDir, `assemblee-court_${edition.navDateIso}_${pubHourLabel(edition)}_index.html`);
    await fs.writeFile(index, `<!doctype html><meta charset="utf-8"><title>Reels courts · ${MODULE}</title>
<style>body{margin:0;background:#1C1917;color:#F3ECDD;font:15px "IBM Plex Mono",monospace;padding:24px}h1{font:700 22px Georgia,serif;margin:0 0 18px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}.c{background:#292524;padding:10px}
.c iframe{width:100%;aspect-ratio:9/16;border:0;background:#000}.c a{color:#F3ECDD}.c b{display:block;margin:8px 0 2px}.c span{opacity:.75}</style>
<h1>Reels courts · ${MODULE} · ${vue.tabLabel}</h1><div class="g">
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
