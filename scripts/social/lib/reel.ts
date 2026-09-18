// Moteur commun des reels : une page HTML animée → des images → un MP4.
//
// POURQUOI UNE PAGE HTML. Les reels reprennent le langage visuel du site
// (papier/encre, Playfair Display, Source Serif, IBM Plex Mono). Le décrire en
// HTML/CSS, c'est le même outil que le site, relisible par toute l'équipe.
//
// POURQUOI IMAGE PAR IMAGE. Filmer la page en temps réel ferait dépendre la
// vidéo de la vitesse de la machine (saccades, animations tronquées). Ici,
// chaque image est posée à un instant exact via `setTime(t)` : les animations
// CSS sont mises en pause puis positionnées à la milliseconde. Deux exécutions
// sur les mêmes données donnent la même vidéo, sur n'importe quel poste.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";
import { chromium, type Browser, type Page } from "playwright";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SymboleEnjeu } from "@/components/interactive/SymboleEnjeu";
import { instantPublicationBloc } from "@/lib/data/headlineEvents";

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
/** Étirement global de la timeline. 1,4 = le rythme validé le 2026-09-16
 *  (« un peu moins rapide » que la première version). Les gabarits décrivent
 *  leurs scènes au rythme de base ; seul ce facteur règle la vitesse. */
export const SLOW = 1.4;

export const SITE_URL = "https://vitrinedemocratique.com";

/** ZONE SÛRE : ce que l'interface d'Instagram laisse voir, MESURÉ le 2026-09-17
 *  dans le simulateur d'iPhone 17 de l'aperçu (bouton « iPhone 17 »), dans les
 *  deux affichages possibles d'un 9:16 sur un écran 19,5:9 :
 *    · AJUSTÉ (barres noires) : rien n'est rogné ; le compte, la légende et le
 *      son couvrent de y 1700 à 1920 ; la colonne de boutons, x 992-1057 ;
 *    · PLEIN ÉCRAN (agrandi pour remplir) : 98 px rognés À GAUCHE ET À DROITE ;
 *      le bas est couvert dès y 1560 ; la colonne de boutons dès x 909.
 *  On tient dans l'union des deux :
 *    · haut 150 px    : l'heure, l'îlot dynamique et « Reels » tombent sur la
 *      bande noire — c'est en haut qu'on perd le moins ;
 *    · bas 380 px     : compte, légende, son ;
 *    · côtés 110 px   : le rognage du plein écran ;
 *    · boutons        : rien à droite de x 900 entre y 1040 et le bas.
 *  ⚠️ Remplace les marges « organiques » des guides (300/450/60/120), trop
 *  prudentes en haut et trop permissives sur les côtés : c'est le simulateur,
 *  pas un guide, qui donne la vraie forme (Jules Piral, 2026-09-17).
 *  RÈGLE : toute INFORMATION (texte, chiffre, graphique) tient dans cette zone ;
 *  seul le décor (`data-deco`) peut en sortir. L'aperçu les trace en rouge. */
export const SAFE = { top: 150, bottom: HEIGHT - 380, left: 110, right: WIDTH - 110, buttonsTop: 1040, buttonsLeft: WIDTH - 180 };

/** BARRE DE MARQUE : logos de la Vitrine et du CAPP, sur TOUTES les scènes de
 *  tous les reels, en bas de la zone sûre (visible sur le téléphone). Le contenu
 *  des scènes s'arrête au-dessus (CONTENT_BOTTOM) : checkFrame le vérifie. */
/** ⚠️ LA BARRE DE MARQUE PASSE EN HAUT (Jules Piral, 2026-09-17) : en plein écran
 *  sur iPhone, le bas du reel est pris par le voile d'Instagram, la légende et la
 *  barre de navigation — les logos y viraient au gris. En haut, sous la caméra,
 *  rien ne les couvre. L'édition se place sous les deux logos. */
export const BRAND = { top: SAFE.top, height: 62 };
export const CONTENT_TOP = BRAND.top + BRAND.height + 62;
export const CONTENT_BOTTOM = SAFE.bottom;

export type Logos = { vitrine: string; capp: string };

/** Logos officiels du site (public/images/brand/), noirs sur fond transparent.
 *  Leurs marges vides sont rognées pour que la hauteur affichée soit celle du
 *  dessin. */
export async function loadLogos(): Promise<Logos> {
  const sharp = (await import("sharp")).default;
  const dir = path.resolve(process.cwd(), "public", "images", "brand");
  const uri = async (file: string) => {
    const png = await sharp(path.join(dir, file)).trim().png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  };
  return {
    vitrine: await uri("logo_vitrinedemocratique_bg-none_theme-black.png"),
    capp: await uri("logo_capp_1row_bg-none_theme-black.png"),
  };
}

/** Taille minimale d'un texte, en px du reel. Un téléphone affiche le reel à
 *  ~36 % (390 points de large pour 1080 px) : 26 px ≈ 9,5 points à l'écran.
 *  28 depuis le dézoom du 2026-09-17 : les scènes sont réduites de 6 %, donc
 *  28 px écrits font 26 px vus. */
export const MIN_FONT = 28;

/** MARGE DE BORD. ⚠️ L'encadré dessiné a été RETIRÉ le 2026-09-17 (Jules Piral :
 *  « je crois que l'encadré autour est une mauvaise idée, dépendamment de
 *  l'affichage ça va avoir l'air coupé ») : un filet collé au bord se lit comme
 *  une erreur dès que la plateforme rogne l'image. Le DÉCOR (`data-deco` :
 *  bandeaux, illustrations, aplats) va donc jusqu'aux bords ; le reste garde
 *  cette marge, que `checkFrame` vérifie. */
export const FRAME = { left: 30, top: 30, right: WIDTH - 30, bottom: HEIGHT - 30 };

/** LE CŒUR : le carré central (1080 × 1080) que montrent la grille du profil et
 *  l'aperçu du fil, avant qu'on ouvre le reel. RÈGLE (Jules Piral, 2026-09-17) :
 *  l'ESSENTIEL de chaque scène — LA statistique, LE résultat — tient là ; le
 *  reste (surtitre, note de méthode, légende) vit au-dessus et au-dessous, et
 *  n'apparaît qu'en plein écran. Une scène marque son essentiel avec
 *  `data-cle` ; `checkFrame` refuse la vidéo si cet élément déborde du cœur. */
export const COEUR = { top: Math.round((HEIGHT - WIDTH) / 2), bottom: Math.round((HEIGHT + WIDTH) / 2) };

/** Palette du site (app/globals.css) et bandes de saillance
 *  (lib/shareCardTemplate.tsx, rangs calibrés 1 à 6). */
export const COLORS = {
  paper: "#F3ECDD",
  deep: "#ECE3CF",
  ink: "#1C1917",
  soft: "#433F38",
  softer: "#6E685F",
  rule: "#C8BDA6",
  blue: "#224F7D",
  red: "#A8302C",
};
export const SALIENCE_COLORS: Record<number, { bg: string; fg: string }> = {
  1: { bg: "#E4DCC6", fg: COLORS.ink },
  2: { bg: "#DCCBA2", fg: COLORS.ink },
  3: { bg: "#D2B488", fg: COLORS.ink },
  4: { bg: "#C99A76", fg: COLORS.ink },
  5: { bg: "#BE7C6A", fg: COLORS.paper },
  6: { bg: "#A85A52", fg: COLORS.paper },
};

