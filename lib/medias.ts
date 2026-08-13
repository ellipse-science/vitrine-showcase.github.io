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

/** Libellés lisibles du panel. Clés = `media_id` réels de radar_annotated,
 *  vérifiés sur le corpus le 2026-08-13 ; un identifiant absent d'ici s'affiche
 *  tel quel plutôt que de disparaître. */
export const MEDIA_LABELS: Record<string, string> = {
  // Québec (country_id = QC) — les seuls pertinents pour des partis PROVINCIAUX
  RCI: "Radio-Canada",
  LAP: "La Presse",
  LED: "Le Devoir",
  JDM: "Journal de Montréal",
  TVA: "TVA Nouvelles",
  MG: "Montreal Gazette",
  // Canada et États-Unis — présents au corpus, hors sujet ici
  CBC: "CBC",
  CTV: "CTV",
  GAM: "The Globe and Mail",
  NP: "National Post",
  GN: "Global News",
  CNN: "CNN",
  FXN: "Fox News",
};

/**
 * Ordre des crans du fader, « tous les médias » AU CENTRE — c'est la position
 * de repos d'un crossfader, et celle qui doit se retrouver sans réfléchir.
 *
 * ⚠️ L'ordre gauche-droite des médias autour du centre n'est PAS neutre : un
 * lecteur y lira un axe. Tant que cet axe n'est pas documenté et assumé
 * publiquement, il ne porte aucune étiquette dans l'interface.
 */
export const MEDIA_ORDER: string[] = [
  "RCI", "LAP", "LED",
  TOUS_MEDIAS,
  "JDM", "TVA", "MG",
];
