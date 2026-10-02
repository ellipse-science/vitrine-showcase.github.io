// RÈGLES DE CONTENU des cartes de député : fonctions, intitulés, dates,
// appariements, rareté. Rien ici ne touche au DOM ni au système de fichiers :
// ce module s'exécute aussi bien au build du site que dans le navigateur.
// Origine : scripts/social/cartes-deputes.ts (extraction du 2 oct. 2026).
import type { DeputyRow } from "@/lib/data/assemblee";
import { PARTY_FULL_NAMES, type PartyKey } from "@/lib/data/partis-constantes";
import type { Carte, Carriere, Genre, Mandat, Mandats, Rarete, Titre } from "./types";

/** Encre des élus sans parti : un gris d'ardoise, lisible sous le papier et
 *  distinct de toutes les encres de parti. */
export const COULEUR_INDEPENDANT = "#4A4F57";

/** Mention d'édition de la série imprimée. À changer à la prochaine législature. */
export const EDITION_LEGISLATURE = "43e législature · 2022-2026";

export const MONTANT = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 });
export const POURCENT = new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const PROPORTIONS_RARETE: [Rarete, number][] = [["rare", 0.10], ["peu-commune", 0.35]];
export const LIBELLE_RARETE: Record<Rarete, string> = {
  commune: "Commune", "peu-commune": "Peu commune", rare: "Rare", legendaire: "Légendaire",
};

/** CODE DE FONCTION, dans le carré à droite du nom (22-09) : la fonction la
 *  mieux payée exercée pendant la législature, en sigle. Premier motif qui
 *  correspond l'emporte, dans l'ordre du barème. */
export const CODES_FONCTION: [RegExp, string][] = [
  [/^Premi(?:ère|er) ministre$/, "PM"],
  [/^Président(?:e)? de l’Assemblée nationale$/, "PAN"],
  [/^Chef(?:fe)? d/, "CO"],
  [/^Ministre\b|^Leader parlementaire du gouvernement$/, "M"],
  [/vice-président(?:e)? de l’Assemblée nationale$/, "VP"],
  [/^Leader parlementaire/, "LP"],
  [/^Whip/, "W"],
  [/^Président(?:e)? du caucus/, "PCA"],
  [/^Président(?:e)? de la Commission/, "PC"],
  [/^Adjoint(?:e)? parlementaire/, "AP"],
  [/^Vice-président(?:e)? de la Commission/, "VC"],
  [/^Président(?:e)? de séance$/, "PS"],
  [/^Membre du Bureau/, "B"],
];

/** CE QUE LE CODE VEUT DIRE, sous le carré (Jules, 25-09 : « ça ne parle pas
 *  à tout le monde »). Accordé au genre de l'élu (donnees/genre-deputes.json) ;
 *  genre inconnu = forme masculine suivie de la féminine (« Député·e »). « CO »
 *  couvre les chefs de TOUS les groupes d'opposition : « Chef parlementaire »
 *  (Jules, 28-09), vrai pour chacun, là où « Chef de parti » ne l'était ni
 *  d'un chef de l'opposition officielle par intérim ni d'une co-porte-parole. */
export const LIBELLES_FONCTION: Record<string, [string, string]> = {
  PM: ["Premier ministre", "Première ministre"],
  PAN: ["Président de l’Assemblée", "Présidente de l’Assemblée"],
  CO: ["Chef parlementaire", "Cheffe parlementaire"],
  M: ["Ministre", "Ministre"],
  VP: ["Vice-président de l’Assemblée", "Vice-présidente de l’Assemblée"],
  LP: ["Leader parlementaire", "Leader parlementaire"],
  W: ["Whip", "Whip"],
  PCA: ["Président de caucus", "Présidente de caucus"],
  PC: ["Président de commission", "Présidente de commission"],
  AP: ["Adjoint parlementaire", "Adjointe parlementaire"],
  VC: ["Vice-président de commission", "Vice-présidente de commission"],
  PS: ["Président de séance", "Présidente de séance"],
  B: ["Membre du Bureau", "Membre du Bureau"],
  PP: ["Porte-parole", "Porte-parole"],
  D: ["Député", "Députée"],
};
/** Rubans de chef à l'impression : le nom du parti en sigle, pour tenir sur une
 *  ligne à 30 px (« Co-porte-parole de Québec solidaire » passait à deux). */
