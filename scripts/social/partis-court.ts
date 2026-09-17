// Reels COURTS du module « Partis et couverture » : 12 secondes, un seul plan,
// une analyse à la fois. Chaque analyse est un fichier de `partis-court/analyses/`.
//
//   npm run reel:partis-court                         # toutes les analyses du jour, index des aperçus
//   npm run reel:partis-court -- --analyse record     # une seule
//   npm run reel:partis-court -- --analyse record --mp4
//   npm run reel:partis-court -- --liste              # les analyses et si elles s'appliquent aujourd'hui
//
// Une analyse qui ne s'applique pas aux données du jour (pas de record, pas de
// bascule…) est simplement sautée : on ne force jamais une histoire.
//
// Décisions : scripts/social/GABARIT.md, section 4 (version courte).

import fs from "node:fs/promises";
import path from "node:path";

import { instantPublicationBloc } from "@/lib/data/headlineEvents";
import { loadParties } from "@/lib/data/parties";

import { footerEdition, pubHourLabel, resolveEdition } from "./lib/commun";
import { IDENTITE, MODULE, mediaMixes } from "./lib/partis";
import {
  FIN_CSS, SLOW, buildPage, chargerPartenaires, loadLogos, openInBrowser, parseArgs, produce, sceneFin, type Scene,
} from "./lib/reel";
import { ANALYSES } from "./partis-court/analyses";
import { DUREE_PLAN, MAX_SECONDES, legendeComplete, scenePlanHtml, type Contexte } from "./partis-court/plan";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { edition, current } = await resolveEdition(args);
  const past = edition.key !== current.key;
  const data = await loadParties(past ? edition.navDateIso : undefined, past ? instantPublicationBloc(edition.key) ?? undefined : undefined);
  if (!data) throw new Error("Aucune donnée de partis.");
  if (data.indisponible) throw new Error(`Module indisponible (${data.indisponible.raison}).`);
  const rows = [...data.ranges.today.rows].sort((a, b) => a.rang - b.rang);
  const ctx: Contexte = { data, rows, mixes: mediaMixes(data), edition };
  console.log(`${MODULE} · reels courts · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);

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
      { id: "plan", duration: DUREE_PLAN, noFadeIn: true, hideFooter: true, html: planHtml },
      sceneFin({ pubHour: edition.pubHour, signature: "De quel parti parlent les médias", logo: logos.vitrine, accent: IDENTITE.accent, partenaires }),
    ];
    // 12 secondes, fin comprise : la fin prend ce qui reste.
    scenes[1].duration = Math.min(3.5, MAX_SECONDES / SLOW - DUREE_PLAN);
    const html = buildPage({
      title: `${MODULE} · ${a.id} · ${edition.key}`,
      css: css + FIN_CSS, scenes, script,
      footerLeft: "⚜ La Vitrine démocratique",
      footerRight: footerEdition(edition),
      logos,
      theme: { paper: IDENTITE.papier, accent: IDENTITE.accent },
    });
    const base = path.join(outDir, `partis-court-${a.id}_${edition.navDateIso}_${pubHourLabel(edition)}`);
    await fs.writeFile(`${base}_instagram.txt`, legendeComplete(plan));
    console.log(`\n▶ ${a.id} — ${a.idee}`);
    await produce({ html, scenes, title: `${MODULE} · ${a.id}`, base, args: plusieurs ? { ...args, "sans-ouvrir": true } : args });
    faits.push({ id: a.id, idee: a.idee, apercu: `${path.basename(base)}_apercu.html` });
  }

  // Plusieurs analyses : une page qui les rassemble, pour les comparer d'un coup d'œil.
  if (plusieurs && faits.length && !args.mp4 && typeof args.apercu !== "string") {
    const index = path.join(outDir, `partis-court_${edition.navDateIso}_${pubHourLabel(edition)}_index.html`);
    await fs.writeFile(index, `<!doctype html><meta charset="utf-8"><title>Reels courts · ${MODULE}</title>
<style>body{margin:0;background:#1C1917;color:#F3ECDD;font:15px "IBM Plex Mono",monospace;padding:24px}h1{font:700 22px Georgia,serif;margin:0 0 18px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}.c{background:#292524;padding:10px}
.c iframe{width:100%;aspect-ratio:9/16;border:0;background:#000}.c b{display:block;margin:8px 0 2px}.c span{opacity:.75}</style>
<h1>Reels courts · ${MODULE} · édition de ${pubHourLabel(edition)} (${edition.dateLabel})</h1><div class="g">
${faits.map((f) => `<div class="c"><iframe src="${f.apercu}"></iframe><b>${f.id}</b><span>${f.idee}</span></div>`).join("\n")}
</div>`);
    console.log(`\n  index   → ${index}`);
    if (!args["sans-ouvrir"]) openInBrowser(index);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
