/**
 * Calculs du tableau de bord « Les candidats sur les réseaux », exécutés côté
 * client sur le cube remis au build. Fonctions pures, sans import serveur.
 *
 * Le cube est additif (publications, j'aime, commentaires) : une période et
 * des filtres se recalculent par somme. Le j'aime MÉDIAN ne l'est pas ; il est
 * remplacé par le j'aime PAR PUBLICATION (somme des j'aime / publications).
 */
import type { PartyKey } from "./parties";
import {
  PLATEFORMES,
  TYPES,
  type CompteCirco,
  type CubeRow,
  type PalmaresItem,
  type Plateforme,
  type SocialData,
  type TypeCompte,
} from "./social-meta";

export type Mesure = "publications" | "jaime" | "commentaires" | "parPublication";
export type Decoupe = "ensemble" | "plateforme" | "parti";

export type Filtres = {
  d0: number;
  d1: number;
  plateformes: Plateforme[];
  partis: PartyKey[];
  types: TypeCompte[];
};

export type Totaux = { publications: number; jaime: number; commentaires: number };
export const SEUIL_HEBDO = 45;
export const PALMARES_N = 10;
/** Profondeur du palmarès publié par le raffineur. */
export const PALMARES_PROFONDEUR = 60;

const zero = (): Totaux => ({ publications: 0, jaime: 0, commentaires: 0 });
const ajoute = (t: Totaux, r: CubeRow) => {
  t.publications += r[4];
  t.jaime += r[5];
  t.commentaires += r[6];
};

export function valeur(t: Totaux, m: Mesure): number {
  if (m === "parPublication") return t.publications > 0 ? t.jaime / t.publications : 0;
  return t[m];
}

/** Lignes du cube qui passent les filtres (période comprise, sauf `sansPeriode`). */
export function lignes(data: SocialData, f: Filtres, sansPeriode = false): CubeRow[] {
  const pl = new Set(f.plateformes.map((p) => PLATEFORMES.indexOf(p)));
  const pa = new Set(f.partis.map((p) => data.partis.indexOf(p)));
  const ty = new Set(f.types.map((t) => TYPES.indexOf(t)));
  return data.cube.filter(
    (r) => (sansPeriode || (r[0] >= f.d0 && r[0] <= f.d1)) && pl.has(r[2]) && pa.has(r[1]) && ty.has(r[3]),
  );
}

export function totaux(rows: CubeRow[]): Totaux {
  const t = zero();
  for (const r of rows) ajoute(t, r);
  return t;
}

/** Publications par jour sur tout l'axe (pour la frise), filtres appliqués. */
export function parJour(data: SocialData, f: Filtres): number[] {
  const out = new Array(data.jours.length).fill(0) as number[];
  for (const r of lignes(data, f, true)) out[r[0]] += r[4];
  return out;
}

/** Un élément dessiné : un parti, ou une plateforme dans la découpe par parti. */
export type Element = { cle: string; party?: PartyKey; plateforme?: Plateforme };
export type Panneau = { cle: string; party?: PartyKey; plateforme?: Plateforme; elements: Element[] };

/** Panneaux et éléments d'une découpe, comme la démo : « Ensemble » et « Par
 *  plateforme » comparent les partis ; « Par parti » compare les plateformes. */
export function panneaux(decoupe: Decoupe, f: Filtres): Panneau[] {
  const elemsPartis = f.partis.map((p) => ({ cle: p, party: p }));
  if (decoupe === "ensemble") return [{ cle: "ensemble", elements: elemsPartis }];
  if (decoupe === "plateforme") {
    return f.plateformes.map((p) => ({ cle: p, plateforme: p, elements: elemsPartis }));
  }
  return f.partis.map((p) => ({
    cle: p,
    party: p,
    elements: f.plateformes.map((pl) => ({ cle: pl, plateforme: pl })),
  }));
}

const dans = (data: SocialData, r: CubeRow, pan: Panneau, el: Element) => {
  const party = data.partis[r[1]];
  const pl = PLATEFORMES[r[2]];
  if (pan.party && party !== pan.party) return false;
  if (pan.plateforme && pl !== pan.plateforme) return false;
  if (el.party && party !== el.party) return false;
  if (el.plateforme && pl !== el.plateforme) return false;
  return true;
};