/** Fleur de lys du site (même tracé que lib/shareCardTemplate.tsx). */
export const FLEUR_PATH =
  "M297.69,147.804c-47.642-5.459-97.763,27.791-107.192,94.289c-0.329,2.318-0.605,4.685-0.824,7.076h-2.81c4.056-45.102,22.727-76.399,33.905-97.214c14.49-26.98,2.729-53.559-2.997-65.452C211.276,73.013,181.848,18.486,174.354,0c-7.494,18.486-36.702,73.013-43.198,86.503c-5.728,11.893-17.488,38.472-2.998,65.452c11.103,20.673,29.87,52.316,34.226,97.214h-3.208c-0.219-2.392-0.495-4.758-0.824-7.076c-9.43-66.499-59.551-99.748-107.192-94.289c-53.284,6.105-81.882,90.319,0.496,110.666c-13.399-24.813,7.443-69.477,55.583-44.167c15.656,8.232,26.561,21.383,31.072,34.866h-8.065c-7.608,0-13.776,4.469-13.776,9.983c0,5.514,6.168,9.983,13.776,9.983h9.817c-0.803,4.348-2.456,8.464-5.034,12.162c-11.416,16.377-49.649,7.444-28.31-28.286c-36.065-4.747-45.649,29.279-35.228,47.641c11.453,23.411,61.479,30.428,80.41-2.978c4.54-8.012,6.819-18.047,7.555-28.539h3.864c-0.033,7.932-0.53,16.224-1.59,24.887c-12.647,8.146-7.717,25.725-23.735,36.234c10.062,0.265,18.271-1.708,20.92-5.415c0,10.75,9.617,19.812,15.886,32.858c5.824-13.119,15.208-24.094,15.208-32.858c2.648,3.707,10.857,5.68,20.92,5.415c-14.687-9.01-8.898-25.516-23.261-37.306c-1.015-8.293-1.508-16.22-1.589-23.815h3.312c0.735,10.492,3.016,20.527,7.555,28.539c18.931,33.405,68.957,26.389,80.41,2.978c10.422-18.361,0.838-52.388-35.228-47.641c21.34,35.73-16.894,44.663-28.31,28.286c-2.577-3.698-4.23-7.814-5.033-12.162h10.572c7.608,0,13.776-4.47,13.776-9.983c0-5.515-6.168-9.983-13.776-9.983h-8.821c4.512-13.483,15.416-26.634,31.072-34.866c48.14-25.31,68.982,19.354,55.583,44.167C379.573,238.124,350.974,153.91,297.69,147.804z";

export function fleur(color: string, size: number): string {
  return `<svg viewBox="-0.864 -0.333 350 359" width="${size}" height="${Math.round(size * 1.03)}"><path fill="${color}" d="${FLEUR_PATH}"/></svg>`;
}

/** Pictogrammes des six éditions, repris de l'en-tête du site
 *  (static-content/top.html) : pleine lune 0h, lune 4h, petit soleil 8h,
 *  soleil plein 12h, soleil 16h, croissant inversé 20h. */
const RAYS = (r: number, w: number, a: number, b: number, c: number, d: number) =>
  `<circle cx="12" cy="12" r="${r}" fill="currentColor"/><g stroke="currentColor" stroke-width="${w}" stroke-linecap="round">` +
  `<line x1="12" y1="${a}" x2="12" y2="${b}"/><line x1="12" y1="${24 - b}" x2="12" y2="${24 - a}"/>` +
  `<line x1="${a}" y1="12" x2="${b}" y2="12"/><line x1="${24 - b}" y1="12" x2="${24 - a}" y2="12"/>` +
  `<line x1="${c}" y1="${c}" x2="${d}" y2="${d}"/><line x1="${24 - d}" y1="${24 - d}" x2="${24 - c}" y2="${24 - c}"/>` +
  `<line x1="${c}" y1="${24 - c}" x2="${d}" y2="${24 - d}"/><line x1="${24 - d}" y1="${d}" x2="${24 - c}" y2="${c}"/></g>`;
const MOON = `<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" fill="currentColor"/>`;
const CELESTIAL: Record<number, string> = {
  0: `<circle cx="12" cy="12" r="7.4" fill="currentColor"/>`,
  4: MOON,
  8: RAYS(3.5, 1.2, 4, 5.5, 6.3, 7.4),
  12: RAYS(5, 1.4, 1.5, 4, 4.4, 6.3),
  16: RAYS(4.3, 1.3, 2.5, 4.5, 5.2, 6.6),
  20: `<g transform="translate(24,0) scale(-1,1)">${MOON}</g>`,
};

export function celestial(hour: number, color: string, size: number): string {
  const h = (Math.round(hour / 4) * 4) % 24;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}">${CELESTIAL[h]}</svg>`;
}

/** Pictogramme d'un des 12 enjeux du CAP, rendu par le composant même du site
 *  (components/interactive/SymboleEnjeu.tsx) : un dessin modifié là-bas l'est
 *  ici aussi. Chaîne vide pour un enjeu inconnu, comme le composant. */
export function enjeuGlyph(cle: string | null | undefined, color: string, size: number): string {
  return renderToStaticMarkup(createElement(SymboleEnjeu, { cle, style: { width: size, height: size, color, display: "block" } }));
}

/** Heure de PUBLICATION (Montréal, 0-23) d'un bloc de données (`2026-09-16T15`),
 *  même règle que le site (instantPublicationBloc : fin du bloc + 1 h). */
export function publicationHour(blockUtc: string): number | null {
  const iso = instantPublicationBloc(blockUtc);
  if (!iso) return null;
  const h = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(iso));
  return parseInt(h, 10);
}

/** Échappement HTML : les titres et résumés viennent des données. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Typographie OQLF (AGENTS.md règle #7) sur un texte déjà échappé :
 *  insécable avant « : » et « % », pas d'espace avant « ; ? ! ». */
export function typo(s: string): string {
  return s
    .replace(/\s*:(?=\s|$)/g, "&nbsp;:")
    .replace(/\s*%/g, "&nbsp;%")
    .replace(/\s+([;?!])/g, "$1");
}

/** Texte issu des données, prêt à insérer dans le gabarit. */
export function txt(s: string): string {
  return typo(esc(s));
}

/** Nombre à la française (virgule décimale). */
export function frNum(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace(".", ",");
}

export type Scene = {
  id: string;
  /** Durée au rythme de base, en secondes (avant SLOW). */
  duration: number;
  html: string;
  /** Pas de fondu d'entrée (première scène) ou de sortie (dernière). */
  noFadeIn?: boolean;
  noFadeOut?: boolean;
  /** Masque la ligne d'édition commune quand la scène porte déjà cette information. */
  hideEdition?: boolean;
  /** Masque les logos communs quand la scène affiche déjà le grand logo de marque. */
  hideBrand?: boolean;
};

