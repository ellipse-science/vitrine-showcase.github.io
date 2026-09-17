// LES CINQ FORMATS — un fichier par réseau, à chaque édition.
//
// Décision d'Adrien (2026-09-16) : « tu dois toujours finir par produire TOUS
// les formats pour nos différents réseaux ». On commence à la main, on
// automatisera ensuite — mais les textes, eux, sortent déjà tout seuls.
//
//   1. LinkedIn   → Adrien
//   2. X          → Adrien
//   3. Facebook   → Jules Piral
//   4. Instagram  → Jules Piral
//   5. TikTok     → Jules Piral
//
// CE QUI CHANGE D'UN RÉSEAU À L'AUTRE, et pourquoi :
//   · Instagram et TikTok ne rendent AUCUN lien cliquable dans une légende :
//     l'adresse y est remplacée par « lien dans la bio ». L'écrire quand même
//     serait envoyer les gens dans le vide.
//   · X coupe à 280 caractères : le post part en fil, une nouvelle par message,
//     et le script compte les caractères pour qu'on le sache AVANT de publier.
//   · LinkedIn n'affiche que les deux premières lignes avant « voir plus » :
//     le chiffre passe donc devant, jamais le nom du projet.
//   · Les mots-clics : trois au plus sur LinkedIn (au-delà, ça fait spam), la
//     série complète sur Instagram et TikTok, où ils servent vraiment.

import { COMPTES, EMOJIS, HASHTAGS, RAPPEL, TRAIT, oqlf } from "./post";

export type Reseau = "linkedin" | "x" | "facebook" | "instagram" | "tiktok";

export const RESPONSABLE: Record<Reseau, string> = {
  linkedin: "Adrien", x: "Adrien", facebook: "Jules", instagram: "Jules", tiktok: "Jules",
};

/** La matière d'une édition, telle que chaque réseau la reçoit. */
export type Matiere = {
  /** « Les faits saillants au Québec en ce moment (Édition de 16h) » */
  titre: string;
  /** Une ligne par nouvelle, déjà numérotée et mesurée. */
  items: string[];
  /** Les titres seuls, sans la mesure — pour X, où chaque caractère compte. */
  titresSeuls: string[];
  lien: string;
};

const LIMITE_X = 280;

/** Le fil X : une nouvelle par message, numéroté, avec le compte de caractères
 *  en commentaire au-dessus de chaque message (à ne pas copier). */
function filX(m: Matiere): string {
  // Les nouvelles sont courtes : on en met le plus possible par message plutôt
  // qu'une par message — un fil de sept tweets pour cinq titres se fait fermer
  // avant la fin.
  const groupes: string[] = [];
  for (const [i, t] of m.titresSeuls.entries()) {
    const ligne = `${i + 1}. ${t}`;
    const dernier = groupes[groupes.length - 1];
    if (dernier && [...`${dernier}\n\n${ligne}`].length <= LIMITE_X - 12) groupes[groupes.length - 1] = `${dernier}\n\n${ligne}`;
    else groupes.push(ligne);
  }
  const messages = [
    `${m.titre} ${EMOJIS}\n\nLe classement des nouvelles les plus saillantes, mesuré toutes les 4 h. 🧵`,
    ...groupes,
    `Toutes les 4 heures, la Vitrine démocratique mesure ce qui occupe l’espace médiatique québécois.\n\n${m.lien}`,
  ];
  return messages.map((msg, i) => {
    const n = [...msg].length;
    const alerte = n > LIMITE_X ? `  ⚠️ ${n - LIMITE_X} caractères DE TROP` : `  ${LIMITE_X - n} caractères restants`;
    return `─── message ${i + 1}/${messages.length} (${n} caractères)${alerte} ───\n${msg}`;
  }).join("\n\n");
}

export function formats(m: Matiere): Record<Reseau, string> {
  const comptes = [...COMPTES.organisations, ...COMPTES.equipe].join(" · ");
  const corps = m.items.join("\n\n");

  const linkedin = [
    `${m.titre} ${EMOJIS}`, "", corps, "", TRAIT, "", RAPPEL, "",
    HASHTAGS.slice(0, 3).join(" "), "", comptes,
  ].join("\n");

  const facebook = [
    `${m.titre} ${EMOJIS}`, "", corps, "", TRAIT, "", RAPPEL, "",
    HASHTAGS.slice(0, 4).join(" "), "", comptes,
  ].join("\n");

  // Pas de lien cliquable dans une légende Instagram ou TikTok.
  const sansLien = RAPPEL.replace(m.lien, "Lien dans la bio.");

  const instagram = [
    `${m.titre} ${EMOJIS}`, "", corps, "", TRAIT, "", sansLien, "",
    HASHTAGS.join(" "), "", comptes,
  ].join("\n");

  const tiktok = [
    `${m.titre} ${EMOJIS}`, "",
    ...m.titresSeuls.slice(0, 3).map((t, i) => `${i + 1}. ${t}`), "",
    "Mesuré toutes les 4 heures par la Vitrine démocratique. Lien dans la bio.", "",
    HASHTAGS.join(" "),
  ].join("\n");

  return {
    linkedin: oqlf(linkedin),
    x: oqlf(filX(m)),
    facebook: oqlf(facebook),
    instagram: oqlf(instagram),
    tiktok: oqlf(tiktok),
  };
}
