import { loadAssemblee, type AssembleeData } from "@/lib/data/assemblee";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";

/** Ce que la page envoie au navigateur. `issueShares` (parts brutes des
 *  enjeux) et `independants` servent au générateur des cartes imprimées, pas
 *  au site : envoyés tels quels, ils faisaient passer les données du module de
 *  37 à 53 Ko compressés sur l'accueil et chaque page d'édition (relecture
 *  d'Adrien, vitrine#912). */
function pourLeNavigateur(data: AssembleeData): AssembleeData {
  const periods = Object.fromEntries(Object.entries(data.periods).map(([cle, vue]) => {
    const { independants: _independants, ...reste } = vue;
    return [cle, {
      ...reste,
      rows: vue.rows.map((r) => ({
        ...r,
        deputies: r.deputies?.map(({ issueShares: _parts, ...d }) => d),
      })),
    }];
  })) as AssembleeData["periods"];
  return { ...data, periods };
}

export async function AssembleeSection({ asOfIso, editionKey }: { asOfIso?: string; editionKey?: string } = {}) {
  const data = await loadAssemblee(asOfIso);
  if (!data) return null;
  return <AssembleeClient data={pourLeNavigateur(data)} editionKey={editionKey} />;
}