const BASE_CSS = `
:root{--paper:${COLORS.paper};--deep:${COLORS.deep};--ink:${COLORS.ink};--soft:${COLORS.soft};--softer:${COLORS.softer};--rule:${COLORS.rule};--blue:${COLORS.blue};--red:${COLORS.red}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:var(--paper)}
body{font-family:"Source Serif 4",serif;color:var(--ink);position:relative}
.mono{font-family:"IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase}
.disp{font-family:"Playfair Display",serif;font-weight:900;letter-spacing:-.02em}
.pf{font-family:"Playfair Display",serif;font-weight:700}
/* CONTENU GÉOMÉTRIQUEMENT CENTRÉ (Jules Piral, 2026-09-17 : « c'est bizarre qu'à
   droite il n'y ait rien parce que les boutons de like sont là, alors qu'à gauche
   il y a de l'information »). La colonne va de x 180 à x 900 — la limite de la
   colonne de boutons — donc elle est SYMÉTRIQUE par rapport au milieu de l'image.
   L'alignement typographique reste propre à chaque scène : le centrer globalement
   tassait tous les niveaux de lecture dans une même pile verticale. */
/* CONTENU CENTRÉ (Jules Piral, 2026-09-17). La colonne va de x 180 à x 900 — la
   limite de la colonne de boutons d'Instagram — donc elle est symétrique par
   rapport au milieu de l'image, et le texte est centré. Une ligne de données
   (liste de médias, rangs) peut redevenir alignée à gauche : elle se lit en
   colonnes, pas en paragraphe. */
.scene{position:absolute;inset:0;padding:120px 180px;text-align:center;opacity:0}
/* LA ZONE UTILE : de CONTENT_TOP à CONTENT_BOTTOM, entre les deux marges
   latérales. Une scène y empile ses blocs et la colonne les répartit sur toute
   la hauteur utile — sans ça, tout se tasse en haut et le bas reste vide.
   Elle s'arrête au BAS DU CARRÉ CENTRAL (y 1500), pas à la limite de la zone
   sûre : ce qui porte data-cle doit rester dans le carré vu dans la grille
   (Jules Piral, 2026-09-17 : « tout est pogné en moton »). Le nom est long
   exprès : « colonne » et « pile » existent déjà dans des scènes, et une classe
   globale en position:absolute les empilait toutes au même endroit. */
.zone-utile{position:absolute;left:180px;right:180px;top:${CONTENT_TOP}px;bottom:${HEIGHT - COEUR.bottom}px;display:flex;flex-direction:column;justify-content:space-between;gap:26px}
.zone-utile .grandir{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
/* ⚠️ Le pied de page était à 70 px du bas : en plein écran sur iPhone, il tombait
   DERRIÈRE la barre de navigation d'Instagram (Jules Piral, 2026-09-17). Il remonte
   dans la zone sûre, juste au-dessus des logos, et ne garde que l'édition. */
/* L'édition passe SOUS les logos : les deux logos et le texte ne tenaient pas sur
   une ligne dans la colonne centrée, et le CAPP se faisait rogner. */
.edition{position:absolute;left:180px;right:180px;top:${BRAND.top + BRAND.height + 10}px;text-align:center;font-size:28px;letter-spacing:.06em;color:var(--softer);z-index:45}
.brandbar{position:absolute;left:180px;right:180px;display:flex;align-items:center;justify-content:center;gap:44px;z-index:45}
.brandbar img{display:block}
.progress{position:absolute;left:${SAFE.left}px;top:128px;height:8px;width:${SAFE.right - SAFE.left}px;background:var(--blue);transform-origin:left;z-index:60}
@keyframes fadeUp{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:none}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes slam{from{opacity:0;transform:scale(1.3)}to{opacity:1;transform:scale(1)}}
@keyframes wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes pop{0%{opacity:0;transform:scale(.6)}70%{transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}

/* Le logo et son iridescence (logoAnime). */
.logo-irise{position:relative;display:block}
.logo-irise img{display:block;width:100%}
.logo-irise .tache{position:absolute;left:36%;top:-10%;width:30%;height:120%;filter:blur(34px);opacity:.85;
  background:
    radial-gradient(42% 42% at 32% 22%, #F0C3DD 0%, rgba(240,195,221,0) 70%),
    radial-gradient(42% 42% at 68% 34%, #C6E2F4 0%, rgba(198,226,244,0) 70%),
    radial-gradient(46% 46% at 46% 72%, #F4E3AE 0%, rgba(244,227,174,0) 70%),
    radial-gradient(38% 38% at 74% 76%, #C7E9D6 0%, rgba(199,233,214,0) 70%);
  animation:respire 7s ease-in-out infinite alternate}
.logo-irise .passe{position:absolute;inset:0;
  -webkit-mask-image:var(--logo);mask-image:var(--logo);
  -webkit-mask-size:100% 100%;mask-size:100% 100%;
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  background:linear-gradient(100deg,rgba(0,0,0,0) 36%,#E79FC6 44%,#8FCFEE 50%,#F3DE95 56%,#A9DFC4 62%,rgba(0,0,0,0) 70%);
  background-size:260% 100%;background-position:135% 0;
  animation:traverse 2.6s cubic-bezier(.4,0,.2,1) both}
@keyframes respire{from{transform:translateX(-10px) scale(1)}to{transform:translateX(12px) scale(1.07)}}
@keyframes traverse{from{background-position:135% 0}to{background-position:-35% 0}}
`;

/** Assemble la page complète. `css` et `script` sont propres au gabarit ;
 *  `script` peut définir `window.onSceneTime(id, local)` pour les effets que
 *  CSS ne sait pas rendre (compteurs, zoom lent). */
/** LE LOGO, TRAVERSÉ PAR L'IRIDESCENCE (demande d'Adrien, 2026-09-16, d'après
 *  la version iridescente de la page « Vitrine — Image de marque »).
 *
 *  Deux couches, et le tracé noir reste le tracé noir :
 *   · derrière la marque, une tache irisée floue qui respire lentement — c'est
 *     ce qu'on voit sur la version fixe de la charte ;
 *   · par-dessus, une bande irisée qui TRAVERSE le logo de droite à gauche,
 *     découpée par le PNG lui-même (`mask-image`) : seuls les traits s'allument,
 *     jamais le papier autour. Le PNG sert de gabarit, donc le calage est exact
 *     par construction — aucun tracé à redessiner.
 *
 *  `passe` : le moment (en secondes) où la bande traverse. `taille` : largeur du
 *  logo en px. */
export function logoAnime(logo: string, opts: { classe: string; taille: number; passe: number }): string {
  return `<div class="logo-irise ${opts.classe}" style="--logo:url('${logo}');width:${opts.taille}px">
    <div class="tache" data-deco></div>
    <img src="${logo}" alt="La Vitrine démocratique">
    <div class="passe" style="animation-delay:${opts.passe}s"></div>
  </div>`;
}

/** L'ÉDITION TIENT SUR DEUX LIGNES VOULUES — l'heure, puis la date. En une
 *  seule ligne, « Édition de 16h · Jeudi 17 septembre 2026 » fait 960 px de
 *  mono espacé pour 884 px utiles : elle se repliait toute seule et laissait
 *  « 2026 » orphelin sous le reste (vu par Adrien sur l'édition de 16h du
 *  17-09). Deux lignes tiennent quelle que soit la date — « Mercredi
 *  30 septembre » est le pire cas. */
function edition(texte: string): string {
  const [heure, ...reste] = texte.split(" · ");
  const date = reste.join(" · ");
  return `<b>${typo(esc(heure))}</b>${date ? `<span>${typo(esc(date))}</span>` : ""}`;
}

/** ACCROCHE, COMMUNE À TOUS LES REELS (demande d'Adrien, 2026-09-16 : « chaque
 *  reel de chaque module devrait avoir la même intro, mais adaptée »).
 *  Même structure partout — logo, filet et nom du module, trois lignes qui
 *  tombent UNE PAR UNE, un visuel propre au module en bas, l'édition — et une
 *  seule chose change : les lignes, le visuel et la couleur. Les trois lignes
 *  arrivent séparément parce que chacune doit porter : c'est le rythme de
 *  l'accroche, pas une animation décorative. */
export function sceneIntro(opts: {
  logo: string | null;
  module: string;
  accent: string;
  lignes: { t: string; accent?: boolean; c?: string }[];
  /** Le visuel du bas, propre au module (HTML), posé dans le bandeau d'encre. */
  visuel: string;
  edition: string;
}): Scene {
  const L0 = 0.75, PAS = 0.62;
  const lignes = opts.lignes.map((l, i) => {
    const couleur = l.c ?? (l.accent ? opts.accent : "");
    return `<span style="${couleur ? `color:${couleur};` : ""}animation:fadeUp .55s ${L0 + i * PAS}s both">${typo(esc(l.t))}</span>`;
  }).join("");
  return {
    id: "intro", duration: L0 + opts.lignes.length * PAS + 1.9, noFadeIn: true, hideEdition: true, hideBrand: true,
    html: `
      ${opts.logo ? `<div class="logo" style="animation:fadeIn .6s .1s both">${logoAnime(opts.logo, { classe: "", taille: 540, passe: 1.1 })}</div>` : ""}
      <div class="module mono" style="animation:fadeIn .5s .35s both"><i style="background:${opts.accent};animation:grow .6s .35s both"></i>${typo(esc(opts.module))}</div>
      <h1 class="disp" data-cle>${lignes}</h1>
      <div class="band" data-deco style="animation:fadeIn .4s ${L0 + .3}s both">${opts.visuel}</div>
      <div class="ed mono" style="animation:fadeIn .5s ${L0 + opts.lignes.length * PAS + .2}s both">${edition(opts.edition)}</div>`,
  };
}

