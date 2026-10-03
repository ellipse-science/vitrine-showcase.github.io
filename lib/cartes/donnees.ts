// SOURCES DES CARTES lues sur disque, au build : fiches de fonctions,
// résultats électoraux, genre, carrière, mandats, bornes des périodes et
// retraits d'expressions relus à la main. Node seulement (fs) ; le site les
// lit au build, jamais dans le navigateur.
// Origine : scripts/social/cartes-deputes.ts (extraction du 2 oct. 2026).
import fs from "node:fs/promises";
import path from "node:path";
import type { PeriodKey, loadAssemblee } from "@/lib/data/assemblee";
import { cleDistrict, plageFr, slugCirco } from "./fonctions";
import type { Etiquette, FicheFonctions, Genre, Mandat, Mandats, Scrutin } from "./types";

export type DonneesAssemblee = NonNullable<Awaited<ReturnType<typeof loadAssemblee>>>;

export async function chargerScrutins(): Promise<Scrutin[]> {
  const fichier = path.resolve(process.cwd(), "scripts/social/donnees/resultats-elections.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  if (!brut) {
    // garde-redaction: ok (diagnostic de console du générateur, jamais affiché sur une carte ni sur le site)
    console.warn("  ⚠️ resultats-elections.json absent : pas de résultat électoral. Lancez scripts/social/resultats-elections.ts.");
    return [];
  }
  return (JSON.parse(brut) as { resultats: Scrutin[] }).resultats;
}

export async function chargerFonctions(): Promise<FicheFonctions[]> {
  const fichier = path.resolve(process.cwd(), "scripts/social/donnees/fonctions-deputes.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  if (!brut) {
    // garde-redaction: ok (diagnostic de console du générateur, jamais affiché sur une carte ni sur le site)
    console.warn("  ⚠️ fonctions-deputes.json absent : ni salaire ni vis-à-vis. Lancez scripts/social/fonctions-deputes.ts.");
    return [];
  }
  return (JSON.parse(brut) as { deputes: FicheFonctions[] }).deputes;
}

/** Genre grammatical des élus, clé assnat_id : donnees/genre-deputes.json,
 *  chaque entrée avec sa source (pplmatch, ou la fiche de l'Assemblée :
 *  « Députée de … »). Rien n'est déduit d'un prénom. */
export async function chargerGenres(): Promise<Map<string, Genre>> {
  const fichier = path.resolve(process.cwd(), "scripts/social/donnees/genre-deputes.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  if (!brut) {
    // garde-redaction: ok (diagnostic de console du générateur, jamais affiché sur une carte ni sur le site)
    console.warn("  ⚠️ genre-deputes.json absent : « Élu.e » reste neutre sur toutes les cartes.");
    return new Map();
  }
  const d = JSON.parse(brut) as { deputes: Record<string, { genre: "f" | "m" }> };
  return new Map(Object.entries(d.deputes).map(([id, e]) => [id, e.genre]));
}

export async function chargerJsonDeputes<T>(fichier: string): Promise<Map<string, T>> {
  const brut = await fs.readFile(path.resolve(process.cwd(), "scripts/social/donnees", fichier), "utf8").catch(() => null);
  if (!brut) { console.warn(`  ⚠️ ${fichier} absent.`); return new Map(); }
  return new Map(Object.entries((JSON.parse(brut) as { deputes: Record<string, T> }).deputes));
}

/** Bornes de chaque période, lues dans le fichier agrégé par parti : toutes
 *  ses lignes d'une même période portent les mêmes dates. */
export async function etiquettesPeriodes(): Promise<Record<PeriodKey, Etiquette>> {
  const brut = await fs.readFile(path.resolve(process.cwd(), "public/data/agora/agora_decideurs_qc.json"), "utf8");
  const lignes = JSON.parse(brut) as { period_type: PeriodKey; period_start_date: string; period_end_date: string }[];
  const bornes = (cle: PeriodKey) => lignes.find((l) => l.period_type === cle);
  const TYPES: Record<PeriodKey, string> = { legislature: "Législature", session: "Session", last_pdq: "Dernière séance" };
  const out = {} as Record<PeriodKey, Etiquette>;
  for (const cle of Object.keys(TYPES) as PeriodKey[]) {
    const b = bornes(cle);
    // La législature se lit par ses années d'élection et de dissolution, pas
    // par la première et la dernière séance couvertes.
    out[cle] = { type: TYPES[cle], date: cle === "legislature" ? "2022-2026" : b ? plageFr(b.period_start_date, b.period_end_date) : "" };
  }
  return out;
}

