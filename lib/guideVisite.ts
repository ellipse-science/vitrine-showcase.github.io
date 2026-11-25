// La visite guidée que propose la mascotte Datagotchi (GuideDatagotchi.tsx) :
// l'essentiel du site en une douzaine d'étapes courtes, d'abord la frise des
// éditions et l'indice de saillance, puis un module par étape. Chaque étape
// éclaire un élément de la page ; une étape dont la cible est absente ou
// invisible à cette largeur d'écran (module retiré de la prod) est sautée.
// Source des explications : la page Méthodologie. Textes à relire par Adrien.

export type Etape = {
  // Sélecteur CSS de l'élément à mettre en lumière (le premier trouvé) ;
  // null = pas de projecteur, la mascotte reste dans son coin.
  cible: string | null;
  titre: string;
  texte: string;
  // Ancre de la page Méthodologie, pour qui veut le détail.
  metho?: string;
};

const NB = "\u00a0"; // espace insécable (OQLF : avant « : », dans « »)
const g = (s: string) => `«${NB}${s}${NB}»`;

export const OFFRE = {
  texte: `Salut! Il y a beaucoup à voir ici. Veux-tu que je t’explique le site?`,
  oui: "Oui, allons-y",
  non: "Non merci",
};

export const ETAPES: Etape[] = [
  {
    cible: null,
    titre: "La Vitrine démocratique",
    texte: `Ce site mesure de quoi parlent les médias, les partis et l’Assemblée nationale du Québec. Je te montre l’essentiel en quelques étapes.`,
  },
  {
    cible: ".edition-nav-row",
    titre: "Six éditions par jour",
    texte: `Le site se met à jour toutes les quatre heures, six fois par jour. Chaque icône, de la lune au soleil, est une édition; tu peux revoir les précédentes.`,
    metho: "fenetres-temporelles",
  },
  {
    cible: "#une-des-unes .saillance-tag",
    titre: "La saillance",
    texte: `Notre mesure maison, développée par notre scientifique en chef, Adrien Cloutier. Elle dit quelle place une histoire occupe à la Une${NB}: combien de médias en parlent, avec combien d’articles, et pendant combien de temps.`,
    metho: "indice-saillance",
  },
  {
    cible: "#une-des-unes .saillance-tag-row",
    titre: "Comment la lire",
    texte: `L’étiquette situe l’histoire parmi toutes les Unes d’une année, de ${g("Très faible")} à ${g("Exceptionnelle")}. Les points, sur 100, et la petite courbe suivent son évolution sur 24 heures.`,
    metho: "indice-saillance",
  },
  {
    cible: "#une-des-unes",
    titre: "L’actualité saillante",
    texte: `Les histoires qui ont le plus occupé la Une des médias québécois depuis 24 heures. Plus une histoire est saillante, plus elle prend de place.`,
    metho: "une-des-unes",
  },
  {
    cible: "#deux-solitudes",
    titre: "Deux solitudes?",
    texte: `Les médias du Québec et du reste du Canada couvrent-ils les mêmes histoires? Le radar compare les deux, et le grand chiffre dit s’ils convergent plus ou moins que d’habitude.`,
    metho: "une-des-unes",
  },
  {
    cible: "#enjeux-saillants",
    titre: "Les 12 enjeux",
    texte: `La couverture des médias québécois, répartie en douze grands enjeux de société. Plus un enjeu occupe d’espace, plus on en parle.`,
    metho: "enjeux-saillants",
  },
  {
    cible: "#partis-et-couverture",
    titre: "Les partis dans les médias",
    texte: `Quand les médias parlent d’un parti provincial, duquel s’agit-il? Chaque colonne donne la part de voix d’un parti.`,
    metho: "partis-et-couverture",
  },
  {
    cible: "#candidats-reseaux",
    titre: "La guerre des clics",
    texte: `L’activité des élus et des partis sur Facebook, Instagram et TikTok. Ce module est expérimental.`,
    metho: "reseaux-sociaux",
  },
  {
    cible: "#assemblee-nationale",
    titre: "L’Assemblée nationale",
    texte: `Qui prend la parole à l’Assemblée, sur quels enjeux et sur quel ton. Chaque député a sa carte de collection.`,
    metho: "assemblee-nationale",
  },
  {
    cible: "#polimetre-plus",
    titre: "Polimètre+",
    texte: `Les promesses électorales, classées selon leur écho à la Une.`,
    metho: "polimetre-plus",
  },
  {
    cible: null,
    titre: "C’est tout!",
    texte: `Le détail de chaque calcul est sur la page Méthodologie. Ce guide vient de Datagotchi, un autre projet de la CLESSN.`,
  },
];

export const CLE_STOCKAGE = "vitrine-guide-visite";

export function etapesPresentes(existe: (selecteur: string) => boolean): Etape[] {
  return ETAPES.filter((e) => e.cible === null || existe(e.cible));
}