/** CSS de l'accroche — à concaténer au CSS du module. */
export const INTRO_CSS = `
#intro .logo{position:absolute;top:288px;left:270px;width:540px}
#intro .module{position:absolute;top:474px;left:180px;right:180px;display:flex;justify-content:center;align-items:center;gap:20px;font-size:28px;color:var(--soft)}
#intro .module i{display:block;width:120px;height:10px;transform-origin:left}
#intro h1{position:absolute;top:540px;left:180px;right:180px;font-size:104px;line-height:1.02;font-family:"Playfair Display",serif;font-weight:900;letter-spacing:-.02em}
#intro h1 span{display:block}
#intro .band{position:absolute;left:180px;right:180px;bottom:30px;height:700px;background:var(--ink);overflow:hidden}
/* DANS le bandeau d'encre (haut à y 1190), pas au-dessus : à bottom:760 (#823)
   la ligne tombait sur le papier, en couleur papier — invisible (20h du 17-09).
   À 600, ses deux lignes finissent à y 1320, 50 px sous le haut du bandeau et
   50 px au-dessus des barres fantômes. */
#intro .ed{position:absolute;left:180px;right:180px;bottom:600px;color:var(--paper);font-size:30px}
#intro .ed b{display:block;font-weight:400}
#intro .ed span{display:block;margin-top:12px;opacity:.72}
`;

/** Scène de fin, commune à tous les reels : logo, signature, adresse et le
 *  bandeau bleu des six éditions avec celle du moment en surbrillance. Un seul
 *  endroit à corriger le jour où la marque bouge. Son CSS est dans FIN_CSS. */
/** Les dix partenaires du site, dans l'ordre de `app/apropos/partenaires`
 *  (Adrien, 2026-09-16). Chargés en data URI : la page de rendu est autonome. */
/** TOUS LES LOGOS EN BLANC (Jules Piral, 2026-09-17 : « pas de couleurs, tout
 *  en blanc »). Le CSS passe chaque logo en silhouette (`brightness(0)
 *  invert(1)`), ce qui ne marche que pour un tracé sur fond transparent. Deux
 *  fichiers du site n'en sont pas, on en découpe le tracé ici :
 *   · la Chaire est en couleurs, avec des séparations gris clair et une bulle
 *     blanche : en silhouette, une tache. On garde ce qui est foncé ou coloré
 *     (texte, quartiers, contour) et on efface le clair ;
 *   · LLM Tool est un bandeau (fond noir, bandes de couleur, sous-titres) : on
 *     n'en garde que le mot « LLM TOOL », tout ce qui n'est pas le fond noir. */
async function traceSeul(buf: Buffer, garder: (lum: number) => boolean, zone?: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const base = zone ? sharp(buf).extract(zone) : sharp(buf);
  const { data, info } = await base.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = 0;
    if (!garder(lum)) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png().toBuffer();
}

export async function chargerPartenaires(): Promise<string[]> {
  const dir = path.resolve(process.cwd(), "public", "images", "partners");
  const fichiers = [
    "ChaireQuebecCitoyennete.png", "CLESSN-nobg.png", "ULaval.png", "cegepgarneau-nobg.png",
    "CECD-nobg.png", "GRCP-nobg.png", "Unicorne.png", "Infoscope-nobg.png",
    "llm-tool.png", "aws.svg",
  ];
  const out: string[] = [];
  for (const f of fichiers) {
    try {
      const buf = await fs.readFile(path.join(dir, f));
      const trace = f === "ChaireQuebecCitoyennete.png" ? await traceSeul(buf, (lum) => lum < 200)
        : f === "llm-tool.png" ? await traceSeul(buf, (lum) => lum > 60, { left: 95, top: 105, width: 1140, height: 200 })
        : buf;
      out.push(`data:${f.endsWith(".svg") ? "image/svg+xml" : "image/png"};base64,${trace.toString("base64")}`);
    } catch { /* un logo manquant n'empêche pas la vidéo */ }
  }
  return out;
}

export function sceneFin(opts: { pubHour: number; signature: string; logo: string | null; accent?: string; partenaires?: string[] }): Scene {
  const now = opts.pubHour % 24;
  // ⚠️ L'heure en cours prend la COULEUR DU MODULE, pas le bleu du gabarit
  // (retour de Jules Piral, 2026-09-16 : « les pictogrammes de l'heure sont
  // encore bleus »). Le bleu ne vaut plus que pour le Québec, à l'intérieur des
  // modules qui opposent deux régions.
  const accent = opts.accent ?? COLORS.blue;
  const hours = [0, 4, 8, 12, 16, 20].map((h, i) => {
    const style = h === now
      ? `background:${accent};border-color:${accent};color:${COLORS.paper};animation:pop .4s ${1.2 + i * .12}s both`
      : `border-color:${accent};animation:pop .4s ${1.2 + i * .12}s both`;
    return `<div class="mono" style="${style}">${celestial(h, "currentColor", 36)}${h}h</div>`;
  }).join("");
  const logos = (opts.partenaires ?? []).map((src, i) => {
    return `<img src="${src}" alt="" style="animation:fadeIn .5s ${1.9 + i * .05}s both">`;
  }).join("");
  return {
    id: "fin", duration: 4.8, noFadeOut: true, hideEdition: true, hideBrand: true,
    html: `
      <div class="kick mono" style="animation:fadeIn .5s .35s both">${typo(esc(opts.signature))}</div>
      ${opts.logo
        ? `<div class="logo" style="animation:pop .7s .1s both">${logoAnime(opts.logo, { classe: "", taille: 640, passe: .9 })}</div>`
        : `<div style="animation:pop .7s .1s both">${fleur(COLORS.blue, 220)}</div>`}
      <div class="metho mono" style="animation:fadeIn .5s .7s both">Méthodologie complète au</div>
      <div class="url disp" style="animation:fadeUp .7s .8s both">vitrinedemocratique.com</div>
      <div class="six" style="animation:fadeIn .6s 1.1s both">Six éditions par jour</div>
      <div class="hours">${hours}</div>
      ${logos ? `<div class="foot" style="${opts.accent ? `background:${opts.accent};` : ""}animation:growY .8s 1.5s both"><div class="part mono" style="animation:fadeIn .5s 1.9s both">Nos partenaires</div><div class="logos">${logos}</div></div>` : ""}`,
  };
}

/** CSS de la scène de fin — à concaténer au CSS du module.
 *  LES PARTENAIRES ONT LE CARRÉ DE COULEUR POUR EUX (Adrien, 2026-09-16) :
 *  l'horaire des six éditions est sur le papier, les logos dans le bandeau.
 *  Format strict (Jules Piral, 2026-09-16) : 120 px à droite sous le tiers, le
 *  contenu s'arrête au-dessus de la barre de logos Vitrine + CAPP. */
export const FIN_CSS = `
#fin{display:flex;flex-direction:column;align-items:center;text-align:center;padding:300px 180px 0}
#fin .kick{font-size:28px;color:var(--soft)}
#fin .logo{width:600px;margin-top:14px}
#fin .metho{font-size:28px;margin-top:26px;color:var(--soft)}
#fin .url{font-size:58px;margin-top:8px;border-bottom:6px solid currentColor;padding-bottom:8px}
#fin .six{font-size:34px;font-style:italic;margin-top:24px;color:var(--soft)}
#fin .hours{display:flex;gap:10px;margin-top:14px}
#fin .hours div{width:114px;padding:10px 0 8px;border:3px solid;font-size:28px;display:flex;flex-direction:column;align-items:center;gap:6px}
#fin .foot{position:absolute;left:180px;right:180px;top:1010px;display:flex;flex-direction:column;align-items:center;padding:30px 34px 36px;background:var(--blue);transform-origin:top}
#fin .part{font-size:28px;color:rgba(243,236,221,.8)}
#fin .logos{margin-top:20px;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:24px 40px}
#fin .logos img{height:56px;width:auto;max-width:220px;object-fit:contain;filter:brightness(0) invert(1);opacity:.95}
`;

