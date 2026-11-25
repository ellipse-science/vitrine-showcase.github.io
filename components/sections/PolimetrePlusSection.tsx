import { loadPolimetre, loadPolimetrePq } from "@/lib/data/polimetre";
import { loadPromessesNeuves } from "@/lib/data/promessesNeuves";
import { PolimetrePlusClient } from "@/components/interactive/PolimetrePlusClient";
import { RawMaquette } from "@/components/sections/RawMaquette";

// Renders the data-bound Polimètre+ section. Until the `polimetre-plus` refiner
// publishes vitrine_datamart.polimetre_plus (and fetch_data.R pulls it into
// public/data), the loader returns null and we fall back to the static maquette
// chunk so the section still appears.
//
// Le second bloc (« promesses de la campagne », raffineur
// `polimetre-promesses-neuves`, empilé AU-DESSUS des promesses de 2022) est
// OPTIONNEL et le reste : `loadPromessesNeuves` renvoie null tant qu'aucune
// promesse n'a été repérée dans les communiqués — le cas attendu hors campagne.
// Le module n'affiche alors que le bloc « 2022 » et se comporte exactement comme
// avant. C'est aussi ce qui fait que le bloc « 2022 » ne dépend en rien du
// nouveau raffineur : si celui-ci tombe, rien ne bouge ici.
export async function PolimetrePlusSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  // `pq` : série des 535 promesses du gouvernement St-Pierre Plamondon, null tant
  // que le raffineur ne l'a pas publiée (l'onglet « PQ 2026 » se replie alors sur
  // les promesses de la campagne).
  const [data, neuves, pq] = await Promise.all([
    loadPolimetre(asOfIso),
    loadPromessesNeuves(asOfIso),
    loadPolimetrePq(asOfIso),
  ]);
  if (!data) return <RawMaquette chunk="polimeter_plus" />;
  return <PolimetrePlusClient data={data} neuves={neuves} pq={pq} editionKey={editionKey} />;
}
