// Sources des cartes de député·e pour une législature, tirées de la DIMENSION
// des député·es (ellipse-science/dim-qc-parliament) plutôt que de relevés
// séparés. Une seule source de vérité : mandats, fonctions datées et résultats
// électoraux viennent des tables relues de la dimension.
//
//   npx tsx scripts/social/sources-cartes-dimension.ts --legislature 44 \
//     --dim ../dim-qc-parliament --commit 96bc151 [--date 2026-11-24] [--rafraichir]
//
// Écrit scripts/social/donnees/<N>e/ : fonctions-deputes.json,
// carriere-deputes.json, resultats-elections.json et genre-deputes.json, aux
// MÊMES formats que les fichiers de la 43e (lib/cartes/donnees.ts les lit).
//
// LA DIMENSION EST LUE À UN COMMIT PRÉCIS (`git show <commit>:data/…`), noté
// dans chaque fichier : tant qu'elle n'est pas déposée dans l'entrepôt
// (aws-infra#809), c'est le seul moyen de savoir quelle version on a lue.
// Ensuite, ce script lira l'entrepôt par tube au lieu de git.
//
// Ce que la dimension n'a pas :
// - les noms affichables (elle les garde normalisés, « stephane tremblay ») :
//   ils viennent de l'index des député·es de l'Assemblée (« Tremblay,
//   Stéphane »), qui donne aussi prénom et nom de famille sans les deviner ;
// - le nom des circonscriptions (ses sièges sont des identifiants) : il vient
//   de l'index des portraits du site (public/images/deputes/index.json) ;
// - le GENRE grammatical (Élu / Élue) : il vient de la 43e pour les réélu·es
//   (genre-deputes.json), et de la fiche de l'Assemblée (« Député de » /
//   « Députée de ») pour les autres. Rien n'est déduit d'un prénom.
//
// Les pages de l'Assemblée sont mises en cache dans
// social-out/.cache-assnat-<N>e/ (ignoré par git). --rafraichir vide ce cache.

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BAREME } from "./lib/bareme-deputes";
import {
  INDEMNITE_BASE, jourSuivant, moyenneAnnuelle, texte, totalTouche, visAVisALaDate, visAVisSurLaLegislature,
  type FonctionPayee,
} from "./lib/fonctions-deputes-calcul";
import { parseArgs } from "./lib/reel";

const SITE = "https://www.assnat.qc.ca";
const AGENT = "Mozilla/5.0 (Vitrine démocratique, recherche CLESSN)";
const DONNEES = path.resolve(process.cwd(), "scripts/social/donnees");

type Ligne = Record<string, string>;

