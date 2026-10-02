// TIKTOK — publié par Jules.
//
// Ce fichier n'est lu que pour TikTok. Le modifier ne peut pas changer un post
// LinkedIn, X, Facebook ou Instagram. Ce qui est commun aux cinq réseaux est
// dans `lib/identite.ts` ; on n'y touche qu'à deux.
//
// Ce que TikTok impose :
//   · AUCUN lien cliquable dans une légende, comme Instagram.
//   · La légende se lit PAR-DESSUS la vidéo, sur deux ou trois lignes : on ne
//     donne que les trois premières nouvelles, sans la mesure. Y recopier les
//     cinq items ferait un mur de texte sur l'image.
//   · Pas de rappel long ni de comptes identifiés : ils ne sont pas lus ici.

import { EMOJIS, HASHTAGS } from "../lib/identite";
import type { Format, Matiere } from "./types";

/** Combien de nouvelles tiennent au-dessus de la vidéo. */
const NOUVELLES = 3;

const RENVOI = "Mesuré toutes les 4 heures par la Vitrine démocratique. Lien dans la bio.";

const tiktok: Format = {
  responsable: "Jules",
  post: (m: Matiere) => [
    `${m.titre} ${EMOJIS}`, "",
    ...m.titresSeuls.slice(0, NOUVELLES).map((t, i) => `${i + 1}. ${t}`), "",
    RENVOI, "",
    HASHTAGS.join(" "),
  ].join("\n"),
};

export default tiktok;
