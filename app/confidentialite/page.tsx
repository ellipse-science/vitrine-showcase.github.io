import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "Confidentialité — La Vitrine démocratique",
  description:
    "Ce que La Vitrine démocratique recueille, ce qu'elle ne recueille pas, et ce qui arrive à un signalement.",
};

export default function ConfidentialitePage() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container" data-section="Confidentialité">
        <div className="apropos-header">
          <h1 className="apropos-title">Confidentialité</h1>
          <p className="apropos-lead dek-with-cap">
            La Vitrine démocratique se consulte sans compte et sans témoin de
            connexion. Le site ne cherche pas à savoir qui vous êtes. Cette page
            décrit ce qui se passe quand même, parce qu'afficher une page web
            n'est jamais tout à fait sans trace, et ce qu'il advient d'un
            signalement si vous en envoyez un.
          </p>
        </div>

        <div className="dbl-rule" style={{ margin: "32px 0" }} />

        <div className="apropos-grid">
          <div className="apropos-main-col">
            <section>
              <h2 className="apropos-section-title">Ce que le site ne fait pas</h2>
              <p className="apropos-text">
                Aucun compte, aucune inscription, aucun mot de passe. Aucun
                témoin de connexion n'est déposé. Aucune publicité, aucun
                traceur publicitaire, aucune revente de données. Aucun profil
                vous suivant d'un site à l'autre.
              </p>
              <p className="apropos-text">
                Rien n'est conservé dans votre navigateur, sauf une copie locale
                des pages déjà consultées, qui permet de continuer à lire hors
                ligne. Cette copie reste sur votre appareil et ne nous est
                jamais transmise. Vider les données du site l'efface.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">
                Ce qui se passe quand vous consultez le site
              </h2>
              <p className="apropos-text">
                <strong>Hébergement.</strong> Le site est servi par Cloudflare.
                Livrer une page suppose de traiter votre adresse IP et quelques
                renseignements techniques sur la requête (type de navigateur,
                date, page demandée). C'est nécessaire à l'affichage et à la
                protection contre les attaques.
              </p>
              <p className="apropos-text">
                <strong>Mesure d'audience.</strong> Le site utilise Cloudflare
                Web Analytics, qui compte les pages consultées sans déposer de
                témoin et sans constituer de profil individuel. Nous savons
                combien de personnes lisent la Vitrine, jamais qui elles sont.
              </p>
              <p className="apropos-text">
                <strong>Polices de caractères.</strong> La typographie du site
                est chargée depuis Google Fonts. Votre navigateur contacte donc
                les serveurs de Google, ce qui leur communique votre adresse IP.
                C'est une dépendance que nous assumons pour l'instant et que
                nous pourrions retirer en hébergeant les polices nous-mêmes.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">
                Si vous signalez un problème
              </h2>
              <p className="apropos-text">
                Le formulaire «&nbsp;Signaler un problème&nbsp;» est le seul
                endroit où le site recueille ce que vous écrivez. Il transmet le
                nom que vous inscrivez (vous pouvez le laisser vide), votre
                description, la section concernée, et l'image que vous joignez
                le cas échéant.
              </p>
              <p
                className="apropos-text"
                style={{
                  borderLeft: "2px solid var(--cordovan)",
                  paddingLeft: "14px",
                }}
              >
                <strong>
                  Un signalement devient public. Écrivez-le en le sachant.
                </strong>{" "}
                Il est publié comme fiche de suivi dans notre dépôt de code
                ouvert, sur GitHub&nbsp;: le nom et la description y sont
                visibles de tous. Une image jointe est déposée dans ce même
                dépôt public. La description passe aussi par un service
                d'intelligence artificielle (OpenAI) qui la met en forme.
                N'y inscrivez donc aucun renseignement personnel ou
                confidentiel, ni le vôtre, ni celui d'autrui.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Durées de conservation</h2>
              <p className="apropos-text">
                Les signalements demeurent tant que le dépôt public existe. Un
                dépôt de code garde son historique&nbsp;: une image déposée peut
                y subsister même après la fermeture de la fiche.
              </p>
              <p className="apropos-text">
                Les mesures d'audience sont agrégées et conservées par
                Cloudflare selon ses propres délais. Elles ne permettent pas de
                remonter à une personne.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">L'application mobile</h2>
              <p className="apropos-text">
                L'application iOS affiche ce même site et n'ajoute aucune
                collecte&nbsp;: ni compte, ni notification, ni identifiant
                publicitaire. Sa tuile d'écran d'accueil lit deux petits
                fichiers publics, les mêmes que ceux servis à tout le monde. Ce
                qui est décrit plus haut vaut donc aussi dans l'application.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Vos droits</h2>
              <p className="apropos-text">
                La Loi&nbsp;25 vous donne un droit d'accès et de rectification
                sur les renseignements personnels vous concernant, et le droit
                d'en demander le retrait. En pratique, la seule chose que nous
                puissions détenir sur vous est un signalement que vous nous avez
                envoyé.
              </p>
              <p className="apropos-text">
                Pour consulter, corriger ou faire retirer un signalement, ou
                pour toute question sur cette page, écrivez à{" "}
                <a href="mailto:capp@ulaval.ca" className="apropos-link">
                  capp@ulaval.ca
                </a>
                . Nous répondons dans les meilleurs délais.
              </p>
              <p className="apropos-text">
                La Vitrine démocratique est produite par le Centre d'analyse des
                politiques publiques (CAPP) de l'Université Laval. Les demandes
                relevant du cadre institutionnel de l'Université peuvent être
                acheminées par la même adresse, qui les redirigera.
              </p>
            </section>

            <section>
              <h2 className="apropos-section-title">Modifications</h2>
              <p className="apropos-text">
                Cette page évolue avec le site. Les changements importants sont
                consignés dans le{" "}
                <a href="journal/" className="apropos-link">
                  journal des mises à jour
                </a>
                .
              </p>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5" }}
              >
                Dernière mise à jour&nbsp;: 30 août 2026.
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