export function sigleParti(titre: string): string {
  return titre.replace(/Québec solidaire/g, "QS").replace(/Parti québécois/g, "PQ")
    .replace(/Parti libéral du Québec/g, "PLQ").replace(/Coalition avenir Québec/g, "CAQ")
    .replace(/Parti conservateur du Québec/g, "PCQ");
}

export function libelleFonction(code: string, genre: "f" | "m" | undefined): string {
  const [m, f] = LIBELLES_FONCTION[code] ?? [code, code];
  return genre === "f" ? f : genre === "m" || m === f ? m : `${m} / ${f}`;
}

/** RUBAN DES CHEFS PARLEMENTAIRES, tiré des fiches de l'Assemblée : le titre
 *  de la fonction de chef encore OCCUPÉE à la dissolution. Un ancien chef
 *  (Tanguay, Rizqy, Nadeau-Dubois) garde le sigle CO au recto, fonction la
 *  mieux payée de sa législature, mais ne porte pas de ruban : un titre
 *  qu'il n'a plus serait la faute la plus facile à relever. */
export function rubanChefParlementaire(tenues: { titre: string; fin: string }[]): string | null {
  const actuelle = tenues.find((t) => /^Chef(?:fe)? d/.test(t.titre) && t.fin >= AXE_FIN);
  return actuelle ? titreCourt(actuelle.titre) : null;
}

export function codeFonction(tenues: { titre: string; pct: number }[], porteParole: boolean): string {
  const triees = [...tenues].sort((a, b) => b.pct - a.pct);
  for (const [re, code] of CODES_FONCTION) if (triees.some((t) => re.test(t.titre))) return code;
  return porteParole ? "PP" : "D";
}

/** INTITULÉS COURTS pour la légende de la frise. Les intitulés officiels vont
 *  jusqu'à 180 caractères ; on ne les tronque JAMAIS en plein mot. On les
 *  abrège comme le fait la presse, par règles qui gardent un intitulé vrai :
 *  précisions entre parenthèses retirées, ordinaux en chiffres, premier
 *  portefeuille d'un ministre, ministère d'un adjoint entre parenthèses,
 *  domaine court d'une commission. Les rares cas qu'aucune règle ne résout
 *  proprement sont abrégés À LA MAIN (ABREGES). LONGUEUR_LEGENDE ≈ ce qui tient
 *  sur une ligne de la légende à 21 px ; ajusterFonctions reste le filet. */
export const LONGUEUR_LEGENDE = 55;
export const ABREGES: Record<string, string> = {
  "Ministre responsable des Relations avec les Premières Nations et les Inuit": "Ministre responsable des Affaires autochtones",
  "Adjoint parlementaire (Relations avec les Premières Nations et les Inuit)": "Adjoint parlementaire (Affaires autochtones)",
  "Ministre responsable des Relations avec les Québécois d’expression anglaise": "Ministre responsable des Québécois d’expression anglaise",
};
export const COMMISSIONS_COURTES: Record<string, string> = {
  "de l’administration publique": "Administration publique",
  "de l’agriculture, des pêcheries, de l’énergie et des ressources naturelles": "Agriculture et énergie",
  "de l’aménagement du territoire": "Aménagement du territoire",
  "de la culture et de l’éducation": "Culture et éducation",
  "de l’économie et du travail": "Économie et travail",
  "des finances publiques": "Finances publiques",
  "des institutions": "Institutions",
  "des relations avec les citoyens": "Citoyens",
  "de la santé et des services sociaux": "Santé",
  "des transports et de l’environnement": "Transports",
};

