// Reels COURTS du module « Les 12 enjeux » : 8 à 12 secondes, un seul plan, une
// analyse à la fois. Chaque analyse est un fichier de `enjeux-court/analyses/`.
//
//   npm run reel:enjeux-court                        # toutes les analyses du jour, index des aperçus
//   npm run reel:enjeux-court -- --analyse domine    # une seule
//   npm run reel:enjeux-court -- --analyse domine --mp4
//   npm run reel:enjeux-court -- --liste             # les analyses et si elles s'appliquent aujourd'hui
//
// Une analyse qui ne s'applique pas aux données du jour (pas de concentration,
// pas de bond, pas de remontée) est simplement sautée.
//
// EXACTEMENT LE MÊME GABARIT que `partis-court` et `une-court` (Jules Piral,
// 2026-09-18) : en-tête de date, pied à logos et encadré de module, scène de
// fin commune, ligne de méthode, fenêtre 8–12 s. Ce qui est propre au module :
// sa couleur et son papier, ses analyses, ses mots-clics, et le PLAFOND DE
// L'AXE — 25 % ici, parce que les douze enjeux se partagent 100 % et que le
// premier tourne autour de 20.
//
// Décisions : scripts/social/GABARIT.md, section 6.

import fs from "node:fs/promises";
import path from "node:path";

import { instantPublicationBloc } from "@/lib/data/headlineEvents";
import { loadTreemap } from "@/lib/data/headlineEvents";
import { MODULES } from "@/lib/modules";

import { dateLongue, pubHourLabel, resolveEdition } from "./lib/commun";
import {
  FIN_CSS, SLOW, buildPage, chargerPartenaires, loadLogos, openInBrowser, parseArgs, produce, sceneFin, type Scene,
} from "./lib/reel";
import { ANALYSES } from "./enjeux-court/analyses";
import { DUREE_PLAN, MAX_SECONDES, MODULE, legendeComplete, scenePlanHtml, verifierDuree, type Contexte } from "./enjeux-court/plan";

/** Identité du module : couleur et papier (lib/modules.ts). */
const IDENTITE = MODULES["enjeux-saillants"];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { edition, current } = await resolveEdition(args);
  const past = edition.key !== current.key;
  const data = await loadTreemap(past ? edition.key : undefined, past ? edition.navDateIso : undefined);
  if (!data) throw new Error("Aucune donnée d’enjeux.");
  // Les douze tuiles du jour, de la plus à la moins saillante. Le loader les
  // rend déjà triées ; on ne s'en remet pas à cet ordre implicite.
  const tuiles = [...data.day.tiles].sort((a, b) => b.share - a.share);
  if (!tuiles.length) throw new Error(`Aucun enjeu pour l'édition ${edition.key}.`);
  const ctx: Contexte = { data, tuiles, tete: tuiles[0], edition };
  console.log(`${MODULE} · reels courts · ${edition.key} (édition de ${pubHourLabel(edition)}, ${edition.dateLabel})`);
  console.log(`  en tête : ${tuiles[0].issueFr} (${Math.round(tuiles[0].share)} %)`);

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
      { id: "plan", duration: DUREE_PLAN, noFadeIn: true, html: planHtml },
      sceneFin({ pubHour: edition.pubHour, logo: logos.vitrine, accent: IDENTITE.accent, partenaires }),
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
    const base = path.join(outDir, `enjeux-court-${a.id}_${edition.navDateIso}_${pubHourLabel(edition)}`);
    await fs.writeFile(`${base}_instagram.txt`, legendeComplete(plan));
    console.log(`\n▶ ${a.id} — ${a.idee}`);
    await produce({ html, scenes, title: `${MODULE} · ${a.id}`, base, args: plusieurs ? { ...args, "sans-ouvrir": true } : args });
    faits.push({ id: a.id, idee: a.idee, apercu: `${path.basename(base)}_apercu.html` });
  }

  // Plusieurs analyses : une page qui les rassemble, pour les comparer d'un coup d'œil.
  if (plusieurs && faits.length && !args.mp4 && typeof args.apercu !== "string") {
    const index = path.join(outDir, `enjeux-court_${edition.navDateIso}_${pubHourLabel(edition)}_index.html`);
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
