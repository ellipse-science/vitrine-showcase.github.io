// L'ATELIER — tout ce qu'on publie, pour chaque module et chaque plateforme,
// sur une seule page.
//
//   npm run social:atelier                    # les reels du moment, puis la page
//   npm run social:atelier -- --page-seule    # réassemble la page sans rien produire
//   npm run social:atelier -- --modules une-des-unes,partis
//   npm run social:atelier -- --edition 2026-09-22T07
//
// Demande d'Adrien (2026-09-22) : « quand je te dis "sors-moi les reels du
// moment", tu prends les dernières données, tu m'ouvres l'aperçu, et j'ai le
// reel, pour toutes les plateformes, avec les textes ». C'est LA plateforme de
// travail : on y regarde, on y corrige, on y valide — avant de publier quoi que
// ce soit.
//
// CE QU'IL FAIT, dans l'ordre :
//   1. pour chaque module, lance son script de reel (aucune logique dupliquée :
//      c'est le même script que `npm run reel:<module>`), dans chaque rendu que
//      le dépôt connaît ;
//   2. ramasse ce que ces scripts ont produit — l'aperçu animé ET leurs textes
//      par réseau, chacun étant la légende propre à ce module ;
//   3. note les écarts au gabarit tels que le contrôle les a rapportés, sans
//      les recopier à la main ;
//   4. assemble une page : à gauche le reel dans le cadre de la plateforme
//      choisie, avec ce que son interface couvre ; à droite le texte de cette
//      plateforme, son premier commentaire et ses contraintes.
//
// Tout vit sous `social-out/atelier/` : un dossier par module, un fichier par
// rendu. Rien n'est versionné (social-out est hors Git).

import { spawn } from "node:child_process";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

import { listEditions } from "@/lib/data/headlineEvents";
import { MODULES } from "@/lib/modules";
import { parseArgs } from "./lib/reel";
import { PLATEFORMES } from "./lib/atelier/plateformes";
import { pageAtelier, type ModuleProduit } from "./lib/atelier/page";

/** Les modules qui ont un script de reel, dans l'ordre du site. */
const SCRIPTS: { cle: string; script: string }[] = [
  { cle: "une-des-unes", script: "une-des-unes" },
  { cle: "deux-solitudes", script: "deux-solitudes" },
  { cle: "enjeux-saillants", script: "enjeux-semaine" },
  { cle: "partis-et-couverture", script: "partis" },
  { cle: "presentation", script: "vitrine" },
];

/** Les dix analyses courtes de Partis : un seul script les produit toutes, mais
 *  chacune est un reel à part entière — donc un module à part entière dans
 *  l'atelier. Les oublier revenait à ne valider qu'un tiers de ce qu'on publie
 *  (relevé par Adrien le 2026-09-22 : « je vois juste 2 modules »). */
const COURTS = ["bascule", "calendrier", "horloge", "medias", "multiple", "oublie", "record", "remontee", "reunis", "ton"];

/** Un rendu par plateforme : depuis le 2026-09-22, la mise en page s'adapte à
 *  ce que chaque application couvre (`FORMATS`, scripts/social/lib/reel.ts).
 *  Montrer le rendu d'Instagram sous le calque de TikTok était un mensonge :
 *  TikTok couvre 100 px de plus en bas, et le contenu y passait dessous. */
async function rendusDisponibles(): Promise<string[]> {
  const { FORMATS } = await import("./lib/reel");
  return Object.keys(FORMATS);
}

function lancer(script: string, args: string[]): Promise<{ code: number; sortie: string }> {
  return new Promise((resolve) => {
    const p = spawn("npx", ["tsx", `scripts/social/${script}.ts`, ...args], { env: process.env });
    let sortie = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (sortie += d));
    p.on("close", (code) => resolve({ code: code ?? 1, sortie }));
  });
}

/** LA PLANCHE CONTACT : la FIN de chaque scène, côte à côte.
 *
 *  Le contrôle automatique dit si un texte dépasse ou s'empile ; il ne dit pas
 *  si c'est trop serré, ni si c'est beau. Pour ça il faut REGARDER, et regarder
 *  une scène à son état final — c'est là que tout est apparu. Les temps ne sont
 *  pas devinés : l'aperçu porte le début de chaque scène (`data-t`), la fin
 *  d'une scène est donc le début de la suivante, moins un souffle. */
