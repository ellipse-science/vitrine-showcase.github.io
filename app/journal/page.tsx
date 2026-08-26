import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";
import changelog from "@/static-content/changelog.json";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "Journal des mises à jour — La Vitrine démocratique",
};

// Une entrée = une PR mergée dans main. Le fichier static-content/changelog.json
// est alimenté automatiquement au merge par .github/workflows/version-bump.yml
// (note tirée de la section « Note de journal » du template de PR).
type Entry = {
  pr: number;
  date: string; // ISO 8601 (moment du merge, UTC)
  note: string;
  version: string | null; // version après bump, null si la PR n'a pas de label semver:*
};

const REPO_URL = "https://github.com/ellipse-science/vitrine-showcase.github.io";

const dayFmt = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  timeZone: "America/Montreal",
});

const monthFmt = new Intl.DateTimeFormat("fr-CA", {
  month: "long",
  year: "numeric",
  timeZone: "America/Montreal",
});

// Clé de regroupement stable (année-mois en heure de Montréal).
const monthKeyFmt = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  timeZone: "America/Montreal",
});

// « 2.5.0-beta.0 » → « v2.5.0 (b0) » — variante compacte du format du footer.
function chipVersion(version: string): string {
  const [core, pre] = version.split("-");
  const beta = pre?.match(/^beta\.(\d+)$/);
  return beta ? `v${core} (b${beta[1]})` : `v${core}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function JournalPage() {
  const entries = changelog as Entry[];

  // Regroupe par mois (les entrées sont déjà triées de la plus récente à la
  // plus ancienne dans le fichier).
  const months: { key: string; label: string; items: Entry[] }[] = [];
  for (const entry of entries) {
    const d = new Date(entry.date);
    const key = monthKeyFmt.format(d);
    const last = months[months.length - 1];
    if (last && last.key === key) {
      last.items.push(entry);
    } else {
      months.push({ key, label: capitalize(monthFmt.format(d)), items: [entry] });
    }
  }

  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="journal-container" data-section="Journal">
        <div className="journal-header">
          <h1 className="journal-title">Journal des mises à jour</h1>
          <p className="journal-lead dek-with-cap">
            La Vitrine démocratique s&rsquo;améliore en continu. Chaque entrée de ce
            journal correspond à une modification intégrée au site&nbsp;: ce qu&rsquo;elle
            change, en langage simple, et le moment où elle a été mise en ligne.
            Pour le détail technique, chaque entrée pointe vers la contribution
            correspondante sur GitHub.
          </p>
        </div>

        <div className="dbl-rule" style={{ margin: "32px 0" }} />

        {months.map((month) => (
          <section key={month.key} className="journal-month">
            <h2 className="journal-month-title">{month.label}</h2>
            <ol className="journal-list">
              {month.items.map((entry) => (
                <li key={entry.pr} className="journal-entry">
                  <div className="journal-entry-meta">
                    <span className="journal-entry-date">
                      {dayFmt.format(new Date(entry.date))}
                    </span>
                    {entry.version && (
                      <span className="journal-entry-version">
                        {chipVersion(entry.version)}
                      </span>
                    )}
                  </div>
                  <div className="journal-entry-body">
                    <p className="journal-entry-note">{entry.note}</p>
                    <a
                      className="journal-entry-link"
                      href={`${REPO_URL}/pull/${entry.pr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {`PR #${entry.pr} sur GitHub →`}
                    </a>
                  </div>
                </li>
              ))}
            </ol>
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
