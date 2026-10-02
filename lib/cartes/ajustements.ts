// AJUSTEMENTS DANS LA PAGE : rapetisser un nom trop long, resserrer un verso
// qui déborde, mesurer ce qui est coupé. Ces fonctions s'exécutent dans le
// navigateur — par `page.evaluate` chez le générateur (elles sont alors
// SÉRIALISÉES : aucune fonction imbriquée, aucune référence au module), et
// directement sur le site, dans l'ombre (shadow DOM) de chaque carte.
//
// `racine` : l'arbre à ajuster. Absent, c'est le document entier (générateur).
// Le plancher d'impression se lit sur <body data-plancher> ; sur le site il
// n'y en a pas.
// Origine : scripts/social/cartes-deputes.ts (extraction du 2 oct. 2026).

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
export function mesurerCoupes(racine?: ParentNode): string[] {
  const r = racine || document;
  const out: string[] = [];
  const els = r.querySelectorAll<HTMLElement>("body *");
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e.closest("svg") || e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
    const t = (e.textContent || "").trim();
    if (!t) continue;
    if (e.style.display === "none" && !e.classList.contains("parti-long")) { out.push(`masqué : ${t.slice(0, 60)}`); continue; } // garde-redaction: ok (diagnostic de console, jamais affiché)
    const cs = getComputedStyle(e);
    if (cs.display === "none") continue;
    const cache = cs.overflowX === "hidden" || cs.textOverflow === "ellipsis";
    if (cache && e.scrollWidth > e.clientWidth + 1) out.push(`coupé : ${t.slice(0, 60)}`); // garde-redaction: ok (diagnostic de console, jamais affiché)
    else if (e.classList.contains("citation") && e.scrollHeight > e.clientHeight + 1) out.push(`citation rognée : ${t.slice(0, 60)}`); // garde-redaction: ok (diagnostic de console, jamais affiché)
  }
  return out;
}

export function mesurerRetours(racine?: ParentNode): string[] {
  const r = racine || document;
  const coupees: string[] = [];
  const els = r.querySelectorAll<HTMLElement>(".identite, .chef, .vitaux, .rubrique, .stats > span, .pied span, .credit span");
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
  const legendes = r.querySelectorAll<HTMLElement>(".legende-parcours .ft");
  for (let i = 0; i < legendes.length; i++) {
    if (legendes[i].style.fontSize) coupees.push(`rapetissé à ${legendes[i].style.fontSize} : ${(legendes[i].textContent || "").trim().slice(0, 60)}`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
  }
  // Une ligne de statistiques plus large que son encadré (colonnes à la
  // mesure du contenu) déborderait sur le côté sans passer à la ligne.
  // À l'impression, des enjeux restés sur deux rangs malgré ajusterLegende.
  const enjeux = r.querySelectorAll<HTMLElement>(".legende li");
  if ((r as Document).body?.dataset.plancher && enjeux.length) {
    let h = Infinity, b = -Infinity;
    for (let i = 0; i < enjeux.length; i++) { const t = enjeux[i].getBoundingClientRect().top; if (t < h) h = t; if (t > b) b = t; }
    if (b - h >= 4) coupees.push("enjeux sur deux rangs");
  }
  const grilles = r.querySelectorAll<HTMLElement>(".stats, .rubrique, .paie");
  for (let i = 0; i < grilles.length; i++) {
    if (grilles[i].scrollWidth > grilles[i].clientWidth + 1) coupees.push(`grille trop large : ${(grilles[i].textContent || "").trim().slice(0, 40)}`); // garde-redaction: ok (diagnostic de console au build, jamais affiché)
  }
  return coupees;
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
export function ajusterRubriques(racine?: ParentNode): void {
  const r = racine || document;
  const els = r.querySelectorAll<HTMLElement>(".rubrique");
  const plancher = Number((r as Document).body?.dataset.plancher || 18);
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
export function ajusterLegende(racine?: ParentNode): void {
  const r = racine || document;
  const l = r.querySelector<HTMLElement>(".legende");
  if (!l || !(r as Document).body?.dataset.plancher) return;
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

export function ajusterFonctions(racine?: ParentNode): void {
  const r = racine || document;
  const els = r.querySelectorAll<HTMLElement>(".legende-parcours .ft");
  for (let i = 0; i < els.length; i++) {
    let taille = parseFloat(getComputedStyle(els[i]).fontSize);
    const plancher = Number((r as Document).body?.dataset.plancher || 15);
    while (els[i].scrollWidth > els[i].clientWidth && taille > plancher) {
      taille -= 1;
      els[i].style.fontSize = `${taille}px`;
    }
  }
}

export function ajusterNom(racine?: ParentNode): void {
  const r = racine || document;
  const els = Array.from(r.querySelectorAll<HTMLElement>(".nom, .nom .ligne"));
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
export function mesurerDebordement(racine?: ParentNode): number {
  const r = racine || document;
  const panneau = r.querySelector<HTMLElement>(".panneau");
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
export function ajusterVerso(racine?: ParentNode): void {
  const r = racine || document;
  const panneau = r.querySelector<HTMLElement>(".panneau");
  if (!panneau) return;
  const citation = r.querySelector<HTMLElement>(".citation");
  const mot = r.querySelector<HTMLElement>(".mot");
  const blocs = Array.from(r.querySelectorAll<HTMLElement>(".bloc"));
  let taille = mot ? parseFloat(getComputedStyle(mot).fontSize) : 0;
  let rembourrage = blocs.length ? parseFloat(getComputedStyle(blocs[0]).paddingTop) : 0;
  const metho = r.querySelector<HTMLElement>(".metho");
  let tailleMetho = metho ? parseFloat(getComputedStyle(metho).fontSize) : 0;
  const imprime = !!(r as Document).body?.dataset.plancher;
  const cellules = Array.from(r.querySelectorAll<HTMLElement>(".stats > b"));
  let cellule = cellules.length ? parseFloat(getComputedStyle(cellules[0]).paddingTop) : 0;
  const haut = r.querySelector<HTMLElement>(".haut");

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
        const pied = r.querySelector<HTMLElement>(".pied");
        if (pied) pied.style.paddingTop = "0px";
        const rangs = r.querySelectorAll<HTMLElement>(".legende-parcours li");
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
