// LES FACES DES CARTES DE DÉPUTÉ : recto (ordinaire et légendaire) et verso,
// en HTML + CSS dans un repère fixe de 1071 × 1496 px. Le même balisage sert
// au générateur imprimé (rendu par Chromium) et au site (dans l'ombre d'un
// élément) : c'est ce qui garantit que les deux sont identiques au pixel.
//
// Une face est rendue en trois morceaux (Face) ; documentHTML() les assemble
// en page complète pour le générateur. Le CSS cible `body` : le site le
// remplace par son hôte.
// Origine : scripts/social/cartes-deputes.ts (extraction du 2 oct. 2026).
import type { DeputyRow, PeriodKey } from "@/lib/data/assemblee";
import { COLORS, TONE, fleur, txt, type Glyphe } from "./dessin";
import {
  LIBELLE_RARETE, MONTANT, POURCENT, dateFr, ligneParti, nomImprime, positionAxe, sigleParti, toneScalePct, toneWording,
} from "./fonctions";
import {
  BANDE, BULLE, FLEURS_PAR_RARETE, FONCTION, H, LIBELLE_ENJEU_ENTIER, MARGE, METAUX, PANNEAU,
  PASTILLE_LEGENDAIRE, PHOTO_H, PLANCHER_IMPRESSION, RECTO_IMPRESSION_CSS, SCRIPT_PLANCHER, TOPPS,
  VERSO_IMPRESSION_CSS, W, cadreTopps, cheminFenetre, cheminOrigine, contourEnjeu, degradeMetal, degradeMetalCSS,
  grainHTML, grilleStats, marquesInstitutions, ordinal, vagueBulle,
} from "./gabarit";
import type { Carte, Etiquette } from "./types";

/** Ce que l'environnement fournit au rendu d'une face. */
export type Rendu = {
  /** Mise en page imprimée (plancher de 30 px, libellés en entier, logos au bas). */
  impression: boolean;
  /** Pictogramme d'un enjeu, en SVG (voir Glyphe). */
  glyphe: Glyphe;
  /** Logo de l'Université Laval (URL ou data:), à côté du CAPP. */
  logoUlaval: string | null;
};

/** Une face rendue : la feuille Google Fonts à charger, le CSS (qui cible
 *  `body`), les attributs du <body> et le balisage du corps. */
export type Face = { polices: string; css: string; attributs: string; corps: string };

/** La page complète d'une face, pour Chromium. */
export function documentHTML(face: Face): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<link href="${face.polices}" rel="stylesheet">
<style>
${face.css}</style></head><body${face.attributs}>${face.corps}</body></html>`;
}

/** RECTO DES LÉGENDAIRES — vraiment à part (Jules, 22-09) : la photo couvre
 *  toute la carte, sans cadre, et se fond dans l'encre du parti vers le bas ;
 *  un double filet papier et enjeu, en retrait des bords, comme un
 *  certificat ; un grand nom ; la signature en travers, quand on l'a. Médaillon, code de fonction, fleurs de
 *  lys et pied restent ceux de la série. */
export function rectoLegendaire(c: Carte, portrait: string | null, ecusson: string | null, logoCapp: string | null, rendu: Rendu): Face {
  const d = c.deputy;
  const parti = c.couleur;
  const fleurs = Array.from({ length: FLEURS_PAR_RARETE[c.rarete ?? "legendaire"] }, () => fleur(COLORS.paper, 26)).join("");
  return {
    polices: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=block",
    css: `
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
  ${rendu.impression ? RECTO_IMPRESSION_CSS : ""}
`,
    attributs: "",
    corps: `
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
  ${marquesInstitutions(logoCapp, rendu.logoUlaval)}
  ${grainHTML()}
