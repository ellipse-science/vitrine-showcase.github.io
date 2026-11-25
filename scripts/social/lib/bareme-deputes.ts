// Les dix commissions permanentes sectorielles. La Commission de l'Assemblée
// nationale est présidée par la présidente de l'Assemblée, déjà rémunérée à ce
// titre ; les sous-commissions et les commissions de l'APF ne donnent rien.
const PERMANENTES = [
  "de l’administration publique",
  "de l’agriculture, des pêcheries, de l’énergie et des ressources naturelles",
  "de l’aménagement du territoire",
  "de la culture et de l’éducation",
  "de l’économie et du travail",
  "des finances publiques",
  "des institutions",
  "des relations avec les citoyens",
  "de la santé et des services sociaux",
  "des transports et de l’environnement",
].join("|");

/** [intitulé sur la fiche, fonction du barème, % de l'indemnité de base,
 *  indemnité additionnelle]. Premier motif qui correspond l'emporte. */
export const BAREME: [RegExp, string, number, number][] = [
  [/^Premi(?:ère|er) ministre$/, "Première ou premier ministre", 105, 153_694],
  // Ministres délégués compris : l'Assemblée ne les distingue pas dans son barème.
  [/^Ministre\b/, "Ministre", 75, 109_781],
  [/^Leader parlementaire du gouvernement$/, "Ministre", 75, 109_781],
  [/^Président(?:e)? de l’Assemblée nationale$/, "Présidente ou président de l’Assemblée nationale", 75, 109_781],
  [/^(?:Première|Deuxième|Troisième) vice-président(?:e)? de l’Assemblée nationale$/, "Vice-présidente ou vice-président de l’Assemblée nationale", 35, 51_231],
  [/^Chef(?:fe)? de l’opposition officielle$/, "Cheffe ou chef de l’opposition officielle", 75, 109_781],
  [/^Chef(?:fe)? du deuxième groupe d’opposition$/, "Cheffe ou chef du deuxième groupe d’opposition", 35, 51_231],
  [/^Chef(?:fe)? du troisième groupe d’opposition$/, "Cheffe ou chef du troisième groupe d’opposition", 35, 51_231],
  [/^Leader parlementaire de l’opposition officielle$/, "Leader parlementaire de l’opposition officielle", 35, 51_231],
  [/^Leader parlementaire du deuxième groupe d’opposition$/, "Leader parlementaire du deuxième groupe d’opposition", 25, 36_594],
  [/^Whip en chef du gouvernement$/, "Whip en chef du gouvernement", 35, 51_231],
  [/^Whip en chef de l’opposition officielle$/, "Whip en chef de l’opposition officielle", 30, 43_913],
  [/^Whip du deuxième groupe d’opposition$/, "Whip du deuxième groupe d’opposition", 20, 29_275],
  [/^Leader parlementaire adjoint(?:e)? du gouvernement$/, "Leader parlementaire adjoint du gouvernement", 25, 36_594],
  [/^Leader parlementaire adjoint(?:e)? de l’opposition officielle$/, "Leader parlementaire adjoint de l’opposition officielle", 20, 29_275],
  [/^Whip adjoint(?:e)? du gouvernement$/, "Whip adjoint du gouvernement", 20, 29_275],
  [/^Président(?:e)? du caucus du gouvernement$/, "Présidente ou président de caucus du gouvernement", 25, 36_594],
  [/^Président(?:e)? du caucus de l’opposition officielle$/, "Présidente ou président de caucus de l'opposition officielle", 22.5, 32_934],
  [/^Adjoint(?:e)? parlementaire\b/, "Adjointe ou adjoint parlementaire", 20, 29_275],
  [new RegExp(`^Président(?:e)? de la Commission (?:${PERMANENTES})$`), "Présidente ou président d’une commission permanente", 25, 36_594],
  [new RegExp(`^Vice-président(?:e)? de la Commission (?:${PERMANENTES})$`), "Vice-présidente ou vice-président d’une commission permanente", 20, 29_275],
  [/^Président(?:e)? de séance$/, "Présidente ou président de séance d’une commission permanente", 15, 21_956],
  // Pas les membres suppléants.
  [/^Membre du Bureau de l’Assemblée nationale$/, "Membre du Bureau de l’Assemblée nationale", 15, 21_956],
];
