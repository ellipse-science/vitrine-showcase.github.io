import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "Notre infrastructure de données — La Vitrine démocratique",
};

export default function InfrastructurePage() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container" data-section="Méthodologie · Notre infrastructure">
        <div className="apropos-header">
          <p className="apropos-fil">
            <a href="/methodologie/" className="apropos-link">Méthodologie</a> · Notre infrastructure
          </p>
          <h1 className="apropos-title">Notre infrastructure de données</h1>
          <p className="apropos-lead dek-with-cap">
            Chaque donnée affichée sur ce site a traversé une chaîne précise avant
            d'apparaître à l'écran&nbsp;: elle est captée automatiquement depuis sa
            source, mise en forme, analysée par nos modèles, puis publiée. Cette
            page décrit cette chaîne dans ses grandes lignes&nbsp;: ce qu'elle
            capte, comment l'information y circule, et où elle est hébergée.
          </p>
        </div>

        <div className="dbl-rule" style={{ margin: "32px 0" }} />

        <div className="apropos-grid">
          <div className="apropos-main-col">
            <section>
              <h2 className="apropos-section-title">Nos valeurs</h2>
              <p className="apropos-text">
                <strong>Une infrastructure entièrement automatisée.</strong> Aucune
                intervention humaine n'est nécessaire au jour le jour&nbsp;: la
                collecte, le calcul des indices et la publication du site se
                déclenchent seuls, à heure fixe, sept jours sur sept.
              </p>
              <p className="apropos-text">
                <strong>Une chaîne traçable.</strong> Les données brutes, les
                données mises en forme et les résultats calculés sont conservés à
                des étapes distinctes plutôt qu'écrasés les uns par les autres&nbsp;:
                n'importe quel chiffre publié peut être retracé jusqu'à la
                manchette ou à l'intervention parlementaire qui l'a produit.
              </p>
              <p className="apropos-text">
                <strong>Hébergée au Québec.</strong> Les données sont hébergées au
                Québec, dans les infrastructures infonuagiques du CAPP (Amazon Web
                Services). Aucune donnée personnelle n'est transmise à des tiers.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Comment les données circulent</h2>
              <div
                className="infra-diagram"
                role="img"
                aria-label={"Schéma du parcours des données, de la collecte à la publication\u00a0: sources, collecte, lac de données, entrepôt de données, raffinage, comptoirs de données, diffusion."}
              >
                <div className="infra-stage">
                  <span className="infra-stage-icon" aria-hidden="true">📰</span>
                  <span className="infra-stage-label">Sources</span>
                </div>
                <span className="infra-arrow" aria-hidden="true">→</span>
                <div className="infra-stage">
                  <span className="infra-stage-icon" aria-hidden="true">📡</span>
                  <span className="infra-stage-label">Collecte</span>
                </div>
                <span className="infra-arrow" aria-hidden="true">→</span>
                <div className="infra-stage">
                  <span className="infra-stage-icon" aria-hidden="true">🗄️</span>
                  <span className="infra-stage-label">Lac de données</span>
                </div>
                <span className="infra-arrow" aria-hidden="true">→</span>
                <div className="infra-stage">
                  <span className="infra-stage-icon" aria-hidden="true">📚</span>
                  <span className="infra-stage-label">Entrepôt de données</span>
                </div>
                <span className="infra-arrow" aria-hidden="true">→</span>
                <div className="infra-stage">
                  <span className="infra-stage-icon" aria-hidden="true">⚙️</span>
                  <span className="infra-stage-label">Raffinage</span>
                </div>
                <span className="infra-arrow" aria-hidden="true">→</span>
                <div className="infra-stage">
                  <span className="infra-stage-icon" aria-hidden="true">📊</span>
                  <span className="infra-stage-label">Comptoirs</span>
                </div>
                <span className="infra-arrow" aria-hidden="true">→</span>
                <div className="infra-stage infra-stage-final">
                  <span className="infra-stage-icon" aria-hidden="true">🌐</span>
                  <span className="infra-stage-label">Site public</span>
                </div>
              </div>
              <p className="infra-diagram-caption">
                De la manchette à l'écran&nbsp;: sept étapes, jamais de saisie manuelle entre les deux.
              </p>
              <p className="apropos-text">
                <strong>Sources.</strong> Treize médias québécois et canadiens pour
                la couverture de presse, et les débats de l'Assemblée nationale
                pour la vie parlementaire.
              </p>
              <p className="apropos-text">
                <strong>Collecte.</strong> Des programmes automatisés captent la
                page frontale des médias toutes les quatre heures, et les débats
                parlementaires à chaque jour de séance.
              </p>
              <p className="apropos-text">
                <strong>Lac de données.</strong> Les données brutes sont conservées
                telles quelles, dans leur format d'origine, dès leur collecte.
              </p>
              <p className="apropos-text">
                <strong>Entrepôt de données.</strong> Elles sont ensuite converties
                dans une forme structurée et interrogeable, organisée par source,
                sans jamais perdre leur origine ni leur trace dans le lac de données.
              </p>
              <p className="apropos-text">
                <strong>Raffinage.</strong> Des programmes automatisés et nos
                modèles d'intelligence artificielle (voir{" "}
                <a href="/methodologie/modeles/" className="apropos-link">Nos
                modèles d'intelligence artificielle</a>) calculent les indices
                publiés sur ce site&nbsp;: saillance médiatique, ton, part de voix
                des partis, enjeux dominants, promesses tenues.
              </p>
              <p className="apropos-text">
                <strong>Comptoirs de données.</strong> Les résultats du raffinage
                sont organisés en jeux de données thématiques, prêts à être
                consultés ou republiés.
              </p>
              <p className="apropos-text">
                <strong>Diffusion.</strong> Le site se reconstruit automatiquement
                à partir de ces jeux de données et republie une nouvelle édition,
                en continu.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Ce que cela permet</h2>
              <ul className="apropos-list">
                <li className="apropos-list-item"><strong>Une donnée toujours fraîche</strong>&nbsp;: mise à jour au plus tard quatre heures après un fait nouveau dans les médias.</li>
                <li className="apropos-list-item"><strong>Un historique interrogeable</strong>&nbsp;: chaque étape de la chaîne conserve ses propres données, ce qui permet de reconstituer et de vérifier n'importe quel chiffre publié.</li>
                <li className="apropos-list-item"><strong>Une mise à l'essai avant chaque changement</strong>&nbsp;: tout ajout ou correctif est d'abord vérifié dans un environnement séparé de celui qui alimente le site public.</li>
                <li className="apropos-list-item"><strong>Un code ouvert</strong>&nbsp;: le traitement des données est public sur nos dépôts GitHub (voir le §&nbsp;11 de la méthodologie, Éthique et transparence).</li>
              </ul>
            </section>

            <section>
              <h2 className="apropos-section-title">Ce qu'elle ne fait pas encore</h2>
              <ul className="apropos-list">
                <li className="apropos-list-item">Ce n'est pas une diffusion instantanée&nbsp;: la fraîcheur maximale est de quatre heures pour les médias, et d'un jour de séance pour l'Assemblée nationale.</li>
                <li className="apropos-list-item">Une partie du repérage des sujets saillants dans les manchettes passe encore par un grand modèle de langue externe, en attendant la validation complète de nos propres modèles&nbsp;: voir <a href="/methodologie/modeles/" className="apropos-link">Nos modèles</a>.</li>
                <li className="apropos-list-item">L'historique ne remonte pas à la même date pour toutes les régions couvertes&nbsp;: chaque source a été ajoutée à un moment différent de la vie du projet.</li>
              </ul>
            </section>
          </div>

          <aside className="apropos-side-col">
            <p className="apropos-text">
              Cette infrastructure est conçue, exploitée et surveillée par notre
              équipe, et hébergée sur Amazon Web Services.
            </p>
            <p className="apropos-text">
              La conception et le développement de cette infrastructure ont été
              réalisés par Patrick Poncet, de notre partenaire{" "}
              <a href="https://infoscope.ca" target="_blank" rel="noopener noreferrer" className="apropos-link">Infoscope</a>.
            </p>
            <p className="apropos-text">
              Voir aussi le §&nbsp;11 de la{" "}
              <a href="/methodologie/#ethique" className="apropos-link">méthodologie</a>, Éthique et transparence.
            </p>
          </aside>
        </div>
      </main>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>
      <IssueReporter />
    </div>
  );
}
