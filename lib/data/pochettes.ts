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
import { PARTY_COLORS, PARTY_KEYS, type PartyKey } from "./parties";

const RACINE = path.join(process.cwd(), "public", "data", "generated-art", "partis");

/** Chemin servi au navigateur. Relatif, comme `data/generated-art/latest.png`
 *  pour la Une : le `basePath` est appliqué par le composant. */
const urlPochette = (jour: string, parti: string, ext: string) =>
  `data/generated-art/partis/${jour}/${parti}.${ext}`;

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
};

export type JourArchive = {
  jour: string;
  /** « Mercredi 12 août 2026 », déjà formaté côté serveur. */
  jourLabel: string;
  pochettes: Pochette[];
};

export type Discotheque = {
  /** Le jour du bac courant, ou `null` si aucune pochette n'a été rapatriée. */
  jourCourant: string | null;
  /** Les pochettes du jour courant, du plus au moins présent. */
  duJour: Pochette[];
  /** Les jours précédents, du plus récent au plus ancien. */
  archives: JourArchive[];
};

const VIDE: Discotheque = { jourCourant: null, duJour: [], archives: [] };

const estPartyKey = (v: unknown): v is PartyKey =>
  typeof v === "string" && (PARTY_KEYS as readonly string[]).includes(v);

/** Lit un fichier de métadonnées, ou `null` s'il est absent, illisible ou
 *  incomplet. On ne rattrape rien : une pochette dont on ne sait pas quel parti
 *  elle illustre n'a pas sa place dans un bac trié par temps d'écoute. */
async function lirePochette(jour: string, fichier: string): Promise<Pochette | null> {
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
      const lues = await Promise.all(fichiers.map((f) => lirePochette(jour, f)));
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
  return {
    jourCourant: courant.jour,
    duJour: courant.pochettes,
    archives: nonVides
      .slice(0, -1)
      .reverse()
      .map((j) => ({ jour: j.jour, jourLabel: formatJour(j.jour), pochettes: j.pochettes })),
  };
}
