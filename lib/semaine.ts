// La semaine du module : SAMEDI → VENDREDI — module NEUTRE, sans dépendance
// système, pour la même raison que `lib/duree.ts` : plusieurs points du site en
// ont besoin (le palmarès dans `lib/data/parties.ts`, la discothèque dans
// `lib/data/pochettes.ts`), et il ne doit rien importer qui traîne
// `node:fs/promises` dans un paquet qui finirait par atteindre le navigateur.
//
// POURQUOI SAMEDI ET NON LUNDI. Le palmarès a d'abord ouvert sa semaine le
// lundi, avant qu'on lui demande explicitement de l'ouvrir le samedi pour que
// la fin de semaine tienne sur un axe dont l'arrivée reste le vendredi 20h
// (2026-08-31). La discothèque doit compter EXACTEMENT la même semaine : sept
// singles pour un album n'a de sens que si « la semaine » désigne la même
// chose partout sur le site.

/** Le samedi qui ouvre la semaine contenant `jourIso` (« 2026-08-22 »),
 *  lui-même compris : un samedi renvoie sa propre date. */
export function samediDeLaSemaine(jourIso: string): string {
  const t = Date.parse(`${jourIso}T00:00:00Z`);
  const jourSemaine = new Date(t).getUTCDay(); // 0 = dimanche … 6 = samedi
  const recul = (jourSemaine + 1) % 7; // 0 quand c'est déjà un samedi
  return new Date(t - recul * 86_400_000).toISOString().slice(0, 10);
}

/** Le vendredi qui ferme la semaine ouverte par `samediIso` — six jours plus
 *  tard, le jour de l'édition de 20h qui sert de ligne d'arrivée au palmarès. */
export function vendrediDeLaSemaine(samediIso: string): string {
  const t = Date.parse(`${samediIso}T00:00:00Z`);
  return new Date(t + 6 * 86_400_000).toISOString().slice(0, 10);
}
