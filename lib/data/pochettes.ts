// Les pochettes engendrées des partis : le bac du jour, et la discothèque.
//
// CE QUE CE FICHIER LIT. Le dossier `public/data/generated-art/partis/`, que
// `scripts/fetch_art.mjs` remplit AVANT le build depuis R2. Rien n'est appelé à
// l'exécution : le visiteur ne reçoit que des fichiers plats, comme pour
// l'illustration de la Une.
//
// POURQUOI L'ARCHIVE SE LIT DANS SES PROPRES MÉTADONNÉES, et non dans les
// tables du module. Le module ne conserve qu'une poignée de jours d'historique
// (la rétention côté raffineur est récente, cf. aws-refiners#409) : reconstruire
// « quel enjeu dominait pour le PQ le 12 août » n'est tout simplement pas
// possible. La pochette, elle, porte ces chiffres FIGÉS au moment où elle a été
// engendrée. La discothèque est donc un fonds d'archives au sens propre : ce
// qu'elle affiche est ce qui était vrai ce jour-là, pas une reconstitution.
//
// CONSÉQUENCE À ASSUMER : si le raffineur n'a pas tourné un jour, ce jour
// manque, définitivement. Un trou dans le bac est la vérité — mieux que
// d'interpoler une pochette qui n'a jamais existé.

import fs from "node:fs/promises";
import path from "node:path";
import { PARTY_COLORS, PARTY_KEYS, PARTY_LABELS, type PartyKey } from "./parties";
import { samediDeLaSemaine, vendrediDeLaSemaine } from "@/lib/semaine";

const RACINE = path.join(process.cwd(), "public", "data", "generated-art", "partis");

/** Chemin servi au navigateur, DEPUIS LA RACINE du site.
 *
 *  ⚠️ IL ÉTAIT RELATIF (`data/generated-art/partis/…`), et c'était un bogue.
 *  Une URL relative se résout d'après la page qui la porte : à la racine, où
 *  vit l'illustration de la Une, `data/…` tombe juste ; mais `/discotheque/`
 *  la résout en `/discotheque/data/…`, qui n'existe pas. Toutes les images du
 *  fonds répondaient donc 404 — invisible jusqu'ici, les pochettes n'étant pas
 *  encore déployées. Le disque d'or, lui, vit à la racine et n'était pas
 *  touché.
 *
 *  Le `basePath` est appliqué ICI plutôt que laissé au composant : aucun ne le
 *  faisait, et une URL qui ne dépend plus de la page qui l'affiche ne peut plus
 *  se casser en déménageant de route. */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const urlPochette = (jour: string, parti: string, ext: string) =>
  `${BASE_PATH}/data/generated-art/partis/${jour}/${parti}.${ext}`;

/** Les formats, du plus léger au plus universel. `<picture>` retient le
 *  premier que le navigateur sait lire, donc l'ordre compte. */
const FORMATS: { ext: string; type: string }[] = [
  { ext: "avif", type: "image/avif" },
  { ext: "webp", type: "image/webp" },
];

export type PochetteSource = { src: string; type: string };

/** Une pochette engendrée, telle que son fichier de métadonnées la décrit. */
export type Pochette = {
  jour: string;
  parti: PartyKey;
  sigle: string;
  nom: string;
  couleur: string;
  rang: number;
  minutesUne: number;
  tempsLabel: string;
  partPct: number;
  enjeu: string | null;
  ton: string;
  tonPct: number;
  /** Clé d'appariement — voir `app/data/partis-selection.json/route.ts`. Le bac
   *  du jour n'affiche la pochette que si elle correspond à ce que le module
   *  rend au même instant. */
  signature: string;
  /** Le PNG, toujours présent quand la pochette existe. */
  src: string;
  /** Les formats modernes réellement écrits, pour `<picture>`. Peut être vide :
   *  les encodeurs WebP et AVIF sont best-effort côté raffineur. */
  sources: PochetteSource[];
  /** Heure de fin du bloc illustré. `20` pour une pochette d'archive, qui est
   *  par définition la version de fin de journée. */
  blocHour: number | null;
  /** « Mercredi 12 août 2026 », formaté côté serveur. La date voyage avec la
   *  pochette parce que la discothèque ne les groupe plus par journée : elles
   *  sont rangées par temps d'écoute, tous jours confondus, et chacune doit donc
   *  dire d'où elle vient. */
  jourLabel: string;
  /** « 12 août », pour la légende posée sur la couverture. */
  jourCourt: string;
};

