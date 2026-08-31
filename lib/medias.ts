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
  JDM: "Le Journal de Montréal",
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
 * Formule prépositionnelle pour la manchette, qui n'est pas le nom seul : on
 * lit DANS un journal, on regarde ou on écoute À une chaîne. Et l'article se
 * décapitalise en cours de phrase — « dans le Journal de Montréal », alors que
 * le titre du quotidien est « Le Journal de Montréal ».
 *
 * Repli pour un média absent d'ici : « dans » + son libellé.
 */
export const MEDIA_DANS: Record<string, string> = {
  RCI: "À Radio-Canada",
  LAP: "Dans La Presse",
  LED: "Dans Le Devoir",
  JDM: "Dans le Journal de Montréal",
  TVA: "À TVA Nouvelles",
  MG: "Dans la Montreal Gazette",
  CBC: "À CBC",
  CTV: "À CTV",
  GAM: "Dans The Globe and Mail",
  NP: "Dans le National Post",
  GN: "À Global News",
  CNN: "À CNN",
  FXN: "À Fox News",
};

/**
 * Ordre des crans du fader, « tous les médias » AU CENTRE — position de repos
 * d'un crossfader, celle qu'on retrouve sans regarder.
 *
 * Cet ordre est un CHOIX ÉDITORIAL de l'équipe. Il n'est ni alphabétique, ni
 * dérivé des données, et il ne porte aucune étiquette dans l'interface : ne pas
 * le « corriger » en croyant à un tri cassé.
 */
/**
 * Sigles affichés sur les crans du fader.
 *
 * Les crans portaient l'identifiant brut du corpus (`RCI`, `LAP`, `LED`,
 * `JDM`), qui est une clé technique et non un nom : `RCI` se lit « Radio Canada
 * International » pour qui connaît, et rien pour les autres. Ces sigles-ci sont
 * ceux qu'on emploie à l'oral dans la salle.
 *
 * Le nom complet reste porté par `aria-valuetext` sur le curseur et par
 * l'attribut `title` du cran : le sigle est un repère visuel court, jamais la
 * seule forme sous laquelle le média est nommé.
 */
export const MEDIA_SIGLES: Record<string, string> = {
  LED: "LD",   // Le Devoir
  RCI: "RC",   // Radio-Canada
  LAP: "LP",   // La Presse
  MG:  "MG",   // Montreal Gazette
  TVA: "TVA",  // TVA Nouvelles
  JDM: "JdM",  // Le Journal de Montréal
};

/** Forme GÉNITIVE, pour « en Une du Devoir », « en Une de La Presse ».
 *
 *  Elle ne se déduit pas du libellé : « de Le Devoir » et « de Le Journal de
 *  Montréal » sont fautifs, il faut « du Devoir » et « du Journal de Montréal ».
 *  Même raison d'être que `MEDIA_DANS`, avec une autre préposition. */
export const MEDIA_DE: Record<string, string> = {
  RCI: "de Radio-Canada",
  LAP: "de La Presse",
  LED: "du Devoir",
  JDM: "du Journal de Montréal",
  TVA: "de TVA Nouvelles",
  MG: "de la Montreal Gazette",
  CBC: "de CBC",
  CTV: "de CTV",
  GAM: "du Globe and Mail",
  NP: "du National Post",
  GN: "de Global News",
  CNN: "de CNN",
  FXN: "de Fox News",
};

export const MEDIA_ORDER: string[] = [
  "LED", "RCI", "LAP",
  TOUS_MEDIAS,
  "MG", "TVA", "JDM",
];

/**
 * Le PANEL québécois — les six seuls médias qu'un module sur les partis
 * PROVINCIAUX a le droit de proposer.
 *
 * Il est DÉRIVÉ de `MEDIA_ORDER`, et non recopié : les crans du fader et les
 * positions réellement chargées sont ainsi la même liste par construction. Une
 * septième entrée ajoutée à l'ordre ci-dessus arrivera donc aussi dans le
 * chargeur, sans qu'on ait à y penser.
 *
 * Pourquoi un filtre est nécessaire : la table `*_by_media_*` publie TOUT le
 * corpus, Canada et États-Unis compris (CBC, CNN, Fox News, The Globe and
 * Mail…), et elle ne porte aucune colonne de pays sur laquelle trancher. Sans
 * ce filtre, le fader offrait quinze positions au lieu de sept — « tous » n'y
 * était plus au centre, neuf crans s'affichaient sous leur identifiant technique
 * faute de sigle, et douze d'entre eux ne donnaient qu'une console entièrement
 * vide. Vide dont l'infobulle disait « aucun parti à ce rang SUR CETTE
 * PÉRIODE » : une affirmation sur la couverture, là où la vérité est que Fox
 * News ne couvre pas la politique québécoise. Le module a une règle sur ce
 * point — ne jamais imputer aux médias un silence qui est le nôtre.
 *
 * Filtrer le panel ne désaccorde PAS la position « tous les médias », qui lit la
 * table agrégée : mesuré le 2026-08-27, la somme des six égale exactement
 * l'agrégat (CAQ 103,1 · PQ 182,4 · QS 66,0 · PLQ 59,2 · PCQ 0,0) et les neuf
 * autres portent zéro sur toute la fenêtre publiée.
 */
export const MEDIA_PANEL_QC: string[] = MEDIA_ORDER.filter((id) => id !== TOUS_MEDIAS);
