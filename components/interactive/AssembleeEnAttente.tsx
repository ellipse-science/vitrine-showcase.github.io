import type { LegislatureEnAttente } from "@/lib/data/assemblee";
import { rangeesEnAttente } from "@/lib/data/assembleeAttente";
import { AssembleeVestiaire } from "@/components/interactive/AssembleeVestiaire";

/** La nouvelle Assemblée, entre l'élection et sa première séance (#1035).
 *  Les cinq casiers de la 43e (Jules, 25 nov.) : sièges sur les portes, cartes
 *  des élus dans le tiroir, SANS statistique de débat :
 *  aucun mot n'a encore été prononcé, et un « 0 mot » se lirait comme une
 *  mesure. Le bandeau dit pourquoi, et quand ça changera. */
export function AssembleeEnAttente({ vue }: { vue: LegislatureEnAttente }) {
  return (
    <div className="assemblee-attente">
      <p className="assemblee-attente-bandeau" role="status">
        <span className="assemblee-attente-icone" aria-hidden="true">⏳</span>
        <span>
          <strong>En attente de la première séance</strong> : {vue.premiereSeanceLibelle}.{" "}
          Les {vue.total} député·es ont été élu·es le {vue.electionLibelle}. Leurs interventions s&apos;afficheront
          ici dès que le Journal des débats de la première séance sera publié.
        </span>
      </p>
      <AssembleeVestiaire rows={rangeesEnAttente(vue)} shadowRows={[]} attente={{ electionLibelle: vue.electionLibelle }} />
      {vue.horsCasier.length > 0 && (
        <p className="assemblee-attente-hors">Sans casier de parti : {vue.horsCasier.join(", ")}.</p>
      )}
    </div>
  );
}
