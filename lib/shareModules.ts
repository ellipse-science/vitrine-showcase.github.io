// Contenu des cartes de partage par module (#210). Un slug = une ancre de
// app/page.tsx (#199) = une mini-page /partage/<slug>/ avec ses propres
// balises Open Graph/Twitter, faute de quoi les réseaux sociaux ignorent le
// fragment #module et affichent tous la carte globale du site (#209).

import { loadHeadlineEvents, loadTreemap } from "@/lib/data/headlineEvents";
import { loadParties } from "@/lib/data/parties";
import { loadAssemblee } from "@/lib/data/assemblee";
import { loadPolimetre } from "@/lib/data/polimetre";

export const SHARE_MODULE_SLUGS = [
  "une-des-unes",
  "deux-solitudes",
  "partis-et-couverture",
  "enjeux-saillants",
  "assemblee-nationale",
  "polimetre-plus",
] as const;

export type ShareModuleSlug = (typeof SHARE_MODULE_SLUGS)[number];

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
  // Petite étiquette au-dessus du titre (l'enjeu CAP) — une-des-unes affiche
  // le titre en gros plutôt qu'un chiffre (c'est une manchette, pas une
  // statistique) ; les générateurs d'image branchent sur sa présence.
  kicker?: string;
  // Lead synthétique (UneEvent.excerpt) affiché sous le titre pour ce même cas.
  excerpt?: string;
};

export type ShareModuleContent = {
  title: string;
  description: string;
  stat: ShareModuleStat;
};

// Descriptions statiques — suffisantes pour la carte de partage. Seules « Une
// des unes » et « Deux solitudes » ont une ligne calculée à partir de la
// donnée du jour (titre en tête, % de divergence), le reste étant un résumé
// éditorial stable du module.
const STATIC_CONTENT: Record<ShareModuleSlug, ShareModuleContent> = {
  "une-des-unes": {
    title: "Les Unes du jour",
    description: "Les nouvelles qui font la Une des médias québécois et canadiens en ce moment.",
    stat: { value: "#1", label: "à la Une des médias québécois" },
  },
  "deux-solitudes": {
    title: "Deux solitudes ?",
    description: "La couverture médiatique diverge-t-elle entre le Québec et le Canada ?",
    stat: { value: "2", label: "régions, une seule actualité qui diverge" },
  },
  "partis-et-couverture": {
    title: "De quel parti parle-t-on dans les médias?",
    description: "Saillance et ton de la couverture médiatique de chaque parti québécois.",
    stat: { value: "6", label: "mises à jour de la couverture partisane, chaque jour" },
  },
  "enjeux-saillants": {
    title: "De quoi parle-t-on ?",
    description: "Les enjeux qui dominent l'actualité, jour après jour.",
    stat: { value: "24", label: "heures d'analyse média, en continu" },
  },
  "assemblee-nationale": {
    title: "L'alignement de l'Assemblée nationale",
    description: "Répartition des enjeux, ton et richesse lexicale des débats parlementaires.",
    stat: { value: "125", label: "député·e·s scrutés à chaque séance" },
  },
  "polimetre-plus": {
    title: "Polimètre+ : promesses sous la loupe médiatique",
    description: "Les promesses électorales de la CAQ (2022), classées selon leur écho médiatique.",
    stat: { value: "2022", label: "les promesses électorales de la CAQ, passées au crible" },
  },
};

export async function getShareModuleContent(slug: ShareModuleSlug): Promise<ShareModuleContent> {
  const fallback = STATIC_CONTENT[slug];

  if (slug === "une-des-unes") {
    const top = (await loadHeadlineEvents())?.top3[0];
    if (top) {
      return {
        title: fallback.title,
        description: top.title,
        stat: {
          value: `${top.qcOutletCount}/${top.totalQcOutlets}`,
          label: "médias québécois en parlent",
          context: top.title,
          excerpt: top.excerpt ?? undefined,
          kicker: top.issueFr,
          color: top.issueColor,
        },
      };
    }
    return fallback;
  }

  if (slug === "deux-solitudes") {
    const data = await loadHeadlineEvents();
    if (data) {
      // La carte reprend le grand chiffre du module (écart à l'habituel), et
      // pas un niveau absolu dans un vocabulaire qui basculait selon la
      // journée : celui qui clique doit retrouver à l'écran le chiffre qu'il a
      // vu sur la carte. Le niveau absolu reste dans la description, en
      // convergence comme partout ailleurs dans le module.
      const { convPct, habitualConvPct, relDiffPct, relLabel } = data.solitudes;
      return {
        title: fallback.title,
        description:
          `${relDiffPct} % ${relLabel}. Les médias québécois et canadiens consacrent ` +
          `aujourd'hui ${convPct} % de leur attention aux mêmes histoires ` +
          `(habituel : ${habitualConvPct} %).`,
        stat: {
          value: `${relDiffPct} %`,
          label: relLabel,
          context: data.solitudes.edito,
        },
      };
    }
    return fallback;
  }

  if (slug === "partis-et-couverture") {
    const parties = await loadParties();
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
    const tiles = (await loadTreemap())?.day.tiles;
    const top = tiles?.[0];
    const total = tiles?.reduce((sum, t) => sum + t.score, 0) ?? 0;
    if (top && total > 0) {
      const sharePct = Math.round((top.score / total) * 100);
      return {
        title: fallback.title,
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
    const row = (await loadAssemblee())?.periods.session.rows[0];
    const topIssue = row?.enjeuStack?.[0];
    if (row && !row.inShadow && topIssue) {
      // `title` porte le nom complet de l'enjeu (« Gouvernements et
      // gouvernance · 39 % ») ; `label` est l'abrégé utilisé pour la barre
      // empilée (« Gouv. ») — trop tronqué pour être lisible au premier
      // coup d'œil dans une story. On isole le nom complet ici.
      const issueFullName = topIssue.title.split(" · ")[0];
      return {
        title: fallback.title,
        description: fallback.description,
        stat: {
          value: `${topIssue.widthPct} %`,
          label: "des interventions à l'Assemblée nationale portent sur",
          context: `${issueFullName} (${row.label})`,
          color: topIssue.color,
        },
      };
    }
    return fallback;
  }

  if (slug === "polimetre-plus") {
    const polimetre = await loadPolimetre();
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
