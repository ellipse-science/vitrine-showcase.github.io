import { loadParties } from "@/lib/data/parties";
import { loadHeadlineEvents } from "@/lib/data/headlineEvents";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";

export async function PartisCouvertureSection({ asOfIso }: { asOfIso?: string } = {}) {
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

  return <PartisCouvertureClient data={data} saillanceRang={saillanceRang} />;
}