/** Couleurs d'un reel : le fond (papier du module) et l'accent (barre de
 *  progression, filets de marque, bandeau de fin). Les tons dérivés — fond des
 *  éléments éteints, filets — se calculent à partir du fond, pour rester lisibles
 *  quel que soit le papier. Palettes : `papier` et `accent` de lib/modules.ts. */
export type Theme = { paper: string; accent?: string };

/** Ton sémantique commun à tous les reels : vert = favorable, rouge = défavorable. */
export const TONE = { positive: "#4E7A43", negative: "#B0473A", neutral: "#6E685F" } as const;

export function buildPage(opts: { title: string; css: string; scenes: Scene[]; footerLeft: string; footerRight: string; script?: string; theme?: Theme; logos?: Logos }): string {
  let t = 0;
  const timeline = opts.scenes.map((s) => {
    const entry = { id: s.id, start: t, end: t + s.duration, fadeIn: !s.noFadeIn, fadeOut: !s.noFadeOut, hideEdition: !!s.hideEdition, hideBrand: !!s.hideBrand };
    t += s.duration;
    return entry;
  });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Source+Serif+4:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=block" rel="stylesheet">
<style>${BASE_CSS}${opts.theme ? `:root{--paper:${opts.theme.paper};--deep:color-mix(in srgb, ${opts.theme.paper}, #000 7%);--rule:color-mix(in srgb, ${opts.theme.paper}, #000 20%);${opts.theme.accent ? `--blue:${opts.theme.accent};` : ""}}` : ""}${opts.css}</style></head><body>
<div class="progress" id="__prog"></div>
${opts.scenes.map((s) => `<section class="scene" id="${s.id}">${s.html}</section>`).join("\n")}
${opts.footerRight ? `<div class="edition mono" id="__ed">${esc(opts.footerRight)}</div>` : ""}
${opts.logos ? `<div class="brandbar" id="__brand" style="top:${BRAND.top}px;height:${BRAND.height}px"><img src="${opts.logos.vitrine}" alt="La Vitrine démocratique" style="height:${BRAND.height}px"><img src="${opts.logos.capp}" alt="CAPP, Centre d’analyse des politiques publiques" style="height:${Math.round(BRAND.height * 0.5)}px"></div>` : ""}
<script>
${opts.script ?? ""}
const TIMELINE=${JSON.stringify(timeline)};
const BASE=${t};
function seek(t){
  let editionOpacity=1,brandOpacity=1;
  for(const s of TIMELINE){
    const el=document.getElementById(s.id), local=t-s.start, fade=.35;
    let o=0;
    if(t>=s.start&&t<s.end){o=1;if(s.fadeIn)o=Math.min(o,local/fade);if(s.fadeOut)o=Math.min(o,(s.end-t)/fade);}
    if(!s.fadeOut&&t>=s.end)o=1;
    el.style.opacity=o;
    if(o===0)continue;
    if(s.hideEdition)editionOpacity=Math.min(editionOpacity,1-o);
    if(s.hideBrand)brandOpacity=Math.min(brandOpacity,1-o);
    el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=Math.max(0,local)*1000});
    if(window.onSceneTime)window.onSceneTime(s.id,Math.max(0,local),s.end-s.start);
  }
  const brand=document.getElementById("__brand");if(brand)brand.style.opacity=brandOpacity;
  const ed=document.getElementById("__ed");if(ed)ed.style.opacity=editionOpacity;
  document.getElementById("__prog").style.transform="scaleX("+Math.min(1,t/BASE)+")";
}
window.DURATION=BASE*${SLOW};
window.setTime=t=>seek(t/${SLOW});
seek(0);
</script></body></html>`;
}

/** Lecteur de prévisualisation : la page du reel dans un cadre à l'échelle de
 *  la fenêtre, avec lecture, défilement, saut de scène, vitesse et zones
 *  masquées par l'interface Instagram. C'est la MÊME page que celle qui est
 *  filmée pour le MP4, pilotée par le même `setTime` : ce qu'on voit ici est
 *  ce que la vidéo contiendra. */
export function buildPlayer(reelHtml: string, scenes: Scene[], title: string): string {
  let t = 0;
  const marks = scenes.map((s) => { const m = { id: s.id, start: t * SLOW }; t += s.duration; return m; });
  const duration = t * SLOW;
  // `</` échappé : la page du reel voyage dans une chaîne JS, dans un <script>.
  const payload = JSON.stringify(reelHtml).replace(/<\//g, "<\\/");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aperçu · ${esc(title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;height:100vh;background:#1C1917;color:#F3ECDD;font:14px "IBM Plex Mono",ui-monospace,monospace;display:flex;gap:28px;align-items:center;justify-content:center;padding:20px}
#stage{position:relative;flex:none;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#stage iframe{position:absolute;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;border:0;transform-origin:0 0}
#safe{position:absolute;left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;transform-origin:0 0;pointer-events:none;display:none}
#safe div{position:absolute;background:rgba(220,40,40,.28);outline:1px dashed rgba(255,80,80,.9)}
#safe div.coeur{background:transparent;outline:2px solid rgba(80,180,255,.95)}
#panel{width:320px;display:flex;flex-direction:column;gap:14px}
/* SIMULATEUR D'IPHONE 17 (Jules Piral, 2026-09-17) : écran 1206 × 2622 (19,5:9),
   le reel ajusté à la largeur — comme Instagram, qui ne rogne pas le 9:16 mais
   pose son interface par-dessus. Barres noires en haut et en bas, îlot dynamique,
   colonne de boutons, légende, son, et la barre de navigation du profil. */
#tel{position:relative;flex:none;display:none;background:#0A0A0A;border-radius:62px;padding:12px;box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 0 2px #2A2A2A}
body.tel #tel{display:block}
body.tel #stage{display:none}
#ecran{position:relative;overflow:hidden;border-radius:52px;background:#000}
#ecran .video{position:absolute;left:0;top:0;transform-origin:0 0}
#ig{position:absolute;inset:0;color:#fff;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif}
#ig .ilot{position:absolute;top:22px;left:50%;transform:translateX(-50%);width:250px;height:74px;border-radius:40px;background:#000}
#ig .heure{position:absolute;top:40px;left:70px;font-size:36px;font-weight:600}
#ig .titre{position:absolute;top:48px;right:70px;font-size:34px;font-weight:700}
#ig .rail{position:absolute;right:26px;bottom:430px;display:flex;flex-direction:column;align-items:center;gap:46px}
#ig .rail div{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:28px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.5)}
#ig .rail svg{width:58px;height:58px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))}
#ig .pochette{width:56px;height:56px;border-radius:12px;border:3px solid #fff;background:#444}
#ig .bas{position:absolute;left:36px;right:170px;bottom:250px;display:flex;flex-direction:column;gap:16px;text-shadow:0 1px 4px rgba(0,0,0,.6)}
#ig .compte{display:flex;align-items:center;gap:16px;font-size:32px;font-weight:600}
#ig .avatar{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#F3ECDD,#B07A3B);border:2px solid #fff}
#ig .suivre{border:2px solid #fff;border-radius:10px;padding:6px 16px;font-size:28px;font-weight:600}
#ig .legende{font-size:30px;line-height:1.35;opacity:.96;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#ig .son{display:flex;align-items:center;gap:12px;font-size:28px;opacity:.95}
#ig .nav{position:absolute;left:0;right:0;bottom:0;height:190px;background:linear-gradient(transparent,rgba(0,0,0,.55) 40%);display:flex;align-items:flex-start;justify-content:space-around;padding:26px 40px 0}
#ig .nav svg{width:62px;height:62px}
#ig .nav .moi{width:58px;height:58px;border-radius:50%;background:#C9BEA8;border:2px solid #fff}
#ig .barre{position:absolute;left:50%;transform:translateX(-50%);bottom:22px;width:390px;height:10px;border-radius:6px;background:#fff;opacity:.9}
#ig .voile{position:absolute;left:0;right:0;top:0;height:260px;background:linear-gradient(rgba(0,0,0,.45),transparent)}
#ig .voileBas{position:absolute;left:0;right:0;bottom:0;height:820px;background:linear-gradient(transparent,rgba(0,0,0,.55) 55%,rgba(0,0,0,.75))}
h1{font-size:15px;margin:0 0 6px;letter-spacing:.08em;text-transform:uppercase}
button{font:inherit;background:#F3ECDD;color:#1C1917;border:0;padding:9px 12px;cursor:pointer;text-align:left}
button.ghost{background:transparent;color:#F3ECDD;outline:1px solid #6E685F}
button.on{background:#224F7D;color:#F3ECDD}
input[type=range]{width:100%}
.row{display:flex;gap:8px;flex-wrap:wrap}
#time{font-size:22px}
.hint{color:#9C9486;line-height:1.5}
/* Mode miniature (?mini) : la vidéo seule, en boucle, pour une page qui en montre plusieurs. */
body.mini{padding:0;gap:0}
body.mini #panel{display:none}
</style></head><body>
<div id="stage"><iframe id="reel"></iframe><div id="safe"><div style="left:0;right:0;top:0;height:${SAFE.top}px"></div><div style="left:0;right:0;bottom:0;height:${HEIGHT - SAFE.bottom}px"></div><div style="right:0;width:${WIDTH - SAFE.buttonsLeft}px;top:${SAFE.buttonsTop}px;bottom:${HEIGHT - SAFE.bottom}px"></div><div style="right:0;width:${WIDTH - SAFE.right}px;top:${SAFE.top}px;height:${SAFE.buttonsTop - SAFE.top}px"></div><div style="left:0;width:${SAFE.left}px;top:${SAFE.top}px;bottom:${HEIGHT - SAFE.bottom}px"></div><div class="coeur" style="left:0;right:0;top:${COEUR.top}px;height:${COEUR.bottom - COEUR.top}px"></div></div></div>
<div id="tel"><div id="ecran">
  <iframe class="video" id="reelTel"></iframe>
  <div id="ig">
    <div class="voile"></div><div class="voileBas"></div><div class="ilot"></div>
    <div class="heure">9:41</div><div class="titre">Reels</div>
    <div class="rail">
      <div><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M12 20s-7-4.6-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.4 12 20 12 20z"/></svg>12,4 k</div>
      <div><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M21 11.5A7.5 8 0 0 1 13.5 19H8l-4 3v-5.4A8 8 0 0 1 13.5 4 7.5 8 0 0 1 21 11.5z"/></svg>318</div>
      <div><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M22 3 11 14M22 3l-7 18-4-7-7-4 18-7z"/></svg>1 207</div>
      <div><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg></div>
      <div><svg viewBox="0 0 24 24" fill="#fff"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></div>
      <div class="pochette"></div>
    </div>
    <div class="bas">
      <div class="compte"><span class="avatar"></span>vitrine.democratique<span class="suivre">Suivre</span></div>
      <div class="legende" id="igLegende">${esc(title)} — Toutes les 4 heures, la Vitrine démocratique mesure ce qui occupe l’espace médiatique québécois…</div>
      <div class="son"><svg viewBox="0 0 24 24" width="26" height="26" fill="#fff"><path d="M9 18V5l10-2v13"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="16" r="2.5"/></svg>Son original · vitrine.democratique</div>
    </div>
    <div class="nav">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5V21H3z"/></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M9 9l6 3-6 3z" fill="#fff"/></svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M4 7h16l-2 12H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
      <span class="moi"></span>
    </div>
    <div class="barre"></div>
  </div>
</div></div>
<div id="panel">
  <h1>${esc(title)}</h1>
  <div id="time">0,0 s / ${duration.toFixed(1).replace(".", ",")} s</div>
  <input id="scrub" type="range" min="0" max="${duration}" step="0.0333" value="0">
  <div class="row"><button id="play">▶ Lecture</button><button class="ghost" id="slow">Vitesse ×1</button><button class="ghost" id="safeBtn">Zones Instagram</button><button class="ghost" id="telBtn">iPhone 17</button><button class="ghost" id="telModeBtn">Ajusté</button></div>
  <div class="row" id="scenes">${marks.map((m) => `<button class="ghost" data-t="${m.start}">${esc(m.id)}</button>`).join("")}</div>
  <p class="hint">Espace : lecture/pause · ← → : 1 s · rouge : zones couvertes par l’interface Instagram (en-tête, légende, boutons) · bleu : le carré central, ce qu’on voit avant d’ouvrir le reel.</p>
</div>
<script>
const REEL=${payload};
const DUR=${duration};
const MINI=new URLSearchParams(location.search).has("mini");
if(MINI)document.body.classList.add("mini");
const iframe=document.getElementById("reel"), stage=document.getElementById("stage");
// L'iPhone 17 : 1206 × 2622 points d'écran (19,5:9). Instagram pose le reel 9:16
// à la largeur de l'écran et laisse du noir en haut et en bas.
const TEL={l:1206,h:2622}, ecran=document.getElementById("ecran"), tel=document.getElementById("tel"), video=document.getElementById("reelTel");
iframe.srcdoc=REEL;video.srcdoc=REEL;
function fit(){const s=Math.max(.01,Math.min((innerHeight-(MINI?0:40))/${HEIGHT},(innerWidth-(MINI?0:400))/${WIDTH}));stage.style.width=${WIDTH}*s+"px";stage.style.height=${HEIGHT}*s+"px";iframe.style.transform="scale("+s+")";document.getElementById("safe").style.transform="scale("+s+")";}
// Deux comportements possibles d'Instagram sur un écran plus haut que le 9:16 :
// AJUSTÉ (le reel entier, barres noires en haut et en bas) ou PLEIN ÉCRAN (le
// reel agrandi jusqu'à remplir l'écran, ce qui rogne les CÔTÉS).
let telPlein=false;
function fitTel(){
  const s=Math.max(.01,Math.min((innerHeight-90)/TEL.h,(innerWidth-420)/TEL.l));
  ecran.style.width=TEL.l*s+"px";ecran.style.height=TEL.h*s+"px";
  const v=telPlein?TEL.h/${HEIGHT}:TEL.l/${WIDTH};
  video.style.width=${WIDTH}+"px";video.style.height=${HEIGHT}+"px";
  video.style.transform="scale("+(v*s)+")";
  video.style.top=((TEL.h-${HEIGHT}*v)/2*s)+"px";
  video.style.left=((TEL.l-${WIDTH}*v)/2*s)+"px";
  document.getElementById("ig").style.transform="scale("+s+")";
  document.getElementById("ig").style.transformOrigin="0 0";
  document.getElementById("ig").style.width=TEL.l+"px";
  document.getElementById("ig").style.height=TEL.h+"px";
}
addEventListener("resize",()=>{fit();fitTel();});fit();fitTel();
let t=0,playing=false,speed=1,last=0;
const scrub=document.getElementById("scrub"),timeEl=document.getElementById("time"),playBtn=document.getElementById("play");
function show(){const w=iframe.contentWindow;if(w&&w.setTime)w.setTime(Math.max(0,t));
  const wt=video.contentWindow;if(wt&&wt.setTime)wt.setTime(Math.max(0,t));scrub.value=t;timeEl.textContent=t.toFixed(1).replace(".",",")+" s / "+DUR.toFixed(1).replace(".",",")+" s";
  document.querySelectorAll("#scenes button").forEach((b,i,all)=>{const s=+b.dataset.t,e=i+1<all.length?+all[i+1].dataset.t:DUR;b.classList.toggle("on",t>=s&&t<e)});}
function loop(now){if(playing){t+=(now-last)/1000*speed;if(t>=DUR){if(MINI){t=-1;}else{t=DUR;playing=false;playBtn.textContent="▶ Lecture";}}}last=now;show();requestAnimationFrame(loop);}
function toggle(){if(t>=DUR)t=0;playing=!playing;playBtn.textContent=playing?"❚❚ Pause":"▶ Lecture";}
playBtn.onclick=toggle;
scrub.oninput=()=>{t=+scrub.value;};
document.getElementById("slow").onclick=e=>{speed=speed===1?.5:speed===.5?.25:1;e.target.textContent="Vitesse ×"+String(speed).replace(".",",");};
document.getElementById("telModeBtn").onclick=e=>{telPlein=!telPlein;e.target.textContent=telPlein?"Plein écran":"Ajusté";e.target.classList.toggle("on",telPlein);fitTel();};
document.getElementById("telBtn").onclick=e=>{document.body.classList.toggle("tel");e.target.classList.toggle("on",document.body.classList.contains("tel"));fit();fitTel();};
document.getElementById("safeBtn").onclick=e=>{const s=document.getElementById("safe");const on=s.style.display!=="block";s.style.display=on?"block":"none";e.target.classList.toggle("on",on);};
document.querySelectorAll("#scenes button").forEach(b=>b.onclick=()=>{t=+b.dataset.t+.01;});
addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();toggle();}if(e.code==="ArrowRight")t=Math.min(DUR,t+1);if(e.code==="ArrowLeft")t=Math.max(0,t-1);});
iframe.onload=()=>{iframe.contentDocument.fonts.ready.then(()=>{last=performance.now();if(MINI)playing=true;requestAnimationFrame(loop);});};
</script></body></html>`;
}

