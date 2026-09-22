// CARTES DE DÉPUTÉ — visuel fixe, un fichier par élu.
//
// LA CARTE DE COLLECTION, PRISE AU MOT. Le composant du site annonçait déjà
// l'intention (« macaron de parti en guise d'écusson, enjeu dominant en guise
// de position ») sans aller jusqu'au bout : ici la grammaire est celle des
// séries O-Pee-Chee du milieu des années 1980 — carton clair, panneau photo
// cerné d'un filet, écusson qui flotte en haut à droite, bandeau de couleur en
// bas avec le nom et la position. Rien n'est inventé côté mise en page : c'est
// un objet que tout le monde a déjà tenu.
//
// TROIS DÉCISIONS QUI FONT QUE ÇA NE SENT PAS LE GABARIT :
//
// 1. LE PORTRAIT EST LE TIRAGE IMPRESSION, PAS CELUI D'ÉCRAN. `cartes/*.png`
//    est une similigravure calculée à 750 × 1000 par build_deputy_cards.py ;
//    son canal alpha est BINAIRE (0 ou 255, vérifié) et porte la trame de
//    points, l'encre étant un aplat de cordovan. C'est donc un masque parfait,
//    qu'on remplit à la couleur voulue. Agrandi à 988 px (1,3×), le point
//    grandit proprement — c'est précisément ce pour quoi il a été calculé — et
//    la trame donne la texture d'un objet imprimé. Le duotone d'écran, lisse,
//    donnait l'image plate et sans grain qui trahit une composition faite à la
//    machine.
// 2. LA POLARITÉ NE S'INVERSE JAMAIS. Le diamètre du point code l'obscurité :
//    des points clairs sur fond de couleur rendraient le négatif du visage.
//    Le champ reste donc clair et les points prennent la couleur du parti.
// 3. LE GRAIN. Un bruit très faible passe sur toute la carte. Une surface
//    parfaitement unie est la signature d'un rendu synthétique ; un carton
//    imprimé n'en a jamais.
//
// Format 1080 × 1350 (4:5). ⚠️ La grille du profil Instagram recadre au CARRÉ
// CENTRÉ (y 135 → 1215) : le visage, l'écusson et le bandeau du nom tiennent
// dans cette fenêtre ; seuls le pied de carton et le crédit en sortent.
//
// Les données viennent de `loadAssemblee()`, le loader de la page. Aucune
// donnée n'est recalculée ici (GABARIT.md, « Aucune donnée ni phrase
// inventée »).
//
// Usage :
//   npm run carte:deputes -- --echantillon   → 5 cartes, une par parti
//   npm run carte:deputes -- --limite 10     → les 10 premières de la série
//   npm run carte:deputes -- --only tanguay  → une carte, par nom ou circo
//   npm run carte:deputes                    → la planche des 129
//   npm run carte:deputes -- --png           → les PNG, la planche une fois vue
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { loadAssemblee, type DeputyRow, type PeriodKey } from "@/lib/data/assemblee";
import { PARTY_COLORS, PARTY_FULL_NAMES, type PartyKey } from "@/lib/data/parties";
import { COLORS, TONE, enjeuGlyph, fleur, loadLogos, parseArgs, txt, openInBrowser } from "./lib/reel";

// Gloses du concept distinctif, RECOPIÉES du composant du site
// (AssembleeVestiaire.tsx, conceptGlose / conceptAbsent) : la carte partagée et
// la carte du site doivent dire la même chose, mot pour mot. Formulation neutre
// en genre, la même pour les 125 sièges.
const GLOSE = "Mot bien plus fréquent que chez les autres élu.es.";
const ABSENCE = "Aucun mot ne ressort assez nettement de ceux des autres élu.es sur cette période.";

/** Les trois fenêtres de la fiche, dans l'ordre où le site les présente. Les
 *  LIBELLÉS ne sont pas écrits ici : ils viennent de `tabLabel`, comme sur le
 *  site. Un premier jet nommait `last_pdq` « dernière période de questions » —
 *  c'est faux, le site dit « Dernière journée de débats », et une journée de
 *  débats ne se réduit pas à la période de questions. Inventer un vocabulaire
 *  parallèle sur un carton qu'un élu peut brandir est le meilleur moyen de se
 *  faire corriger en public. */
const PERIODES: PeriodKey[] = ["last_pdq", "session", "legislature"];

// Ton — formules RECOPIÉES de `AssembleeVestiaire.tsx` (toneScalePct,
// toneWording), volontairement à l'identique. Le chiffre d'affichage du
// loader est inexploitable : amplifié puis borné, il colle 81 députés sur 108
// à la butée. La position se lit donc sur une règle normalisée sur l'étendue
// RÉELLEMENT observée dans la période, ce qui est exactement ce que la mesure
// autorise à dire. Réimplémenter autrement ici ferait diverger la carte du
// site sur la seule donnée que l'élu pourrait contester.
function toneScalePct(score: number, maxAbs: number): number {
  if (!(maxAbs > 0)) return 50;
  const ratio = Math.max(-1, Math.min(1, score / maxAbs));
  return Number((50 + ratio * 48).toFixed(1));
}

function toneWording(score: number, maxAbs: number): string {
  const sens = score >= 0 ? "favorable" : "défavorable";
  if (!(maxAbs > 0)) return "ton neutre";
  const part = Math.abs(score) / maxAbs;
  if (part < 0.15) return "ton proche du neutre";
  const degre = part > 0.66 ? "nettement" : "plutôt";
  return `ton ${degre} ${sens} par rapport aux autres de la période`;
}

const W = 1080;
const H = 1350;

/** Fenêtre conservée par la grille du profil Instagram (carré centré). */
const COEUR = { top: Math.round((H - W) / 2), bottom: Math.round((H + W) / 2) };

/** Le carton. Marge généreuse — un liseré fin se lirait comme l'encadré que
 *  GABARIT.md proscrit ; une vraie bordure de carte, elle, se lit comme le
 *  carton qu'elle imite. */
const MARGE = 46;
const PANNEAU = { x: MARGE, y: MARGE, w: W - MARGE * 2, bas: 1230 };
const BANDE = 196;
const PHOTO_H = PANNEAU.bas - BANDE - PANNEAU.y;

type Carte = {
  slug: string;
  deputy: DeputyRow;
  parti: string;
  cle: PartyKey;
  couleur: string;
  /** Rang dans le jeu COMPLET, calculé avant tout filtre : une carte garde son
   *  numéro qu'on tire les 129 ou un seul élu. */
  numero: number;
  total: number;
  /** « Législature 2026 · Salon bleu » — le sous-titre de la période, que le
   *  site écrit déjà ; il tient lieu de mention de ligue sur le carton. */
  salon: string;
  /** Année de l'ÉDITION du jeu, pas de la donnée : les cartes se rééditeront
   *  chaque année, et deux tirages d'une même législature doivent se
   *  distinguer. Réglable par --annee. */
  annee: number;
  /** « Élu·e le 3 octobre 2022 ». Vide si le mandat n'a pas pu être apparié. */
  mandat: string;
  /** « Chef du Parti québécois », le cas échéant. `eclat` réserve un traitement
   *  plus marqué à la seule distinction qui dépasse la direction d'un parti. */
  chef?: Titre;
};

const DATE_FR = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

function dateFr(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : DATE_FR.format(d);
}

/** Le parti, tel qu'il doit être NOMMÉ sur le carton.
 *
 *  ⚠️ Corrige une faute autrement invisible : le loader groupe les élus par
 *  affiliation DE LA PÉRIODE, si bien que neuf députés passés indépendants ou
 *  d'un parti à l'autre porteraient l'étiquette de leur ancien parti. Le
 *  dernier segment d'affiliationHistory fait foi. */
function ligneParti(c: Carte): string {
  const nomParti = PARTY_FULL_NAMES[c.cle] ?? c.parti;
  const dernier = (c.deputy.affiliationHistory ?? []).at(-1);
  const courant = dernier?.label;
  const change = courant && courant !== c.parti && courant !== nomParti;
  return change ? `${courant} (élu ${c.parti})` : nomParti;
}

/** Le nom du fichier doit rester stable d'un tirage à l'autre : c'est lui qui
 *  sert à retrouver la carte d'un élu au moment de la lui envoyer. On le tire
 *  de la circonscription (unique par définition), pas du nom (deux « Éric
 *  Girard » siègent à la CAQ, Groulx et Lac-Saint-Jean). */