/** Total d'une mesure par élément, pour chaque panneau (barres et parts). */
export function parElement(data: SocialData, rows: CubeRow[], pans: Panneau[], m: Mesure) {
  return pans.map((pan) => ({
    panneau: pan,
    valeurs: pan.elements.map((el) => {
      const t = zero();
      for (const r of rows) if (dans(data, r, pan, el)) ajoute(t, r);
      return { element: el, valeur: valeur(t, m) };
    }),
  }));
}

/**
 * Segments d'une barre, comme la démo : la valeur de l'élément découpée par
 * plateforme (Facebook plein, Instagram hachuré, TikTok pointillé). Le j'aime
 * par publication n'est pas additif : une seule barre, sans segment.
 */
export function segments(
  data: SocialData,
  rows: CubeRow[],
  pan: Panneau,
  el: Element,
  m: Mesure,
): { plateforme: Plateforme | null; valeur: number }[] {
  if (m === "parPublication") {
    const t = zero();
    for (const r of rows) if (dans(data, r, pan, el)) ajoute(t, r);
    return [{ plateforme: el.plateforme ?? pan.plateforme ?? null, valeur: valeur(t, m) }];
  }
  return PLATEFORMES.map((pl) => {
    const t = zero();
    for (const r of rows) if (PLATEFORMES[r[2]] === pl && dans(data, r, pan, el)) ajoute(t, r);
    return { plateforme: pl, valeur: valeur(t, m) };
  }).filter((sg) => sg.valeur > 0);
}

/** Pas de temps : par jour jusqu'à SEUIL_HEBDO jours, sinon par semaine. */
export function pasDeTemps(f: Filtres): { hebdo: boolean; debuts: number[] } {
  const n = f.d1 - f.d0 + 1;
  const hebdo = n > SEUIL_HEBDO;
  const debuts: number[] = [];
  for (let i = f.d0; i <= f.d1; i += hebdo ? 7 : 1) debuts.push(i);
  return { hebdo, debuts };
}

/** Série d'une mesure par élément, par jour ou par semaine, pour chaque panneau. */
export function series(data: SocialData, rows: CubeRow[], pans: Panneau[], m: Mesure, f: Filtres) {
  const { hebdo, debuts } = pasDeTemps(f);
  const case_ = (jour: number) => Math.min(debuts.length - 1, Math.floor((jour - f.d0) / (hebdo ? 7 : 1)));
  return {
    hebdo,
    debuts,
    panneaux: pans.map((pan) => ({
      panneau: pan,
      series: pan.elements.map((el) => {
        const t = debuts.map(zero);
        for (const r of rows) if (dans(data, r, pan, el)) ajoute(t[case_(r[0])], r);
        return { element: el, valeurs: t.map((x) => valeur(x, m)) };
      }),
    })),
  };
}

/** Les plus aimées de la période et des filtres, tirées du top quotidien. */
export function palmares(data: SocialData, f: Filtres): PalmaresItem[] {
  const du = data.jours[f.d0];
  const au = data.jours[f.d1];
  const pl = new Set(f.plateformes);
  const pa = new Set(f.partis);
  const ty = new Set(f.types);
  return data.palmares
    .filter((p) => p.jour >= du && p.jour <= au && pl.has(p.plateforme) && pa.has(p.party) && ty.has(p.type))
    .sort((a, b) => b.jaime - a.jaime)
    .slice(0, PALMARES_N);
}

/** Le palmarès est exact pour une période couverte par le raffineur et sans
 *  filtre de parti ni de type (le top 10 est tiré par jour et plateforme). */
export function palmaresApproche(data: SocialData, f: Filtres): boolean {
  const couvert = f.d0 >= data.jours.length - PALMARES_PROFONDEUR;
  return !couvert || f.partis.length < data.partis.length || f.types.length < TYPES.length;
}

