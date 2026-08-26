import { loadParties } from "@/lib/data/parties";
import { loadHeadlineEvents } from "@/lib/data/headlineEvents";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";

// RETIRÉ DE PROD, gardé sur dev (décision du 2026-08-20, avant l'envoi aux
// médias) : le module reste en rodage. La garde vit ICI, à la source, et non
// aux points de montage : accueil, éditions passées et tout montage futur
// suivent sans qu'on ait à y penser. Même signal d'environnement que
// app/robots.ts et lib/data/parties.ts — un seul signal, pas de divergence.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export async function PartisCouvertureSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  if (isProd) return null;
  const data = await loadParties(asOfIso);
  if (!data) return null;

  // Le RYTHME des vumètres suit la saillance de la Une du moment : nerveux
  // quand l'actualité est exceptionnelle, ample quand elle est ordinaire. On lit
  // le rang de l'événement de tête (1 très faible → 6 exceptionnelle), la même
  // grandeur que le badge de la Une des Unes.
  //
  // Les deux chargeurs sont mémoïsés par `cache()` : cet appel ne relit aucun
  // fichier, la Une des Unes l'ayant déjà fait sur la même page.
  //
  // ⚠️ Purement décoratif, et le repli est SILENCIEUX PAR CONSTRUCTION : rang 0
  // quand la donnée manque, ce que le CSS traduit par un tempo médian. Le module
  // des partis ne doit jamais dépendre de la santé du module 1 — c'est
  // exactement ainsi que vitrine#201 s'est cassée, en lisant un champ absent et
  // en repliant en silence sur une valeur qui semblait bonne.
  let saillanceRang = 0;
  try {
    const une = await loadHeadlineEvents();
    saillanceRang = une?.top3?.[0]?.saillanceRank ?? 0;
  } catch {
    saillanceRang = 0;
  }

  // `editionKey` vient de main (cartes de partage par édition, #partage-cartes),
  // `saillanceRang` de cette branche. Les deux cohabitent : l'un identifie la
  // page, l'autre donne le tempo des vumètres.
  return (
    <PartisCouvertureClient data={data} saillanceRang={saillanceRang} editionKey={editionKey} />
  );
}
