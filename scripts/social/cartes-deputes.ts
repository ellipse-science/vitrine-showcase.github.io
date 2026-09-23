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
// 1. LE PORTRAIT REPREND LA PHOTO COULEUR OFFICIELLE, agrandie au Lanczos et
//    doucement accentuée. Ses encres sont désaturées comme sur une Bowman des
//    années 1950, mais aucune grosse trame ne recouvre le visage : à partir
//    d'une source de 150 × 200 px, elle rendait les points plus présents que
//    la personne.
// 2. LE FILTRE RESTE REPRODUCTIBLE. Il ne recrée ni les traits ni le décor :
//    chaque visage demeure celui du fichier de l'Assemblée nationale, avec le
//    même cadrage. Le vieillissement passe par la couleur et le carton.
// 3. LE GRAIN. Un bruit très faible passe sur toute la carte. Une surface
//    parfaitement unie est la signature d'un rendu synthétique ; un carton
//    imprimé n'en a jamais.
//
// Format 1071 × 1496, soit EXACTEMENT 63:88 (17 × chaque terme). Employer
// 1080 px de large imposerait une hauteur fractionnaire de 1508,57 px : le
// ratio ne pourrait donc pas être exact dans un PNG. 1071 est le multiple de
// 63 le plus proche de 1080.
//
// Les données viennent de `loadAssemblee()`, le loader de la page. Aucune
// donnée n'est recalculée ici (GABARIT.md, « Aucune donnée ni phrase
// inventée »).
//
// Usage :
//   npm run carte:deputes -- --echantillon   → 5 cartes, une par parti
//   npm run carte:deputes -- --limite 10     → les 10 premières de la série
//   npm run carte:deputes -- --only tanguay  → une carte, par nom ou circo
//   npm run carte:deputes                    → la planche des 128
//   npm run carte:deputes -- --png           → les PNG, la planche une fois vue
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { buildEnjeuStack, loadAssemblee, type DeputyRow, type IssueKey, type PeriodKey } from "@/lib/data/assemblee";
import { PARTY_COLORS, PARTY_FULL_NAMES, type PartyKey } from "@/lib/data/parties";
import { COLORS, TONE, enjeuGlyph, fleur, loadLogos, parseArgs, txt, openInBrowser } from "./lib/reel";

// Glose d'absence du concept distinctif, RECOPIÉE du composant du site
// (AssembleeVestiaire.tsx, conceptAbsent). La glose de présence (conceptGlose)
// n'est plus reprise sous le mot (demande de Jules, 22-09) : la note de
// méthodologie du verso dit déjà ce qu'est le mot signature.
const ABSENCE = "Aucun mot ne ressort assez nettement de ceux des autres élu.es sur cette période.";

/** Enjeux écartés des cartes tant que leur classifieur est en révision. */
const ENJEUX_EN_REVISION: readonly IssueKey[] = ["public_lands_and_agriculture", "international_affairs_and_defense"];

/** Encre des élus sans parti : un gris d'ardoise, lisible sous le papier et
 *  qu'aucun parti n'emploie. */
const COULEUR_INDEPENDANT = "#4A4F57";

/** Mention d'édition de la série imprimée. À changer à la prochaine législature. */
const EDITION_LEGISLATURE = "43e législature · 2022-2026";

/** « 43e » → « 43<sup>e</sup> » : sur un pied en capitales, « 43E » se lit mal ;
 *  l'exposant garde sa minuscule (cf. .ord). Le recto ne garde que la
 *  législature : avec les années, son pied passait sur deux lignes. */
function ordinal(html: string): string {
  return html.replace(/(\d+)e\b/g, '$1<sup class="ord">e</sup>');
}

const MONTANT = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
const POURCENT = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** RARETÉ (grille arrêtée avec Jules, 22-09). Légendaire : premiers ministres
 *  de la législature ; présidence : carte à part ; rare : les chefs de parti.
 *  Pour les autres, un POIDS — fonctions rémunérées (taux × jours) et, pour
 *  l'opposition, jours d'affrontement comme porte-parole — classé PAR CAMP,
 *  avec les mêmes proportions de part et d'autre : l'opposition, qui ne peut
 *  pas être ministre, a sa part de cartes peu communes. */
type Rarete = "commune" | "peu-commune" | "rare" | "legendaire" | "presidence";
const PROPORTIONS_RARETE: [Rarete, number][] = [["peu-commune", 0.45], ["commune", 0.55]];
const LIBELLE_RARETE: Record<Rarete, string> = {
  commune: "Commune", "peu-commune": "Peu commune", rare: "Rare", legendaire: "Légendaire", presidence: "Présidence",
};

/** CODE DE FONCTION, dans le carré à droite du nom (22-09) : la fonction la
 *  mieux payée exercée pendant la législature, en sigle. Premier motif qui
 *  correspond l'emporte, dans l'ordre du barème. */
const CODES_FONCTION: [RegExp, string][] = [
  [/^Premi(?:ère|er) ministre$/, "PM"],
  [/^Président(?:e)? de l’Assemblée nationale$/, "PAN"],
  [/^Chef(?:fe)? d/, "CO"],
  [/^Ministre\b|^Leader parlementaire du gouvernement$/, "M"],
  [/vice-président(?:e)? de l’Assemblée nationale$/, "VP"],
  [/^Leader parlementaire/, "LP"],
  [/^Whip/, "W"],
  [/^Président(?:e)? du caucus/, "PCA"],
  [/^Président(?:e)? de la Commission/, "PC"],
  [/^Adjoint(?:e)? parlementaire/, "AP"],
  [/^Vice-président(?:e)? de la Commission/, "VC"],
  [/^Président(?:e)? de séance$/, "PS"],
  [/^Membre du Bureau/, "B"],
];

function codeFonction(tenues: { titre: string; pct: number }[], porteParole: boolean): string {
  const triees = [...tenues].sort((a, b) => b.pct - a.pct);
  for (const [re, code] of CODES_FONCTION) if (triees.some((t) => re.test(t.titre))) return code;
  return porteParole ? "PP" : "D";
}

/** CONTOUR DE LA PHOTO — la FORME dit la rareté, à l'encre du parti seule
 *  (ni or ni argent, décision de Jules, 22-09) : droit (commune), une arche
 *  (peu commune), trois arches et des flancs en vagues (rare), cinq arches et
 *  des vagues sur trois côtés (légendaire).
 *
 *  LA RÉSERVE DE L'ÉCUSSON (haut à droite) est un quart d'ellipse centré sur le
 *  coin, qui part EXACTEMENT du pied des arches : l'ancienne courbe en S,
 *  posée telle quelle, cassait les vagues à cet endroit. Pour la rare et la
 *  légendaire, elle est festonnée comme le reste du contour. L'écusson
 *  (x 793-935, y 23-131 dans le panneau) tient dans l'ellipse. */
const RESERVE = { rx: 270, ry: 190 };

/** n arches en demi-ellipse entre x0 et x1 : pieds à y = creux, clés à y = 0. */
function arches(x0: number, x1: number, n: number, creux: number): string {
  const pas = (x1 - x0) / n;
  let d = "";
  for (let i = 1; i <= n; i++) d += ` A ${(pas / 2).toFixed(1)} ${creux} 0 0 1 ${(x0 + i * pas).toFixed(1)} ${creux}`;
  return d;
}

/** Festons le long d'un côté vertical : chaque vague mord vers la photo. */
function vagues(x: number, y0: number, y1: number, amplitude: number, periode: number, versInterieur: 1 | -1): string {
  const n = Math.max(1, Math.round(Math.abs(y1 - y0) / periode));
  const pas = (y1 - y0) / n;
  let d = "";
  for (let i = 0; i < n; i++) {
    d += ` Q ${(x + versInterieur * amplitude * 2).toFixed(1)} ${(y0 + (i + 0.5) * pas).toFixed(1)}, ${x} ${(y0 + (i + 1) * pas).toFixed(1)}`;
  }
  return d;
}

function festonsBas(x0: number, x1: number, y: number, amplitude: number, periode: number): string {
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / periode));
  const pas = (x1 - x0) / n;
  let d = "";
  for (let i = 0; i < n; i++) {
    d += ` Q ${(x0 + (i + 0.5) * pas).toFixed(1)} ${(y - amplitude * 2).toFixed(1)}, ${(x0 + (i + 1) * pas).toFixed(1)} ${y}`;
  }
  return d;
}

/** Réserve de l'écusson, du pied des arches (w − rx, y0) au flanc droit
 *  (w, y0 + ry). Festonnée si `amplitude` > 0 : les festons mordent vers la
 *  photo, comme sur les flancs. */
