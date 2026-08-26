// Écriture des durées — module NEUTRE, sans dépendance système.
//
// Il vit à part parce que le chargeur (`lib/data/parties.ts`) et le composant
// client en ont tous deux besoin, et qu'importer une VALEUR depuis le chargeur
// entraîne `node:fs/promises` dans le paquet du navigateur : Turbopack échoue
// alors sur « the chunking context does not support external modules ». Les
// TYPES, eux, s'effacent à la compilation et peuvent voyager.
//
// Même raison d'être que `lib/medias.ts` et `lib/enjeux.ts`.

/**
 * Une durée en minutes, écrite à l'horloge : `4h12`, `4h`, `45 min`.
 *
 * Sans espace autour du `h`. Le guide de rédaction est explicite et l'assume
 * comme un écart à l'OQLF : « L'OQLF dit d'en mettre, mais on ne le fait pas. »
 */
export function formatDuree(minutes: number): string {
  const min = Math.round(minutes);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `${h}h${r > 0 ? String(r).padStart(2, "0") : ""}`;
}
