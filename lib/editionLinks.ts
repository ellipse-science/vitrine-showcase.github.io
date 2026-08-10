import type { EditionRef } from "@/lib/data/headlineEvents";

// L'adresse d'une édition, en UN endroit (#434).
//
// Trois surfaces y mènent — le bandeau d'en-tête, les points de trajectoire et
// le pied de page d'archive. Recopier la règle dans chacune, c'était garantir
// qu'un jour l'une pointerait vers `/edition/<clé la plus récente>/` pendant que
// les autres pointeraient vers l'accueil : deux URL pour la même édition, dont
// une sans illustration ni musique.
//
// La règle : l'édition la plus récente EST l'accueil. C'est la seule qui porte
// l'illustration et la musique, et c'est l'adresse qu'on partage.

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function editionHref(key: string, isMostRecent: boolean): string {
  return isMostRecent ? `${basePath}/` : `${basePath}/edition/${key}/`;
}

/** Clé de bloc → adresse, pour toutes les éditions consultables. */
export function editionHrefs(editions: EditionRef[]): Record<string, string> {
  const recent = editions[0]?.key;
  const out: Record<string, string> = {};
  for (const e of editions) out[e.key] = editionHref(e.key, e.key === recent);
  return out;
}