/** Une tuile de treemap, en fractions du cadre (0 à 1). */
export type Tuile<T> = { item: T; valeur: number; x0: number; y0: number; x1: number; y1: number };

/**
 * Treemap binaire, sans bibliothèque : les éléments, triés du plus grand au plus
 * petit, sont coupés en deux groupes de poids voisins le long du côté le plus
 * long du rectangle, puis chaque moitié l'est à son tour. `ratio` = largeur /
 * hauteur du cadre à l'écran, pour couper dans le bon sens. Aire ∝ valeur.
 */
export function treemap<T>(items: { item: T; valeur: number }[], ratio = 1): Tuile<T>[] {
  const tries = items.filter((i) => i.valeur > 0).sort((a, b) => b.valeur - a.valeur);
  const out: Tuile<T>[] = [];
  const coupe = (liste: typeof tries, x0: number, y0: number, x1: number, y1: number) => {
    if (liste.length === 0) return;
    if (liste.length === 1) {
      out.push({ ...liste[0], x0, y0, x1, y1 });
      return;
    }
    const total = liste.reduce((s, i) => s + i.valeur, 0);
    let cumul = 0;
    let k = 1;
    let meilleur = Infinity;
    for (let i = 0; i < liste.length - 1; i++) {
      cumul += liste[i].valeur;
      const ecart = Math.abs(cumul - total / 2);
      if (ecart < meilleur) {
        meilleur = ecart;
        k = i + 1;
      }
    }
    const a = liste.slice(0, k);
    const f = a.reduce((s, i) => s + i.valeur, 0) / total;
    if ((x1 - x0) * ratio >= y1 - y0) {
      const xm = x0 + (x1 - x0) * f;
      coupe(a, x0, y0, xm, y1);
      coupe(liste.slice(k), xm, y0, x1, y1);
    } else {
      const ym = y0 + (y1 - y0) * f;
      coupe(a, x0, y0, x1, ym);
      coupe(liste.slice(k), x0, ym, x1, y1);
    }
  };
  coupe(tries, 0, 0, 1, 1);
  return out;
}

// ── Carte des circonscriptions ────────────────────────────────────────────────
/** Fenêtre de la carte : l'activité par compte est précalculée par le
 *  raffineur sur ces deux périodes seulement (la frise ne s'y applique pas). */
export type PeriodeCarte = "7j" | "campagne";

export type Meneur = {
  /** Parti qui reçoit le plus de j'aime, ou null : aucun j'aime, ou égalité parfaite. */
  party: PartyKey | null;
  publications: number;
  jaime: number;
  parParti: Partial<Record<PartyKey, { publications: number; jaime: number }>>;
};

/** Le parti en tête d'une circonscription : le plus de j'aime reçus sur la
 *  période, puis le plus de publications en cas d'égalité. Filtres Plateforme
 *  et Parti. */
export function meneur(
  comptes: CompteCirco[],
  periode: PeriodeCarte,
  plateformes: readonly Plateforme[],
  partis: readonly PartyKey[],
): Meneur {
  const parParti: Meneur["parParti"] = {};
  let total = 0;
  let totalJaime = 0;
  for (const c of comptes) {
    if (!plateformes.includes(c.plateforme) || !partis.includes(c.party)) continue;
    const pub = periode === "7j" ? c.publications7j : c.publicationsCampagne;
    const jaime = periode === "7j" ? c.jaime7j : c.jaimeCampagne;
    const acc = (parParti[c.party] ??= { publications: 0, jaime: 0 });
    acc.publications += pub;
    acc.jaime += jaime;
    total += pub;
    totalJaime += jaime;
  }
  const rang = (Object.entries(parParti) as [PartyKey, { publications: number; jaime: number }][])
    .filter(([, v]) => v.jaime > 0)
    .sort((a, b) => b[1].jaime - a[1].jaime || b[1].publications - a[1].publications);
  const [premier, second] = rang;
  const egalite =
    premier && second && premier[1].publications === second[1].publications && premier[1].jaime === second[1].jaime;
  return { party: premier && !egalite ? premier[0] : null, publications: total, jaime: totalJaime, parParti };
}
