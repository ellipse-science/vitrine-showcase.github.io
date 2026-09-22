// 1. RECORD — la part du parti en tête aujourd'hui dépasse le meilleur jour de
// tous les autres partis depuis le début de la campagne. La barre franchit la
// ligne de ce meilleur jour, à la même échelle.

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { CSS_BARRES, CSS_LIGNE, barresHtml, commeOnLeDit, ligneBarres, scriptBarres, type Analyse } from "../plan";

export const record: Analyse = {
  id: "record",
  idee: "La part du jour du parti en tête bat le meilleur jour de tous les autres partis de la campagne",
  construire({ data, rows }) {
    const lead = rows[0];
    const moi = data.ranges.overall.rows.find((r) => r.key === lead.key);
    const autres = data.ranges.overall.rows.filter((r) => r.key !== lead.key).sort((x, y) => y.peakPct - x.peakPct);
    if (!moi || !autres[0] || moi.peakPct !== lead.sovPct || autres.some((r) => r.peakPct >= lead.sovPct)) return null;
    const dit = commeOnLeDit(lead.sovPct);
    return {
      visuel: barresHtml(rows.map((r) => ({ key: r.key, label: r.label, color: r.color, de: 0, a: r.sovPct })))
        + ligneBarres(autres[0].peakPct, `Meilleur jour d’un autre parti : ${autres[0].label}, ${autres[0].peakPct} %`, 3.1),
      css: CSS_BARRES + CSS_LIGNE,
      script: scriptBarres({ t0: .3, d: 1.4, garder: lead.key, pale: 1.7 }),
      phrases: [
        { a: "Aujourd’hui, quand les Unes parlent d’un parti…", b: dit ? `${cap(dit)}, c’est ${SIGLE_ARTICLE[lead.key]}.` : `${cap(SIGLE_ARTICLE[lead.key])} : ${lead.sovPct} % du temps.`, couleur: lead.color, debut: .15, fin: 3.0 },
        { a: "Et c’est un record :", b: "du jamais vu depuis le début de la campagne", debut: 3.2 },
      ],
      eclair: 3.9,
      legende: `Depuis minuit, ${SIGLE_ARTICLE[lead.key]} occupe ${lead.sovPct} % du temps que les Unes consacrent aux partis. Aucun autre parti n’a eu autant de place en une journée depuis le début de la campagne (meilleur jour : ${SIGLE_ARTICLE[autres[0].key]}, ${autres[0].peakPct} %).`,
    };
  },
};