function reserve(y0: number, amplitude = 0, festons = 6): string {
  const w = PANNEAU.w;
  const { rx, ry } = RESERVE;
  if (!amplitude) return ` A ${rx} ${ry} 0 0 0 ${w} ${y0 + ry}`;
  let d = "";
  const pt = (t: number) => [w + rx * Math.cos(t), y0 + ry * Math.sin(t)];
  for (let i = 0; i < festons; i++) {
    const t0 = Math.PI - (i * Math.PI) / 2 / festons;
    const t1 = Math.PI - ((i + 1) * Math.PI) / 2 / festons;
    const [xm, ym] = pt((t0 + t1) / 2);
    const [x1, y1] = pt(t1);
    // Normale sortante (du coin vers la photo) au milieu de l'arc.
    const nx = (xm - w) / rx;
    const ny = (ym - y0) / ry;
    const nn = Math.hypot(nx, ny);
    d += ` Q ${(xm + (nx / nn) * amplitude * 2).toFixed(1)} ${(ym + (ny / nn) * amplitude * 2).toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

function cheminCadre(r: Rarete, ecusson: boolean): string {
  const w = PANNEAU.w;
  const h = PANNEAU.bas - PANNEAU.y;
  const xFin = ecusson ? w - RESERVE.rx : w;
  // Haut : les arches, puis la réserve (ou le coin droit) ; renvoie aussi le
  // point où commence le flanc droit.
  const haut = (n: number, creux: number, festonsReserve = 0) => ({
    d: `M 0 ${creux}${n ? arches(0, xFin, n, creux) : ` H ${xFin}`}${ecusson ? reserve(creux, festonsReserve) : ""}`,
    yDroit: ecusson ? creux + RESERVE.ry : creux,
  });
  switch (r) {
    case "commune": {
      const t = haut(0, 0);
      return `${t.d} V ${h} H 0 Z`;
    }
    case "peu-commune": {
      const t = haut(1, 70);
      return `${t.d} V ${h} H 0 Z`;
    }
    case "rare": {
      const t = haut(3, 44, 8);
      return `${t.d}${vagues(w, t.yDroit, h, 8, 110, -1)} H 0${vagues(0, h, 44, 8, 110, 1)} Z`;
    }
    case "legendaire":
    case "presidence": {
      const t = haut(5, 36, 8);
      return `${t.d}${vagues(w, t.yDroit, h - 24, 9, 86, -1)} L ${w} ${h}${festonsBas(w, 0, h, 6, 70)}${vagues(0, h, 36, 9, 86, 1)} Z`;
    }
  }
}

/** Tracé du contour, à l'encre du parti : un filet (commune), une bande
 *  (peu commune), une bande doublée (rare), une bande doublée et pointillée
 *  (légendaire). */
function cadreRarete(r: Rarete, ecusson: boolean, parti: string): string {
  const chemin = cheminCadre(r, ecusson);
  const trait = (couleur: string, ep: number, extra = "") =>
    `<path d="${chemin}" fill="none" stroke="${couleur}" stroke-width="${ep}" stroke-linejoin="round"${extra}/>`;
  switch (r) {
    case "commune":
      return trait(parti, 7) + trait(COLORS.ink, 2);
    case "peu-commune":
      return trait(parti, 14) + trait(COLORS.ink, 2);
    case "rare":
      return trait(parti, 20) + trait(COLORS.paper, 7) + trait(parti, 2.5);
    case "legendaire":
    case "presidence":
      return trait(parti, 26) + trait(COLORS.paper, 10) + trait(parti, 4, ` stroke-dasharray="2 12" stroke-linecap="round"`);
  }
}

/** ÉDITION HOLOGRAPHIQUE — au VERSO seulement (décision de Jules, 22-09 : le
 *  recto irisé a été rejeté deux fois). Le recto d'une carte holo est le recto
 *  ordinaire. */
const CSS_HOLO = `
  .holo{position:absolute;inset:0;pointer-events:none;z-index:50;mix-blend-mode:color-dodge;opacity:.5;
        background:
          linear-gradient(125deg,rgba(255,0,128,.6) 0%,rgba(255,214,0,.55) 17%,rgba(0,255,170,.5) 34%,rgba(0,170,255,.6) 51%,rgba(170,0,255,.55) 68%,rgba(255,0,128,.6) 85%,rgba(255,214,0,.55) 100%),
          repeating-linear-gradient(35deg,rgba(255,255,255,.22) 0 2px,transparent 2px 8px)}
  .holo-reflet{position:absolute;inset:0;pointer-events:none;z-index:51;mix-blend-mode:soft-light;
        background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.55) 45%,transparent 60%)}`;

/** INTITULÉS COURTS pour la légende de la frise. Les intitulés officiels vont
 *  jusqu'à 180 caractères ; on ne les tronque JAMAIS en plein mot. On les
 *  abrège comme le fait la presse, par règles qui gardent un intitulé vrai :
 *  précisions entre parenthèses retirées, ordinaux en chiffres, premier
 *  portefeuille d'un ministre, ministère d'un adjoint entre parenthèses,
 *  domaine court d'une commission. Les rares cas qu'aucune règle ne résout
 *  proprement sont abrégés À LA MAIN (ABREGES). LONGUEUR_LEGENDE ≈ ce qui tient
 *  sur une ligne de la légende à 21 px ; ajusterFonctions reste le filet. */
const LONGUEUR_LEGENDE = 55;
const ABREGES: Record<string, string> = {
  "Ministre responsable des Relations avec les Premières Nations et les Inuit": "Ministre responsable des Affaires autochtones",
  "Adjoint parlementaire (Relations avec les Premières Nations et les Inuit)": "Adjoint parlementaire (Affaires autochtones)",
  "Ministre responsable des Relations avec les Québécois d’expression anglaise": "Ministre responsable des Québécois d’expression anglaise",
};
const COMMISSIONS_COURTES: Record<string, string> = {
  "de l’administration publique": "Administration publique",
  "de l’agriculture, des pêcheries, de l’énergie et des ressources naturelles": "Agriculture et énergie",
  "de l’aménagement du territoire": "Aménagement du territoire",
  "de la culture et de l’éducation": "Culture et éducation",
  "de l’économie et du travail": "Économie et travail",
  "des finances publiques": "Finances publiques",
  "des institutions": "Institutions",
  "des relations avec les citoyens": "Citoyens",
  "de la santé et des services sociaux": "Santé",
  "des transports et de l’environnement": "Transports",
};

function titreCourt(titre: string): string {
  const s = titre.replace(/\s*\([^)]*\)/g, "").trim()
    .replace(/\bdeuxième groupe/g, "2e groupe").replace(/\btroisième groupe/g, "3e groupe");
  let court = s;
  const adjoint = s.match(/^(Adjointe? parlementaire) (?:au|à la|du|de la) (premi(?:er|ère) ministre|ministre(?: délégué(?:e)?)?(?: responsable)?)(?: (?:de la |de l’|des |du |de |à la |à l’|aux |au |à ))?(.*)$/);
  const commission = s.match(/^((?:Vice-)?[Pp]résident(?:e)?) de la Commission (.*)$/);
  if (adjoint) {
    if (/^premi/.test(adjoint[2])) court = `${adjoint[1]} ${adjoint[2] === "premier ministre" ? "du premier ministre" : "de la première ministre"}`;
    else {
      const dom = adjoint[3].split(/, | et (?=de |des |du |d’|à |aux |présid)/)[0];
      court = `${adjoint[1]} (${dom.charAt(0).toUpperCase()}${dom.slice(1)})`;
    }
  } else if (/^Ministre\b/.test(s)) {
    const premier = s.split(", ")[0];
    court = premier.length > LONGUEUR_LEGENDE ? premier.split(/ et (?=de |des |du |d’|à |aux |la |l’)/)[0] : premier;
  } else if (commission && s.length > LONGUEUR_LEGENDE && COMMISSIONS_COURTES[commission[2]]) {
    court = `${commission[1]} de commission (${COMMISSIONS_COURTES[commission[2]]})`;
  }
  return ABREGES[court] ?? court;
}

/** AXE DE LA FRISE — le même pour toutes les cartes, de l'élection générale à
 *  la dissolution, pour qu'on puisse les comparer côte à côte. */
const AXE_DEBUT = "2022-10-03";
const AXE_FIN = "2026-08-27";

function lendemain(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Position d'une date sur la frise, en % de la largeur. */
function positionAxe(jour: string): number {
  const a = Date.parse(AXE_DEBUT);
  const b = Date.parse(lendemain(AXE_FIN));
  return Math.max(0, Math.min(100, ((Date.parse(jour) - a) / (b - a)) * 100));
}

/** Trame de l'encre du parti selon la rémunération : plus la fonction est
 *  payée, plus l'aplat est plein (première ministre = encre pleine). Même
 *  procédé que la barre des enjeux, sur une presse à deux encres. */
function trame(pct: number): number {
  return pct === 0 ? 0 : Number((0.22 + 0.78 * Math.pow(pct / 105, 0.6)).toFixed(2));
}

/** Fonctions et indemnités à la dissolution, produites par
 *  scripts/social/fonctions-deputes.ts à partir des fiches de l'Assemblée. */
type FicheFonctions = {
  assnat_id: string;
  nom: string;
  circonscription: string | null;
  nom_famille: string | null;
  prenom: string | null;
  indemnite_totale?: number;
  total_legislature: number | null;
  moyenne_annuelle: number | null;
  fonctions_legislature?: { titre: string; pct: number; debut: string; fin: string }[];
  vis_a_vis_legislature?: { assnat_id: string; nom: string; jours: number; dossiers: string[] }[];
  porte_parole_legislature?: { titre: string }[];
  debut_mandat?: string | null;
  fin_mandat?: string;
  porte_parole: string[];
  vis_a_vis?: { assnat_id: string; nom: string; dossiers: string[] }[];
};

type Scrutin = { date: string; circonscription: string; nom_famille: string; pourcentage: number; avance: number };

async function chargerScrutins(): Promise<Scrutin[]> {
  const fichier = path.resolve(process.cwd(), "scripts/social/donnees/resultats-elections.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  if (!brut) {
    console.warn("  ⚠️ resultats-elections.json absent : pas de résultat électoral. Lancez scripts/social/resultats-elections.ts.");
    return [];
  }
  return (JSON.parse(brut) as { resultats: Scrutin[] }).resultats;
}

async function chargerFonctions(): Promise<FicheFonctions[]> {
  const fichier = path.resolve(process.cwd(), "scripts/social/donnees/fonctions-deputes.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  if (!brut) {
    console.warn("  ⚠️ fonctions-deputes.json absent : ni salaire ni vis-à-vis. Lancez scripts/social/fonctions-deputes.ts.");
    return [];
  }
  return (JSON.parse(brut) as { deputes: FicheFonctions[] }).deputes;
}

/** Distance d'édition (Levenshtein), pour tolérer une coquille de graphie. */
function distance(a: string, b: string): number {
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) {
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cour;
  }
  return prec[b.length];
}

/** Détecte les lignes d'en-tête du verso qui passent sur deux rangs. Chaque
 *  ligne de l'en-tête est pensée pour tenir sur un seul : un retour y ajoute
 *  une ligne à tout le verso. Compte les rangées DISTINCTES du texte, avec
 *  12 px de tolérance : le pictogramme d'enjeu ne s'aligne pas au pixel près
 *  sur le texte qui le suit. Pas de fonction imbriquée (cf. ajusterVerso). */
function mesurerRetours(): string[] {
  const coupees: string[] = [];
  const els = document.querySelectorAll<HTMLElement>(".identite, .chef, .vitaux, .pied span, .credit span");
  for (let i = 0; i < els.length; i++) {
    const r = document.createRange();
    r.selectNodeContents(els[i]);
    const rects = r.getClientRects();
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < rects.length; j++) {
      if (rects[j].height === 0) continue;
      if (rects[j].top < min) min = rects[j].top;
      if (rects[j].top > max) max = rects[j].top;
    }
    if (max - min > 12) coupees.push((els[i].textContent || "").trim().slice(0, 60));
  }
  // La rémunération est en nowrap : elle ne peut pas passer à la ligne, mais
  // elle peut déborder sur le côté. Montant et légende n'ont pas la même
  // hauteur : le test par rangées y verrait à tort deux lignes.
  // Un intitulé de fonction rapetissé par ajusterFonctions est signalé : la
  // règle d'abréviation (titreCourt) doit le résoudre, pas la taille du texte.
  const legendes = document.querySelectorAll<HTMLElement>(".legende-parcours .ft");
  for (let i = 0; i < legendes.length; i++) {
    if (legendes[i].style.fontSize) coupees.push(`rapetissé à ${legendes[i].style.fontSize} : ${(legendes[i].textContent || "").trim().slice(0, 60)}`);
  }
  const remu = document.querySelectorAll<HTMLElement>(".paie");
  for (let i = 0; i < remu.length; i++) {
    if (remu[i].scrollWidth > remu[i].clientWidth + 1) coupees.push((remu[i].textContent || "").trim().slice(0, 60));
  }
  return coupees;
}

/** Les trois fenêtres de la fiche, dans l'ordre où le site les présente. Les
 *  LIBELLÉS ne sont pas écrits ici : ils viennent de `tabLabel`, comme sur le
 *  site. Un premier jet nommait `last_pdq` « dernière période de questions » —
 *  c'est faux, le site dit « Dernière journée de débats », et une journée de
 *  débats ne se réduit pas à la période de questions. Inventer un vocabulaire
 *  parallèle sur un carton qu'un élu peut brandir est le meilleur moyen de se
 *  faire corriger en public. */
const PERIODES: PeriodKey[] = ["last_pdq", "session", "legislature"];
/** Lignes du tableau du verso : la LÉGISLATURE seule. Ce sont des cartes de
 *  législature ; la session et la dernière séance appartiennent aux éditions
 *  de session, en ligne (décision de Jules, 22-09). */
const ORDRE_FICHE: PeriodKey[] = ["legislature"];

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

const W = 1071;
const H = 1496;

/** Fenêtre conservée par la grille du profil Instagram (carré centré). */
const COEUR = { top: Math.round((H - W) / 2), bottom: Math.round((H + W) / 2) };

/** Le carton. Marge généreuse — un liseré fin se lirait comme l'encadré que
 *  GABARIT.md proscrit ; une vraie bordure de carte, elle, se lit comme le
 *  carton qu'elle imite. */
const MARGE = 46;
const PANNEAU = { x: MARGE, y: MARGE, w: W - MARGE * 2, bas: H - 120 };
const BANDE = 196;
const PHOTO_H = PANNEAU.bas - BANDE - PANNEAU.y;

type Carte = {
  slug: string;
  deputy: DeputyRow;
  parti: string;
  cle: PartyKey | "ind";
  couleur: string;
  /** Rang du SIÈGE dans le jeu COMPLET, calculé avant tout filtre : une carte
   *  garde son numéro qu'on tire la série entière ou un seul élu. */
  numero: number;
  /** « A », « B »… pour un député remplacé en cours de législature, qui partage
   *  le numéro de son siège ; vide pour l'élu en poste. */
  variante: string;
  /** Nombre de sièges, pas de cartes. */
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
  /** Résultat du scrutin qui lui a donné son siège (générale de 2022 ou
   *  partielle), tiré des données ouvertes d'Élections Québec. */
  scrutin?: { pourcentage: number; avance: number };
  /** « Chef du Parti québécois », le cas échéant. `eclat` réserve un traitement
   *  plus marqué à la seule distinction qui dépasse la direction d'un parti. */
  chef?: Titre;
  /** Député remplacé en cours de législature (carte à lettre) : pourquoi et
   *  quand il a quitté le siège, et qui l'occupe désormais. Verso seulement. */
  depart?: { titre: string; successeur: string };
  /** Somme touchée pendant la législature (base + fonction la mieux payée, jour
   *  par jour), tirée de scripts/social/donnees/fonctions-deputes.json. */
  remuneration?: number;
  /** La même, ramenée à une année de mandat. */
  remunerationMoyenne?: number;
  /** Frise du mandat : segments (position g et largeur w en % de l'axe,
   *  trame o), périodes hors mandat, légende. */
  parcours?: {
    segments: { g: number; w: number; o: number }[];
    horsMandat: { g: number; w: number }[];
    legende: { titre: string; annees: string; o: number }[];
  };
  /** Vis-à-vis ministre / porte-parole. Pas imprimé : sert à la rareté. */
  rarete?: Rarete;
  /** « PM », « M », « CO »… (voir CODES_FONCTION). */
  codeFonction?: string;
  /** Version holographique de la carte (fichiers « -holo »). */
  holo?: boolean;
  visAVis?: string;
  /** « 43e législature · 2022-2026 » ; pied du recto et du verso. */
  edition: string;
};

const DATE_FR = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

/** Libellé d'une ligne du tableau : le type de période, en petites capitales,
 *  et SA DATE. « Cette session » ne disait rien au lecteur d'une carte qu'on
 *  garde : on écrit « Session · 5 mai – 12 juin 2026 » (demande de Jules, 22-09). */
type Etiquette = { type: string; date: string };

const JOUR_MOIS = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", timeZone: "UTC" });

function plageFr(debut: string, fin: string): string {
  const d = new Date(`${debut}T12:00:00Z`);
  const a = new Date(`${fin}T12:00:00Z`);
  if (debut === fin) return DATE_FR.format(a);
  if (debut.slice(0, 4) !== fin.slice(0, 4)) return `${debut.slice(0, 4)}-${fin.slice(0, 4)}`;
  return `${JOUR_MOIS.format(d)} – ${DATE_FR.format(a)}`;
}

/** Bornes de chaque période, lues dans le fichier agrégé par parti : toutes
 *  ses lignes d'une même période portent les mêmes dates. */
async function etiquettesPeriodes(): Promise<Record<PeriodKey, Etiquette>> {
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

function periodeHTML(e: Etiquette): string {
  return `<span class="per-type">${txt(e.type)}</span><span class="per-date">${txt(e.date)}</span>`;
}

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
  const nomParti = c.cle === "ind" ? c.parti : PARTY_FULL_NAMES[c.cle];
  const dernier = (c.deputy.affiliationHistory ?? []).at(-1);
  // « Sans affiliation à un parti », libellé officiel, faisait passer la ligne
  // sur deux rangs avec la mention « (élu CAQ) ».
  const courant = /^sans affiliation/i.test(dernier?.label ?? "") ? "Indépendant" : dernier?.label;
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

/** Allégeance actuelle à privilégier lorsqu'une même personne occupe plusieurs
 * lignes de la vue « législature ». La carte représente l'élu.e aujourd'hui,
 * tandis que son parcours antérieur demeure expliqué au verso. */
const PARTI_ACTUEL_PAR_SIEGE: Partial<Record<string, PartyKey>> = {
  "rimouski": "pcq", // Maïté Blanchette Vézina, désormais au PCQ.
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

/** Séparation quadrichromique d'époque. Les quatre encres sont tramées à des
 * angles distincts et se multiplient sur le papier pour former la rosette
 * visible sur la référence Bowman agrandie. */
//
// CACHE SUR DISQUE — la trame compte ~1,8 million de points par portrait ; la
// recalculer à chaque tirage coûtait un quart d'heure pour la série, et ses
// PNG intégrés en base64 dans les 258 pages saturaient la mémoire (4 Go). Le
// fichier est nommé d'après une empreinte de la photo source ET de
// TRAME_VERSION : une photo changée ou un réglage de trame modifié produit un
// autre nom, donc une nouvelle trame. ⚠️ Toute retouche de l'algorithme
// ci-dessous DOIT incrémenter TRAME_VERSION, sinon l'ancienne trame resservira.
// La fonction renvoie une URL file:// : les pages sont ouvertes depuis le
// disque (cf. rendre()), pas injectées, sans quoi Chromium refuse l'image.
const TRAME_VERSION = "1";
const CACHE_TRAMES = path.resolve(process.cwd(), "social-out/.cache-trames");
const cacheBaseball = new Map<string, string | null>();
async function baseballURI(deputy: DeputyRow): Promise<string | null> {
  const asset = deputy.portrait?.match(/\/images\/deputes\/cartes\/web\/(.+)\.jpg$/)?.[1];
  if (!asset) return null;
  if (cacheBaseball.has(asset)) return cacheBaseball.get(asset) ?? null;
  const source = path.resolve(process.cwd(), "public/images/deputes", `${asset}.jpg`);
  const octets = await fs.readFile(source).catch(() => null);
  if (!octets) { cacheBaseball.set(asset, null); return null; }
  const cle = createHash("sha256").update(octets).update(TRAME_VERSION).digest("hex").slice(0, 12);
  const fichier = path.join(CACHE_TRAMES, `${asset}-${cle}.png`);
  const url = pathToFileURL(fichier).href;
  if (await fs.access(fichier).then(() => true, () => false)) {
    cacheBaseball.set(asset, url);
    return url;
  }
  const sharp = (await import("sharp")).default;
  const prepared = await sharp(octets)
    .resize(1500, 2000, { fit: "cover", position: "centre", kernel: "lanczos3" })
    .modulate({ brightness: 1.03, saturation: 1.7 })
    .linear(1.24, -30)
    .sharpen({ sigma: 0.8, m1: 0.65, m2: 0.35 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!prepared) {
    cacheBaseball.set(asset, null);
    return null;
  }
  const { data, info } = prepared;
  const cell = 4;
  const cx = info.width / 2; const cy = info.height / 2;
  const channels = [
    { angle: 15, fill: "#00CBE6", gain: 1.04, protectHighlights: true, value: (r: number) => 1 - r / 255 },
    { angle: 75, fill: "#FF2F75", gain: 1.04, protectHighlights: true, value: (_r: number, g: number) => 1 - g / 255 },
    { angle: 0,  fill: "#FFD900", gain: 1.04, protectHighlights: true, value: (_r: number, _g: number, b: number) => 1 - b / 255 },
    { angle: 45, fill: "#171412", gain: 0.7, protectHighlights: true, value: (r: number, g: number, b: number) => 1 - Math.max(r, g, b) / 255 },
  ];
  const groups: string[] = [];
  const margin = 480;
  for (const ch of channels) {
    const rad = ch.angle * Math.PI / 180;
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    const dots: string[] = [];
    for (let v = -margin; v < info.height + margin; v += cell) {
      for (let u = -margin; u < info.width + margin; u += cell) {
        const x = Math.round(cx + (u - cx) * cos - (v - cy) * sin);
        const y = Math.round(cy + (u - cx) * sin + (v - cy) * cos);
        if (x < 0 || x >= info.width || y < 0 || y >= info.height) continue;
        const i = (y * info.width + x) * 3;
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
        let coverage = Math.max(0, Math.min(1, ch.value(r, g, b)));
        if (ch.protectHighlights) {
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          const protection = luminance > 0.55 ? ((luminance - 0.55) / 0.45) * 0.7 : 0;
          coverage *= 1 - Math.min(0.7, protection);
        }
        const radius = (cell / 2) * Math.sqrt(coverage) * ch.gain;
        if (radius > 0.18) dots.push(`<circle cx="${u}" cy="${v}" r="${radius.toFixed(2)}"/>`);
      }
    }
    groups.push(`<g fill="${ch.fill}" style="mix-blend-mode:multiply" transform="rotate(${ch.angle} ${cx} ${cy})">${dots.join("")}</g>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><rect width="100%" height="100%" fill="#FAF7EF"/>${groups.join("")}</svg>`;
  const buf = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer().catch(() => null);
  if (!buf) { cacheBaseball.set(asset, null); return null; }
  await fs.mkdir(path.dirname(fichier), { recursive: true }); // « historique/16777 »
  await fs.writeFile(fichier, buf);
  cacheBaseball.set(asset, url);
  return url;
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
const cacheEcusson = new Map<Carte["cle"], string | null>();
async function ecussonURI(cle: Carte["cle"]): Promise<string | null> {
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
/** Un intitulé de fonction tient sur UNE ligne : trop long (« Ministre
 *  responsable de l'Accès à l'information et de la Protection des
 *  renseignements personnels »), il rapetisse jusqu'à 15 px plutôt que d'être
 *  coupé. Pas de fonction imbriquée (cf. ajusterVerso). */
function ajusterFonctions(): void {
  const els = document.querySelectorAll<HTMLElement>(".legende-parcours .ft");
  for (let i = 0; i < els.length; i++) {
    let taille = parseFloat(getComputedStyle(els[i]).fontSize);
    while (els[i].scrollWidth > els[i].clientWidth && taille > 15) {
      taille -= 1;
      els[i].style.fontSize = `${taille}px`;
    }
  }
}

/** Ligne d'identité sur deux rangs → le parti passe au sigle. Même mesure que
 *  mesurerRetours (rangées distinctes, 12 px de tolérance). Pas de fonction
 *  imbriquée (cf. ajusterVerso). */
function ajusterIdentite(): void {
  const ligne = document.querySelector<HTMLElement>(".identite");
  const long = document.querySelector<HTMLElement>(".parti-long");
  const court = document.querySelector<HTMLElement>(".parti-court");
  if (!ligne || !long || !court) return;
  const r = document.createRange();
  r.selectNodeContents(ligne);
  const rects = r.getClientRects();
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rects.length; j++) {
    if (rects[j].height === 0) continue;
    if (rects[j].top < min) min = rects[j].top;
    if (rects[j].top > max) max = rects[j].top;
  }
  if (max - min > 12) { long.style.display = "none"; court.style.display = "inline"; }
}

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
  // Le HAUT aussi : un verso trop chargé rognait le nom en tête (22-09) sans
  // que ce contrôle, qui ne regardait que le bas, le signale. Le médaillon du
  // portrait (.rond) dépasse exprès du coin : il est exclu.
  const cadre = panneau.getBoundingClientRect();
  let plusBas = 0;
  let plusHaut = Infinity;
  const tous = panneau.querySelectorAll<HTMLElement>("*");
  for (let i = 0; i < tous.length; i++) {
    if (tous[i].closest(".rond")) continue;
    const r = tous[i].getBoundingClientRect();
    if (r.height > 0 && r.bottom > plusBas) plusBas = r.bottom;
    if (r.height > 0 && r.top < plusHaut) plusHaut = r.top;
  }
  return Math.max(0, Math.round(plusBas - cadre.bottom), Math.round(cadre.top - plusHaut));
}

/** Résorbe un débordement du verso, par CONCESSIONS SUCCESSIVES et mesurées.
 *
 *  La hauteur du dos varie avec des textes qu'on ne choisit pas : un nom sur
 *  deux lignes, une citation plus longue, un libellé de période qui se casse.
 *  Resserrer la maquette au jugé pour le cas du jour ne fait que déplacer le
 *  problème au suivant — sur 128 cartes il y aura toujours un suivant.
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
  logoCapp: string | null,
): string {
  const d = c.deputy;
  const parti = c.couleur;
  const enjeu = d.topIssueColor ?? COLORS.soft;
  const cadrePath = cheminCadre(c.rarete ?? "commune", Boolean(ecusson));

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;background:${COLORS.paper};color:${COLORS.ink};
       font-family:"Source Serif 4",serif;position:relative;overflow:hidden}

  /* LE PANNEAU — photo + bandeau. Découpé au clip-path pour réserver le coin
     supérieur droit à l'écusson de parti sur le carton nu, exactement comme sur
     la carte Tim Kerr O-Pee-Chee 1985. */
  .panneau{position:absolute;left:${PANNEAU.x}px;top:${PANNEAU.y}px;
           width:${PANNEAU.w}px;height:${PANNEAU.bas - PANNEAU.y}px;
           clip-path:path('${cadrePath}');overflow:hidden;background:${COLORS.paper}}

  /* LE CADRE — filet d'encre qui cerne exactement le contour du panneau. */
  .cadre{position:absolute;left:${PANNEAU.x}px;top:${PANNEAU.y}px;
         width:${PANNEAU.w}px;height:${PANNEAU.bas - PANNEAU.y}px;
         pointer-events:none;overflow:visible}

  /* LA PHOTO — rosette quadrichromique : cyan 15°, magenta 75°, jaune 0° et
     noir 45°. Les points varient avec la charge de chaque encre et leurs
     superpositions reconstruisent la couleur, exactement comme sur le détail
     de la carte Bowman fourni en référence. */
  .photo{position:relative;height:${PHOTO_H}px;background:${COLORS.paper};overflow:hidden}
  .photo .image{position:absolute;inset:0;background-image:url("${portrait ?? ""}");
                background-size:cover;background-position:center 16%}
  .photo .vide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.18}

  /* L'enjeu prend maintenant la place de l'ancien écusson, à côté du nom.
     Le carré net reprend les petites cases de position des cartes sportives. */
  /* LE CODE DE FONCTION remplace le carré de l'enjeu (22-09) : PM, M, CO…
     la fonction la mieux payée de la législature, à l'encre du parti. */
  .code-fonction{flex:0 0 auto;width:118px;height:118px;background:${COLORS.paper};color:${parti};
                 display:flex;align-items:center;justify-content:center;
                 font-family:"Oswald",sans-serif;font-weight:700;font-size:60px;letter-spacing:.02em;line-height:1}
  .code-fonction.long{font-size:44px}

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

  /* Comme le logo d'équipe sur la carte Tim Kerr : l'écusson du parti occupe
     la réserve de carton dans le coin supérieur droit, découpée en courbe. */
  .ecusson-haut{position:absolute;left:${PANNEAU.x + 793}px;top:${PANNEAU.y + 23}px;
                 width:142px;height:108px;display:block}
  .ecusson-haut i{display:block;width:100%;height:100%;background:${parti};
                  -webkit-mask-size:contain;mask-size:contain;
                  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                  -webkit-mask-position:center;mask-position:center}
  /* Signature discrète, tout au bas du carton, CENTRÉE ; même place au verso. */
  .marque-capp{position:absolute;left:50%;transform:translateX(-50%);bottom:2px;display:block}
  .marque-capp i{display:block;width:112px;height:35px;background:${COLORS.softer};
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
  /* LE RUBAN DE CHEF — la seule distinction de la série. À gauche, en vis-à-vis
     de la plaque de marque, pour que le haut de la photo reste équilibré. */
  /* LE BANDEAU — aplat à la couleur du parti, le nom dessus. Le filet du haut
     porte la couleur SECONDAIRE, celle de l'enjeu dominant, sans filet d'encre
     au-dessus (retiré le 22-09). */
  /* L'ENJEU DOMINANT NE S'ÉCRIT PLUS (demande de Jules, 22-09) : il se donne
     par la COULEUR, en bandeau épais au sommet de la bande du nom.
     ⚠️ Écart assumé à GABARIT.md, qui arrête « Enjeux = couleur ET
     pictogramme, jamais une couleur seule, sans légende ». Le verso, lui,
     nomme l'enjeu et porte son pictogramme : la légende existe, elle est au
     dos. À valider. */
  .bande{position:absolute;left:0;right:0;bottom:0;height:${BANDE}px;background:${parti};
         box-shadow:inset 0 22px 0 ${enjeu};
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
  .ord{text-transform:none;font-size:.62em;vertical-align:.5em;line-height:0}
  .pied{position:absolute;left:${MARGE + 4}px;right:${MARGE + 4}px;top:${PANNEAU.bas + 26}px;
        display:flex;align-items:baseline;justify-content:space-between;gap:24px;
        font-family:"IBM Plex Mono",monospace;font-size:23px;letter-spacing:.08em;
        text-transform:uppercase;color:${COLORS.softer}}
  /* LE GRAIN — un carton imprimé n'a pas de surface parfaitement unie, et
     c'est cette uniformité qui trahit une image de synthèse. */
  /* Voir le verso : dimensions EXPLICITES (un <svg> sans width/height garde sa
     taille intrinsèque de 300 × 150) et AUCUN mix-blend-mode (aucune fusion ne
     rend dans ce Chrome). Le grain du recto souffrait des deux. */
  .grain,.mouchete{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none}
  .grain{opacity:.22}
  .mouchete{opacity:.18}
${CSS_HOLO}
</style></head><body>
  <div class="panneau">
    <div class="photo">
      ${portrait
        ? `<div class="image"></div>`
        : `<div class="vide">${fleur(parti, 300)}</div>`}
    </div>
    <div class="bande">
      <div class="qui">
        <p class="nom">${txt(d.name)}</p>
        ${d.circonscription ? `<p class="sous">${txt(d.circonscription)}</p>` : ""}
      </div>
      ${c.codeFonction ? `<span class="code-fonction${c.codeFonction.length > 2 ? " long" : ""}">${c.codeFonction}</span>` : ""}
    </div>
  </div>

  <svg class="cadre" viewBox="0 0 ${PANNEAU.w} ${PANNEAU.bas - PANNEAU.y}" aria-hidden="true">
    ${cadreRarete(c.rarete ?? "commune", Boolean(ecusson), parti)}
  </svg>

  ${/* Plus de fleur de lys ici (Jules, 22-09) : accolée au nom de l'Assemblée,
        elle se lisait comme un emblème officiel et laissait croire que la
        carte émane de l'institution. */ ""}
  <span class="medaillon"><i>${c.numero}${c.variante}</i></span>
  ${ecusson ? `<span class="ecusson-haut">
    <i style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></i>
  </span>` : ""}
  ${logoCapp ? `<span class="marque-capp"><i style="-webkit-mask-image:url('${logoCapp}');mask-image:url('${logoCapp}')"></i></span>` : ""}
  ${/* Plus de ruban au recto (22-09) : le titre est au verso. */ ""}

  <p class="pied">
    <span>${ordinal(txt(c.edition.split(" · ")[0]))}</span>
    <span>vitrinedemocratique.com</span>
  </p>

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
  libelles: Record<PeriodKey, Etiquette>,
  portrait: string | null,
  ecusson: string | null,
  logoVitrine: string | null,
  logoCapp: string | null,
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
  // Le parti existe en deux formes : le nom complet, et le sigle que
  // ajusterIdentite n'affiche QUE si la ligne passait sur deux rangs
  // (« Charlevoix–Côte-de-Beaupré · Coalition avenir Québec »).
  const identite = [d.topIssueLabel, d.circonscription].filter(Boolean).join("   ·   ");
  const partiLong = ligneParti(c);
  const partiCourt = partiLong === (c.cle === "ind" ? c.parti : PARTY_FULL_NAMES[c.cle]) ? c.parti : partiLong;
  const picto = d.topIssueKey
    ? `<span class="glyphe">${enjeuGlyph(d.topIssueKey, "#fff", 26)}</span>` : "";

  // Vitaux du carton — « Ht: 6'0"  Wt: 178  Born: 5-12-56 ». Les nôtres
  // viennent d'affiliationHistory : date d'élection, et bascule d'allégeance
  // quand il y en a une.
  const parcours = d.affiliationHistory ?? [];
  // Carte à lettre : la mention du successeur prend la place du changement
  // d'allégeance, que la ligne de parti (« Indépendant (élu CAQ) ») dit déjà —
  // trois mentions ne tiendraient pas sur la ligne.
  // Deux lignes au plus, chacune d'un seul tenant : l'élection et son résultat,
  // puis, s'il y a lieu, le départ ou le changement d'allégeance. Réunies sur un
  // même rang, elles passaient à la ligne (6 cartes sur 20 au 22-09).
  const [vitaux, parcoursLigne] = [
    c.mandat
      ? c.scrutin
        ? `${c.mandat} avec ${POURCENT.format(c.scrutin.pourcentage)}\u00a0% des voix (${MONTANT.format(c.scrutin.avance)} voix d'avance)`
        : c.mandat
      : "",
    c.depart ? c.depart.successeur
      : parcours.length > 1 && dateFr(parcours.at(-1)?.startDate)
        ? `Changement d'allégeance le ${dateFr(parcours.at(-1)?.startDate)}` : "",
  ];

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

  const lignes = ORDRE_FICHE.map((cle) => {
    const r = fiche[cle];
    const libelle = libelles[cle];
    if (!r) {
      return `<tr class="vide${cle === "legislature" ? "" : " secondaire"}"><th>${periodeHTML(libelle)}</th><td colspan="4">aucune intervention</td></tr>`;
    }
    const pct = toneScalePct(r.toneScore, maxAbs[cle]);
    const couleurTon = r.toneScore >= 0 ? TONE.positive : TONE.negative;
    return `
      <tr class="${cle === "legislature" ? "pivot" : "secondaire"}">
        <th>${periodeHTML(libelle)}</th>
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
           overflow:hidden;display:flex;flex-direction:column;gap:16px}

  /* EN-TÊTE sur le carton : le grand portrait part du coin supérieur droit et
     le remplit. Le nom lui réserve sa largeur au lieu de passer dessous. */
  /* flex:0 0 auto — l'en-tête ne se COMPRIME jamais. Compressible, il
     s'écrasait dès que le verso débordait, et son contenu centré sortait par
     le haut (nom rogné) et par le bas (ligne cachée sous la fiche). Le surplus
     va désormais au bas du panneau, que ajusterVerso sait résorber. */
  .haut{flex:0 0 auto;display:flex;align-items:center;gap:24px;padding:2px 190px 16px 0;min-height:166px}
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
  .parti-court{display:none}
  .rond{position:absolute;right:-42px;top:-42px;width:232px;height:232px;border-radius:50%;
        border:8px solid ${COLORS.paper};background:${COLORS.paper};overflow:hidden}
  .rond .image{position:absolute;inset:0;background-image:url("${portrait ?? ""}");
               background-size:cover;background-position:center 12%}

  /* DEUX PANNEAUX, comme au dos du Federko 1978 : la fiche, puis la signature,
     séparés par le carton nu. Un panneau unique laissait un grand vide au
     milieu, le mot étant poussé en bas ; deux blocs remplissent la carte et
     donnent au mot son propre cadre. */
  .bloc{background:${COLORS.paper};color:${parti};border-radius:40px;
        padding:26px 38px 24px;display:flex;flex-direction:column}
  .bloc.fiche{flex:0 0 auto}
  /* ÉCART CONSTANT entre les boîtes (gap du panneau) : c'est le mot
     signature, dernière boîte, qui prend l'espace restant et centre son
     contenu. Avec justify-content:space-between, l'écart variait d'une carte
     et d'une boîte à l'autre (Jules, 22-09). */
  .bloc.signe{flex:1 0 auto;justify-content:center;text-align:center;padding:26px 38px 28px}

  .losanges{text-align:center;font-size:15px;letter-spacing:.5em;opacity:.42;margin:12px 0}
  .rubrique{font-family:"Oswald",sans-serif;font-weight:600;font-size:27px;letter-spacing:.14em;
            text-transform:uppercase;text-align:center}
  /* LA BARRE EMPILÉE et sa légende. */
  .bloc.parts{flex:0 0 auto;padding:22px 38px 24px}
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

  /* PARCOURS ET RÉMUNÉRATION — une frise 2022-2026 : chaque fonction est un
     aplat tramé de l'encre du parti, d'autant plus plein qu'elle est payée ;
     l'indemnité de base seule laisse la piste nue, et le temps hors mandat
     (partielle, démission) est hachuré. À droite, la rémunération qui en
     découle, lue comme le total d'un contrat. */
  .bloc.parcours{flex:0 0 auto;padding:22px 38px 22px}
  .grille-parcours{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:30px;align-items:center;margin-top:14px}
  .frise-piste{position:relative;height:30px;border:2px solid currentColor;border-radius:3px;overflow:hidden}
  .frise-piste i{position:absolute;top:0;bottom:0;background:${parti}}
  .frise-piste i.hors{background:repeating-linear-gradient(135deg,${parti} 0 2px,transparent 2px 9px);opacity:.35}
  .graduations{position:relative;height:22px;margin-top:5px;font-family:"Oswald",sans-serif;
               font-weight:500;font-size:17px;letter-spacing:.06em;opacity:.72}
  .graduations span{position:absolute;top:0;transform:translateX(-50%)}
  .graduations span::before{content:"";position:absolute;left:50%;top:-9px;height:6px;border-left:1.5px solid currentColor}
  .legende-parcours{list-style:none;margin-top:6px}
  .legende-parcours li{display:flex;align-items:center;gap:12px;padding:3px 0;font-size:21px;line-height:1.2}
  .legende-parcours .puce{position:relative;flex:0 0 auto;width:24px;height:15px;border:1.5px solid currentColor;border-radius:2px;overflow:hidden}
  .legende-parcours .puce i{position:absolute;inset:0;background:${parti}}
  .legende-parcours .ft{flex:1 1 auto;min-width:0;white-space:nowrap}
  .legende-parcours .fa{flex:0 0 auto;font-family:"Oswald",sans-serif;font-weight:600;font-size:19px;letter-spacing:.04em}
  /* Quatre ou cinq niveaux : la légende se resserre plutôt que d'en cacher. */
  .legende-parcours.dense li{padding:1px 0;font-size:19px}
  .legende-parcours.dense .fa{font-size:17px}
  .paie{display:flex;flex-direction:column;align-items:flex-end;text-align:right;
        border-left:1px solid currentColor;padding-left:28px;white-space:nowrap}
  .paie b{font-family:"Oswald",sans-serif;font-weight:700;font-size:46px;line-height:1}
  .paie b.moy{font-size:32px;margin-top:12px}
  .paie span{font-family:"Oswald",sans-serif;font-weight:500;font-size:16px;letter-spacing:.1em;
             text-transform:uppercase;opacity:.72;margin-top:4px}
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
           padding:15px 14px}
  tbody td{padding:15px 14px;text-align:right;font-size:33px;font-weight:700;
           font-family:"Oswald",sans-serif;border-left:1px solid currentColor}
  tbody tr+tr th,tbody tr+tr td{border-top:1px solid rgba(0,0,0,.14)}
  .per-type{display:block;font-family:"Oswald",sans-serif;font-weight:500;font-size:15px;
            letter-spacing:.1em;text-transform:uppercase;opacity:.72}
  .per-date{display:block;white-space:nowrap;font-size:22px;line-height:1.15;margin-top:1px}
  .pivot .per-date{font-family:"Oswald",sans-serif;font-weight:600;font-size:26px;letter-spacing:.04em}
  /* SESSION ET DERNIÈRE SÉANCE — lignes secondaires, plus petites : la
     législature résume le mandat, les deux autres la complètent. */
  .secondaire th,.secondaire td{padding-top:8px !important;padding-bottom:8px !important}
  .secondaire td{font-size:25px}
  .secondaire .points i{width:11px;height:11px}
  .secondaire.vide td{font-size:19px}
  .pivot th{font-family:"Oswald",sans-serif;font-weight:600;font-size:22px;letter-spacing:.08em;
            text-transform:uppercase}
  .pivot th,.pivot td{border-bottom:2px solid currentColor}
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
  .metho{padding-top:4px;font-size:17px;line-height:1.32;
         font-style:italic;opacity:.68;text-align:center}
  .pied .marque{width:168px;height:34px;background:${COLORS.paper};opacity:.92;
                -webkit-mask-size:contain;mask-size:contain;
                -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                -webkit-mask-position:left center;mask-position:left center}
  .pied .ecusson{width:46px;height:46px;background:${COLORS.paper};
                 -webkit-mask-size:contain;mask-size:contain;
                 -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                 -webkit-mask-position:center;mask-position:center}
  .ord{text-transform:none;font-size:.62em;vertical-align:.5em;line-height:0}
  /* Signature CAPP : même place qu'au recto, à l'encre du papier comme le crédit. */
  .marque-capp{position:absolute;left:50%;transform:translateX(-50%);bottom:2px;display:block}
  .marque-capp i{display:block;width:112px;height:35px;background:${COLORS.paper};opacity:.62;
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
${CSS_HOLO}
</style></head><body>
  <div class="panneau">
    <div class="haut">
      <span class="numero">${c.numero}${c.variante}</span>
      <span class="titre">
        <span class="nom">${txt(d.name)}</span>
        <span class="identite">${picto}<span>${txt(identite)}${identite ? "&nbsp;&nbsp; · &nbsp;&nbsp;" : ""}<span class="parti-long">${txt(partiLong)}</span><span class="parti-court">${txt(partiCourt)}</span></span></span>
        ${c.chef ? `<span class="chef${c.chef.eclat ? " eclat" : ""}">${c.chef.eclat ? "&#9733; " : ""}${txt(c.chef.titre)}</span>`
          : c.depart ? `<span class="chef">${txt(c.depart.titre)}</span>` : ""}
        ${vitaux ? `<span class="vitaux">${txt(vitaux)}</span>` : ""}
        ${parcoursLigne ? `<span class="vitaux">${txt(parcoursLigne)}</span>` : ""}
      </span>
    </div>

    <div class="bloc fiche">
      <p class="rubrique">Fiche à l'Assemblée &middot; ${txt(c.salon)}</p>
      ${losanges}
      <table>
        <colgroup><col style="width:30%"><col style="width:16%"><col style="width:19%"><col style="width:16%"><col style="width:19%"></colgroup>
        <thead><tr>
          <th>Période</th><th>Inter-<br>ventions</th><th>Mots<br>prononcés</th><th>Richesse<br>lexicale</th><th>Ton des<br>interventions</th>
        </tr></thead>
        <tbody>${lignes}</tbody>
      </table>
    </div>

    ${c.parcours && c.remuneration ? `
    <div class="bloc parcours">
      <p class="rubrique">Parcours et rémunération</p>
      <div class="grille-parcours">
        <div class="frise">
          <div class="frise-piste">
            ${c.parcours.horsMandat.map((h) => `<i class="hors" style="left:${h.g}%;width:${h.w}%"></i>`).join("")}
            ${c.parcours.segments.map((s) => `<i style="left:${s.g}%;width:${s.w}%;opacity:${s.o}"></i>`).join("")}
          </div>
          <div class="graduations">${[2023, 2024, 2025, 2026].map((a) => `<span style="left:${positionAxe(`${a}-01-01`)}%">${a}</span>`).join("")}</div>
          <ul class="legende-parcours${c.parcours.legende.length > 3 ? " dense" : ""}">${c.parcours.legende.map((l) => `
            <li><span class="puce"><i style="opacity:${l.o}"></i></span><span class="ft">${ordinal(txt(l.titre))}</span><span class="fa">${l.annees}</span></li>`).join("")}
          </ul>
        </div>
        <div class="paie">
          <b>${MONTANT.format(c.remuneration)}&nbsp;$</b>
          <span>sur la législature</span>
          ${c.remunerationMoyenne ? `<b class="moy">${MONTANT.format(c.remunerationMoyenne)}&nbsp;$</b><span>par année</span>` : ""}
        </div>
      </div>
    </div>` : ""}

    ${barre ? `
    <div class="bloc parts">
      <p class="rubrique">Part de ses interventions</p>
      ${barre}
    </div>` : ""}

    <div class="bloc signe">
      <p class="rubrique">Mot signature</p>
      ${mot
        ? `<p class="mot">${txt(mot)}</p>
           ${citation ? `<p class="citation">«&nbsp;${txt(citation)}&nbsp;»</p>` : ""}`
        : `<p class="absent">${ABSENCE}</p>`}
    </div>

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
      Terres publiques et Aff.&nbsp;internationales, en révision, sont exclus des parts.
      Mesures produites par traitement automatisé (validé à la main)&nbsp;: des erreurs d'appariement ou de classement restent possibles.
      Signalez-nous toute correction. Méthodologie complète sur le site.
    </p>

    <p class="pied">
      ${/* Une fleur de lys ici doublonnait avec l'écusson du parti : le logo
            NOIR de la CAQ est une fleur de lys, celui du PCQ en porte une —
            plus de la moitié des 128 cartes affichaient donc deux fois le même
            dessin, ce qui se lit comme une erreur de montage. */ ""}
      ${logoVitrine
        ? `<span class="marque" style="-webkit-mask-image:url('${logoVitrine}');mask-image:url('${logoVitrine}')"></span>`
        : `<span>${fleur(COLORS.paper, 26)}</span>`}
      <span>vitrinedemocratique.com</span>
      ${ecusson ? `<span class="ecusson" style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></span>` : `<span></span>`}
    </p>
  </div>

  <span class="rond">${portrait ? `<span class="image"></span>` : fleur(parti, 100)}</span>

  <p class="credit">
    <span>Portrait&nbsp;: Assemblée nationale du Québec &middot; usage non commercial autorisé</span>
    <span>${c.holo ? "Édition holographique" : ordinal(txt(c.edition))} &middot; carte ${c.numero}${c.variante} de ${c.total}</span>
  </p>
  ${logoCapp ? `<span class="marque-capp"><i style="-webkit-mask-image:url('${logoCapp}');mask-image:url('${logoCapp}')"></i></span>` : ""}
  <svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>
${c.holo ? '<div class="holo"></div><div class="holo-reflet"></div>' : ""}
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
  <h1>Cartes de député · ${slugs.filter((x) => !x.endsWith("-verso") && !x.endsWith("-holo")).length} cartes recto-verso${slugs.some((x) => x.endsWith("-holo-verso")) ? " (+ versos holo)" : ""} · ${txt(periodeLabel)}</h1>
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
  // ENJEUX EN RÉVISION — retirés des cartes, leur part répartie entre les
  // autres. Les têtes INFER public_lands et defense, calibrées sur la presse,
  // se déclenchent sur les formules de procédure du Salon bleu (« Il n'y a pas
  // de consentement. ») : Terres sortait enjeu dominant de 58 élus sur 129.
  // Le site n'est pas touché ; à retirer quand le raffineur sera recalibré.
  for (const p of Object.values(data.periods)) {
    for (const d of [...(p?.rows.flatMap((r) => r.deputies ?? []) ?? []), ...(p?.independants ?? [])]) {
      d.enjeuStack = buildEnjeuStack(d.issueShares, ENJEUX_EN_REVISION);
      const top = d.enjeuStack.find((s) => !s.isReste);
      d.topIssueLabel = top?.label;
      d.topIssueKey = top?.cle ?? undefined;
      d.topIssueColor = top?.color;
    }
  }
  const vue = data.periods[periode];
  if (!vue) throw new Error(`Période inconnue : ${periode} (legislature, session ou last_pdq).`);

  // LE JEU COMPLET D'ABORD, la sélection ensuite. Le numéro de carte doit être
  // celui de la série entière : tiré après un filtre, « --only tanguay »
  // donnerait la carte n° 1 sur 1, ce qui ne veut rien dire sur un carton de
  // collection. On numérote donc les sièges dans l'ordre alphabétique des
  // circonscriptions, puis on filtre.
  const cartesPartis = vue.rows.flatMap((row) =>
    (row.deputies ?? []).map((deputy) => ({
      slug: slugCirco(deputy), deputy, parti: row.label, cle: row.key as Carte["cle"],
      couleur: PARTY_COLORS[row.key] ?? row.color,
    })));
  // Les indépendants n'ont pas de casier sur le site, mais leur siège a sa
  // carte : sans eux la série s'arrêtait à 124 (Saint-Jérôme manquait). Seuls
  // ceux dont le siège n'a AUCUNE autre carte entrent : un élu passé
  // indépendant en cours de route (La Prairie, Saint-Laurent…) a déjà la
  // sienne, sous son parti d'élection.
  const siegesPartis = new Set(cartesPartis.map((c) => cleDistrict(c.deputy.circonscription ?? c.slug)));
  const jeuBrut = cartesPartis.concat((vue.independants ?? [])
    .filter((deputy) => !siegesPartis.has(cleDistrict(deputy.circonscription ?? slugCirco(deputy))))
    .map((deputy) => ({
      slug: slugCirco(deputy), deputy, parti: "Indépendant", cle: "ind" as const, couleur: COULEUR_INDEPENDANT,
    })));
  const jeu = jeuBrut.filter((c) => {
    const partiActuel = PARTI_ACTUEL_PAR_SIEGE[c.slug];
    return !partiActuel || c.cle === partiActuel;
  });
  jeu.sort((a, b) => a.slug.localeCompare(b.slug, "fr"));

  // ANNÉE DE L'ÉDITION — heure de MONTRÉAL, comme tout ce qui porte une date
  // dans ce dépôt (règle dure : les horaires sont en heure locale, pas UTC).
  const annee = Number(typeof args.annee === "string"
    ? args.annee
    : new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", year: "numeric" }).format(new Date()));

  // UN NUMÉRO PAR SIÈGE, pas par élu. Les députés remplacés en cours de
  // législature (démission, partielle) partagent le numéro de leur
  // circonscription avec une lettre : Arthabaska est la 7, Boissonneault la 7,
  // Lefebvre la 7A. Numérotés à la suite, ces anciens élus prenaient les cartes
  // 1 à 4 (leur slug est un identifiant numérique) et gonflaient la série à 128.
  const siege = (c: (typeof jeu)[number]) => cleDistrict(c.deputy.circonscription ?? c.slug);
  const finMandat = (c: (typeof jeu)[number]) => c.deputy.affiliationHistory?.at(-1)?.endDate;
  const sieges = [...new Set(jeu.map(siege))].sort((a, b) => a.localeCompare(b, "fr"));
  const rangSiege = new Map(sieges.map((s, i) => [s, i + 1]));
  const variante = new Map<(typeof jeu)[number], string>();
  const depart = new Map<(typeof jeu)[number], NonNullable<Carte["depart"]>>();
  for (const s of sieges) {
    // L'élu en poste est celui dont le mandat finit le plus tard — ou pas du
    // tout. Pas « sans date de fin » : une défection vers le statut
    // d'indépendant (Orford, avril 2026) ferme le dernier segment publié alors
    // que l'élu siège toujours. Les anciens suivent, du plus récemment parti au
    // plus ancien : A, B…
    const occupants = jeu.filter((c) => siege(c) === s)
      .sort((a, b) => (finMandat(b) ?? "9999").localeCompare(finMandat(a) ?? "9999"));
    if (occupants.filter((c) => !finMandat(c)).length > 1) {
      console.warn(`  ⚠️ ${s} : plusieurs élus sans fin de mandat — vérifier la numérotation.`);
    }
    occupants.slice(1).forEach((c, i) => variante.set(c, String.fromCharCode(65 + i)));
    for (const c of occupants.slice(1)) {
      const fin = c.deputy.affiliationHistory?.at(-1);
      const quand = dateFr(fin?.endDate);
      depart.set(c, {
        titre: fin?.endReason === "resignation" ? `Démission le ${quand}`
          : fin?.endReason === "death" ? `Décès le ${quand}`
          : `A quitté son siège le ${quand}`,
        successeur: `Siège repris par ${occupants[0].deputy.name} (carte ${rangSiege.get(s)})`,
      });
    }
  }

  const mandats = await chargerMandats();
  let cartes: Carte[] = jeu.map((c) => ({
    ...c, numero: rangSiege.get(siege(c))!, variante: variante.get(c) ?? "",
    total: sieges.length, salon: vue.subtitle, annee,
    // Édition imprimée : la législature entière. Les éditions de session, en
    // ligne, portent leur année.
    edition: periode === "legislature" ? EDITION_LEGISLATURE : `Édition ${annee}`,
    mandat: ligneMandat(trouverMandat(mandats, c.deputy.name, c.slug)),
    chef: CHEFS[c.slug],
    depart: depart.get(c),
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

  // SALAIRE ET VIS-À-VIS. Appariement par nom : la fiche de l'Assemblée et le
  // portrait portent la même graphie. Les anciens députés (cartes à lettre)
  // n'ont pas de fiche courante, donc ni l'un ni l'autre.
  const fonctions = await chargerFonctions();
  // « Brigitte B. Garceau » (Assemblée) = « Brigitte Garceau » (portrait) : on
  // compare prénom + nom de famille, sans les initiales. Le référentiel des
  // portraits porte aussi des coquilles (« Jolin-Barette ») : à défaut
  // d'égalité, un seul candidat à deux lettres près est accepté.
  const cleNom = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(^|\s)\p{Lu}\.(?=\s|$)/gu, " ").toLowerCase().replace(/[^a-z]/g, "");
  const cleFiche = (f: FicheFonctions) => cleNom(f.nom_famille && f.prenom ? `${f.prenom} ${f.nom_famille}` : f.nom);
  const ficheDe = (nom: string, circo?: string): FicheFonctions | undefined => {
    // La circonscription d'abord : elle départage les deux « Eric Girard ».
    if (circo) {
      const ici = fonctions.filter((f) => f.circonscription && cleDistrict(f.circonscription) === cleDistrict(circo));
      if (ici.length === 1 && distance(cleFiche(ici[0]), cleNom(nom)) <= 3) return ici[0];
    }
    const k = cleNom(nom);
    const exacte = fonctions.find((f) => cleFiche(f) === k);
    if (exacte) return exacte;
    const proches = fonctions.filter((f) => distance(cleFiche(f), k) <= 2);
    return proches.length === 1 ? proches[0] : undefined;
  };
  const ficheParCarte = new Map<Carte, FicheFonctions>();
  const sansFiche: string[] = [];
  for (const c of cartes) {
    const f = ficheDe(c.deputy.name, c.deputy.circonscription);
    if (f) ficheParCarte.set(c, f); else sansFiche.push(c.deputy.name);
  }
  const fichesVues = new Map<string, string>();
  for (const [c, f] of ficheParCarte) {
    const deja = fichesVues.get(f.assnat_id);
    if (deja) console.warn(`  ⚠️ ${deja} et ${c.deputy.name} pointent vers la même fiche (${f.nom}) : salaire faux pour l'un des deux.`);
    fichesVues.set(f.assnat_id, c.deputy.name);
  }
  if (sansFiche.length) console.warn(`  ⚠️ ${sansFiche.length} élu(s) sans fiche de fonctions : ${sansFiche.join(", ")}`);
  const partiDe = new Map([...ficheParCarte].map(([c, f]) => [f.assnat_id, c.cle]));
  const familleDe = new Map(fonctions.map((f) => [f.assnat_id, f.nom_famille ?? f.nom]));
  const ORDRE_OPPOSITION = ["plq", "qs", "pq", "pcq", "ind"];
  for (const [c, f] of ficheParCarte) {
    c.remuneration = f.total_legislature ?? undefined;
    c.remunerationMoyenne = f.moyenne_annuelle ?? undefined;
    // PARCOURS — pour chaque jour du mandat, la fonction la mieux payée (c'est
    // elle qui fixe la rémunération : pas de cumul). Des jours consécutifs au
    // même taux forment un segment de la frise ; plusieurs portefeuilles tenus
    // en même temps restent UN segment (« Ministre (8 portefeuilles) »).
    const debutM = f.debut_mandat ?? AXE_DEBUT;
    const finM = f.fin_mandat ?? AXE_FIN;
    const tenues = (f.fonctions_legislature ?? []).filter((x) => !/^Ministre responsable de la région/.test(x.titre));
    const runs: { pct: number; titres: Set<string>; debut: string; fin: string }[] = [];
    for (let j = debutM; j <= finM; j = lendemain(j)) {
      let pct = 0;
      const titres = new Set<string>();
      for (const x of tenues) {
        if (x.debut > j || j > x.fin) continue;
        if (x.pct > pct) { pct = x.pct; titres.clear(); }
        if (x.pct === pct) titres.add(x.titre);
      }
      const dernier = runs.at(-1);
      if (dernier && dernier.pct === pct) { dernier.fin = j; for (const t of titres) dernier.titres.add(t); }
      else runs.push({ pct, titres, debut: j, fin: j });
    }
    // Légende : un niveau de rémunération par ligne, le mieux payé d'abord ;
    // l'indemnité de base seule en dernier.
    const niveaux = new Map<number, { titres: Set<string>; debut: string; fin: string }>();
    for (const r of runs) {
      const n = niveaux.get(r.pct);
      if (!n) niveaux.set(r.pct, { titres: new Set(r.titres), debut: r.debut, fin: r.fin });
      else { for (const t of r.titres) n.titres.add(t); if (r.fin > n.fin) n.fin = r.fin; }
    }
    const libelle = (pct: number, titres: Set<string>) => {
      if (pct === 0) return "Indemnité de base seulement";
      const liste = [...titres];
      if (liste.length === 1) return titreCourt(liste[0]);
      if (liste.every((t) => /^Ministre\b/.test(t))) return `Ministre (${liste.length} portefeuilles)`;
      return `${titreCourt(liste[0])} et ${liste.length - 1} autre${liste.length > 2 ? "s" : ""}`;
    };
    const annees = (d: string, a: string) => (d.slice(0, 4) === a.slice(0, 4) ? d.slice(0, 4) : `${d.slice(0, 4)}-${a.slice(0, 4)}`);
    const legende = [...niveaux].sort((a, b) => b[0] - a[0])
      .map(([pct, n]) => ({ titre: libelle(pct, n.titres), annees: annees(n.debut, n.fin), o: trame(pct) }));
    const horsMandat = [
      debutM > AXE_DEBUT ? { g: 0, w: positionAxe(debutM) } : null,
      finM < AXE_FIN ? { g: positionAxe(lendemain(finM)), w: 100 - positionAxe(lendemain(finM)) } : null,
    ].filter((x): x is { g: number; w: number } => x !== null);
    c.parcours = {
      segments: runs.filter((r) => r.pct > 0).map((r) => ({
        g: positionAxe(r.debut), w: positionAxe(lendemain(r.fin)) - positionAxe(r.debut), o: trame(r.pct),
      })),
      horsMandat,
      // TOUS les niveaux (cinq au plus, 12 élus sur 129 en ont quatre ou cinq) :
      // un « + N autres » cachait justement ce qu'on veut lire (Jules, 22-09).
      legende,
    };
    const vav = f.vis_a_vis ?? [];
    if (!vav.length) continue;
    if (f.porte_parole.length) {
      // Porte-parole : les deux ministres qu'il affronte sur le plus de dossiers.
      c.visAVis = vav.slice(0, 2).map((v) => v.nom).join(", ");
    } else {
      // Ministre : le porte-parole principal de chaque parti d'opposition.
      const unParParti = new Map<string, string>();
      for (const v of vav) {
        const p = partiDe.get(v.assnat_id);
        if (p && !unParParti.has(p)) unParParti.set(p, v.assnat_id);
      }
      c.visAVis = ORDRE_OPPOSITION.filter((p) => unParParti.has(p))
        .map((p) => `${familleDe.get(unParParti.get(p)!)} (${p.toUpperCase()})`).join(", ");
    }
  }

  // RARETÉ — calculée sur la série ENTIÈRE, avant tout filtre (--only), pour
  // qu'une carte tirée seule garde sa rareté.
  const rangs: { c: Carte; poids: number; camp: "gouvernement" | "opposition" }[] = [];
  for (const c of cartes) {
    const f = ficheParCarte.get(c);
    const tenues = f?.fonctions_legislature ?? [];
    const titres = tenues.map((x) => x.titre);
    if (titres.some((t) => /^Président(?:e)? de l’Assemblée nationale$/.test(t))) { c.rarete = "presidence"; continue; }
    if (titres.some((t) => /^Premi(?:ère|er) ministre$/.test(t))) { c.rarete = "legendaire"; continue; }
    if (titres.some((t) => /^Chef(?:fe)? d/.test(t))) { c.rarete = "rare"; continue; }
    const ministre = titres.some((t) => /^Ministre\b/.test(t));
    let poids = 0;
    for (let j = f?.debut_mandat ?? AXE_DEBUT; j <= (f?.fin_mandat ?? AXE_FIN); j = lendemain(j)) {
      let p = 0;
      for (const x of tenues) if (x.debut <= j && j <= x.fin && x.pct > p) p = x.pct;
      poids += p;
    }
    // Un jour d'affrontement comme porte-parole vaut 20 %·jour : l'ordre de
    // grandeur d'une fonction rémunérée, sans quoi les duels ne pèseraient rien.
    if (!ministre) poids += 20 * (f?.vis_a_vis_legislature ?? []).reduce((t, v) => t + v.jours, 0);
    rangs.push({ c, poids, camp: ministre || c.cle === "caq" ? "gouvernement" : "opposition" });
  }
  for (const camp of ["gouvernement", "opposition"] as const) {
    const g = rangs.filter((r) => r.camp === camp).sort((a, b) => b.poids - a.poids || a.c.numero - b.c.numero);
    let i = 0;
    for (const [rarete, part] of PROPORTIONS_RARETE) {
      const n = Math.round(part * g.length);
      for (let k = 0; k < n && i < g.length; k++) g[i++].c.rarete = rarete;
    }
    for (; i < g.length; i++) g[i].c.rarete = "commune";
  }
  for (const c of cartes) {
    const f = ficheParCarte.get(c);
    c.codeFonction = codeFonction(f?.fonctions_legislature ?? [], (f?.porte_parole_legislature?.length ?? 0) > 0);
  }
  const decompte = new Map<Rarete, number>();
  for (const c of cartes) decompte.set(c.rarete ?? "commune", (decompte.get(c.rarete ?? "commune") ?? 0) + 1);
  console.log(`  rareté : ${[...decompte].map(([r, n]) => `${LIBELLE_RARETE[r]} ${n}`).join(" · ")}`);

  // RÉSULTAT ÉLECTORAL. Le siège ET le nom de famille doivent concorder : à
  // Chicoutimi, Laforest (2022) et Laflamme (partielle de 2026) ont chacune le
  // leur. Plusieurs scrutins concordants : le plus récent l'emporte.
  const scrutins = await chargerScrutins();
  const sansScrutin: string[] = [];
  for (const c of cartes) {
    const siegeC = cleDistrict(c.deputy.circonscription ?? c.slug);
    const nomC = cleDistrict(c.deputy.name);
    const s = scrutins
      .filter((r) => {
        if (cleDistrict(r.circonscription) !== siegeC) return false;
        // À deux lettres près : le référentiel des portraits écrit « Jolin-Barette ».
        const fam = cleDistrict(r.nom_famille);
        return distance(nomC.slice(-fam.length), fam) <= 2;
      })
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (s) c.scrutin = { pourcentage: s.pourcentage, avance: s.avance };
    else sansScrutin.push(`${c.deputy.name} (${c.slug})`);
  }
  if (sansScrutin.length) console.warn(`  ⚠️ ${sansScrutin.length} élu(s) sans résultat électoral apparié : ${sansScrutin.join(", ")}`);

  const sansMandat = cartes.filter((c) => !c.mandat);
  if (sansMandat.length) {
    console.warn(`  ⚠️ ${sansMandat.length} carte(s) sans date d'élection appariée :`);
    for (const c of sansMandat) console.warn(`     · ${c.deputy.name} (${c.slug})`);
  }

  if (typeof args.only === "string") {
    const pli = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    // Plusieurs cartes d'un coup : « --only sanguinet,granby,17913 ». Une seule
    // commande évite de relancer le navigateur et de recharger les données par carte.
    const qs = args.only.split(",").map((s) => pli(s.trim())).filter(Boolean);
    cartes = cartes.filter((c) => qs.some((q) => pli(c.deputy.name).includes(q) || pli(c.slug).includes(q)));
    if (!cartes.length) throw new Error(`Aucun élu ne correspond à « ${args.only} ».`);
  }

  // ÉCHANTILLON — le député le plus actif de chaque parti. Cinq cartes
  // suffisent à juger un parti pris visuel, et elles couvrent les cinq
  // couleurs ; relancer les 128 à chaque retouche coûte dix minutes pour rien.
  if (args.echantillon) {
    const parParti = new Map<Carte["cle"], Carte>();
    for (const c of cartes) {
      const tenant = parParti.get(c.cle);
      if (!tenant || c.deputy.interventions > tenant.deputy.interventions) parParti.set(c.cle, c);
    }
    cartes = [...parParti.values()];
  }

  cartes.sort((a, b) => a.numero - b.numero || a.variante.localeCompare(b.variante));

  // --limite N : les N premières cartes de la série. Les numéros ayant été
  // attribués sur le jeu COMPLET, un tirage partiel garde les siens — la carte
  // 7 reste la 7 sur 128, pas la 7 sur 10.
  const limite = Number(typeof args.limite === "string" ? args.limite : 0);
  if (limite > 0) cartes = cartes.slice(0, limite);

  // GARDE-FOU CONTRE LES DOUBLONS — l'allégeance actuelle est normalement
  // résolue plus haut. Si une autre circonscription apparaît encore deux fois,
  // on suffixe néanmoins le fichier par parti afin de ne rien écraser.
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
  const libelles = await etiquettesPeriodes();
  for (const cle of PERIODES) {
    const vueP = data.periods[cle];
    const tous = vueP ? [...vueP.rows.flatMap((r) => r.deputies ?? []), ...(vueP.independants ?? [])] : [];
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
  // Trames d'abord, quatre à la fois : seules celles absentes du cache sur
  // disque se calculent (la première fois, ou après un changement de photo).
  const aTramer = [...cartes];
  let tramees = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let c = aTramer.shift(); c; c = aTramer.shift()) {
      await baseballURI(c.deputy);
      process.stdout.write(`\r  ${++tramees}/${cartes.length} trames`);
    }
  }));
  process.stdout.write("\n");

  const pages: { slug: string; html: string }[] = [];
  for (const c of cartes) {
    const portrait = await baseballURI(c.deputy);
    const ecusson = await ecussonURI(c.cle);
    const fiche = fiches.get(slugCirco(c.deputy)) ?? { [periode]: c.deputy };
    pages.push({ slug: c.slug, html: carteHTML(c, portrait, ecusson, logos.capp) });
    pages.push({ slug: `${c.slug}-verso`, html: versoHTML(c, fiche, maxAbs, libelles, portrait, ecusson, logos.vitrine, logos.capp, seance) });
    // Chaque carte a son verso holographique. --sans-holo le saute, le temps
    // d'une retouche.
    if (!args["sans-holo"]) {
      // Holo au verso seulement : le recto d'une carte holo est le recto ordinaire.
      const h = { ...c, holo: true };
      pages.push({ slug: `${c.slug}-holo-verso`, html: versoHTML(h, fiche, maxAbs, libelles, portrait, ecusson, logos.vitrine, logos.capp, seance) });
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  // Page par page : mises bout à bout, les 258 pages (images en base64
  // comprises) dépassent la longueur maximale d'une chaîne.
  const hachage = createHash("sha256");
  for (const p of pages) hachage.update(p.html);
  const empreinte = hachage.digest("hex").slice(0, 16);
  const planche = path.join(outDir, "_planche.html");

  const debordements: string[] = [];
  const retours: string[] = [];
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  try {
    // RENDU EN PARALLÈLE — plusieurs onglets puisent dans la même file de
    // pages. Une page à la fois, la série prenait un quart d'heure : chaque page
    // attend ses polices et ses images, et le processeur reste inoccupé pendant
    // ce temps. --parallele N règle le nombre d'onglets (4 par défaut).
    const parallele = Math.max(1, Number(typeof args.parallele === "string" ? args.parallele : 4));
    const onglets = await Promise.all(Array.from({ length: Math.min(parallele, pages.length) }, () =>
      browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })));
    // Chaque page est écrite sur disque puis OUVERTE (goto), pas injectée
    // (setContent) : injectée, elle vit sur about:blank, d'où Chromium refuse de
    // charger les trames référencées en file://.
    const dossierPages = path.join(outDir, ".pages");
    await fs.mkdir(dossierPages, { recursive: true });
    const rendre = async (action: (page: (typeof onglets)[number], i: number) => Promise<void>, libelle: string) => {
      let suivant = 0;
      let faits = 0;
      await Promise.all(onglets.map(async (page) => {
        for (let i = suivant++; i < pages.length; i = suivant++) {
          const fichier = path.join(dossierPages, `${pages[i].slug}.html`);
          await fs.writeFile(fichier, pages[i].html, "utf8");
          await page.goto(pathToFileURL(fichier).href, { waitUntil: "networkidle" });
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(ajusterNom);
          await page.evaluate(ajusterIdentite);
          await page.evaluate(ajusterFonctions);
          await page.evaluate(ajusterVerso);
          const debord = await page.evaluate(mesurerDebordement);
          if (debord > 0) debordements.push(`${pages[i].slug} (${debord} px)`);
          for (const t of await page.evaluate(mesurerRetours)) retours.push(`${pages[i].slug} : « ${t} »`);
          await action(page, i);
          process.stdout.write(`\r  ${++faits}/${pages.length} ${libelle}`);
        }
      }));
      // L'ordre d'arrivée dépend des onglets : on trie pour un rapport stable.
      debordements.sort();
      retours.sort();
    };
    const rapporterRetours = () => {
      if (!retours.length) return;
      console.warn(`  ⚠️ ${retours.length} ligne(s) d'en-tête coupée(s) sur deux rangs :`);
      for (const r of retours) console.warn(`     · ${r}`);
    };

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
      await rendre(async (page, i) => {
        await page.screenshot({ path: path.join(outDir, `${pages[i].slug}.png`), type: "png" });
      }, "images");
      console.log(`\n  ${cartes.length} cartes (recto + verso) → ${outDir}`);
      rapporterDebordements(debordements);
      rapporterRetours();
      return;
    }

    // Indexées et non poussées : les onglets finissent dans le désordre, la
    // planche doit garder l'ordre de la série.
    const vignettes: string[] = new Array(pages.length);
    await rendre(async (page, i) => {
      const buf = await page.screenshot({ type: "jpeg", quality: 76, scale: "css" });
      vignettes[i] = `data:image/jpeg;base64,${buf.toString("base64")}`;
    }, "vignettes");
    await fs.writeFile(planche, plancheHTML(pages.map((p) => p.slug), vignettes, empreinte, vue.tabLabel), "utf8");
    console.log(`\n  planche → ${planche}`);
    console.log(`  ${cartes.length} cartes · ${pages.length} images · cœur de la grille : y ${COEUR.top} → ${COEUR.bottom}`);
    rapporterDebordements(debordements);
    rapporterRetours();
    if (!args["sans-ouvrir"]) openInBrowser(planche);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