async function planche(script: string, dossier: string, apercu: string, opts: string[], prefixe = ""): Promise<string | null> {
  const html = await fs.readFile(path.join(dossier, apercu), "utf8");
  const debuts = [...html.matchAll(/data-t="([\d.]+)"[^>]*>([^<]+)</g)].map((m) => ({ t: Number(m[1]), id: m[2] }));
  if (debuts.length < 2) return null;
  const duree = Number(html.match(/\/ ([\d,]+) s/)?.[1]?.replace(",", ".") ?? 0) || debuts[debuts.length - 1].t + 8;
  const fins = debuts.map((d, i) => Math.max(0.4, (i + 1 < debuts.length ? debuts[i + 1].t : duree) - 0.35));
  await lancer(script, [...opts, "--apercu", fins.map((f) => f.toFixed(1)).join(",")]);

  const vignettes = (await fs.readdir(dossier)).filter((f) => f.startsWith(prefixe) && /_apercu_[\d.]+s\.png$/.test(f))
    .sort((a, b) => Number(a.match(/_([\d.]+)s\.png$/)![1]) - Number(b.match(/_([\d.]+)s\.png$/)![1]));
  if (!vignettes.length) return null;
  const L = 300, H = 533;   // 9/16, assez grand pour lire un titre
  const tuiles = await Promise.all(vignettes.map((v) => sharp(path.join(dossier, v)).resize(L, H, { fit: "contain" }).toBuffer()));
  const nom = (prefixe ? prefixe.replace(/[^a-z0-9-]+/gi, "") : "planche") + ".png";
  await sharp({ create: { width: L * tuiles.length, height: H, channels: 3, background: "#141210" } })
    .composite(tuiles.map((input, i) => ({ input, left: i * L, top: 0 })))
    .png().toFile(path.join(dossier, nom));
  await Promise.all(vignettes.map((v) => fs.rm(path.join(dossier, v))));
  return path.posix.join(path.basename(path.dirname(dossier)), path.basename(dossier), nom);
}

