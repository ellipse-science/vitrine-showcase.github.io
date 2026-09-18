// 1. LA CONCENTRATION — combien les trois premiers enjeux pèsent, à eux seuls,
// dans l'attention des douze. La treemap montre les douze parts ; leur SOMME,
// elle, n'est écrite nulle part sur le site.

import { libelleEnjeuCourt } from "@/lib/enjeux";

import { AXE_LABEL, CSS_BARRES, PLAFOND_AXE, barresHtml, scriptBarres, type Analyse } from "../plan";

/** Sous ce seuil, trois enjeux sur douze ne « dominent » rien : les douze se
 *  partagent l'attention à peu près également et il n'y a pas d'histoire.
 *  Un partage parfaitement égal donnerait 25 % pour trois enjeux sur douze. */
const SEUIL = 45;

/** QUATRE barres, pas cinq comme les partis : le podium, plus celui qui suit.
 *  Un parti a un sigle de trois lettres, un enjeu porte un nom — « International »,
 *  « Loi et ordre ». À cinq colonnes, les noms se faisaient couper en « Loi et »
 *  et « G ». Quatre colonnes les laissent entiers ; c'est la seule chose que ce
 *  module change au graphique. */
const BARRES_MONTREES = 4;

/** Le nom d'un enjeu est plus long qu'un sigle de parti : l'étiquette descend au
 *  plancher de lisibilité (28 px) pour tenir dans sa colonne. */
const CSS_ETIQUETTES = `
#plan .bp .s{font-size:28px}`;

export const domine: Analyse = {
  id: "domine",
  idee: "Ce que les trois premiers enjeux pèsent, à eux seuls, dans l’attention des douze",
  construire({ tuiles }) {
    if (tuiles.length < BARRES_MONTREES) return null;
    const trois = tuiles.slice(0, 3);
    const somme = Math.round(trois.reduce((t, x) => t + x.share, 0));
    if (somme < SEUIL) return null;

    const montrees = tuiles.slice(0, BARRES_MONTREES);
    return {
      visuel: barresHtml(montrees.map((t, i) => ({
        key: t.issueKey,
        label: libelleEnjeuCourt(t.issueFr),
        // Le podium à sa couleur, le reste en sourdine : c'est le podium qu'on
        // additionne, et l'œil doit voir lequel.
        color: i < 3 ? t.color : "#C6BBA4",
        de: 0,
        a: Math.round(t.share),
      })), PLAFOND_AXE),
      css: CSS_BARRES + CSS_ETIQUETTES,
      script: scriptBarres({ t0: .3, d: 1.3, decale: .08, plafond: PLAFOND_AXE }),
      phrases: [
        {
          a: "Depuis minuit, sur les douze enjeux…",
          b: `${libelleEnjeuCourt(trois[0].issueFr)} mène.`,
          couleur: trois[0].color,
          debut: .15,
          fin: 3.0,
        },
        {
          a: "Les trois premiers, à eux seuls :",
          b: `${somme} % de l’attention.`,
          couleur: trois[0].color,
          debut: 3.2,
        },
      ],
      methode: AXE_LABEL,
      legende: `Depuis minuit, les trois enjeux les plus saillants — ${trois.map((t) => libelleEnjeuCourt(t.issueFr)).join(", ")} — pèsent ${somme} % de l’attention que les Unes de l’actualité consacrent aux douze enjeux de la campagne.`,
    };
  },
};