function slugCirco(deputy: DeputyRow): string {
  const source = deputy.portrait?.match(/\/([^/]+)\.jpg$/)?.[1];
  if (source) return source;
  return (deputy.circonscription ?? deputy.name)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** LES CHEFS DE PARTI.
 *
 *  ⚠️ RIEN dans les données ne dit qui dirige un parti : ni le référentiel de
 *  l'ANQ, ni les fichiers agora, ni lib/data/parties.ts (son
 *  « showLeaderLabel » désigne une étiquette de graphique, pas une personne).
 *  Cette liste est donc SAISIE À LA MAIN, et c'est sa faiblesse : une carte
 *  qui décerne un titre que l'élu n'a plus est la faute la plus facile à
 *  relever publiquement. La direction d'un parti change en cours de
 *  législature — ce jeu de données en porte déjà la trace, avec onze
 *  défections — et un chef peut ne pas siéger, auquel cas il n'a pas de carte.
 *
 *  À TENIR À JOUR À LA MAIN, par circonscription (la clé du portrait). */
type Titre = { titre: string; eclat?: boolean };
const CHEFS: Record<string, Titre> = {
  "camille-laurin": { titre: "Chef du Parti québécois" },
  "mercier": { titre: "Co-porte-parole de Québec solidaire" },
  // Christine Fréchette dirige la CAQ ET le gouvernement (correction de Jules,
  // 22-09) : « Première ministre » l'emporte sur « cheffe de parti », qui en
  // découle. François Legault, lui, n'a plus de titre — sa carte est redevenue
  // une carte ordinaire ; à confirmer s'il doit porter une mention d'ancien
  // premier ministre.
  "sanguinet": { titre: "Première ministre du Québec", eclat: true },
};

/** Clé d'appariement entre le slug d'une circonscription (« jeanne-mance-viger »)
 *  et le district_id des fichiers agora (« jeannemanceviger ») : les deux
 *  graphies ne diffèrent que par la ponctuation. */
function cleDistrict(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Mandat = { debut: string; motif: string };

/** DATE D'ÉLECTION DE CHAQUE ÉLU.
 *
 *  `DeputyRow.affiliationHistory` ne la porte que pour vingt députés : le
 *  loader ne l'expose « que lorsqu'un événement mérite d'être expliqué ». La
 *  source, elle, couvre les 129 — on la lit donc directement. On retient le
 *  PREMIER mandat de la personne, ce qui donne bien l'élection et non la
 *  défection qui a pu suivre. */
type Mandats = { parNomEtDistrict: Map<string, Mandat>; parDistrict: Map<string, Mandat>; parNom: Map<string, Mandat> };

/** Appariement en TROIS passes, du plus strict au plus permissif. Une seule
 *  clé ne suffit pas, et chacune échoue pour une raison différente :
 *  · quatre élus partis en cours de législature (Fitzgibbon, Laforest, Boutin,
 *    Lefebvre) n'ont qu'un portrait d'archive, dont le slug est un identifiant
 *    numérique : leur district est introuvable, mais leur nom est unique ;
 *  · « Simon Jolin-Barette » est mal orthographié dans le référentiel de l'ANQ
 *    — un seul r, au lieu de deux dans les données de discours : son nom ne
 *    correspond à rien, mais son district (borduas) est sans ambiguïté ;
 *  · deux « Éric Girard » siègent à la CAQ : leur nom seul est ambigu, il faut
 *    le district.
 *  Les index par nom seul et par district seul n'enregistrent donc que les
 *  valeurs UNIQUES ; une clé ambiguë est écartée plutôt que devinée. */
function trouverMandat(m: Mandats, nom: string, slug: string): Mandat | undefined {
  return m.parNomEtDistrict.get(`${cleDistrict(nom)}@${cleDistrict(slug)}`)
    ?? m.parDistrict.get(cleDistrict(slug))
    ?? m.parNom.get(cleDistrict(nom));
}

async function chargerMandats(): Promise<Mandats> {
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

/** « Élu le 3 octobre 2022 » — le motif distingue l'élection générale de la
 *  partielle, ce qui n'est pas un détail pour un élu arrivé en cours de route. */
function ligneMandat(m: Mandat | undefined): string {
  if (!m) return "";
  const quand = dateFr(m.debut);
  if (!quand) return "";
  // « élu.e » avec un POINT, comme « élu.es » ailleurs dans le dépôt. Et
  // formulation neutre en genre : la carte ne connaît pas celui de la personne.
  const comment = m.motif === "byelection" ? "Élu.e à la partielle du"
    : m.motif === "defection" ? "Siège depuis le"
    : "Élu.e le";
  return `${comment} ${quand}`;
}

const cacheURI = new Map<string, string | null>();
async function pngURI(rel: string): Promise<string | null> {
  if (cacheURI.has(rel)) return cacheURI.get(rel) ?? null;
  const buf = await fs.readFile(path.resolve(process.cwd(), "public", rel)).catch(() => null);
  const uri = buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
  cacheURI.set(rel, uri);
  return uri;
}

/** Le TIRAGE IMPRESSION du portrait (similigravure), pas celui d'écran :
 *  `cartes/web/x.jpg` → `cartes/x.png`. */
function cheminImpression(deputy: DeputyRow): string | null {
  const slug = deputy.portrait?.match(/\/([^/]+)\.jpg$/)?.[1];
  return slug ? `images/deputes/cartes/${slug}.png` : null;
}

/** Trame PRÉ-RÉDUITE pour la vignette du verso.
 *
 *  La similigravure est calculée pour être vue grande : ses points font 7 px à
 *  750 de large. Laissée au navigateur qui la ramène à 232 px, elle produit un
 *  moiré en damier — le pas de la trame et celui de la grille de pixels entrent
 *  en battement, et le visage disparaît sous les interférences. Réduite en
 *  amont par un filtre de qualité, les points se fondent en tons continus et
 *  l'alpha, jusque-là binaire, devient un dégradé : le masque redevient un
 *  portrait. */
const cacheVignette = new Map<string, string | null>();
async function vignetteURI(rel: string): Promise<string | null> {
  if (cacheVignette.has(rel)) return cacheVignette.get(rel) ?? null;
  const sharp = (await import("sharp")).default;
  const buf = await sharp(path.resolve(process.cwd(), "public", rel))
    .resize({ width: 480, kernel: "lanczos3" })
    .png().toBuffer().catch(() => null);
  const uri = buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
  cacheVignette.set(rel, uri);
  return uri;
}

/** Écusson du parti. On prend la version NOIRE, utilisée comme masque et
 *  remplie à la couleur du parti : les logos officiels en couleur (cyan de la
 *  CAQ, orange de QS) jurent avec la palette sourde de la Vitrine, et deux
 *  bleus se télescoperaient sur la même carte.
 *
 *  NORMALISATION — les cinq PNG n'ont ni le même cadrage ni le même rapport
 *  dans leur carré de 500 px (QS tient dans un rectangle de ratio 0,73, le PCQ
 *  de 1,16, avec des marges internes qui vont de 0 à 79 px). Posés tels quels
 *  dans une boîte carrée, ils paraissent de tailles différentes d'une carte à
 *  l'autre — ce qui se voit immédiatement dans une série. On rogne donc au
 *  contenu, puis on recentre dans un carré : c'est le dessin, et non le
 *  fichier, qui devient la mesure. */
const cacheEcusson = new Map<PartyKey, string | null>();
async function ecussonURI(cle: PartyKey): Promise<string | null> {
  if (cacheEcusson.has(cle)) return cacheEcusson.get(cle) ?? null;
  const src = path.resolve(process.cwd(), "public", `logos/parties-black/${cle}.png`);
  const sharp = (await import("sharp")).default;
  const rogne = await sharp(src).trim().toBuffer({ resolveWithObject: true }).catch(() => null);
  let uri: string | null = null;
  if (rogne) {
    const cote = Math.max(rogne.info.width, rogne.info.height);
    const carre = await sharp({
      create: { width: cote, height: cote, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: rogne.data,
        left: Math.round((cote - rogne.info.width) / 2),
        top: Math.round((cote - rogne.info.height) / 2),
      }])
      .png().toBuffer();
    uri = `data:image/png;base64,${carre.toString("base64")}`;
  }
  cacheEcusson.set(cle, uri);
  return uri;
}

/** Réduit le corps du nom jusqu'à ce qu'il tienne sur sa ligne. Exécuté dans
 *  la page APRÈS document.fonts.ready : mesuré avant, Playfair n'est pas
 *  encore substituée et la largeur obtenue est celle d'une police de secours.
 *  Une échelle au nombre de caractères tronquait « Paul St-Pierre Plamondon »
 *  et « Maïté Blanchette Vézina » : un M et un I ne tiennent pas la même
 *  largeur, on mesure au lieu d'estimer. */
function ajusterNom(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(".nom, .nom .ligne"));
  for (const el of els) {
    if (el.children.length > 0) continue;
    let taille = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && taille > 30) {
      taille -= 2;
      el.style.fontSize = `${taille}px`;
    }
  }
}

