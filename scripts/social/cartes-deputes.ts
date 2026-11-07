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
import { ISSUE_META, buildEnjeuStack, loadAssemblee, type DeputyRow, type IssueKey, type PeriodKey } from "@/lib/data/assemblee";
import { PARTY_COLORS, type PartyKey } from "@/lib/data/parties";
import { COLORS, enjeuGlyph, fleur, loadLogos, parseArgs, txt, openInBrowser } from "./lib/reel";
import { ajusterFonctions, ajusterLegende, ajusterNom, ajusterRubriques, ajusterVerso, mesurerCoupes, mesurerDebordement, mesurerRetours } from "@/lib/cartes/ajustements";
import { chargerSources, etiquettesPeriodes, fusionnerLignesParParti, retirerExpressions } from "@/lib/cartes/donnees";
import { documentHTML, recto, verso, type Rendu } from "@/lib/cartes/faces";
import { LIBELLES_FONCTION, LIBELLE_RARETE, MONTANT, nomImprime, slugCirco } from "@/lib/cartes/fonctions";
import { COEUR, ECHELLE_IMPRESSION, FLEURS_PAR_RARETE, FOND_PERDU, H, LOGO_VERSO, MARGE, PANNEAU, PLANCHER_IMPRESSION, RECTO_IMPRESSION_CSS, W, degradeMetalCSS, marquesInstitutions, ordinal } from "@/lib/cartes/gabarit";
import { construireJeu } from "@/lib/cartes/jeu";
import { TRAME_VERSION, monogrammePNG, tramer } from "@/lib/cartes/trame";
import { PERIODES, type Carte, type Rarete } from "@/lib/cartes/types";


/** Enjeux écartés des cartes tant que leur classifieur est en révision.
 *  VIDE depuis le 28-09 : sur les données reconstruites avec les têtes
 *  recalibrées, Terres publiques n'est plus l'enjeu dominant que de 2 élus sur
 *  129 (59 avant), dont le ministre de l'Agriculture, et Affaires
 *  internationales d'aucun (15 avant). Les douze enjeux paraissent. */
const ENJEUX_EN_REVISION: readonly IssueKey[] = [];

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

