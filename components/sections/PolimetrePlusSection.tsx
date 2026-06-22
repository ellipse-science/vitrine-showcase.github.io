import { loadPolimetre } from "@/lib/data/polimetre";
import { PolimetrePlusClient } from "@/components/interactive/PolimetrePlusClient";
import { RawMaquette } from "@/components/sections/RawMaquette";

// Renders the data-bound Polimètre+ section. Until the `polimetre-plus` refiner
// publishes vitrine_datamart.polimetre_plus (and fetch_data.R pulls it into
// public/data), the loader returns null and we fall back to the static maquette
// chunk so the section still appears.
export async function PolimetrePlusSection() {
  const data = await loadPolimetre();
  if (!data) return <RawMaquette chunk="polimeter_plus" />;
  return <PolimetrePlusClient data={data} />;
}
