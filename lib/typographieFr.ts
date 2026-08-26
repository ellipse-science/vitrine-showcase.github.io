// Typographie française des textes VENUS DU PIPELINE.
//
// POURQUOI CE FICHIER EXISTE. La garde de rédaction
// (`scripts/garde_redaction.mjs`) impose la norme québécoise sur tout ce que
// NOUS écrivons — mais elle ne scanne que `.ts`, `.tsx` et `.html`. Les titres
// et les textes de la Une des Unes sont écrits par notre LLM et arrivent en
// JSON : ils n'ont jamais été sous la garde, et rien ne les normalisait au
// rendu. Mesuré le 2026-08-25 sur 1 274 chaînes publiées : 279 infractions,
// zéro insécable dans tout le fichier.
//
// Ce n'est pas de la coquetterie. Sans insécable, le navigateur coupe la ligne
// APRÈS un « ouvrant : la Une du 25 août affichait « Trump menace de renommer
// le lac Ontario en « » en fin de ligne, guillemet seul, « lac Amérique » »
// à la ligne suivante.
//
// ⚠️ N'appliquer qu'aux champs que NOUS produisons (`title`, `text`). Les
// titres d'articles des médias sont des CITATIONS : leur typographie est celle
// de leur auteur, on n'y touche pas.

// Toutes les espaces que la garde considère comme des espaces (`ESPACES`).
const ESPACES = "\\u0020\\u00a0\\u202f\\u2009";
const NB = " ";

/** Applique la norme québécoise à un texte produit par le pipeline.
 *
 *  Idempotent : l'appliquer deux fois donne le même résultat, donc il peut
 *  tourner à chaque chargement sans dériver. Ne modifie JAMAIS le contenu
 *  visible — seulement la nature des espaces (vérifié sur les 1 274 chaînes
 *  publiées : 0 chaîne dont le texte diffère une fois les espaces normalisées).
 */
export function normaliserTypographie(texte: string): string;
export function normaliserTypographie(texte: null | undefined): null;
export function normaliserTypographie(
  texte: string | null | undefined,
): string | null;
export function normaliserTypographie(
  texte: string | null | undefined,
): string | null {
  if (texte === null || texte === undefined) return null;
  if (texte === "") return "";

  return (
    texte
      // 1. Guillemets français : coller « au mot suivant et » au précédent.
      //    C'est CETTE règle qui empêche le guillemet orphelin en bout de ligne.
      .replace(new RegExp(`«[${ESPACES}]+(?=\\S)`, "gu"), `«${NB}`)
      .replace(new RegExp(`(?<=\\S)[${ESPACES}]+»`, "gu"), `${NB}»`)
      // 2. Insécable avant « : ». VOLONTAIREMENT PLUS LARGE QUE LA GARDE :
      //    celle-ci exige une LETTRE avant l'espace (`\p{L}[ ]:`) pour ne pas
      //    se déclencher sur du code (`key: value`, annotations de type). Ici
      //    on ne lit que de la prose du pipeline, il n'y a pas de code à
      //    protéger — et la restriction laissait passer toutes les
      //    abréviations : « Incendies en C.-B. : des évacués » (le caractère
      //    avant l'espace est un point) échappait à la règle.
      //    `10:30` reste intact : il n'a pas d'espace avant le signe.
      .replace(
        new RegExp(`(\\S) :(?=[${ESPACES}]|$)`, "gu"),
        `$1${NB}:`,
      )
      // 3. Insécable avant « % », après un chiffre.
      .replace(/(\d) %/gu, `$1${NB}%`)
      // 4. AUCUNE espace avant « ; ? ! » — pas même une insécable. C'est la
      //    norme québécoise, à l'inverse de la française.
      .replace(new RegExp(`[${ESPACES}]+([;?!])`, "gu"), "$1")
      // 5. Heures collées : « 11 h » → « 11h », « 14 h 30 » → « 14h30 ».
      //    Écart à l'OQLF assumé par le guide Notion.
      .replace(
        new RegExp(`(\\d)[${ESPACES}]+h\\b(?:[${ESPACES}]+(\\d{2})\\b)?`, "gu"),
        (_m, heure: string, minutes?: string) => `${heure}h${minutes ?? ""}`,
      )
  );
  // Le tiret cadratin est VOLONTAIREMENT laissé tel quel : le remplacer par un
  // deux-points ou une parenthèse changerait la phrase du modèle, pas son
  // espacement. C'est une correction de fond, elle appartient au prompt.
}
