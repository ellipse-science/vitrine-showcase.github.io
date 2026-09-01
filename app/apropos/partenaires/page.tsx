import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "Partenaires — La Vitrine démocratique",
};

const PARTENAIRES = [
  { nom: "Chaire sur la démocratie, le vivre-ensemble et les valeurs communes au Québec", url: "https://chaireduquebec-citoyennete.ca/", logo: "/images/partners/ChaireQuebecCitoyennete.png" },
  { nom: "CLESSN, Chaire de leadership en enseignement des sciences sociales numériques", url: "https://clessn.com/", logo: "/images/partners/CLESSN-nobg.png", grand: true },
  { nom: "Université Laval", url: "https://www.ulaval.ca/", logo: "/images/partners/ULaval.png" },
  { nom: "Cégep Garneau", url: "https://www.cegepgarneau.ca/", logo: "/images/partners/cegepgarneau-nobg.png" },
  { nom: "Centre pour l'étude de la citoyenneté démocratique (CSDC-CECD)", url: "https://csdc-cecd.ca/", logo: "/images/partners/CECD-nobg.png" },
  { nom: "Groupe de recherche en communication politique (GRCP)", url: "https://www.grcp.ulaval.ca/", logo: "/images/partners/GRCP-nobg.png" },
  { nom: "Unicorne", url: "https://www.unicorne.cloud/", logo: "/images/partners/Unicorne.png" },
  { nom: "Infoscope", url: "https://www.infoscope.ca/", logo: "/images/partners/Infoscope-nobg.png" },
  { nom: "LLM Tool", url: "https://github.com/antoinelemor/LLM_Tool", logo: "/images/partners/llm-tool.png" },
  { nom: "Amazon Web Services", url: "https://aws.amazon.com/", logo: "/images/partners/aws.svg" },
];

export default function PartenairesPage() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container" data-section="À propos · Partenaires">
        <div className="apropos-header">
          <p className="apropos-fil">
            <a href="/apropos/" className="apropos-link">À propos</a> · Partenaires
          </p>
          <h1 className="apropos-title">Partenaires</h1>
          <p className="apropos-lead dek-with-cap">
            La Vitrine démocratique existe grâce à des partenaires qui partagent une
            même conviction&nbsp;: la démocratie se comprend mieux quand on la mesure
            avec rigueur, en toute transparence, et qu'on rend cette mesure à tout le
            monde. Merci à chacun d'eux. Les institutions financent et hébergent la
            recherche, les centres et groupes de recherche lui donnent ses questions et
            ses méthodes, les partenaires technologiques lui donnent ses outils et son
            infrastructure.
          </p>
        </div>

        <div className="dbl-rule" style={{ margin: "32px 0" }} />

        <div className="partners-grid partners-grid--grand">
          {PARTENAIRES.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="partner-carte" aria-label={p.nom}>
              <img className={`partner-logo partner-logo--grand${p.grand ? " partner-logo--clessn" : ""}`} src={p.logo} alt={p.nom} />
              <span className="partner-nom">{p.nom}</span>
            </a>
          ))}
        </div>
      </main>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>
      <IssueReporter />
    </div>
  );
}
