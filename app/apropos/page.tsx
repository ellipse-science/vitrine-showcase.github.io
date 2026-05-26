import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";

export const metadata: Metadata = {
  title: "À propos — La Vitrine démocratique",
};

export default function AproposPage() {
  return (
    <div className="page">
      <RawMaquette chunk="top" />

      <main className="apropos-container">
        <style
          dangerouslySetInnerHTML={{
            __html: `
          .apropos-container {
            margin: 48px 0;
            border-top: 0.5px solid var(--rule);
            padding-top: 48px;
            font-family: 'Source Serif 4', Georgia, serif;
            color: var(--ink);
          }
          
          .apropos-header {
            margin-bottom: 40px;
          }
          
          .apropos-title {
            font-family: 'Playfair Display', Georgia, serif;
            font-size: 54px;
            font-weight: 900;
            letter-spacing: -1.2px;
            line-height: 1.05;
            color: var(--ink);
            margin: 0 0 24px 0;
          }
          
          .apropos-lead {
            font-family: 'Source Serif 4', Georgia, serif;
            font-size: 20px;
            font-style: italic;
            font-weight: 400;
            line-height: 1.5;
            color: var(--ink-soft);
            margin: 0;
          }
          
          .apropos-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 60px;
          }
          
          .apropos-main-col {
            display: flex;
            flex-direction: column;
            gap: 40px;
          }
          
          .apropos-side-col {
            border-left: 0.5px solid var(--rule);
            padding-left: 40px;
            display: flex;
            flex-direction: column;
            gap: 40px;
          }
          
          .apropos-section-title {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.26em;
            text-transform: uppercase;
            color: var(--cordovan);
            margin: 0 0 16px 0;
            border-bottom: 1px solid var(--rule-faint);
            padding-bottom: 8px;
          }
          
          .apropos-text {
            font-size: 16.5px;
            line-height: 1.6;
            margin: 0 0 20px 0;
            color: var(--ink);
            text-align: justify;
          }
          
          .apropos-text:last-child {
            margin-bottom: 0;
          }
          
          .apropos-list {
            margin: 0 0 20px 0;
            padding-left: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          
          .apropos-list-item {
            font-size: 16px;
            line-height: 1.55;
            position: relative;
            padding-left: 20px;
          }
          
          .apropos-list-item::before {
            content: "•";
            position: absolute;
            left: 0;
            color: var(--cordovan);
            font-weight: bold;
          }
          
          .apropos-list-item strong {
            font-family: 'Source Serif 4', Georgia, serif;
            font-weight: 700;
            color: var(--ink);
          }
          
          .apropos-link {
            color: var(--cordovan);
            text-decoration: none;
            border-bottom: 0.5px solid transparent;
            transition: color 0.15s ease, border-color 0.15s ease;
          }
          
          .apropos-link:hover {
            border-bottom: 0.5px solid var(--cordovan);
          }
          
          @media (max-width: 900px) {
            .apropos-grid {
              grid-template-columns: 1fr;
              gap: 40px;
            }
            .apropos-side-col {
              border-left: none;
              padding-left: 0;
              border-top: 0.5px solid var(--rule);
              padding-top: 40px;
            }
            .apropos-title {
              font-size: 40px;
            }
            .apropos-lead {
              font-size: 18px;
            }
          }
        `,
          }}
        />

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
            façon dont les sujets émergent, circulent et s'imposent (ou non)
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
              <h2 className="apropos-section-title">Ce que nous faisons</h2>
              <p className="apropos-text">
                Depuis septembre 2018, le système Radar+ capte automatiquement
                les pages frontales de treize grands médias québécois et
                canadiens. Ces données alimentent des indices de saillance
                médiatique – une mesure de la visibilité relative des enjeux et
                des acteurs dans l'espace médiatique – calculés toutes les
                quatre heures.
              </p>
              <p className="apropos-text">
                En parallèle, les transcriptions officielles des débats de
                l'Assemblée nationale du Québec sont analysées chaque jour de
                séance afin de mesurer la présence des partis et des enjeux dans
                le discours législatif. Ces deux flux de données, jusqu'alors
                distincts, peuvent désormais être mis en regard au sein de la
                Vitrine, offrant pour la première fois une vue intégrée de
                l'agenda public québécois.
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
                  <strong>Les chercheur.euses et étudiant.es</strong> en science
                  politique, en communication et en journalisme pourront y
                  trouver des données rigoureuses pour alimenter leurs travaux,
                  les données brutes étant accessibles sur demande.
                </li>
                <li className="apropos-list-item">
                  <strong>Les journalistes</strong> pourront s'en servir pour
                  comparer la couverture d'un enjeu par différents médias et
                  dans le temps.
                </li>
                <li className="apropos-list-item">
                  <strong>Les citoyen.nes curieux</strong> pourront y voir, en
                  un coup d'œil, ce qui domine l'actualité québécoise à un
                  instant T ou sur le temps long.
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
                La Vitrine est portée par le CAPP (Centre d'analyse des
                politiques publiques) de l'Université Laval, en collaboration
                avec la CLESSN (Chaire de leadership en enseignement des
                sciences sociales numériques).
              </p>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5" }}
              >
                Le projet réunit des chercheur.euses en science politique, des
                développeur.euses de systèmes de données et des spécialistes en
                intelligence artificielle autour d'un objectif commun : rendre
                l'observation de la démocratie québécoise plus rigoureuse, plus
                transparence et plus ouverte à l'ensemble de la société.
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
                Les données brutes sont accessibles aux chercheur.euses via le
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

      <RawMaquette chunk="bottom" />
    </div>
  );
}