/** CSV (RFC 4180) : guillemets doublés, virgules et sauts de ligne entre guillemets. */
export function lireCsv(brut: string): Ligne[] {
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  for (let i = 0; i < brut.length; i++) {
    const c = brut[i];
    if (guillemets) {
      if (c === '"' && brut[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && brut[i + 1] === "\n") i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
    } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [entete, ...corps] = lignes.filter((l) => l.length > 1 || l[0]);
  return corps.map((l) => Object.fromEntries(entete.map((k, j) => [k, l[j] ?? ""])));
}

/** Les fonctions de l'Assemblée et le mandat se chevauchent-ils au jour `date` ? */
const actifLe = (debut: string, fin: string, date: string) => debut <= date && (!fin || fin >= date);

/** Résultat de la génération, sans écriture : testable. */
export function construireSources(entree: {
  legislature: number;
  date: string;
  commit: string;
  mandats: Ligne[];
  fonctions: Ligne[];
  resultats: Ligne[];
  periodes: Ligne[];
  /** Index des député·es de l'Assemblée : identifiant → « Nom, Prénom ». */
  nomsAssnat: Map<string, string>;
  /** Index des portraits : identifiant → nom de la circonscription. */
  circonscriptions: Map<string, string>;
  genres: Map<string, { genre: "f" | "m"; source: string }>;
}) {
  const { legislature, date, commit } = entree;
  const borne = entree.periodes.find((p) => p.period_type === "legislature" && p.legislature === String(legislature));
  if (!borne) throw new Error(`Législature ${legislature} absente de periods_qc.csv.`);
  const debutLeg = borne.date_start;
  const finLeg = borne.date_end && borne.date_end < date ? borne.date_end : date;
  const source = `ellipse-science/dim-qc-parliament@${commit}`;

  // Les élu·es de la législature : un mandat ouvert pendant ses bornes.
  const mandatsLeg = entree.mandats.filter((m) => m.date_start <= finLeg && (!m.date_end || m.date_end >= debutLeg));
  const ids = [...new Set(mandatsLeg.map((m) => m.person_id))];
  const debutMandat = (id: string) => mandatsLeg.filter((m) => m.person_id === id)
    .map((m) => (m.date_start < debutLeg ? debutLeg : m.date_start)).sort()[0];

  const nomDe = (id: string) => {
    const [famille, prenom] = (entree.nomsAssnat.get(id) ?? "").split(/\s*,\s*/);
    return { nom: famille && prenom ? `${prenom} ${famille}` : null, famille: famille || null, prenom: prenom || null };
  };

  // FONCTIONS. Rémunération : le barème de l'Assemblée sur l'intitulé, comme
  // pour la 43e ; le pourcentage de la dimension sert de contrôle.
  const ecarts: string[] = [];
  const deputes = ids.map((id) => {
    const { nom, famille, prenom } = nomDe(id);
    const debut = debutMandat(id);
    const siennes = entree.fonctions.filter((f) => f.person_id === id && f.date_start
      && f.date_start <= finLeg && (!f.date_end || f.date_end >= debut));
    const payees: FonctionPayee[] = siennes.flatMap((f) => {
      const ligne = BAREME.find(([re]) => re.test(f.title));
      if (ligne && Number(f.scale_pct || 0) && ligne[2] !== Number(f.scale_pct)) ecarts.push(`${nom} — ${f.title} : barème ${ligne[2]} %, dimension ${f.scale_pct} %`);
      return ligne ? [{
        titre: f.title, pct: ligne[2],
        debut: f.date_start < debut ? debut : f.date_start,
        fin: !f.date_end || f.date_end > finLeg ? finLeg : f.date_end,
      }] : [];
    });
    const actives = siennes.filter((f) => actifLe(f.date_start, f.date_end, finLeg));
    const remunerees = actives.flatMap((f) => {
      const ligne = BAREME.find(([re]) => re.test(f.title));
      return ligne ? [{ titre: f.title, bareme: ligne[1], pourcentage: ligne[2], indemnite_additionnelle: ligne[3] }] : [];
    }).sort((a, b) => b.indemnite_additionnelle - a.indemnite_additionnelle);
    const retenue = remunerees[0];
    const total = totalTouche(debut, jourSuivant(finLeg), payees);
    return {
      assnat_id: id,
      nom: nom ?? id,
      nom_famille: famille,
      circonscription: entree.circonscriptions.get(id) ?? null,
      prenom,
      fonctions_remunerees: remunerees,
      fonction_retenue: retenue?.titre ?? null,
      indemnite_base: INDEMNITE_BASE,
      indemnite_additionnelle: retenue?.indemnite_additionnelle ?? 0,
      indemnite_totale: INDEMNITE_BASE + (retenue?.indemnite_additionnelle ?? 0),
      debut_mandat: debut,
      total_legislature: total,
      moyenne_annuelle: moyenneAnnuelle(total, debut, jourSuivant(finLeg)),
      fonctions_legislature: payees,
      porte_parole: actives.filter((f) => /^Porte-parole\b/.test(f.title)).map((f) => f.title),
      porte_parole_legislature: siennes.filter((f) => /^Porte-parole\b/.test(f.title)).map((f) => ({
        titre: f.title,
        debut: f.date_start < debut ? debut : f.date_start,
        fin: !f.date_end || f.date_end > finLeg ? finLeg : f.date_end,
      })),
    };
  });
  const { parId: visAVisDate, nonApparies } = visAVisALaDate(deputes);
  const visAVisLeg = visAVisSurLaLegislature(deputes, []);
  const fiches = deputes.map((d) => ({
    ...d,
    ...(visAVisDate.has(d.assnat_id) ? { vis_a_vis: visAVisDate.get(d.assnat_id) } : {}),
    vis_a_vis_legislature: visAVisLeg.get(d.assnat_id) ?? [],
  }));

  // CARRIÈRE : première élection et nombre de mandats (générales et
  // partielles distinctes ; une défection n'en ouvre pas un nouveau).
  const carrieres = Object.fromEntries(ids.map((id) => {
    const elections = entree.mandats.filter((m) => m.person_id === id && m.date_start <= finLeg
      && (m.start_reason === "election" || m.start_reason === "byelection"));
    const dates = [...new Set(elections.map((m) => m.date_start))].sort();
    return [id, { nom: nomDe(id).nom ?? id, premiere_election: dates[0]?.slice(0, 4) ?? "", mandats: dates.length }];
  }));

  // SCRUTIN : celui qui a donné son siège à chaque élu·e de la législature.
  const scrutins = ids.flatMap((id) => {
    const r = entree.resultats
      .filter((x) => x.person_id === id && x.elected === "true" && x.election_date <= finLeg && x.election_date >= debutLeg)
      .sort((a, b) => a.election_date.localeCompare(b.election_date))[0];
    if (!r) return [];
    const { nom, famille } = nomDe(id);
    return [{
      scrutin: r.election_code, date: r.election_date, type: r.election_type === "general" ? "générale" : "partielle",
      circonscription: entree.circonscriptions.get(id) ?? r.seat_id, gagnant: nom ?? r.candidate_name,
      nom_famille: famille ?? "", parti: r.party_abbrev, voix: Number(r.votes),
      pourcentage: Number(r.vote_share), avance: Number(r.lead_votes), participation: Number(r.turnout),
    }];
  });

  const genres = Object.fromEntries(ids.flatMap((id) => {
    const g = entree.genres.get(id);
    return g ? [[id, { nom: nomDe(id).nom ?? id, ...g }]] : [];
  }));

  return {
    fonctions: {
      date_reference: finLeg, source,
      bareme: "Indemnités additionnelles depuis le 1er avril 2026 ; cumul : seule la plus élevée est versée.",
      deputes: fiches,
    },
    carrieres: { _note: `Ancienneté des élu·es de la ${legislature}e législature : année de la première élection et nombre de mandats (générales et partielles distinctes).`, source, deputes: carrieres },
    resultats: { source: `${source} (election_results, données ouvertes d'Élections Québec)`, resultats: scrutins },
    genres: { _note: `Genre grammatical des élu·es de la ${legislature}e législature, pour accorder « Élu » / « Élue ». Clé : assnat_id. Chaque entrée garde sa source ; rien n'est déduit d'un prénom.`, deputes: genres },
    controle: { elus: ids.length, sansNom: ids.filter((id) => !entree.nomsAssnat.has(id)), sansCirconscription: ids.filter((id) => !entree.circonscriptions.has(id)), sansScrutin: ids.filter((id) => !scrutins.some((s) => s.gagnant === (nomDe(id).nom ?? ""))), sansGenre: ids.filter((id) => !entree.genres.has(id)), ecarts, nonApparies },
  };
}

async function page(cache: string, url: string, fichier: string): Promise<string> {
  const chemin = path.join(cache, fichier);
  const enCache = await fs.readFile(chemin, "utf8").catch(() => null);
  if (enCache) return enCache;
  const rep = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!rep.ok) throw new Error(`${url} : HTTP ${rep.status}`);
  const html = await rep.text();
  await fs.writeFile(chemin, html, "utf8");
  await new Promise((r) => setTimeout(r, 700)); // une page à la fois : c'est le site de l'Assemblée
  return html;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const legislature = Number(args.legislature ?? 44);
  const dim = path.resolve(typeof args.dim === "string" ? args.dim : "../dim-qc-parliament");
  const commit = typeof args.commit === "string" ? args.commit : "";
  if (!commit) throw new Error("--commit est obligatoire : la version de la dimension doit être connue.");
  const date = typeof args.date === "string" ? args.date
    : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
  const cache = path.resolve(process.cwd(), `social-out/.cache-assnat-${legislature}e`);
  if (args.rafraichir) await fs.rm(cache, { recursive: true, force: true });
  await fs.mkdir(cache, { recursive: true });

  const sha = execFileSync("git", ["-C", dim, "rev-parse", "--short", commit], { encoding: "utf8" }).trim();
  const csv = (fichier: string) => lireCsv(execFileSync("git", ["-C", dim, "show", `${sha}:data/${fichier}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));

  // Index des député·es de l'Assemblée : « Nom, Prénom » par identifiant.
  const index = await page(cache, `${SITE}/fr/deputes/index.html`, "index.html");
  const nomsAssnat = new Map([...index.matchAll(/<a href="\/fr\/deputes\/[a-z0-9-]+-(\d+)\/index\.html"[^>]*>([^<]*)<\/a>/g)]
    .map((m) => [m[1], texte(m[2])]));
  const portraits = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "public/images/deputes/index.json"), "utf8")) as
    { deputes: { deputy_id?: string; circonscription: string; asset_slug?: string; profil?: string }[] };
  const circonscriptions = new Map(portraits.deputes
    .filter((p) => p.deputy_id && !(p.asset_slug ?? "").startsWith("historique/"))
    .map((p) => [String(p.deputy_id), p.circonscription]));

  // Genre : la 43e pour les réélu·es, la fiche de l'Assemblée pour les autres.
  const genres = new Map<string, { genre: "f" | "m"; source: string }>();
  const g43 = JSON.parse(await fs.readFile(path.join(DONNEES, "genre-deputes.json"), "utf8")) as
    { deputes: Record<string, { genre: "f" | "m"; source: string }> };
  for (const [id, g] of Object.entries(g43.deputes)) genres.set(id, { genre: g.genre, source: g.source });
  const liens = new Map(portraits.deputes.filter((p) => p.deputy_id && p.profil).map((p) => [String(p.deputy_id), p.profil!]));
  const aLire = [...circonscriptions.keys()].filter((id) => !genres.has(id));
  for (const [n, id] of aLire.entries()) {
    const url = liens.get(id);
    if (!url) continue;
    const html = await page(cache, url, `${id}.html`);
    process.stdout.write(`\r  ${n + 1}/${aLire.length} fiches lues pour le genre`);
    const titre = texte(html.match(/Député(?:e)? (?:de |d’|d'|du |des )[^<]{2,80}/)?.[0] ?? "");
    // Pas de \b : en JavaScript, « é » n'est pas un caractère de mot.
    const libelle = titre.split(",")[0];
    if (/^Députée\s/.test(titre)) genres.set(id, { genre: "f", source: `fiche de l'Assemblée (« ${libelle} »)` });
    else if (/^Député\s/.test(titre)) genres.set(id, { genre: "m", source: `fiche de l'Assemblée (« ${libelle} »)` });
  }
  if (aLire.length) process.stdout.write("\n");

  const s = construireSources({
    legislature, date, commit: sha, nomsAssnat, circonscriptions, genres,
    mandats: csv("mandates_qc.csv"), fonctions: csv("functions_qc.csv"),
    resultats: csv("election_results_qc.csv"), periodes: csv("periods_qc.csv"),
  });

  const dossier = path.join(DONNEES, `${legislature}e`);
  await fs.mkdir(dossier, { recursive: true });
  const extrait = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
  const ecrire = (f: string, d: object) => fs.writeFile(path.join(dossier, f), JSON.stringify({ ...d, extrait_le: extrait }, null, 2) + "\n", "utf8");
  await ecrire("fonctions-deputes.json", s.fonctions);
  await ecrire("carriere-deputes.json", s.carrieres);
  await ecrire("resultats-elections.json", s.resultats);
  await ecrire("genre-deputes.json", s.genres);

  const c = s.controle;
  console.log(`  ${c.elus} élu·es de la ${legislature}e · dimension ${sha} · date de référence ${s.fonctions.date_reference}`);
  for (const [libelle, liste] of [["sans nom de l'Assemblée", c.sansNom], ["sans circonscription", c.sansCirconscription],
    ["sans scrutin", c.sansScrutin], ["sans genre", c.sansGenre]] as const) {
    if (liste.length) console.warn(`  ⚠️ ${liste.length} ${libelle} : ${liste.join(", ")}`);
  }
  for (const e of c.ecarts) console.warn(`  ⚠️ ${e}`);
  if (c.nonApparies.length) console.warn(`  ${c.nonApparies.length} dossier(s) de porte-parole sans vis-à-vis certain (VIS_A_VIS_MANUELS).`);
  console.log(`  → ${path.relative(process.cwd(), dossier)}/`);
}

if (process.argv[1]?.endsWith("sources-cartes-dimension.ts")) main().catch((e) => { console.error(e); process.exit(1); });
