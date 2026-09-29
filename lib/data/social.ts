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
  type AudienceJour,
  type Carte,
  type Circo,
  type CompteCirco,
  type FilItem,
  TYPES_MEDIA,
  type TypeMedia,
  NATURES,
  type Nature,
  type OrigineTexte,
  type PageCirco,
  type CandidatPage,
  type SerieJour,
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
  comptesJour: "public/data/agora/agora_social_comptes_jour.json",
  /** Fil complet (aws-refiners#590, ~60 Mo) : JAMAIS commité (.gitignore) ; lu
   *  au build s'il est présent, sinon les pages s'en tiennent à 20 publications. */
  filComplet: "public/data/agora/agora_social_fil_complet.json",
} as const;
/** Publications portées par le HTML d'une page ; le reste se charge à la demande. */
export const FIL_PAGE = 20;
/** Texte des publications sur les pages de circonscription. */
export const TEXTE_PAGE = 500;
/** Début des séries par candidat des pages de circonscription. */
export const SERIES_DEBUT = "2026-08-01";

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
  nature?: string | null;
  texte_origine?: string | null;
};
type CompteJourRow = {
  compte: string;
  jour: string;
  publications: number | null;
  jaime: number | null;
  commentaires?: number | null;
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
const nature = (t: string | null | undefined): Nature | null =>
  (NATURES as readonly string[]).includes(String(t)) ? (t as Nature) : null;
const origine = (t: string | null | undefined): OrigineTexte | null =>
  t === "publication" || t === "description" || t === "autocollant" ? t : null;

/** Adresse d'une circonscription, comme la démo : sans accents, minuscules,
 *  tout le reste en tirets (« Anjou–Louis-Riel » → « anjou-louis-riel »). */
export const slugCirco = (nom: string) =>
  nom
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Fil par circonscription, clé = cleCirco(nom). Pure, testée. */
export function construireFil(
  rows: FilRow[],
  vignetteDisponible: (cle: string) => boolean = () => false,
  maxTexte = TEXTE_MAX,
): Map<string, FilItem[]> {
  const coupe = (t: string) => (t.length > maxTexte ? `${t.slice(0, maxTexte - 1).trimEnd()}…` : t);
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
      texte: coupe((r.texte ?? "").trim()),
      jaime: nombre(r.jaime),
      commentaires: nombre(r.commentaires),
      vignette: urlVignette(r.vignette, vignetteDisponible),
      media: typeMedia(r.media_type),
      nature: nature(r.nature),
      origine: origine(r.texte_origine),
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
export function construireCarte(
  comptes: CompteRow[],
  fond: FondCarte | null,
  fil: Map<string, FilItem[]> = new Map(),
): Carte | null {
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
    const tete = fil.get(cleCirco(c.nom))?.[0];
    const extrait = (t: string) => (t.length > 90 ? `${t.slice(0, 89).trimEnd()}…` : t);
    return {
      derniere: tete
        ? { jour: tete.jour, nom: tete.nom, party: tete.party, plateforme: tete.plateforme, extrait: extrait(tete.texte) }
        : null,
      code: c.code,
      slug: slugCirco(c.nom),
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
  fil: Map<string, FilItem[]> = new Map(),
  comptesJour: CompteJourRow[] | null = null,
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

  // Audience : tous les comptes et leurs mesures ; classés et filtrés au client.
  const audience: (AudienceItem & { compte: string })[] = comptes
    .flatMap((r) => {
      const k = partyKey(r.parti);
      const p = plateforme(r.plateforme);
      if (!k || !p) return [];
      const type = typeCompte(r.type);
      return [{
        nom: type === "parti" ? PARTY_FULL_NAMES[k] : (r.candidat ?? r.pseudo ?? r.compte),
        party: k,
        plateforme: p,
        type,
        abonnes: r.abonnes,
        compte: r.compte,
      }];
    })
    .sort((a, b) => (b.abonnes ?? 0) - (a.abonnes ?? 0));

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
      nature: nature(r.nature),
      origine: origine(r.texte_origine),
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
    audience: audience.map(({ compte: _c, ...a }) => a),
    jours: axe,
    campagne: campagne < 0 ? 0 : campagne,
    cube,
    palmares: tops,
    carte: construireCarte(comptes, fond, fil),
    audienceJour: (() => {
      const iCompte = new Map(audience.map((a, i) => [a.compte, i]));
      return (comptesJour ?? []).flatMap((r) => {
        const c = iCompte.get(r.compte);
        const j = index.get(r.jour);
        return c === undefined || j === undefined
          ? []
          : [[c, j, nombre(r.publications), nombre(r.jaime), nombre(r.commentaires)] as AudienceJour];
      });
    })(),
  };
}

export async function loadSocial(): Promise<SocialData | null> {
  const [comptes, jours, palmares] = await Promise.all([
    lire<CompteRow>(SOCIAL_DATASETS.comptes),
    lire<JourRow>(SOCIAL_DATASETS.publicationsJour),
    lire<PalmaresRow>(SOCIAL_DATASETS.palmares),
  ]);
  if (!comptes || !jours) return null;
  // Seule la tête de chaque fil entre dans les props (infobulle) ; le fil
  // complet reste dans son fichier statique par circonscription.
  return construireSocial(
    comptes,
    jours,
    palmares ?? [],
    geo as FondCarte,
    vignetteSurDisque,
    await loadSocialFil(),
    await loadComptesJour(),
  );
}

// ── Pages de circonscription (une par circonscription, générées au build) ────
let comptesJourMemo: Promise<CompteJourRow[] | null> | null = null;
/** Séries par compte (table social_comptes_jour, aws-refiners#590) ; null
 *  tant que le raffineur ne l'a pas publiée : les pages masquent alors les séries. */
let filCompletMemo: Promise<Map<string, FilItem[]> | null> | null = null;
/** Fil complet par circonscription, ou null si le fichier n'est pas là. */
export function loadFilComplet(): Promise<Map<string, FilItem[]> | null> {
  filCompletMemo ??= lire<FilRow>(SOCIAL_DATASETS.filComplet).then((rows) =>
    rows && rows.length ? construireFil(rows, vignetteSurDisque, TEXTE_PAGE) : null,
  );
  return filCompletMemo;
}

export function loadComptesJour(): Promise<CompteJourRow[] | null> {
  comptesJourMemo ??= lire<CompteJourRow>(SOCIAL_DATASETS.comptesJour);
  return comptesJourMemo;
}

/** Une page de circonscription. Pure, testée. */
export function construirePageCirco(
  circo: { nom: string; region: string },
  comptes: CompteRow[],
  fil: FilItem[],
  comptesJour: CompteJourRow[] | null,
  fin: string,
): PageCirco {
  const siens = comptes.filter(
    (r) => typeCompte(r.type) === "candidat" && r.circonscription && cleCirco(r.circonscription) === cleCirco(circo.nom),
  );
  const nomTypo = siens[0]?.circonscription ?? circo.nom;
  const parCompte = new Map<string, Map<string, SerieJour>>();
  for (const r of comptesJour ?? []) {
    if (!parCompte.has(r.compte)) parCompte.set(r.compte, new Map());
    parCompte.get(r.compte)!.set(r.jour, { jour: r.jour, publications: nombre(r.publications), jaime: nombre(r.jaime) });
  }
  const jours = fin >= SERIES_DEBUT ? joursEntre(SERIES_DEBUT, fin) : [];
  const candidats: CandidatPage[] = [];
  for (const k of PARTY_KEYS) {
    const leurs = siens.filter((r) => partyKey(r.parti) === k);
    const noms = [...new Set(leurs.map((r) => r.candidat ?? r.pseudo ?? r.compte))];
    for (const nom of noms) {
      const cs = leurs.filter((r) => (r.candidat ?? r.pseudo ?? r.compte) === nom);
      const serie = comptesJour
        ? jours.map((j) => {
            let publications = 0;
            let jaime = 0;
            for (const c of cs) {
              const x = parCompte.get(c.compte)?.get(j);
              publications += x?.publications ?? 0;
              jaime += x?.jaime ?? 0;
            }
            return { jour: j, publications, jaime };
          })
        : null;
      candidats.push({
        nom,
        party: k,
        comptes: cs.flatMap((c) => {
          const p = plateforme(c.plateforme);
          return p ? [{ plateforme: p, url: urlCompte(p, c.pseudo), abonnes: c.abonnes }] : [];
        }),
        publications: cs.reduce((t, c) => t + nombre(c.publications_campagne), 0),
        jaime: cs.reduce((t, c) => t + nombre(c.jaime_campagne), 0),
        serie,
      });
    }
  }
  return {
    slug: slugCirco(circo.nom),
    nom: nomTypo,
    region: circo.region,
    candidats,
    sansCompte: PARTY_KEYS.filter((k) => !candidats.some((c) => c.party === k)),
    fil,
    jours,
    campagne: ELECTION_CALL_DATE ?? "",
  };

}

let pagesMemo: Promise<Map<string, PageCirco>> | null = null;
/** Toutes les pages, une lecture par build. Vide si le module n'a pas de données. */
export function loadPagesCirco(): Promise<Map<string, PageCirco>> {
  pagesMemo ??= (async () => {
    const [comptes, jours, filRows, complet, comptesJour] = await Promise.all([
      lire<CompteRow>(SOCIAL_DATASETS.comptes),
      lire<JourRow>(SOCIAL_DATASETS.publicationsJour),
      lire<FilRow>(SOCIAL_DATASETS.fil),
      loadFilComplet(),
      loadComptesJour(),
    ]);
    const fils = construireFil(filRows ?? [], vignetteSurDisque, TEXTE_PAGE);
    const out = new Map<string, PageCirco>();
    if (!comptes || comptes.length === 0 || !jours) return out;
    const dernier = jours.reduce((m, r) => (r.jour > m ? r.jour : m), "");
    const fin = jourMoins(dernier, 1);
    for (const c of (geo as FondCarte).circonscriptions) {
      const tout = complet?.get(cleCirco(c.nom));
      const page = construirePageCirco(c, comptes, (tout ?? fils.get(cleCirco(c.nom)) ?? []).slice(0, FIL_PAGE), comptesJour, fin);
      out.set(page.slug, { ...page, code: c.code, total: tout ? tout.length : page.fil.length, complet: !!tout && tout.length > FIL_PAGE });
    }
    return out;
  })();
  return pagesMemo;
}