/** Ouvre un fichier dans le navigateur par défaut du poste. */
export function openInBrowser(file: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", file] : [file];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

/** Étape commune à tous les scripts de module, dans l'ordre voulu :
 *  1. par défaut, APERÇU animé dans le navigateur — on regarde, on corrige ;
 *  2. `--mp4` seulement ensuite, pour produire la vidéo à publier.
 *  `--apercu 5,20` donne des images fixes ; `--sans-ouvrir` n'ouvre rien. */
export async function produce(opts: { html: string; scenes: Scene[]; title: string; base: string; args: Record<string, string | true> }): Promise<void> {
  const { html, scenes, title, base, args } = opts;
  const ecarts = await checkFrame(html, scenes);
  if (ecarts.length) {
    console.warn(`  ⚠️ ${ecarts.length} écart(s) au gabarit :`);
    for (const o of ecarts) console.warn(`     · ${o}`);
    if (args.mp4) throw new Error("Vidéo non produite : corrigez ces écarts (voir l'aperçu, bouton « Zones Instagram »).");
  } else {
    console.log("  gabarit → bords, zone Instagram, cœur, lisibilité et textes non empilés respectés");
  }
  if (typeof args.apercu === "string") {
    const previewAt = args.apercu.split(",").map(Number).filter(Number.isFinite);
    await renderReel(html, { out: `${base}.mp4`, previewAt });
    return;
  }
  // VERROU D'APERÇU : la vidéo n'est produite que si l'aperçu de CETTE version
  // exacte du reel (même page, donc mêmes données et même code) a été généré
  // juste avant. On ne produit pas un MP4 qu'on n'a pas regardé.
  const empreinte = createHash("sha256").update(html).digest("hex").slice(0, 16);
  const player = `${base}_apercu.html`;
  if (args.mp4) {
    const apercu = await fs.readFile(player, "utf8").catch(() => "");
    if (!apercu.includes(`data-empreinte="${empreinte}"`)) {
      throw new Error(
        "Vidéo non produite : regardez d'abord l'aperçu de cette version du reel.\n" +
        "  Lancez la commande SANS --mp4, relisez l'aperçu dans le navigateur, puis relancez avec --mp4.",
      );
    }
    // PAS DE SON par défaut (Adrien, 2026-09-16) : la musique se prend dans le
    // catalogue de la plateforme au moment de publier. `--musique fichier.mp3`
    // monte une trame dont on détient les droits, pour publier ailleurs.
    const piste = typeof args.musique === "string" ? args.musique : undefined;
    if (piste) console.log(`  musique → ${piste}`);
    await renderReel(html, { out: `${base}.mp4`, musique: piste });
    console.log(`  vidéo   → ${base}.mp4`);
    return;
  }
  await fs.writeFile(player, buildPlayer(html, scenes, title).replace("<body>", `<body data-empreinte="${empreinte}">`));
  console.log(`  aperçu  → ${player}`);
  console.log("  Relisez l'aperçu, puis relancez avec --mp4 pour produire la vidéo.");
  if (!args["sans-ouvrir"]) openInBrowser(player);
}

/** Contrôle du gabarit, scène par scène, à l'état final de chaque scène (juste
 *  avant son fondu de sortie). Trois règles :
 *   1. CADRE : aucun élément visible ne franchit l'encadré (FRAME) ;
 *   2. ZONE SÛRE : aucune information (tout ce qui n'est pas `data-deco`) ne
 *      sort de SAFE, sinon l'interface Instagram la cache sur le téléphone ;
 *   3. LISIBILITÉ : aucun texte sous MIN_FONT ;
 *   4. CŒUR : l'élément marqué `data-cle` (LA statistique de la scène) tient dans
 *      le carré central, celui qu'on voit avant d'ouvrir le reel.
 *  La boîte de chaque élément est d'abord rognée par ses ancêtres en
 *  `overflow: hidden` : une image zoomée dans un cadre qui la contient ne
 *  dépasse pas. Un seul signalement par débordement (l'ancêtre fautif). */
export async function checkFrame(html: string, scenes: Scene[]): Promise<string[]> {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // ⚠️ On contrôle PLUSIEURS MOMENTS par scène, pas seulement la fin (Jules
    // Piral, 2026-09-17 : « plein de trucs s'empilent les uns sur les autres ») :
    // pendant une animation, deux blocs peuvent se croiser alors que l'état final
    // est propre. Quatre instants suffisent à les attraper.
    const found: string[] = [];
    const vus = new Set<string>();
    let t = 0;
    for (const s of scenes) {
      const moments = [0.75, 0.45, 0.7, 1].map((f, i) => (i === 0 ? t + 0.75 : t + s.duration * f)).map((x) => Math.min(x, t + s.duration - 0.35));
      for (const m of [...new Set(moments)]) {
        for (const ecart of await inspectAt(page, s.id, m * SLOW)) {
          if (vus.has(ecart)) continue;
          vus.add(ecart);
          found.push(ecart);
        }
      }
      t += s.duration;
    }
    return found;
  } finally {
    await browser.close();
  }
}