`,
  };
}

export function recto(
  c: Carte,
  portrait: string | null,
  ecusson: string | null,
  logoCapp: string | null,
  rendu: Rendu,
): Face {
  if (c.rarete === "legendaire") return rectoLegendaire(c, portrait, ecusson, logoCapp, rendu);
  const d = c.deputy;
  const parti = c.couleur;
  const enjeu = d.topIssueColor ?? COLORS.soft;
  // Style Topps pour les rares seulement ; cadre d'origine pour les autres.
  const topps = c.rarete === "rare";
  const cadrePath = topps ? cheminFenetre(Boolean(ecusson)) : cheminOrigine(Boolean(ecusson));
  const marge = topps ? TOPPS.bande : 0;
  const fonc = FONCTION[c.rarete ?? "commune"];

  return {
    polices: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=block",
    css: `
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
  ${rendu.impression ? RECTO_IMPRESSION_CSS : ""}
`,
    attributs: "",
    corps: `
  <div class="panneau">
    <div class="photo">
      ${portrait
        ? `<div class="image"></div>`
        : `<div class="vide">${fleur(parti, 300)}</div>`}
    </div>
    ${d.topIssueKey ? `<div class="bulle-enjeu">${rendu.glyphe(d.topIssueKey, parti, 26)}</div>` : ""}
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
  ${marquesInstitutions(logoCapp, rendu.logoUlaval)}
  ${/* Plus de ruban au recto (22-09) : le titre est au verso. */ ""}

  <p class="pied">
    <span>${ordinal(txt(c.edition.split(" · ")[0]))}</span>
    <span>${c.libelleFonction ? `*&nbsp;${txt(c.libelleFonction)}` : "vitrinedemocratique.com"}</span>
  </p>

  ${grainHTML()}
`,
  };
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
export function verso(
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
  rendu: Rendu,
): Face {
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
  const TAILLE_PICTO_BARRE = rendu.impression ? 30 : 26;
  const barre = pile.length
    ? `<div class="empilee">${nommes.map((x, rang) => {
        // Le pictogramme DANS le segment (Jules, 28-09), centré. La trame
        // passe par la couleur (mélange avec le papier) et non par l'opacité,
        // qui aurait aussi délavé le pictogramme. Papier sur les trames
        // foncées, encre du parti sur la claire ; rien sous 4 % de large.
        const fond = `color-mix(in srgb, ${parti} ${Math.round(TRAMES[rang] * 100)}%, ${COLORS.paper})`;
        const picto = x.widthPct >= 4 ? rendu.glyphe(x.cle, rang < 2 ? COLORS.paper : parti, TAILLE_PICTO_BARRE) : "";
        return `<i style="width:${x.widthPct}%;background:${fond}">${picto}</i>`;
      }).join("")}${/* Tous les autres enjeux en UN segment pâle, pour que le
        tiret soit centré sur toute la zone et non sur un de ses morceaux. */ ""}<i style="flex:1 1 0;background:color-mix(in srgb, ${parti} 16%, ${COLORS.paper})">${
        100 - nommes.reduce((t, x) => t + x.widthPct, 0) >= 4 ? tiret(parti, TAILLE_PICTO_BARRE) : ""}</i></div>
       <ul class="legende">${nommes.map((x, i) => `
         <li>
           ${/* Sans la puce de couleur : le pictogramme, repris dans la barre,
                 fait le lien. Elle ne reste qu'à « Autres », qui n'en a pas. */ ""}
           <span class="pg">${rendu.glyphe(x.cle, parti, rendu.impression ? 26 : 22)}</span>
           <span class="pl">${txt(rendu.impression ? LIBELLE_ENJEU_ENTIER[x.label] ?? x.label : x.label)}</span>
           <b>${Math.round(x.widthPct)}&#8239;%</b>
         </li>`).join("")}
         <li class="reste"><span class="pg">${tiret(parti, rendu.impression ? 26 : 22)}</span>
           <span class="pl">Autres</span>
           <b>${Math.round(100 - nommes.reduce((t, x) => t + x.widthPct, 0))}&#8239;%</b></li>
       </ul>`
    : "";


  // LA FICHE, EN LIGNE DE STATISTIQUES (Jules, 26-09) : la LÉGISLATURE seule
  // (cartes de législature ; session et dernière séance appartiennent aux
  // éditions en ligne, décision du 22-09), donc plus de tableau à une rangée. Comme au dos d'une
  // carte de baseball : libellé en haut, chiffre en gros dessous, en entier
  // (« Diversité lexicale », pas « Diversité »).
  const rFiche = fiche.legislature;
  const statsFiche = rFiche
    ? grilleStats([
        // Quatre libellés sur UN rang (Jules, 28-09 : « Interventions » était
        // le seul sur une ligne) ; colonnes à la mesure de leur contenu.
        { l: "Interventions", v: rFiche.interventions.toLocaleString("fr-CA") },
        { l: "Mots prononcés", v: txt(rFiche.wordsFormatted) },
        { l: "Diversité lexicale", v: `<span class="points">${Array.from({ length: 5 }, (_, i) =>
          `<i class="${i < rFiche.richnessLevel ? "plein" : ""}"></i>`).join("")}</span>` },
        { l: "Ton", v: `<span class="ton" title="${txt(toneWording(rFiche.toneScore, maxAbs.legislature))}"><span class="piste"><i class="neutre"></i><i class="repere" style="left:${toneScalePct(rFiche.toneScore, maxAbs.legislature)}%;background:${rFiche.toneScore >= 0 ? TONE.positive : TONE.negative}"></i></span></span>` },
      ], "repeat(4,auto)")
    : `<p class="stats-vide">Aucune intervention</p>`;

  return {
    polices: "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Archivo+Narrow:ital,wght@0,400;0,600;0,700;1,400&display=block",
    css: `
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
  ${rendu.impression ? VERSO_IMPRESSION_CSS : ""}
