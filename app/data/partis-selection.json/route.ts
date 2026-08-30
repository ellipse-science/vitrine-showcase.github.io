// data/partis-selection.json — les cinq pochettes que CE build affiche, et de
// quoi les illustrer.
//
// POURQUOI. Le raffineur vitrine-art-partis (aws-refiners) engendre une
// pochette par parti et par bloc de 4 h. Pour savoir QUOI illustrer, il ne
// recalcule rien : il lit ce fichier sur le site déployé. C'est exactement la
// parade de `data/hero-selection.json` pour la Une (issue #259) — le verdict
// publié ici est par construction celui du rendu, puisqu'il sort du même
// `loadParties()`, du même snapshot et du même build. Deux implémentations de
// « quel enjeu domine pour la CAQ » finiraient par diverger, et c'est
// l'illustration qui mentirait.
//
// `force-static` : rendu UNE FOIS au build, servi en fichier plat. Aucun
// visiteur ne déclenche de calcul.
//
// ⚠️ postbuild.mjs purge les JSON de out/data. Ce fichier doit y être épargné
// comme hero-selection.json l'est déjà : sans quoi le raffineur lit un 404 et
// n'illustre plus rien.

import { formatDuree } from "@/lib/duree";
import { CLE_PAR_LIBELLE, signaturePochette } from "@/lib/enjeux";
import { loadParties, PARTY_FULL_NAMES, SANS_ENJEU, type RowView } from "@/lib/data/parties";

export const dynamic = "force-static";


/** Le ton en un mot, pour le prompt. Vocabulaire imposé par le guide de
 *  rédaction : « favorable / défavorable », jamais « positif / négatif ». */
const TON_MOT: Record<"positive" | "negative" | "neutral", string> = {
  positive: "favorable",
  negative: "défavorable",
  neutral: "neutre",
};

/** L'enjeu DISTINCTIF d'un parti : le plus présent de ceux qu'on lui associe.
 *
 *  `reste` est écarté (le pad « Autres enjeux » agrège une queue, ce n'est pas
 *  un sujet), et `SANS_ENJEU` aussi : illustrer « Aucun enjeu identifié »
 *  produirait une image sur le vide. Sans enjeu utilisable, on rend `null` et
 *  le raffineur illustrera le parti seul. */
function enjeuDistinctif(row: RowView) {
  const e = row.enjeux.find((x) => !x.reste && x.label !== SANS_ENJEU);
  if (!e) return null;
  return {
    label: e.label,
    pct: e.pct,
    references: CLE_PAR_LIBELLE[e.label] ?? null,
  };
}

export async function GET() {
  // `null` plutôt qu'un échec de build : sans données, il n'y a pas de pochette
  // à illustrer, et le raffineur sait quoi faire d'un null — rien.
  try {
    const data = await loadParties();
    if (!data) return Response.json(null);

    // L'AGRÉGAT, jamais une position du fader : la pochette d'un parti parle de
    // sa couverture tous médias confondus. `ranges.today` est ce que le bac du
    // jour affiche.
    const rows = data.ranges.today.rows;

    const partis = rows.map((row) => {
      const enjeu = enjeuDistinctif(row);
      return {
        key: row.key,
        sigle: row.label,
        nom: PARTY_FULL_NAMES[row.key],
        rang: row.rang,
        /** Minutes en Une du jour, et le libellé tel que le site l'écrit. */
        minutes_une: row.minutesUne,
        temps_label: formatDuree(row.minutesUne),
        part_pct: row.sovPct,
        enjeu: enjeu?.label ?? null,
        enjeu_pct: enjeu?.pct ?? null,
        enjeu_references: enjeu?.references ?? null,
        /** Le MOT seul, sans la flèche du rendu : `toneLabel` vaut
         *  « ↓ Défavorable », et un prompt d'image n'a que faire d'un glyphe
         *  de tableau de bord. */
        ton: TON_MOT[row.toneDirection],
        ton_direction: row.toneDirection,
        ton_pct: row.tonePct,
        /** CLÉ D'APPARIEMENT, l'équivalent du `storyline_id` de la Une.
         *
         *  Le site n'affiche la pochette engendrée que si cette signature
         *  correspond à ce qu'il rend au moment du build. Sans cette garde, un
         *  bloc de retard afficherait l'illustration d'un enjeu que le module
         *  n'annonce plus — le défaut exact que la garde d'appariement de
         *  `UneDesUnesSection` existe à empêcher.
         *
         *  ⚠️ LE TEMPS EN UNE N'Y FIGURE PAS, et c'est délibéré. La chaîne est
         *  décalée d'un cycle par construction : le raffineur lit le contrat du
         *  build courant, engendre, et c'est le build SUIVANT qui rapatrie. Une
         *  signature contenant les minutes — qui montent à chaque bloc — ne
         *  correspondrait donc jamais, et aucune pochette ne s'afficherait
         *  jamais. Ce que l'image représente, c'est l'enjeu et le ton ; la durée
         *  est écrite par le site, en toutes lettres, à côté.
         *
         *  Elle ne sert PAS à décider de régénérer : c'est `cloture` qui commande
         *  ça, un album par jour au bloc de 20h. */
        signature: signaturePochette(row.key, enjeu?.label, row.toneDirection),
      };
    });

    return Response.json({
      generated_at: new Date().toISOString().slice(0, 16) + "Z",
      jour: data.blocCourant?.date ?? data.lastDate,
      // `null` quand la table intra-journée n'est pas publiée. Le raffineur
      // doit alors s'abstenir : sans bloc, il ne saurait pas sous quel jour
      // ranger l'image ni quand la journée est close.
      bloc: data.blocCourant,
      /** LA SORTIE DE L'ALBUM. Vrai au bloc de 20h, quand la journée est close.
       *
       *  C'est ce drapeau qui commande la génération : le raffineur tourne à
       *  chaque bloc de 4 h et n'engendre RIEN tant qu'il est faux (arbitrage de
       *  l'équipe, 2026-08-30). Cinq images par jour au lieu de trente, et une
       *  pochette qui ne saute plus d'un bloc à l'autre sous les yeux du
       *  lecteur — seuls les CHIFFRES du bac continuent de s'actualiser. */
      cloture: data.blocCourant?.hour === 20,
      partis,
    });
  } catch {
    return Response.json(null);
  }
}
