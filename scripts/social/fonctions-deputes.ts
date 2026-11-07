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
import { parseArgs } from "./lib/reel";

const SITE = "https://www.assnat.qc.ca";
const CACHE = path.resolve(process.cwd(), "social-out/.cache-assnat");
const SORTIE = path.resolve(process.cwd(), "scripts/social/donnees/fonctions-deputes.json");
const AGENT = "Mozilla/5.0 (Vitrine démocratique, recherche CLESSN)";

const INDEMNITE_BASE = 146_375;

// Indemnité annuelle de base au fil de la législature, relevée sur les versions
// archivées de la page « Indemnités et allocations » (archive.org) et dans la
// loi de 2023 (L.Q. 2023, c. 14, en vigueur le 7 juin 2023, sans rétroactivité).
// Les POURCENTAGES des fonctions n'ont pas changé de 2022 à 2026 : seule la base
// bouge, et l'indemnité additionnelle la suit.
const BASES: [string, number][] = [
  ["2022-04-01", 101_561], // inchangée au 1er avril 2023
  ["2023-06-07", 131_766],
  ["2025-04-01", 141_625],
  ["2026-04-01", 146_375],
];

function baseAu(jour: string): number {
  let b = BASES[0][1];
  for (const [depuis, montant] of BASES) if (jour >= depuis) b = montant;
  return b;
}