export async function chargerMandats(): Promise<Mandats> {
  const fichier = path.resolve(process.cwd(), "public/data/agora/agora_decideurs_qc_affiliations.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  const vide: Mandats = { parNomEtDistrict: new Map(), parDistrict: new Map(), parNom: new Map() };
  if (!brut) return vide;
  type Ligne = { deputy?: string; district_id?: string; affiliation_start_date?: string; start_reason?: string };
  let rows: Ligne[] = [];
  try { rows = JSON.parse(brut) as Ligne[]; } catch { return vide; }

  // On retient le PREMIER mandat de chaque personne : c'est l'élection, non la
  // défection qui a pu suivre.
  const premier = new Map<string, { nom: string; district: string; m: Mandat }>();
  for (const r of rows) {
    if (!r.district_id || !r.affiliation_start_date) continue;
    const nom = cleDistrict(r.deputy ?? "");
    const district = cleDistrict(r.district_id);
    const cle = `${nom}@${district}`;
    const tenant = premier.get(cle);
    if (!tenant || r.affiliation_start_date < tenant.m.debut) {
      premier.set(cle, { nom, district, m: { debut: r.affiliation_start_date, motif: r.start_reason ?? "" } });
    }
  }

  const out = { ...vide, parNomEtDistrict: new Map<string, Mandat>() };
  const compteNom = new Map<string, number>();
  const compteDistrict = new Map<string, number>();
  for (const { nom, district } of premier.values()) {
    compteNom.set(nom, (compteNom.get(nom) ?? 0) + 1);
    compteDistrict.set(district, (compteDistrict.get(district) ?? 0) + 1);
  }
  for (const [cle, { nom, district, m }] of premier) {
    out.parNomEtDistrict.set(cle, m);
    if (compteDistrict.get(district) === 1) out.parDistrict.set(district, m);
    if (compteNom.get(nom) === 1) out.parNom.set(nom, m);
  }
  return out;
}

/** Tout ce que construireJeu() attend des sources, chargé d'un coup. */
export async function chargerSources() {
  const [mandats, fonctions, genres, carrieres, scrutins] = await Promise.all([
    chargerMandats(), chargerFonctions(), chargerGenres(),
    chargerJsonDeputes<import("./types").Carriere>("carriere-deputes.json"), chargerScrutins(),
  ]);
  return { mandats, fonctions, genres, carrieres, scrutins };
}
export type Sources = Awaited<ReturnType<typeof chargerSources>>;

/** EXPRESSIONS RETIRÉES À LA RELECTURE (donnees/expressions-retirees.json) :
 *  une expression distinctive jugée trompeuse ou hors de propos disparaît de la
 *  carte, à la main, avec le nom de l'élu et l'expression pour que le retrait
 *  tombe si le raffineur en produit une autre. */
export async function retirerExpressions(data: NonNullable<Awaited<ReturnType<typeof loadAssemblee>>>): Promise<void> {
  const fichier = path.resolve(process.cwd(), "scripts/social/donnees/expressions-retirees.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  if (!brut) return;
  const retraits = (JSON.parse(brut) as { retraits: { circonscription: string; elu: string; expression: string }[] }).retraits;
  const faits = new Set<string>();
  for (const p of Object.values(data.periods)) {
    for (const d of [...(p?.rows.flatMap((r) => r.deputies ?? []) ?? []), ...(p?.independants ?? [])]) {
      const r = retraits.find((x) => x.circonscription === slugCirco(d));
      if (!r || (d.signatureWord ?? "").trim() !== r.expression) continue;
      d.signatureWord = undefined;
      d.signatureWordContext = undefined;
      faits.add(r.circonscription);
    }
  }
  console.log(`  ${faits.size} expression(s) retirée(s) à la relecture (donnees/expressions-retirees.json)`);
  const sansObjet = retraits.filter((r) => !faits.has(r.circonscription));
  // garde-redaction: ok (diagnostic de console du générateur, jamais affiché sur une carte ni sur le site)
  if (sansObjet.length) console.warn(`  ⚠️ retrait sans objet, l'expression a changé : ${sansObjet.map((r) => `${r.elu} « ${r.expression} »`).join(", ")}`);
}

