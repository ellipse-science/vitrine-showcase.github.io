import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export const metadata: Metadata = {
  title: "À propos — La Vitrine démocratique",
};

export default function AproposPage() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container" data-section="À propos">


        <div className="apropos-header">
          <h1 className="apropos-title">À propos</h1>
          <p className="apropos-lead dek-with-cap">
            La Vitrine démocratique est un observatoire numérique de l'espace
            public québécois, développé par le Centre d'analyse des politiques
            publiques (CAPP) de l'Université Laval. Elle mesure en continu deux
            dimensions fondamentales de la vie démocratique : la visibilité des
            enjeux dans les grands médias québécois et canadiens, et leur
            présence dans les débats à l'Assemblée nationale. En mettant ces
            deux dimensions en regard, elle offre une lecture scientifique de la
            façon dont les enjeux émergent, circulent et s'imposent (ou non)
            dans l'espace public québécois.
          </p>
        </div>

        <div className="dbl-rule" style={{ margin: "32px 0" }} />

        <div className="apropos-grid">
          <div className="apropos-main-col">
            <section>
              <h2 className="apropos-section-title">Pourquoi ce projet ?</h2>
              <p className="apropos-text">
                Dans un contexte de fragmentation médiatique, de multiplication
                des sources d'information et d'accélération des cycles
                d'actualité, il devient de plus en plus difficile d'avoir une
                vue d'ensemble cohérente de l'agenda public. Pendant longtemps,
                aucun outil ne permettait d'en suivre l'évolution de façon
                systématique et accessible.
              </p>
              <p className="apropos-text">
                La Vitrine démocratique est née de la conviction que la rigueur
                scientifique peut être mise au service de la transparence
                démocratique. Plutôt que de produire des analyses ponctuelles,
                l'équipe a choisi de construire une infrastructure de mesure
                permanente, accessible à toutes et à tous, actualisée six fois
                par jour pour les données médiatiques et chaque jour de séance
                pour les débats parlementaires.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Que faisons-nous ?</h2>
              <p className="apropos-text">
                Nos sociétés font face à une multitude de problèmes complexes
                qui ne peuvent tous être traités simultanément. L'agenda public
                renvoie à l'ensemble des enjeux qui retiennent l'attention des
                médias et des décideurs politiques à un moment donné, et désigne
                ainsi les enjeux priorisés dans le débat public. Ce concept
                s'inscrit plus globalement dans la tradition de la théorie de
                l'agenda-setting (McCombs & Shaw, 1972 ; Iyengar & Kinder, 1987)
                selon laquelle les médias et les élus se co-influencent
                mutuellement dans la construction de l'agenda public.
              </p>
              <p className="apropos-text">
                Depuis septembre 2019, le système Radar+ capte automatiquement
                les grands titres de treize médias québécois et canadiens.
                Ces données alimentent des indices de saillance médiatique — un
                concept provenant de la littérature scientifique désignant
                l'importance relative accordée par les médias aux différents
                sujets et enjeux présents dans l'espace médiatique — calculés
                toutes les quatre heures.
              </p>
              <p className="apropos-text">
                En parallèle, les transcriptions officielles des débats de
                l'Assemblée nationale du Québec sont analysées chaque jour de
                séance (lorsqu'une transcription est disponible) afin
                d’analyser la participation des différents partis lors de la
                période de questions, la présence des différents enjeux dans les
                discours, le ton employé par les parlementaires et la richesse
                lexicale des discours législatifs. Ces deux flux de données,
                jusqu'alors distincts, peuvent désormais être mis en regard au
                sein de la Vitrine, offrant pour la première fois une vue
                intégrée de l'agenda public québécois.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Pour qui ?</h2>
              <p className="apropos-text">
                La Vitrine démocratique s'adresse à toute personne souhaitant
                mieux comprendre l'agenda public québécois :
              </p>
              <ul className="apropos-list">
                <li className="apropos-list-item">
                  <strong>Les personnes curieuses</strong> pourront y voir,
                  en un coup d’œil, ce qui domine l’actualité québécoise à un
                  instant T ou sur le temps long.
                </li>
                <li className="apropos-list-item">
                  <strong>Les chercheuses et chercheurs ainsi que les étudiantes et étudiants</strong> en
                  science politique, en communication et en journalisme pourront
                  y trouver des données rigoureuses pour alimenter leurs travaux,
                  les données brutes étant accessibles sur demande.
                </li>
                <li className="apropos-list-item">
                  <strong>Les journalistes</strong> pourront s'en servir pour
                  comparer la couverture d'un enjeu par différents médias et
                  dans le temps.
                </li>
              </ul>
            </section>
          </div>

          <div className="apropos-side-col">
            <section>
              <h2 className="apropos-section-title">Qui sommes-nous ?</h2>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5" }}
              >
                La Vitrine est portée par le CAPP (Centre d'analyse des politiques
                publiques) de l'Université Laval, en collaboration avec la
                CLESSN (Chaire de leadership en enseignement des sciences sociales
                numériques). Le projet réunit des chercheuses et chercheurs en science
                politique, des développeuses et développeurs de systèmes de données et des
                spécialistes en intelligence artificielle autour d'un objectif
                commun : rendre l'observation de la démocratie québécoise plus
                rigoureuse, plus transparente et plus ouverte à l'ensemble de la
                société.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Transparence et accès</h2>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5" }}
              >
                La Vitrine s'inscrit dans une démarche de science ouverte. Le
                code source des raffineurs de données est disponible sur GitHub
                (
                <a
                  href="https://github.com/ellipse-science"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="apropos-link"
                >
                  github.com/ellipse-science
                </a>
                ).
              </p>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5" }}
              >
                Les données brutes sont accessibles aux chercheurs via le
                formulaire d'accès aux données.
              </p>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5", marginTop: "16px" }}
              >
                Pour toute question ou collaboration :
                <br />
                <a href="mailto:capp@ulaval.ca" className="apropos-link">
                  capp@ulaval.ca
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>

      <IssueReporter />
    </div>
  );
}
