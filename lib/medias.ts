// Repères du panel de médias — volontairement SANS dépendance système (pas de
// node:fs), pour que le composant client puisse les importer sans entraîner
// tout le chargeur de données dans le paquet du navigateur.
//
// (Même raison que lib/election.ts. Les TYPES peuvent venir de lib/data/
// parties.ts, eux : ils s'effacent à la compilation. Les VALEURS, non.)

/** Position « tous les médias » du fader — la table AGRÉGÉE, jamais la moyenne
 *  des positions par média : l'agrégat pondère chaque média par ses
 *  minutes-en-Une. */
export const TOUS_MEDIAS = "__tous__";

/** Libellés lisibles du panel. Clés = `media_id` de radar_annotated ; un
 *  identifiant absent d'ici s'affiche tel quel plutôt que de disparaître. */
export const MEDIA_LABELS: Record<string, string> = {
  RC: "Radio-Canada",
  LAP: "La Presse",
  JDM: "Journal de Montréal",
  LED: "Le Devoir",
  TVA: "TVA Nouvelles",
  GAM: "The Globe and Mail",
  CBC: "CBC",
  CTV: "CTV",
  GN: "Global News",
  JDQ: "Journal de Québec",
  MTG: "Montreal Gazette",
};
