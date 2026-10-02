// L'IDENTITÉ COMMUNE AUX CINQ RÉSEAUX — figée.
//
// Ce fichier est la source unique de ce qui doit être IDENTIQUE sur LinkedIn,
// X, Facebook, Instagram et TikTok : les émojis du titre, le rappel sous le
// trait, le vocabulaire de mots-clics, les comptes à identifier, la typographie
// OQLF. Le pendant visuel est `GABARIT.md` §0 (palette, accroche, fin, logos),
// lu par `lib/reel.ts` et `lib/modules.ts`.
//
// ⚠️ RÈGLE D'ÉTANCHÉITÉ. Rien de propre à UN réseau n'entre ici. Le nombre de
// mots-clics, la limite de caractères, « lien dans la bio » : tout cela vit
// dans `reseaux/<réseau>.ts`, et nulle part ailleurs. Modifier ce fichier-ci
// change les cinq réseaux d'un coup — c'est fait exprès, et ça se décide à
// deux (Jules et Adrien), pas en passant.
//
// Ce qui change d'une publication à l'autre — les chiffres, les titres, les
// liens — ne s'écrit pas ici non plus : ça vient des données.

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
