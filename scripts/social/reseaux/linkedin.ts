// LINKEDIN — publié par Adrien.
//
// Ce fichier n'est lu que pour LinkedIn. Le modifier ne peut pas changer un
// post Instagram, X, Facebook ou TikTok : c'est tout l'objet du découpage.
// Ce qui est commun aux cinq réseaux est dans `lib/identite.ts` ; on n'y touche
// qu'à deux.
//
// Ce que LinkedIn impose :
//   · Seules les DEUX PREMIÈRES LIGNES s'affichent avant « voir plus ». Le
//     chiffre passe donc devant, jamais le nom du projet.
//   · TROIS mots-clics au plus : au-delà, LinkedIn lit le post comme du spam.
//   · Les liens sont cliquables — on écrit l'adresse en toutes lettres.

import { COMPTES, EMOJIS, HASHTAGS, RAPPEL, TRAIT } from "../lib/identite";
import type { Format, Matiere } from "./types";

/** Combien de mots-clics LinkedIn supporte. Réglage propre à ce réseau. */
const MOTS_CLICS = 3;

const linkedin: Format = {
  responsable: "Adrien",
  post: (m: Matiere) => [
    `${m.titre} ${EMOJIS}`, "",
    m.items.join("\n\n"), "",
    TRAIT, "",
    RAPPEL, "",
    HASHTAGS.slice(0, MOTS_CLICS).join(" "), "",
    [...COMPTES.organisations, ...COMPTES.equipe].join(" · "),
  ].join("\n"),
};

export default linkedin;
