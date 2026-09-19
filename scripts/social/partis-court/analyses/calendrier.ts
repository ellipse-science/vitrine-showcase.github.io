// 5. LE CALENDRIER — une case par journée de campagne, à la couleur du parti qui
// l'a menée. Le parti qui mène le plus de journées, et le fait qu'aucun ne
// domine vraiment (ou qu'un seul domine).

import { SIGLE_ARTICLE, cap } from "../../lib/partis";
import { esc } from "../../lib/reel";
import { type Analyse } from "../plan";

export const calendrier: Analyse = {
  id: "calendrier",
  idee: "Une case par journée de campagne, à la couleur du parti qui l'a menée",
  construire({ data }) {
    const camp = [...data.ranges.overall.rows].sort((a, b) => b.joursEnTete - a.joursEnTete);
    const total = camp[0]?.joursComptes ?? 0;
    if (total < 7) return null;
    const cases = camp.flatMap((r) => Array.from({ length: r.joursEnTete }, () => r));
    const vides = Math.max(0, total - cases.length);
    const cols = total > 24 ? 8 : 6;
    const html = [...cases.map((r, i) => `<i style="background:${r.color};animation:pop .25s ${.5 + i * (2.3 / total)}s both"></i>`),
      ...Array.from({ length: vides }, (_, i) => `<i class="vide" style="animation:pop .25s ${.5 + (cases.length + i) * (2.3 / total)}s both"></i>`)].join("");
    const tete = camp[0];
    const moitie = tete.joursEnTete * 2 > total;
    const legende = camp.filter((r) => r.joursEnTete > 0).map((r) => `<span><s style="background:${r.color}"></s>${esc(r.label)} ${r.joursEnTete}</span>`).join("");
    return {
      visuel: `<div class="cal" style="grid-template-columns:repeat(${cols},1fr)">${html}</div><div class="leg mono" style="animation:fadeIn .4s 3s both">${legende}</div>`,
      css: `
#plan .cal{position:absolute;left:0;right:0;top:0;display:grid;gap:12px}
#plan .cal i{display:block;aspect-ratio:1;border-radius:6px}
#plan .cal i.vide{background:var(--deep)}
#plan .leg{position:absolute;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;gap:14px 30px;font-size:30px;letter-spacing:.04em}
#plan .leg span{display:flex;align-items:center;gap:10px}
#plan .leg s{display:block;width:26px;height:26px;border-radius:5px}`,
      phrases: [
        { a: `Depuis le début de la campagne, ${total} journées.`, b: `${cap(SIGLE_ARTICLE[tete.key])} en a mené ${tete.joursEnTete}.`, couleur: tete.color, debut: .15, fin: 3.0 },
        { a: moitie ? "Un seul parti domine :" : "Et personne ne domine :", b: moitie ? "plus de la moitié des journées" : "aucun parti n’a mené la moitié des journées", debut: 3.2 },
      ],
      legende: `Depuis le début de la campagne, ${total} journées : ${camp.filter((r) => r.joursEnTete > 0).map((r) => `${SIGLE_ARTICLE[r.key]} en a mené ${r.joursEnTete}`).join(", ")}. ${moitie ? `${cap(SIGLE_ARTICLE[tete.key])} a mené plus de la moitié des journées.` : "Aucun parti n’a mené la moitié des journées."}`,
    };
  },
};
