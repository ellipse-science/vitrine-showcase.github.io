import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "Équipe — La Vitrine démocratique",
};

// Titres d'équipe (décision d'Adrien, 1er septembre 2026) : doctorant·es et
// postdoctorant·es = Scientifiques de données ; bac et maîtrise = Analystes de
// données. La liste vient de la PR #388 d'Helena Massardier.
type Membre = { nom: string; titre: string; detail?: string; photo: string };
const GROUPES: { titre: string; membres: Membre[] }[] = [
  {
    titre: "Direction",
    membres: [
      { nom: "Yannick Dufresne", titre: "Directeur du CAPP", detail: "Professeur titulaire, Université Laval", photo: "yannick-dufresne" },
      { nom: "Shannon Dinan", titre: "Co-directrice du CAPP", detail: "Professeure agrégée, Université Laval", photo: "shannon-dinan" },
    ],
  },
  {
    titre: "Scientifiques de données",
    membres: [
      { nom: "Antoine Lemor", titre: "Scientifique de données", detail: "Chercheur postdoctoral", photo: "antoine-lemor" },
      { nom: "Marc-Antoine Martel", titre: "Scientifique de données", detail: "Chercheur postdoctoral", photo: "marc-antoine-martel" },
      { nom: "Alexandre Fortier-Chouinard", titre: "Scientifique de données", detail: "Chercheur postdoctoral", photo: "alexandre-fortier-chouinard" },
      { nom: "Adrien Cloutier", titre: "Scientifique de données", detail: "Doctorant", photo: "adrien-cloutier" },
      { nom: "Junior Sagne", titre: "Scientifique de données", detail: "Doctorant", photo: "junior-sagne" },
      { nom: "Laurence-Olivier M. Foisy", titre: "Scientifique de données", detail: "Doctorant", photo: "laurence-olivier-m-foisy" },
      { nom: "Helena Massardier", titre: "Scientifique de données", detail: "Doctorante", photo: "helena-massardier" },
    ],
  },
  {
    titre: "Analystes de données",
    membres: [
      { nom: "Camille Pelletier", titre: "Analyste de données", detail: "Maîtrise", photo: "camille-pelletier" },
      { nom: "Benjamin Carignan", titre: "Analyste de données", detail: "Maîtrise", photo: "benjamin-carignan" },
      { nom: "Étienne Proulx", titre: "Analyste de données", detail: "Maîtrise", photo: "etienne-proulx" },
      { nom: "Jules Piral", titre: "Analyste de données", detail: "Baccalauréat", photo: "jules-piral" },
    ],
  },
  {
    titre: "Ingénierie",
    membres: [
      { nom: "Patrick Poncet", titre: "Développeur et ingénieur de données", photo: "patrick-poncet" },
      { nom: "Hugo Catellier", titre: "Programmeur", photo: "hugo-catellier" },
    ],
  },
  {
    // Les deux ont bâti la première version du projet (fil #02___vitrine,
    // 2-3 septembre 2026, invitation d'Adrien aux « anciens et anciennes »).
    // Même règle de titres que pour l'équipe en place.
    titre: "Anciens membres",
    membres: [
      { nom: "Jérémie Drouin", titre: "Scientifique de données", detail: "Doctorant, Université de Toronto · première version", photo: "jeremie-drouin" },
      { nom: "Jérémy Gilbert", titre: "Analyste de données", detail: "Maîtrise · première version", photo: "jeremy-gilbert" },
    ],
  },
];

/** Une photo n'est affichée que si `public/images/equipe/<slug>.jpg` existe au
 *  build ; sinon un médaillon aux initiales. Déposer les photos suffit. */
function photoSiPresente(slug: string): string | null {
  const rel = `images/equipe/${slug}.jpg`;
  return fs.existsSync(path.join(process.cwd(), "public", rel)) ? `/${rel}` : null;
}
function initiales(nom: string): string {
  return nom.split(/[\s-]+/).filter((m) => /^[A-ZÉ]/.test(m)).map((m) => m[0]).slice(0, 2).join("");
}

export default function EquipePage() {
  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container" data-section="À propos · Équipe">
        <div className="apropos-header">
          <p className="apropos-fil">
            <a href="/apropos/" className="apropos-link">À propos</a> · Équipe
          </p>
          <h1 className="apropos-title">L'équipe</h1>
          <p className="apropos-lead dek-with-cap">
            La Vitrine démocratique est faite par l'équipe du Centre d'analyse des
            politiques publiques de l'Université Laval&nbsp;: des chercheurs en
            science politique, des scientifiques et analystes de
            données, et des ingénieurs qui tiennent l'infrastructure. Voici qui fait
            quoi.
          </p>
        </div>

        <div className="dbl-rule" style={{ margin: "32px 0" }} />

        {GROUPES.map((g) => (
          <section key={g.titre} className="equipe-groupe">
            <h2 className="apropos-section-title">{g.titre}</h2>
            <ul className="equipe-grille">
              {g.membres.map((m) => {
                const photo = photoSiPresente(m.photo);
                return (
                  <li key={m.nom} className="equipe-carte">
                    {photo ? (
                      <img className="equipe-photo" src={photo} alt={m.nom} />
                    ) : (
                      <span className="equipe-photo equipe-photo--initiales" aria-hidden="true">{initiales(m.nom)}</span>
                    )}
                    <span className="equipe-nom">{m.nom}</span>
                    <span className="equipe-titre">{m.titre}</span>
                    {m.detail ? <span className="equipe-detail">{m.detail}</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>
      <IssueReporter />
    </div>
  );
}
