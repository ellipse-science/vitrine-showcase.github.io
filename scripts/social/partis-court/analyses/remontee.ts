// 9. LA SEMAINE — lecture simple du module : qui occupe le plus de couverture
// accordée aux partis dans l'actualité cette semaine. Pas d'évolution, pas de
// graphique en pente : seulement le vu-mètre.

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { AXE_LABEL, CSS_BARRES, barresHtml, scriptBarres, type Analyse } from "../plan";

export const remontee: Analyse = {
  id: "remontee",
  idee: "Cette semaine : le parti le plus présent dans la couverture accordée aux partis",
  construire({ data }) {
    const rows = [...data.ranges.week.rows].sort((a, b) => a.rang - b.rang);
    const lead = rows[0];
    if (!lead) return null;
    return {
      visuel: barresHtml(rows.map((r) => ({ key: r.key, label: r.label, color: r.color, de: 0, a: r.sovPct }))),
      css: CSS_BARRES,
      script: scriptBarres({ t0: .5, d: 1.6, decale: .08 }),
      phrases: [
        { a: "Cette semaine, dans les Unes de l’actualité :", b: `${cap(SIGLE_ARTICLE[lead.key])} est le parti le plus présent`, couleur: lead.color, debut: .15, fin: 3.0 },
        { a: "Il représente", b: `${lead.sovPct} % de la couverture accordée aux partis dans l’actualité`, couleur: lead.color, taille: 62, debut: 3.2 },
      ],
      methode: AXE_LABEL,
      legende: `Cette semaine, ${SIGLE_ARTICLE[lead.key]} est le parti le plus présent dans les Unes de l’actualité : ${lead.sovPct} % de la couverture accordée aux partis dans l’actualité.`,
    };
  },
};
