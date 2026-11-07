// CONSTANTES DES PARTIS — clés, noms officiels, sigles et couleurs. Dans un
// module SANS dépendance Node : lib/data/parties.ts lit des fichiers, ce qui
// l'interdit aux composants client ; les cartes de député (lib/cartes), elles,
// tournent dans le navigateur. parties.ts ré-exporte tout ceci, rien ne change
// pour qui l'importait.

export const PARTY_KEYS = ["plq", "caq", "qs", "pq", "pcq"] as const;
export type PartyKey = (typeof PARTY_KEYS)[number];

/** Noms officiels, casse comprise, tels que le guide de rédaction les fixe.
 *
 *  Les sigles suffisent dans la console, où la place manque et où le contexte
 *  lève l'ambiguïté. Une phrase destinée à être CITÉE, elle, porte le nom
 *  complet : c'est ce qu'un journaliste recopiera dans son article, et
 *  « Coalition avenir Québec » ne s'invente pas (minuscule à « avenir », pas de
 *  trait d'union). */
export const PARTY_FULL_NAMES: Record<PartyKey, string> = {
  plq: "Parti libéral du Québec",
  caq: "Coalition avenir Québec",
  qs: "Québec solidaire",
  pq: "Parti québécois",
  pcq: "Parti conservateur du Québec",
};

export const PARTY_LABELS: Record<PartyKey, string> = {
  plq: "PLQ",
  caq: "CAQ",
  qs: "QS",
  pq: "PQ",
  pcq: "PCQ",
};

/**
 * Couleurs des partis — les MÊMES que celles du module « L'alignement de
 * l'Assemblée », déclarées en CSS dans `app/globals.css` sous
 * `.parti-name-box.{plq,caq,qs,pq,pcq}`. Les deux modules doivent rester
 * accordés : un lecteur qui descend de l'un à l'autre suit les mêmes couleurs.
 *
 * ⚠️ DUPLICATION ASSUMÉE, mais fragile : ces valeurs existent à deux endroits,
 * ici et dans globals.css. Modifier l'une sans l'autre désaccorde les deux
 * modules en silence. La sortie propre serait des jetons `--party-*` dans
 * `:root`, lus des deux côtés — non fait, parce que les couleurs partent aussi
 * dans des attributs SVG (`stroke`), où `var()` ne se résout pas.
 *
 * Ces teintes ont été retenues plutôt que la norme graphique du CAPP
 * (Elxn_qc22), dont deux couleurs n'atteignent pas le contraste de 3:1 attendu
 * d'un trait fin sur le papier ivoire du site : CAQ #00B0F0 à 2,11 et
 * QS #ED8528 à 2,24. Celles-ci passent toutes (3,94 au plus bas, pour QS).
 *
 * Limite connue : la CAQ et le PQ sont deux bleus proches (écart de luminance
 * 1,60). Sans conséquence tant que chaque parti avait sa rangée ; sur une
 * course où les lignes se croisent, ça se voit.
 */
export const PARTY_COLORS: Record<PartyKey, string> = {
  plq: "#A03440",
  caq: "#2B5C7C",
  qs: "#B85A2C",
  pq: "#1E3A5F",
  pcq: "#5A3B6E",
};