/** Le format court d'une date, pour la légende d'une pochette. La discothèque
 *  n'a pas la place d'un libellé complet sur une couverture de 132 px. */
const MOIS_COURTS = [
  "janv.", "févr.", "mars", "avril", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];
function jourCourt(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MOIS_COURTS[Number(m) - 1] ?? ""}`.trim();
}

/** Une pochette du FONDS, telle que la page `/discotheque` la montre.
 *
 *  Deux régimes selon l'horizon d'images (30 jours) :
 *  - HORS HORIZON : `src` est `undefined`. Le listage R2 atteste que la
 *    pochette existe, mais son fichier n'a pas été rapatrié pour ce build —
 *    il n'y a rien à afficher, texte seul.
 *  - DANS L'HORIZON : `src` est présent SEULEMENT si `lirePochette` a
 *    confirmé le fichier par un accès disque réel (voir `loadPochettes`, la
 *    carte `validees`). Le jour est « servi » (`JourFonds.servi`) sans
 *    garantir que CHAQUE parti l'est : un fichier de métadonnées peut exister
 *    sans que son image ait suivi. N'inventer une URL pour aucun des deux cas
 *    évite d'afficher une image cassée. */
export type PochetteArchivee = {
  parti: PartyKey;
  sigle: string;
  couleur: string;
  rang: number;
  minutesUne: number;
  tempsLabel: string;
  partPct: number;
  enjeu: string | null;
  ton: string;
  tonPct: number;
  /** Faux quand le registre ignore cette pochette : le listage R2 atteste
   *  qu'elle existe, mais ses chiffres manquent. On l'affiche quand même. */
  chiffres: boolean;
  /** Le PNG, uniquement quand `lirePochette` en a confirmé l'existence. */
  src?: string;
  /** Les formats modernes confirmés, pour `<picture>`. Vide si `src` l'est
   *  aussi, ou si aucun format moderne n'a été rapatrié pour ce jour-là. */
  sources?: PochetteSource[];
};

export type JourFonds = {
  jour: string;
  jourLabel: string;
  pochettes: PochetteArchivee[];
  /** Vrai quand les images de cette journée sont dans le livrable (horizon de
   *  30 jours). Faux : conservée dans R2, pas servie. */
  servi: boolean;
};

export type Discotheque = {
  /** Le jour du bac courant, ou `null` si aucune pochette n'a été rapatriée. */
  jourCourant: string | null;
  /** Les pochettes du jour courant, du plus au moins présent. */
  duJour: Pochette[];
  /** LA PILE DE LA DISCOTHÈQUE : toutes les pochettes archivées et servies,
   *  rangées par TEMPS D'ÉCOUTE, de la plus à la moins présente, tous jours
   *  confondus. Elles ne sont plus groupées par journée — c'est le classement
   *  qui fait le rangement, et chaque pochette porte sa date. */
  pile: Pochette[];
  /** TOUT le fonds, servi ou non, du plus récent au plus ancien. Alimente la
   *  page du fonds ; vide quand l'inventaire n'a pas été rapatrié. */
  fonds: JourFonds[];
};

const VIDE: Discotheque = { jourCourant: null, duJour: [], pile: [], fonds: [] };

const estPartyKey = (v: unknown): v is PartyKey =>
  typeof v === "string" && (PARTY_KEYS as readonly string[]).includes(v);

/** Lit un fichier de métadonnées, ou `null` s'il est absent, illisible ou
 *  incomplet. On ne rattrape rien : une pochette dont on ne sait pas quel parti
 *  elle illustre n'a pas sa place dans un bac trié par temps d'écoute. */
async function lirePochette(
  jour: string,
  fichier: string,
  formatJour: (iso: string) => string,
): Promise<Pochette | null> {
  const parti = fichier.replace(/\.json$/, "");
  if (!estPartyKey(parti)) return null;
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(await fs.readFile(path.join(RACINE, jour, fichier), "utf8"));
  } catch {
    return null;
  }

  // Le PNG est le format de référence : sans lui, il n'y a pas d'image à
  // montrer, quels que soient les formats modernes présents à côté.
  const presents = await Promise.all(
    [{ ext: "png", type: "image/png" }, ...FORMATS].map(async (f) => {
      try {
        await fs.access(path.join(RACINE, jour, `${parti}.${f.ext}`));
        return f;
      } catch {
        return null;
      }
    }),
  );
  const disponibles = presents.filter((f): f is { ext: string; type: string } => f !== null);
  const aPng = disponibles.some((f) => f.ext === "png");
  const repli = disponibles.find((f) => f.ext !== "png");
  // L'archive ne rapatrie qu'un format (cf. scripts/fetch_art.mjs) : sans PNG,
  // on sert le format disponible en `src`. `<picture>` n'a alors rien à
  // arbitrer, et c'est bien : il n'y a qu'un fichier.
  if (!aPng && !repli) return null;

  const nombre = (v: unknown, defaut = 0) => (typeof v === "number" && Number.isFinite(v) ? v : defaut);
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

  return {
    jour,
    parti,
    sigle: texte(meta.sigle) ?? parti.toUpperCase(),
    nom: texte(meta.nom) ?? parti.toUpperCase(),
    couleur: PARTY_COLORS[parti],
    rang: nombre(meta.rang, 0),
    minutesUne: nombre(meta.minutes_une),
    tempsLabel: texte(meta.temps_label) ?? "",
    partPct: nombre(meta.part_pct),
    enjeu: texte(meta.enjeu),
    ton: texte(meta.ton) ?? "neutre",
    tonPct: nombre(meta.ton_pct, 50),
    signature: texte(meta.signature) ?? "",
    src: aPng ? urlPochette(jour, parti, "png") : urlPochette(jour, parti, repli!.ext),
    sources: disponibles
      .filter((f) => f.ext !== "png")
      .map((f) => ({ src: urlPochette(jour, parti, f.ext), type: f.type })),
    blocHour:
      typeof meta.bloc === "object" && meta.bloc !== null
        ? nombre((meta.bloc as Record<string, unknown>).hour, 0) || null
        : null,
    jourLabel: formatJour(jour),
    jourCourt: jourCourt(jour),
  };
}

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Le contenu des deux bacs, lu sur le disque du build.
 *
 * Jamais d'exception : un dossier absent (le raffineur n'existe pas encore, ou
 * l'API était muette au moment du build) rend deux bacs vides, et le module
 * retombe sur ses pochettes géométriques. Le repli est visible et assumé.
 */
export async function loadPochettes(formatJour: (iso: string) => string): Promise<Discotheque> {
  let jours: string[];
  try {
    const entrees = await fs.readdir(RACINE, { withFileTypes: true });
    jours = entrees
      .filter((e) => e.isDirectory() && JOUR_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return VIDE;
  }
  if (jours.length === 0) return VIDE;

  const parJour = await Promise.all(
    jours.map(async (jour) => {
      let fichiers: string[];
      try {
        fichiers = (await fs.readdir(path.join(RACINE, jour))).filter((f) => f.endsWith(".json"));
      } catch {
        return { jour, pochettes: [] as Pochette[] };
      }
      const lues = await Promise.all(fichiers.map((f) => lirePochette(jour, f, formatJour)));
      const pochettes = lues
        .filter((p): p is Pochette => p !== null)
        // TRI PAR TEMPS D'ÉCOUTE, comme le bac du module. À égalité — deux
        // partis à zéro, cas ordinaire quand la mesure ne détecte rien — on
        // départage par le sigle pour que l'ordre ne saute pas d'un build à
        // l'autre.
        .sort((a, b) => b.minutesUne - a.minutesUne || a.sigle.localeCompare(b.sigle, "fr"));
      return { jour, pochettes };
    }),
  );

  const nonVides = parJour.filter((j) => j.pochettes.length > 0);
  if (nonVides.length === 0) return VIDE;

  const courant = nonVides[nonVides.length - 1];
  const servis = new Set(nonVides.map((j) => j.jour));
  // LES POCHETTES VALIDÉES, par jour puis par parti — pas seulement les jours
  // non vides : un jour où un seul parti a une image reste une entrée utile
  // pour `lireFonds`, même s'il ne contribue rien à `pile`/`duJour`.
  // `lirePochette` a déjà vérifié le fichier par un accès disque réel ; c'est
  // cette vérification, et elle seule, qui autorise `lireFonds` à écrire une
  // URL d'image dans le fonds sans jamais en inventer une.
  const validees = new Map<string, Map<PartyKey, Pochette>>(
    parJour.map((j) => [j.jour, new Map(j.pochettes.map((p) => [p.parti, p]))]),
  );
  return {
    jourCourant: courant.jour,
    duJour: courant.pochettes,
    // LA PILE : toutes les journées passées à plat, rangées par temps d'écoute.
    // À égalité — deux pochettes à zéro minute, cas ordinaire — la plus récente
    // passe devant, et le sigle départage ensuite : l'ordre ne doit pas sauter
    // d'un build à l'autre.
    pile: nonVides
      .slice(0, -1)
      .flatMap((j) => j.pochettes)
      .sort(
        (a, b) =>
          b.minutesUne - a.minutesUne ||
          b.jour.localeCompare(a.jour) ||
          a.sigle.localeCompare(b.sigle, "fr"),
      ),
    fonds: await lireFonds(formatJour, servis, validees),
  };
}

/** Une entrée du registre, aux noms courts : ils se répètent une fois par
 *  pochette et par jour, indéfiniment (cf. `generate_partis.py`). */
type EntreeRegistre = {
  p?: unknown; r?: unknown; m?: unknown; t?: unknown;
  pc?: unknown; e?: unknown; to?: unknown; tp?: unknown;
};

/**
 * TOUT LE FONDS : ce que le listage R2 atteste, enrichi des chiffres du registre
 * ET, quand elles sont confirmées, des images.
 *
 * TROIS SOURCES, ET UNE SEULE FAIT FOI POUR CHACUNE. `jours` vient du listage du
 * bucket : c'est ce qui EXISTE, et une journée que les deux autres sources
 * ignorent s'affiche quand même, marquée comme telle — se fier au registre ou
 * aux images seules ferait disparaître des pochettes bel et bien conservées.
 * `registre` porte les CHIFFRES, et peut être en retard (cycle interrompu).
 * `validees` porte les IMAGES, déjà vérifiées par un accès disque réel dans
 * `lirePochette` : `lireFonds` ne fait que les recopier quand elles existent,
 * jamais n'en devine une URL.
 */
async function lireFonds(
  formatJour: (iso: string) => string,
  servis: Set<string>,
  validees: Map<string, Map<PartyKey, Pochette>>,
): Promise<JourFonds[]> {
  let inv: { jours?: Record<string, string[]>; registre?: Record<string, EntreeRegistre[]> | null };
  try {
    inv = JSON.parse(await fs.readFile(path.join(RACINE, "inventaire.json"), "utf8"));
  } catch {
    return [];
  }
  const jours = inv?.jours;
  if (!jours || typeof jours !== "object") return [];
  const registre = inv?.registre ?? null;

  const nombre = (v: unknown, defaut = 0) => (typeof v === "number" && Number.isFinite(v) ? v : defaut);
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

  return Object.entries(jours)
    .filter(([jour]) => JOUR_RE.test(jour))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([jour, partis]) => {
      const chiffresDuJour = new Map<string, EntreeRegistre>(
        (registre?.[jour] ?? [])
          .filter((e) => typeof e?.p === "string")
          .map((e) => [String(e.p), e]),
      );
      const valideesDuJour = validees.get(jour);
      const pochettes = (Array.isArray(partis) ? partis : [])
        .filter(estPartyKey)
        .map((parti): PochetteArchivee => {
          const e = chiffresDuJour.get(parti);
          const v = valideesDuJour?.get(parti);
          return {
            parti,
            sigle: parti.toUpperCase(),
            couleur: PARTY_COLORS[parti],
            rang: nombre(e?.r, 0),
            minutesUne: nombre(e?.m),
            tempsLabel: texte(e?.t) ?? "",
            partPct: nombre(e?.pc),
            enjeu: texte(e?.e),
            ton: texte(e?.to) ?? "",
            tonPct: nombre(e?.tp, 50),
            chiffres: e !== undefined,
            src: v?.src,
            sources: v?.sources,
          };
        })
        // Par temps d'écoute quand on le connaît, par sigle sinon : l'ordre ne
        // doit pas sauter d'un build à l'autre.
        .sort((a, b) => b.minutesUne - a.minutesUne || a.sigle.localeCompare(b.sigle, "fr"));
      return { jour, jourLabel: formatJour(jour), pochettes, servi: servis.has(jour) };
    })
    .filter((j) => j.pochettes.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────
// DEUX AUTRES FAÇONS DE LIRE LE MÊME FONDS : par album et par discographie.
//
// `fonds` range les pochettes par JOURNÉE — cinq par jour, un par parti. Ce
// qui suit les regroupe autrement, par ARTISTE (le parti), sans retoucher aux
// données elles-mêmes : chaque single garde son jour, son parti, ses chiffres.
//
// Ce sont des fonctions PURES sur `fonds` déjà chargé, pas de nouvel accès
// disque : elles peuvent donc s'éprouver sans dépendre du système de fichiers,
// contrairement à `loadPochettes`.
// ─────────────────────────────────────────────────────────────────────────

/** Un single : une pochette archivée, sa date attachée. `fonds` la porte déjà
 *  au niveau du jour (`JourFonds.jour`) ; ici elle voyage avec le single
 *  lui-même, puisqu'un album ou une discographie n'a plus de jour commun. */
export type Single = PochetteArchivee & { jour: string; jourLabel: string; jourCourt: string };

/** L'ALBUM DE LA SEMAINE d'un parti : ses singles du samedi au vendredi,
 *  jusqu'à sept. Une semaine en cours en compte moins — un album à quatre
 *  titres est la vérité tant que la semaine n'est pas finie, pas un trou à
 *  combler. */
export type Album = {
  parti: PartyKey;
  sigle: string;
  nom: string;
  couleur: string;
  /** Le samedi d'ouverture, en ISO — clé stable pour React. */
  semaineDebut: string;
  /** « du 22 août 2026 au 28 août 2026 », sans le nom du jour en tête : deux
   *  noms de jour dans le même intitulé auraient surchargé l'étiquette. */
  semaineLabel: string;
  totalMinutes: number;
  /** CLASSÉS EN ORDRE D'ÉCOUTE — la piste la plus écoutée en tête, comme
   *  partout ailleurs sur le site. Pas un ordre chronologique de parution : ce
   *  n'est pas ainsi qu'on lit ce module. */
  pistes: Single[];
};

/** LA DISCOGRAPHIE d'un parti : tous ses singles connus, toutes journées et
 *  semaines confondues. */
export type Discographie = {
  parti: PartyKey;
  sigle: string;
  nom: string;
  couleur: string;
  totalMinutes: number;
  pistes: Single[];
};

/** Les singles d'UNE journée, `PochetteArchivee` complétée de sa date — la
 *  brique commune aux trois lectures du fonds : `groupeParAlbums`/
 *  `groupeParDiscographie` les regroupent par parti, `toutesLesSingles` (via
 *  `singlesParEcoute`) les aplatit tous ensemble, sans aucun groupe. */
function singlesDuJour(j: JourFonds): Single[] {
  return j.pochettes.map((p) => ({ ...p, jour: j.jour, jourLabel: j.jourLabel, jourCourt: jourCourt(j.jour) }));
}

function toutesLesSingles(fonds: JourFonds[]): Single[] {
  return fonds.flatMap(singlesDuJour);
}

/** Le libellé d'une date sans son nom de jour : `formatJour` rend « Samedi 22
 *  août 2026 », et une étiquette de semaine n'a pas besoin de DEUX noms de
 *  jour pour dire « du … au … ». */
const sansNomDeJour = (label: string) => label.replace(/^\S+\s+/, "");

/**
 * LES ALBUMS DE LA SEMAINE — un par (parti, semaine), au plus sept titres.
 *
 * LA SEMAINE EST CELLE DU PALMARÈS, SAMEDI → VENDREDI (`lib/semaine.ts`) : les
 * deux doivent compter la même chose, sinon « sept singles » ne voudrait pas
 * dire la même semaine selon qu'on la regarde ici ou dans le palmarès.
 */
export function groupeParAlbums(fonds: JourFonds[], formatJour: (iso: string) => string): Album[] {
  const parCle = new Map<string, Single[]>();
  for (const single of toutesLesSingles(fonds)) {
    const cle = `${samediDeLaSemaine(single.jour)}/${single.parti}`;
    const groupe = parCle.get(cle) ?? [];
    groupe.push(single);
    parCle.set(cle, groupe);
  }

  const albums = [...parCle.values()].map((pistes): Album => {
    const semaineDebut = samediDeLaSemaine(pistes[0].jour);
    const semaineFin = vendrediDeLaSemaine(semaineDebut);
    return {
      parti: pistes[0].parti,
      sigle: pistes[0].sigle,
      nom: PARTY_LABELS[pistes[0].parti],
      couleur: pistes[0].couleur,
      semaineDebut,
      semaineLabel: `du ${sansNomDeJour(formatJour(semaineDebut))} au ${sansNomDeJour(formatJour(semaineFin))}`,
      totalMinutes: pistes.reduce((s, p) => s + p.minutesUne, 0),
      pistes: pistes.slice().sort((a, b) => b.minutesUne - a.minutesUne || a.jour.localeCompare(b.jour)),
    };
  });

  // LA SEMAINE LA PLUS RÉCENTE D'ABORD — comme `fonds`, qui range déjà ses
  // journées ainsi — et dans chaque semaine, l'album le plus écouté en tête.
  return albums.sort(
    (a, b) => b.semaineDebut.localeCompare(a.semaineDebut) || b.totalMinutes - a.totalMinutes,
  );
}

/**
 * LES DISCOGRAPHIES DE LA CAMPAGNE — une par parti, tous ses singles connus.
 */
export function groupeParDiscographie(fonds: JourFonds[]): Discographie[] {
  const parParti = new Map<PartyKey, Single[]>();
  for (const single of toutesLesSingles(fonds)) {
    const groupe = parParti.get(single.parti) ?? [];
    groupe.push(single);
    parParti.set(single.parti, groupe);
  }

  const discographies = [...parParti.values()].map((pistes): Discographie => ({
    parti: pistes[0].parti,
    sigle: pistes[0].sigle,
    nom: PARTY_LABELS[pistes[0].parti],
    couleur: pistes[0].couleur,
    totalMinutes: pistes.reduce((s, p) => s + p.minutesUne, 0),
    pistes: pistes.slice().sort((a, b) => b.minutesUne - a.minutesUne || b.jour.localeCompare(a.jour)),
  }));

  // LE PARTI LE PLUS ÉCOUTÉ DE TOUTE LA CAMPAGNE EN TÊTE — même principe que
  // les albums, à l'échelle de la campagne entière.
  return discographies.sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/**
 * LES SINGLES, TOUS CONFONDUS — un mur d'un seul disque à la fois, classé en
 * ORDRE D'ÉCOUTE plutôt que groupé par jour ou par parti.
 *
 * ⚠️ AUCUN GROUPEMENT, ET C'EST LE POINT DE LA VUE JOUR. Les singles vivaient
 * avant regroupés par ÉDITION (les cinq partis d'une même journée, compilés
 * dans une plaque commune) — retiré le 2026-09-05 : une compilation cachait
 * qui, ce jour-là, avait vraiment le plus tenu la Une, et obligeait à ouvrir
 * la plaque du jour pour voir un seul parti. Semaine et campagne groupent
 * PAR PARTI (un album, une discographie) ; le jour, lui, ne groupe plus DU
 * TOUT — c'est la vue la plus fine, celle qui montre l'unité elle-même,
 * plutôt qu'une agrégation de plus.
 *
 * NI L'ORDRE NE DÉPEND DE `fonds` EN ENTRÉE : cette fonction trie elle-même,
 * comme `groupeParAlbums` et `groupeParDiscographie` trient les leurs.
 */
export function singlesParEcoute(fonds: JourFonds[]): Single[] {
  return toutesLesSingles(fonds).sort(
    (a, b) => b.minutesUne - a.minutesUne || b.jour.localeCompare(a.jour) || a.sigle.localeCompare(b.sigle, "fr"),
  );
}
