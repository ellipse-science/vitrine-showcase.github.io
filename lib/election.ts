// Repères du scrutin — volontairement SANS dépendance système (pas de
// node:fs), pour que le composant client puisse les importer sans entraîner
// tout le chargeur de données dans le paquet du navigateur.
//
// Date fixe par la Loi électorale du Québec : premier lundi d'octobre tous les
// 4 ans (précédent scrutin : 3 octobre 2022).

export const ELECTION_DATE = "2026-10-05";
export const ELECTION_LABEL = "5 octobre 2026";

/**
 * Date de DÉCLENCHEMENT des élections — le jour où le bref est émis.
 *
 * `null` tant que le scrutin n'est pas déclenché : au 2026-08-13 il ne l'est
 * pas, et la deviner reviendrait à afficher une date fausse sur un site public.
 * La renseigner le jour venu ; l'axe du portrait global partira alors de là,
 * et non du début du suivi.
 */
export const ELECTION_CALL_DATE: string | null = null;
