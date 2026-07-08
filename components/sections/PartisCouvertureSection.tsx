import { loadParties } from "@/lib/data/parties";
import { PartisCouvertureClient } from "@/components/interactive/PartisCouvertureClient";

export async function PartisCouvertureSection() {
  const data = await loadParties();
  if (!data) return (
    <div className="partis-unavailable">
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Couverture médiatique des partis politiques</h2>
        </div>
      </div>
      <p className="partis-unavailable-msg">Données temporairement indisponibles — mise à jour en cours.</p>
    </div>
  );
  return <PartisCouvertureClient data={data} />;
}