// Code exécuté DANS la page, passé en texte : tsx (esbuild) injecterait sinon
// un utilitaire `__name` qui n'existe pas côté navigateur.
const INSPECT = `({ sceneId, at, frame, safe, minFont, coeur }) => {
  window.setTime(at);
  const scene = document.getElementById(sceneId);
  const out = [];
  const flagged = { frame: new Set(), safe: new Set() };
  const inherited = (set, el) => {
    for (let a = el.parentElement; a && a !== scene; a = a.parentElement) if (set.has(a)) return true;
    return false;
  };
  const excess = (box, lim) => [
    box.left < lim.left - .5 ? "gauche " + Math.round(lim.left - box.left) + " px" : "",
    box.top < lim.top - .5 ? "haut " + Math.round(lim.top - box.top) + " px" : "",
    box.right > lim.right + .5 ? "droite " + Math.round(box.right - lim.right) + " px" : "",
    box.bottom > lim.bottom + .5 ? "bas " + Math.round(box.bottom - lim.bottom) + " px" : "",
  ].filter(Boolean);
  for (const el of scene.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let a = el.parentElement; a && a !== scene; a = a.parentElement) {
      if (getComputedStyle(a).overflow === "visible") continue;
      const ar = a.getBoundingClientRect();
      box.left = Math.max(box.left, ar.left); box.top = Math.max(box.top, ar.top);
      box.right = Math.min(box.right, ar.right); box.bottom = Math.min(box.bottom, ar.bottom);
    }
    if (box.right - box.left < 1 || box.bottom - box.top < 1) continue;
    // Un élément invisible (fondu terminé) ne se voit pas : ni cadre ni zone.
    let op = 1; for (let q = el; q && q !== document.body; q = q.parentElement) op *= parseFloat(getComputedStyle(q).opacity);
    if (op < .05) continue;
    const ownText = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim();
    const label = (el.textContent || "").trim().slice(0, 40) || "<" + el.tagName.toLowerCase() + " class=\\"" + (el.getAttribute("class") || "") + "\\">";
    const f = el.closest("[data-deco]") ? [] : excess(box, frame);
    if (f.length) {
      flagged.frame.add(el);
      if (!inherited(flagged.frame, el)) out.push("cadre · scène " + sceneId + " : « " + label + " » (" + f.join(", ") + ")");
    }
    if (el.closest("[data-deco]")) continue;
    const z = excess(box, safe);
    // Colonne de boutons : seulement à partir du tiers de l'écran.
    if (box.bottom > safe.buttonsTop && box.right > safe.buttonsLeft + .5) z.push("boutons " + Math.round(box.right - safe.buttonsLeft) + " px");
    if (z.length) {
      flagged.safe.add(el);
      if (!inherited(flagged.safe, el)) out.push("zone Instagram · scène " + sceneId + " : « " + label + " » (" + z.join(", ") + ")");
    }
    if (ownText) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < minFont - .1) out.push("lisibilité · scène " + sceneId + " : « " + ownText.slice(0, 40) + " » en " + Math.round(size) + " px (minimum " + minFont + ")");
    }
  }
  // LE CŒUR : l'essentiel de la scène tient dans le carré central.
  for (const el of scene.querySelectorAll("[data-cle]")) {
    const r = el.getBoundingClientRect();
    if (r.height < 1) continue;
    const d = [r.top < coeur.top - .5 ? "haut " + Math.round(coeur.top - r.top) + " px" : "",
      r.bottom > coeur.bottom + .5 ? "bas " + Math.round(r.bottom - coeur.bottom) + " px" : ""].filter(Boolean);
    if (d.length) out.push("cœur · scène " + sceneId + " : « " + (el.textContent || "").trim().slice(0, 40) + " » sort du carré central (" + d.join(", ") + ")");
  }
  // TEXTES EMPILÉS (Jules Piral, 2026-09-17 : « des infos et du texte empilés les
  // uns sur les autres »). Chaque ligne de texte visible est mesurée au plus près
  // (Range sur le nœud texte) ; deux lignes de deux nœuds différents qui se
  // recouvrent de plus de 6 px dans les deux sens sont un écart.
  const opacity = (el) => { let o = 1; for (let a = el; a && a !== document.body; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return o; };
  const lines = [];
  const walker = document.createTreeWalker(scene, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = (n.textContent || "").trim();
    if (!txt || !n.parentElement || opacity(n.parentElement) < .2) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    // La boîte d'un Range couvre toute la hauteur de la fonte (jambages, blanc
    // au-dessus des capitales) : avec un interlignage serré, deux lignes d'un même
    // titre se touchent sans que les lettres se touchent. On ne garde que le
    // cœur de la ligne (la moitié centrale), là où sont les lettres.
    // Un ancêtre qui ROGNE (overflow hidden, -webkit-line-clamp, ellipsis) cache
    // une partie du texte, mais le Range, lui, couvre le texte ENTIER : sans
    // cette intersection, un titre coupé à deux lignes était signalé comme
    // empilé sur ce qui suit, alors qu'à l'écran il n'y a rien.
    const fenetre = (el) => {
      let w = { left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 };
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const st = getComputedStyle(a);
        if (st.overflow === "visible" && st.overflowX === "visible" && st.overflowY === "visible") continue;
        const c = a.getBoundingClientRect();
        w = { left: Math.max(w.left, c.left), right: Math.min(w.right, c.right), top: Math.max(w.top, c.top), bottom: Math.min(w.bottom, c.bottom) };
      }
      return w;
    };
    const vue = fenetre(n.parentElement);
    for (const q of range.getClientRects()) {
      const r = { left: Math.max(q.left, vue.left), right: Math.min(q.right, vue.right), top: Math.max(q.top, vue.top), bottom: Math.min(q.bottom, vue.bottom) };
      if (r.right - r.left <= 2 || r.bottom - r.top <= 2) continue;
      const pad = (r.bottom - r.top) * .15;
      lines.push({ n, txt, r: { left: r.left, right: r.right, top: r.top + pad, bottom: r.bottom - pad } });
    }
  }
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const a = lines[i], b = lines[j];
    if (a.n === b.n) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w <= 6 || h <= 6) continue;
    const key = a.txt + "|" + b.txt;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push("empilement · scène " + sceneId + " : « " + a.txt.slice(0, 30) + " » sur « " + b.txt.slice(0, 30) + " »");
  }
  return out;
}`;

