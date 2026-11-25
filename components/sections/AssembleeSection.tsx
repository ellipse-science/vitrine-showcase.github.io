import { DOSSIER_ARCHIVE_ASSEMBLEE_43E, loadArchiveAssemblee43e, loadAssemblee, type AssembleeData } from "@/lib/data/assemblee";
import { preparerCartesAttente, preparerCartesSite } from "@/lib/cartes/site";
import { AssembleeClient } from "@/components/interactive/AssembleeClient";

/** Ce que la page envoie au navigateur. `issueShares` (parts brutes des
 *  enjeux) et `independants` servent au générateur des cartes imprimées, pas
 *  au site : envoyés tels quels, ils faisaient passer les données du module de
 *  37 à 53 Ko compressés sur l'accueil et chaque page d'édition (relecture
 *  d'Adrien, vitrine#912). Ce dont les cartes du vestiaire ont besoin à partir
 *  d'eux est calculé au build par preparerCartesSite. */
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
  // Les fiches des cartes de député (numéro, rareté, fonctions, parcours…),
  // AU BUILD, par la même fabrique que les cartes imprimées (lib/cartes).
  const cartes = data.legislatureCourante ? undefined
    : await preparerCartesSite(data, data.archiveFigee ? DOSSIER_ARCHIVE_ASSEMBLEE_43E : undefined);
  const archive = !editionKey && data.legislatureCourante ? await loadArchiveAssemblee43e() : null;
  const archive43e = archive ? {
    cartes: await preparerCartesSite(archive, DOSSIER_ARCHIVE_ASSEMBLEE_43E),
    data: pourLeNavigateur(archive),
  } : undefined;
  // La nouvelle Assemblée en attente de sa première séance : ses cartes, par
  // la même fabrique, avec les sources de sa législature.
  const cartesProchaine = data.prochaine ? await preparerCartesAttente(data.prochaine) : undefined;
  return (
    <AssembleeClient data={pourLeNavigateur(data)} cartes={cartes} editionKey={editionKey} archive43e={archive43e}
      cartesProchaine={cartesProchaine} />
  );
}
