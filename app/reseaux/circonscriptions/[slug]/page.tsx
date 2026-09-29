import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { FilCirco, SeriesCirco } from "@/components/interactive/CircoPage";
import { Logo } from "@/components/interactive/SocialClient";
import { loadPagesCirco, NOMS_PLATEFORMES, type SocialData } from "@/lib/data/social";
import { PARTY_COLORS, PARTY_FULL_NAMES, PARTY_KEYS, PARTY_LABELS } from "@/lib/data/parties";

// Une page par circonscription pour le module « Les candidats sur les
// réseaux », comme la démo (rapport_reseaux/circonscription.html) : candidats
// des cinq partis, leurs comptes, une série par candidat, le fil des 20
// dernières publications. Tout est lu AU BUILD ; le navigateur ne lit rien.
//
// DEV SEULEMENT, comme le module : en prod, aucune page n'est générée (et rien
// n'entre au plan du site, app/sitemap.ts ne les liste pas).

export const dynamicParams = false;
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

export async function generateStaticParams() {
  if (isProd) return [];
  return [...(await loadPagesCirco()).keys()].map((slug) => ({ slug }));
}

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const page = (await loadPagesCirco()).get(slug);
  if (!page) return {};
  return {
    // garde-redaction: ok (séparateur <title>, exception PR #246)
    title: `${page.nom} sur les réseaux — La Vitrine démocratique`,
    description: `Les candidats de ${page.nom} sur Facebook, Instagram et TikTok\u00a0: comptes, activité, dernières publications.`,
    robots: { index: false },
  };
}

const partiInfo = Object.fromEntries(
  PARTY_KEYS.map((k) => [k, { sigle: PARTY_LABELS[k], nom: PARTY_FULL_NAMES[k], couleur: PARTY_COLORS[k] }]),
) as SocialData["partiInfo"];
const nombreFr = (n: number) => new Intl.NumberFormat("fr-CA").format(Math.round(n));

export default async function CirconscriptionPage({ params }: { params: Promise<Params> }) {
  if (isProd) notFound();
  const { slug } = await params;
  const page = (await loadPagesCirco()).get(slug);
  if (!page) notFound();

  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container circo-page" data-section="Circonscription">
        <a className="circo-retour" href="../../../#candidats-reseaux">
          ← Les candidats sur les réseaux
        </a>
        <div className="apropos-header">
          <h1 className="apropos-title">{page.nom}</h1>
          <p className="social-meta">{page.region}</p>
        </div>

        <section className="circo-section">
          <h2 className="apropos-section-title">Les candidats et leurs comptes</h2>
          <ul className="circo-candidats">
            {page.candidats.map((c) => (
              <li key={`${c.party}-${c.nom}`}>
                <div className="social-fiche-tete">
                  <span className="social-fiche-parti" style={{ background: partiInfo[c.party].couleur }}>
                    {partiInfo[c.party].sigle}
                  </span>
                  <span className="social-nom">{c.nom}</span>
                </div>
                <div className="social-fiche-comptes">
                  {c.comptes.map((k) => {
                    const contenu = (
                      <>
                        <Logo p={k.plateforme} taille={16} />
                        <span className="visually-hidden">{NOMS_PLATEFORMES[k.plateforme]}</span>
                        {k.abonnes != null ? `${nombreFr(k.abonnes)} abonnés` : "abonnés inconnus"}
                      </>
                    );
                    return k.url ? (
                      <a key={k.plateforme} href={k.url} target="_blank" rel="noopener noreferrer" title={NOMS_PLATEFORMES[k.plateforme]}>
                        {contenu}
                      </a>
                    ) : (
                      <span key={k.plateforme}>{contenu}</span>
                    );
                  })}
                </div>
                <div className="social-meta">
                  {nombreFr(c.publications)}&nbsp;publication{c.publications > 1 ? "s" : ""} · {nombreFr(c.jaime)}
                  &nbsp;j’aime depuis le déclenchement
                </div>
              </li>
            ))}
          </ul>
          {page.sansCompte.length > 0 && (
            <p className="social-note">
              Aucun compte suivi dans cette circonscription pour&nbsp;:{" "}
              {page.sansCompte.map((k) => partiInfo[k].nom).join(", ")}.
            </p>
          )}
        </section>

        <SeriesCirco page={page} partiInfo={partiInfo} />
        <FilCirco page={page} partiInfo={partiInfo} />

        <p className="social-note">
          Comptes publics des candidats des cinq grands partis, relevés chaque jour par la Vitrine démocratique. Module
          expérimental, visible sur le miroir de travail seulement.
        </p>
      </main>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>
    </div>
  );
}
