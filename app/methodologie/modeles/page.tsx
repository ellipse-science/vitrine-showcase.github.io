import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "Nos modèles d'intelligence artificielle — La Vitrine démocratique",
};

const RAPPORT = "/docs/rapport-validation-modeles-locaux-2026-09.pdf";

export default function ModelesPage() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container" data-section="Modèles">
        <div className="apropos-header">
          <p className="apropos-fil">
            <a href="/methodologie/" className="apropos-link">Méthodologie</a> · Nos modèles
          </p>
          <h1 className="apropos-title">Nos modèles d'intelligence artificielle</h1>
          <p className="apropos-lead dek-with-cap">
            La Vitrine lit chaque jour des milliers de phrases de presse et de débats
            parlementaires. Ce travail est fait par des modèles que notre équipe a
            entraînés, calibrés et validés elle-même, et dont nous publions le rapport
            de validation complet. Cette page résume ce qu'ils font, ce qu'ils valent,
            et ce qu'ils ne savent pas encore faire.
          </p>
        </div>

        <div className="dbl-rule" style={{ margin: "32px 0" }} />

        <div className="apropos-grid">
          <div className="apropos-main-col">
            <section>
              <h2 className="apropos-section-title">Nos valeurs</h2>
              <p className="apropos-text">
                <strong>Des modèles à nous.</strong> Les 30 classifieurs qui lisent les
                phrases (21 thèmes de politiques publiques, 9 partis) et le modèle de
                sentiment sont des modèles locaux, légers, qui tournent sur notre propre
                infrastructure. Aucune phrase de la Vitrine n'est envoyée à un service
                commercial pour être classée.
              </p>
              <p className="apropos-text">
                <strong>Une science reproductible et transparente.</strong> Le rapport
                donne, pour chaque modèle, son jeu d'entraînement exact, sa procédure,
                sa performance mesurée sur des phrases annotées par des humains, et le
                seuil retenu. Aucun chiffre n'y est saisi à la main&nbsp;: les tableaux
                sont régénérés depuis les journaux d'entraînement versionnés.
              </p>
              <p className="apropos-text">
                <strong>Une science évolutive.</strong> Les modèles ne sont pas parfaits,
                et nous le disons. Ils sont réentraînés, revalidés et remplacés à mesure
                que les annotations humaines s'accumulent; chaque changement est
                daté dans la méthodologie.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Ce que l'IA fait chez nous, et comment</h2>
              <p className="apropos-text">
                <strong>Distillation.</strong> Les modèles sont des encodeurs mDeBERTa,
                un par thème et un par parti, entraînés sur un corpus de 99&nbsp;997
                phrases bilingues tirées de la presse et des débats. Ce corpus a été
                annoté par un grand modèle de langue (gpt-5.4), puis les modèles légers
                ont été distillés à partir de ces annotations. Chaque modèle répond à une
                seule question, «&nbsp;ce thème est-il présent dans cette phrase?&nbsp;»,
                ce qui permet de le mesurer, de le remplacer ou de le retirer sans
                toucher aux autres.
              </p>
              <p className="apropos-text">
                <strong>Calibration.</strong> Le seuil de décision de chaque tête
                thématique a été réglé sur des phrases annotées à la main, par
                validation croisée répétée deux cents fois, pour que le modèle ne dise
                «&nbsp;oui&nbsp;» ni trop souvent ni trop rarement.
              </p>
              <p className="apropos-text">
                <strong>Validation.</strong> Les modèles ont été confrontés à
                2&nbsp;273 phrases annotées par des humains, hors du corpus
                d'entraînement. C'est le seul chiffre qui dit ce que vaut un modèle sur
                les textes que la Vitrine traite réellement.
              </p>
              <p className="apropos-text">
                <strong>Et pour la Une des Unes.</strong> Le regroupement des Unes en
                histoires et leurs titres sont produits par un grand modèle de langue
                (Claude Sonnet 5), choisi après un banc comparatif; ce choix et ses
                mesures sont décrits au §&nbsp;04 de la méthodologie.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Ce que valent les modèles</h2>
              <ul className="apropos-list">
                <li className="apropos-list-item"><strong>Thèmes</strong>&nbsp;: F1 moyen de la classe positive de 0,656 sur les 21 têtes; 13 dépassent 0,65. Les têtes suivent le consensus humain&nbsp;: plus les annotateurs s'accordent sur une phrase, plus les modèles aussi.</li>
                <li className="apropos-list-item"><strong>Partis</strong>&nbsp;: de 0,934 à 0,994 pour les quatre partis fédéraux disposant d'assez de cas de référence (BQ, PCC, PLC, NPD).</li>
                <li className="apropos-list-item"><strong>Sentiment</strong>&nbsp;: 0,653, contre un accord entre annotateurs humains de 0,669, soit 98&nbsp;% du plafond humain.</li>
              </ul>
            </section>

            <section>
              <h2 className="apropos-section-title">Ce qu'ils ne savent pas encore faire</h2>
              <ul className="apropos-list">
                <li className="apropos-list-item">Deux têtes thématiques restent peu sûres, <code>domestic_commerce</code> et <code>public_lands</code>&nbsp;: leurs chiffres sont des ordres de grandeur.</li>
                <li className="apropos-list-item">Les cinq partis provinciaux (CAQ, PLQ, PQ, QS, PVQ) comptent trop peu de cas de référence pour être validés, et le Parti conservateur du Québec n'a pas de modèle&nbsp;: sa colonne à zéro dit notre incapacité à le mesurer, pas son absence des médias.</li>
                <li className="apropos-list-item">L'extraction des objets saillants (les personnes, lieux et enjeux qui font une Une) est encore en cours de validation contre des annotations humaines; la méthodologie dit quel extracteur est en service à chaque période.</li>
                <li className="apropos-list-item">Une part de l'écart à la perfection ne tient pas aux modèles mais à l'ambiguïté des catégories elles-mêmes&nbsp;: l'accord entre humains sur les thèmes est de 0,726.</li>
              </ul>
            </section>

            <section>
              <h2 className="apropos-section-title">Le rapport complet</h2>
              <p className="apropos-text">
                Rapport de validation des modèles de la Vitrine, thèmes et partis&nbsp;:
                données, entraînement, performance, calibration. Antoine Lemor, 30 août
                2026, 20 pages, reproductible depuis les journaux d'entraînement.
              </p>
              <p className="apropos-text">
                <a href={RAPPORT} target="_blank" rel="noopener noreferrer" className="metho-btn-lien">Lire le rapport de validation (PDF) ↓</a>
              </p>
            </section>
          </div>

          <aside className="apropos-side-col">
            <p className="apropos-text">
              Les modèles sont entraînés et servis avec{" "}
              <a href="https://github.com/antoinelemor/LLM_Tool" target="_blank" rel="noopener noreferrer" className="apropos-link">LLM Tool</a>,
              l'outil ouvert d'Antoine Lemor. L'infrastructure de données est hébergée
              sur Amazon Web Services.
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
    </div>
  );
}
