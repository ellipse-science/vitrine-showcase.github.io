// Fonctions parlementaires et indemnités des 125 députés, pour les cartes de
// député.
//
//   npx tsx scripts/social/fonctions-deputes.ts [--date 2026-08-27] [--rafraichir]
//
// SOURCE : la fiche de chaque député sur assnat.qc.ca, qui liste TOUTES ses
// fonctions avec leurs dates (« … du 29 novembre 2022 au 27 août 2026 »,
// « … depuis le 7 novembre 2024 »). Les pages de synthèse (fonctions
// parlementaires, Conseil des ministres, composition des commissions) ne
// suffisent pas : aucune ne liste les présidents de séance ni les porte-parole.
// La table dim-qc-parliament-members-staging du datawarehouse a bien une colonne
// `functions`, mais c'est un instantané du 21 juin 2024 (Legault premier
// ministre) — inutilisable.
//
// DATE DE RÉFÉRENCE : la dissolution du 27 août 2026. Toutes les fonctions en
// cours s'arrêtent ce jour-là ; celles qui survivent à la dissolution (Conseil
// des ministres, présidence et vice-présidences de l'Assemblée) restent
// ouvertes. Une fonction compte si elle a commencé au plus tard ce jour-là et
// ne s'est pas terminée avant.
//
// INDEMNITÉS : barème en vigueur depuis le 1er avril 2026 (page « Indemnités et
// allocations » de l'Assemblée). Un député qui cumule plusieurs fonctions
// rémunérées « n'a droit qu'à l'indemnité la plus élevée » (même page) : on
// retient donc la plus élevée, on ne les additionne pas.
//
// Les fiches sont mises en cache dans social-out/.cache-assnat/ (ignoré par
// git) : le site répond en ~3 s par page, et relancer le calcul ne doit pas
// retélécharger 125 pages. --rafraichir vide ce cache.

import fs from "node:fs/promises";
import path from "node:path";
import { BAREME } from "./lib/bareme-deputes";
import {
  INDEMNITE_BASE, isoDate, jourSuivant, texte, moyenneAnnuelle, totalTouche, visAVisALaDate,
  visAVisSurLaLegislature, type VisAVis,
} from "./lib/fonctions-deputes-calcul";
import { parseArgs } from "./lib/reel";

const SITE = "https://www.assnat.qc.ca";
const CACHE = path.resolve(process.cwd(), "social-out/.cache-assnat");
const SORTIE = path.resolve(process.cwd(), "scripts/social/donnees/fonctions-deputes.json");
const AGENT = "Mozilla/5.0 (Vitrine démocratique, recherche CLESSN)";

// ANCIENS DÉPUTÉS de la législature (cartes « A »). L'Assemblée ne les liste
// plus dans son index et ne publie pour eux qu'une biographie en prose, sans la
// liste datée des fonctions : leurs mandats et fonctions rémunérées sont donc
// transcrits ici À LA MAIN depuis cette biographie
// (https://www.assnat.qc.ca/fr/deputes/<slug>-<id>/biographie.html, lue le
// 22 septembre 2026). `fin` = jour de la démission, compris.
const ANCIENS: {
  assnat_id: string; slug: string; nom: string; nom_famille: string; prenom: string;
  circonscription: string; debut: string; fin: string;
  fonctions: { titre: string; pct: number; debut: string; fin: string }[];
}[] = [
  {
    assnat_id: "16777", slug: "lefebvre-eric", nom: "Éric Lefebvre", nom_famille: "Lefebvre", prenom: "Éric",
    circonscription: "Arthabaska", debut: "2022-10-03", fin: "2025-03-18",
    // Whip en chef jusqu'au 28 août 2022, puis de nouveau du 20 octobre 2022 au
    // 16 avril 2024 ; indépendant ensuite.
    fonctions: [{ titre: "Whip en chef du gouvernement", pct: 35, debut: "2022-10-20", fin: "2024-04-16" }],
  },
  {
    assnat_id: "17897", slug: "fitzgibbon-pierre", nom: "Pierre Fitzgibbon", nom_famille: "Fitzgibbon", prenom: "Pierre",
    circonscription: "Terrebonne", debut: "2022-10-03", fin: "2024-09-05",
    // Ministre de l'Économie et de l'Innovation depuis le 1er septembre 2021,
    // puis de l'Économie, de l'Innovation et de l'Énergie, jusqu'à sa démission.
    fonctions: [{ titre: "Ministre de l’Économie, de l’Innovation et de l’Énergie", pct: 75, debut: "2022-10-03", fin: "2024-09-05" }],
  },
  {
    assnat_id: "17913", slug: "laforest-andree", nom: "Andrée Laforest", nom_famille: "Laforest", prenom: "Andrée",
    circonscription: "Chicoutimi", debut: "2022-10-03", fin: "2025-09-04",
    // Ministre des Affaires municipales et de l'Habitation jusqu'au 20 octobre
    // 2022, puis des Affaires municipales jusqu'à sa démission.
    fonctions: [{ titre: "Ministre des Affaires municipales", pct: 75, debut: "2022-10-03", fin: "2025-09-04" }],
  },
  {
    assnat_id: "18561", slug: "boutin-joelle", nom: "Joëlle Boutin", nom_famille: "Boutin", prenom: "Joëlle",
    circonscription: "Jean-Talon", debut: "2022-10-03", fin: "2023-07-31",
    fonctions: [{ titre: "Adjointe parlementaire au ministre de l’Économie, de l’Innovation et de l’Énergie", pct: 20, debut: "2022-11-09", fin: "2023-07-31" }],
  },
];

