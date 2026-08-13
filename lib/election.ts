// Repères du scrutin — volontairement SANS dépendance système (pas de
// node:fs), pour que le composant client puisse les importer sans entraîner
// tout le chargeur de données dans le paquet du navigateur.
//
// Date fixe par la Loi électorale du Québec : premier lundi d'octobre tous les
// 4 ans (précédent scrutin : 3 octobre 2022).

export const ELECTION_DATE = "2026-10-05";
export const ELECTION_LABEL = "5 octobre 2026";

/** Jours entre `fromIso` et le scrutin. Négatif une fois le scrutin passé. */
export function daysUntilElection(fromIso: string): number {
  return Math.round(
    (Date.parse(`${ELECTION_DATE}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000,
  );
}
