import type { AssembleeRow, DeputyRow, LegislatureEnAttente } from "./assemblee";

/** Les casiers de la nouvelle Assemblée, avant sa première séance (Jules,
 *  25 nov. : « les casiers comme la 43e »). Mêmes cinq casiers, rangés du plus
 *  grand au plus petit, avec les élus pour seules cartes. Aucune mesure de
 *  débat n'est remplie : un « 0 mot » se lirait comme une mesure. */
export function rangeesEnAttente(vue: LegislatureEnAttente): AssembleeRow[] {
  return vue.rows.map((r) => ({
    key: r.key,
    label: r.label,
    color: r.color,
    inShadow: r.deputes.length === 0,
    aSiege: r.deputes.length > 0,
    deputies: r.deputes.map((d): DeputyRow => ({
      id: d.id,
      name: d.name,
      circonscription: d.circonscription,
      portrait: d.portrait,
      wordsFormatted: "",
      wordsRaw: 0,
      richnessLevel: 0,
      toneLeftPct: 50,
      interventions: 0,
      toneScore: 0,
      enjeuStack: [],
    })),
  }));
}
