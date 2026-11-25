// La semaine du module Partis commence le samedi et se termine le vendredi.

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
