import { loadPolimetre } from "@/lib/data/polimetre";
import { loadPromessesNeuves } from "@/lib/data/promessesNeuves";
import { PolimetrePlusClient } from "@/components/interactive/PolimetrePlusClient";
import { RawMaquette } from "@/components/sections/RawMaquette";

// Renders the data-bound Polimètre+ section. Until the `polimetre-plus` refiner
// publishes vitrine_datamart.polimetre_plus (and fetch_data.R pulls it into
// public/data), the loader returns null and we fall back to the static maquette
// chunk so the section still appears.
//
// Le second mode (« promesses de la campagne », raffineur
// `polimetre-promesses-neuves`) est OPTIONNEL et le reste : `loadPromessesNeuves`
// renvoie null tant qu'aucune promesse n'a été repérée dans les communiqués — le
// cas attendu hors campagne. Le module n'affiche alors pas d'inverseur de mode et
// se comporte exactement comme avant. C'est aussi ce qui fait que le mode « 2022 »
// ne dépend en rien du nouveau raffineur : si celui-ci tombe, rien ne bouge ici.
export async function PolimetrePlusSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  const [data, neuves] = await Promise.all([
    loadPolimetre(asOfIso),
    loadPromessesNeuves(asOfIso),
  ]);
  if (!data) return <RawMaquette chunk="polimeter_plus" />;
  return <PolimetrePlusClient data={data} neuves={neuves} editionKey={editionKey} />;
}
