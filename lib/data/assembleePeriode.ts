import type { AssembleeData, PeriodKey } from "./assemblee";

/** L'onglet d'ouverture : la législature, sauf si sa vue est vide. C'est le cas
 *  quand Agora fait encore commencer la ligne « législature » de la 44e à
 *  l'ouverture de la 43e : loadAssemblee l'écarte, puisqu'elle mêle les deux
 *  (bornage : aws-refiners#654). On ouvre alors la première période qui a parlé. */
export function periodeParDefaut(data: AssembleeData): PeriodKey {
  const ordre: PeriodKey[] = ["legislature", "session", "last_pdq"];
  return ordre.find((p) => data.periods[p].rows.some((r) => r.interventions)) ?? "legislature";
}
