import { existsSync } from "node:fs";
import path from "node:path";
import { readDatasetText } from "./source";
import geo from "@/lib/geo/circonscriptions-2026.json";
import { lastUpdatedLabel } from "@/lib/dates";
import { ELECTION_CALL_DATE } from "@/lib/election";
import { PARTY_COLORS, PARTY_KEYS, PARTY_LABELS, PARTY_FULL_NAMES, type PartyKey } from "./parties";
import {
  PLATEFORMES,
  TYPES,
  type AudienceItem,
  type Carte,
  type Circo,
  type CompteCirco,
  type FilItem,
  TYPES_MEDIA,
  type TypeMedia,
  type CubeRow,
  type PalmaresItem,
  type Plateforme,
  type PresenceCell,
  type SocialData,
  type TypeCompte,
} from "./social-meta";

export * from "./social-meta";

/**
 * Module « Les candidats sur les réseaux » (expérimental, dev seulement).
 *
 * Trois tables publiées par le raffineur `agora-social` (aws-refiners) dans
 * `agora_datamart`, à partir de la collecte `a-social-accounts` d'aws-infra.
 * Elles n'existent qu'en DEV (tables.json : `env: "DEV"`, `api: false`) : le
 * chargeur les lit dans le fichier, jamais dans l'API.
 *
 * Le chargeur remet au client un cube compact (jour x parti x plateforme x
 * type, additif) : la période et les filtres se recalculent côté client par
 * simple somme, sans jamais relire de donnée dans le navigateur.
 * Tant que le raffineur n'a rien publié (fichier absent ou vide), le chargeur
 * rend `null` et le module ne s'affiche pas.
 */

export const SOCIAL_DATASETS = {
  comptes: "public/data/agora/agora_social_comptes.json",
  publicationsJour: "public/data/agora/agora_social_publications_jour.json",
  palmares: "public/data/agora/agora_social_palmares.json",
  fil: "public/data/agora/agora_social_fil.json",
} as const;

/** Début de la collecte : l'axe de la frise part de là. */
export const DEBUT_COLLECTE = "2026-04-01";
/** Texte du palmarès tronqué pour garder la page légère. */
export const TEXTE_MAX = 120;

// ── Lignes telles que fetch_data.R les écrit (tableau d'objets, NA → null) ────
type CompteRow = {
  compte: string;
  plateforme: string;
  pseudo: string | null;
  candidat: string | null;
  parti: string;
  circonscription: string | null;
  type: string;
  abonnes: number | null;
  releve: string | null;
  calcule_le: string | null;
  /** Candidatures officielles du parti du compte (127 pour les cinq partis). */
  candidatures_parti: number | null;
  /** Activité du compte, calculée par le raffineur (absente avant #586). */
  publications_7j?: number | null;
  jaime_7j?: number | null;
  publications_campagne?: number | null;
  jaime_campagne?: number | null;
  derniere_publication?: string | null;
};
type JourRow = {
  jour: string;
  parti: string;
  plateforme: string;
  type: string;
  publications: number | null;
  jaime: number | null;
  commentaires: number | null;
};
type PalmaresRow = {
  jour: string;
  plateforme: string;
  parti: string;
  type: string;
  candidat: string | null;
  pseudo: string | null;
  url: string | null;
  texte: string | null;
  jaime: number | null;
  commentaires: number | null;
  post_id?: string | null;
  /** Clé de la vignette sous /v1/art (`social/<plateforme>/<id>.jpg`), ou null. */
  vignette?: string | null;
  media_type?: string | null;
};
type FilRow = PalmaresRow & { circonscription: string | null; compte?: string | null };

