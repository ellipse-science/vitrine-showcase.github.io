import type { LegislatureEnAttente } from "@/lib/data/assemblee";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** La nouvelle Assemblée, entre l'élection et sa première séance (#1035).
 *  Les élus et leurs portraits, rangés par parti, SANS statistique de débat :
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
      <ul className="assemblee-attente-compte" aria-label="Sièges par parti">
        {vue.rows.map((r) => (
          <li key={r.key} style={{ ["--parti" as string]: r.color }}>
            <span className="sigle">{r.label}</span> {r.deputes.length}
          </li>
        ))}
      </ul>
      {vue.rows.filter((r) => r.deputes.length > 0).map((r) => (
        <section key={r.key} className="assemblee-attente-parti" style={{ ["--parti" as string]: r.color }}
          aria-label={`${r.label}, ${r.deputes.length} député·es`}>
          <h3 className="assemblee-attente-parti-titre">{r.label} <span>{r.deputes.length}</span></h3>
          <ul className="assemblee-attente-grille">
            {r.deputes.map((d) => (
              <li key={d.id} className="assemblee-attente-elu">
                {d.portrait && <img src={`${BASE_PATH}${d.portrait}`} alt="" loading="lazy" decoding="async" />}
                <span className="nom">{d.name}</span>
                <span className="circo">{d.circonscription}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {vue.horsCasier.length > 0 && (
        <p className="assemblee-attente-hors">Sans casier de parti : {vue.horsCasier.join(", ")}.</p>
      )}
    </div>
  );
}
