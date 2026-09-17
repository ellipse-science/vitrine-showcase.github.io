// 8. L'OUBLIÉ — le parti dont on parle le moins : la caméra zoome sur sa barre
// minuscule. Combien de fois moins que le parti en tête.

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { BOITE, CSS_BARRES, barresHtml, duree, fois, scriptBarres, type Analyse } from "../plan";

export const oublie: Analyse = {
  id: "oublie",
  idee: "Le parti dont on parle le moins : la caméra zoome sur sa barre minuscule",
  construire({ rows }) {
    const lead = rows[0];
    const parMinutes = [...rows].sort((a, b) => a.minutesUne - b.minutesUne);
    const dernier = parMinutes[0], avantDernier = parMinutes[1];
    if (!dernier || dernier.minutesUne <= 0 || lead.minutesUne / dernier.minutesUne < 3) return null;
    // Égalité de fait : pas d'« oublié » à désigner.
    if (avantDernier && avantDernier.minutesUne - dernier.minutesUne < 3) return null;
    const i = rows.findIndex((r) => r.key === dernier.key);
    const x = ((i + .5) / rows.length) * 100;
    return {
      visuel: barresHtml(rows.map((r) => ({ key: r.key, label: r.label, color: r.color, de: 0, a: r.sovPct }))),
      css: CSS_BARRES,
      script: scriptBarres({ t0: .3, d: 1.2, garder: dernier.key, pale: 2.6 }),
      zoom: { x, y: 100, de: 1, a: 1.9, debut: 2.8 },
      phrases: [
        { a: "Depuis minuit, le parti dont les Unes parlent le moins :", b: `${cap(SIGLE_ARTICLE[dernier.key])}, ${duree(dernier.minutesUne)} de Une`, couleur: dernier.color, debut: .15, fin: 3.0 },
        { a: `Face ${lead.key === "caq" ? "à la" : lead.key === "qs" ? "à" : "au"} ${lead.label} :`, b: `${fois(lead.minutesUne / dernier.minutesUne)} moins de temps`, debut: 3.2 },
      ],
      legende: `Depuis minuit, ${SIGLE_ARTICLE[dernier.key]} est le parti dont les Unes parlent le moins : ${duree(dernier.minutesUne)} de temps en Une, tous médias confondus, soit ${fois(lead.minutesUne / dernier.minutesUne)} moins que ${SIGLE_ARTICLE[lead.key]} (${duree(lead.minutesUne)}).`,
    };
  },
};
void BOITE;
