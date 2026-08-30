// Contenu des cartes de partage par module (#210). Un slug = une ancre de
// app/page.tsx (#199) = une mini-page /partage/<slug>/ avec ses propres
// balises Open Graph/Twitter, faute de quoi les réseaux sociaux ignorent le
// fragment #module et affichent tous la carte globale du site (#209).

import { listEditions, loadHeadlineEvents, loadTreemap } from "@/lib/data/headlineEvents";
import { loadParties } from "@/lib/data/parties";
import { loadAssemblee } from "@/lib/data/assemblee";
import { loadPolimetre } from "@/lib/data/polimetre";

const BASE_SHARE_MODULE_SLUGS = [
  "une-des-unes",
  "deux-solitudes",
  "partis-et-couverture",
  "enjeux-saillants",
  "assemblee-nationale",
  "polimetre-plus",
] as const;

export type ShareModuleSlug = (typeof BASE_SHARE_MODULE_SLUGS)[number];

// Le module Partis reste temporairement masqué en production (#544).
// L'Assemblée en est sortie le 2026-08-27 (#608) : identités stables
// (pplmatch#5, aws-refiners#395/#397), cache de performance validé sur
// Lambda réelle (aws-refiners#412) et parcours des député·es publié
// (aws-refiners#414, vitrine#604).
// Ne générons pas de route de partage vers une ancre vide : la surface
// partageable doit suivre le même signal que la section elle-même.
const PROD_HIDDEN_SHARE_MODULES: readonly ShareModuleSlug[] = ["partis-et-couverture"];

export const SHARE_MODULE_SLUGS: readonly ShareModuleSlug[] =
  process.env.NEXT_PUBLIC_SITE_ENV === "prod"
    ? BASE_SHARE_MODULE_SLUGS.filter((slug) => !PROD_HIDDEN_SHARE_MODULES.includes(slug))
    : BASE_SHARE_MODULE_SLUGS;

export function isShareModuleSlug(value: string): value is ShareModuleSlug {
  return (SHARE_MODULE_SLUGS as readonly string[]).includes(value);
}

// Le « chiffre choc » affiché en grand sur la story Instagram (#210) — un
// nombre concret, compréhensible en un coup d'œil, dérivé des mêmes loaders
// que la page (jamais une nouvelle donnée). `context` est la ligne de preuve
// sous le chiffre (le titre concerné, l'enjeu, la promesse...).
export type ShareModuleStat = {
  value: string;
  label: string;
  context?: string;
  // Second segment du contexte, mis en évidence (gras, couleur d'accent) —
  // ex. « On en parle » + « en bien. » pour partis-et-couverture, tiré du ton
  // réel de la couverture (RowView.toneDirection), jamais inventé.
  contextHighlight?: string;
  // Couleur d'accent pour le chiffre sur la story — reprise de la donnée elle-même
  // (couleur du parti en tête, de l'enjeu dominant...) quand elle existe, jamais
  // inventée. Absente ⇒ le rendu retombe sur le cordovan par défaut.
  color?: string;
  // `context` COMPLÈTE grammaticalement `label` au lieu d'être une phrase
  // autonome : l'Assemblée se lit « 23 % » + « des interventions portent
  // sur » + « Terres publiques et agriculture (CAQ) ». Les deux morceaux
  // doivent rester soudés dans la légende du chiffre. Sans ce drapeau,
  // l'affiche renvoyait `context` dans le cadre du bas et publiait une
  // légende tronquée sur la préposition (« …portent sur », puis rien).
  contextCompletesLabel?: boolean;
  // Petite étiquette au-dessus du titre (l'enjeu CAP) — une-des-unes affiche
  // le titre en gros plutôt qu'un chiffre (c'est une manchette, pas une
  // statistique) ; les générateurs d'image branchent sur sa présence.
  kicker?: string;
  // Lead synthétique (UneEvent.excerpt) affiché sous le titre pour ce même cas.
  excerpt?: string;
  /** Niveau public de saillance de la Une, réservé au module 1. */
  salienceLabel?: string;
  /** Rang calibré 1–6, utilisé pour reprendre la couleur du badge public. */
  salienceRank?: number;
};

export type ShareModuleContent = {
  title: string;
  description: string;
  // Accroche d'une ligne sous le titre de l'affiche de partage
  // (lib/shareCardTemplate.tsx), rendue en capitales espacées. Sans verbe
  // conjugué : c'est une étiquette de rubrique, pas une phrase.
  subtitle: string;
  stat: ShareModuleStat;
};

