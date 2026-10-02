// X — publié par Adrien.
//
// Ce fichier n'est lu que pour X. Le modifier ne peut pas changer un post
// LinkedIn, Facebook, Instagram ou TikTok. Ce qui est commun aux cinq réseaux
// est dans `lib/identite.ts` ; on n'y touche qu'à deux.
//
// Ce que X impose :
//   · 280 caractères par message. Le post part donc en FIL.
//   · Les nouvelles sont courtes : on en groupe le plus possible par message
//     plutôt qu'une par message — un fil de sept messages pour cinq titres se
//     fait fermer avant la fin.
//   · Le compte de caractères est écrit au-dessus de chaque message pour qu'on
//     le sache AVANT de publier. Ces lignes de séparation ne se copient pas.
//   · Les liens sont cliquables — on écrit l'adresse en toutes lettres.

import { EMOJIS } from "../lib/identite";
import type { Format, Matiere } from "./types";

const LIMITE = 280;

/** Marge laissée à la numérotation du fil dans le groupage. */
const MARGE = 12;

/** Groupe les titres en messages qui tiennent sous la limite. */
function grouper(titres: string[]): string[] {
  const groupes: string[] = [];
  for (const [i, t] of titres.entries()) {
    const ligne = `${i + 1}. ${t}`;
    const dernier = groupes[groupes.length - 1];
    if (dernier && [...`${dernier}\n\n${ligne}`].length <= LIMITE - MARGE) {
      groupes[groupes.length - 1] = `${dernier}\n\n${ligne}`;
    } else {
      groupes.push(ligne);
    }
  }
  return groupes;
}

const x: Format = {
  responsable: "Adrien",
  post: (m: Matiere) => {
    const messages = [
      `${m.titre} ${EMOJIS}\n\nLe classement des nouvelles les plus saillantes, mesuré toutes les 4 h. 🧵`,
      ...grouper(m.titresSeuls),
      `Toutes les 4 heures, la Vitrine démocratique mesure ce qui occupe l’espace médiatique québécois.\n\n${m.lien}`,
    ];
    return messages.map((msg, i) => {
      const n = [...msg].length;
      const alerte = n > LIMITE ? `  ⚠️ ${n - LIMITE} caractères DE TROP` : `  ${LIMITE - n} caractères restants`;
      return `─── message ${i + 1}/${messages.length} (${n} caractères)${alerte} ───\n${msg}`;
    }).join("\n\n");
  },
};

export default x;