function jourSuivant(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Somme touchée du `debut` inclus au `fin` exclu, au jour le jour : base du
 *  jour + la plus élevée des indemnités additionnelles actives ce jour-là (pas
 *  de cumul). Taux quotidien = montant annuel ÷ 365. */
/** Moyenne par année de mandat : le total ramené à 365 jours de présence.
 *  Un élu de partielle n'a pas siégé quatre ans ; divisé par la législature
 *  entière, il paraîtrait sous-payé. */
function moyenneAnnuelle(total: number, debut: string, finExclue: string): number {
  const jours = Math.round((Date.parse(finExclue) - Date.parse(debut)) / 86_400_000);
  return Math.round((total * 365) / jours);
}

function totalTouche(debut: string, fin: string, payees: { pct: number; debut: string; fin: string | null }[]): number {
  let total = 0;
  for (let j = debut; j < fin; j = jourSuivant(j)) {
    const base = baseAu(j);
    let pct = 0;
    for (const p of payees) if (p.debut <= j && (!p.fin || j <= p.fin) && p.pct > pct) pct = p.pct;
    total += (base * (1 + pct / 100)) / 365;
  }
  return Math.round(total);
}

// Les dix commissions permanentes sectorielles. La Commission de l'Assemblée
// nationale est présidée par la présidente de l'Assemblée, déjà rémunérée à ce
// titre ; les sous-commissions et les commissions de l'APF ne donnent rien.
const PERMANENTES = [
  "de l’administration publique",
  "de l’agriculture, des pêcheries, de l’énergie et des ressources naturelles",
  "de l’aménagement du territoire",
  "de la culture et de l’éducation",
  "de l’économie et du travail",
  "des finances publiques",
  "des institutions",
  "des relations avec les citoyens",
  "de la santé et des services sociaux",
  "des transports et de l’environnement",
].join("|");

/** [intitulé sur la fiche, fonction du barème, % de l'indemnité de base,
 *  indemnité additionnelle]. Premier motif qui correspond l'emporte. */
const BAREME: [RegExp, string, number, number][] = [
  [/^Premi(?:ère|er) ministre$/, "Première ou premier ministre", 105, 153_694],
  // Ministres délégués compris : l'Assemblée ne les distingue pas dans son barème.
  [/^Ministre\b/, "Ministre", 75, 109_781],
  [/^Leader parlementaire du gouvernement$/, "Ministre", 75, 109_781],
  [/^Président(?:e)? de l’Assemblée nationale$/, "Présidente ou président de l’Assemblée nationale", 75, 109_781],
  [/^(?:Première|Deuxième|Troisième) vice-président(?:e)? de l’Assemblée nationale$/, "Vice-présidente ou vice-président de l’Assemblée nationale", 35, 51_231],
  [/^Chef(?:fe)? de l’opposition officielle$/, "Cheffe ou chef de l’opposition officielle", 75, 109_781],
  [/^Chef(?:fe)? du deuxième groupe d’opposition$/, "Cheffe ou chef du deuxième groupe d’opposition", 35, 51_231],
  [/^Chef(?:fe)? du troisième groupe d’opposition$/, "Cheffe ou chef du troisième groupe d’opposition", 35, 51_231],
  [/^Leader parlementaire de l’opposition officielle$/, "Leader parlementaire de l’opposition officielle", 35, 51_231],
  [/^Leader parlementaire du deuxième groupe d’opposition$/, "Leader parlementaire du deuxième groupe d’opposition", 25, 36_594],
  [/^Whip en chef du gouvernement$/, "Whip en chef du gouvernement", 35, 51_231],
  [/^Whip en chef de l’opposition officielle$/, "Whip en chef de l’opposition officielle", 30, 43_913],
  [/^Whip du deuxième groupe d’opposition$/, "Whip du deuxième groupe d’opposition", 20, 29_275],
  [/^Leader parlementaire adjoint(?:e)? du gouvernement$/, "Leader parlementaire adjoint du gouvernement", 25, 36_594],
  [/^Leader parlementaire adjoint(?:e)? de l’opposition officielle$/, "Leader parlementaire adjoint de l’opposition officielle", 20, 29_275],
  [/^Whip adjoint(?:e)? du gouvernement$/, "Whip adjoint du gouvernement", 20, 29_275],
  [/^Président(?:e)? du caucus du gouvernement$/, "Présidente ou président de caucus du gouvernement", 25, 36_594],
  [/^Président(?:e)? du caucus de l’opposition officielle$/, "Présidente ou président de caucus de l'opposition officielle", 22.5, 32_934],
  [/^Adjoint(?:e)? parlementaire\b/, "Adjointe ou adjoint parlementaire", 20, 29_275],
  [new RegExp(`^Président(?:e)? de la Commission (?:${PERMANENTES})$`), "Présidente ou président d’une commission permanente", 25, 36_594],
  [new RegExp(`^Vice-président(?:e)? de la Commission (?:${PERMANENTES})$`), "Vice-présidente ou vice-président d’une commission permanente", 20, 29_275],
  [/^Président(?:e)? de séance$/, "Présidente ou président de séance d’une commission permanente", 15, 21_956],
  // Pas les membres suppléants.
  [/^Membre du Bureau de l’Assemblée nationale$/, "Membre du Bureau de l’Assemblée nationale", 15, 21_956],
];

// VIS-À-VIS — un dossier de porte-parole (« … en matière de santé ») est
// rapproché du ministre dont le titre partage le plus de mots avec lui
// (« Ministre de la Santé »). Les mots ne suffisent pas toujours : ce tableau
// tranche À LA MAIN les dossiers dont le ministre ne se lit pas dans le titre,
// ou que les mots attribuaient à tort. `null` = aucun vis-à-vis certain ; le
// dossier est alors écarté plutôt que deviné. Clé : le domaine du dossier, en
// minuscules, tel que `domaine()` le produit. Valeur : le DÉBUT du titre du
// portefeuille, pas le nom du ministre : deux « Eric Girard » siègent (Groulx
// et Lac-Saint-Jean), et un remaniement ne doit pas rendre la table fausse.
const VIS_A_VIS_MANUELS: Record<string, string | null> = {
  "relations canadiennes": "Ministre responsable des Relations canadiennes",
  "relations canadiennes et de francophonie canadienne": "Ministre responsable des Relations canadiennes",
  "travail et d’emploi": "Ministre du Travail",
  "francophonie": "Ministre des Relations internationales et de la Francophonie",
  "protection des consommateurs": "Ministre de la Justice", // l'OPC relève de la Justice
  "suivi du rapport rebâtir la confiance": "Ministre de la Justice",
  "loi électorale": "Ministre responsable des Institutions démocratiques",
  "cpe": "Ministre de la Famille",
  "soins à domicile": "Ministre de la Santé",
  "protection de la jeunesse": "Ministre responsable des Services sociaux", // la DPJ
  "sports, de loisirs, de plein air et de saines habitudes de vie": "Ministre responsable du Sport",
  "soins de fin de vie": "Ministre de la Santé",
  "paradis fiscaux": "Ministre des Finances",
  "métropole": "Ministre responsable de la Métropole",
  "capitale-nationale": "Ministre responsable de la région de la Capitale-Nationale",
  "économie sociale": null,
  "communautés lgbtq+": null,
  "communauté 2slgbtqia+": null,
  "communauté lgbtqia2s+": null,
  "personnes vivant avec un handicap ou avec le spectre de l’autisme": null,
  "nationalisme inclusif": null,
  "éthique": null,
  "indépendance du québec": null,
  "indépendance": null,
  "ordres professionnels": null,
  "relations avec les citoyens": null,
  "lutte contre l’intimidation": null,
  "défense et d’aéronautique": null,
  "allègement réglementaire": null,
};

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

const MOTS_VIDES = new Set(("de la le les l d des du et en au aux a à matière ministre responsable " +
  "déléguée délégué porte-parole opposition officielle groupe deuxième troisième lutte contre " +
  "relations avec sur pour ainsi que").split(" "));

/** « Porte-parole de l'opposition officielle en matière de santé » → « santé » ;
 *  « Ministre responsable de l'Habitation » → « Habitation ». */
function domaine(titre: string): string {
  return titre
    .replace(/^Porte-parole .*? (?:en matière|pour) (?:de la |de l’|d’|de |des |du |la |le |les |l’)?/, "")
    .replace(/^Ministre (?:délégué(?:e)? |responsable )?(?:à la |à l’|aux |au |à |de la |de l’|des |du |de )?/, "");
}

function racines(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[’']/g, " ").split(/[^\p{L}-]+/u)
    .filter((w) => w && !MOTS_VIDES.has(w)).map((w) => w.slice(0, 5)));
}

const MOIS: Record<string, number> = {
  janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
};

function isoDate(s: string): string | null {
  const m = s.match(/(\d{1,2})(?:er)? (\p{L}+) (\d{4})/u);
  if (!m || !MOIS[m[2]]) return null;
  return `${m[3]}-${String(MOIS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function texte(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

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

  // VIS-À-VIS, par identifiant de l'Assemblée (deux « Eric Girard »). Les titres
  // régionaux (« … de la région de la Mauricie ») ne désignent pas un
  // portefeuille ; la Métropole, si.
  const portefeuilles = deputes.flatMap((d) => d.fonctions_remunerees
    .filter((f) => /^Ministre\b/.test(f.titre))
    .map((f) => ({ id: d.assnat_id, titre: f.titre, regional: /^Ministre responsable de la région/.test(f.titre), racines: racines(domaine(f.titre)) })));
  const nomDe = new Map(deputes.map((d) => [d.assnat_id, d.nom]));
  const nonApparies: string[] = [];
  const faceA = new Map<string, Map<string, string[]>>(); // porte-parole → ministre → dossiers (ids)
  for (const d of deputes) {
    for (const titre of d.porte_parole) {
      if (/région/.test(titre) && !/Capitale-Nationale/.test(titre)) continue;
      const dom = domaine(titre);
      const manuel = VIS_A_VIS_MANUELS[dom.toLowerCase()];
      let ministre: string | null = null;
      if (manuel !== undefined) {
        const titulaires = [...new Set(portefeuilles.filter((p) => manuel && p.titre.startsWith(manuel)).map((p) => p.id))];
        if (manuel && titulaires.length !== 1) console.warn(`\n  ⚠️ « ${manuel} » : ${titulaires.length} titulaire(s) — table VIS_A_VIS_MANUELS à revoir.`);
        ministre = titulaires.length === 1 ? titulaires[0] : null;
      } else {
        const r = racines(dom);
        let meilleur = 0;
        let candidats: string[] = [];
        for (const p of portefeuilles) {
          if (p.regional) continue;
          const s = [...r].filter((w) => p.racines.has(w)).length / Math.max(1, Math.min(r.size, p.racines.size));
          if (s > meilleur) { meilleur = s; candidats = [p.id]; }
          else if (s === meilleur && s > 0 && !candidats.includes(p.id)) candidats.push(p.id);
        }
        // Ex æquo ou recoupement trop maigre : on n'invente pas de duel.
        ministre = meilleur >= 0.5 && candidats.length === 1 ? candidats[0] : null;
      }
      if (!ministre) { nonApparies.push(`${d.nom} — ${dom}`); continue; }
      const parMinistre = faceA.get(d.assnat_id) ?? new Map<string, string[]>();
      parMinistre.set(ministre, [...(parMinistre.get(ministre) ?? []), dom]);
      faceA.set(d.assnat_id, parMinistre);
    }
  }
  const trie = (m: Map<string, string[]>) => [...m].sort((a, b) => b[1].length - a[1].length)
    .map(([id, dossiers]) => ({ assnat_id: id, nom: nomDe.get(id)!, dossiers }));
  for (const d of deputes as (typeof deputes[number] & { vis_a_vis?: { assnat_id: string; nom: string; dossiers: string[] }[] })[]) {
    const commeCritique = faceA.get(d.assnat_id);
    if (commeCritique) { d.vis_a_vis = trie(commeCritique); continue; }
    // Un ministre a pour vis-à-vis les porte-parole qui l'affrontent.
    const critiques = new Map<string, string[]>();
    for (const [critique, ministres] of faceA) {
      const dossiers = ministres.get(d.assnat_id);
      if (dossiers) critiques.set(critique, dossiers);
    }
    if (critiques.size) d.vis_a_vis = trie(critiques);
  }

  // VIS-À-VIS SUR TOUTE LA LÉGISLATURE. Celui de la dissolution (ci-dessus)
  // ignorait les duels passés : Dubé à la Santé, Guilbault aux Transports…
  // Chaque dossier de porte-parole, DATÉ, est rapproché des ministres qui
  // tenaient le portefeuille PENDANT cette période, au prorata des jours de
  // chevauchement. Sert à la rareté des cartes : sans lui, les députés de
  // l'opposition, qui ne peuvent pas être ministres, n'y montaient jamais.
  const mandatsMinistre = [
    ...deputes.flatMap((d) => d.fonctions_legislature.map((x) => ({ id: d.assnat_id, ...x }))),
    ...ANCIENS.flatMap((a) => a.fonctions.map((x) => ({ id: a.assnat_id, ...x }))),
  ].filter((x) => /^Ministre\b/.test(x.titre) && !/^Ministre responsable de la région/.test(x.titre))
    .map((x) => ({ ...x, racines: racines(domaine(x.titre)) }));
  const nomsTous = new Map([...deputes.map((d) => [d.assnat_id, d.nom] as const), ...ANCIENS.map((a) => [a.assnat_id, a.nom] as const)]);
  const chevauche = (a1: string, a2: string, b1: string, b2: string) => {
    const d = a1 > b1 ? a1 : b1;
    const f = a2 < b2 ? a2 : b2;
    return d > f ? 0 : Math.round((Date.parse(f) - Date.parse(d)) / 86_400_000) + 1;
  };
  const duels = new Map<string, Map<string, { jours: number; dossiers: Set<string> }>>(); // porte-parole → ministre
  let dossiersSansMinistre = 0;
  for (const d of deputes) {
    for (const pp of d.porte_parole_legislature) {
      if (/région/.test(pp.titre) && !/Capitale-Nationale/.test(pp.titre)) continue;
      const dom = domaine(pp.titre);
      const manuel = VIS_A_VIS_MANUELS[dom.toLowerCase()];
      if (manuel === null) continue;
      const pendant = mandatsMinistre.filter((m) => chevauche(pp.debut, pp.fin, m.debut, m.fin) > 0);
      let retenus: typeof pendant = [];
      if (manuel !== undefined) retenus = pendant.filter((m) => m.titre.startsWith(manuel));
      else {
        const r = racines(dom);
        let meilleur = 0;
        for (const m of pendant) {
          const s = [...r].filter((w) => m.racines.has(w)).length / Math.max(1, Math.min(r.size, m.racines.size));
          if (s > meilleur) { meilleur = s; retenus = [m]; } else if (s === meilleur && s > 0) retenus.push(m);
        }
        if (meilleur < 0.5) retenus = [];
      }
      if (!retenus.length) { dossiersSansMinistre++; continue; }
      const parMinistre = duels.get(d.assnat_id) ?? new Map();
      for (const m of retenus) {
        const e = parMinistre.get(m.id) ?? { jours: 0, dossiers: new Set<string>() };
        e.jours += chevauche(pp.debut, pp.fin, m.debut, m.fin);
        e.dossiers.add(dom);
        parMinistre.set(m.id, e);
      }
      duels.set(d.assnat_id, parMinistre);
    }
  }
  const versListe = (m: Map<string, { jours: number; dossiers: Set<string> }>) => [...m]
    .sort((a, b) => b[1].jours - a[1].jours)
    .map(([id, e]) => ({ assnat_id: id, nom: nomsTous.get(id)!, jours: e.jours, dossiers: [...e.dossiers] }));
  const visAVisLegislature = new Map<string, ReturnType<typeof versListe>>();
  for (const [critique, m] of duels) visAVisLegislature.set(critique, versListe(m));
  for (const id of nomsTous.keys()) {
    if (visAVisLegislature.has(id)) continue;
    const face = new Map<string, { jours: number; dossiers: Set<string> }>();
    for (const [critique, m] of duels) { const e = m.get(id); if (e) face.set(critique, e); }
    if (face.size) visAVisLegislature.set(id, versListe(face));
  }
  console.log(`\n  vis-à-vis sur la législature : ${duels.size} porte-parole, ${dossiersSansMinistre} dossier(s) sans ministre apparié`);

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