async function inspectAt(page: Page, sceneId: string, at: number): Promise<string[]> {
  // Le contenu s'arrête au-dessus de la barre de marque.
  const args = JSON.stringify({ sceneId, at, frame: FRAME, safe: { ...SAFE, top: CONTENT_TOP, bottom: CONTENT_BOTTOM }, minFont: MIN_FONT, coeur: COEUR });
  return page.evaluate(`(${INSPECT})(${args})`) as Promise<string[]>;
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    // Chromium de Playwright absent (`npx playwright install chromium` pas
    // encore lancé) : on se rabat sur le Chrome installé sur le poste.
    return chromium.launch({ channel: "chrome" });
  }
}

/** Rend la page en MP4 (H.264, 30 i/s, 1080×1920), ou en images fixes si
 *  `previewAt` est fourni (secondes de la vidéo finale). */
export async function renderReel(html: string, opts: { out: string; previewAt?: number[]; musique?: string }): Promise<void> {
  await fs.mkdir(path.dirname(opts.out), { recursive: true });
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    if (opts.previewAt?.length) {
      for (const t of opts.previewAt) {
        await page.evaluate((x) => (window as unknown as { setTime(t: number): void }).setTime(x), t);
        const file = opts.out.replace(/\.mp4$/, `_apercu_${t}s.png`);
        await page.screenshot({ path: file });
        console.log(`  aperçu → ${file}`);
      }
      return;
    }

    if (!ffmpegPath) throw new Error("ffmpeg-static n'a pas de binaire pour cette plateforme.");
    const duration = await page.evaluate(() => (window as unknown as { DURATION: number }).DURATION);
    const frames = Math.round(duration * FPS);
    // Format Reels : H.264 High, yuv420p, 30 i/s, 1080×1920, BT.709, faststart.
    // Piste audio AAC muette : certaines applications refusent une vidéo sans
    // piste son, et Instagram en pose une (la musique) par-dessus de toute façon.
    const ffmpeg = spawn(ffmpegPath, [
      "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      ...(opts.musique
        ? ["-stream_loop", "-1", "-i", opts.musique]
        : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]),
      "-map", "0:v", "-map", "1:a", "-shortest",
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", opts.out,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    ffmpeg.stderr.on("data", (d) => { stderr += d; });
    const done = new Promise<void>((resolve, reject) => {
      ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg a échoué (${code}) :\n${stderr.slice(-2000)}`))));
    });

    for (let i = 0; i < frames; i++) {
      await page.evaluate((x) => (window as unknown as { setTime(t: number): void }).setTime(x), i / FPS);
      const png = await page.screenshot({ type: "png" });
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
      if (i % FPS === 0) process.stdout.write(`\r  rendu ${Math.round((i / frames) * 100)} %`);
    }
    ffmpeg.stdin.end();
    await done;
    process.stdout.write(`\r  rendu 100 % (${frames} images, ${duration.toFixed(1)} s)\n`);
  } finally {
    await browser.close();
  }
}

/** Arguments `--cle valeur` et drapeaux `--cle` de la ligne de commande. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { out[a.slice(2)] = next; i++; }
    else out[a.slice(2)] = true;
  }
  return out;
}