export function titreCourt(titre: string): string {
  const s = titre.replace(/\s*\([^)]*\)/g, "").trim()
    .replace(/\bdeuxième groupe/g, "2e groupe").replace(/\btroisième groupe/g, "3e groupe");
  let court = s;
  const adjoint = s.match(/^(Adjointe? parlementaire) (?:au|à la|du|de la) (premi(?:er|ère) ministre|ministre(?: délégué(?:e)?)?(?: responsable)?)(?: (?:de la |de l’|des |du |de |à la |à l’|aux |au |à ))?(.*)$/);
  const commission = s.match(/^((?:Vice-)?[Pp]résident(?:e)?) de la Commission (.*)$/);
  if (adjoint) {
    if (/^premi/.test(adjoint[2])) court = `${adjoint[1]} ${adjoint[2] === "premier ministre" ? "du premier ministre" : "de la première ministre"}`;
    else {
      const dom = adjoint[3].split(/, | et (?=de |des |du |d’|à |aux |présid)/)[0];
      court = `${adjoint[1]} (${dom.charAt(0).toUpperCase()}${dom.slice(1)})`;
    }
  } else if (/^Ministre\b/.test(s)) {
    const premier = s.split(", ")[0];
    court = premier.length > LONGUEUR_LEGENDE ? premier.split(/ et (?=de |des |du |d’|à |aux |la |l’)/)[0] : premier;
  } else if (commission && s.length > LONGUEUR_LEGENDE && COMMISSIONS_COURTES[commission[2]]) {
    court = `${commission[1]} de commission (${COMMISSIONS_COURTES[commission[2]]})`;
  }
  return ABREGES[court] ?? court;
}

/** AXE DE LA FRISE — le même pour toutes les cartes, de l'élection générale à
 *  la dissolution, pour qu'on puisse les comparer côte à côte. */
export const AXE_DEBUT = "2022-10-03";
export const AXE_FIN = "2026-08-27";

export function lendemain(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Position d'une date sur la frise, en % de la largeur. */
export function positionAxe(jour: string): number {
  const a = Date.parse(AXE_DEBUT);
  const b = Date.parse(lendemain(AXE_FIN));
  return Math.max(0, Math.min(100, ((Date.parse(jour) - a) / (b - a)) * 100));
}

/** Trame de l'encre du parti selon la rémunération : plus la fonction est
 *  payée, plus l'aplat est plein (première ministre = encre pleine). Même
 *  procédé que la barre des enjeux, sur une presse à deux encres. */
export function trame(pct: number): number {
  return pct === 0 ? 0 : Number((0.22 + 0.78 * Math.pow(pct / 105, 0.6)).toFixed(2));
}

export function ligneCarriere(car: Carriere | undefined, genre: "f" | "m" | undefined): string {
  if (!car) return "";
  const rang = car.mandats === 1 ? "1er" : `${car.mandats}e`;
  return `${genre === "f" ? "Élue" : "Élu"} pour la première fois en ${car.premiere_election} · ${rang} mandat`;
}

/** « Élu.e le 3 octobre 2022 » → « Élu le… » ou « Élue le… ». */
export function accorderGenre(ligne: string, genre: "f" | "m" | undefined): string {
  if (!genre) return ligne;
  return ligne.replace(/Élu\.e/g, genre === "f" ? "Élue" : "Élu");
}

/** Distance d'édition (Levenshtein), pour tolérer une coquille de graphie. */
export function distance(a: string, b: string): number {
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) {
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prec = cour;
  }
  return prec[b.length];
}

