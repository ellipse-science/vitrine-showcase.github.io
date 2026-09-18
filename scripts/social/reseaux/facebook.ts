// FACEBOOK — publié par Jules.
//
// Ce fichier n'est lu que pour Facebook. Le modifier ne peut pas changer un
// post LinkedIn, X, Instagram ou TikTok. Ce qui est commun aux cinq réseaux
// est dans `lib/identite.ts` ; on n'y touche qu'à deux.
//
// Ce que Facebook impose :
//   · Pas de limite de longueur qui morde sur un post de cette taille.
//   · Les liens sont cliquables — on écrit l'adresse en toutes lettres.
//   · Les mots-clics y comptent moins qu'ailleurs : quatre suffisent.

import { COMPTES, EMOJIS, HASHTAGS, RAPPEL, TRAIT } from "../lib/identite";
import type { Format, Matiere } from "./types";

const MOTS_CLICS = 4;

const facebook: Format = {
  responsable: "Jules",
  post: (m: Matiere) => [
    `${m.titre} ${EMOJIS}`, "",
    m.items.join("\n\n"), "",
    TRAIT, "",
    RAPPEL, "",
    HASHTAGS.slice(0, MOTS_CLICS).join(" "), "",
    [...COMPTES.organisations, ...COMPTES.equipe].join(" · "),
  ].join("\n"),
};

export default facebook;