`,
    attributs: rendu.impression ? ` data-plancher="${PLANCHER_IMPRESSION}"` : "",
    corps: `
  <div class="panneau">
    <div class="haut">
      <span class="numero">${c.numero}${c.variante}</span>
      <span class="titre">
        <span class="nom">${txt(nomImprime(d.name))}</span>
        <span class="identite"><span class="parti-long">${txt(partiLong)}</span></span>
        ${c.chef ? `<span class="chef${c.chef.eclat ? " eclat" : ""}">${c.chef.eclat ? "&#9733; " : ""}${ordinal(txt(rendu.impression ? sigleParti(c.chef.titre) : c.chef.titre))}</span>`
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
          <ul class="legende-parcours${c.parcours.legende.length > 3 && !rendu.impression ? " dense" : ""}">${c.parcours.legende.map((l) => `
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
    ${rendu.impression
      ? `<p class="metho metho-courte">Sources et méthode complète&nbsp;: vitrinedemocratique.com/methodologie</p>`
      : `<p class="metho">
      Sources&nbsp;: transcriptions du Salon bleu jusqu'au ${txt(derniereSeance.replace(/^\p{L}+ (?=\d)/u, ""))}, fiches de l'Assemblée nationale, résultats d'Élections Québec.
      Diversité lexicale&nbsp;: part de mots différents (indice MATTR), de un à cinq points par rapport à l'ensemble des élus. Le ton est lui aussi situé par rapport aux autres élus, pas dans l'absolu.
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
    ${rendu.impression ? "" : `<p class="pied">
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
  ${rendu.impression ? `<p class="logos-bas">
    ${logoVitrine ? `<span class="marque" style="-webkit-mask-image:url('${logoVitrine}');mask-image:url('${logoVitrine}')"></span>` : `<span></span>`}
    ${ecusson ? `<span class="ecusson" style="-webkit-mask-image:url('${ecusson}');mask-image:url('${ecusson}')"></span>` : `<span></span>`}
  </p>` : `<p class="credit">
    <span>Portrait&nbsp;: Assemblée nationale du Québec &middot; usage non commercial autorisé</span>
    <span>${ordinal(txt(c.edition))} &middot; carte ${c.numero}${c.variante} de ${c.total}</span>
  </p>`}
  ${marquesInstitutions(logoCapp, rendu.logoUlaval)}
  ${grainHTML()}
${rendu.impression ? SCRIPT_PLANCHER : ""}
`,
  };
}
