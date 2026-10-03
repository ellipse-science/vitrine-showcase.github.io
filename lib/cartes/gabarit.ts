// GABARIT des cartes de député : dimensions, tracés, CSS d'impression et
// petits fragments de balisage. Partagé entre le générateur imprimé et le
// site ; pas de DOM, pas de fichiers.
// Origine : scripts/social/cartes-deputes.ts (extraction du 2 oct. 2026).
import { COLORS, txt } from "./dessin";
import type { Rarete } from "./types";

/** « 43e » → « 43<sup>e</sup> » : sur un pied en capitales, « 43E » se lit mal ;
 *  l'exposant garde sa minuscule (cf. .ord). Le recto ne garde que la
 *  législature : avec les années, son pied passait sur deux lignes. */
export function ordinal(html: string): string {
  return html.replace(/(\d+)e\b/g, '$1<sup class="ord">e</sup>');
}

/** LIGNE DE STATISTIQUES du verso (Jules, 26-09) : les libellés EN HAUT,
 *  séparés des chiffres par une fine ligne, des filets verticaux entre les
 *  colonnes. Sert aux blocs Élection et Fiche. `v` est du HTML déjà échappé. */
export function grilleStats(cases: { l: string; v: string }[], colonnes?: string): string {
  return `<div class="stats" style="grid-template-columns:${colonnes ?? `repeat(${cases.length},minmax(0,1fr))`}">${
    cases.map((x, i) => `<span class="${i === 0 ? "c0" : ""}">${txt(x.l).replace(/^&nbsp;/, "")}</span>`).join("")}${
    cases.map((x, i) => `<b class="${i === 0 ? "c0" : ""}">${x.v}</b>`).join("")}</div>`;
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
export const TOPPS = { bande: 30, arrondi: 70 };

/** LA FINE LIGNE (contour de la photo et médaillon) dit la rareté par son
 *  MÉTAL (Jules, 22-09) : argent pour les peu communes, or pour les rares,
 *  diamant pour les légendaires. `uni` sert là où un dégradé est impossible
 *  (ombre du médaillon). */
export const METAUX: Partial<Record<Rarete, { uni: string; arrets: string[] }>> = {
  "peu-commune": { uni: "#B9C0C8", arrets: ["#F2F4F6", "#9AA1AA", "#E6E9ED", "#7C838C"] },
  rare: { uni: "#CDA64C", arrets: ["#F6E3A1", "#C9A24A", "#F3D98A", "#9C7A2E"] },
  legendaire: { uni: "#BFE6FF", arrets: ["#FFFFFF", "#9ED8FF", "#F2FBFF", "#C9B8FF", "#A8F0E6", "#FFFFFF"] },
};

export function degradeMetal(r: Rarete, id = "metal"): string {
  const m = METAUX[r];
  if (!m) return "";
  const n = m.arrets.length - 1;
  // Coordonnées du PANNEAU, pas de chaque tracé : sinon deux tracés qui se
  // rejoignent (coin rempli et contour) n'ont pas la même teinte au raccord.
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${PANNEAU.w}" y2="${PANNEAU.bas - PANNEAU.y}">${m.arrets.map((c, i) => `<stop offset="${(i / n).toFixed(2)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
}

export function degradeMetalCSS(r: Rarete): string {
  const m = METAUX[r];
  return m ? `linear-gradient(135deg,${m.arrets.join(",")})` : "transparent";
}

/** Nombre de fleurs de lys sous la circonscription, au recto (22-09). */
export const FLEURS_PAR_RARETE: Record<Rarete, number> = { commune: 1, "peu-commune": 2, rare: 3, legendaire: 4 };

/** Cadre d'origine (tracé de Jules) : la vague en S réserve le coin supérieur
 *  droit à l'écusson, sur le carton nu. Pour toutes les raretés sauf la rare. */
export function cheminOrigine(ecusson: boolean): string {
  const h = PANNEAU.bas - PANNEAU.y;
  return ecusson
    ? `M 0 0 H 630 C 720 0, 760 170, 855 170 C 915 170, 955 140, 979 150 V ${h} H 0 Z`
    : `M 0 0 H ${PANNEAU.w} V ${h} H 0 Z`;
}

/** Fenêtre de la photo (et du bandeau du nom) des cartes rares : la vague
 *  d'origine du coin, ramenée à l'intérieur du bandeau (même tracé, bords
 *  décalés de `bande`). Sans écusson (indépendants), pas de vague : le coin
 *  supérieur droit est arrondi comme le gauche (Jules, 24-09). */
export function cheminFenetre(ecusson: boolean): string {
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
export function cadreTopps(parti: string, ecusson: boolean): string {
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

export const W = 1071;
export const H = 1496;
// IMPRESSION (--impression). La carte fait 63,5 x 88,9 mm, donc 1071 px = 63,5 mm
// (428 ppp). Le massicot dévie : on dessine 3 mm de FOND PERDU au-delà de la
// coupe, dans la couleur de fond de la face, et on garde le trait du cadre à
// 3 mm en deçà (zone de sécurité). Pour ne rien redessiner, la face entière est
// réduite d'une échelle uniforme et centrée : 3 mm de papier sur les côtés,
// 4,2 mm en haut et en bas, comme le liseré d'une vraie carte. Sortie à
// l'échelle 2 (856 ppp), une image de 69,5 x 94,9 mm.
/** LOGO DE LA VITRINE AU BAS DU VERSO IMPRIMÉ. Essai sur papier de Jules
 *  (28-09) : le logo ne se voyait pas. C'est un dessin au trait de 6 px sur
 *  1 788 de large ; à 9 mm, le trait tombait à 0,09 point, quand une presse
 *  demande 0,25 point au moins, et le nom faisait 0,5 mm de haut. Décision de
 *  Jules : le MONOGRAMME « VD » seul. Il est tiré du logo (aucun fichier du
 *  monogramme n'existe), et son trait est épaissi sans être redessiné. */
export const LOGO_VERSO = { largeur: 57, hauteur: 60, rayon: 10 };
export const FOND_PERDU = 51;                          // 3 mm à 428 ppp
export const ECHELLE_IMPRESSION = (63.5 - 6) / 63.5;   // le cadre à 3 mm de la coupe

/** Fenêtre conservée par la grille du profil Instagram (carré centré). */
export const COEUR = { top: Math.round((H - W) / 2), bottom: Math.round((H + W) / 2) };

/** Le carton. Marge généreuse — un liseré fin se lirait comme l'encadré que
 *  GABARIT.md proscrit ; une vraie bordure de carte, elle, se lit comme le
 *  carton qu'elle imite. */
export const MARGE = 46;
export const PANNEAU = { x: MARGE, y: MARGE, w: W - MARGE * 2, bas: H - 120 };
export const BANDE = 196;
export const PHOTO_H = PANNEAU.bas - BANDE - PANNEAU.y;
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
export const PASTILLE_LEGENDAIRE = { gauche: 78, haut: 1102 };

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
export const LIBELLE_ENJEU_ENTIER: Record<string, string> = {
  "Gouv.": "Gouvernance", "Environ.": "Environnement", "Éduc.": "Éducation",
  "Aff. int.": "International", "Immig.": "Immigration", "Tech.": "Technologie",
};

/** PLANCHER DU TEXTE IMPRIMÉ, en px (30 px = 5 points). Appliqué à la page par
 *  SCRIPT_PLANCHER, quel que soit le sélecteur du gabarit, et lu (data-plancher)
 *  par les fonctions d'ajustement, qui ne rapetissent plus en dessous : ce qui
 *  ne tient pas est signalé, jamais réduit en silence. */
export const PLANCHER_IMPRESSION = 30;
export const SCRIPT_PLANCHER = `<script>(() => {
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
export const RECTO_IMPRESSION_CSS = `
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
export const PANNEAU_BAS_IMPRESSION = 50;
export const VERSO_IMPRESSION_CSS = `
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
  /* Le logo de la Vitrine, au trait épaissi (monogrammeVitrine), sans
     transparence : un trait fin pâlit déjà de lui-même. Plus haut que le
     rang, il le dépasse en haut et en bas, centré sur lui. */
  .logos-bas .marque{flex:0 0 auto;width:${LOGO_VERSO.largeur}px;height:${LOGO_VERSO.hauteur}px;opacity:1;
                     -webkit-mask-position:left center;mask-position:left center}
  .logos-bas .ecusson{width:50px;height:50px;-webkit-mask-position:right center;mask-position:right center}
  .panneau{height:${PANNEAU.bas - PANNEAU.y + PANNEAU_BAS_IMPRESSION}px}
`;

export const FONCTION: Record<Exclude<Rarete, "legendaire">, { largeur: number; carre: number; haut: number }> = {
  commune:       { largeur: 104, carre: 104, haut: 57 },
  "peu-commune": { largeur: 104, carre: 104, haut: 57 },
  rare:          { largeur: 104, carre: 104, haut: 57 },
};

/** LOGOS DES INSTITUTIONS au bas de chaque carte (Jules, 23-09) : le CAPP,
 *  agrandi, et l'Université Laval à côté, séparés d'un filet. Mêmes couleur et
 *  opacité que le CAPP avait seul sur chaque gabarit (règles .marque-capp i). */
export function marquesInstitutions(logoCapp: string | null, logoUlaval: string | null): string {
  const masque = (uri: string) => `-webkit-mask-image:url('${uri}');mask-image:url('${uri}')`;
  const parts = [
    logoCapp ? `<i style="${masque(logoCapp)}"></i>` : "",
    logoCapp && logoUlaval ? `<i class="sep"></i>` : "",
    logoUlaval ? `<i class="ulaval" style="${masque(logoUlaval)}"></i>` : "",
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
export const BULLE = { w: 112, h: 52, ligne: 22, coeur: 52 };
/** Tracé du dessus de la vague, depuis (x, y) = coin supérieur gauche de la
 *  bulle, jusqu'au point où elle rejoint la ligne. Sert au clip-path (origine
 *  locale) et au contour d'encre (coordonnées du panneau). */
export function vagueBulle(x: number, y: number): string {
  const { w, h, coeur } = BULLE;
  // Plat court, puis une S aux points de contrôle bien écartés : l'épaule est
  // ronde et la descente douce, plutôt qu'un quart d'angle (Jules, 24-09).
  return `M ${x} ${y} H ${x + 16} C ${x + coeur + 26} ${y}, ${x + coeur + 8} ${y + h}, ${x + w} ${y + h}`;
}
export function contourEnjeu(marge: number, epaisseur: number): string {
  const haut = PANNEAU.bas - PANNEAU.y - marge - BANDE;
  const g = marge, d = PANNEAU.w - marge;
  const trait = `fill="none" stroke="${COLORS.ink}" stroke-width="${epaisseur}" stroke-linejoin="round" stroke-linecap="square"`;
  return `<path d="${vagueBulle(g, haut - BULLE.h)} H ${d}" ${trait}/>`
    + `<path d="M ${g} ${haut + BULLE.ligne} H ${d}" ${trait}/>`;
}

/** LE GRAIN, en deux couches (voir le verso pour le détail) : le piqué fin de
 *  la trame d'impression et les taches larges du carton recyclé. */
export function grainHTML(): string {
  return `<svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>`;
}