const partyKey = (p: string | null | undefined): PartyKey | null => {
  const k = String(p ?? "").toLowerCase();
  return (PARTY_KEYS as readonly string[]).includes(k) ? (k as PartyKey) : null;
};
const plateforme = (p: string | null | undefined): Plateforme | null => {
  const k = String(p ?? "").toLowerCase();
  return (PLATEFORMES as readonly string[]).includes(k) ? (k as Plateforme) : null;
};
const nombre = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Jours ISO de `debut` à `fin` inclus. */
export function joursEntre(debut: string, fin: string): string[] {
  const out: string[] = [];
  const d = new Date(`${debut}T00:00:00Z`);
  const f = new Date(`${fin}T00:00:00Z`);
  for (; d <= f; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const jourMoins = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

async function lire<T>(fichier: string): Promise<T[] | null> {
  try {
    const rows = JSON.parse(await readDatasetText(fichier)) as T[];
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null; // le raffineur n'a pas encore publié
  }
}

/** Fond de carte : donnée de référence statique (scripts/reference/carte_circonscriptions.mjs). */
export type FondCarte = {
  vue: number[];
  encarts: Record<string, number[]>;
  circonscriptions: { code: number; nom: string; region: string; d: string }[];
};

/** Clé de jointure des noms de circonscription : le raffineur écrit les
 *  tirets et apostrophes typographiques (« Anjou–Louis-Riel »), la carte
 *  d'Élections Québec des traits d'union simples (« Anjou-Louis-Riel »). */
export const cleCirco = (nom: string) =>
  nom.normalize("NFC").replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019\u02bc]/g, "'").toLowerCase().trim();