// Ton — formules RECOPIÉES de `AssembleeVestiaire.tsx` (toneScalePct,
// toneWording), volontairement à l'identique. Le chiffre d'affichage du
// loader est inexploitable : amplifié puis borné, il colle 81 députés sur 108
// à la butée. La position se lit donc sur une règle normalisée sur l'étendue
// RÉELLEMENT observée dans la période, ce qui est exactement ce que la mesure
// autorise à dire. Réimplémenter autrement ici ferait diverger la carte du
// site sur la seule donnée que l'élu pourrait contester.
export function toneScalePct(score: number, maxAbs: number): number {
  if (!(maxAbs > 0)) return 50;
  const ratio = Math.max(-1, Math.min(1, score / maxAbs));
  return Number((50 + ratio * 48).toFixed(1));
}

export function toneWording(score: number, maxAbs: number): string {
  const sens = score >= 0 ? "favorable" : "défavorable";
  if (!(maxAbs > 0)) return "ton neutre";
  const part = Math.abs(score) / maxAbs;
  if (part < 0.15) return "ton proche du neutre";
  const degre = part > 0.66 ? "nettement" : "plutôt";
  return `ton ${degre} ${sens} par rapport aux autres de la période`;
}

export const DATE_FR = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

export const JOUR_MOIS = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", timeZone: "UTC" });

export function plageFr(debut: string, fin: string): string {
  const d = new Date(`${debut}T12:00:00Z`);
  const a = new Date(`${fin}T12:00:00Z`);
  if (debut === fin) return DATE_FR.format(a);
  if (debut.slice(0, 4) !== fin.slice(0, 4)) return `${debut.slice(0, 4)}-${fin.slice(0, 4)}`;
  return `${JOUR_MOIS.format(d)} – ${DATE_FR.format(a)}`;
}

export function dateFr(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : DATE_FR.format(d);
}

/** Vrai si le dernier segment d'affiliation est « sans affiliation », OU s'il
 *  se ferme sur une défection sans segment suivant : c'est ainsi qu'apparaît un
 *  passage à indépendant que les affiliations publiées ne portent pas encore
 *  (Orford, 21 avril 2026, corrigé dans pplmatch#9 mais pas encore republié). */
export function finitIndependant(deputy: DeputyRow): boolean {
  const dernier = (deputy.affiliationHistory ?? []).at(-1);
  if (!dernier) return false;
  return /^sans affiliation/i.test(dernier.label) || dernier.endReason === "defection";
}

export function ligneParti(c: Carte): string {
  if (c.partiElu) return `Indépendant (élu ${c.partiElu})`;
  const nomParti = c.cle === "ind" ? c.parti : PARTY_FULL_NAMES[c.cle];
  const dernier = (c.deputy.affiliationHistory ?? []).at(-1);
  // « Sans affiliation à un parti », libellé officiel, faisait passer la ligne
  // sur deux rangs avec la mention « (élu CAQ) ».
  const courant = /^sans affiliation/i.test(dernier?.label ?? "") ? "Indépendant" : dernier?.label;
  const change = courant && courant !== c.parti && courant !== nomParti;
  return change ? `${courant} (élu ${c.parti})` : nomParti;
}

/** Le nom du fichier doit rester stable d'un tirage à l'autre : c'est lui qui
 *  sert à retrouver la carte d'un élu au moment de la lui envoyer. On le tire
 *  de la circonscription (unique par définition), pas du nom (deux « Éric
 *  Girard » siègent à la CAQ, Groulx et Lac-Saint-Jean). */
export function slugCirco(deputy: DeputyRow): string {
  const source = deputy.portrait?.match(/\/([^/]+)\.jpg$/)?.[1];
  if (source) return source;
  return (deputy.circonscription ?? deputy.name)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** LES CHEFS DE PARTI.
 *
 *  ⚠️ RIEN dans les données ne dit qui dirige un parti : ni le référentiel de
 *  l'ANQ, ni les fichiers agora, ni lib/data/parties.ts (son
 *  « showLeaderLabel » désigne une étiquette de graphique, pas une personne).
 *  Cette liste est donc SAISIE À LA MAIN, et c'est sa faiblesse : une carte
 *  qui décerne un titre que l'élu n'a plus est la faute la plus facile à
 *  relever publiquement. La direction d'un parti change en cours de
 *  législature — ce jeu de données en porte déjà la trace, avec onze
 *  défections — et un chef peut ne pas siéger, auquel cas il n'a pas de carte.
 *
 *  À TENIR À JOUR À LA MAIN, par circonscription (la clé du portrait). */