async function page(url: string, fichier: string): Promise<string> {
  const chemin = path.join(CACHE, fichier);
  const enCache = await fs.readFile(chemin, "utf8").catch(() => null);
  if (enCache) return enCache;
  const rep = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!rep.ok) throw new Error(`${url} : HTTP ${rep.status}`);
  const html = await rep.text();
  await fs.writeFile(chemin, html, "utf8");
  // Une page à la fois, avec une pause : c'est le site de l'Assemblée.
  await new Promise((r) => setTimeout(r, 700));
  return html;
}

type Fonction = { titre: string; debut: string | null; fin: string | null };

function fonctionsDatees(html: string): Fonction[] {
  const i = html.indexOf("Fonctions politiques, parlementaires");
  if (i < 0) return [];
  const out: Fonction[] = [];
  for (const [, li] of html.slice(i).matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const t = texte(li);
    let m = t.match(/^(.*) du (.+?\d{4}) au (.+?\d{4})$/);
    if (m) { out.push({ titre: m[1], debut: isoDate(m[2]), fin: isoDate(m[3]) }); continue; }
    m = t.match(/^(.*) depuis le (.+?\d{4})$/);
    if (m) out.push({ titre: m[1], debut: isoDate(m[2]), fin: null });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = typeof args.date === "string" ? args.date : "2026-08-27";
  if (args.rafraichir) await fs.rm(CACHE, { recursive: true, force: true });
  await fs.mkdir(CACHE, { recursive: true });

  const index = await page(`${SITE}/fr/deputes/index.html`, "index.html");
  // L'index écrit « Morin, André Albert » : c'est la seule source sûre du nom de
  // famille, qu'un prénom composé rend impossible à deviner.
  const nomsIndex = new Map([...index.matchAll(/<a href="(\/fr\/deputes\/[a-z0-9-]+-\d+\/index\.html)"[^>]*>([^<]*)<\/a>/g)]
    .map((m) => [m[1], texte(m[2])]));
  const liens = [...new Set([...index.matchAll(/\/fr\/deputes\/([a-z0-9-]+)-(\d+)\/index\.html/g)].map((m) => m[0]))];
  if (liens.length !== 125) console.warn(`  ⚠️ ${liens.length} députés dans l'index (125 attendus).`);

  const deputes = [];
  for (const [n, lien] of liens.entries()) {
    const [, slug, id] = lien.match(/\/fr\/deputes\/([a-z0-9-]+)-(\d+)\//)!;
    const html = await page(`${SITE}${lien}`, `${slug}-${id}.html`);
    process.stdout.write(`\r  ${n + 1}/${liens.length} fiches`);

    const nom = texte(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? slug);
    // « Élu député de … aux élections générales du 3 octobre 2022 », ou la date
    // d'une partielle : le premier <h3> de la section est le mandat en cours.
    const i = html.indexOf("Fonctions politiques, parlementaires");
    const mandat = texte(html.slice(i).match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const debutMandat = isoDate(mandat);
    // « … de la circonscription de Groulx aux élections… » : départage les homonymes.
    const circonscription = mandat.match(/circonscription (?:de la |de l’|de l'|du |des |d’|d'|de )(.+?) (?:aux|à l’|à l')/)?.[1] ?? null;
    const toutes = fonctionsDatees(html);
    const payees = toutes.flatMap((f) => {
      const ligne = BAREME.find(([re]) => re.test(f.titre));
      return ligne && f.debut ? [{ titre: f.titre, pct: ligne[2], debut: f.debut, fin: f.fin }] : [];
    });
    const totalLegislature = debutMandat ? totalTouche(debutMandat, jourSuivant(date), payees) : null;
    if (!debutMandat) console.warn(`\n  ⚠️ ${nom} : début de mandat introuvable, pas de total.`);
    const actives = toutes
      .filter((f) => f.debut && f.debut <= date && (!f.fin || f.fin >= date));

    const remunerees = actives.flatMap((f) => {
      const ligne = BAREME.find(([re]) => re.test(f.titre));
      return ligne ? [{ titre: f.titre, bareme: ligne[1], pourcentage: ligne[2], indemnite_additionnelle: ligne[3] }] : [];
    }).sort((a, b) => b.indemnite_additionnelle - a.indemnite_additionnelle);
    const retenue = remunerees[0];

    const [nomFamille, prenom] = (nomsIndex.get(lien) ?? "").split(/\s*,\s*/);
    deputes.push({
      assnat_id: id,
      slug,
      nom,
      nom_famille: nomFamille || null,
      circonscription,
      prenom: prenom || null,
      fonctions_remunerees: remunerees,
      fonction_retenue: retenue?.titre ?? null,
      indemnite_base: INDEMNITE_BASE,
      indemnite_additionnelle: retenue?.indemnite_additionnelle ?? 0,
      indemnite_totale: INDEMNITE_BASE + (retenue?.indemnite_additionnelle ?? 0),
      // Somme touchée du début du mandat à la dissolution, fonction par fonction.
      debut_mandat: debutMandat,
      total_legislature: totalLegislature,
      moyenne_annuelle: totalLegislature && debutMandat ? moyenneAnnuelle(totalLegislature, debutMandat, jourSuivant(date)) : null,
      // Fonctions rémunérées exercées pendant la législature, bornées au mandat :
      // ce sont elles qui expliquent la rémunération affichée sur la carte.
      fonctions_legislature: debutMandat
        ? payees.filter((p) => p.debut <= date && (!p.fin || p.fin >= debutMandat))
          .map((p) => ({ titre: p.titre, pct: p.pct, debut: p.debut < debutMandat ? debutMandat : p.debut, fin: !p.fin || p.fin > date ? date : p.fin }))
        : [],
      // Rôles de vis-à-vis : non rémunérés, mais c'est la matière des duels
      // ministre / porte-parole.
      porte_parole: actives.filter((f) => /^Porte-parole\b/.test(f.titre)).map((f) => f.titre),
      porte_parole_legislature: debutMandat
        ? toutes.filter((x) => /^Porte-parole\b/.test(x.titre) && x.debut && x.debut <= date && (!x.fin || x.fin >= debutMandat))
          .map((x) => ({ titre: x.titre, debut: x.debut! < debutMandat ? debutMandat : x.debut!, fin: !x.fin || x.fin > date ? date : x.fin }))
        : [],
    });
  }

  const { parId: visAVisDate, nonApparies } = visAVisALaDate(deputes);
  for (const d of deputes as (typeof deputes[number] & { vis_a_vis?: VisAVis[] })[]) {
    const v = visAVisDate.get(d.assnat_id);
    if (v) d.vis_a_vis = v;
  }

  const visAVisLegislature = visAVisSurLaLegislature(deputes, ANCIENS);

  if (nonApparies.length) {
    console.warn(`\n  ⚠️ ${nonApparies.length} dossier(s) de porte-parole sans vis-à-vis certain (à trancher dans VIS_A_VIS_MANUELS) :`);
    for (const n of nonApparies) console.warn(`     · ${n}`);
  }

  // Anciens députés : pas de fonction à la dissolution ni de vis-à-vis, mais
  // une rémunération touchée jusqu'à leur démission.
  const anciens = ANCIENS.map((a) => ({
    assnat_id: a.assnat_id, slug: a.slug, nom: a.nom, nom_famille: a.nom_famille, prenom: a.prenom,
    circonscription: a.circonscription, ancien: true, fin_mandat: a.fin,
    fonctions_remunerees: [], fonction_retenue: null,
    debut_mandat: a.debut,
    total_legislature: totalTouche(a.debut, jourSuivant(a.fin), a.fonctions),
    moyenne_annuelle: moyenneAnnuelle(totalTouche(a.debut, jourSuivant(a.fin), a.fonctions), a.debut, jourSuivant(a.fin)),
    fonctions_legislature: a.fonctions,
    porte_parole: [],
  }));

  await fs.mkdir(path.dirname(SORTIE), { recursive: true });
  await fs.writeFile(SORTIE, JSON.stringify({
    date_reference: date,
    source: `${SITE}/fr/deputes/index.html (fiches individuelles, section « Fonctions politiques, parlementaires et ministérielles »)`,
    bareme: "Indemnités additionnelles depuis le 1er avril 2026 ; cumul : seule la plus élevée est versée.",
    extrait_le: new Date().toISOString().slice(0, 10),
    deputes: [...deputes, ...anciens].map((d) => ({ ...d, vis_a_vis_legislature: visAVisLegislature.get(d.assnat_id) ?? [] })),
  }, null, 2) + "\n", "utf8");

  const avecFonction = deputes.filter((d) => d.fonction_retenue).length;
  console.log(`\n  ${deputes.length} députés · ${avecFonction} avec une fonction rémunérée · ${deputes.filter((d) => d.porte_parole.length).length} porte-parole`);
  console.log(`  → ${path.relative(process.cwd(), SORTIE)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
