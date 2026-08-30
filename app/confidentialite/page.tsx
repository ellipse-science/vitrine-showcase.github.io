import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "Confidentialité — La Vitrine démocratique",
  description:
    "Ce que La Vitrine démocratique recueille, ce qu'elle ne recueille pas, et à qui écrire.",
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
            connexion. Le site ne vous demande rien et ne cherche pas à savoir
            qui vous êtes. Cette page décrit ce qui se passe quand même, parce
            qu'afficher une page web n'est jamais tout à fait sans trace.
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
                Le site ne comporte aucun formulaire&nbsp;: il n'y a rien à y
                remplir, donc rien que vous puissiez nous transmettre sans le
                vouloir. Pour nous écrire, il faut passer par le courriel, ce
                qui reste votre décision.
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
              <h2 className="apropos-section-title">Durées de conservation</h2>
              <p className="apropos-text">
                Les mesures d'audience sont agrégées et conservées par
                Cloudflare selon ses propres délais. Elles ne permettent pas de
                remonter à une personne.
              </p>
              <p className="apropos-text">
                Le site a comporté, jusqu'au 20 août 2026, un formulaire de
                signalement dont les envois étaient publiés dans notre dépôt de
                code ouvert. Il a été retiré des pages publiques et ne sert plus
                qu'à l'équipe. Les signalements transmis avant cette date restent
                visibles dans ce dépôt; écrivez-nous pour en faire retirer
                un.
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
                d'en demander le retrait. En pratique, la consultation du site ne
                nous apprend rien qui permette de vous identifier, et nous ne
                détenons donc rien à vous montrer.
              </p>
              <p className="apropos-text">
                Pour toute question sur cette page, ou pour faire retirer un
                signalement transmis avant le 20 août 2026, écrivez à{" "}
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

          <div className="apropos-side-col">
            <section>
              <h2 className="apropos-section-title">L'essentiel</h2>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5" }}
              >
                Pas de compte, pas de témoin de connexion, pas de publicité, pas
                de profil publicitaire, pas de formulaire. Nous comptons les
                pages lues, jamais les personnes qui les lisent.
              </p>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5", marginTop: "16px" }}
              >
                Deux services extérieurs voient passer votre adresse IP du seul
                fait que la page s'affiche&nbsp;: Cloudflare, qui héberge le
                site, et Google, qui fournit les polices de caractères.
              </p>
              <p
                className="apropos-text"
                style={{ fontSize: "15px", lineHeight: "1.5", marginTop: "16px" }}
              >
                Une question?
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
