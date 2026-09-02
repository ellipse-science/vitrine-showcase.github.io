// Les douze catégories d'enjeux du CAP — couleurs et libellés.
//
// Volontairement SANS dépendance système (pas de node:fs), pour que les
// composants clients puissent l'importer sans entraîner un chargeur de données
// dans le paquet du navigateur. Même raison d'être que lib/medias.ts.
//
// C'est la SOURCE DE VÉRITÉ des couleurs d'enjeu : `lib/data/headlineEvents.ts`
// (module « Les 12 enjeux de la campagne ») et le module des partis lisent toutes deux
// d'ici. Elles étaient déclarées dans headlineEvents.ts, hors de portée du
// navigateur ; les recopier ailleurs aurait garanti la dérive.

/** Couleur de chaque catégorie, par clé technique du pipeline. */
export const ISSUE_COLORS: Record<string, string> = {
  economy_and_labour: "#94781B",
  governments_and_governance: "#234E78",
  health_and_social_services: "#852244",
  environment_and_energy: "#3D6B3A",
  rights_liberties_minorities_discrimination: "#553278",
  culture_and_nationalism: "#384873",
  education: "#752373",
  international_affairs_and_defense: "#1F5E66",
  law_and_crime: "#993322",
  public_lands_and_agriculture: "#5E731F",
  immigration: "#9E541B",
  technology: "#997018",
};

/** Libellés canoniques, repris au caractère près du guide de rédaction. Ils
 *  sont partagés avec le Digital Society Lab et l'Institut Donald J. Savoie :
 *  les changer casserait la comparabilité entre projets. */
export const ISSUE_LABELS_SHORT: Record<string, string> = {
  economy_and_labour: "Économie et travail",
  governments_and_governance: "Gouvernements et gouvernance",
  health_and_social_services: "Santé et politiques sociales",
  environment_and_energy: "Environnement et énergie",
  rights_liberties_minorities_discrimination: "Droits, libertés, minorités et discrimination",
  culture_and_nationalism: "Culture et nationalisme",
  education: "Éducation",
  international_affairs_and_defense: "Affaires internationales et défense",
  law_and_crime: "Loi et crime",
  public_lands_and_agriculture: "Terres publiques et agriculture",
  immigration: "Immigration",
  technology: "Technologie",
};

/** L'index inverse : du libellé français vers la couleur.
 *
 *  Le module des partis agrège ses enjeux en LIBELLÉS (`THEME_VERS_CATEGORIE`),
 *  pas en clés techniques, parce qu'il les affiche tels quels. Cet index lui
 *  évite de refaire le chemin inverse. */
export const COULEUR_PAR_LIBELLE: Record<string, string> = Object.fromEntries(
  Object.entries(ISSUE_LABELS_SHORT).map(([cle, libelle]) => [libelle, ISSUE_COLORS[cle]]),
);

/** L'index inverse des CLÉS : du libellé français vers la clé technique.
 *
 *  DEUX CONSOMMATEURS. (1) Le CIRCUIT DES POCHETTES du module des partis : le
 *  raffineur choisit ses images de référence par préfixe de nom de fichier
 *  (`governments_and_governance_generic1.jpg`), et ces préfixes sont
 *  EXACTEMENT les clés ci-dessus — à savoir si les références évoluent : le
 *  dossier `references/` du raffineur connaît `health_and_social_services`,
 *  plus ancien que le libellé français « Santé et politiques sociales ».
 *  C'est la clé qui fait foi des deux côtés. (2) Le Polimètre+, qui ne connaît
 *  ses enjeux que par leur libellé complet (`CATEGORY_ORDER` de
 *  polimetre-meta.ts, les douze mêmes chaînes au caractère près), alors que le
 *  symbole d'enjeu est rangé par clé. Sans cet index, l'un des deux modules
 *  devrait recopier la correspondance et la laisser dériver. */
export const CLE_PAR_LIBELLE: Record<string, string> = Object.fromEntries(
  Object.entries(ISSUE_LABELS_SHORT).map(([cle, libelle]) => [libelle, cle]),
);

/** La CLÉ D'APPARIEMENT d'une pochette engendrée : parti, enjeu distinctif,
 *  sens du ton.
 *
 *  Le site n'affiche une pochette que si sa signature correspond à ce qu'il rend
 *  au même instant — l'équivalent, pour les partis, de la garde de storyline de
 *  la Une des Unes. Calculée ICI et nulle part ailleurs : elle est écrite par le
 *  contrat d'illustration (côté serveur) et vérifiée par le bac (côté client),
 *  et deux formules qui divergeraient d'un caractère feraient disparaître toutes
 *  les pochettes sans un mot.
 *
 *  ⚠️ LE TEMPS EN UNE N'Y ENTRE PAS. La chaîne est décalée d'un cycle par
 *  construction (le raffineur lit le build courant, le build suivant rapatrie),
 *  et les minutes montent à chaque bloc : les y mettre ne ferait jamais
 *  correspondre aucune pochette. L'image dit l'enjeu et le ton ; la durée est
 *  écrite à côté, en toutes lettres. */
export function signaturePochette(
  partiKey: string,
  enjeuLibelle: string | null | undefined,
  tonDirection: string,
): string {
  const cle = enjeuLibelle ? (CLE_PAR_LIBELLE[enjeuLibelle] ?? "sans-enjeu") : "sans-enjeu";
  return [partiKey, cle, tonDirection].join("|");
}

/** Couleur de repli, pour un enjeu inconnu ou pour « aucun enjeu identifié ».
 *  C'est celle qu'employait déjà headlineEvents.ts. */
export const COULEUR_ENJEU_DEFAUT = "#463E3E";

/** La couleur d'un enjeu désigné par son libellé français. */
export function couleurEnjeu(libelle: string | null | undefined): string {
  if (!libelle) return COULEUR_ENJEU_DEFAUT;
  return COULEUR_PAR_LIBELLE[libelle] ?? COULEUR_ENJEU_DEFAUT;
}
