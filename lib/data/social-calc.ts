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
  type AudienceItem,
  type AudienceJour,
  type CompteCirco,
  type CubeRow,
  type PalmaresItem,
  type Plateforme,
  type SocialData,
  type TypeCompte,
} from "./social-meta";

/** Les mesures du module, communes aux onglets Partis et Candidats et aux
 *  chiffres de la colonne de droite. Les abonnés sont au dernier relevé (la
 *  période ne s'y applique pas) ; les autres portent sur la période. */
export type Mesure = "abonnes" | "publications" | "jaime" | "commentaires";
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

/** Valeur d'une mesure pour des totaux (toutes additives). Pour les abonnés,
 *  les lignes portent les abonnés dans la case des publications (cf.
 *  lignesAbonnes). */
export function valeur(t: Totaux, m: Mesure): number {
  if (m === "abonnes") return t.publications;
  return t[m];
}

/** Lignes « abonnés » : une par compte suivi, au dernier relevé, sur le
 *  dernier jour de la période, abonnés dans la case des publications. Même
 *  forme que le cube, pour réutiliser barres, parts et découpes. */
export function lignesAbonnes(data: SocialData, f: Filtres): CubeRow[] {
  return data.audience.flatMap((a) => {
    if (a.abonnes == null || !f.plateformes.includes(a.plateforme) || !f.partis.includes(a.party) || !f.types.includes(a.type))
      return [];
    return [[f.d1, data.partis.indexOf(a.party), PLATEFORMES.indexOf(a.plateforme), TYPES.indexOf(a.type), a.abonnes, 0, 0] as CubeRow];
  });
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

/** Publications par jour et par parti (filtres sans la période), pour la
 *  frise empilée : valeurs[jour][index du parti dans `data.partis`]. */
export function parJourParti(data: SocialData, f: Filtres): number[][] {
  const out = data.jours.map(() => new Array(data.partis.length).fill(0) as number[]);
  for (const r of lignes(data, f, true)) out[r[0]][r[1]] += r[4];
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
 * plateforme (Facebook plein, Instagram hachuré, TikTok pointillé).
 */
export function segments(
  data: SocialData,
  rows: CubeRow[],
  pan: Panneau,
  el: Element,
  m: Mesure,
): { plateforme: Plateforme | null; valeur: number }[] {
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
/** Ce qui classe le palmarès : les j'aime (défaut) ou les commentaires ;
 *  abonnés et publications ne se comptent pas par publication. */
export type MesurePalmares = "jaime" | "commentaires";
export const mesurePalmares = (m: Mesure): MesurePalmares => (m === "commentaires" ? "commentaires" : "jaime");

export function palmares(data: SocialData, f: Filtres, m: MesurePalmares = "jaime"): PalmaresItem[] {
  const du = data.jours[f.d0];
  const au = data.jours[f.d1];
  const pl = new Set(f.plateformes);
  const pa = new Set(f.partis);
  const ty = new Set(f.types);
  return data.palmares
    .filter((p) => p.jour >= du && p.jour <= au && pl.has(p.plateforme) && pa.has(p.party) && ty.has(p.type))
    .sort((a, b) => b[m] - a[m] || b.jaime - a.jaime)
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
/** Valeur de chaque compte de `audience` (par index) pour un indicateur et
 *  une fenêtre : les abonnés au dernier relevé, sinon la somme de la table
 *  « compte par jour » entre d0 et d1. */
export function valeursComptes(
  items: readonly AudienceItem[],
  jours: readonly AudienceJour[],
  m: Mesure,
  f: Pick<Filtres, "d0" | "d1">,
): number[] {
  if (m === "abonnes") return items.map((a) => a.abonnes ?? 0);
  const out = items.map(() => 0);
  const k = m === "publications" ? 2 : m === "jaime" ? 3 : 4;
  for (const r of jours) if (r[1] >= f.d0 && r[1] <= f.d1 && r[0] < out.length) out[r[0]] += r[k];
  return out;
}

export type Meneur = {
  /** Parti en tête, ou null : rien du tout, ou égalité parfaite. */
  party: PartyKey | null;
  /** Total de la circonscription (indicateur choisi, comptes qui passent les filtres). */
  valeur: number;
  parParti: Partial<Record<PartyKey, number>>;
};

/** Le parti en tête de chaque circonscription (code → meneur) : la somme, par
 *  parti, de la valeur des comptes de candidats qui passent les filtres. */
export function meneursCarte(
  items: readonly AudienceItem[],
  valeurs: readonly number[],
  plateformes: readonly Plateforme[],
  partis: readonly PartyKey[],
): Map<number, Meneur> {
  const parCirco = new Map<number, Meneur["parParti"]>();
  items.forEach((a, i) => {
    if (a.code == null || a.type !== "candidat") return;
    if (!plateformes.includes(a.plateforme) || !partis.includes(a.party)) return;
    const v = valeurs[i] ?? 0;
    const acc = parCirco.get(a.code) ?? {};
    acc[a.party] = (acc[a.party] ?? 0) + v;
    parCirco.set(a.code, acc);
  });
  const out = new Map<number, Meneur>();
  for (const [code, parParti] of parCirco) {
    const rang = (Object.entries(parParti) as [PartyKey, number][]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    const [premier, second] = rang;
    const egalite = premier && second && premier[1] === second[1];
    out.set(code, {
      party: premier && !egalite ? premier[0] : null,
      valeur: rang.reduce((t, [, v]) => t + v, 0),
      parParti,
    });
  }
  return out;
}

// ── Lecteur intégré des plateformes ───────────────────────────────────────────
export type Integration = { src: string; format: "portrait" | "paysage" };

/** Adresse du lecteur OFFICIEL d'une vidéo (aucune vidéo n'est hébergée par
 *  le site), tirée de l'adresse de la publication ; null si elle ne s'y prête
 *  pas : le lien « Voir la publication » reste alors la seule voie. */
export function integration(p: Plateforme, url: string | null | undefined): Integration | null {
  if (!url) return null;
  if (p === "tiktok") {
    const id = url.match(/\/video\/(\d{6,25})/)?.[1];
    return id ? { src: `https://www.tiktok.com/embed/v2/${id}`, format: "portrait" } : null;
  }
  if (p === "instagram") {
    const m = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]{5,40})/);
    return m ? { src: `https://www.instagram.com/${m[1] === "reel" ? "reel" : "p"}/${m[2]}/embed`, format: "portrait" } : null;
  }
  if (!/^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(url)) return null;
  const href = encodeURIComponent(url);
  const reel = /\/reel\//.test(url);
  const video = reel || /\/videos?\/|\/watch\/?\?|\/share\/v\//.test(url);
  return video
    ? { src: `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false`, format: reel ? "portrait" : "paysage" }
    : { src: `https://www.facebook.com/plugins/post.php?href=${href}&show_text=true`, format: "portrait" };
}

// ── Audience : classements ────────────────────────────────────────────────────
/** Abonnés (dernier relevé), puis les totaux de la période. */
export type MesureAudience = Mesure;
export const AUDIENCE_MAX = 20;

/** Les comptes classés selon la mesure (40 au plus, `max` pour le classement
 *  entier) ; un compte à 0, ou sans valeur, n'y figure pas. Filtres
 *  Plateforme, Parti, Type ; période d0..d1 (hors abonnés). La somme sur les
 *  comptes recoupe les tuiles. `index` : la place du compte dans `items`. */
export function classementAudience(
  items: readonly AudienceItem[],
  jours: readonly AudienceJour[],
  mesure: MesureAudience,
  f: Pick<Filtres, "plateformes" | "partis" | "types" | "d0" | "d1">,
  max = AUDIENCE_MAX,
): { item: AudienceItem; valeur: number; index: number }[] {
  const somme = items.map(() => ({ publications: 0, jaime: 0, commentaires: 0 }));
  if (mesure !== "abonnes") {
    for (const [c, j, p, l, k] of jours) {
      if (j < f.d0 || j > f.d1 || !somme[c]) continue;
      somme[c].publications += p;
      somme[c].jaime += l;
      somme[c].commentaires += k;
    }
  }
  const valeurDe = (a: AudienceItem, i: number): number | null => (mesure === "abonnes" ? a.abonnes : somme[i][mesure]);
  return items
    .map((item, i) => ({ item, valeur: valeurDe(item, i), index: i }))
    .filter(
      (x): x is { item: AudienceItem; valeur: number; index: number } =>
        x.valeur != null &&
        x.valeur > 0 &&
        f.plateformes.includes(x.item.plateforme) &&
        f.partis.includes(x.item.party) &&
        f.types.includes(x.item.type),
    )
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, max);
}