// Descriptions statiques — suffisantes pour la carte de partage. Seules « Une
// des unes » et « Deux solitudes » ont une ligne calculée à partir de la
// donnée du jour (titre en tête, % de divergence), le reste étant un résumé
// éditorial stable du module.
const STATIC_CONTENT: Record<ShareModuleSlug, ShareModuleContent> = {
  "une-des-unes": {
    title: "La Une des Unes",
    description: "Les nouvelles qui font la Une des médias québécois et canadiens en ce moment.",
    subtitle: "Ce qui domine l'actualité",
    stat: { value: "#1", label: "à la Une des médias québécois" },
  },
  "deux-solitudes": {
    title: "Deux solitudes?",
    description: "La couverture médiatique diverge-t-elle entre le Québec et le Canada?",
    subtitle: "Québec et Canada, deux agendas",
    stat: { value: "2", label: "régions, une seule actualité qui diverge" },
  },
  "partis-et-couverture": {
    title: "De quel parti parle-t-on dans les médias?",
    description: "Saillance et ton de la couverture médiatique de chaque parti québécois.",
    subtitle: "Saillance et ton, parti par parti",
    stat: { value: "6", label: "mises à jour de la couverture partisane, chaque jour" },
  },
  "enjeux-saillants": {
    title: "Les 12 enjeux de la campagne",
    description: "Les enjeux qui dominent l'actualité, jour après jour.",
    subtitle: "Les enjeux qui dominent",
    stat: { value: "24", label: "heures d'analyse média, en continu" },
  },
  "assemblee-nationale": {
    title: "L'alignement de l'Assemblée nationale",
    description: "Répartition des enjeux, ton et richesse lexicale des débats parlementaires.",
    subtitle: "Ce que disent les décideurs",
    stat: { value: "116", label: "député.es scrutés à chaque séance" },
  },
  "polimetre-plus": {
    title: "Polimètre+ : promesses sous la loupe médiatique",
    description: "Les promesses électorales de la CAQ (2022), classées selon leur écho médiatique.",
    subtitle: "Les promesses au suivi",
    stat: { value: "2022", label: "les promesses électorales de la CAQ, passées au crible" },
  },
};

// ÉDITIONS PASSÉES (#265, sur les rails de #434). Une carte de partage doit
// pouvoir montrer la Vitrine TELLE QU'ELLE ÉTAIT : partager le module depuis
// /edition/2026-08-10T07/ et publier le chiffre d'aujourd'hui produirait une
// carte qui contredit la page qu'elle annonce.
//
// Les deux coordonnées ne sont pas interchangeables, et c'est une propriété de
// la DONNÉE : les modules 1, 2 et 4 sortent de l'instantané 4 h et se rejouent
// au BLOC près (`key`) ; les modules 3, 5 et 6 sont publiés au jour ou à la
// semaine et se rejouent à leur cadence (`navDateIso`). C'est exactement le
// découpage qu'applique déjà app/edition/[key]/page.tsx.
export type ShareEdition = {
  /** Clé de bloc, aussi segment d'URL (« 2026-08-10T07 »). */
  key: string;
  /** Jour de publication de l'édition, pour les modules au jour/semaine. */
  navDateIso: string;
  /** « Édition du matin ». */
  label: string;
  /** « mardi 19 août 2026 ». */
  dateLabel: string;
};

// Les éditions PARTAGEABLES sont exactement celles que le site expose déjà
// (`listEditions`), jamais une liste parallèle : une carte pointant vers une
// édition qu'on ne peut pas ouvrir serait un lien mort. La fenêtre est bornée
// par l'instantané roulant, donc le nombre de cartes à générer l'est aussi.
export async function listShareEditions(): Promise<ShareEdition[]> {
  const editions = await listEditions();
  return editions.map(({ key, navDateIso, label, dateLabel }) => ({ key, navDateIso, label, dateLabel }));
}

/** Pied de carte d'archive : « Édition du matin, mardi 19 août 2026 ». */
export function shareEditionLabel(edition: ShareEdition): string {
  return `${edition.label}, ${edition.dateLabel.toLowerCase()}`;
}