async function monogrammeVitrine(rayon: number): Promise<string | null> {
  const png = await monogrammePNG(rayon);
  return png ? `data:image/png;base64,${png.toString("base64")}` : null;
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
// --cellule N : pas de la trame en pixels, 8 par défaut (décision de Jules,
// 24-09, sur planche d'essai à 4, 6, 8 et 10). Les portraits source font
// 150 x 200 px : une trame grosse cache ce manque de détail, et à 8 px elle
// fait environ 82 lignes par pouce sur la carte, loin des 150 à 175 de la trame
// de l'imprimeur, donc sans moiré. Fait partie de la clé du cache des trames.
// STYLE « courriel » (Jules, 29-09) : la carte envoyée à l'élu par courriel.
// La MISE EN PAGE est celle de la carte imprimée, mais l'image est faite pour
// l'écran : ni fond perdu, ni réduction, ni traits de coupe, et une trame
// plus fine, dont la rosette ne se voit plus à la taille d'un écran.
const STYLES = {
  impression: { cellule: 8, echelle: 2, impression: true, fondPerdu: true },
  courriel: { cellule: 3, echelle: 2, impression: true, fondPerdu: false },
  web: { cellule: 4, echelle: 2, impression: false, fondPerdu: false },
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
  const url = octets ? await trameURI(octets, asset) : null;
  cacheBaseball.set(asset, url);
  return url;
}

/** LA TRAME, pour n'importe quelle photo : les portraits des élus (3:4,
 *  1500 × 2000), et la photo du Parlement au dessus du paquet, dans son propre
 *  format. `masque` détoure le sujet : hors du masque, l'image est
 *  transparente et laisse voir la carte. */
async function trameURI(
  octets: Buffer,
  asset: string,
  format: { largeur: number; hauteur: number; masque?: Buffer } = { largeur: 1500, hauteur: 2000 },
): Promise<string | null> {
  const cle = createHash("sha256").update(octets).update(TRAME_VERSION).update(`cellule=${CELLULE_TRAME}`).update(DENSITE_TRAME > 1 ? `densite=${DENSITE_TRAME}` : "")
    .update(format.largeur === 1500 && format.hauteur === 2000 ? "" : `${format.largeur}x${format.hauteur}`).update(format.masque ?? "").digest("hex").slice(0, 12);
  const fichier = path.join(CACHE_TRAMES, `${asset}-${cle}.png`);
  const url = pathToFileURL(fichier).href;
  if (await fs.access(fichier).then(() => true, () => false)) return url;
  const buf = await tramer(octets, { cellule: CELLULE_TRAME, densite: DENSITE_TRAME, largeur: format.largeur, hauteur: format.hauteur, masque: format.masque, nom: asset });
  if (!buf) return null;
  await fs.mkdir(path.dirname(fichier), { recursive: true }); // « historique/16777 »
  await fs.writeFile(fichier, buf);
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
 *  · DESSUS : au recto le titre, « L'alignement de l'Assemblée » ; au verso
 *    la LÉGENDE de ce qu'une carte ne dit pas d'elle-même (rareté, sigle,
 *    pictogramme).
 *  · DESSOUS : au recto la MÉTHODOLOGIE ; au verso, visible de l'extérieur, le
 *    logo de la Vitrine, un code QR vers le site, le CAPP et l'Université Laval.
 *  LE DESSUS EST UNE CARTE : le cadre, le médaillon, le bandeau du nom et le
 *  pied du recto d'un élu, avec pour « portrait » l'Hôtel du Parlement, dans
 *  la trame des portraits. L'ÉDIFICE N'EST JAMAIS TRONQUÉ (Jules, 28-09) : il
 *  est large et la carte est haute, d'où deux solutions à l'essai, la carte
 *  à l'horizontale ou l'édifice détouré dont la tour dépasse du cadre.
 *  Aucun élu n'est montré.
 *  PHOTO : « Assemblée nationale du Québec, Canada », Wilfredor, 2020,
 *  Wikimedia Commons, licence CC0 (donnees/parlement-*).
 *  AUCUNE COULEUR DE PARTI SEULE : les cinq viennent ensemble, à parts
 *  égales, dans l'ordre alphabétique des sigles.
 *  Classes préfixées « pq- » : les ajusteurs et les mesures de la série
 *  visent .nom, .ligne, .legende, .bloc… et ne doivent pas s'y accrocher.
 *  Même format et même grain que la série, pour passer par le même rendu
 *  (fond perdu compris). */
function pagesPaquet(
  logos: { vitrine: string | null; capp: string | null; ulaval: string | null },
  total: number,
  raretes: Record<Rarete, number>,
  sansExpression: number,
  monogramme: string | null,
  codeQR: string,
  photo: { url: string | null; disposition: "horizontal" | "detoure" },
): { slug: string; html: string }[] {
  const ENCRE = COLORS.soft;
  const masque = (uri: string) => `-webkit-mask-image:url('${uri}');mask-image:url('${uri}')`;
  const textures = `
  <svg class="grain"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .34 .33 .33 0 -.14"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>
  <svg class="mouchete"><filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .34 .33 .33 0 -.42"/></filter><rect width="100%" height="100%" filter="url(#m)"/></svg>`;
  const polices = `<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,500&family=IBM+Plex+Mono:wght@400;500&family=Oswald:wght@400;500;600;700&family=Archivo+Narrow:ital,wght@0,400;0,600;0,700;1,400&display=block" rel="stylesheet">`;
  const CINQ = (["caq", "pcq", "plq", "pq", "qs"] as PartyKey[]).map((k) => PARTY_COLORS[k]);
  const cinq = `linear-gradient(90deg,${CINQ.map((c, i) => `${c} ${i * 20}% ${(i + 1) * 20}%`).join(",")})`;
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
  // Faces visibles : papier et encre, le grain seul. Les rayures débordent
  // de la face de chaque côté : à l'impression, la face est réduite et
  // centrée dans la page, et les rayures doivent courir jusque dans le fond
  // perdu. À l'écran, le corps de la page les coupe au bord.
  const grain = textures.slice(0, textures.indexOf("<svg class=\"mouchete\""));
  const cssFace = `${commun(COLORS.paper, COLORS.ink, COLORS.ink)}
  .grain{opacity:.22}
  .pq-rayures{position:absolute;left:-160px;right:-160px}
  .pq-rayures i{display:block;height:18px;margin-bottom:9px}
  .pq-rayures.court{left:326px;right:326px}
  .pq-rang{position:absolute;left:0;right:0;display:flex;justify-content:center}
  .pq-masque{display:block;background:${COLORS.ink};-webkit-mask-size:contain;mask-size:contain;
             -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center}`;
  const rayures = (y: number, court = false) =>
    `<div class="pq-rayures${court ? " court" : ""}" style="top:${y}px">${CINQ.map((c) => `<i style="background:${c}"></i>`).join("")}</div>`;
  const logoVitrine = (largeur: number) => logos.vitrine
    ? `<i class="pq-masque" style="width:${largeur}px;height:${Math.round(largeur * 591 / 1788)}px;${masque(logos.vitrine)}"></i>`
    : "";
  const cssDos = `${commun(ENCRE, COLORS.paper, COLORS.paper)}
  .marque-capp i{opacity:.8}
  .panneau{position:absolute;left:${MARGE}px;top:${MARGE}px;width:${W - 2 * MARGE}px;height:${H - MARGE - 70}px;
           display:flex;flex-direction:column;gap:6px}
  .entete{flex:0 0 auto;height:132px;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .entete b{font-family:"Oswald",sans-serif;font-weight:700;font-size:70px;line-height:1;letter-spacing:.06em;text-transform:uppercase}
  .entete i{display:block;width:300px;height:6px;margin-top:16px;background:${cinq}}
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

  // ── Dessus, recto : la carte du Parlement ──────────────────────────────
  // Mêmes règles que carteHTML (carte commune) : filet d'encre de 3 px,
  // médaillon à cheval sur le coin, bandeau du nom, pied, logos. Ce qui
  // change : le bandeau est à l'encre (pas de parti), son filet du haut porte
  // les cinq couleurs, le médaillon donne la législature et la réserve du coin
  // le monogramme de la Vitrine.
  const cssCarte = (lp: number, hp: number, bande: number) => `${commun(COLORS.paper, COLORS.ink, COLORS.softer)}
  .grain{opacity:.22}.mouchete{opacity:.18}
  .cadre{position:absolute;pointer-events:none;overflow:visible}
  .bande{position:absolute;left:0;right:0;bottom:0;height:${bande}px;background:${COLORS.ink};
         display:flex;flex-direction:column;justify-content:center;padding:22px 40px 0}
  .pq-cinq{position:absolute;left:0;right:0;top:0;height:22px;background:${cinq}}
  .pq-nom{font-family:"Playfair Display",serif;font-weight:900;font-size:64px;line-height:1.06;letter-spacing:-.02em;
          color:${COLORS.paper};text-transform:uppercase;white-space:nowrap}
  .medaillon{position:absolute;left:8px;top:8px;width:124px;height:124px;border-radius:50%;
             background:${COLORS.ink};color:${COLORS.paper};border:6px solid ${COLORS.paper};box-shadow:0 0 0 3px ${COLORS.ink};
             display:flex;align-items:center;justify-content:center;font-family:"Playfair Display",serif;font-weight:900;
             font-size:52px;line-height:1;transform:rotate(-6deg)}
  .medaillon i{display:block;font-style:normal;transform:translateY(-8px)}
  .medaillon sup{font-size:.5em;vertical-align:.7em;line-height:0}
  .ecusson-haut{position:absolute;width:142px;height:108px;display:block}
  .ecusson-haut i{display:block;width:100%;height:100%;background:${COLORS.ink};-webkit-mask-size:contain;mask-size:contain;
                  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center}
  .pied{position:absolute;left:${MARGE + 4}px;width:${lp - 8}px;top:${MARGE + hp + 26}px;display:flex;align-items:baseline;
        justify-content:space-between;gap:24px;font-family:"IBM Plex Mono",monospace;font-size:23px;letter-spacing:.08em;
        text-transform:uppercase;color:${COLORS.softer}}
  ${MODE_IMPRESSION ? RECTO_IMPRESSION_CSS.replace(`top:${PANNEAU.bas + 14}px`, `top:${MARGE + hp + 14}px`) : ""}`;
  const medaillon = `<span class="medaillon"><i>43<sup>e</sup></i></span>`;
  const pied = `<p class="pied"><span>${ordinal("43e")} législature</span><span>2022 – 2026</span></p>`;
  let couverture: string;
  if (photo.disposition === "horizontal") {
    // LA CARTE À L'HORIZONTALE, comme les cartes d'équipe des séries de
    // hockey. La page reste verticale : tout le dessin est couché d'un quart
    // de tour (on tourne la carte pour la lire). La photo entière remplit le
    // panneau ; le bandeau, ramené à 150 px, couvre le pavé du premier plan
    // et s'arrête au pied de l'édifice.
    const LH = H, HH = W, lp = LH - 2 * MARGE, hp = HH - MARGE - 120, bande = 150;
    const chemin = `M 0 0 H ${lp - 349} C ${lp - 259} 0, ${lp - 219} 170, ${lp - 124} 170 C ${lp - 64} 170, ${lp - 24} 140, ${lp} 150 V ${hp} H 0 Z`;
    couverture = page(`${cssCarte(lp, hp, bande)}
  .pq-couche{position:absolute;left:0;top:0;width:${LH}px;height:${HH}px;transform-origin:0 0;transform:translateX(${W}px) rotate(90deg)}
  .panneau{position:absolute;left:${MARGE}px;top:${MARGE}px;width:${lp}px;height:${hp}px;clip-path:path('${chemin}');overflow:hidden;background:${COLORS.paper}}
  .cadre{left:${MARGE}px;top:${MARGE}px;width:${lp}px;height:${hp}px}
  .photo{position:absolute;inset:0;background:url("${photo.url ?? ""}") center top / cover no-repeat}
  .ecusson-haut{left:${MARGE + lp - 186}px;top:${MARGE + 23}px}
  .marque-capp{left:${LH / 2}px}`,
    `<div class="pq-couche">
    <div class="panneau"><div class="photo"></div>
      <div class="bande"><span class="pq-cinq"></span><p class="pq-nom">L’alignement de l’Assemblée</p></div></div>
    <svg class="cadre" viewBox="0 0 ${lp} ${hp}" aria-hidden="true"><path d="${chemin}" fill="none" stroke="${COLORS.ink}" stroke-width="3" stroke-linejoin="round"/></svg>
    ${medaillon}
    ${monogramme ? `<span class="ecusson-haut"><i style="${masque(monogramme)}"></i></span>` : ""}
    ${marquesInstitutions(logos.capp, logos.ulaval)}
    ${pied}
  </div>${textures}`);
  } else {
    // L'ÉDIFICE DÉTOURÉ. Le panneau ne commence qu'à mi-hauteur : l'édifice,
    // posé sur le bandeau, y tient en entier sur la largeur, et sa tour
    // dépasse du cadre, comme un joueur qui sort de sa vignette. Le titre
    // prend la place libérée au-dessus.
    const lp = PANNEAU.w, haut = 690, hp = PANNEAU.bas - haut, bande = 150;
    const lE = 955, hE = Math.round(lE * 1765 / 2400), xE = (W - lE) / 2, yE = PANNEAU.bas - bande - hE + 2;
    couverture = page(`${cssCarte(lp, PANNEAU.bas - MARGE, bande)}
  .panneau{position:absolute;left:${MARGE}px;top:${haut}px;width:${lp}px;height:${hp}px;overflow:hidden;
           background:${COLORS.deep};background-image:radial-gradient(circle at 50% 50%,rgba(28,25,23,.3) 0 1.5px,rgba(28,25,23,0) 1.9px);background-size:9px 9px}
  .cadre{left:${MARGE}px;top:${haut}px;width:${lp}px;height:${hp}px}
  .pq-edifice{position:absolute;left:${xE}px;top:${yE}px;width:${lE}px;height:${hE}px;display:block}
  .pq-socle{position:absolute;left:${MARGE}px;top:${PANNEAU.bas - bande}px;width:${lp}px;height:${bande}px}
  .pq-socle .bande{padding-top:22px;align-items:center}
  .pq-leg{font-family:"IBM Plex Mono",monospace;font-size:34px;letter-spacing:.12em;text-transform:uppercase;color:${COLORS.paper}}
  .pq-leg .ord{font-size:.6em;vertical-align:.55em}
  .pq-titre{position:absolute;left:0;top:0;overflow:visible}
  .pq-titre text{font-family:"Playfair Display",serif;font-weight:900;text-transform:uppercase;letter-spacing:-.005em}
  .medaillon{left:8px;top:8px}
  .ecusson-haut{left:${W - MARGE - 150}px;top:${MARGE - 6}px}`,
    `<div class="panneau"></div>
  <svg class="cadre" viewBox="0 0 ${lp} ${hp}" aria-hidden="true"><rect x="0" y="0" width="${lp}" height="${hp}" fill="none" stroke="${COLORS.ink}" stroke-width="3"/></svg>
  <svg class="pq-titre" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <text x="${W / 2}" y="292" data-l="700" text-anchor="middle" fill="${COLORS.ink}">L’alignement</text>
    <text x="${W / 2}" y="412" data-l="700" text-anchor="middle" fill="${COLORS.ink}">de l’Assemblée</text>
  </svg>
  ${photo.url ? `<img class="pq-edifice" src="${photo.url}" alt="">` : ""}
  <div class="pq-socle"><div class="bande"><span class="pq-cinq"></span><p class="pq-leg">${ordinal("43e")} législature · 2022 – 2026</p></div></div>
  ${medaillon}
  ${monogramme ? `<span class="ecusson-haut"><i style="${masque(monogramme)}"></i></span>` : ""}
  ${marquesInstitutions(logos.capp, logos.ulaval)}
  <script>document.fonts.ready.then(() => { for (const t of document.querySelectorAll("text[data-l]")) { t.style.fontSize = "100px"; t.style.fontSize = (100 * Number(t.dataset.l) / t.getComputedTextLength()).toFixed(2) + "px"; } });</script>
  ${textures}`);
  }

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
  </div>${marquesInstitutions(logos.capp, logos.ulaval)}${textures}`);

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
  </div>${marquesInstitutions(logos.capp, logos.ulaval)}${textures}`);

  // ── Dessous, verso : le logo, le code QR, les partenaires ──────────────
  // Le code QR mène au site (Jules, 28-09, qui lève « pas de code QR » pour
  // cette face seulement). Encre sur un carré de papier clair, au filet fin :
  // le carré lui donne ses quatre modules de marge.
  const dos = page(`${cssFace}
  .pq-qr{position:absolute;left:${(W - 330) / 2}px;top:590px;width:330px;height:330px;padding:30px;background:#FAF4E6;border:3px solid ${COLORS.ink}}
  .pq-qr svg{display:block;width:100%;height:100%;shape-rendering:crispEdges}
  .marque-capp{position:static;transform:none;gap:33px}
  .marque-capp i{width:270px;height:84px}
  .marque-capp i.sep{width:2px;height:54px}
  .marque-capp i.ulaval{width:144px;height:68px}`,
  `<span class="pq-rang" style="top:250px">${logoVitrine(700)}</span>
  <div class="pq-qr">${codeQR}</div>
  ${rayures(1040, true)}
  <span class="pq-rang" style="top:1250px">${marquesInstitutions(logos.capp, logos.ulaval)}</span>${grain}`);

  // Préfixes « 00- » et « zz- » : première et dernière page du PDF de
  // l'imprimeur, qui range les cartes par nom de fichier.
  return [
    { slug: "00-paquet-dessus", html: couverture },
    { slug: "00-paquet-dessus-verso", html: legende },
    { slug: "zz-paquet-dessous", html: methodologie },
    { slug: "zz-paquet-dessous-verso", html: dos },
  ];
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
  await retirerExpressions(data);
  // ENJEUX EN RÉVISION — retirés des cartes, leur part répartie entre les
  // autres. Les têtes INFER public_lands et defense, calibrées sur la presse,
  // se déclenchent sur les formules de procédure du Salon bleu (« Il n'y a pas
  // de consentement. ») : Terres sortait enjeu dominant de 58 élus sur 129.
  // Le site n'est pas touché. Liste vidée le 28-09 (raffineur recalibré).
  for (const p of Object.values(data.periods)) {
    for (const d of [...(p?.rows.flatMap((r) => r.deputies ?? []) ?? []), ...(p?.independants ?? [])]) {
      d.enjeuStack = buildEnjeuStack(d.issueShares ?? {}, ENJEUX_EN_REVISION);
      const top = d.enjeuStack.find((s) => !s.isReste);
      d.topIssueLabel = top?.label;
      d.topIssueKey = top?.cle ?? undefined;
      d.topIssueColor = top?.color;
    }
  }
  const vue = data.periods[periode];
  if (!vue) throw new Error(`Période inconnue : ${periode} (legislature, session ou last_pdq).`);

  // LA SÉRIE COMPLÈTE D'ABORD, la sélection ensuite (voir lib/cartes/jeu.ts) :
  // numéros, raretés et fonctions n'ont de sens que sur l'ensemble.
  const sources = await chargerSources();
  const { cartes: serieComplete, serie } = construireJeu(data, periode, sources, {
    annee: typeof args.annee === "string" ? Number(args.annee) : undefined,
  });
  let cartes = serieComplete;


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
  const rendu: Rendu = { impression: MODE_IMPRESSION, glyphe: enjeuGlyph, logoUlaval: logos.ulaval };
  const logoVerso = MODE_IMPRESSION ? await monogrammeVitrine(LOGO_VERSO.rayon) : null;
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
    pages.push({ slug: c.slug, html: avecMention(documentHTML(recto(c, portrait, ecusson, logos.capp, rendu)), mention, "recto") });
    pages.push({ slug: `${c.slug}-verso`, html: avecMention(documentHTML(verso(c, fiche, maxAbs, libelles, portrait, ecusson, MODE_IMPRESSION ? logoVerso ?? logos.vitrine : logos.vitrine, logos.capp, seance, rendu)), mention, "verso") });
  }

  // LES DEUX CARTES DU PAQUET : avec la série entière, ou seules (--paquet).
  // Les raretés sont celles de la série complète, calculées avant tout filtre.
  if (args.paquet || (!args.only && !args.echantillon && !(limite > 0))) {
    const codeQR = await fs.readFile(path.resolve(process.cwd(), "scripts/social/donnees/qr-vitrine.svg"), "utf8");
    // ESSAI EN COURS : disposition au choix, à figer une fois le choix fait.
    const disposition = process.env.VITRINE_PAQUET_PHOTO === "detoure" ? "detoure" as const : "horizontal" as const;
    const donnee = (f: string) => fs.readFile(path.resolve(process.cwd(), "scripts/social/donnees", f)).catch(() => null);
    // Échelle de la trame des portraits : 1500 px d'image pour 979 px de carte.
    const k = 1500 / PANNEAU.w;
    const source = await donnee(disposition === "detoure" ? "parlement-detoure.jpg" : "parlement-large.jpg");
    const decoupe = disposition === "detoure" ? await donnee("parlement-detoure-masque.png") : null;
    const url = !source ? null : disposition === "detoure"
      ? await trameURI(source, "paquet-parlement-detoure", { largeur: Math.round(955 * k), hauteur: Math.round(955 * k * 1765 / 2400), masque: decoupe ?? undefined })
      : await trameURI(source, "paquet-parlement-large", { largeur: Math.round((H - 2 * MARGE) * k), hauteur: Math.round((H - 2 * MARGE) * k * 1958 / 3000) });
    const paquet = pagesPaquet(logos, serie.total, serie.raretes, serie.sansExpression, await monogrammeVitrine(6), codeQR, { url, disposition });
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
    const impression = MODE_IMPRESSION && STYLE?.fondPerdu !== false && (!!args.png || !!args.impression);
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
          await page.evaluate(ajusterNom, undefined);
          await page.evaluate(ajusterRubriques, undefined);
          await page.evaluate(ajusterLegende, undefined);
          await page.evaluate(ajusterFonctions, undefined);
          await page.evaluate(ajusterVerso, undefined);
          const debord = await page.evaluate(mesurerDebordement, undefined);
          if (debord > 0) debordements.push(`${pages[i].slug} (${debord} px)`);
          for (const t of await page.evaluate(mesurerRetours, undefined)) retours.push(`${pages[i].slug} : « ${t} »`);
          for (const t of await page.evaluate(mesurerCoupes, undefined)) coupes.push(`${pages[i].slug} : ${t}`);
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

