// 4. LA BASCULE — le parti qui menait la semaine n'est plus celui qui mène
// aujourd'hui. Les barres de la semaine se transforment, en direct, en barres
// du jour.

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { CSS_BARRES, ECHELLE_BARRES, barresHtml, scriptBarres, type Analyse } from "../plan";

export const bascule: Analyse = {
  id: "bascule",
  idee: "Le parti en tête depuis lundi n'est plus en tête aujourd'hui : les barres basculent",
  construire({ data, rows }) {
    const semaine = [...data.ranges.week.rows].sort((a, b) => a.rang - b.rang);
    const lead = rows[0], avant = semaine[0];
    if (!avant || avant.key === lead.key) return null;
    const pctSemaine = (k: string) => semaine.find((r) => r.key === k)?.sovPct ?? 0;
    return {
      visuel: barresHtml(rows.map((r) => ({ key: r.key, label: r.label, color: r.color, de: pctSemaine(r.key), a: r.sovPct }))),
      css: CSS_BARRES + `#plan .bp .f{height:0}`,
      // Barres de la semaine d'abord (montée), puis bascule vers le jour.
      script: `
  if(t<3.0){
    racine.querySelectorAll(".bp").forEach(function(b,i){
      var v=+b.dataset.de*ease(clamp((t-.3-i*.05)/1.0));
      b.querySelector(".f").style.height=(v*${ECHELLE_BARRES.toFixed(3)})+"px";
      b.querySelector(".p").textContent=Math.round(v)+"\\u00A0%";
    });
  } else {${scriptBarres({ t0: 3.1, d: 1.3, decale: 0 })}
  }`,
      phrases: [
        { a: "Depuis lundi, le parti le plus présent en Une :", b: `${cap(SIGLE_ARTICLE[avant.key])}, avec ${avant.sovPct} %`, couleur: avant.color, debut: .15, fin: 3.0 },
        { a: "Aujourd’hui, tout bascule :", b: `${cap(SIGLE_ARTICLE[lead.key])} grimpe à ${lead.sovPct} %`, couleur: lead.color, debut: 3.1 },
      ],
      legende: `Depuis lundi, ${SIGLE_ARTICLE[avant.key]} menait avec ${avant.sovPct} % du temps que les Unes consacrent aux partis. Aujourd’hui, ${SIGLE_ARTICLE[lead.key]} passe devant, à ${lead.sovPct} %.`,
    };
  },
};
