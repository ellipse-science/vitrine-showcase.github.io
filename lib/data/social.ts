import { readDatasetText } from "./source";
import { lastUpdatedLabel } from "@/lib/dates";
import { ELECTION_CALL_DATE } from "@/lib/election";
import { PARTY_COLORS, PARTY_KEYS, PARTY_LABELS, PARTY_FULL_NAMES, type PartyKey } from "./parties";
import {
  FILTRES,
  PLATEFORMES,
  type AudienceItem,
  type FiltrePlateforme,
  type PalmaresItem,
  type Plateforme,
  type PresenceCell,
  type Serie,
  type SocialData,
} from "./social-meta";

export * from "./social-meta";

/**
 * Module « Les candidats sur les réseaux » (expérimental, dev seulement).
 *
 * Quatre tables publiées par le raffineur `agora-social` (aws-refiners) dans
 * `agora_datamart`, à partir de la collecte `a-social-accounts` d'aws-infra.
 * Elles n'existent qu'en DEV (tables.json : `env: "DEV"`, `api: false`) : le
 * chargeur les lit dans le fichier, jamais dans l'API.
 *
 * Tout est pré-calculé ici ; le composant client ne fait que choisir une vue.
 * Tant que le raffineur n'a rien publié (fichier absent ou vide), le chargeur
 * rend `null` et le module ne s'affiche pas.
 */

export const SOCIAL_DATASETS = {
  comptes: "public/data/agora/agora_social_comptes.json",
  publicationsJour: "public/data/agora/agora_social_publications_jour.json",
  presence: "public/data/agora/agora_social_presence.json",
  palmares: "public/data/agora/agora_social_palmares.json",
} as const;

/** Palmarès : les publications des N derniers jours de relevé. */
export const PALMARES_JOURS = 7;
export const PALMARES_N = 10;
export const AUDIENCE_N = 20;

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
type PresenceRow = {
  parti: string;
  plateforme: string;
  avec_compte: number | null;
  candidats: number | null;
  part: number | null;
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
};

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

/** Assemble les quatre tables en vues prêtes à dessiner (pure, testée). */
export function construireSocial(
  comptes: CompteRow[],
  jours: JourRow[],
  presence: PresenceRow[],
  palmares: PalmaresRow[],
): SocialData | null {
  if (comptes.length === 0 || jours.length === 0 || presence.length === 0) return null;

  const partis = [...PARTY_KEYS];

  // Présence : parti x plateforme, les candidatures officielles au dénominateur.
  const vide = () =>
    Object.fromEntries(PLATEFORMES.map((p) => [p, { avecCompte: 0, candidats: 0, part: 0 }])) as Record<
      Plateforme,
      PresenceCell
    >;
  const presenceParParti = Object.fromEntries(partis.map((k) => [k, vide()])) as SocialData["presence"];
  for (const r of presence) {
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (!k || !p) continue;
    const candidats = nombre(r.candidats);
    const avecCompte = nombre(r.avec_compte);
    presenceParParti[k][p] = { avecCompte, candidats, part: candidats > 0 ? avecCompte / candidats : 0 };
  }

  // Audience : les comptes les plus suivis, toutes plateformes et par plateforme.
  const items: AudienceItem[] = comptes.flatMap((r) => {
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (!k || !p || r.abonnes == null) return [];
    const estParti = r.type === "parti";
    return [{
      nom: estParti ? PARTY_FULL_NAMES[k] : (r.candidat ?? r.pseudo ?? r.compte),
      party: k,
      plateforme: p,
      estParti,
      abonnes: r.abonnes,
    }];
  });
  const parAbonnes = (a: AudienceItem, b: AudienceItem) => b.abonnes - a.abonnes;
  const audience = Object.fromEntries(
    FILTRES.map((f) => [
      f,
      items
        .filter((i) => f === "toutes" || i.plateforme === f)
        .sort(parAbonnes)
        .slice(0, AUDIENCE_N),
    ]),
  ) as SocialData["audience"];

  // Séries par jour depuis le déclenchement, jusqu'au dernier jour COMPLET :
  // le jour du dernier relevé n'est collecté qu'en partie.
  const dernierJour = jours.reduce((m, r) => (r.jour > m ? r.jour : m), "");
  const debut = ELECTION_CALL_DATE ?? jourMoins(dernierJour, 30);
  const fin = jourMoins(dernierJour, 1);
  const axe = fin >= debut ? joursEntre(debut, fin) : [];
  const index = new Map(axe.map((j, i) => [j, i]));
  const series = (champ: "publications" | "jaime") =>
    Object.fromEntries(
      FILTRES.map((f) => {
        const parParti = new Map(partis.map((k) => [k, new Array(axe.length).fill(0) as number[]]));
        for (const r of jours) {
          const i = index.get(r.jour);
          const k = partyKey(r.parti);
          if (i === undefined || !k) continue;
          if (f !== "toutes" && plateforme(r.plateforme) !== f) continue;
          parParti.get(k)![i] += nombre(r[champ]);
        }
        return [f, partis.map((k) => ({ party: k, valeurs: parParti.get(k)! }))];
      }),
    ) as Record<FiltrePlateforme, Serie[]>;

  // Palmarès : les plus aimées des PALMARES_JOURS derniers jours de relevé.
  const palmaresAu = dernierJour;
  const palmaresDu = jourMoins(dernierJour, PALMARES_JOURS - 1);
  const recents: PalmaresItem[] = palmares.flatMap((r) => {
    const k = partyKey(r.parti);
    const p = plateforme(r.plateforme);
    if (!k || !p || r.jour < palmaresDu || r.jour > palmaresAu || r.jaime == null) return [];
    return [{
      jour: r.jour,
      nom: r.type === "parti" ? PARTY_FULL_NAMES[k] : (r.candidat ?? r.pseudo ?? PARTY_LABELS[k]),
      party: k,
      plateforme: p,
      url: r.url,
      texte: (r.texte ?? "").trim(),
      jaime: r.jaime,
      commentaires: nombre(r.commentaires),
    }];
  });
  const palmaresParFiltre = Object.fromEntries(
    FILTRES.map((f) => [
      f,
      recents
        .filter((i) => f === "toutes" || i.plateforme === f)
        .sort((a, b) => b.jaime - a.jaime)
        .slice(0, PALMARES_N),
    ]),
  ) as SocialData["palmares"];

  const calcule = comptes.reduce((m, r) => ((r.calcule_le ?? "") > m ? (r.calcule_le ?? "") : m), "");

  const partiInfo = Object.fromEntries(
    partis.map((k) => [k, { sigle: PARTY_LABELS[k], nom: PARTY_FULL_NAMES[k], couleur: PARTY_COLORS[k] }]),
  ) as SocialData["partiInfo"];

  return {
    partiInfo,
    lastUpdated: lastUpdatedLabel((calcule || dernierJour).slice(0, 10)),
    partis,
    presence: presenceParParti,
    audience,
    jours: axe,
    publications: series("publications"),
    jaime: series("jaime"),
    palmares: palmaresParFiltre,
    palmaresDu,
    palmaresAu,
  };
}

export async function loadSocial(): Promise<SocialData | null> {
  const [comptes, jours, presence, palmares] = await Promise.all([
    lire<CompteRow>(SOCIAL_DATASETS.comptes),
    lire<JourRow>(SOCIAL_DATASETS.publicationsJour),
    lire<PresenceRow>(SOCIAL_DATASETS.presence),
    lire<PalmaresRow>(SOCIAL_DATASETS.palmares),
  ]);
  if (!comptes || !jours || !presence) return null;
  return construireSocial(comptes, jours, presence, palmares ?? []);
}
