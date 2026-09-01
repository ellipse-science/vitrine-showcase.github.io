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
 * Renseignée le 2026-08-30, sur la foi des manchettes du corpus plutôt que de
 * mémoire : le 27 août, quatre Unes distinctes annoncent le déclenchement au
 * présent (« Fréchette déclenche les élections québécoises pour le 5 octobre »,
 * « Déclenchement officiel des élections québécoises ce matin », « Début
 * officiel de la campagne électorale québécoise »). La veille, une Une l'annonce
 * au futur en nommant le jour : « Les élections au Québec seront déclenchées
 * jeudi » — et le 27 août 2026 est un jeudi. Les deux se recoupent.
 *
 * Ce qu'elle commande : la fenêtre « Campagne » des modules part de là, et non
 * du début du suivi.
 */
export const ELECTION_CALL_DATE: string | null = "2026-08-27";
