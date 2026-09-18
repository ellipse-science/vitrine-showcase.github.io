// 2. LE BOND — l'enjeu dont la saillance a le plus progressé depuis le bloc
// précédent. Le site pose une flèche de tendance sur chaque tuile ; le
// POURCENTAGE de progression, lui, n'y est écrit nulle part.

import { libelleEnjeuCourt } from "@/lib/enjeux";

import { AXE_LABEL, CSS_BARRES, PLAFOND_AXE, barresHtml, scriptBarres, type Analyse } from "../plan";

/** Sous ce seuil, une progression est du bruit de mesure, pas une nouvelle. */
const SEUIL = 40;

const BARRES_MONTREES = 5;

export const bond: Analyse = {
  id: "bond",
  idee: "L’enjeu dont la saillance a le plus progressé depuis l’édition précédente",
  construire({ tuiles, data }) {
    // `growth` est nul pour un enjeu qui n'existait pas au bloc précédent : sa
    // progression n'est pas mesurable, on ne l'invente pas.
    const mesurables = tuiles.filter((t) => t.growth != null && Number.isFinite(t.growth));
    if (!mesurables.length) return null;
    const monte = mesurables.reduce((a, b) => ((b.growth ?? 0) > (a.growth ?? 0) ? b : a));
    const croissance = Math.round(monte.growth ?? 0);
    if (croissance < SEUIL) return null;

    // « ce matin », « hier soir » : à quoi la comparaison se fait, dit par les
    // données elles-mêmes. Sans ça, « a progressé » ne veut rien dire.
    const depuis = data.day.growthSince;
    if (!depuis) return null;

    const montrees = tuiles.slice(0, BARRES_MONTREES);
    const dansLesCinq = montrees.some((t) => t.issueKey === monte.issueKey);
    const barres = dansLesCinq ? montrees : [...montrees.slice(0, BARRES_MONTREES - 1), monte];

    return {
      visuel: barresHtml(barres.map((t) => ({
        key: t.issueKey,
        label: libelleEnjeuCourt(t.issueFr),
        color: t.issueKey === monte.issueKey ? t.color : "#C6BBA4",
        de: 0,
        a: Math.round(t.share),
      })), PLAFOND_AXE),
      css: CSS_BARRES,
      script: scriptBarres({ t0: .3, d: 1.3, decale: .08, garder: monte.issueKey, pale: 2.6, plafond: PLAFOND_AXE }),
      eclair: 2.1,
      phrases: [
        {
          a: `L’enjeu qui monte le plus depuis ${depuis} :`,
          b: libelleEnjeuCourt(monte.issueFr),
          couleur: monte.color,
          debut: .15,
          fin: 3.0,
        },
        {
          a: "Sa saillance :",
          b: `+${croissance} %.`,
          couleur: monte.color,
          debut: 3.2,
        },
      ],
      methode: AXE_LABEL,
      legende: `Depuis ${depuis}, c’est ${libelleEnjeuCourt(monte.issueFr)} dont la saillance progresse le plus parmi les douze enjeux de la campagne : +${croissance} %. Il occupe maintenant ${Math.round(monte.share)} % de l’attention que les Unes de l’actualité consacrent aux douze.`,
    };
  },
};
