import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export const metadata: Metadata = {
  title: "S'abonner — La Vitrine démocratique",
};

export default function AbonnementPage() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <section
        data-section="Abonnement"
        style={{
          borderTop: "0.5px solid var(--rule)",
          borderBottom: "0.5px solid var(--rule)",
          padding: "80px 0",
          margin: "48px 0",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--cordovan)",
            margin: "0 0 28px",
          }}
        >
          Alertes · S&apos;abonner
        </p>

        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "48px",
            fontWeight: 700,
            letterSpacing: "-0.5px",
            lineHeight: 1.1,
            color: "var(--ink)",
            margin: "0 0 28px",
          }}
        >
          Fonctionnalité
          <br />
          en construction
        </h1>

        <p
          style={{
            fontFamily: "'Source Serif 4', serif",
            fontSize: "19px",
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--ink-soft)",
            lineHeight: 1.45,
            maxWidth: "440px",
            margin: "0 auto 48px",
          }}
        >
          La fonction d&apos;abonnement aux alertes consensus est en
          développement. Revenez bientôt.
        </p>

        <a
          href="/"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--cordovan)",
            textDecoration: "none",
          }}
        >
          ← Retour à la vitrine
        </a>
      </section>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>

      <IssueReporter />
    </div>
  );
}