export const CHEFS: Record<string, Titre> = {
  // Les chefs des groupes d'opposition ne sont PLUS saisis ici (Jules, 28-09,
  // « il faut uniformiser ») : leur ruban vient des fiches de l'Assemblée, pour
  // la fonction occupée à la dissolution (voir rubanChefParlementaire).
  // Christine Fréchette dirige la CAQ ET le gouvernement (correction de Jules,
  // 22-09) : « Première ministre » l'emporte sur « cheffe de parti », qui en
  // découle. François Legault, lui, n'a plus de titre — sa carte est redevenue
  // une carte ordinaire ; à confirmer s'il doit porter une mention d'ancien
  // premier ministre.
  "sanguinet": { titre: "Première ministre du Québec", eclat: true },
};

/** Allégeance actuelle à privilégier lorsqu'une même personne occupe plusieurs
 * lignes de la vue « législature ». La carte représente l'élu.e aujourd'hui,
 * tandis que son parcours antérieur demeure expliqué au verso. */
export const PARTI_ACTUEL_PAR_SIEGE: Partial<Record<string, PartyKey>> = {
  "rimouski": "pcq", // Maïté Blanchette Vézina, désormais au PCQ.
};

/** Clé d'appariement entre le slug d'une circonscription (« jeanne-mance-viger »)
 *  et le district_id des fichiers agora (« jeannemanceviger ») : les deux
 *  graphies ne diffèrent que par la ponctuation. */
export function cleDistrict(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** GRAPHIE IMPRIMÉE des noms que les données écrivent mal (relevé du 23-09,
 *  comparé aux fiches de l'Assemblée). Appliquée à l'AFFICHAGE seulement :
 *  les appariements (mandat, fiche, scrutin, mots) gardent la graphie des
 *  données, sur laquelle ils ont été vérifiés. La correction durable est en
 *  amont (référentiel des portraits, données agora). */
export const NOMS_IMPRIMES: Record<string, string> = {
  "Simon Jolin-Barette": "Simon Jolin-Barrette",
  "Frederic Beauchemin": "Frédéric Beauchemin",
  // Graphie accentuée retenue par Jules (23-09), même là où l'Assemblée n'en
  // met pas. Clé = graphie des données : seul le Girard de Groulx l'a sans
  // accent (celui de Lac-Saint-Jean est déjà « Éric »).
  "Eric Girard": "Éric Girard",
};
export const nomImprime = (nom: string) => NOMS_IMPRIMES[nom] ?? nom;

export function trouverMandat(m: Mandats, nom: string, slug: string): Mandat | undefined {
  return m.parNomEtDistrict.get(`${cleDistrict(nom)}@${cleDistrict(slug)}`)
    ?? m.parDistrict.get(cleDistrict(slug))
    ?? m.parNom.get(cleDistrict(nom));
}

/** « Élu le 3 octobre 2022 » — le motif distingue l'élection générale de la
 *  partielle, ce qui n'est pas un détail pour un élu arrivé en cours de route. */
export function ligneMandat(m: Mandat | undefined): string {
  if (!m) return "";
  const quand = dateFr(m.debut);
  if (!quand) return "";
  // « Élu.e » est un GABARIT : accorderGenre() le remplace par « Élu » ou
  // « Élue » (Jules, 25-09), d'après donnees/genre-deputes.json. La forme
  // neutre ne reste que si le genre de l'élu n'y figure pas (avertissement).
  const comment = m.motif === "byelection" ? "Élu.e à la partielle du"
    : m.motif === "defection" ? "Siège depuis le"
    : "Élu.e le";
  return `${comment} ${quand}`;
}