export async function getShareModuleContent(
  slug: ShareModuleSlug,
  /** Absent = édition courante, exactement comme les loaders. */
  edition?: ShareEdition,
): Promise<ShareModuleContent> {
  const fallback = STATIC_CONTENT[slug];
  const editionKey = edition?.key;
  const asOfIso = edition?.navDateIso;

  if (slug === "une-des-unes") {
    const top = (await loadHeadlineEvents(editionKey))?.top3[0];
    if (top) {
      return {
        title: fallback.title,
        subtitle: fallback.subtitle,
        description: top.title,
        stat: {
          value: `${top.qcOutletCount}/${top.totalQcOutlets}`,
          label: "médias québécois en parlent",
          context: top.title,
          excerpt: top.excerpt ?? undefined,
          kicker: top.issueFr,
          color: top.issueColor,
          salienceLabel: top.saillanceLabel,
          salienceRank: top.saillanceRank,
        },
      };
    }
    return fallback;
  }

  if (slug === "deux-solitudes") {
    const data = await loadHeadlineEvents(editionKey);
    if (data) {
      // La carte reprend le grand chiffre du module (écart à l'habituel), et
      // pas un niveau absolu dans un vocabulaire qui basculait selon la
      // journée : celui qui clique doit retrouver à l'écran le chiffre qu'il a
      // vu sur la carte. Le niveau absolu reste dans la description, en
      // convergence comme partout ailleurs dans le module.
      const { convPct, habitualConvPct, relDiffPct, relLabel } = data.solitudes;
      return {
        title: fallback.title,
        subtitle: fallback.subtitle,
        description:
          `${relDiffPct} % ${relLabel}. Les médias québécois et canadiens consacrent ` +
          `aujourd'hui ${convPct} % de leur attention aux mêmes histoires ` +
          `(habituel : ${habitualConvPct} %).`,
        stat: {
          value: `${relDiffPct} %`,
          label: relLabel,
          context: data.solitudes.edito,
        },
      };
    }
    return fallback;
  }

  if (slug === "partis-et-couverture") {
    const parties = await loadParties(asOfIso);
    const leader = parties?.ranges.today.rows[0];
    // `indisponible` est décisif ICI en particulier : une carte de partage ne
    // peut pas porter le bandeau qui nuance le module, et elle parle au présent
    // (« domine la couverture aujourd'hui »). Sans ce test, la carte publiait
    // « CAQ 100 % » tiré d'une journée où le classifieur n'avait détecté qu'un
    // seul parti — une affirmation que la donnée ne soutient pas, dans
    // l'artefact le plus public du module. On retombe sur le fallback, qui
    // présente le module sans en affirmer un résultat.
    if (!parties?.indisponible && leader && leader.sovPct > 0 && !leader.inShadow) {
      // Le ton réel de la couverture (RowView.toneDirection) pilote la
      // pointe éditoriale — écho du vieil adage « qu'on en parle en bien ou
      // en mal, l'important c'est qu'on en parle ».
      const [context, contextHighlight] =
        leader.toneDirection === "positive"
          ? ["On en parle", "en bien."]
          : leader.toneDirection === "negative"
            ? ["On en parle", "en mal."]
            : ["L'important,", "c'est qu'on en parle."];
      return {
        title: fallback.title,
        subtitle: fallback.subtitle,
        description: fallback.description,
        stat: {
          value: `${leader.sovPct} %`,
          label: `${leader.label} domine la couverture médiatique aujourd'hui`,
          context,
          contextHighlight,
          color: leader.color,
        },
      };
    }
    return fallback;
  }

  if (slug === "enjeux-saillants") {
    const tiles = (await loadTreemap(editionKey, asOfIso))?.day.tiles;
    const top = tiles?.[0];
    // `share` est calculé par le chargeur : la carte de partage et la tuile
    // doivent annoncer le même nombre, pas deux divisions parallèles.
    if (top && top.share > 0) {
      const sharePct = Math.round(top.share);
      return {
        title: fallback.title,
        subtitle: fallback.subtitle,
        description: fallback.description,
        stat: {
          value: `${sharePct} %`,
          label: "de l'attention médiatique aujourd'hui",
          context: top.topObject ? `${top.issueFr} · ${top.topObject}` : top.issueFr,
          color: top.color,
        },
      };
    }
    return fallback;
  }

  if (slug === "assemblee-nationale") {
    const row = (await loadAssemblee(asOfIso))?.periods.session.rows[0];
    const topIssue = row?.enjeuStack?.[0];
    if (row && !row.inShadow && topIssue) {
      // `title` porte le nom complet de l'enjeu (« Gouvernements et
      // gouvernance · 39 % ») ; `label` est l'abrégé utilisé pour la barre
      // empilée (« Gouv. ») — trop tronqué pour être lisible au premier
      // coup d'œil dans une story. On isole le nom complet ici.
      const issueFullName = topIssue.title.split(" · ")[0];
      return {
        title: fallback.title,
        subtitle: fallback.subtitle,
        description: fallback.description,
        stat: {
          value: `${topIssue.widthPct} %`,
          label: "des interventions à l'Assemblée nationale portent sur",
          context: `${issueFullName} (${row.label})`,
          contextCompletesLabel: true,
          color: topIssue.color,
        },
      };
    }
    return fallback;
  }

  if (slug === "polimetre-plus") {
    const polimetre = await loadPolimetre(asOfIso);
    const monthPromises = polimetre?.ranges.month;
    const verdicted = monthPromises?.filter((p) => p.verdict !== null) ?? [];
    if (verdicted.length > 0) {
      const kept = verdicted.filter((p) => p.verdict === "realisee" || p.verdict === "partielle").length;
      const pct = Math.round((kept / verdicted.length) * 100);
      // Polimètre+ publie un instantané hebdomadaire, pas quotidien (cf.
      // lib/data/polimetre.ts) — la promesse la plus saillante « du jour »
      // n'existe pas ; `ranges.week` (déjà triée par salienceIndex desc dans
      // loadPolimetre) est la donnée la plus fraîche disponible.
      const topPromise = polimetre?.ranges.week[0];
      return {
        title: fallback.title,
        subtitle: fallback.subtitle,
        description: fallback.description,
        stat: {
          value: `${pct} %`,
          label: "des promesses de la CAQ tenues, en tout ou en partie",
          context: topPromise?.title,
        },
      };
    }
    return fallback;
  }

  return fallback;
}
