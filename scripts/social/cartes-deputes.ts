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
//   npm run carte:deputes -- --style web --png         → série pour l'écran
//   npm run carte:deputes -- --style impression --png  → série pour l'imprimeur
//
// DEUX STYLES ARRÊTÉS (Jules, 25-09) : on choisit une destination, pas des
// réglages. Chaque style écrit dans son dossier (social-out/cartes-deputes-<style>).
//   · impression : trame de 8 px (~82 lignes par pouce, sans moiré avec la
//     trame de l'imprimeur, décision du 24-09), fond perdu de 3 mm, échelle 2 ;
//     identique à --impression.
//   · web : trame de 4 px, la plus lisse à l'écran (retenue par Jules le 25-09
//     sur planche à 6, 5 et 4 px, contre un rendu 3x — qui ne change rien : ce
//     qu'on voit, ce sont les points, pas les pixels — et une trame adoucie,
//     qui paraît floue). Sans fond perdu, échelle 2 (2142 x 2992 px), trame
//     rastérisée à cette échelle. Plus fin encore, la trame ne cacherait plus
//     que la photo source ne fait que 150 x 200 px.
// Sans --style, rien ne change. --cellule et --echelle l'emportent sur le style,
// pour un essai.
//   npm run carte:deputes -- --mention "Carte en développement"  → tampon sur chaque face
//   npm run carte:deputes -- --png --echelle 2  → PNG deux fois plus grands, pour l'écran
//   npm run carte:deputes                    → la planche des 128
//   npm run carte:deputes -- --png           → les PNG, la planche une fois vue
//   npm run carte:deputes -- --impression    → les PNG pour l'imprimeur : fond
//                                              perdu de 3 mm, échelle 2, dans impression/
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { buildEnjeuStack, ISSUE_META, loadAssemblee, type DeputyRow, type IssueKey, type PeriodKey } from "@/lib/data/assemblee";
import { PARTY_COLORS, PARTY_FULL_NAMES, type PartyKey } from "@/lib/data/parties";
import { COLORS, TONE, enjeuGlyph, fleur, loadLogos, parseArgs, txt, openInBrowser } from "./lib/reel";

/** Enjeux écartés des cartes tant que leur classifieur est en révision.
 *  VIDE depuis le 28-09 : sur les données reconstruites avec les têtes
 *  recalibrées, Terres publiques n'est plus l'enjeu dominant que de 2 élus sur
 *  129 (59 avant), dont le ministre de l'Agriculture, et Affaires
 *  internationales d'aucun (15 avant). Les douze enjeux paraissent. */
const ENJEUX_EN_REVISION: readonly IssueKey[] = [];

/** Encre des élus sans parti : un gris d'ardoise, lisible sous le papier et
 *  qu'aucun parti n'emploie. */
const COULEUR_INDEPENDANT = "#4A4F57";

/** MENTION (--mention "…") : un tampon posé sur CHAQUE face, pour les cartes
 *  montrées avant que leurs données soient définitives (avant la
 *  reconstruction agora d'aws-refiners#547, par exemple). Encre rouge du ton
 *  défavorable (TONE.negative). Recto : centré entre le médaillon et
 *  l'écusson, légèrement de travers, au-dessus de la tête. Verso : plus petit
 *  et droit, dans la bande libre entre la ligne d'élection et la fiche — posé
 *  en haut comme au recto, il couvrait le nom. Absente, la carte est inchangée. */
function avecMention(html: string, mention: string | null, face: "recto" | "verso"): string {
  if (!mention) return html;
  const place = face === "recto"
    ? "top:78px;transform:translateX(-50%) rotate(-3deg);padding:9px 20px 8px;font-size:26px;border-width:4px"
    : "top:190px;transform:translateX(-50%);padding:5px 14px 4px;font-size:19px;border-width:3px";
  const tampon = `<div class="mention-dev" style="position:absolute;left:50%;z-index:20;${place};` +
    `border-style:solid;border-color:#B0473A;border-radius:6px;background:rgba(243,236,221,.94);color:#B0473A;` +
    `font-family:'IBM Plex Mono',monospace;font-weight:600;letter-spacing:.16em;text-transform:uppercase;` +
    `white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)">${txt(mention)}</div>`;
  return html.replace("</body>", `${tampon}</body>`);
}

/** Mention d'édition de la série imprimée. À changer à la prochaine législature. */
const EDITION_LEGISLATURE = "43e législature · 2022-2026";

/** « 43e » → « 43<sup>e</sup> » : sur un pied en capitales, « 43E » se lit mal ;
 *  l'exposant garde sa minuscule (cf. .ord). Le recto ne garde que la
 *  législature : avec les années, son pied passait sur deux lignes. */
function ordinal(html: string): string {
  return html.replace(/(\d+)e\b/g, '$1<sup class="ord">e</sup>');
}

/** LIGNE DE STATISTIQUES du verso (Jules, 26-09) : les libellés EN HAUT,
 *  séparés des chiffres par une fine ligne, des filets verticaux entre les
 *  colonnes. Sert aux blocs Élection et Fiche. `v` est du HTML déjà échappé. */
function grilleStats(cases: { l: string; v: string }[], colonnes?: string): string {
  return `<div class="stats" style="grid-template-columns:${colonnes ?? `repeat(${cases.length},minmax(0,1fr))`}">${
    cases.map((x, i) => `<span class="${i === 0 ? "c0" : ""}">${txt(x.l).replace(/^&nbsp;/, "")}</span>`).join("")}${
    cases.map((x, i) => `<b class="${i === 0 ? "c0" : ""}">${x.v}</b>`).join("")}</div>`;
}