/** Les écarts que le contrôle du gabarit a rapportés, tels quels. */
function ecarts(sortie: string): string[] {
  const lignes = sortie.split("\n");
  const i = lignes.findIndex((l) => l.includes("écart(s) au gabarit"));
  if (i < 0) return [];
  return lignes.slice(i + 1).filter((l: string) => l.trim().startsWith("·")).map((l) => l.trim().replace(/^·\s*/, ""));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const racine = path.resolve(process.cwd(), "social-out", "atelier");
  const rendus = await rendusDisponibles();
  const demandes = typeof args.modules === "string" ? args.modules.split(",").map((s) => s.trim()) : null;
  const choisis = SCRIPTS.filter((s) => !demandes || demandes.includes(s.cle) || demandes.includes(s.script));

  // La fraîcheur, dite une fois et clairement : l'atelier montre le dépôt LOCAL.
  const editions = await listEditions();
  const courante = editions[0];
  const ageH = courante ? (Date.now() - Date.parse(courante.pubInstantIso)) / 3.6e6 : Infinity;
  if (ageH > 5) console.warn(`⚠️ La dernière édition du dépôt date de ${Math.round(ageH)} h (${courante?.key ?? "aucune"}). « git pull » pour les données du moment.`);

  const produits: ModuleProduit[] = [];
  for (const { cle, script } of choisis) {
    // « presentation » n'est pas un module du site : c'est le reel qui les
    // traverse tous. Il n'a donc pas d'entrée dans MODULES.
    const nom = cle === "presentation" ? "Présentation" : (MODULES[cle as keyof typeof MODULES]?.nom ?? cle);
    const produit: ModuleProduit = { cle, nom, rendus: {}, textes: {}, absent: null };
    for (const rendu of rendus) {
      const dossier = path.join(racine, cle, rendu);
      if (args["page-seule"] !== true) {
        await fs.rm(dossier, { recursive: true, force: true });
        const opts = ["--sans-ouvrir", "--sortie", dossier, "--format", rendu,
          ...(typeof args.edition === "string" ? ["--edition", args.edition] : [])];
        process.stdout.write(`  ${nom} · ${rendu} … `);
        const { sortie } = await lancer(script, opts);
        const indispo = sortie.match(/Module indisponible \(([^)]+)\)/);
        if (indispo) { produit.absent = indispo[1]; console.log(`indisponible (${indispo[1]})`); continue; }
        produit.ecarts = { ...produit.ecarts, [rendu]: ecarts(sortie) };
        console.log(ecarts(sortie).length ? `⚠️ ${ecarts(sortie).length} écart(s)` : "ok");
        if (args.planches === true) {
          const fichiers0 = await fs.readdir(dossier).catch(() => [] as string[]);
          const a0 = fichiers0.find((f) => f.endsWith("_apercu.html"));
          if (a0) {
            process.stdout.write(`    planche … `);
            const pl = await planche(script, dossier, a0, opts);
            produit.planches = { ...produit.planches, [rendu]: pl ?? undefined };
            console.log(pl ? "ok" : "—");
          }
        }
      }
      // Ce que le script a laissé : son aperçu, et ses textes par réseau.
      const fichiers = await fs.readdir(dossier).catch(() => [] as string[]);
      const apercu = fichiers.find((f) => f.endsWith("_apercu.html"));
      if (apercu) produit.rendus[rendu] = path.posix.join(cle, rendu, apercu);
      for (const p of PLATEFORMES) {
        const t = fichiers.find((f) => f.endsWith(`_${p.cle}.txt`));
        if (t) produit.textes[p.cle] = await fs.readFile(path.join(dossier, t), "utf8");
      }
      const com = fichiers.find((f) => f.endsWith("_commentaire.txt"));
      if (com) produit.commentaire = await fs.readFile(path.join(dossier, com), "utf8");
    }
    produits.push(produit);
  }

  // Les zones viennent de la table du RENDU, jamais d'une copie : c'est ce qui
  // garantit que le calque rouge montre exactement ce que le gabarit vérifie.
  const { FORMATS, SAFE_TOP, SAFE_COTE } = await import("./lib/reel");
  const zones = Object.fromEntries(Object.entries(FORMATS).map(([cle, f]) => [cle, {
    haut: SAFE_TOP, bas: f.bas, gauche: SAFE_COTE,
    droite: f.boutons.largeur, boutonsDepuis: f.boutons.depuis, mesure: f.mesure,
  }]));

  // ── Les dix courts ───────────────────────────────────────────────────────
  if (!demandes || demandes.some((d) => d === "partis-court" || COURTS.includes(d))) {
    const voulus: string[] = demandes ? COURTS.filter((c) => demandes.includes(c) || demandes.includes("partis-court")) : COURTS;
    const parCourt: Record<string, ModuleProduit> = {};
    for (const c of voulus) parCourt[c] = { cle: c, nom: `Partis · ${c}`, rendus: {}, textes: {}, absent: null };
    for (const rendu of rendus) {
      const dossier = path.join(racine, "partis-court", rendu);
      if (args["page-seule"] !== true) {
        await fs.rm(dossier, { recursive: true, force: true });
        process.stdout.write(`  Partis · 10 courts · ${rendu} … `);
        const { sortie } = await lancer("partis-court", ["--sans-ouvrir", "--sortie", dossier, "--format", rendu,
          ...(typeof args.edition === "string" ? ["--edition", args.edition] : [])]);
        // Le script produit les courts l'un après l'autre et annonce chacun par
        // « ▶ <id> — ». On découpe la sortie sur ces annonces : les écarts, eux,
        // ne nomment JAMAIS l'analyse (scènes « plan » et « fin »), et chercher
        // l'identifiant dans leur texte rangeait tout écart de « boutons » sous
        // « ton » (vitrine#826).
        const troncons = sortie.split(/^▶ /m).slice(1);
        let total = 0;
        for (const t of troncons) {
          const c = t.slice(0, t.indexOf(" "));
          const miens = ecarts(t);
          total += miens.length;
          if (parCourt[c] && miens.length) parCourt[c].ecarts = { ...parCourt[c].ecarts, [rendu]: miens };
        }
        console.log(total ? `⚠️ ${total} écart(s)` : "ok");
      }
      const fichiers = await fs.readdir(dossier).catch(() => [] as string[]);
      for (const c of voulus) {
        const a = fichiers.find((f) => f.startsWith(`partis-court-${c}_`) && f.endsWith("_apercu.html"));
        if (a) parCourt[c].rendus[rendu] = path.posix.join("partis-court", rendu, a);
        if (a && args.planches === true && args["page-seule"] !== true) {
          const pl = await planche("partis-court", dossier, a,
            ["--sans-ouvrir", "--sortie", dossier, "--format", rendu, "--analyse", c], `partis-court-${c}_`);
          if (pl) parCourt[c].planches = { ...parCourt[c].planches, [rendu]: pl };
        }
        const tx = fichiers.find((f) => f.startsWith(`partis-court-${c}_`) && f.endsWith("_instagram.txt"));
        if (tx) parCourt[c].textes.instagram = await fs.readFile(path.join(dossier, tx), "utf8");
      }
    }
    produits.push(...voulus.map((c) => parCourt[c]));
  }

  await fs.mkdir(racine, { recursive: true });
  const fichier = path.join(racine, "index.html");
  await fs.writeFile(fichier, pageAtelier({ produits, rendus, zones, edition: courante?.key ?? null, dateLabel: courante?.dateLabel ?? null, ageH }));
  console.log(`\natelier → ${fichier}`);
  if (args["sans-ouvrir"] !== true) {
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [fichier], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