/** Dépassement, en pixels, du contenu hors du panneau. Le panneau écrête
 *  (overflow:hidden), donc un débordement ne casse rien à l'écran : il COUPE,
 *  silencieusement, et c'est bien le problème. */
function mesurerDebordement(): number {
  const panneau = document.querySelector<HTMLElement>(".panneau");
  if (!panneau) return 0;
  // On mesure le plus bas de TOUS les descendants, pas le dernier enfant d'une
  // classe donnée : une première version visait « .corps > :last-child » et
  // s'est retrouvée inerte dès que la mise en page a changé de squelette — un
  // garde-fou qui dépend d'un nom de classe ne garde rien.
  const bas = panneau.getBoundingClientRect().bottom;
  let plusBas = 0;
  const tous = panneau.querySelectorAll<HTMLElement>("*");
  for (let i = 0; i < tous.length; i++) {
    const r = tous[i].getBoundingClientRect();
    if (r.height > 0 && r.bottom > plusBas) plusBas = r.bottom;
  }
  return Math.max(0, Math.round(plusBas - bas));
}

/** Résorbe un débordement du verso, par CONCESSIONS SUCCESSIVES et mesurées.
 *
 *  La hauteur du dos varie avec des textes qu'on ne choisit pas : un nom sur
 *  deux lignes, une citation plus longue, un libellé de période qui se casse.
 *  Resserrer la maquette au jugé pour le cas du jour ne fait que déplacer le
 *  problème au suivant — sur 129 cartes il y aura toujours un suivant.
 *
 *  ⚠️ AUCUNE FONCTION IMBRIQUÉE ici. Le code est sérialisé puis évalué dans le
 *  navigateur, et esbuild enveloppe toute fonction interne dans son helper
 *  `__name`, absent de la page : une première version, qui isolait la mesure
 *  dans une petite fonction, échouait sur « __name is not defined ». */
function ajusterVerso(): void {
  const panneau = document.querySelector<HTMLElement>(".panneau");
  if (!panneau) return;
  const citation = document.querySelector<HTMLElement>(".citation");
  const mot = document.querySelector<HTMLElement>(".mot");
  const blocs = Array.from(document.querySelectorAll<HTMLElement>(".bloc"));
  let taille = mot ? parseFloat(getComputedStyle(mot).fontSize) : 0;
  let rembourrage = blocs.length ? parseFloat(getComputedStyle(blocs[0]).paddingTop) : 0;

  for (let etape = 0; etape < 40; etape++) {
    const bas = panneau.getBoundingClientRect().bottom;
    let plusBas = 0;
    const tous = panneau.querySelectorAll<HTMLElement>("*");
    for (let i = 0; i < tous.length; i++) {
      const r = tous[i].getBoundingClientRect();
      if (r.height > 0 && r.bottom > plusBas) plusBas = r.bottom;
    }
    if (plusBas - bas <= 0) return;

    // Concessions successives, du moins coûteux au plus coûteux : d'abord le
    // BLANC des panneaux, qui ne retire aucune information ; puis la citation,
    // qui illustre le mot ; puis le mot lui-même, qui le porte. Un cas comme
    // celui de la carte 22 — ruban de chef, mot signature ET citation — ne
    // dépasse que de quelques pixels : les rogner sur le rembourrage vaut mieux
    // que d'amputer le texte.
    if (rembourrage > 12 && blocs.length) {
      rembourrage -= 2;
      for (let j = 0; j < blocs.length; j++) {
        blocs[j].style.paddingTop = `${rembourrage}px`;
        blocs[j].style.paddingBottom = `${rembourrage}px`;
      }
      continue;
    }
    if (citation && citation.style.webkitLineClamp !== "1") { citation.style.webkitLineClamp = "1"; continue; }
    if (mot && taille > 34) { taille -= 2; mot.style.fontSize = `${taille}px`; continue; }
    return;
  }
}