/** Adresse publique d'un compte, reconstruite de son pseudo. */
export function urlCompte(p: Plateforme, pseudo: string | null | undefined): string | null {
  const h = String(pseudo ?? "").replace(/^@/, "").trim();
  if (!h || !/^[\w.\-]+$/.test(h)) return null;
  if (p === "facebook") return `https://www.facebook.com/${h}`;
  if (p === "instagram") return `https://www.instagram.com/${h}/`;
  return `https://www.tiktok.com/@${h}`;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CLE_VIGNETTE = /^social\/(facebook|instagram|tiktok)\/[A-Za-z0-9._-]{1,40}\.jpg$/;
const DOSSIER_ART = path.join(process.cwd(), "public", "data", "generated-art");
/** Une vignette n'est servie que si le build l'a rapatriée (scripts/fetch_social_vignettes.mjs). */
const vignetteSurDisque = (cle: string) => existsSync(path.join(DOSSIER_ART, cle));
const urlVignette = (cle: string | null | undefined, disponible: (cle: string) => boolean) =>
  cle && CLE_VIGNETTE.test(cle) && disponible(cle) ? `${BASE_PATH}/data/generated-art/${cle}` : null;
const typeMedia = (t: string | null | undefined): TypeMedia | null =>
  (TYPES_MEDIA as readonly string[]).includes(String(t)) ? (t as TypeMedia) : null;

/** Fil par circonscription, clé = cleCirco(nom). Pure, testée. */
export function construireFil(
  rows: FilRow[],
  vignetteDisponible: (cle: string) => boolean = () => false,
): Map<string, FilItem[]> {
  const out = new Map<string, FilItem[]>();
  for (const r of rows) {
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (!k || !p || !r.circonscription || !r.jour) continue;
    const cle = cleCirco(r.circonscription);
    if (!out.has(cle)) out.set(cle, []);
    out.get(cle)!.push({
      jour: r.jour,
      nom: r.candidat ?? r.pseudo ?? PARTY_LABELS[k],
      party: k,
      plateforme: p,
      url: r.url,
      texte: tronque((r.texte ?? "").trim()),
      jaime: nombre(r.jaime),
      commentaires: nombre(r.commentaires),
      vignette: urlVignette(r.vignette, vignetteDisponible),
      media: typeMedia(r.media_type),
    });
  }
  for (const l of out.values()) l.sort((a, b) => b.jour.localeCompare(a.jour) || b.jaime - a.jaime);
  return out;
}

// Lu une fois par build : la route statique l'appelle pour chaque circonscription.
let filMemo: Promise<Map<string, FilItem[]>> | null = null;
export function loadSocialFil(): Promise<Map<string, FilItem[]>> {
  filMemo ??= lire<FilRow>(SOCIAL_DATASETS.fil).then((rows) => construireFil(rows ?? [], vignetteSurDisque));
  return filMemo;
}

/** Fiches des circonscriptions : les comptes de CANDIDAT suivis, rattachés au
 *  tracé par le nom normalisé. Pure, testée. Null sans fond ou sans compte. */
export function construireCarte(comptes: CompteRow[], fond: FondCarte | null): Carte | null {
  if (!fond || fond.circonscriptions.length === 0) return null;
  const parCirco = new Map<string, CompteCirco[]>();
  for (const r of comptes) {
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (!k || !p || typeCompte(r.type) !== "candidat" || !r.circonscription) continue;
    const cle = cleCirco(r.circonscription);
    if (!parCirco.has(cle)) parCirco.set(cle, []);
    parCirco.get(cle)!.push({
      nom: r.candidat ?? r.pseudo ?? r.compte,
      party: k,
      plateforme: p,
      url: urlCompte(p, r.pseudo),
      abonnes: r.abonnes,
      publications7j: nombre(r.publications_7j),
      jaime7j: nombre(r.jaime_7j),
      publicationsCampagne: nombre(r.publications_campagne),
      jaimeCampagne: nombre(r.jaime_campagne),
    });
  }
  if (parCirco.size === 0) return null;
  const circos: Circo[] = fond.circonscriptions.map((c) => {
    const liste = parCirco.get(cleCirco(c.nom)) ?? [];
    // Le nom typographique du raffineur, à défaut celui de la carte.
    const nom = comptes.find((r) => r.circonscription && cleCirco(r.circonscription) === cleCirco(c.nom))?.circonscription;
    return {
      code: c.code,
      nom: nom ?? c.nom,
      region: c.region,
      d: c.d,
      comptes: liste.sort(
        (a, b) => PARTY_KEYS.indexOf(a.party) - PARTY_KEYS.indexOf(b.party) || PLATEFORMES.indexOf(a.plateforme) - PLATEFORMES.indexOf(b.plateforme),
      ),
    };
  });
  const quad = (v: number[] | undefined) => (v?.length === 4 ? (v as [number, number, number, number]) : null);
  const vue = quad(fond.vue);
  const montreal = quad(fond.encarts.montreal);
  const quebec = quad(fond.encarts.quebec);
  if (!vue || !montreal || !quebec) return null;
  return { vue, encarts: { montreal, quebec }, circos };
}

const typeCompte = (t: string | null | undefined): TypeCompte => (t === "parti" ? "parti" : "candidat");
const tronque = (t: string) => (t.length > TEXTE_MAX ? `${t.slice(0, TEXTE_MAX - 1).trimEnd()}…` : t);

/** Assemble les trois tables en données prêtes à filtrer (pure, testée). */
export function construireSocial(
  comptes: CompteRow[],
  jours: JourRow[],
  palmares: PalmaresRow[],
  fond: FondCarte | null = null,
  vignetteDisponible: (cle: string) => boolean = () => false,
): SocialData | null {
  if (comptes.length === 0 || jours.length === 0) return null;

  const partis = [...PARTY_KEYS];

  // Présence : pour chaque parti et plateforme, les circonscriptions distinctes
  // des comptes de CANDIDAT suivis, rapportées aux candidatures officielles du
  // parti (colonne candidatures_parti). 0 % si aucun compte.
  const candidatures = new Map<PartyKey, number>();
  const circos = new Map<string, Set<string>>();
  for (const r of comptes) {
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (!k || !p) continue;
    if (r.candidatures_parti != null) candidatures.set(k, r.candidatures_parti);
    if (typeCompte(r.type) !== "candidat" || !r.circonscription) continue;
    const cle = `${k}|${p}`;
    if (!circos.has(cle)) circos.set(cle, new Set());
    circos.get(cle)!.add(r.circonscription);
  }
  const presenceParParti = Object.fromEntries(
    partis.map((k) => [
      k,
      Object.fromEntries(
        PLATEFORMES.map((p) => {
          const avecCompte = circos.get(`${k}|${p}`)?.size ?? 0;
          const cands = candidatures.get(k) ?? 0;
          return [p, { avecCompte, candidats: cands, part: cands > 0 ? avecCompte / cands : 0 }];
        }),
      ) as Record<Plateforme, PresenceCell>,
    ]),
  ) as SocialData["presence"];

  // Audience : tous les comptes, du plus suivi au moins suivi (filtrés au client).
  const audience: AudienceItem[] = comptes
    .flatMap((r) => {
      const k = partyKey(r.parti);
      const p = plateforme(r.plateforme);
      if (!k || !p || r.abonnes == null) return [];
      const type = typeCompte(r.type);
      return [{
        nom: type === "parti" ? PARTY_FULL_NAMES[k] : (r.candidat ?? r.pseudo ?? r.compte),
        party: k,
        plateforme: p,
        type,
        abonnes: r.abonnes,
      }];
    })
    .sort((a, b) => b.abonnes - a.abonnes);

  // Axe : du début de la collecte au dernier jour COMPLET (le jour du dernier
  // relevé n'est collecté qu'en partie : l'afficher dessinerait une chute).
  const dernierJour = jours.reduce((m, r) => (r.jour > m ? r.jour : m), "");
  const fin = jourMoins(dernierJour, 1);
  const axe = fin >= DEBUT_COLLECTE ? joursEntre(DEBUT_COLLECTE, fin) : [];
  if (axe.length === 0) return null;
  const index = new Map(axe.map((j, i) => [j, i]));
  const iParti = new Map(partis.map((k, i) => [k, i]));

  const cube: CubeRow[] = jours.flatMap((r) => {
    const i = index.get(r.jour);
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (i === undefined || !k || !p) return [];
    return [[
      i,
      iParti.get(k)!,
      PLATEFORMES.indexOf(p),
      TYPES.indexOf(typeCompte(r.type)),
      nombre(r.publications),
      nombre(r.jaime),
      nombre(r.commentaires),
    ] as CubeRow];
  });

  const declenchement = ELECTION_CALL_DATE;
  const campagne = declenchement ? Math.max(0, axe.findIndex((j) => j >= declenchement)) : 0;

  const tops: PalmaresItem[] = palmares.flatMap((r) => {
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (!k || !p || r.jaime == null || !index.has(r.jour)) return [];
    const type = typeCompte(r.type);
    return [{
      jour: r.jour,
      nom: type === "parti" ? PARTY_FULL_NAMES[k] : (r.candidat ?? r.pseudo ?? PARTY_LABELS[k]),
      party: k,
      plateforme: p,
      type,
      url: r.url,
      texte: tronque((r.texte ?? "").trim()),
      jaime: r.jaime,
      commentaires: nombre(r.commentaires),
      vignette: urlVignette(r.vignette, vignetteDisponible),
      media: typeMedia(r.media_type),
    }];
  });

  const calcule = comptes.reduce((m, r) => ((r.calcule_le ?? "") > m ? (r.calcule_le ?? "") : m), "");

  const partiInfo = Object.fromEntries(
    partis.map((k) => [k, { sigle: PARTY_LABELS[k], nom: PARTY_FULL_NAMES[k], couleur: PARTY_COLORS[k] }]),
  ) as SocialData["partiInfo"];

  return {
    lastUpdated: lastUpdatedLabel((calcule || dernierJour).slice(0, 10)),
    partis,
    partiInfo,
    presence: presenceParParti,
    audience,
    jours: axe,
    campagne: campagne < 0 ? 0 : campagne,
    cube,
    palmares: tops,
    carte: construireCarte(comptes, fond),
  };
}

export async function loadSocial(): Promise<SocialData | null> {
  const [comptes, jours, palmares] = await Promise.all([
    lire<CompteRow>(SOCIAL_DATASETS.comptes),
    lire<JourRow>(SOCIAL_DATASETS.publicationsJour),
    lire<PalmaresRow>(SOCIAL_DATASETS.palmares),
  ]);
  if (!comptes || !jours) return null;
  return construireSocial(comptes, jours, palmares ?? [], geo as FondCarte, vignetteSurDisque);
}
