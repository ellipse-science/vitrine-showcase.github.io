// 3. COMBIEN DE TEMPS ELLE TIENT — à combien des sept dernières éditions la
// nouvelle est restée en Une. Le site suit la storyline sur 24 h ; il n'écrit
// pas ce décompte.

import { esc } from "../../lib/reel";
import { corpsTitre, type Analyse } from "../plan";

const TOTAL = 7;

export const tenue: Analyse = {
  id: "tenue",
  idee: "À combien des sept dernières éditions la nouvelle est restée en Une",
  construire({ top }) {
    const n = top.nBlocks24h ?? 0;
    // Tenir une ou deux éditions, c'est ordinaire ; à partir de quatre, l'histoire
    // s'installe, et c'est ça qui se raconte.
    if (n < 4 || n > TOTAL) return null;
    const cases = Array.from({ length: TOTAL }, (_, i) => {
      const on = i >= TOTAL - n;
      return `<div class="case${on ? " on" : ""}" style="${on ? `background:${top.issueColor};` : ""}animation:pop .35s ${.5 + i * .16}s both"></div>`;
    }).join("");
    return {
      visuel: `<div class="serie">${cases}</div>
        <div class="socle mono" style="animation:fadeIn .5s 2s both">Une case par édition · 24 heures</div>`,
      css: `
#plan .serie{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;gap:18px}
#plan .case{flex:1;height:250px;border:5px solid ${"var(--rule)"};background:transparent}
#plan .case.on{border-color:transparent}
#plan .socle{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:28px;letter-spacing:.04em;color:var(--soft)}`,
      phrases: [
        { a: "Cette nouvelle ne lâche pas les Unes…", b: esc(top.title), taille: corpsTitre(top.title), couleur: top.issueColor, debut: .15, fin: 3.0 },
        { a: "Sur les sept dernières éditions…", b: `Elle en a tenu ${n}.`, couleur: top.issueColor, debut: 3.2 },
      ],
      legende: `« ${top.title} » figure en Une à ${n} des sept dernières éditions de la Vitrine démocratique, soit les 24 dernières heures.`,
    };
  },
};
