// LE TEXTE QUI ACCOMPAGNE UN REEL — commun à tous les modules.
//
// Un reel ne se publie jamais seul : il part avec un post et, pour la Une des
// Unes, un premier commentaire. Le gabarit du post est le même partout (demande
// d'Adrien, 2026-09-16 : « un template qu'on peut reprendre chaque jour et
// automatiser facilement »), et TOUT CE QUI SE MODIFIE À LA MAIN est ici :
// émojis, phrase de rappel, mots-clics, comptes à identifier. Le reste vient
// des données.

/** Émojis du titre. Une ligne à changer. */
export const EMOJIS = "📰 ⚜️";

/** Mots-clics du post. */
export const HASHTAGS = ["#LaUnedesUnes", "#CAPP", "#CLESSN", "#Élections2026", "#ScienceDesDonnées", "#polqc"];

/** Le rappel, sous le trait. Tout y est vérifiable sur le site public. */
export const RAPPEL = [
  "Toutes les 4 heures, la Vitrine démocratique mesure ce qui occupe l’espace médiatique québécois.",
  "La première page de 13 médias québécois et canadiens est enregistrée toutes les dix minutes, sans interruption depuis septembre 2018. Gratuit, sans publicité, méthodologie publique.",
  "vitrinedemocratique.com",
].join("\n\n");

/** COMPTES À IDENTIFIER — à compléter et à tenir à jour par l'équipe comm.
 *  ⚠️ Ce sont des NOMS, pas des identifiants : sur LinkedIn et Facebook on les
 *  choisit dans l'autocomplétion ; sur X et Bluesky il faut l'identifiant exact
 *  du compte, que personne n'a encore recensé — ne pas en inventer. */
export const COMPTES = {
  organisations: [
    "CLESSN", "Groupe de recherche en communication politique (GRCP)", "Infoscope inc.",
    "Université Laval", "Université de Montréal", "Cégep Garneau",
    "Centre pour l’étude de la citoyenneté démocratique (CECD-CSDC)",
    "Chaire sur la démocratie, le vivre-ensemble et les valeurs communes au Québec",
    "Unicorne", "LLM Tool", "Amazon Web Services", "Datagotchi_fr", "Datagotchi_en",
  ],
  equipe: [
    "Yannick Dufresne", "Shannon Dinan", "Adrien Cloutier", "Jérémie Drouin",
    "Alexandre Fortier-Chouinard", "Antoine Lemor", "Jules Piral", "Patrick Poncet",
    "Catherine Ouellet", "Benjamin Guinaudeau", "Thomas Lefebvre", "Marc-Antoine Rancourt",
    "Lisa Birch", "Mathieu Fortin (Anorak Studio)",
  ],
};

export const TRAIT = "————————————————";

/** Le pied de tous les posts : le trait, le rappel, les mots-clics, les comptes. */
export function piedDePost(): string[] {
  return ["", TRAIT, "", RAPPEL, "", HASHTAGS.join(" "), "", [...COMPTES.organisations, ...COMPTES.equipe].join(" · ")];
}

/** Mêmes règles OQLF que les vidéos, en texte brut (U+00A0 avant « : » et « % »). */
export const oqlf = (s: string) => s.replace(/[ \t]*:(?=\s|$)/gm, " :").replace(/[ \t]*%/g, " %") + "\n";
