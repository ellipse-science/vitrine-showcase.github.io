import type { PartyKey } from "@/lib/data/parties";

/**
 * Une manchette NOMME-T-ELLE le parti auquel on l'attribue ?
 *
 * Le raffineur publie, pour chaque parti, le titre de l'article qui pèse le plus
 * dans son temps en Une depuis minuit (`representative_title`, aws-refiners#487).
 * Ce titre dépend des têtes de partis d'INFER, et celles du PCQ et du PLQ
 * confondent encore le fédéral et le provincial, quand elles ne retiennent pas
 * du bruit : le 2026-09-11 au bloc de 12h, le titre « du PCQ » était « New York
 * commémore le 11-Septembre, sans Donald Trump ». Posé sur un deck et illustré
 * par une pochette, il ferait dire au site que c'est l'actualité du PCQ.
 *
 * LA GARDE (décision de Jules, 2026-09-11) : un titre n'est gardé que s'il nomme
 * le parti, par son nom, son sigle, ou sa cheffe ou son chef. Le coût est
 * assumé : un article juste dont le titre ne nomme personne est écarté aussi
 * (le même jour, « Des IA médicales doivent apprendre à envoyer des... fax! »
 * pour la CAQ). Pas de manchette vaut mieux qu'une manchette fausse.
 *
 * LES FORMES AMBIGUËS SONT EXCLUES EXPRÈS : « libéral » et « conservateur »
 * désignent aussi le PLC et le PCC, c'est précisément la confusion à écarter ;
 * « solidaire » est un mot courant ; « milliard » est un nombre, d'où la règle
 * à part pour Charles Milliard.
 *
 * Cheffes, chefs et porte-parole relevés dans les Unes québécoises du 27 août au
 * 11 septembre 2026 (Athena, `radar_annotated`, « chef du PQ, … » et variantes).
 * À TENIR À JOUR si un parti change de chef.
 */

/** Minuscules sans accents, pour comparer « Fréchette » et « Frechette ». */
function aplatir(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Formes comparées sans casse ni accents : noms de partis, gentilés sans
 *  ambiguïté et noms de cheffes, chefs et porte-parole. */
const FORMES: Record<PartyKey, string[]> = {
  caq: ["coalition avenir quebec", "caquiste", "christine frechette", "frechette"],
  plq: ["parti liberal du quebec", "charles milliard"],
  pq: ["parti quebecois", "pequiste", "paul st-pierre plamondon", "st-pierre plamondon"],
  qs: ["quebec solidaire", "ruba ghazal", "ghazal"],
  pcq: ["parti conservateur du quebec", "eric duhaime", "duhaime"],
};

/** Les sigles, CASSE RESPECTÉE : « QS » est un sigle, « qs » n'en est pas un.
 *  « PSPP » (Paul St-Pierre Plamondon) compte pour le PQ : 22 titres québécois
 *  l'emploient seul du 27 août au 11 septembre 2026. */
const SIGLES: Record<PartyKey, RegExp> = {
  caq: /\bCAQ\b/,
  plq: /\bPLQ\b/,
  pq: /\bPQ\b|\bPSPP\b/,
  qs: /\bQS\b/,
  pcq: /\bPCQ\b/,
};

/** « M. Milliard », ou « Milliard » capitalisé qui n'est pas un montant
 *  (« 2 milliards », « Milliard de dollars »). */
const MILLIARD = /(?<![\d.,]\s?)\bMilliard\b(?!\s+(?:de|d['’]))/;

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Vrai si `titre` nomme le parti `parti`. */
export function titreNommeLeParti(parti: PartyKey, titre: string): boolean {
  if (SIGLES[parti].test(titre)) return true;
  if (parti === "plq" && MILLIARD.test(titre)) return true;
  const plat = aplatir(titre);
  return FORMES[parti].some((forme) =>
    // Bornes de LETTRES et non `\b` : `\b` ignore les lettres accentuées, et
    // une forme doit valoir un mot entier (« duhaime », jamais « duhaimeries »).
    new RegExp(`(^|[^\\p{L}])${echapper(forme)}s?(?=$|[^\\p{L}])`, "u").test(plat),
  );
}

/** Le titre à garder pour ce parti, espaces repliés, ou `null` s'il manque ou
 *  ne nomme pas le parti. */
export function manchetteRetenue(parti: PartyKey, titre: string | null | undefined): string | null {
  const propre = (titre ?? "").split(/\s+/).filter(Boolean).join(" ");
  if (!propre) return null;
  return titreNommeLeParti(parti, propre) ? propre : null;
}