function carteHTML(
  c: Carte,
  portrait: string | null,
  ecusson: string | null,
  logoVitrine: string | null,
): string {
  const d = c.deputy;
  const parti = c.couleur;
  const enjeu = d.topIssueColor ?? COLORS.soft;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;background:${COLORS.paper};color:${COLORS.ink};
       font-family:"Source Serif 4",serif;position:relative;overflow:hidden}

  /* LE PANNEAU — photo + bandeau, cernés d'un filet d'encre comme sur le
     carton d'origine. */
  .panneau{position:absolute;left:${PANNEAU.x}px;top:${PANNEAU.y}px;
           width:${PANNEAU.w}px;height:${PANNEAU.bas - PANNEAU.y}px;
           border:3px solid ${COLORS.ink};overflow:hidden;background:${COLORS.paper}}

  /* LA PHOTO — champ clair, points à la couleur du parti. La polarité ne
     s'inverse pas : le diamètre du point code l'obscurité. */
  .photo{position:relative;height:${PHOTO_H}px;background:${COLORS.paper};overflow:hidden}
  .photo .encre{position:absolute;inset:0;background:${parti};
                -webkit-mask-image:url("${portrait ?? ""}");mask-image:url("${portrait ?? ""}");
                -webkit-mask-size:cover;mask-size:cover;
                -webkit-mask-position:center 16%;mask-position:center 16%;
                -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
  .photo .fondu{position:absolute;left:0;right:0;bottom:0;height:190px;
                background:linear-gradient(to bottom,rgba(243,236,221,0),${COLORS.paper})}
  .photo .vide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.18}

  /* PERMUTATION DES MARQUES (demande de Jules, 22-09) : le logo de la VITRINE
     flotte sur la photo, à la place qu'occupait l'écusson du parti ; l'écusson,
     lui, descend dans le bandeau, à la place qu'occupait la pastille de
     l'enjeu. L'émetteur prend le haut, l'appartenance prend le bas. */
  /* LES MARQUES DÉBORDENT DU CADRE, et de biais.
     Elles ne sont PLUS dans .photo mais à la racine : le panneau écrête
     (overflow:hidden), donc tout ce qui doit chevaucher son bord doit vivre
     au-dessus de lui, pas dedans. Chacune tient son coin, pour qu'aucune n'en
     dispute un autre — médaillon en haut à gauche, pastille en haut à droite,
     ruban en bas à gauche.
     Formes d'époque plutôt que rectangles cernés : un rectangle posé sur une
     similigravure se lit comme un autocollant collé après coup, là où le
     médaillon et la queue d'aronde sont des dispositifs du carton lui-même —
     l'ovale du numéro chez Glenn Hall, le cercle chez Delvecchio, le patin
     dessiné chez Federko. */

  /* L'ÉTOILE DE L'ENJEU — couleur de l'enjeu dominant, pictogramme du CAPP en
     son centre. Elle rend au recto la LÉGENDE que GABARIT.md réclame (« couleur
     ET pictogramme, jamais une couleur seule ») : la bande colorée sous la
     photo ne disait la couleur qu'à ceux qui connaissent déjà le code.
     Le liseré vient d'une seconde découpe, légèrement plus grande, posée
     dessous — clip-path rogne les bordures. */
  .etoile-enjeu{position:absolute;right:34px;bottom:328px;width:182px;height:182px;
                transform:rotate(-8deg)}
  .etoile-enjeu span{position:absolute;
    clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
  .etoile-enjeu .bord{inset:-10px;background:${COLORS.ink}}
  .etoile-enjeu .fond{inset:0;background:${enjeu}}
  /* Le centroïde de ce polygone est à 50,4 % de la hauteur — soit le centre de
     la boîte, à un pixel près sur 182. Un premier jet le croyait bien plus bas
     et poussait le pictogramme de 13 px vers le sol ; le calcul dit le
     contraire, donc aucun décalage. */
  .etoile-enjeu .glyphe{position:absolute;inset:0;display:flex;align-items:center;
                        justify-content:center;clip-path:none}

  /* LE MÉDAILLON — à cheval sur le coin, moitié carton moitié panneau. Double
     anneau : le liseré clair détache le disque de la trame, le filet d'encre
     l'y rattache. */
  .medaillon{position:absolute;left:8px;top:8px;width:124px;height:124px;border-radius:50%;
             background:${parti};color:${COLORS.paper};border:6px solid ${COLORS.paper};
             box-shadow:0 0 0 3px ${COLORS.ink};display:flex;align-items:center;
             justify-content:center;font-family:"Playfair Display",serif;font-weight:900;
             font-size:52px;line-height:1;transform:rotate(-6deg)}
  /* DÉCALAGE MESURÉ, pas estimé. Centrer la boîte du texte ne centre pas
     l'ENCRE : Playfair réserve sous la ligne de base une place que le centrage
     compte comme du texte, et les chiffres retombent 10 px sous le centre du
     disque. Un padding n'y changeait rien — mesuré à 0, 6, 12, 16 et 20 px,
     l'encre ne bougeait pas d'un pixel. On déplace donc le dessin lui-même.
     Réglé à −8 et non −10 : le balayage centre l'encre à −10, mais la rotation
     de 6° fait monter le premier chiffre et le disque paraît alors coiffé.
     Deux pixels sous le centre géométrique rétablissent l'équilibre perçu. */
  .medaillon i{display:block;font-style:normal;transform:translateY(-8px)}

  .marque{position:absolute;right:20px;top:26px;transform:rotate(2.5deg);background:${COLORS.paper};
          border:3px solid ${COLORS.ink};border-radius:999px;padding:16px 34px;display:block}
  /* La boîte suit le RAPPORT du logotype rogné — 1770 × 574, soit 3,08 pour 1.
     Réglée à 238 × 42, « contain » l'ajustait par la hauteur et ne lui donnait
     que 129 px de large : le dessin flottait au milieu d'une pastille vide. */
  .marque i{display:block;width:216px;height:70px;background:${parti};
            -webkit-mask-size:contain;mask-size:contain;
            -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
            -webkit-mask-position:center;mask-position:center}

  /* LE RUBAN — queue d'aronde aux deux bouts, découpée au clip-path. Le liseré
     est obtenu par SUPERPOSITION : clip-path rogne les bordures et les ombres,
     donc on empile une découpe d'encre et une découpe de couleur en retrait. */
  .ruban{position:absolute;left:14px;bottom:346px;transform:rotate(-2.5deg);
         max-width:560px;background:${COLORS.ink};
         clip-path:polygon(0 0,100% 0,calc(100% - 20px) 50%,100% 100%,0 100%,20px 50%);
         padding:3px}
  .ruban i{display:block;background:${COLORS.paper};
           clip-path:polygon(0 0,100% 0,calc(100% - 19px) 50%,100% 100%,0 100%,19px 50%);
           padding:13px 38px;font-style:normal;
           font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:21px;
           letter-spacing:.12em;text-transform:uppercase;color:${COLORS.ink};line-height:1.24}
  /* Le ruban est en PAPIER, encre au trait — le pavé d'encre pleine de la
     première version écrasait le haut de la carte et se lisait comme un
     bandeau de deuil. Un carton d'époque réserve ses aplats sombres au
     bandeau du nom, et donne à ses banderoles le ton du carton. */
  .ruban.eclat i{background:${COLORS.paper}}
  .ruban.eclat .etoile{color:${enjeu}}
  .ruban .etoile{margin-right:9px}
  .ecusson{flex:0 0 auto;width:118px;height:118px;background:${COLORS.paper};
           -webkit-mask-size:contain;mask-size:contain;
           -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
           -webkit-mask-position:center;mask-position:center}

  /* LE RUBAN DE CHEF — la seule distinction de la série. À gauche, en vis-à-vis
     de la plaque de marque, pour que le haut de la photo reste équilibré. */
  /* LE BANDEAU — aplat à la couleur du parti, le nom dessus. Le filet du haut
     porte la couleur SECONDAIRE, celle de l'enjeu dominant. */
  /* L'ENJEU DOMINANT NE S'ÉCRIT PLUS (demande de Jules, 22-09) : il se donne
     par la COULEUR, en bandeau épais au sommet de la bande du nom.
     ⚠️ Écart assumé à GABARIT.md, qui arrête « Enjeux = couleur ET
     pictogramme, jamais une couleur seule, sans légende ». Le verso, lui,
     nomme l'enjeu et porte son pictogramme : la légende existe, elle est au
     dos. À valider. */
  .bande{position:absolute;left:0;right:0;bottom:0;height:${BANDE}px;background:${parti};
         border-top:3px solid ${COLORS.ink};box-shadow:inset 0 22px 0 ${enjeu};
         display:flex;align-items:center;justify-content:space-between;gap:28px;padding:0 40px}
  /* flex:1 + min-width:0 donnent au bloc du nom une largeur DÉFINIE, sans quoi
     clientWidth vaut la largeur du texte et la mesure ne peut rien détecter. */
  .bande .qui{flex:1;min-width:0;overflow:hidden}
  .nom{font-family:"Playfair Display",serif;font-weight:900;font-size:68px;
       line-height:1.0;letter-spacing:-.02em;color:${COLORS.paper};
       text-transform:uppercase;white-space:nowrap;overflow:hidden}
  .sous{margin-top:12px;font-family:"IBM Plex Mono",monospace;font-size:27px;letter-spacing:.1em;
        text-transform:uppercase;color:${COLORS.paper};opacity:.72}

  /* LE PIED DE CARTON — hors panneau, sur le carton nu. Tout petit. */
  .pied{position:absolute;left:${MARGE + 4}px;right:${MARGE + 4}px;top:${PANNEAU.bas + 26}px;
        display:flex;align-items:baseline;justify-content:space-between;gap:24px;
        font-family:"IBM Plex Mono",monospace;font-size:23px;letter-spacing:.08em;
        text-transform:uppercase;color:${COLORS.softer}}
  .credit{position:absolute;left:${MARGE + 4}px;right:${MARGE + 4}px;top:${PANNEAU.bas + 68}px;
          font-size:20px;font-style:italic;color:${COLORS.softer};opacity:.85}

  /* LE GRAIN — un carton imprimé n'a pas de surface parfaitement unie, et
     c'est cette uniformité qui trahit une image de synthèse. */
  /* Voir le verso : dimensions EXPLICITES (un <svg> sans width/height garde sa
     taille intrinsèque de 300 × 150) et AUCUN mix-blend-mode (aucune fusion ne
     rend dans ce Chrome). Le grain du recto souffrait des deux. */
  .grain,.mouchete{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none}
  .grain{opacity:.22}
  .mouchete{opacity:.18}
</style></head><body>
  <div class="panneau">
    <div class="photo">
      ${portrait
        ? `<div class="encre"></div>`
        : `<div class="vide">${fleur(parti, 300)}</div>`}
      <div class="fondu"></div>
    </div>
    <div class="bande">
      <div class="qui">
        <p class="nom">${txt(d.name)}</p>
        ${d.circonscription ? `<p class="sous">${txt(d.circonscription)}</p>` : ""}
      </div>
      ${ecusson ? `<span class="ecusson" style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></span>` : ""}
    </div>
  </div>

  ${/* Plus de fleur de lys ici (Jules, 22-09) : accolée au nom de l'Assemblée,
        elle se lisait comme un emblème officiel et laissait croire que la
        carte émane de l'institution. */ ""}
  ${d.topIssueKey ? `<span class="etoile-enjeu">
    <span class="bord"></span><span class="fond"></span>
    <span class="glyphe">${enjeuGlyph(d.topIssueKey, COLORS.paper, 58)}</span>
  </span>` : ""}
  <span class="medaillon"><i>${c.numero}</i></span>
  ${logoVitrine ? `<span class="marque"><i style="-webkit-mask-image:url('${logoVitrine}');mask-image:url('${logoVitrine}')"></i></span>` : ""}
  ${c.chef ? `<span class="ruban${c.chef.eclat ? " eclat" : ""}"><i>${c.chef.eclat ? '<span class="etoile">&#9733;</span>' : ""}${txt(c.chef.titre)}</i></span>` : ""}

  <p class="pied">
    ${/* L'Assemblée nationale est déjà nommée dans le crédit juste en dessous :
          la répéter ici faisait passer le pied sur deux lignes, lesquelles
          chevauchaient ce crédit. */ ""}
    <span>Édition ${c.annee} &middot; série de ${c.total}</span>
    <span>vitrinedemocratique.com</span>
  </p>
  <p class="credit">Portrait&nbsp;: Assemblée nationale du Québec &middot; usage non commercial autorisé</p>

  <svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>
</body></html>`;
}

/** LE VERSO — le dos du carton, d'après les séries O-Pee-Chee 1965-1978.
 *
 *  LE VOCABULAIRE GRAPHIQUE, repris point par point de ces dos-là :
 *
 *  1. BICHROMIE. C'est le signal rétro le plus fort, et le plus facile à
 *     manquer. Ces cartons sortent d'une presse à deux ou trois encres : un
 *     CARTON TEINTÉ, un PANNEAU d'une autre teinte, et UNE SEULE encre pour
 *     tout le texte. Delvecchio 1969 : carton sarcelle, panneau jaune, texte
 *     vert. Federko 1978 : carton rouille, panneaux rose pâle, encre verte.
 *     Ici : carton à la couleur du parti, panneau papier, encre du parti sur
 *     le panneau et papier sur le carton. Une version précédente empilait
 *     cinq couleurs sur la même face — c'est ce qui la faisait lire comme une
 *     maquette d'aujourd'hui.
 *  2. UNE GROTESQUE CONDENSÉE GRASSE, en capitales, pour le nom et les
 *     titres. Playfair est une didone : du magazine de mode, pas du carton de
 *     1969. ⚠️ ÉCART ASSUMÉ à GABARIT.md, qui arrête Playfair / Source Serif /
 *     IBM Plex Mono pour le site et les reels. Le carton est un objet à part,
 *     et la charte n'avait pas prévu le cas ; à valider.
 *  3. LE NUMÉRO DANS UNE FORME — ovale noir chez Glenn Hall, cercle blanc chez
 *     Delvecchio, patin dessiné chez Federko. Jamais un carré nu.
 *  4. LE PANNEAU À COINS TRÈS ARRONDIS, qui contient tout le contenu utile.
 *  5. LA LIGNE D'IDENTITÉ sous le nom, en capitales, position puis équipe :
 *     « GOALIE   CHICAGO BLACK HAWKS » devient enjeu, circonscription, parti.
 *  6. DES EN-TÊTES DE COLONNES MINUSCULES SUR DEUX LIGNES (« games / played »)
 *     séparés par des FILETS VERTICAUX FINS, pas par des cases.
 *  7. DES RANGÉES DE LOSANGES en séparateur, et des titres CENTRÉS.
 */
function versoHTML(
  c: Carte,
  fiche: Partial<Record<PeriodKey, DeputyRow>>,
  maxAbs: Record<PeriodKey, number>,
  libelles: Record<PeriodKey, string>,
  vignette: string | null,
  ecusson: string | null,
  logoVitrine: string | null,
  /** Date de la dernière SÉANCE couverte, pas du dernier fetch : la publication
   *  des transcriptions par l'Assemblée prend plusieurs semaines. */
  derniereSeance: string,
): string {
  const d = c.deputy;
  const parti = c.couleur;
  const enjeu = d.topIssueColor ?? COLORS.soft;
  const mot = (d.signatureWord ?? "").trim();
  // La citation brute porte PARFOIS déjà ses guillemets — le raffineur découpe
  // l'extrait dans le texte du débat, guillemets compris quand l'élu en cite
  // un autre. On les retire avant d'encadrer.
  const citation = (d.signatureWordContext ?? "")
    .trim()
    .replace(/^[«"“”\s]+/, "")
    .replace(/[»"“”\s]+$/, "")
    .trim();

  // La ligne d'identité du carton : « GOALIE   CHICAGO BLACK HAWKS ».
  // L'enjeu garde son PICTOGRAMME, faute de pouvoir garder sa couleur : sur un
  // carton à deux encres, une troisième teinte casserait le parti pris. Le
  // recto, lui, porte toujours la couleur de l'enjeu.
  const identite = [d.topIssueLabel, d.circonscription, ligneParti(c)]
    .filter(Boolean).join("   ·   ");
  const picto = d.topIssueKey
    ? `<span class="glyphe">${enjeuGlyph(d.topIssueKey, "#fff", 26)}</span>` : "";

  // Vitaux du carton — « Ht: 6'0"  Wt: 178  Born: 5-12-56 ». Les nôtres
  // viennent d'affiliationHistory : date d'élection, et bascule d'allégeance
  // quand il y en a une.
  const parcours = d.affiliationHistory ?? [];
  const vitaux = [
    c.mandat || null,
    parcours.length > 1 && dateFr(parcours.at(-1)?.startDate)
      ? `Changement d'allégeance le ${dateFr(parcours.at(-1)?.startDate)}` : null,
  ].filter(Boolean).join("   ·   ");

  // LA PART DE SES INTERVENTIONS — panneau à part, et sous forme de BARRE
  // EMPILÉE plutôt que de ligne chiffrée : une deuxième liste de nombres se
  // serait confondue avec le tableau juste au-dessus.
  //
  // On reprend la pile COMPLÈTE du site, segment « autres enjeux » compris,
  // pour que la barre somme bien à 100 % — trois parts isolées laisseraient
  // croire à un total tronqué. Les segments sont des TRAMES de l'encre du
  // parti, du plein au clair : c'est ainsi qu'on distinguait des séries sur
  // une presse à deux encres, et ça préserve la bichromie.
  const pile = d.enjeuStack.filter((x) => x.widthPct > 0);
  const nommes = pile.filter((x) => !x.isReste && x.cle).slice(0, 3);
  const TRAMES = [1, .68, .42];
  const barre = pile.length
    ? `<div class="empilee">${pile.map((x) => {
        const rang = nommes.indexOf(x);
        const trame = rang >= 0 ? TRAMES[rang] : .16;
        return `<i style="width:${x.widthPct}%;background:${parti};opacity:${trame}"></i>`;
      }).join("")}</div>
       <ul class="legende">${nommes.map((x, i) => `
         <li>
           <span class="puce" style="background:${parti};opacity:${TRAMES[i]}"></span>
           <span class="pg">${enjeuGlyph(x.cle, parti, 24)}</span>
           <span class="pl">${txt(x.label)}</span>
           <b>${Math.round(x.widthPct)}&nbsp;%</b>
         </li>`).join("")}
         <li class="reste"><span class="puce" style="background:${parti};opacity:.16"></span>
           <span class="pl">Autres enjeux</span>
           <b>${Math.round(100 - nommes.reduce((t, x) => t + x.widthPct, 0))}&nbsp;%</b></li>
       </ul>`
    : "";

  const losanges = `<p class="losanges">${"◆ ".repeat(21).trim()}</p>`;

  const lignes = PERIODES.map((cle) => {
    const r = fiche[cle];
    const libelle = libelles[cle];
    if (!r) {
      return `<tr class="vide"><th>${txt(libelle)}</th><td colspan="4">aucune intervention</td></tr>`;
    }
    const pct = toneScalePct(r.toneScore, maxAbs[cle]);
    const couleurTon = r.toneScore >= 0 ? TONE.positive : TONE.negative;
    return `
      <tr${cle === "legislature" ? ' class="pivot"' : ""}>
        <th>${txt(libelle)}</th>
        <td>${r.interventions.toLocaleString("fr-CA")}</td>
        <td>${txt(r.wordsFormatted)}</td>
        <td class="points">${Array.from({ length: 5 }, (_, i) =>
          `<i class="${i < r.richnessLevel ? "plein" : ""}"></i>`).join("")}</td>
        <td class="ton" title="${txt(toneWording(r.toneScore, maxAbs[cle]))}">
          <span class="piste"><i class="neutre"></i><i class="repere" style="left:${pct}%;background:${couleurTon}"></i></span>
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Archivo+Narrow:ital,wght@0,400;0,600;0,700;1,400&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  /* LE CARTON est teinté ; l'encre du carton est le papier. */
  body{width:${W}px;height:${H}px;background:${parti};color:${COLORS.paper};
       font-family:"Archivo Narrow","Arial Narrow",sans-serif;position:relative;overflow:hidden}
  /* space-between : le jeu se répartit entre l'en-tête, les deux panneaux et
     le pied, au lieu de s'accumuler en un seul creux. */
  .panneau{position:absolute;left:${PANNEAU.x}px;top:${PANNEAU.y}px;
           width:${PANNEAU.w}px;height:${PANNEAU.bas - PANNEAU.y}px;
           overflow:hidden;display:flex;flex-direction:column;justify-content:space-between}

  /* EN-TÊTE sur le carton : numéro dans un cercle, nom centré, photo cerclée. */
  .haut{display:flex;align-items:center;gap:24px;padding:2px 0 16px}
  .numero{flex:0 0 auto;width:96px;height:96px;border-radius:50%;
          background:${COLORS.paper};color:${parti};
          display:flex;align-items:center;justify-content:center;
          font-family:"Oswald",sans-serif;font-weight:700;font-size:46px;line-height:1}
  .titre{flex:1;min-width:0;text-align:center}
  /* display:block sur les DEUX : laissée en ligne, l'identité s'enroulait
     autour du nom (« MARC TANGUAY TERRES · LAFONTAINE · PARTI LIBÉRAL… »). */
  .nom{display:block;font-family:"Oswald",sans-serif;font-weight:700;font-size:58px;
       line-height:1.02;letter-spacing:.005em;text-transform:uppercase;
       white-space:nowrap;overflow:hidden}
  .identite{display:flex;align-items:center;justify-content:center;gap:10px;
            margin-top:8px;font-family:"Oswald",sans-serif;font-weight:500;font-size:22px;
            letter-spacing:.07em;text-transform:uppercase;opacity:.9}
  .identite .glyphe{display:block;flex:0 0 auto;filter:brightness(0) invert(1);opacity:.9}
  .vitaux{display:block;margin-top:5px;font-family:"Archivo Narrow",sans-serif;font-size:20px;
          font-style:italic;opacity:.72}
  /* Le titre de chef, en réserve sur l'encre du carton : c'est la seule
     distinction de la série, elle doit se voir sans se confondre avec le nom. */
  .chef.eclat{background:${COLORS.ink};color:${COLORS.paper}}
  .chef{display:inline-block;margin-top:9px;background:${COLORS.paper};color:${parti};
        font-family:"Oswald",sans-serif;font-weight:600;font-size:21px;letter-spacing:.16em;
        text-transform:uppercase;padding:5px 14px}
  .rond{flex:0 0 auto;width:150px;height:150px;border-radius:50%;
        border:7px solid ${COLORS.paper};background:${COLORS.paper};
        position:relative;overflow:hidden}
  .rond .encre{position:absolute;inset:0;background:${parti};
               -webkit-mask-image:url("${vignette ?? ""}");mask-image:url("${vignette ?? ""}");
               -webkit-mask-size:cover;mask-size:cover;
               -webkit-mask-position:center 12%;mask-position:center 12%;
               -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}

  /* DEUX PANNEAUX, comme au dos du Federko 1978 : la fiche, puis la signature,
     séparés par le carton nu. Un panneau unique laissait un grand vide au
     milieu, le mot étant poussé en bas ; deux blocs remplissent la carte et
     donnent au mot son propre cadre. */
  .bloc{background:${COLORS.paper};color:${parti};border-radius:40px;
        padding:22px 38px 20px;display:flex;flex-direction:column}
  .bloc.fiche{flex:0 0 auto}
  .bloc.signe{flex:0 0 auto;text-align:center;padding:20px 38px 24px}

  .losanges{text-align:center;font-size:15px;letter-spacing:.5em;opacity:.42;margin:12px 0}
  .rubrique{font-family:"Oswald",sans-serif;font-weight:600;font-size:27px;letter-spacing:.14em;
            text-transform:uppercase;text-align:center}
  /* LA BARRE EMPILÉE et sa légende. */
  .bloc.parts{flex:0 0 auto;padding:18px 38px 20px}
  .empilee{display:flex;height:34px;margin-top:16px;overflow:hidden;border-radius:3px}
  .empilee i{display:block;height:100%}
  .legende{list-style:none;display:flex;flex-wrap:wrap;justify-content:space-between;
           gap:8px 26px;margin-top:14px}
  .legende li{display:flex;align-items:center;gap:9px;font-size:23px}
  .legende .puce{width:17px;height:17px;flex:0 0 auto;border-radius:2px}
  .legende .pg{flex:0 0 auto;display:block}
  .legende .pl{white-space:nowrap}
  .legende b{font-family:"Oswald",sans-serif;font-weight:600;font-size:24px}
  .legende .reste{opacity:.62}

  /* LE TABLEAU — filets VERTICAUX fins entre colonnes, en-têtes minuscules sur
     deux lignes, comme « games / played ». Aucune case. */
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:10px}
  thead th{font-family:"Oswald",sans-serif;font-weight:500;font-size:19px;line-height:1.08;
           letter-spacing:.05em;text-transform:uppercase;opacity:.72;
           padding:0 14px 9px;text-align:right;vertical-align:bottom;
           border-bottom:2px solid currentColor}
  thead th+th{border-left:1px solid currentColor}
  thead th:first-child{text-align:left}
  tbody th{text-align:left;font-weight:400;font-size:27px;line-height:1.12;
           padding:21px 14px}
  tbody td{padding:21px 14px;text-align:right;font-size:33px;font-weight:700;
           font-family:"Oswald",sans-serif;border-left:1px solid currentColor}
  tbody tr+tr th,tbody tr+tr td{border-top:1px solid rgba(0,0,0,.14)}
  .pivot th{font-family:"Oswald",sans-serif;font-weight:600;font-size:22px;letter-spacing:.08em;
            text-transform:uppercase}
  .pivot th,.pivot td{border-top:2px solid currentColor !important}
  .vide td{font-size:22px;font-style:italic;font-weight:400;font-family:inherit;
           text-align:left;opacity:.66;border-left:1px solid currentColor}
  .points{white-space:nowrap}
  .points i{display:inline-block;width:14px;height:14px;border-radius:50%;margin-left:5px;
            border:2px solid currentColor;vertical-align:middle}
  .points i.plein{background:currentColor}
  .ton .piste{position:relative;display:block;height:12px;background:${COLORS.deep};
              margin-left:auto;width:132px}
  .ton .neutre{position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:currentColor;opacity:.4}
  .ton .repere{position:absolute;top:-4px;width:7px;height:20px;transform:translateX(-50%)}

  /* LE MOT — le point d'arrivée. */
  .mot{font-family:"Oswald",sans-serif;font-weight:700;font-size:64px;line-height:1.04;
       text-transform:uppercase;margin-top:8px}
  .citation{font-size:25px;line-height:1.34;font-style:italic;margin-top:10px;opacity:.8;
            display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .absent{font-size:25px;line-height:1.34;font-style:italic;opacity:.7;margin-top:8px}

  /* PIED sur le carton. */
  /* GRILLE 1fr auto 1fr, et non space-between : le logo de la Vitrine (168 px)
     et l'écusson du parti (46 px) n'ont pas la même largeur, si bien que
     l'adresse se retrouvait décalée vers la droite. Les deux colonnes
     extérieures étant égales, le centre l'est vraiment. */
  .pied{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;
        padding-top:12px;font-family:"Oswald",sans-serif;font-weight:500;font-size:21px;
        letter-spacing:.1em;text-transform:uppercase;opacity:.9}
  .pied>:first-child{justify-self:start}
  .pied>:last-child{justify-self:end}
  .metho{margin-top:auto;padding-top:9px;font-size:16px;line-height:1.28;
         font-style:italic;opacity:.68;text-align:center}
  .pied .marque{width:168px;height:34px;background:${COLORS.paper};opacity:.92;
                -webkit-mask-size:contain;mask-size:contain;
                -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                -webkit-mask-position:left center;mask-position:left center}
  .pied .ecusson{width:46px;height:46px;background:${COLORS.paper};
                 -webkit-mask-size:contain;mask-size:contain;
                 -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                 -webkit-mask-position:center;mask-position:center}
  .credit{position:absolute;left:${MARGE + 4}px;right:${MARGE + 4}px;top:${PANNEAU.bas + 26}px;
          font-size:19px;font-style:italic;opacity:.62;display:flex;
          justify-content:space-between;gap:20px}
  /* LE GRAIN, en DEUX couches et en overlay.
     La version précédente était un multiply à 7 % : sur un carton foncé, un
     multiply n'assombrit presque rien et le grain restait invisible. L'overlay
     éclaircit ce qui est clair et assombrit ce qui est sombre — il porte donc
     aussi bien sur le carton que sur les panneaux de papier.
     · « grain » : haute fréquence, le bruit de la trame d'impression ;
     · « mouchete » : basse fréquence, les taches du carton recyclé, qui sont
       ce qui distingue un vrai carton d'un aplat numérique. */
  /* ⚠️ AUCUN mix-blend-mode ici. Banc d'essai du 22-09 : une couche de bruit
     SVG en « overlay » ou en « multiply » ne rend RIEN dans ce Chrome — ni en
     élément SVG, ni en background-image — alors que la même couche en simple
     opacité s'affiche. Le grain était donc invisible depuis le premier jet.
     On module l'ALPHA du bruit au lieu de sa couleur : le filtre écrase les
     canaux RVB sur une teinte fixe et met la luminance du bruit dans l'alpha.
     Résultat : des mouchetures, sans le voile gris qu'un bruit opaque poserait
     sur toute la carte. Deux couches, comme sur un carton : le piqué fin de la
     trame, et les taches larges de la pâte recyclée. */
  /* ⚠️ width/height EXPLICITES. Un <svg> sans attributs de dimension garde sa
     taille intrinsèque par défaut — 300 × 150 — et « inset:0 » ne l'étire pas :
     la couche ne couvrait que le coin supérieur gauche de la carte. C'est la
     vraie raison pour laquelle le grain semblait absent depuis le premier jet.
     ⚠️ AUCUN mix-blend-mode non plus. Banc d'essai du 22-09 : une couche de
     bruit SVG en « overlay » ou en « multiply » ne rend RIEN dans ce Chrome,
     ni en élément SVG ni en background-image, alors que la même couche en
     simple opacité s'affiche. On module donc l'ALPHA du bruit au lieu de sa
     couleur : le filtre écrase les canaux RVB sur une teinte fixe et met la
     luminance du bruit dans l'alpha. Des mouchetures, sans le voile gris
     qu'un bruit opaque poserait sur toute la carte. */
  .grain,.mouchete{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none}
  .grain{opacity:.26}
  .mouchete{opacity:.22}
</style></head><body>
  <div class="panneau">
    <div class="haut">
      <span class="numero">${c.numero}</span>
      <span class="titre">
        <span class="nom">${txt(d.name)}</span>
        <span class="identite">${picto}<span>${txt(identite)}</span></span>
        ${c.chef ? `<span class="chef${c.chef.eclat ? " eclat" : ""}">${c.chef.eclat ? "&#9733; " : ""}${txt(c.chef.titre)}</span>` : ""}
        ${vitaux ? `<span class="vitaux">${txt(vitaux)}</span>` : ""}
      </span>
      <span class="rond">${vignette ? `<span class="encre"></span>` : fleur(parti, 100)}</span>
    </div>

    <div class="bloc fiche">
      <p class="rubrique">Fiche à l'Assemblée &middot; ${txt(c.salon)}</p>
      ${losanges}
      <table>
        <colgroup><col style="width:30%"><col style="width:16%"><col style="width:19%"><col style="width:16%"><col style="width:19%"></colgroup>
        <thead><tr>
          <th>Période</th><th>Inter-<br>ventions</th><th>Mots<br>prononcés</th><th>Richesse<br>du vocabulaire</th><th>Ton des<br>interventions</th>
        </tr></thead>
        <tbody>${lignes}</tbody>
      </table>
    </div>

    ${barre ? `
    <div class="bloc parts">
      <p class="rubrique">Part de ses interventions</p>
      ${barre}
    </div>` : ""}

    ${mot ? `
    <div class="bloc signe">
      <p class="rubrique">Mot signature</p>
      <p class="mot">${txt(mot)}</p>
      ${citation ? `<p class="citation">«&nbsp;${txt(citation)}&nbsp;»</p>` : ""}
    </div>` : ""}

    <p class="metho">
      Source&nbsp;: transcriptions du Salon bleu, Assemblée nationale du Québec. Dernière séance couverte&nbsp;: ${txt(derniereSeance)}.
      Le mot signature est l'expression la plus DISTINCTIVE de cet élu par rapport aux autres, et non la plus fréquente.
      La richesse mesure la variété du vocabulaire (indice MATTR) et se lit en cinq niveaux RELATIFS aux élus de la
      même période&nbsp;: cinq points marquent le vocabulaire le plus varié observé, un point le moins varié.
      ${/* « validé à la main » n'est vrai QUE si la planche-contact est
            réellement relue avant l'envoi. C'est ce que le verrou de --png
            impose : les images ne sortent pas tant que la planche de cette
            version exacte n'a pas été produite. La phrase engage donc le
            procédé, pas seulement l'intention. */ ""}
      Mesures produites par traitement automatisé (validé à la main)&nbsp;: des erreurs d'appariement ou de classement restent possibles.
      Signalez-nous toute correction. Méthodologie complète sur le site.
    </p>

    <p class="pied">
      ${/* Une fleur de lys ici doublonnait avec l'écusson du parti : le logo
            NOIR de la CAQ est une fleur de lys, celui du PCQ en porte une —
            plus de la moitié des 129 cartes affichaient donc deux fois le même
            dessin, ce qui se lit comme une erreur de montage. */ ""}
      ${logoVitrine
        ? `<span class="marque" style="-webkit-mask-image:url('${logoVitrine}');mask-image:url('${logoVitrine}')"></span>`
        : `<span>${fleur(COLORS.paper, 26)}</span>`}
      <span>vitrinedemocratique.com</span>
      ${ecusson ? `<span class="ecusson" style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></span>` : `<span></span>`}
    </p>
  </div>

  <p class="credit">
    <span>Portrait&nbsp;: Assemblée nationale du Québec &middot; usage non commercial autorisé</span>
    <span>Édition ${c.annee} &middot; carte ${c.numero} de ${c.total}</span>
  </p>
  <svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>
</body></html>`;
}

/** Planche-contact : les cartes sur une page, à relire AVANT de produire les
 *  PNG. Même esprit que le verrou d'aperçu des reels : on ne produit pas ce
 *  qu'on n'a pas regardé. */
function plancheHTML(slugs: string[], vignettes: string[], empreinte: string, periodeLabel: string): string {
  const cases = slugs.map((s, i) => `
    <figure>
      <img src="${vignettes[i]}" alt="">
      <figcaption>${txt(s)}</figcaption>
    </figure>`).join("");
  return `<!DOCTYPE html><html lang="fr" data-empreinte="${empreinte}"><head><meta charset="utf-8">
<title>Cartes de député · planche-contact</title>
<style>
  body{margin:0;padding:32px;background:#1C1917;color:#F3ECDD;
       font:15px "IBM Plex Mono",ui-monospace,monospace}
  h1{font-size:20px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px}
  p.sous{opacity:.7;margin:0 0 28px}
  .grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:26px}
  figure{margin:0}
  figure img{width:100%;display:block}
  figcaption{margin-top:8px;font-size:13px;line-height:1.35;opacity:.85}
</style></head><body>
  <h1>Cartes de député · ${slugs.length / 2} cartes recto-verso · ${txt(periodeLabel)}</h1>
  <p class="sous">Relire, puis relancer avec <b>--png</b>.</p>
  <div class="grille">${cases}</div>
</body></html>`;
}

/** Le contenu coupé ne se voit pas sur l'image : on le NOMME. */
function rapporterDebordements(liste: string[]): void {
  if (!liste.length) return;
  console.warn(`  ⚠️ ${liste.length} carte(s) dont le contenu déborde du panneau et se trouve coupé :`);
  for (const l of liste) console.warn(`     · ${l}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const periode = (typeof args.periode === "string" ? args.periode : "legislature") as PeriodKey;
  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie : "social-out/cartes-deputes");

  const data = await loadAssemblee();
  if (!data) throw new Error("Aucune donnée d'Assemblée : public/data/agora/ est vide ou illisible.");
  const vue = data.periods[periode];
  if (!vue) throw new Error(`Période inconnue : ${periode} (legislature, session ou last_pdq).`);

  // LE JEU COMPLET D'ABORD, la sélection ensuite. Le numéro de carte doit être
  // celui de la série entière : tiré après un filtre, « --only tanguay »
  // donnerait la carte n° 1 sur 1, ce qui ne veut rien dire sur un carton de
  // collection. On numérote donc les 129 dans l'ordre alphabétique des
  // circonscriptions, puis on filtre.
  const jeu = vue.rows.flatMap((row) =>
    (row.deputies ?? []).map((deputy) => ({
      slug: slugCirco(deputy), deputy, parti: row.label, cle: row.key,
      couleur: PARTY_COLORS[row.key] ?? row.color,
    })));
  jeu.sort((a, b) => a.slug.localeCompare(b.slug, "fr"));

  // ANNÉE DE L'ÉDITION — heure de MONTRÉAL, comme tout ce qui porte une date
  // dans ce dépôt (règle dure : les horaires sont en heure locale, pas UTC).
  const annee = Number(typeof args.annee === "string"
    ? args.annee
    : new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", year: "numeric" }).format(new Date()));

  const mandats = await chargerMandats();
  let cartes: Carte[] = jeu.map((c, i) => ({
    ...c, numero: i + 1, total: jeu.length, salon: vue.subtitle, annee,
    mandat: ligneMandat(trouverMandat(mandats, c.deputy.name, c.slug)),
    chef: CHEFS[c.slug],
  }));

  // Une entrée de CHEFS qui ne désigne personne ne doit pas disparaître en
  // silence : la clé est un slug de circonscription, et « lassomption » au
  // lieu de « l-assomption » suffisait à escamoter le ruban du premier
  // ministre sans le moindre message.
  const slugsConnus = new Set(jeu.map((c) => c.slug));
  const orphelins = Object.keys(CHEFS).filter((k) => !slugsConnus.has(k));
  if (orphelins.length) {
    console.warn(`  ⚠️ ${orphelins.length} titre(s) de CHEFS sans élu correspondant : ${orphelins.join(", ")}`);
    console.warn("     La clé est le slug de la circonscription (« l-assomption », « camille-laurin »).");
  }

  const sansMandat = cartes.filter((c) => !c.mandat);
  if (sansMandat.length) {
    console.warn(`  ⚠️ ${sansMandat.length} carte(s) sans date d'élection appariée :`);
    for (const c of sansMandat) console.warn(`     · ${c.deputy.name} (${c.slug})`);
  }

  if (typeof args.only === "string") {
    const pli = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = pli(args.only);
    cartes = cartes.filter((c) => pli(c.deputy.name).includes(q) || pli(c.slug).includes(q));
    if (!cartes.length) throw new Error(`Aucun élu ne correspond à « ${args.only} ».`);
  }

  // ÉCHANTILLON — le député le plus actif de chaque parti. Cinq cartes
  // suffisent à juger un parti pris visuel, et elles couvrent les cinq
  // couleurs ; relancer les 129 à chaque retouche coûte dix minutes pour rien.
  if (args.echantillon) {
    const parParti = new Map<PartyKey, Carte>();
    for (const c of cartes) {
      const tenant = parParti.get(c.cle);
      if (!tenant || c.deputy.interventions > tenant.deputy.interventions) parParti.set(c.cle, c);
    }
    cartes = [...parParti.values()];
  }

  cartes.sort((a, b) => a.numero - b.numero);

  // --limite N : les N premières cartes de la série. Les numéros ayant été
  // attribués sur le jeu COMPLET, un tirage partiel garde les siens — la carte
  // 7 reste la 7 sur 129, pas la 7 sur 10.
  const limite = Number(typeof args.limite === "string" ? args.limite : 0);
  if (limite > 0) cartes = cartes.slice(0, limite);

  // CHANGEMENT D'ALLÉGEANCE — un même élu peut occuper DEUX lignes sur la
  // législature, une par affiliation (Maïté Blanchette Vézina, Rimouski : CAQ
  // puis PCQ). Les deux cartes tombaient sur le même nom de fichier et la
  // seconde écrasait la première sans rien dire : 129 cartes annoncées, 128
  // fichiers écrits. On suffixe par le parti, et on NOMME le cas — il demande
  // un arbitrage qu'un script ne peut pas rendre : on n'envoie pas deux cartes
  // à la même personne.
  const vus = new Map<string, number>();
  for (const c of cartes) vus.set(c.slug, (vus.get(c.slug) ?? 0) + 1);
  const doubles = cartes.filter((c) => (vus.get(c.slug) ?? 0) > 1);
  if (doubles.length) {
    console.warn(`  ⚠️ ${doubles.length} cartes pour ${new Set(doubles.map((c) => c.slug)).size} siège(s) — changement d'allégeance en cours de législature :`);
    for (const c of doubles) {
      console.warn(`     · ${c.deputy.name} (${c.parti}, ${c.deputy.interventions} interventions) → ${c.slug}-${c.parti.toLowerCase()}.png`);
      c.slug = `${c.slug}-${c.parti.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    }
    console.warn("     Choisissez laquelle envoyer à l'élu ; les deux ne peuvent pas partir ensemble.");
  }

  // LA FICHE — le verso porte une ligne par période, donc il faut retrouver le
  // même élu dans les trois vues. On l'indexe par slug de circonscription : le
  // nom ne suffit pas (deux « Éric Girard » à la CAQ), et l'identifiant de
  // l'Assemblée n'est pas exposé par le loader.
  const fiches = new Map<string, Partial<Record<PeriodKey, DeputyRow>>>();
  const maxAbs = {} as Record<PeriodKey, number>;
  const libelles = {} as Record<PeriodKey, string>;
  for (const cle of PERIODES) {
    const vueP = data.periods[cle];
    libelles[cle] = vueP?.tabLabel ?? cle;
    const tous = vueP ? vueP.rows.flatMap((r) => r.deputies ?? []) : [];
    // Étendue RÉELLEMENT observée dans la période, comme le fait le composant :
    // c'est elle qui normalise l'échelle de ton, pas une borne théorique.
    maxAbs[cle] = tous.reduce((m, r) => Math.max(m, Math.abs(r.toneScore)), 0);
    for (const r of tous) {
      const s = slugCirco(r);
      fiches.set(s, { ...(fiches.get(s) ?? {}), [cle]: r });
    }
  }

  const logos = await loadLogos();
  // « Dernière mise à jour du module : vendredi 12 juin 2026 » → « vendredi 12
  // juin 2026 ». Le libellé du site porte son propre préambule, qui ne
  // s'insère pas dans la phrase du disclaimer.
  const seance = vue.lastUpdated.replace(/^[^:]*:\s*/, "");

  // Deux pages par élu : le recto qu'on voit dans le fil, le verso qu'on ouvre.
  const pages: { slug: string; html: string }[] = [];
  for (const c of cartes) {
    const chemin = cheminImpression(c.deputy);
    const portrait = chemin ? await pngURI(chemin) : null;
    const vignette = chemin ? await vignetteURI(chemin) : null;
    const ecusson = await ecussonURI(c.cle);
    const fiche = fiches.get(slugCirco(c.deputy)) ?? { [periode]: c.deputy };
    pages.push({ slug: c.slug, html: carteHTML(c, portrait, ecusson, logos.vitrine) });
    pages.push({ slug: `${c.slug}-verso`, html: versoHTML(c, fiche, maxAbs, libelles, vignette, ecusson, logos.vitrine, seance) });
  }

  await fs.mkdir(outDir, { recursive: true });
  const empreinte = createHash("sha256").update(pages.map((p) => p.html).join("")).digest("hex").slice(0, 16);
  const planche = path.join(outDir, "_planche.html");

  const debordements: string[] = [];
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

    // VERROU DE RELECTURE, calqué sur celui des reels. Envoyer une carte à un
    // élu n'est pas rattrapable. Un échantillon ou une carte seule sort
    // directement : on la regarde justement pour décider.
    const cible = args.echantillon || typeof args.only === "string";
    if (args.png) {
      if (!cible) {
        const vue = await fs.readFile(planche, "utf8").catch(() => "");
        if (!vue.includes(`data-empreinte="${empreinte}"`)) {
          throw new Error(
            "PNG non produits : regardez d'abord la planche-contact de cette version.\n" +
            "  Lancez la commande SANS --png, relisez, puis relancez avec --png.",
          );
        }
      }
      for (let i = 0; i < pages.length; i++) {
        await page.setContent(pages[i].html, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(ajusterNom);
        await page.evaluate(ajusterVerso);
        const debord = await page.evaluate(mesurerDebordement);
        if (debord > 0) debordements.push(`${pages[i].slug} (${debord} px)`);
        await page.screenshot({ path: path.join(outDir, `${pages[i].slug}.png`), type: "png" });
        process.stdout.write(`\r  ${i + 1}/${pages.length} images`);
      }
      console.log(`\n  ${cartes.length} cartes (recto + verso) → ${outDir}`);
      rapporterDebordements(debordements);
      return;
    }

    const vignettes: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      await page.setContent(pages[i].html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(ajusterNom);
      await page.evaluate(ajusterVerso);
      const debord = await page.evaluate(mesurerDebordement);
      if (debord > 0) debordements.push(`${pages[i].slug} (${debord} px)`);
      const buf = await page.screenshot({ type: "jpeg", quality: 76, scale: "css" });
      vignettes.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
      process.stdout.write(`\r  ${i + 1}/${pages.length} vignettes`);
    }
    await fs.writeFile(planche, plancheHTML(pages.map((p) => p.slug), vignettes, empreinte, vue.tabLabel), "utf8");
    console.log(`\n  planche → ${planche}`);
    console.log(`  ${cartes.length} cartes · ${pages.length} images · cœur de la grille : y ${COEUR.top} → ${COEUR.bottom}`);
    rapporterDebordements(debordements);
    if (!args["sans-ouvrir"]) openInBrowser(planche);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