const MONTANT = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
const POURCENT = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** RARETÉ (grille arrêtée avec Jules, 23-09). Légendaire : les premiers
 *  ministres de la législature, hors calcul. Tous les autres, chefs compris,
 *  sont classés sur les MOTS PRONONCÉS au Salon bleu sur la législature (la
 *  saillance de l'élu, durée du mandat comprise) : 10 % rares, 35 % peu
 *  communes, le reste communes.
 *  · Mots plutôt qu'interventions : les vice-présidents cumulent des milliers
 *    d'interventions de procédure (26 à 42 mots chacune), qui les mettaient
 *    en tête du classement.
 *  · La présidente est commune d'office (le sceau essayé le 23-09 a été retiré) : dans les
 *    transcriptions, ce qu'elle dit en présidant est attribué à « la
 *    Présidente », pas à elle (6 interventions sur la législature).
 *  Grille précédente (22-09, abandonnée) : poids des fonctions rémunérées et
 *  des duels de porte-parole, classé par camp. */
type Rarete = "commune" | "peu-commune" | "rare" | "legendaire";
const PROPORTIONS_RARETE: [Rarete, number][] = [["rare", 0.10], ["peu-commune", 0.35]];
const LIBELLE_RARETE: Record<Rarete, string> = {
  commune: "Commune", "peu-commune": "Peu commune", rare: "Rare", legendaire: "Légendaire",
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

/** CE QUE LE CODE VEUT DIRE, sous le carré (Jules, 25-09 : « ça ne parle pas
 *  à tout le monde »). Accordé au genre de l'élu (donnees/genre-deputes.json) ;
 *  genre inconnu = forme masculine suivie de la féminine (« Député·e »). « CO »
 *  couvre les chefs de TOUS les groupes d'opposition : « Chef parlementaire »
 *  (Jules, 28-09), vrai pour chacun, là où « Chef de parti » ne l'était ni
 *  d'un chef de l'opposition officielle par intérim ni d'une co-porte-parole. */
const LIBELLES_FONCTION: Record<string, [string, string]> = {
  PM: ["Premier ministre", "Première ministre"],
  PAN: ["Président de l’Assemblée", "Présidente de l’Assemblée"],
  CO: ["Chef parlementaire", "Cheffe parlementaire"],
  M: ["Ministre", "Ministre"],
  VP: ["Vice-président de l’Assemblée", "Vice-présidente de l’Assemblée"],
  LP: ["Leader parlementaire", "Leader parlementaire"],
  W: ["Whip", "Whip"],
  PCA: ["Président de caucus", "Présidente de caucus"],
  PC: ["Président de commission", "Présidente de commission"],
  AP: ["Adjoint parlementaire", "Adjointe parlementaire"],
  VC: ["Vice-président de commission", "Vice-présidente de commission"],
  PS: ["Président de séance", "Présidente de séance"],
  B: ["Membre du Bureau", "Membre du Bureau"],
  PP: ["Porte-parole", "Porte-parole"],
  D: ["Député", "Députée"],
};
/** Rubans de chef à l'impression : le nom du parti en sigle, pour tenir sur une
 *  ligne à 30 px (« Co-porte-parole de Québec solidaire » passait à deux). */
function sigleParti(titre: string): string {
  return titre.replace(/Québec solidaire/g, "QS").replace(/Parti québécois/g, "PQ")
    .replace(/Parti libéral du Québec/g, "PLQ").replace(/Coalition avenir Québec/g, "CAQ")
    .replace(/Parti conservateur du Québec/g, "PCQ");
}

function libelleFonction(code: string, genre: "f" | "m" | undefined): string {
  const [m, f] = LIBELLES_FONCTION[code] ?? [code, code];
  return genre === "f" ? f : genre === "m" || m === f ? m : `${m} / ${f}`;
}

/** RUBAN DES CHEFS PARLEMENTAIRES, tiré des fiches de l'Assemblée : le titre
 *  de la fonction de chef encore OCCUPÉE à la dissolution. Un ancien chef
 *  (Tanguay, Rizqy, Nadeau-Dubois) garde le sigle CO au recto, fonction la
 *  mieux payée de sa législature, mais ne porte pas de ruban : un titre
 *  qu'il n'a plus serait la faute la plus facile à relever. */
function rubanChefParlementaire(tenues: { titre: string; fin: string }[]): string | null {
  const actuelle = tenues.find((t) => /^Chef(?:fe)? d/.test(t.titre) && t.fin >= AXE_FIN);
  return actuelle ? titreCourt(actuelle.titre) : null;
}

function codeFonction(tenues: { titre: string; pct: number }[], porteParole: boolean): string {
  const triees = [...tenues].sort((a, b) => b.pct - a.pct);
  for (const [re, code] of CODES_FONCTION) if (triees.some((t) => re.test(t.titre))) return code;
  return porteParole ? "PP" : "D";
}

/** CADRE DES CARTES RARES (les chefs), d'après la Topps 1972 fournie par Jules
 *  (22-09) : un bandeau uni à l'encre du parti entre deux filets, une fenêtre
 *  au coin supérieur gauche arrondi, et en haut à droite la VAGUE du coin
 *  d'origine, qui laisse paraître l'écusson (couleur papier sur le bandeau).
 *  Une fine ligne à la couleur de l'enjeu le plus saillant double le contour
 *  de la photo. Les communes, peu communes et légendaires gardent pour
 *  l'instant le cadre d'origine.
 *
 *  Coordonnées dans le panneau : bandeau de `bande` px, coin arrondi de
 *  `arrondi` px. */
const TOPPS = { bande: 30, arrondi: 70 };

/** LA FINE LIGNE (contour de la photo et médaillon) dit la rareté par son
 *  MÉTAL (Jules, 22-09) : argent pour les peu communes, or pour les rares,
 *  diamant pour les légendaires. `uni` sert là où un dégradé est impossible
 *  (ombre du médaillon). */
const METAUX: Partial<Record<Rarete, { uni: string; arrets: string[] }>> = {
  "peu-commune": { uni: "#B9C0C8", arrets: ["#F2F4F6", "#9AA1AA", "#E6E9ED", "#7C838C"] },
  rare: { uni: "#CDA64C", arrets: ["#F6E3A1", "#C9A24A", "#F3D98A", "#9C7A2E"] },
  legendaire: { uni: "#BFE6FF", arrets: ["#FFFFFF", "#9ED8FF", "#F2FBFF", "#C9B8FF", "#A8F0E6", "#FFFFFF"] },
};

function degradeMetal(r: Rarete, id = "metal"): string {
  const m = METAUX[r];
  if (!m) return "";
  const n = m.arrets.length - 1;
  // Coordonnées du PANNEAU, pas de chaque tracé : sinon deux tracés qui se
  // rejoignent (coin rempli et contour) n'ont pas la même teinte au raccord.
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${PANNEAU.w}" y2="${PANNEAU.bas - PANNEAU.y}">${m.arrets.map((c, i) => `<stop offset="${(i / n).toFixed(2)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
}

function degradeMetalCSS(r: Rarete): string {
  const m = METAUX[r];
  return m ? `linear-gradient(135deg,${m.arrets.join(",")})` : "transparent";
}

/** Nombre de fleurs de lys sous la circonscription, au recto (22-09). */
/** Série complète, pour les cartes du paquet (voir pagesPaquet). */
let TOTAL_SERIE = 0;
let SANS_EXPRESSION_SERIE = 0;
const RARETES_SERIE: Record<Rarete, number> = { commune: 0, "peu-commune": 0, rare: 0, legendaire: 0 };
const FLEURS_PAR_RARETE: Record<Rarete, number> = { commune: 1, "peu-commune": 2, rare: 3, legendaire: 4 };

/** Cadre d'origine (tracé de Jules) : la vague en S réserve le coin supérieur
 *  droit à l'écusson, sur le carton nu. Pour toutes les raretés sauf la rare. */
function cheminOrigine(ecusson: boolean): string {
  const h = PANNEAU.bas - PANNEAU.y;
  return ecusson
    ? `M 0 0 H 630 C 720 0, 760 170, 855 170 C 915 170, 955 140, 979 150 V ${h} H 0 Z`
    : `M 0 0 H ${PANNEAU.w} V ${h} H 0 Z`;
}

/** Fenêtre de la photo (et du bandeau du nom) des cartes rares : la vague
 *  d'origine du coin, ramenée à l'intérieur du bandeau (même tracé, bords
 *  décalés de `bande`). Sans écusson (indépendants), pas de vague : le coin
 *  supérieur droit est arrondi comme le gauche (Jules, 24-09). */
function cheminFenetre(ecusson: boolean): string {
  const w = PANNEAU.w;
  const h = PANNEAU.bas - PANNEAU.y;
  const { bande: b, arrondi: r } = TOPPS;
  const haut = ecusson
    ? `H 630 C 720 ${b}, 760 170, 855 170 C 915 170, ${w - b - 24} 140, ${w - b} 150`
    : `H ${w - b - r} A ${r} ${r} 0 0 1 ${w - b} ${b + r}`;
  return `M ${b} ${h - b} V ${b + r} A ${r} ${r} 0 0 1 ${b + r} ${b} ${haut} V ${h - b} Z`;
}

/** Bandeau uni, filets d'encre, et fine ligne de l'enjeu le plus saillant le
 *  long de la fenêtre (posée sous le filet, elle déborde de 3 px de part et
 *  d'autre). */
function cadreTopps(parti: string, ecusson: boolean): string {
  const w = PANNEAU.w;
  const h = PANNEAU.bas - PANNEAU.y;
  const fenetre = cheminFenetre(ecusson);
  return `<defs>${degradeMetal("rare")}</defs>`
    + `<path fill-rule="evenodd" fill="${parti}" d="M 0 0 H ${w} V ${h} H 0 Z ${fenetre}"/>`
    // Filet extérieur doublé de la ligne de l'enjeu, comme la fenêtre (22-09).
    + `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" fill="none" stroke="url(#metal)" stroke-width="9"/>`
    + `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" fill="none" stroke="${COLORS.ink}" stroke-width="3"/>`
    + `<path d="${fenetre}" fill="none" stroke="url(#metal)" stroke-width="9" stroke-linejoin="round"/>`
    + `<path d="${fenetre}" fill="none" stroke="${COLORS.ink}" stroke-width="2.5" stroke-linejoin="round"/>`;
}

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

/** Genre grammatical des élus, clé assnat_id : donnees/genre-deputes.json,
 *  chaque entrée avec sa source (pplmatch, ou la fiche de l'Assemblée :
 *  « Députée de … »). Rien n'est déduit d'un prénom. */
async function chargerGenres(): Promise<Map<string, "f" | "m">> {
  const fichier = path.resolve(process.cwd(), "scripts/social/donnees/genre-deputes.json");
  const brut = await fs.readFile(fichier, "utf8").catch(() => null);
  if (!brut) {
    console.warn("  ⚠️ genre-deputes.json absent : « Élu.e » reste neutre sur toutes les cartes.");
    return new Map();
  }
  const d = JSON.parse(brut) as { deputes: Record<string, { genre: "f" | "m" }> };
  return new Map(Object.entries(d.deputes).map(([id, e]) => [id, e.genre]));
}

/** ANCIENNETÉ (Jules, 25-09), troisième ligne sous le nom au verso :
 *  donnees/carriere-deputes.json (pplmatch, mandates_qc, par identifiant de
 *  l'Assemblée). */
type Carriere = { premiere_election: string; mandats: number };
async function chargerJsonDeputes<T>(fichier: string): Promise<Map<string, T>> {
  const brut = await fs.readFile(path.resolve(process.cwd(), "scripts/social/donnees", fichier), "utf8").catch(() => null);
  if (!brut) { console.warn(`  ⚠️ ${fichier} absent.`); return new Map(); }
  return new Map(Object.entries((JSON.parse(brut) as { deputes: Record<string, T> }).deputes));
}
function ligneCarriere(car: Carriere | undefined, genre: "f" | "m" | undefined): string {
  if (!car) return "";
  const rang = car.mandats === 1 ? "1er" : `${car.mandats}e`;
  return `${genre === "f" ? "Élue" : "Élu"} pour la première fois en ${car.premiere_election} · ${rang} mandat`;
}

/** « Élu.e le 3 octobre 2022 » → « Élu le… » ou « Élue le… ». */
function accorderGenre(ligne: string, genre: "f" | "m" | undefined): string {
  if (!genre) return ligne;
  return ligne.replace(/Élu\.e/g, genre === "f" ? "Élue" : "Élu");
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
/** TEXTE TRONQUÉ OU MASQUÉ, sur l'une ou l'autre face : un élément à
 *  overflow:hidden dont le texte dépasse EN LARGEUR (le nom, un intitulé), une
 *  citation rognée par son line-clamp, ou un élément masqué par un ajusteur.
 *  La hauteur seule n'est pas comptée : avec line-height:1, les accents des
 *  capitales (É, Ë) dépassent la boîte du nom sans être coupés à l'image.
 *  À l'impression, toute ligne ici bloque les PNG (Jules, 25-09 : aucun mot
 *  tronqué, toutes les informations sur toutes les cartes). */
function mesurerCoupes(): string[] {
  const out: string[] = [];
  const els = document.querySelectorAll<HTMLElement>("body *");
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e.closest("svg") || e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
    const t = (e.textContent || "").trim();
    if (!t) continue;
    if (e.style.display === "none" && !e.classList.contains("parti-long")) { out.push(`masqué : ${t.slice(0, 60)}`); continue; }
    const cs = getComputedStyle(e);
    if (cs.display === "none") continue;
    const cache = cs.overflowX === "hidden" || cs.textOverflow === "ellipsis";
    if (cache && e.scrollWidth > e.clientWidth + 1) out.push(`coupé : ${t.slice(0, 60)}`);
    else if (e.classList.contains("citation") && e.scrollHeight > e.clientHeight + 1) out.push(`citation rognée : ${t.slice(0, 60)}`);
  }
  return out;
}

function mesurerRetours(): string[] {
  const coupees: string[] = [];
  const els = document.querySelectorAll<HTMLElement>(".identite, .chef, .vitaux, .rubrique, .stats > span, .pied span, .credit span");
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
    // Tolérance à la mesure du texte : un exposant (« 3e groupe ») remonte de
    // près d'une demi-ligne sans que la ligne soit coupée ; un vrai retour
    // décale d'une ligne entière.
    const tolerance = Math.max(12, 0.6 * parseFloat(getComputedStyle(els[i]).fontSize));
    if (max - min > tolerance) coupees.push((els[i].textContent || "").trim().slice(0, 60));
  }
  // Un intitulé de fonction rapetissé par ajusterFonctions est signalé : la
  // règle d'abréviation (titreCourt) doit le résoudre, pas la taille du texte.
  const legendes = document.querySelectorAll<HTMLElement>(".legende-parcours .ft");
  for (let i = 0; i < legendes.length; i++) {
    if (legendes[i].style.fontSize) coupees.push(`rapetissé à ${legendes[i].style.fontSize} : ${(legendes[i].textContent || "").trim().slice(0, 60)}`);
  }
  // Une ligne de statistiques plus large que son encadré (colonnes à la
  // mesure du contenu) déborderait sur le côté sans passer à la ligne.
  // À l'impression, des enjeux restés sur deux rangs malgré ajusterLegende.
  const enjeux = document.querySelectorAll<HTMLElement>(".legende li");
  if (document.body.dataset.plancher && enjeux.length) {
    let h = Infinity, b = -Infinity;
    for (let i = 0; i < enjeux.length; i++) { const t = enjeux[i].getBoundingClientRect().top; if (t < h) h = t; if (t > b) b = t; }
    if (b - h >= 4) coupees.push("enjeux sur deux rangs");
  }
  const grilles = document.querySelectorAll<HTMLElement>(".stats, .rubrique, .paie");
  for (let i = 0; i < grilles.length; i++) {
    if (grilles[i].scrollWidth > grilles[i].clientWidth + 1) coupees.push(`grille trop large : ${(grilles[i].textContent || "").trim().slice(0, 40)}`);
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
// IMPRESSION (--impression). La carte fait 63,5 x 88,9 mm, donc 1071 px = 63,5 mm
// (428 ppp). Le massicot dévie : on dessine 3 mm de FOND PERDU au-delà de la
// coupe, dans la couleur de fond de la face, et on garde le trait du cadre à
// 3 mm en deçà (zone de sécurité). Pour ne rien redessiner, la face entière est
// réduite d'une échelle uniforme et centrée : 3 mm de papier sur les côtés,
// 4,2 mm en haut et en bas, comme le liseré d'une vraie carte. Sortie à
// l'échelle 2 (856 ppp), une image de 69,5 x 94,9 mm.
const FOND_PERDU = 51;                          // 3 mm à 428 ppp
const ECHELLE_IMPRESSION = (63.5 - 6) / 63.5;   // le cadre à 3 mm de la coupe

/** Fenêtre conservée par la grille du profil Instagram (carré centré). */
const COEUR = { top: Math.round((H - W) / 2), bottom: Math.round((H + W) / 2) };

/** Le carton. Marge généreuse — un liseré fin se lirait comme l'encadré que
 *  GABARIT.md proscrit ; une vraie bordure de carte, elle, se lit comme le
 *  carton qu'elle imite. */
const MARGE = 46;
const PANNEAU = { x: MARGE, y: MARGE, w: W - MARGE * 2, bas: H - 120 };
const BANDE = 196;
const PHOTO_H = PANNEAU.bas - BANDE - PANNEAU.y;
/** POSITION DU CARRÉ DE LA FONCTION, EN DUR PAR TYPE DE CARTE (Jules, 25-09) :
 *  au sein d'un type, le carré est au même endroit sur toutes les cartes ;
 *  d'un type à l'autre, il suit la bande du nom (rentrée de TOPPS.bande sur
 *  les rares). Coordonnées dans la bande : colonne de `largeur` px contre le
 *  bord droit (= le carré lui-même : collé à la marge intérieure de 40 px, la
 *  même que le nom à gauche, Jules 25-09), carré de `carre` px à `haut` px du
 *  haut, soit CENTRÉ dans la
 *  partie colorée, sous le filet de 22 px : 22 + (196 − 22 − 104) / 2 = 57.
 *  Le code porte un astérisque ; ce qu'il veut dire est écrit au pied de la
 *  carte (« * Ministre »), à la place de l'adresse du site, qui est au verso.
 *  Un libellé sous le carré obligeait à le décentrer vers le haut. Les
 *  légendaires ont leur propre gabarit (PASTILLE_LEGENDAIRE). */
/** Légendaires : la pastille de fonction, au-dessus du nom, fixée en dur à la
 *  place qu'elle occupe quand le nom est à sa taille pleine (mesuré le 25-09 :
 *  x 78, y 1102). Dans le flux, elle descendait dès qu'ajusterNom réduisait un
 *  nom long. Comme le carré des autres cartes, elle porte un astérisque renvoyé
 *  au pied (« * Premier ministre »). */
const PASTILLE_LEGENDAIRE = { gauche: 78, haut: 1102 };

/** VERSO IMPRIMÉ (Jules, 25-09) : plancher de 30 px, soit 5 points à 1071 px
 *  pour 63,5 mm. Mesuré avant : note des sources à 2,5 pt, légendes et lignes
 *  sous le nom entre 2,9 et 4 pt, illisibles sur carton. Le contenu est allégé
 *  en conséquence : note de méthode réduite à sa ligne-lien et sans losanges ;
 *  tout le reste paraît en entier (Jules, 25-09 : aucun mot tronqué, toutes les
 *  informations sur toutes les cartes), la frise sur toute la largeur. Le style
 *  web garde la version complète. */
/** LIBELLÉS D'ENJEU EN ENTIER à l'impression (Jules, 25-09 : aucun mot
 *  tronqué). Le module du site abrège pour sa barre empilée (« Gouv. »,
 *  « Environ. ») ; la carte imprimée écrit le mot. */
const LIBELLE_ENJEU_ENTIER: Record<string, string> = {
  "Gouv.": "Gouvernance", "Environ.": "Environnement", "Éduc.": "Éducation",
  "Aff. int.": "International", "Immig.": "Immigration", "Tech.": "Technologie",
};

/** PLANCHER DU TEXTE IMPRIMÉ, en px (30 px = 5 points). Appliqué à la page par
 *  SCRIPT_PLANCHER, quel que soit le sélecteur du gabarit, et lu (data-plancher)
 *  par les fonctions d'ajustement, qui ne rapetissent plus en dessous : ce qui
 *  ne tient pas est signalé, jamais réduit en silence. */
const PLANCHER_IMPRESSION = 30;
const SCRIPT_PLANCHER = `<script>(() => {
  const m = ${PLANCHER_IMPRESSION};
  for (const e of document.querySelectorAll("body *")) {
    if (e.closest("svg") || e.tagName === "SCRIPT") continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (parseFloat(getComputedStyle(e).fontSize) < m) e.style.fontSize = m + "px";
  }
})();</script>`;

/** RECTO IMPRIMÉ (28-09) : les petits textes au même plancher que le verso.
 *  Relevé avant : « 43e législature » et la fonction au pied à 3,2 pt, la
 *  circonscription à 4,1 pt, l'astérisque du sigle à 2,1 pt. Le pied remonte de
 *  12 px pour rester au-dessus des logos. */
const RECTO_IMPRESSION_CSS = `
  .sous{font-size:${PLANCHER_IMPRESSION}px;letter-spacing:.06em;opacity:1}
  .pied{font-size:${PLANCHER_IMPRESSION}px;letter-spacing:.03em;top:${PANNEAU.bas + 14}px}
  .ord{font-size:.78em;vertical-align:.28em}
  .code-fonction .renvoi{font-size:.5em}
  .pastille .lettres{font-size:${PLANCHER_IMPRESSION}px}
  .pastille .renvoi{font-size:.75em}
`;

/** Pixels rendus au panneau du verso imprimé par le crédit, retiré : le rang
 *  libéré fait 66 px. Les logos CAPP et Laval, à la place et à la taille du
 *  recto, commencent 60 px au-dessus du bord : 10 px de marge. */
const PANNEAU_BAS_IMPRESSION = 50;
const VERSO_IMPRESSION_CSS = `
  .graduations{height:36px}
  .legende-parcours{margin-top:4px}
  .identite{font-size:32px}
  .chef{font-size:30px}
  .vitaux{font-size:30px;margin-top:3px}
  /* HIÉRARCHIE titre / libellés (Jules, 28-09). Les libellés ne peuvent pas
     descendre sous le plancher de 30 px : c'est le titre qui grossit, les
     libellés qui s'allègent (graisse, espacement), et l'écart qui s'ouvre. */
  .rubrique{font-size:36px;letter-spacing:.1em}
  .stats>span,.stats-vide{font-size:30px}
  .stats>span{font-weight:400;letter-spacing:.03em}
  .paie span{font-size:30px;font-weight:400;letter-spacing:.03em}
  .paie b{font-size:38px}
  /* ── LISIBILITÉ À L'IMPRESSION (relevé du 28-09 sur les 129 cartes) ──────
     La face est réduite à 90,55 % (cadre à 3 mm de la coupe) : 1 px y fait
     0,0537 mm. Un filet de 1 px mesurait 0,15 pt, sous le seuil de ce qu'une
     presse reproduit (0,25 pt) : tous passent à 2 px (0,30 pt). Les textes
     estompés (opacité de 0,62 à 0,72) tombaient à 2,3:1 de contraste sur les
     cartes orange : ils sont à pleine encre, la hiérarchie tient à la graisse
     et au corps. */
  .stats>span{border-bottom-width:2px}
  .stats>:not(.c0){border-left-width:2px}
  .paie{border-top-width:2px}
  .legende-parcours .puce{border-width:2px}
  .graduations span::before{border-left-width:2px}
  .frise-piste i.hors{opacity:.6}
  .stats>span,.paie span,.graduations,.metho,.citation,.vitaux,.identite,.bloc.election .vitaux{opacity:1}
  .legende .reste{opacity:.85}
  /* La piste du ton était un ton sur ton (papier foncé sur papier, 1,08:1) :
     invisible une fois imprimée. */
  .ton .piste{background:color-mix(in srgb, currentColor 20%, transparent)}
  .ton .neutre{opacity:.85}
  .empilee{height:44px}
  /* Bloc Élection en plus (26-09) : l'interligne des titres (1,48 par défaut
     d'Oswald) et les marges des lignes de statistiques rendent la place. */
  .stats{margin-top:14px}
  .stats>span{padding-bottom:3px}
  .bloc.election .vitaux{margin-top:4px}
  .identite{margin-top:4px}
  .chef{margin-top:5px}
  .stats>b{font-size:44px;min-height:44px;padding:5px 8px 0}
  .graduations,.legende-parcours li,.legende-parcours .fa,.legende-parcours.dense li,.legende-parcours.dense .fa{font-size:30px}
  .legende li,.legende b{font-size:30px}
  .citation{font-size:30px}
  .metho-courte{font-size:30px;text-align:center}
  /* RIEN N'EST TRONQUÉ NI RETIRÉ À L'IMPRESSION (Jules, 25-09) : la frise
     prend toute la largeur, ses intitulés passent à la ligne au besoin, et la
     rémunération (les deux montants) se lit sur un rang en dessous. */
  .legende-parcours .ft{white-space:normal;line-height:1.1}
  .citation{display:block;-webkit-line-clamp:unset;overflow:visible}
  /* Les enjeux sur UN rang (Jules, 28-09) ; si trois libellés longs n'y
     tiennent pas à 30 px, le dernier passe dessous plutôt que de rapetisser. */
  .legende{justify-content:space-between;gap:4px 12px;margin-left:-10px;margin-right:-10px}
  .legende li{gap:6px}
  /* Rang des logos, sous le panneau : Vitrine à gauche, écusson du parti à
     droite, centrés sur la hauteur des logos CAPP et Laval (56 px, à 4 px du
     bord). */
  .logos-bas{position:absolute;left:${MARGE + 4}px;right:${MARGE + 4}px;bottom:4px;height:56px;
             display:flex;align-items:center;justify-content:space-between}
  /* LOGOS EN CRÈME (Jules, 28-09), à l'opacité des logos du recto des cartes
     légendaires, lui aussi sur fond de couleur. Le gris du recto ordinaire
     est illisible sur l'encre d'un parti (contraste de 1,2 à 2,1) ; une bande
     de papier sous les logos a été essayée, puis écartée. */
  .marque-capp i{opacity:.8}
  .logos-bas span{display:block;background:${COLORS.paper};opacity:.8;
                  -webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
  .logos-bas .marque{width:270px;height:56px;-webkit-mask-position:left center;mask-position:left center}
  .logos-bas .ecusson{width:50px;height:50px;-webkit-mask-position:right center;mask-position:right center}
  .panneau{height:${PANNEAU.bas - PANNEAU.y + PANNEAU_BAS_IMPRESSION}px}
`;

const FONCTION: Record<Exclude<Rarete, "legendaire">, { largeur: number; carre: number; haut: number }> = {
  commune:       { largeur: 104, carre: 104, haut: 57 },
  "peu-commune": { largeur: 104, carre: 104, haut: 57 },
  rare:          { largeur: 104, carre: 104, haut: 57 },
};

type Carte = {
  slug: string;
  deputy: DeputyRow;
  parti: string;
  cle: PartyKey | "ind";
  couleur: string;
  /** Parti d'élection d'un élu qui a fini indépendant (voir finitIndependant). */
  partiElu?: string;
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
  /** Présidente de l'Assemblée : commune d'office (voir RARETÉ). */
  presidente?: boolean;
  /** « PM », « M », « CO »… (voir CODES_FONCTION). */
  codeFonction?: string;
  /** Ce que le code veut dire, accordé : « Ministre », « Députée »… */
  libelleFonction?: string;
  /** « Élue pour la première fois en 2018 · 2e mandat » */
  carriere?: string;
  /** La même, en champs, pour le bloc Élection du verso. */
  carriereStats?: { premiere: string; mandats: number; genre?: "f" | "m" };
  /** Légendaires : autographe (URL du tracé blanc), s'il y en a un. */
  signature?: string | null;
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
/** LOGOS DES INSTITUTIONS au bas de chaque carte (Jules, 23-09) : le CAPP,
 *  agrandi, et l'Université Laval à côté, séparés d'un filet. Mêmes couleur et
 *  opacité que le CAPP avait seul sur chaque gabarit (règles .marque-capp i). */
let LOGO_ULAVAL: string | null = null;
function marquesInstitutions(logoCapp: string | null): string {
  const masque = (uri: string) => `-webkit-mask-image:url('${uri}');mask-image:url('${uri}')`;
  const parts = [
    logoCapp ? `<i style="${masque(logoCapp)}"></i>` : "",
    logoCapp && LOGO_ULAVAL ? `<i class="sep"></i>` : "",
    LOGO_ULAVAL ? `<i class="ulaval" style="${masque(LOGO_ULAVAL)}"></i>` : "",
  ].join("");
  return parts ? `<span class="marque-capp">${parts}</span>` : "";
}

/** CONTOUR D'ENCRE de la ligne de l'enjeu et de sa bulle (Jules, 24-09) : le
 *  même trait que le cadre, dans le même calque SVG. Un tracé suit le dessus
 *  de la bulle (.bulle-enjeu : 56 × 50 px, arrondi de 34 px à droite), puis le
 *  sommet de la ligne jusqu'au bord droit ; un second passe sous la ligne
 *  (22 px). Coordonnées du panneau, comme cadrePath. */
/** LA BULLE : une vague évasée (Jules, 24-09). Plate en haut sur `coeur` px,
 *  puis une courbe en S qui s'ouvre vers la droite et rejoint la ligne de
 *  l'enjeu à l'horizontale. `h` au-dessus de la ligne, `ligne` = la ligne
 *  elle-même (22 px), que la bulle recouvre pour que le pictogramme se centre
 *  sur toute la hauteur colorée. */
const BULLE = { w: 112, h: 52, ligne: 22, coeur: 52 };
/** Tracé du dessus de la vague, depuis (x, y) = coin supérieur gauche de la
 *  bulle, jusqu'au point où elle rejoint la ligne. Sert au clip-path (origine
 *  locale) et au contour d'encre (coordonnées du panneau). */
function vagueBulle(x: number, y: number): string {
  const { w, h, coeur } = BULLE;
  // Plat court, puis une S aux points de contrôle bien écartés : l'épaule est
  // ronde et la descente douce, plutôt qu'un quart d'angle (Jules, 24-09).
  return `M ${x} ${y} H ${x + 16} C ${x + coeur + 26} ${y}, ${x + coeur + 8} ${y + h}, ${x + w} ${y + h}`;
}
function contourEnjeu(marge: number, epaisseur: number): string {
  const haut = PANNEAU.bas - PANNEAU.y - marge - BANDE;
  const g = marge, d = PANNEAU.w - marge;
  const trait = `fill="none" stroke="${COLORS.ink}" stroke-width="${epaisseur}" stroke-linejoin="round" stroke-linecap="square"`;
  return `<path d="${vagueBulle(g, haut - BULLE.h)} H ${d}" ${trait}/>`
    + `<path d="M ${g} ${haut + BULLE.ligne} H ${d}" ${trait}/>`;
}

/** Vrai si le dernier segment d'affiliation est « sans affiliation », OU s'il
 *  se ferme sur une défection sans segment suivant : c'est ainsi qu'apparaît un
 *  passage à indépendant que les affiliations publiées ne portent pas encore
 *  (Orford, 21 avril 2026, corrigé dans pplmatch#9 mais pas encore republié). */
function finitIndependant(deputy: DeputyRow): boolean {
  const dernier = (deputy.affiliationHistory ?? []).at(-1);
  if (!dernier) return false;
  return /^sans affiliation/i.test(dernier.label) || dernier.endReason === "defection";
}

function ligneParti(c: Carte): string {
  if (c.partiElu) return `Indépendant (élu ${c.partiElu})`;
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
  // Les chefs des groupes d'opposition ne sont PLUS saisis ici (Jules, 28-09,
  // « il faut uniformiser ») : leur ruban vient des fiches de l'Assemblée, pour
  // la fonction occupée à la dissolution (voir rubanChefParlementaire).
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
/** GRAPHIE IMPRIMÉE des noms que les données écrivent mal (relevé du 23-09,
 *  comparé aux fiches de l'Assemblée). Appliquée à l'AFFICHAGE seulement :
 *  les appariements (mandat, fiche, scrutin, mots) gardent la graphie des
 *  données, sur laquelle ils ont été vérifiés. La correction durable est en
 *  amont (référentiel des portraits, données agora). */
const NOMS_IMPRIMES: Record<string, string> = {
  "Simon Jolin-Barette": "Simon Jolin-Barrette",
  "Frederic Beauchemin": "Frédéric Beauchemin",
  // Graphie accentuée retenue par Jules (23-09), même là où l'Assemblée n'en
  // met pas. Clé = graphie des données : seul le Girard de Groulx l'a sans
  // accent (celui de Lac-Saint-Jean est déjà « Éric »).
  "Eric Girard": "Éric Girard",
};
const nomImprime = (nom: string) => NOMS_IMPRIMES[nom] ?? nom;

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
  // « Élu.e » est un GABARIT : accorderGenre() le remplace par « Élu » ou
  // « Élue » (Jules, 25-09), d'après donnees/genre-deputes.json. La forme
  // neutre ne reste que si le genre de l'élu n'y figure pas (avertissement).
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
// --cellule N : pas de la trame en pixels, 8 par défaut (décision de Jules,
// 24-09, sur planche d'essai à 4, 6, 8 et 10). Les portraits source font
// 150 x 200 px : une trame grosse cache ce manque de détail, et à 8 px elle
// fait environ 82 lignes par pouce sur la carte, loin des 150 à 175 de la trame
// de l'imprimeur, donc sans moiré. Fait partie de la clé du cache des trames.
const STYLES = {
  impression: { cellule: 8, echelle: 2, impression: true },
  web: { cellule: 4, echelle: 2, impression: false },
} as const;
type StyleCarte = keyof typeof STYLES;
const ARGS_CARTES = parseArgs(process.argv.slice(2));
const NOM_STYLE = typeof ARGS_CARTES.style === "string" ? ARGS_CARTES.style : null;
if (NOM_STYLE !== null && !(NOM_STYLE in STYLES)) {
  throw new Error(`--style ${NOM_STYLE} inconnu. Styles : ${Object.keys(STYLES).join(", ")}.`);
}
const STYLE = NOM_STYLE ? STYLES[NOM_STYLE as StyleCarte] : null;
/** Fond perdu et échelle 2 de l'imprimeur : --impression, ou le style du même nom. */
const MODE_IMPRESSION = !!ARGS_CARTES.impression || !!STYLE?.impression;
const CELLULE_TRAME = Math.max(2, Number(typeof ARGS_CARTES.cellule === "string" ? ARGS_CARTES.cellule : STYLE?.cellule ?? 8));
// DENSITÉ DE LA TRAME : le SVG des points est rastérisé à 1500 x 2000 px, que
// la carte agrandit déjà de ~30 % à --echelle 2 : les points y devenaient
// flous, et plus encore avec une --cellule fine. La trame est donc rastérisée
// à la même échelle que la carte (density de sharp) : mêmes points, mêmes
// positions, contours nets. 1 par défaut = rendu inchangé.
const ECHELLE_RENDU = MODE_IMPRESSION ? 2
  : Math.max(1, Number(typeof ARGS_CARTES.echelle === "string" ? ARGS_CARTES.echelle : STYLE?.echelle ?? 1));
const DENSITE_TRAME = ECHELLE_RENDU;
const CACHE_TRAMES = path.resolve(process.cwd(), "social-out/.cache-trames");
const cacheBaseball = new Map<string, string | null>();
async function baseballURI(deputy: DeputyRow): Promise<string | null> {
  const asset = deputy.portrait?.match(/\/images\/deputes\/cartes\/web\/(.+)\.jpg$/)?.[1];
  if (!asset) return null;
  if (cacheBaseball.has(asset)) return cacheBaseball.get(asset) ?? null;
  const source = path.resolve(process.cwd(), "public/images/deputes", `${asset}.jpg`);
  const octets = await fs.readFile(source).catch(() => null);
  if (!octets) { cacheBaseball.set(asset, null); return null; }
  const cle = createHash("sha256").update(octets).update(TRAME_VERSION).update(`cellule=${CELLULE_TRAME}`).update(DENSITE_TRAME > 1 ? `densite=${DENSITE_TRAME}` : "").digest("hex").slice(0, 12);
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
  const cell = CELLULE_TRAME;
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
  const buf = await sharp(Buffer.from(svg), { density: 72 * DENSITE_TRAME }).png({ compressionLevel: 8 }).toBuffer().catch(() => null);
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
/** Un titre de bloc trop long pour son encadré (« Fiche électorale · Élu à la
 *  partielle du 13 mars 2023 ») resserre son interlettrage, puis sa taille,
 *  sans passer sous le plancher. Pas de fonction imbriquée (cf. ajusterVerso). */
function ajusterRubriques(): void {
  const els = document.querySelectorAll<HTMLElement>(".rubrique");
  const plancher = Number(document.body.dataset.plancher || 18);
  for (let i = 0; i < els.length; i++) {
    const cs = getComputedStyle(els[i]);
    let taille = parseFloat(cs.fontSize);
    let espace = parseFloat(cs.letterSpacing) || 0;
    while (els[i].scrollWidth > els[i].clientWidth && espace > 0.5) {
      espace = Math.max(0, espace - 0.5);
      els[i].style.letterSpacing = `${espace}px`;
    }
    while (els[i].scrollWidth > els[i].clientWidth && taille > plancher) {
      taille -= 1;
      els[i].style.fontSize = `${taille}px`;
    }
  }
}

/** Les enjeux sur UN rang (Jules, 28-09). Quand trois libellés longs
 *  (« Gouvernance », « Environnement »…) ne tiennent pas, la légende resserre
 *  ses écarts, puis s'élargit dans le rembourrage de l'encadré ; le texte ne
 *  rapetisse pas. Pas de fonction imbriquée (cf. ajusterVerso). */
function ajusterLegende(): void {
  const l = document.querySelector<HTMLElement>(".legende");
  if (!l || !document.body.dataset.plancher) return;
  const items = Array.from(l.querySelectorAll<HTMLElement>("li"));
  let ecart = 12, interne = 6, marge = 10;
  for (let etape = 0; etape < 30; etape++) {
    let haut = Infinity, bas = -Infinity;
    for (let i = 0; i < items.length; i++) { const t = items[i].getBoundingClientRect().top; if (t < haut) haut = t; if (t > bas) bas = t; }
    if (bas - haut < 4) return;
    if (ecart > 4) { ecart -= 2; l.style.columnGap = `${ecart}px`; continue; }
    if (interne > 3) { interne -= 1; for (let i = 0; i < items.length; i++) items[i].style.gap = `${interne}px`; continue; }
    if (marge < 24) { marge += 2; l.style.marginLeft = `-${marge}px`; l.style.marginRight = `-${marge}px`; continue; }
    return;
  }
}

function ajusterFonctions(): void {
  const els = document.querySelectorAll<HTMLElement>(".legende-parcours .ft");
  for (let i = 0; i < els.length; i++) {
    let taille = parseFloat(getComputedStyle(els[i]).fontSize);
    const plancher = Number(document.body.dataset.plancher || 15);
    while (els[i].scrollWidth > els[i].clientWidth && taille > plancher) {
      taille -= 1;
      els[i].style.fontSize = `${taille}px`;
    }
  }
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
  const metho = document.querySelector<HTMLElement>(".metho");
  let tailleMetho = metho ? parseFloat(getComputedStyle(metho).fontSize) : 0;
  const imprime = !!document.body.dataset.plancher;
  const cellules = Array.from(document.querySelectorAll<HTMLElement>(".stats > b"));
  let cellule = cellules.length ? parseFloat(getComputedStyle(cellules[0]).paddingTop) : 0;
  const haut = document.querySelector<HTMLElement>(".haut");

  for (let etape = 0; etape < 80; etape++) {
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
    // celui de la carte 22 — ruban de chef, expression distinctive ET citation — ne
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
    // À L'IMPRESSION (plancher fixé), RIEN NE DISPARAÎT NI N'EST TRONQUÉ
    // (Jules, 25-09) : on ne cède que du blanc, puis la taille de
    // l'expression distinctive, jamais sous le plancher. Ce qui ne tient
    // toujours pas est signalé par mesurerDebordement et bloque les PNG.
    if (imprime) {
      if (cellule > 6) {
        cellule -= 1;
        for (let j = 0; j < cellules.length; j++) {
          cellules[j].style.paddingTop = `${cellule}px`;
          cellules[j].style.paddingBottom = `${cellule}px`;
        }
        continue;
      }
      if (mot && taille > 40) { taille -= 2; mot.style.fontSize = `${taille}px`; continue; }
      // Derniers blancs : sous l'en-tête, au-dessus du pied, entre les rangs
      // de la frise, puis le rembourrage des panneaux jusqu'à 6 px.
      if (!panneau.dataset.serre) {
        panneau.dataset.serre = "1";
        const pied = document.querySelector<HTMLElement>(".pied");
        if (pied) pied.style.paddingTop = "0px";
        const rangs = document.querySelectorAll<HTMLElement>(".legende-parcours li");
        for (let j = 0; j < rangs.length; j++) { rangs[j].style.paddingTop = "0px"; rangs[j].style.paddingBottom = "0px"; }
        continue;
      }
      if (rembourrage > 6 && blocs.length) {
        rembourrage -= 2;
        for (let j = 0; j < blocs.length; j++) {
          blocs[j].style.paddingTop = `${rembourrage}px`;
          blocs[j].style.paddingBottom = `${rembourrage}px`;
        }
        continue;
      }
      return;
    }
    if (citation && citation.style.webkitLineClamp !== "1") { citation.style.webkitLineClamp = "1"; continue; }
    if (mot && taille > 34) { taille -= 2; mot.style.fontSize = `${taille}px`; continue; }
    // Dernière concession à l'écran (25-09, ligne d'ancienneté) : la note des
    // sources, de 15 à 13 px au plus bas.
    if (metho && tailleMetho > 13) { tailleMetho -= 0.5; metho.style.fontSize = `${tailleMetho}px`; continue; }
    return;
  }
}

/** SIGNATURES — pour les cartes légendaires : scripts/social/donnees/
 *  signatures/<slug>.jpg (encre sombre sur fond clair). Convertie en tracé
 *  BLANC sur fond transparent, agrandie ×3 et mise en cache à côté des trames.
 *  Renvoie une URL file://, ou null s'il n'y a pas de signature. */
async function signatureURI(slug: string): Promise<string | null> {
  const source = path.resolve(process.cwd(), "scripts/social/donnees/signatures", `${slug}.jpg`);
  const octets = await fs.readFile(source).catch(() => null);
  if (!octets) return null;
  const cle = createHash("sha256").update(octets).digest("hex").slice(0, 12);
  const fichier = path.join(CACHE_TRAMES, "signatures", `${slug}-${cle}.png`);
  if (!(await fs.access(fichier).then(() => true, () => false))) {
    const sharp = (await import("sharp")).default;
    const { width = 0, height = 0 } = await sharp(octets).metadata();
    const [w, h] = [width * 3, height * 3];
    // Alpha = encre : on inverse la luminance, puis on durcit la courbe pour
    // que le papier disparaisse et que le trait reste plein.
    const alpha = await sharp(octets).resize(w, h, { kernel: "lanczos3" }).grayscale().negate()
      .linear(1.8, -60).blur(0.6).raw().toBuffer();
    await fs.mkdir(path.dirname(fichier), { recursive: true });
    await sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } })
      .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
      .png().toFile(fichier);
  }
  return pathToFileURL(fichier).href;
}

/** RECTO DES LÉGENDAIRES — vraiment à part (Jules, 22-09) : la photo couvre
 *  toute la carte, sans cadre, et se fond dans l'encre du parti vers le bas ;
 *  un double filet papier et enjeu, en retrait des bords, comme un
 *  certificat ; un grand nom ; la signature en travers, quand on l'a. Médaillon, code de fonction, fleurs de
 *  lys et pied restent ceux de la série. */
function carteLegendaireHTML(c: Carte, portrait: string | null, ecusson: string | null, logoCapp: string | null): string {
  const d = c.deputy;
  const parti = c.couleur;
  const fleurs = Array.from({ length: FLEURS_PAR_RARETE[c.rarete ?? "legendaire"] }, () => fleur(COLORS.paper, 26)).join("");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;background:${parti};color:${COLORS.paper};
       font-family:"Source Serif 4",serif;position:relative;overflow:hidden}
  .photo-pleine{position:absolute;inset:0;background-image:url("${portrait ?? ""}");
                background-size:cover;background-position:center 18%}
  /* Fondu vers l'encre du parti : le bas de la carte devient le bandeau. */
  .fondu{position:absolute;inset:0;
         background:linear-gradient(180deg,${parti}00 0%,${parti}00 44%,${parti}B3 66%,${parti} 82%)}
  /* Double filet en retrait des bords, comme un certificat : il s'arrête
     au-dessus du pied de carte, comme le panneau des autres cartes, pour ne
     pas passer sur le logo du CAPP ni coller au pied. Le second filet est en
     « diamant » (dégradé glacé), métal des légendaires. */
  .filet{position:absolute;left:26px;right:26px;top:26px;bottom:${H - PANNEAU.bas}px;border:2px solid ${COLORS.paper};opacity:.85;pointer-events:none}
  .filet-diamant{position:absolute;left:36px;right:36px;top:36px;bottom:${H - PANNEAU.bas + 10}px;border:4px solid transparent;
                 border-image:${degradeMetalCSS(c.rarete ?? "legendaire")} 1;pointer-events:none}
  .medaillon{position:absolute;left:14px;top:14px;width:124px;height:124px;border-radius:50%;
             background:${parti};color:${COLORS.paper};border:6px solid ${COLORS.paper};
             box-shadow:0 0 0 3px ${METAUX[c.rarete ?? "legendaire"]!.uni},0 0 0 6px ${COLORS.ink},0 0 0 9px ${METAUX[c.rarete ?? "legendaire"]!.uni};
             display:flex;align-items:center;justify-content:center;font-family:"Playfair Display",serif;
             font-weight:900;font-size:52px;line-height:1;transform:rotate(-6deg);z-index:3}
  .medaillon i{display:block;font-style:normal;transform:translateY(-8px)}
  .ecusson-haut{position:absolute;right:74px;top:66px;width:142px;height:108px;display:block}
  .ecusson-haut i{display:block;width:100%;height:100%;background:${COLORS.paper};
                  -webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                  -webkit-mask-position:center;mask-position:center}
  .bas{position:absolute;left:78px;right:78px;bottom:${H - PANNEAU.bas + 56}px}
  .ligne-nom{display:flex;align-items:flex-end;gap:26px;margin-top:14px}
  .nom{flex:1;min-width:0;white-space:nowrap;font-family:"Playfair Display",serif;font-weight:900;
       font-size:104px;line-height:.98;letter-spacing:-.02em}
  /* LE CODE DE FONCTION en pastille au-dessus du nom : filet papier, sans
     fond, capitales espacées. Le carré plein des autres cartes, collé au bas
     d'un nom de cette taille, tombait mal (Jules, 22-09). */
  .fonction-leg{position:absolute;left:${PASTILLE_LEGENDAIRE.gauche}px;top:${PASTILLE_LEGENDAIRE.haut}px;
                display:flex;align-items:center;gap:18px;z-index:2}
  .fonction-leg .pastille{margin-bottom:0}
  .pastille .lettres{position:relative}
  .pastille .renvoi{position:absolute;left:100%;top:-.1em;margin-left:.08em;font-size:.6em;line-height:1;letter-spacing:0}
  .pastille{display:inline-block;padding:7px 18px 6px;border:2px solid ${COLORS.paper};border-radius:4px;
            font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:28px;letter-spacing:.3em;
            line-height:1;margin-bottom:6px}
  .sous{margin-top:16px;font-family:"IBM Plex Mono",monospace;font-size:27px;letter-spacing:.1em;
        text-transform:uppercase;opacity:.8}
  .fleurs{display:inline-flex;gap:6px;margin-left:16px;vertical-align:-3px}
  /* L'autographe, en travers du bas de la photo, légèrement incliné. */
  .signature{position:absolute;right:92px;bottom:440px;width:560px;transform:rotate(-7deg);
             opacity:.95;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
  .pied{position:absolute;left:${MARGE + 4}px;right:${MARGE + 4}px;top:${PANNEAU.bas + 26}px;display:flex;
        justify-content:space-between;font-family:"IBM Plex Mono",monospace;font-size:21px;
        letter-spacing:.16em;text-transform:uppercase;opacity:.85}
  .ord{text-transform:none;font-size:.62em;vertical-align:.5em;line-height:0}
  .marque-capp{position:absolute;left:50%;transform:translateX(-50%);bottom:4px;display:flex;align-items:center;gap:22px}
  .marque-capp i.sep{width:1.5px;height:36px;opacity:.45;-webkit-mask-image:none!important;mask-image:none!important}
  .marque-capp i.ulaval{width:96px;height:45px}
  .marque-capp i{display:block;width:180px;height:56px;background:${COLORS.paper};opacity:.8;
                 -webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                 -webkit-mask-position:center;mask-position:center}
  .grain,.mouchete{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none}
  .grain{opacity:.22}
  .mouchete{opacity:.18}
  ${MODE_IMPRESSION ? RECTO_IMPRESSION_CSS : ""}
</style></head><body>
  ${portrait ? `<div class="photo-pleine"></div>` : ""}
  <div class="fondu"></div>
  <div class="filet"></div>
  <div class="filet-diamant"></div>
  <span class="medaillon"><i>${c.numero}${c.variante}</i></span>
  ${ecusson ? `<span class="ecusson-haut"><i style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></i></span>` : ""}
  ${c.signature ? `<img class="signature" src="${c.signature}" alt="">` : ""}
  ${c.codeFonction ? `<div class="fonction-leg"><span class="pastille"><span class="lettres">${c.codeFonction}${c.libelleFonction ? `<span class="renvoi">*</span>` : ""}</span></span></div>` : ""}
  <div class="bas">
    <div class="ligne-nom">
      <p class="nom">${txt(nomImprime(d.name))}</p>
    </div>
    <p class="sous">${d.circonscription ? txt(d.circonscription) : ""}<span class="fleurs" aria-label="${LIBELLE_RARETE[c.rarete ?? "legendaire"]}">${fleurs}</span></p>
  </div>
  <p class="pied"><span>${ordinal(txt(c.edition.split(" · ")[0]))}</span><span>${c.libelleFonction ? `*&nbsp;${txt(c.libelleFonction)}` : "vitrinedemocratique.com"}</span></p>
  ${marquesInstitutions(logoCapp)}
  <svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>
</body></html>`;
}


function carteHTML(
  c: Carte,
  portrait: string | null,
  ecusson: string | null,
  logoCapp: string | null,
): string {
  if (c.rarete === "legendaire") return carteLegendaireHTML(c, portrait, ecusson, logoCapp);
  const d = c.deputy;
  const parti = c.couleur;
  const enjeu = d.topIssueColor ?? COLORS.soft;
  // Style Topps pour les rares seulement ; cadre d'origine pour les autres.
  const topps = c.rarete === "rare";
  const cadrePath = topps ? cheminFenetre(Boolean(ecusson)) : cheminOrigine(Boolean(ecusson));
  const marge = topps ? TOPPS.bande : 0;
  const fonc = FONCTION[c.rarete ?? "commune"];

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
  .photo{position:absolute;left:${marge}px;right:${marge}px;top:0;height:${PHOTO_H - marge}px;
         background:${COLORS.paper};overflow:hidden}
  .photo .image{position:absolute;left:0;right:0;bottom:0;top:${topps ? TOPPS.bande : 0}px;background-image:url("${portrait ?? ""}");
                background-size:cover;background-position:center 16%}
  .photo .vide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.18}

  /* L'enjeu prend maintenant la place de l'ancien écusson, à côté du nom.
     Le carré net reprend les petites cases de position des cartes sportives. */
  /* LE CODE DE FONCTION remplace le carré de l'enjeu (22-09) : PM, M, CO…
     la fonction la mieux payée de la législature, à l'encre du parti. */
  /* Le libellé en clair sous le carré (25-09) : carré ramené de 118 à 104 px
     pour loger une ou deux lignes dans la bande, sous le filet du haut. */
  /* LE CARRÉ À LA MÊME PLACE SUR TOUTES LES CARTES (Jules, 25-09) : colonne de
     largeur FIXE sur toute la hauteur de la bande, carré posé à une position
     fixe, libellé en position absolue dessous. Ni un nom long ni un libellé
     sur deux lignes ne le déplacent. Hauteur : filet 22 + 11 de marge, carré
     104, 8 d'écart, puis deux lignes de libellé au plus. */
  .fonction{flex:0 0 ${fonc.largeur}px;width:${fonc.largeur}px;align-self:stretch;position:relative}
  .fonction .code-fonction{position:absolute;top:${fonc.haut}px;left:${(fonc.largeur - fonc.carre) / 2}px}
  /* L'ASTÉRISQUE EN EXPOSANT, en haut à droite des lettres (Jules, 25-09),
     hors du flux : les lettres restent centrées dans le carré, l'astérisque
     tombe dans la marge droite du carré. */
  .code-fonction .lettres{position:relative;line-height:1}
  .code-fonction .renvoi{position:absolute;left:100%;top:-.04em;margin-left:.01em;font-size:.34em;line-height:1}
  .code-fonction{flex:0 0 auto;width:${fonc.carre}px;height:${fonc.carre}px;background:${COLORS.paper};color:${parti};
                 display:flex;align-items:center;justify-content:center;
                 font-family:"Oswald",sans-serif;font-weight:700;font-size:60px;letter-spacing:.02em;line-height:1}
  .code-fonction.long{font-size:40px}
  /* Deux lettres larges (PP, VP) : 54 px laissent à l'astérisque au moins
     6 px de marge dans le carré, contre 1 px à 60. */
  .code-fonction.deux{font-size:54px}

  /* LE MÉDAILLON — à cheval sur le coin, moitié carton moitié panneau. Double
     anneau : le liseré clair détache le disque de la trame, le filet d'encre
     l'y rattache. */
  .medaillon{position:absolute;left:8px;top:8px;width:124px;height:124px;border-radius:50%;
             background:${parti};color:${COLORS.paper};border:6px solid ${COLORS.paper};
             box-shadow:${c.rarete === "rare" || c.rarete === "peu-commune"
               ? `0 0 0 3px ${METAUX[c.rarete]!.uni},0 0 0 6px ${COLORS.ink},0 0 0 9px ${METAUX[c.rarete]!.uni}`
               : `0 0 0 3px ${COLORS.ink}`};display:flex;align-items:center;
             justify-content:center;font-family:"Playfair Display",serif;font-weight:900;
             font-size:52px;line-height:1;transform:rotate(-6deg)}
  /* Peu communes et rares : le filet d'encre du médaillon est bordé de la
     fine ligne de l'enjeu, comme le contour de la photo (Jules, 22-09). */
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
  /* ÉCUSSON — dans la réserve du coin supérieur droit : à l'encre du parti
     sur le carton nu ; couleur papier sur le bandeau des cartes rares. */
  .ecusson-haut{position:absolute;left:${PANNEAU.x + 793}px;top:${PANNEAU.y + 23}px;
                 width:142px;height:108px;display:block}
  .ecusson-haut i{display:block;width:100%;height:100%;background:${topps || c.rarete === "peu-commune" ? COLORS.paper : parti};
                  -webkit-mask-size:contain;mask-size:contain;
                  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                  -webkit-mask-position:center;mask-position:center}
  /* Signature discrète, tout au bas du carton, CENTRÉE ; même place au verso. */
  .marque-capp{position:absolute;left:50%;transform:translateX(-50%);bottom:4px;display:flex;align-items:center;gap:22px}
  .marque-capp i.sep{width:1.5px;height:36px;opacity:.45;-webkit-mask-image:none!important;mask-image:none!important}
  .marque-capp i.ulaval{width:96px;height:45px}
  .marque-capp i{display:block;width:180px;height:56px;background:${COLORS.softer};
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
     par la COULEUR, en bandeau épais au sommet de la bande du nom, et depuis
     le 24-09 par son PICTOGRAMME dans la bulle du coin inférieur gauche
     (.bulle-enjeu). L'écart à GABARIT.md (« jamais une couleur seule, sans
     légende ») est donc levé ; le verso, lui, nomme l'enjeu.
     FILET ET BULLE AU BEIGE DU CARTON (Jules, 25-09) : la même couleur sur
     toutes les cartes ; l'enjeu reste dit par le pictogramme, à l'encre du
     parti. */
  .bande{position:absolute;left:${marge}px;right:${marge}px;bottom:${marge}px;height:${BANDE}px;background:${parti};
         box-shadow:inset 0 22px 0 ${COLORS.paper};
         display:flex;align-items:center;justify-content:space-between;gap:28px;padding:0 40px}
  /* flex:1 + min-width:0 donnent au bloc du nom une largeur DÉFINIE, sans quoi
     clientWidth vaut la largeur du texte et la mesure ne peut rien détecter. */
  .bande .qui{flex:1;min-width:0;overflow:hidden}
  /* LA BULLE DE L'ENJEU (Jules, 24-09) : dans le prolongement de la ligne de
     l'enjeu, au coin inférieur gauche, un petit quart-de-rond de la même
     couleur monte dans la photo et porte le pictogramme, en couleur papier.
     Discret : la légende du recto, sans un mot. */
  .bulle-enjeu{position:absolute;left:${marge}px;bottom:${marge + BANDE - BULLE.ligne}px;width:${BULLE.w}px;height:${BULLE.h + BULLE.ligne}px;
               background:${COLORS.paper};clip-path:path('${vagueBulle(0, 0)} V ${BULLE.h + BULLE.ligne} H 0 Z');
               display:flex;align-items:center;justify-content:center;box-sizing:border-box;
               /* Centré sur la partie VISIBLE : le trait du cadre (métal 9 px sur les
                  peu communes et les rares, encre 3 px sinon) empiète à gauche. */
               padding:0 ${BULLE.w - BULLE.coeur}px 0 ${topps || c.rarete === "peu-commune" ? 5 : 2}px}
  .bulle-enjeu svg{opacity:.92}
  .nom{font-family:"Playfair Display",serif;font-weight:900;font-size:68px;
       line-height:1.0;letter-spacing:-.02em;color:${COLORS.paper};
       text-transform:uppercase;white-space:nowrap;overflow:hidden}
  .sous{margin-top:12px;font-family:"IBM Plex Mono",monospace;font-size:27px;letter-spacing:.1em;
        text-transform:uppercase;color:${COLORS.paper};opacity:.72}
  /* LA RARETÉ en fleurs de lys, à droite de la circonscription : 1 commune,
     2 peu commune, 3 rare, 4 légendaire (Jules, 22-09). Sur la même ligne,
     pour ne pas prendre de hauteur au nom. */
  .fleurs{display:inline-flex;gap:6px;margin-left:16px;vertical-align:-3px;opacity:1}

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
  ${MODE_IMPRESSION ? RECTO_IMPRESSION_CSS : ""}
</style></head><body>
  <div class="panneau">
    <div class="photo">
      ${portrait
        ? `<div class="image"></div>`
        : `<div class="vide">${fleur(parti, 300)}</div>`}
    </div>
    ${d.topIssueKey ? `<div class="bulle-enjeu">${enjeuGlyph(d.topIssueKey, parti, 26)}</div>` : ""}
    <div class="bande">
      <div class="qui">
        <p class="nom">${txt(nomImprime(d.name))}</p>
        <p class="sous">${d.circonscription ? txt(d.circonscription) : ""}<span class="fleurs" aria-label="${LIBELLE_RARETE[c.rarete ?? "commune"]}">${Array.from({ length: FLEURS_PAR_RARETE[c.rarete ?? "commune"] }, () => fleur(COLORS.paper, 24)).join("")}</span></p>
      </div>
      ${c.codeFonction ? `<div class="fonction"><span class="code-fonction${c.codeFonction.length > 2 ? " long" : c.codeFonction.length === 2 ? " deux" : ""}"><span class="lettres">${c.codeFonction}${c.libelleFonction ? `<span class="renvoi">*</span>` : ""}</span></span></div>` : ""}
    </div>
  </div>

  <svg class="cadre" viewBox="0 0 ${PANNEAU.w} ${PANNEAU.bas - PANNEAU.y}" aria-hidden="true">
    ${contourEnjeu(marge, topps || c.rarete === "peu-commune" ? 2.5 : 3)}
    ${/* Commune : filet d'encre seul (cadre de base). Peu commune : le même
          contour doublé d'une ligne argent, et la réserve de l'écusson (coin
          supérieur droit, au-delà de la vague) remplie à l'encre du parti et
          cernée de la même ligne, le logo en couleur papier (Jules, 22-09).
          Rare : cadre Topps. */ ""}
    ${topps ? cadreTopps(parti, Boolean(ecusson))
      : c.rarete === "peu-commune"
        ? `<defs>${degradeMetal("peu-commune")}</defs>${ecusson ? `<path d="M 630 0 H 979 V 150 C 955 140, 915 170, 855 170 C 760 170, 720 0, 630 0 Z" fill="${parti}"/>` : ""}<path d="${cadrePath}" fill="none" stroke="url(#metal)" stroke-width="9" stroke-linejoin="round"/>${ecusson ? `<path d="M 630 0 H 979 V 150" fill="none" stroke="url(#metal)" stroke-width="9" stroke-linejoin="round"/>` : ""}<path d="${cadrePath}" fill="none" stroke="${COLORS.ink}" stroke-width="2.5" stroke-linejoin="round"/>${ecusson ? `<path d="M 630 0 H 979 V 150" fill="none" stroke="${COLORS.ink}" stroke-width="2.5" stroke-linejoin="round"/>` : ""}`
        : `<path d="${cadrePath}" fill="none" stroke="${COLORS.ink}" stroke-width="3" stroke-linejoin="round"/>`}
  </svg>

  ${/* Plus de fleur de lys ici (Jules, 22-09) : accolée au nom de l'Assemblée,
        elle se lisait comme un emblème officiel et laissait croire que la
        carte émane de l'institution. */ ""}
  <span class="medaillon"><i>${c.numero}${c.variante}</i></span>
  ${ecusson ? `<span class="ecusson-haut">
    <i style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></i>
  </span>` : ""}
  ${marquesInstitutions(logoCapp)}
  ${/* Plus de ruban au recto (22-09) : le titre est au verso. */ ""}

  <p class="pied">
    <span>${ordinal(txt(c.edition.split(" · ")[0]))}</span>
    <span>${c.libelleFonction ? `*&nbsp;${txt(c.libelleFonction)}` : "vitrinedemocratique.com"}</span>
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

  // Sous le nom : le PARTI seul, en toutes lettres (Jules, 28-09). La
  // circonscription est au recto ; sans elle, le nom complet du parti tient
  // toujours sur la ligne et le sigle de repli n'a plus lieu d'être.
  const partiLong = ligneParti(c);

  // Vitaux du carton — « Ht: 6'0"  Wt: 178  Born: 5-12-56 ». Les nôtres
  // viennent d'affiliationHistory : date d'élection, et bascule d'allégeance
  // quand il y en a une.
  const parcours = d.affiliationHistory ?? [];
  // LE BLOC ÉLECTION (Jules, 26-09) : date du scrutin en titre, résultat et
  // ancienneté en ligne de statistiques, puis, s'il y a lieu, le départ
  // (carte à lettre) ou le changement d'allégeance. Sortis de l'en-tête, qui
  // garde ainsi la même hauteur sur toutes les cartes.
  // Le changement d'allégeance nomme le parti d'ORIGINE (Jules, 28-09) : sans
  // lui, « élue avec 41,8 % » se lirait comme un résultat du parti actuel.
  const BANNIERE: Record<string, string> = { CAQ: "de la CAQ", PLQ: "du PLQ", PQ: "du PQ", QS: "de QS", PCQ: "du PCQ" };
  const origine = BANNIERE[sigleParti(parcours[0]?.label ?? "")];
  const elu = /^Élue/.test(c.mandat) ? "Élue" : "Élu";
  const parcoursLigne = c.depart ? c.depart.successeur
    : parcours.length > 1 && dateFr(parcours.at(-1)?.startDate)
      ? `${origine ? `${elu} sous la bannière ${origine} · changement` : "Changement"} d'allégeance le ${dateFr(parcours.at(-1)?.startDate)}` : "";
  const casesElection: { l: string; v: string }[] = [];
  if (c.scrutin) {
    casesElection.push({ l: "% des voix", v: POURCENT.format(c.scrutin.pourcentage) });
    casesElection.push({ l: "Voix d'avance", v: MONTANT.format(c.scrutin.avance) });
  }
  if (c.carriereStats) {
    casesElection.push({ l: "Mandat", v: ordinal(`${c.carriereStats.mandats}${c.carriereStats.mandats === 1 ? "er" : "e"}`).replace("1er", '1<sup class="ord">er</sup>') });
    casesElection.push({ l: c.carriereStats.genre === "f" ? "Élue depuis" : "Élu depuis", v: String(c.carriereStats.premiere) });
  }
  const blocElection = c.mandat || casesElection.length || parcoursLigne ? `
    <div class="bloc election">
      <p class="rubrique">Fiche électorale${c.mandat ? ` &middot; ${txt(c.mandat)}` : ""}</p>
      ${casesElection.length ? grilleStats(casesElection) : ""}
      ${parcoursLigne ? `<p class="vitaux">${txt(parcoursLigne)}</p>` : ""}
    </div>` : "";

  // LA PART DE SES INTERVENTIONS — panneau à part, et sous forme de BARRE
  // EMPILÉE plutôt que de ligne chiffrée : une deuxième liste de nombres se
  // serait confondue avec le tableau juste au-dessus.
  //
  // On reprend la pile COMPLÈTE du site, segment « autres enjeux » compris,
  // pour que la barre somme bien à 100 % — trois parts isolées laisseraient
  // croire à un total tronqué. Les segments sont des TRAMES de l'encre du
  // parti, du plein au clair : c'est ainsi qu'on distinguait des séries sur
  // une presse à deux encres, et ça préserve la bichromie.
  // « Autres » a son pictogramme (Jules, 28-09) : un simple tiret.
  const tiret = (couleur: string, taille: number) =>
    `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" style="display:block"><path d="M5 12h14" stroke="${couleur}" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>`;
  const pile = d.enjeuStack.filter((x) => x.widthPct > 0);
  const nommes = pile.filter((x) => !x.isReste && x.cle).slice(0, 3);
  const TRAMES = [1, .68, .42];
  const TAILLE_PICTO_BARRE = MODE_IMPRESSION ? 30 : 26;
  const barre = pile.length
    ? `<div class="empilee">${nommes.map((x, rang) => {
        // Le pictogramme DANS le segment (Jules, 28-09), centré. La trame
        // passe par la couleur (mélange avec le papier) et non par l'opacité,
        // qui aurait aussi délavé le pictogramme. Papier sur les trames
        // foncées, encre du parti sur la claire ; rien sous 4 % de large.
        const fond = `color-mix(in srgb, ${parti} ${Math.round(TRAMES[rang] * 100)}%, ${COLORS.paper})`;
        const picto = x.widthPct >= 4 ? enjeuGlyph(x.cle, rang < 2 ? COLORS.paper : parti, TAILLE_PICTO_BARRE) : "";
        return `<i style="width:${x.widthPct}%;background:${fond}">${picto}</i>`;
      }).join("")}${/* Tous les autres enjeux en UN segment pâle, pour que le
        tiret soit centré sur toute la zone et non sur un de ses morceaux. */ ""}<i style="flex:1 1 0;background:color-mix(in srgb, ${parti} 16%, ${COLORS.paper})">${
        100 - nommes.reduce((t, x) => t + x.widthPct, 0) >= 4 ? tiret(parti, TAILLE_PICTO_BARRE) : ""}</i></div>
       <ul class="legende">${nommes.map((x, i) => `
         <li>
           ${/* Sans la puce de couleur : le pictogramme, repris dans la barre,
                 fait le lien. Elle ne reste qu'à « Autres », qui n'en a pas. */ ""}
           <span class="pg">${enjeuGlyph(x.cle, parti, MODE_IMPRESSION ? 26 : 22)}</span>
           <span class="pl">${txt(MODE_IMPRESSION ? LIBELLE_ENJEU_ENTIER[x.label] ?? x.label : x.label)}</span>
           <b>${Math.round(x.widthPct)}&#8239;%</b>
         </li>`).join("")}
         <li class="reste"><span class="pg">${tiret(parti, MODE_IMPRESSION ? 26 : 22)}</span>
           <span class="pl">Autres</span>
           <b>${Math.round(100 - nommes.reduce((t, x) => t + x.widthPct, 0))}&#8239;%</b></li>
       </ul>`
    : "";


  // LA FICHE, EN LIGNE DE STATISTIQUES (Jules, 26-09) : la LÉGISLATURE seule
  // (cartes de législature ; session et dernière séance appartiennent aux
  // éditions en ligne, décision du 22-09), donc plus de tableau à une rangée. Comme au dos d'une
  // carte de baseball : libellé en haut, chiffre en gros dessous, en entier
  // (« Richesse lexicale », pas « Richesse »).
  const rFiche = fiche.legislature;
  const statsFiche = rFiche
    ? grilleStats([
        // Quatre libellés sur UN rang (Jules, 28-09 : « Interventions » était
        // le seul sur une ligne) ; colonnes à la mesure de leur contenu.
        { l: "Interventions", v: rFiche.interventions.toLocaleString("fr-CA") },
        { l: "Mots prononcés", v: txt(rFiche.wordsFormatted) },
        { l: "Richesse lexicale", v: `<span class="points">${Array.from({ length: 5 }, (_, i) =>
          `<i class="${i < rFiche.richnessLevel ? "plein" : ""}"></i>`).join("")}</span>` },
        { l: "Ton", v: `<span class="ton" title="${txt(toneWording(rFiche.toneScore, maxAbs.legislature))}"><span class="piste"><i class="neutre"></i><i class="repere" style="left:${toneScalePct(rFiche.toneScore, maxAbs.legislature)}%;background:${rFiche.toneScore >= 0 ? TONE.positive : TONE.negative}"></i></span></span>` },
      ], "repeat(4,auto)")
    : `<p class="stats-vide">Aucune intervention</p>`;

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
           overflow:hidden;display:flex;flex-direction:column;gap:4px}

  /* EN-TÊTE sur le carton : le grand portrait part du coin supérieur droit et
     le remplit. Le nom lui réserve sa largeur au lieu de passer dessous. */
  /* flex:0 0 auto — l'en-tête ne se COMPRIME jamais. Compressible, il
     s'écrasait dès que le verso débordait, et son contenu centré sortait par
     le haut (nom rogné) et par le bas (ligne cachée sous la fiche). Le surplus
     va désormais au bas du panneau, que ajusterVerso sait résorber. */
  /* HAUTEUR FIXE (Jules, 26-09) : le haut est le même sur toutes les cartes ;
     les blocs partent donc tous du même point, et le vide varie en bas. */
  .haut{flex:0 0 auto;display:flex;align-items:center;gap:24px;padding:0 190px 0 0;height:176px}
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
  .rond{position:absolute;right:-42px;top:-42px;width:232px;height:232px;border-radius:50%;
        border:8px solid ${COLORS.paper};background:${COLORS.paper};overflow:hidden}
  .rond .image{position:absolute;inset:0;background-image:url("${portrait ?? ""}");
               background-size:cover;background-position:center 12%}

  /* DEUX PANNEAUX, comme au dos du Federko 1978 : la fiche, puis la signature,
     séparés par le carton nu. Un panneau unique laissait un grand vide au
     milieu, le mot étant poussé en bas ; deux blocs remplissent la carte et
     donnent au mot son propre cadre. */
  /* BLOCS RAPPROCHÉS (Jules, 28-09) : 4 px entre eux, chacun avec ses coins
     arrondis (un essai à coins droits n'a pas été retenu). */
  .bloc{background:${COLORS.paper};color:${parti};border-radius:40px;
        padding:26px 38px 24px;display:flex;flex-direction:column}
  .bloc.fiche{flex:0 0 auto}
  /* ÉCART CONSTANT entre les boîtes (gap du panneau) : c'est le mot
     signature, dernière boîte, qui prend l'espace restant et centre son
     contenu. Avec justify-content:space-between, l'écart variait d'une carte
     et d'une boîte à l'autre (Jules, 22-09). */
  .bloc.signe{flex:0 0 auto;justify-content:center;text-align:center;padding:26px 38px 28px}
  /* Sans expression distinctive, c'est la boîte des parts qui devient la dernière :
     elle prend l'espace restant, pour garder l'écart constant. */

  .rubrique{font-family:"Oswald",sans-serif;font-weight:600;font-size:27px;letter-spacing:.14em;line-height:1.1;
            text-transform:uppercase;text-align:center;white-space:nowrap}
  /* LA BARRE EMPILÉE et sa légende. */
  .bloc.parts{flex:0 0 auto;padding:22px 38px 24px}
  .empilee{display:flex;height:40px;margin-top:16px;overflow:hidden;border-radius:3px}
  .empilee i{display:flex;align-items:center;justify-content:center;height:100%}
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
  .grille-parcours{display:grid;grid-template-columns:minmax(0,1fr);margin-top:14px}
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
  .paie{display:flex;align-items:baseline;justify-content:center;gap:12px;margin-top:8px;padding-top:8px;
        border-top:1px solid currentColor;font-family:"Oswald",sans-serif;white-space:nowrap}
  .paie b{font-weight:700;font-size:36px;line-height:1}
  /* Même style que les libellés des lignes de statistiques (.stats>span). */
  .paie span{font-weight:500;font-size:19px;line-height:1.1;letter-spacing:.06em;text-transform:uppercase;opacity:.72}
  /* LA LIGNE DE STATISTIQUES — quatre cases égales entre deux filets, séparées
     par des filets verticaux fins ; chiffre en gros, libellé dessous. */
  .stats{display:grid;margin-top:12px}
  .stats>span{display:flex;align-items:flex-end;justify-content:center;text-align:center;
              padding:0 8px 8px;border-bottom:1px solid currentColor;
              font-family:"Oswald",sans-serif;font-weight:500;font-size:19px;line-height:1.1;
              letter-spacing:.06em;text-transform:uppercase;opacity:.72}
  .stats>b{display:flex;align-items:center;justify-content:center;padding:10px 8px 2px;min-height:56px;
           font-family:"Oswald",sans-serif;font-weight:700;font-size:44px;line-height:1}
  .stats>:not(.c0){border-left:1px solid currentColor}
  .bloc.election .vitaux{text-align:center;margin-top:10px;opacity:.85}
  .stats-vide{text-align:center;font-size:24px;font-style:italic;opacity:.66;margin-top:12px}
  .points{white-space:nowrap;gap:6px}
  .points i{display:inline-block;width:18px;height:18px;border-radius:50%;
            border:2px solid currentColor;vertical-align:middle}
  .points i.plein{background:currentColor}
  .ton .piste{position:relative;display:block;height:14px;background:${COLORS.deep};width:120px}
  .ton .neutre{position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;background:currentColor;opacity:.4}
  .ton .repere{position:absolute;top:-6px;width:8px;height:26px;transform:translateX(-50%)}

  /* LE MOT — le point d'arrivée. */
  .mot{font-family:"Oswald",sans-serif;font-weight:700;font-size:64px;line-height:1.04;
       text-transform:uppercase;margin-top:8px}
  .citation{font-size:25px;line-height:1.34;font-style:italic;margin-top:10px;opacity:.8;
            display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

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
  .metho{margin-top:auto;padding-top:4px;font-size:15px;line-height:1.25;
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
  .marque-capp{position:absolute;left:50%;transform:translateX(-50%);bottom:4px;display:flex;align-items:center;gap:22px}
  .marque-capp i.sep{width:1.5px;height:36px;opacity:.45;-webkit-mask-image:none!important;mask-image:none!important}
  .marque-capp i.ulaval{width:96px;height:45px}
  .marque-capp i{display:block;width:180px;height:56px;background:${COLORS.paper};opacity:.62;
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
  ${MODE_IMPRESSION ? VERSO_IMPRESSION_CSS : ""}
</style></head><body${MODE_IMPRESSION ? ` data-plancher="${PLANCHER_IMPRESSION}"` : ""}>
  <div class="panneau">
    <div class="haut">
      <span class="numero">${c.numero}${c.variante}</span>
      <span class="titre">
        <span class="nom">${txt(nomImprime(d.name))}</span>
        <span class="identite"><span class="parti-long">${txt(partiLong)}</span></span>
        ${c.chef ? `<span class="chef${c.chef.eclat ? " eclat" : ""}">${c.chef.eclat ? "&#9733; " : ""}${ordinal(txt(MODE_IMPRESSION ? sigleParti(c.chef.titre) : c.chef.titre))}</span>`
          : c.depart ? `<span class="chef">${txt(c.depart.titre)}</span>` : ""}
      </span>
    </div>
    ${blocElection}

    <div class="bloc fiche">
      <p class="rubrique">Fiche à l'Assemblée</p>
      ${statsFiche}
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
          <ul class="legende-parcours${c.parcours.legende.length > 3 && !MODE_IMPRESSION ? " dense" : ""}">${c.parcours.legende.map((l) => `
            <li><span class="puce"><i style="opacity:${l.o}"></i></span><span class="ft">${ordinal(txt(l.titre))}</span><span class="fa">${l.annees}</span></li>`).join("")}
          </ul>
        </div>
      </div>
      ${/* Le montant PAR ANNÉE seul (Jules, 28-09), sur un rang compact sous
            la frise : il se compare d'un élu à l'autre ; le total dépendait
            de la durée du mandat. */ ""}
      <p class="paie">${c.remunerationMoyenne
        ? `<span>Salaire moyen par année&nbsp;:</span><b>${MONTANT.format(c.remunerationMoyenne)}&nbsp;$</b>`
        : `<span>Salaire sur la législature&nbsp;:</span><b>${MONTANT.format(c.remuneration)}&nbsp;$</b>`}</p>
    </div>` : ""}

    ${barre ? `
    <div class="bloc parts">
      <p class="rubrique">Part de ses interventions</p>
      ${barre}
    </div>` : ""}

    ${/* Pas de mot distinctif : pas d'encadré du tout (Jules, 22-09), plutôt
          qu'une boîte qui dit qu'il n'y a rien. */ ""}
    ${mot ? `
    <div class="bloc signe">
      <p class="rubrique">Expression distinctive</p>
      <p class="mot">${txt(mot)}</p>
      ${citation ? `<p class="citation">«&nbsp;${txt(citation)}&nbsp;»</p>` : ""}
    </div>` : ""}

    ${/* NOTE DE MÉTHODE (Jules, 23-09) : chaque visualisation de la carte,
          recto compris, est nommée et justifiée en une phrase. Une phrase ne
          paraît que si l'élément paraît : pas de définition de l'expression distinctive
          sur une carte qui n'en a pas. « Relu à la main » engage le verrou de
          --png : les images ne sortent pas sans la planche de cette version.
          Détail : docs/reference/cartes-deputes.md. */ ""}
    ${MODE_IMPRESSION
      ? `<p class="metho metho-courte">Sources et méthode complète&nbsp;: vitrinedemocratique.com/methodologie</p>`
      : `<p class="metho">
      Sources&nbsp;: transcriptions du Salon bleu jusqu'au ${txt(derniereSeance.replace(/^\p{L}+ (?=\d)/u, ""))}, fiches de l'Assemblée nationale, résultats d'Élections Québec.
      Richesse lexicale&nbsp;: variété du vocabulaire (indice MATTR), de un à cinq points par rapport aux autres élus. Le ton est lui aussi situé par rapport aux autres élus, pas dans l'absolu.
      ${c.parcours && c.remuneration ? `Frise&nbsp;: fonctions rémunérées au fil de la législature; quand plusieurs se chevauchent, seule la mieux payée est montrée, les indemnités ne se cumulant pas. Rémunération&nbsp;: indemnité de base et indemnité additionnelle la plus élevée, au jour près, sans allocations ni remboursements.` : ""}
      ${barre ? `Parts&nbsp;: interventions classées automatiquement par enjeu.` : ""}
      ${mot ? `Expression distinctive&nbsp;: celle qui distingue le plus l'élu des autres, pas la plus fréquente.` : ""}
      Recto&nbsp;: le sigle indique la fonction la mieux payée de la législature, le filet de couleur et sa bulle l'enjeu dominant, les fleurs de lys la rareté.
      Les premiers ministres sont légendaires; les autres élus sont classés selon les mots prononcés au Salon bleu sur la législature (10&nbsp;% rares, 35&nbsp;% peu communes).
      ${c.presidente ? `Ce que la présidente dit en présidant n'est pas attribué à son nom dans les transcriptions&nbsp;: elle est commune d'office.` : ""}
      Traitement automatisé, relu à la main&nbsp;: des erreurs restent possibles. Corrections et méthodologie complète sur le site.
    </p>`}

    ${/* À l'IMPRESSION (Jules, 28-09) : ni adresse ni numéro de carte ; le logo
          de la Vitrine et l'écusson du parti rejoignent le rang des logos
          CAPP et Laval, sous le panneau (voir .logos-bas). */ ""}
    ${MODE_IMPRESSION ? "" : `<p class="pied">
      ${logoVitrine
        ? `<span class="marque" style="-webkit-mask-image:url('${logoVitrine}');mask-image:url('${logoVitrine}')"></span>`
        : `<span>${fleur(COLORS.paper, 26)}</span>`}
      <span>vitrinedemocratique.com</span>
      ${ecusson ? `<span class="ecusson" style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></span>` : `<span></span>`}
    </p>`}
  </div>

  <span class="rond">${portrait ? `<span class="image"></span>` : fleur(parti, 100)}</span>

  ${/* Pas de crédit à l'impression (Jules, 28-09) ; les logos CAPP et Laval
        y reprennent la place et la taille qu'ils ont au recto. */ ""}
  ${MODE_IMPRESSION ? `<p class="logos-bas">
    ${logoVitrine ? `<span class="marque" style="-webkit-mask-image:url('${logoVitrine}');mask-image:url('${logoVitrine}')"></span>` : `<span></span>`}
    ${ecusson ? `<span class="ecusson" style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></span>` : `<span></span>`}
  </p>` : `<p class="credit">
    <span>Portrait&nbsp;: Assemblée nationale du Québec &middot; usage non commercial autorisé</span>
    <span>${ordinal(txt(c.edition))} &middot; carte ${c.numero}${c.variante} de ${c.total}</span>
  </p>`}
  ${marquesInstitutions(logoCapp)}
  <svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>
${MODE_IMPRESSION ? SCRIPT_PLANCHER : ""}
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
  <h1>Cartes de député · ${slugs.filter((x) => !x.endsWith("-verso")).length} cartes recto-verso · ${txt(periodeLabel)}</h1>
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

/** LES DEUX CARTES DU PAQUET (Jules, 28-09). Le paquet est transparent.
 *  · DESSUS : au recto la couverture, au verso la LÉGENDE de ce qu'une carte
 *    ne dit pas d'elle-même (rareté, sigle, pictogramme).
 *  · DESSOUS : au recto la MÉTHODOLOGIE, au verso, visible de l'extérieur, le
 *    logo de la Vitrine seul, avec ceux du CAPP et de l'Université Laval.
 *  Les deux faces visibles portent l'iridescence de la marque (taches pastel
 *  de lib/reel.ts, ici fixes). Même format, mêmes textures et même rang de
 *  logos que la série, pour passer par le même rendu (fond perdu compris). */
function pagesPaquet(
  logos: { vitrine: string | null; capp: string | null },
  total: number,
  raretes: Record<Rarete, number>,
  sansExpression: number,
): { slug: string; html: string }[] {
  const ENCRE = COLORS.soft;
  const masque = (uri: string) => `-webkit-mask-image:url('${uri}');mask-image:url('${uri}')`;
  const textures = `
  <svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>`;
  const polices = `<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&family=Oswald:wght@400;500;600;700&family=Archivo+Narrow:ital,wght@0,400;0,600;0,700;1,400&display=block" rel="stylesheet">`;
  // Les quatre teintes de l'iridescence, et leur version soutenue pour le trait.
  const IRIS = "linear-gradient(100deg,#E79FC6 0%,#8FCFEE 34%,#F3DE95 67%,#A9DFC4 100%)";
  const commun = (fond: string, encre: string, logo: string) => `
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;background:${fond};color:${encre};position:relative;overflow:hidden;
       font-family:"Archivo Narrow","Arial Narrow",sans-serif}
  .grain,.mouchete{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none}
  .grain{opacity:.24}.mouchete{opacity:.2}
  .marque-capp{position:absolute;left:50%;transform:translateX(-50%);bottom:4px;display:flex;align-items:center;gap:22px}
  .marque-capp i{display:block;width:180px;height:56px;background:${logo};
                 -webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
                 -webkit-mask-position:center;mask-position:center}
  .marque-capp i.sep{width:1.5px;height:36px;opacity:.45;-webkit-mask-image:none!important;mask-image:none!important}
  .marque-capp i.ulaval{width:96px;height:45px}
  .ord{text-transform:none;font-size:.78em;vertical-align:.28em;line-height:0}`;
  // Faces visibles : papier, taches irisées, logo dont le trait s'allume.
  const cssVisible = `${commun(COLORS.paper, COLORS.ink, COLORS.softer)}
  .iris{position:absolute;left:-12%;right:-12%;top:-8%;bottom:-8%;filter:blur(64px);
        background:
          radial-gradient(40% 30% at 26% 22%, #F0B2D4 0%, rgba(240,178,212,0) 72%),
          radial-gradient(42% 32% at 76% 30%, #B4DAF4 0%, rgba(180,218,244,0) 72%),
          radial-gradient(46% 34% at 38% 70%, #F5DF9A 0%, rgba(245,223,154,0) 72%),
          radial-gradient(40% 30% at 80% 80%, #B7E6CC 0%, rgba(183,230,204,0) 72%)}
  .cadre{position:absolute;left:${MARGE}px;right:${MARGE}px;top:${MARGE}px;bottom:${H - PANNEAU.bas}px;
         border:3px solid transparent;background:${IRIS} border-box;
         -webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
  .logo{position:relative;display:block}
  .logo i{position:absolute;inset:0;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
  .logo .trait{background:${COLORS.ink}}
  .logo .passe{background:linear-gradient(100deg,rgba(0,0,0,0) 24%,#D8579F 38%,#2F9FDD 50%,#E0B22E 62%,#3FB583 74%,rgba(0,0,0,0) 88%)}`;
  const logoIrise = (largeur: number) => logos.vitrine
    ? `<span class="logo" style="width:${largeur}px;height:${Math.round(largeur * 591 / 1788)}px"><i class="trait" style="${masque(logos.vitrine)}"></i><i class="passe" style="${masque(logos.vitrine)}"></i></span>`
    : "";
  const cssDos = `${commun(ENCRE, COLORS.paper, COLORS.paper)}
  .marque-capp i{opacity:.8}
  .panneau{position:absolute;left:${MARGE}px;top:${MARGE}px;width:${W - 2 * MARGE}px;height:${H - MARGE - 70}px;
           display:flex;flex-direction:column;gap:6px}
  .entete{flex:0 0 auto;height:132px;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .entete b{font-family:"Oswald",sans-serif;font-weight:700;font-size:70px;line-height:1;letter-spacing:.06em;text-transform:uppercase}
  .entete i{display:block;width:300px;height:6px;border-radius:3px;margin-top:16px;background:${IRIS}}
  .bloc{flex:0 0 auto;background:${COLORS.paper};color:${ENCRE};border-radius:40px;padding:20px 38px 22px}
  .bloc h3{font-family:"Oswald",sans-serif;font-weight:600;font-size:36px;line-height:1.1;letter-spacing:.1em;
           text-transform:uppercase;text-align:center}
  .bloc p{font-size:30px;line-height:1.15;margin-top:7px}
  .bloc p b{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.02em}
  .guide .bloc p{font-size:32px;text-align:center}
  .metho .bloc p{text-align:justify}
  /* L'adresse ne se coupe pas : justifiée, sa ligne s'étirait en blancs. */
  .metho .bloc p.lien{text-align:center}
  .guide .bloc{padding:16px 38px 18px}
  .guide .entete{height:112px}
  .liste{list-style:none;display:grid;gap:3px 26px;margin-top:9px;font-size:32px;line-height:1.06}
  .liste li{display:flex;align-items:center;gap:12px}
  .liste b{font-family:"Oswald",sans-serif;font-weight:700;flex:0 0 auto}
  .sigles b{min-width:80px}
  .rarete .f{display:inline-flex;gap:5px;flex:0 0 164px}
  .rarete i{font-style:normal;margin-left:auto;font-family:"Oswald",sans-serif;font-weight:600}`;
  const page = (css: string, corps: string) =>
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">${polices}<style>${css}</style></head><body${MODE_IMPRESSION ? ` data-plancher="${PLANCHER_IMPRESSION}"` : ""}>${corps}</body></html>`;
  const lys = (n: number, couleur: string, taille: number) => Array.from({ length: n }, () => fleur(couleur, taille)).join("");

  // ── Dessus, recto : la couverture ──────────────────────────────────────
  // Le logo d'abord, comme au dos ; la législature et ses années en dessous,
  // en italique fin. Ni fleurs de lys ni décompte de la série (Jules, 28-09).
  const cssGrandsLogos = `
  .centre{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .marque-capp{position:static;transform:none;gap:40px}
  .marque-capp i{width:324px;height:100px}
  .marque-capp i.sep{width:2.5px;height:66px}
  .marque-capp i.ulaval{width:172px;height:82px}`;
  const couverture = page(`${cssVisible}${cssGrandsLogos}
  .iris{filter:blur(70px);opacity:1}
  .filet{width:220px;height:5px;border-radius:3px;background:${IRIS};margin:100px 0 64px}
  /* Trois lignes, UNE typographie (Jules, 28-09) : IBM Plex Mono, le
     caractère du pied du recto, au même corps. « 43e législature » ne se
     distingue que par son encre, plus soutenue. */
  .ligne{font-family:"IBM Plex Mono",monospace;font-weight:400;font-size:34px;line-height:1;letter-spacing:.16em;
         text-indent:.16em;text-transform:uppercase;color:${COLORS.soft}}
  .ligne + .ligne{margin-top:26px}
  .ligne.forte{font-weight:500;color:${COLORS.ink}}
  .ligne .ord{font-size:.72em;vertical-align:.34em}
  .marque-capp{margin-top:140px}`,
  `<div class="iris"></div><div class="cadre"></div>
  <div class="centre">
    ${logoIrise(880)}
    <span class="filet"></span>
    <p class="ligne">Les élus de l'Assemblée nationale</p>
    <p class="ligne forte">${ordinal("43e")} législature</p>
    <p class="ligne">2022 – 2026</p>
    ${marquesInstitutions(logos.capp)}
  </div>${textures}`);

  // ── Dessus, verso : la légende ─────────────────────────────────────────
  // Formes épicènes ou doublets (pas de point médian) : sur une carte, le
  // libellé est accordé à l'élu.
  const EPICENE: Record<string, string> = {
    PM: "Premier ou première ministre", PAN: "Présidence de l’Assemblée", CO: "Chef ou cheffe parlementaire",
    VP: "Vice-présidence de l’Assemblée", PCA: "Présidence de caucus", PC: "Présidence de commission",
    AP: "Adjoint ou adjointe parlementaire", VC: "Vice-présidence de commission", PS: "Présidence de séance",
    D: "Député ou députée",
  };
  const sigles = Object.entries(LIBELLES_FONCTION).map(([code, [m]]) =>
    `<li><b>${code}</b><span>${txt(EPICENE[code] ?? m)}</span></li>`).join("");
  // Le nom ENTIER de chaque enjeu (Jules, 28-09), pas son abrégé.
  const enjeux = ISSUE_META.map((m) =>
    `<li>${enjeuGlyph(m.key, ENCRE, 38)}<span>${txt(m.title)}</span></li>`).join("");
  const legende = page(cssDos, `
  <div class="panneau guide">
    <div class="entete"><b>Légende</b><i></i></div>
    <div class="bloc">
      <h3>Les fleurs de lys&nbsp;: la rareté</h3>
      <ul class="liste rarete" style="grid-template-columns:1fr">
        <li><span class="f">${lys(4, ENCRE, 30)}</span><span><b>Légendaire</b>&ensp;les premiers ministres</span><i>${raretes.legendaire}</i></li>
        <li><span class="f">${lys(3, ENCRE, 30)}</span><span><b>Rare</b>&ensp;les 10&nbsp;% d'élus qui ont le plus parlé</span><i>${raretes.rare}</i></li>
        <li><span class="f">${lys(2, ENCRE, 30)}</span><span><b>Peu commune</b>&ensp;les 35&nbsp;% suivants</span><i>${raretes["peu-commune"]}</i></li>
        <li><span class="f">${lys(1, ENCRE, 30)}</span><span><b>Commune</b>&ensp;tous les autres</span><i>${raretes.commune}</i></li>
      </ul>
    </div>
    <div class="bloc">
      <h3>Le sigle&nbsp;: la fonction</h3>
      <p>La fonction la mieux rémunérée occupée pendant la législature.</p>
      <ul class="liste sigles" style="grid-template-columns:1fr 1fr">${sigles}</ul>
    </div>
    <div class="bloc">
      <h3>Le pictogramme&nbsp;: l'enjeu</h3>
      <p>Au recto, l'enjeu dont l'élu a le plus parlé.</p>
      <ul class="liste" style="grid-template-columns:1fr 1fr">${enjeux}</ul>
    </div>
  </div>${marquesInstitutions(logos.capp)}${textures}`);

  // ── Dessous, recto : la méthodologie ───────────────────────────────────
  const methodologie = page(cssDos, `
  <div class="panneau metho">
    <div class="entete"><b>Méthodologie</b><i></i></div>
    <div class="bloc"><h3>Sources</h3>
      <p>Journal des débats de l'Assemblée nationale&nbsp;: les séances du Salon bleu, du 29&nbsp;novembre 2022 au 12&nbsp;juin 2026, soit 287&nbsp;jours et 594&nbsp;237&nbsp;phrases. Fiches des députés de l'Assemblée. Résultats d'Élections Québec.</p></div>
    <div class="bloc"><h3>Modèles et validation</h3>
      <p>Chaque phrase est lue par 21&nbsp;modèles de thèmes, regroupés en 12&nbsp;enjeux, et par un modèle de ton. Ce sont des modèles légers (mDeBERTa), entraînés par notre équipe sur des phrases de presse et de débats parlementaires.</p>
      <p>Ils sont validés sur des phrases annotées à la main, hors du corpus d'entraînement. Le rapport de validation est public.</p>
      <p>Six phrases sur dix ne portent aucun enjeu identifiable&nbsp;: elles comptent dans les mots, pas dans les parts. La parole d'un élu qui préside la séance n'est pas comptée.</p></div>
    <div class="bloc"><h3>Expression distinctive</h3>
      <p>Un calcul retient les expressions d'un ou deux mots qu'un élu emploie souvent et que les autres emploient peu. Les mots de liaison sont retirés, d'où des formes comme «&nbsp;taxes impôts&nbsp;».</p>
      <p>Un modèle de langage choisit ensuite, parmi soixante, celle qui décrit un enjeu. Il ne rédige rien, mais son choix peut varier d'un calcul à l'autre. ${sansExpression} élus n'en ont aucune.</p></div>
    <div class="bloc"><h3>Salaire</h3>
      <p>Indemnité de base de chaque année, plus celle de la fonction la mieux payée, au jour près. C'est une estimation d'après les barèmes publics, et non le revenu de l'élu&nbsp;: allocations, remboursements et régime de retraite n'y sont pas.</p></div>
    <div class="bloc"><h3>Crédits</h3>
      <p>Portraits&nbsp;: Assemblée nationale du Québec. Analyse et conception&nbsp;: Vitrine démocratique, Centre d'analyse des politiques publiques, Université Laval.</p>
      <p class="lien"><b>Rapport de validation et corrections&nbsp;:</b><br>vitrinedemocratique.com/methodologie</p></div>
  </div>${marquesInstitutions(logos.capp)}${textures}`);

  // ── Dessous, verso : le logo seul ──────────────────────────────────────
  const dos = page(`${cssVisible}${cssGrandsLogos}
  .iris{filter:blur(70px);opacity:1}
  .centre{gap:120px}`,
  `<div class="iris"></div><div class="cadre"></div>
  <div class="centre">${logoIrise(880)}${marquesInstitutions(logos.capp)}</div>${textures}`);

  return [
    { slug: "paquet-dessus", html: couverture },
    { slug: "paquet-dessus-verso", html: legende },
    { slug: "paquet-dessous", html: methodologie },
    { slug: "paquet-dessous-verso", html: dos },
  ];
}

/** UN ÉLU, UNE LIGNE (relevé du 23-09). Les données agora ont une ligne par
 *  élu ET PAR PARTI : un élu qui a changé d'allégeance en a plusieurs, et la
 *  carte n'en lisait qu'une, souvent la ligne « ind » de fin de mandat. Vincent
 *  Marissal sortait à 5 380 mots au lieu de 223 184 ; neuf élus touchés à la
 *  législature (Dubé, Marissal, Rizqy, Lakhoyan Olivier, Nichols, Blanchette
 *  Vézina, Poulet, Dufour, Lefebvre). Le site, qui range la parole par parti,
 *  n'est pas touché ; la carte, elle, parle d'un élu.
 *  · Interventions et mots : sommés (exact).
 *  · Ton et parts d'enjeux : moyennes pondérées par les mots (approximation :
 *    les parts brutes ne portent pas leur propre dénominateur).
 *  · Richesse lexicale et expression distinctive : ceux de la ligne la plus longue. Un
 *    MATTR ne se moyenne pas, et le niveau est relatif aux autres élus.
 *  Chaque ligne agora est retrouvée par ses mots et interventions, que le
 *  loader recopie tels quels. */
async function fusionnerLignesParParti(data: NonNullable<Awaited<ReturnType<typeof loadAssemblee>>>): Promise<void> {
  type Brute = { period_type: PeriodKey; deputy_id: string | number; n_interventions: number; word_count: number;
                 tone_score: number } & Record<string, unknown>;
  const brutes = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "public/data/agora/agora_decideurs_qc_deputes.json"), "utf8")) as Brute[];
  const groupes = new Map<string, Brute[]>();
  for (const r of brutes) {
    const cle = `${r.period_type}|${r.deputy_id}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), r]);
  }
  let fusions = 0;
  for (const [cle, lignes] of groupes) {
    if (lignes.length < 2) continue;
    const vueP = data.periods[cle.split("|")[0] as PeriodKey];
    if (!vueP) continue;
    const tous = [...vueP.rows.flatMap((x) => x.deputies ?? []), ...(vueP.independants ?? [])];
    const cibles = tous.filter((d) => lignes.some((r) => Number(r.word_count) === d.wordsRaw && Number(r.n_interventions) === d.interventions));
    if (!cibles.length) continue;
    const mots = lignes.reduce((t, r) => t + Number(r.word_count || 0), 0);
    const pond = (f: (r: Brute) => number) => mots > 0 ? lignes.reduce((t, r) => t + f(r) * Number(r.word_count || 0), 0) / mots : 0;
    const principale = [...lignes].sort((x, y) => Number(y.word_count) - Number(x.word_count))[0];
    const modele = cibles.find((d) => d.wordsRaw === Number(principale.word_count)) ?? cibles[0];
    const parts = Object.fromEntries(Object.keys(modele.issueShares).map((k) => [k, pond((r) => Number(r[k] || 0))])) as typeof modele.issueShares;
    for (const d of cibles) {
      d.interventions = lignes.reduce((t, r) => t + Number(r.n_interventions || 0), 0);
      d.wordsRaw = mots;
      d.wordsFormatted = MONTANT.format(mots);
      d.toneScore = pond((r) => Number(r.tone_score || 0));
      d.issueShares = parts;
      d.richnessLevel = modele.richnessLevel;
      d.signatureWord = modele.signatureWord;
      d.signatureWordContext = modele.signatureWordContext;
    }
    // MÊME ÉLU, MÊME PARTI, DEUX GRAPHIES (28-09, données reconstruites) :
    // « Eric Girard » et « Éric Girard », même identifiant et même siège de
    // Lac-Saint-Jean, sortaient en deux lignes du même parti, donc en deux
    // cartes. Dans une même liste de parti, une seule ligne par élu : celle
    // qui porte le plus de mots.
    for (const liste of [...vueP.rows.map((x) => x.deputies ?? []), vueP.independants ?? []]) {
      const doubles = liste.filter((d) => cibles.includes(d));
      if (doubles.length < 2) continue;
      const garde = doubles.includes(modele) ? modele : doubles[0];
      for (const d of doubles) if (d !== garde) liste.splice(liste.indexOf(d), 1);
    }
    fusions++;
  }
  console.log(`  ${fusions} élu·période(s) réunis sur plusieurs lignes de parti`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const periode = (typeof args.periode === "string" ? args.periode : "legislature") as PeriodKey;
  const mention = typeof args.mention === "string" ? args.mention : null;
  const outDir = path.resolve(process.cwd(), typeof args.sortie === "string" ? args.sortie
    : NOM_STYLE ? `social-out/cartes-deputes-${NOM_STYLE}` : "social-out/cartes-deputes");

  // CITATION SUR DEUX LIGNES à l'impression (28-09) : le raffineur publie
  // désormais la phrase entière ; à 95 signes, l'extrait du site en coupait
  // 83 sur 98. 150 signes tiennent sur deux lignes à 30 px.
  if (MODE_IMPRESSION) process.env.VITRINE_CITATION_BUDGET ??= "150";
  const data = await loadAssemblee();
  if (!data) throw new Error("Aucune donnée d'Assemblée : public/data/agora/ est vide ou illisible.");
  await fusionnerLignesParParti(data);
  // ENJEUX EN RÉVISION — retirés des cartes, leur part répartie entre les
  // autres. Les têtes INFER public_lands et defense, calibrées sur la presse,
  // se déclenchent sur les formules de procédure du Salon bleu (« Il n'y a pas
  // de consentement. ») : Terres sortait enjeu dominant de 58 élus sur 129.
  // Le site n'est pas touché. Liste vidée le 28-09 (raffineur recalibré).
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
  const jeu: (typeof jeuBrut[number] & { partiElu?: string })[] = jeuBrut.filter((c) => {
    const partiActuel = PARTI_ACTUEL_PAR_SIEGE[c.slug];
    return !partiActuel || c.cle === partiActuel;
  });
  jeu.sort((a, b) => a.slug.localeCompare(b.slug, "fr"));

  // FIN DE LÉGISLATURE INDÉPENDANTE ⇒ CARTE INDÉPENDANTE (Jules, 23-09). Le
  // loader range un élu sous le parti de ses lignes de parole ; la carte, elle,
  // montre ce qu'il EST au bout de la législature (ou à son départ). Couleur
  // neutre, pas d'écusson ; le parti d'élection reste nommé (« élu CAQ »).
  for (const c of jeu) {
    if (c.cle === "ind" || !finitIndependant(c.deputy)) continue;
    c.partiElu = c.parti;
    c.parti = "Indépendant";
    c.cle = "ind";
    c.couleur = COULEUR_INDEPENDANT;
  }

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
        successeur: `Siège repris par ${nomImprime(occupants[0].deputy.name)} (carte ${rangSiege.get(s)})`,
      });
    }
  }

  const mandats = await chargerMandats();
  let cartes: Carte[] = jeu.map((c) => ({
    ...c, numero: rangSiege.get(siege(c))!, variante: variante.get(c) ?? "",
    // « Législature 2026 · Salon bleu » : le libellé du site ne porte que
    // l'année de fin. La ligne du tableau dit déjà « Législature 2022-2026 » ;
    // l'en-tête n'a donc besoin que du lieu.
    total: sieges.length, salon: periode === "legislature" ? "Salon bleu" : vue.subtitle, annee,
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
  // ACCORD « Élu » / « Élue » : par la fiche de l'Assemblée de chaque carte.
  const genres = await chargerGenres();
  const neutres: string[] = [];
  for (const c of cartes) {
    if (!c.mandat.includes("Élu.e")) continue;
    const g = genres.get(ficheParCarte.get(c)?.assnat_id ?? "");
    if (!g) neutres.push(c.deputy.name);
    c.mandat = accorderGenre(c.mandat, g);
  }
  if (neutres.length) console.warn(`  ⚠️ ${neutres.length} carte(s) gardent « Élu.e », genre inconnu : ${neutres.join(", ")}`);
  const carrieres = await chargerJsonDeputes<Carriere>("carriere-deputes.json");
  for (const c of cartes) {
    const id = ficheParCarte.get(c)?.assnat_id ?? "";
    c.carriere = ligneCarriere(carrieres.get(id), genres.get(id)) || undefined;
    const car = carrieres.get(id);
    if (car) c.carriereStats = { premiere: car.premiere_election, mandats: car.mandats, genre: genres.get(id) };
  }
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
  // Les mots de la LÉGISLATURE, quelle que soit la période des cartes :
  // même élu, retrouvé par nom et circonscription.
  const motsLegislature = new Map<string, number>();
  const vueLeg = data.periods.legislature;
  for (const r of vueLeg ? [...vueLeg.rows.flatMap((x) => x.deputies ?? []), ...(vueLeg.independants ?? [])] : []) {
    motsLegislature.set(`${r.name}|${r.circonscription}`, r.wordsRaw);
  }
  const classes: { c: Carte; mots: number }[] = [];
  for (const c of cartes) {
    const titres = (ficheParCarte.get(c)?.fonctions_legislature ?? []).map((x) => x.titre);
    if (titres.some((t) => /^Premi(?:ère|er) ministre$/.test(t))) { c.rarete = "legendaire"; continue; }
    if (titres.some((t) => /^Président(?:e)? de l’Assemblée nationale$/.test(t))) { c.rarete = "commune"; c.presidente = true; continue; }
    classes.push({ c, mots: motsLegislature.get(`${c.deputy.name}|${c.deputy.circonscription}`) ?? c.deputy.wordsRaw ?? 0 });
  }
  classes.sort((a, b) => b.mots - a.mots || a.c.numero - b.c.numero);
  {
    let i = 0;
    for (const [rarete, part] of PROPORTIONS_RARETE) {
      const n = Math.round(part * classes.length);
      for (let k = 0; k < n && i < classes.length; k++) classes[i++].c.rarete = rarete;
    }
    for (; i < classes.length; i++) classes[i].c.rarete = "commune";
  }
  for (const c of cartes) {
    const f = ficheParCarte.get(c);
    c.codeFonction = codeFonction(f?.fonctions_legislature ?? [], (f?.porte_parole_legislature?.length ?? 0) > 0);
    c.libelleFonction = libelleFonction(c.codeFonction, genres.get(f?.assnat_id ?? ""));
    const ruban = rubanChefParlementaire(f?.fonctions_legislature ?? []);
    if (ruban && !c.chef && !c.depart) c.chef = { titre: ruban };
  }
  const decompte = new Map<Rarete, number>();
  for (const c of cartes) decompte.set(c.rarete ?? "commune", (decompte.get(c.rarete ?? "commune") ?? 0) + 1);
  TOTAL_SERIE = cartes.length;
  SANS_EXPRESSION_SERIE = cartes.filter((c) => !(c.deputy.signatureWord ?? "").trim()).length;
  for (const r of Object.keys(RARETES_SERIE) as Rarete[]) RARETES_SERIE[r] = decompte.get(r) ?? 0;
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
  LOGO_ULAVAL = logos.ulaval;
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
    if (c.rarete === "legendaire") c.signature = await signatureURI(c.slug);
    const fiche = fiches.get(slugCirco(c.deputy)) ?? { [periode]: c.deputy };
    pages.push({ slug: c.slug, html: avecMention(carteHTML(c, portrait, ecusson, logos.capp), mention, "recto") });
    pages.push({ slug: `${c.slug}-verso`, html: avecMention(versoHTML(c, fiche, maxAbs, libelles, portrait, ecusson, logos.vitrine, logos.capp, seance), mention, "verso") });
  }

  // LES DEUX CARTES DU PAQUET : avec la série entière, ou seules (--paquet).
  // Les raretés sont celles de la série complète, calculées avant tout filtre.
  if (args.paquet || (!args.only && !args.echantillon && !(limite > 0))) {
    const paquet = pagesPaquet(logos, TOTAL_SERIE, RARETES_SERIE, SANS_EXPRESSION_SERIE);
    if (args.paquet) pages.length = 0;
    pages.push(...paquet);
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
  const coupes: string[] = [];
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  try {
    // RENDU EN PARALLÈLE — plusieurs onglets puisent dans la même file de
    // pages. Une page à la fois, la série prenait un quart d'heure : chaque page
    // attend ses polices et ses images, et le processeur reste inoccupé pendant
    // ce temps. --parallele N règle le nombre d'onglets (4 par défaut).
    const parallele = Math.max(1, Number(typeof args.parallele === "string" ? args.parallele : 4));
    // Fond perdu et échelle 2 pour les IMAGES seulement : avec --style impression
    // sans --png, on produit d'abord la planche de relecture, dans la mise en
    // page imprimée (VERSO_IMPRESSION_CSS) mais sans fond perdu. L'ancien
    // --impression sort les images directement, comme avant.
    const impression = MODE_IMPRESSION && (!!args.png || !!args.impression);
    const fond = impression ? FOND_PERDU : 0;
    // --echelle N : PNG N fois plus grands pour l'écran (vidéo 4K, zoom), sans
    // le fond perdu ni la réduction de --impression. Le texte et la trame
    // gagnent en netteté ; pas la photo, dont la source fait 150 x 200 px.
    const echelle = ECHELLE_RENDU;
    const onglets = await Promise.all(Array.from({ length: Math.min(parallele, pages.length) }, () =>
      browser.newPage({ viewport: { width: W + 2 * fond, height: H + 2 * fond }, deviceScaleFactor: echelle })));
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
          await page.evaluate(ajusterRubriques);
          await page.evaluate(ajusterLegende);
          await page.evaluate(ajusterFonctions);
          await page.evaluate(ajusterVerso);
          const debord = await page.evaluate(mesurerDebordement);
          if (debord > 0) debordements.push(`${pages[i].slug} (${debord} px)`);
          for (const t of await page.evaluate(mesurerRetours)) retours.push(`${pages[i].slug} : « ${t} »`);
          for (const t of await page.evaluate(mesurerCoupes)) coupes.push(`${pages[i].slug} : ${t}`);
          await action(page, i);
          process.stdout.write(`\r  ${++faits}/${pages.length} ${libelle}`);
        }
      }));
      // L'ordre d'arrivée dépend des onglets : on trie pour un rapport stable.
      debordements.sort();
      retours.sort();
      coupes.sort();
    };
    const rapporterRetours = () => {
      if (!retours.length) return;
      console.warn(`  ⚠️ ${retours.length} ligne(s) d'en-tête coupée(s) sur deux rangs :`);
      for (const r of retours) console.warn(`     · ${r}`);
    };
    const rapporterCoupes = () => {
      if (!coupes.length) return;
      console.warn(`  ⚠️ ${coupes.length} texte(s) tronqué(s) ou masqué(s) :`);
      for (const r of coupes) console.warn(`     · ${r}`);
    };

    // VERROU DE RELECTURE, calqué sur celui des reels. Envoyer une carte à un
    // élu n'est pas rattrapable. Un échantillon ou une carte seule sort
    // directement : on la regarde justement pour décider.
    const cible = args.echantillon || typeof args.only === "string" || !!args.paquet;
    if (args.png || impression) {
      if (!cible) {
        const vue = await fs.readFile(planche, "utf8").catch(() => "");
        if (!vue.includes(`data-empreinte="${empreinte}"`)) {
          throw new Error(
            "PNG non produits : regardez d'abord la planche-contact de cette version.\n" +
            "  Lancez la commande SANS --png, relisez, puis relancez avec --png.",
          );
        }
      }
      const dossierSortie = impression ? path.join(outDir, "impression") : outDir;
      await fs.mkdir(dossierSortie, { recursive: true });
      await rendre(async (page, i) => {
        if (impression) {
          // Après les mesures (elles se font à l'échelle 1, sur la face entière).
          // Le fond perdu doit porter la même couleur ET les mêmes textures (grain,
          // moucheté) que la face, sans couture : on agrandit donc le <body> à la
          // page entière (les textures s'y étirent), et tout le reste de la face
          // est déplacé dans un conteneur réduit et centré. Les textures restent
          // au-dessus (elles sont les derniers enfants du body).
          await page.evaluate(({ W, H, s, mx, my, pw, ph }) => {
            const body = document.body;
            body.style.width = `${pw}px`; body.style.height = `${ph}px`;
            const face = document.createElement("div");
            face.style.cssText = `position:absolute;left:${mx}px;top:${my}px;width:${W}px;height:${H}px;transform:scale(${s});transform-origin:top left`;
            for (const el of Array.from(body.children)) {
              if (el.matches("svg.grain, svg.mouchete")) { (el as HTMLElement).style.width = "100%"; (el as HTMLElement).style.height = "100%"; continue; }
              face.appendChild(el);
            }
            body.prepend(face);
          }, { W, H, s: ECHELLE_IMPRESSION, mx: fond + (W - W * ECHELLE_IMPRESSION) / 2, my: fond + (H - H * ECHELLE_IMPRESSION) / 2, pw: W + 2 * fond, ph: H + 2 * fond });
        }
        await page.screenshot({ path: path.join(dossierSortie, `${pages[i].slug}.png`), type: "png" });
      }, "images");
      console.log(`\n  ${cartes.length} cartes (recto + verso) → ${dossierSortie}${impression ? " (fond perdu 3 mm, 856 ppp)" : ""}`);
      rapporterDebordements(debordements);
      rapporterRetours();
      rapporterCoupes();
      return;
    }

    // Indexées et non poussées : les onglets finissent dans le désordre, la
    // planche doit garder l'ordre de la série.
    const vignettes: string[] = new Array(pages.length);
    await rendre(async (page, i) => {
      const buf = await page.screenshot({ type: "jpeg", quality: 76, scale: "css" });
      vignettes[i] = `data:image/jpeg;base64,${buf.toString("base64")}`;
    }, "vignettes");
    // À l'IMPRESSION, une planche où un texte déborde, est tronqué ou masqué
    // ne porte pas d'empreinte : le verrou refuse alors --png.
    const bloquee = MODE_IMPRESSION && (debordements.length > 0 || coupes.length > 0);
    await fs.writeFile(planche, plancheHTML(pages.map((p) => p.slug), vignettes, bloquee ? "bloquee" : empreinte, vue.tabLabel), "utf8");
    console.log(`\n  planche → ${planche}`);
    console.log(`  ${cartes.length} cartes · ${pages.length} images · cœur de la grille : y ${COEUR.top} → ${COEUR.bottom}`);
    rapporterDebordements(debordements);
    rapporterRetours();
    rapporterCoupes();
    if (bloquee) console.warn("  ⛔ Impression : corriger les cartes ci-dessus avant --png (verrou fermé).");
    if (!args["sans-ouvrir"]) openInBrowser(planche);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
