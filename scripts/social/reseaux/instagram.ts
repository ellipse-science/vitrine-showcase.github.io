// INSTAGRAM — publié par Jules.
//
// Ce fichier n'est lu que pour Instagram. Le modifier ne peut pas changer un
// post LinkedIn, X, Facebook ou TikTok. Ce qui est commun aux cinq réseaux
// est dans `lib/identite.ts` ; on n'y touche qu'à deux.
//
// Ce qu'Instagram impose :
//   · AUCUN lien n'est cliquable dans une légende. L'adresse est remplacée par
//     « Lien dans la bio ». L'écrire quand même enverrait les gens dans le vide.
//   · Les mots-clics y servent vraiment : on met la série complète.
//   · La vidéo part sans son ; la musique se prend dans le catalogue de
//     l'application au moment de publier (GABARIT.md §0).

import { COMPTES, EMOJIS, HASHTAGS, RAPPEL, TRAIT } from "../lib/identite";
import type { Format, Matiere } from "./types";

/** Ce qui remplace l'adresse, faute de lien cliquable. */
const RENVOI = "Lien dans la bio.";

const instagram: Format = {
  responsable: "Jules",
  post: (m: Matiere) => [
    `${m.titre} ${EMOJIS}`, "",
    m.items.join("\n\n"), "",
    TRAIT, "",
    RAPPEL.replace(m.lien, RENVOI), "",
    HASHTAGS.join(" "), "",
    [...COMPTES.organisations, ...COMPTES.equipe].join(" · "),
  ].join("\n"),
};

export default instagram;
