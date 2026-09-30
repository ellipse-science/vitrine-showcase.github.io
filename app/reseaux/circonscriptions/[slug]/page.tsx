import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { CandidatsCirco, FilCirco } from "@/components/interactive/CircoPage";
import { loadPagesCirco, type SocialData } from "@/lib/data/social";
import { PARTY_COLORS, PARTY_FULL_NAMES, PARTY_KEYS, PARTY_LABELS } from "@/lib/data/parties";

// Une page par circonscription pour le module « Les candidats sur les
// réseaux », comme la démo (rapport_reseaux/circonscription.html) : une carte
// par candidat (comptes, activité, série jour par jour), puis le fil. Tout est lu AU BUILD ; le navigateur ne lit rien.
//
// DEV SEULEMENT, comme le module : en prod, aucune page de circonscription
// n'est générée (et rien n'entre au plan du site, app/sitemap.ts ne les liste
// pas). L'export statique refuse une liste vide : une seule page sentinelle,
// `indisponible`, est alors écrite, et elle rend une 404.

export const dynamicParams = false;
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

const SENTINELLE = "indisponible";

export async function generateStaticParams() {
  const slugs = isProd ? [] : [...(await loadPagesCirco()).keys()];
  return (slugs.length ? slugs : [SENTINELLE]).map((slug) => ({ slug }));
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

        <CandidatsCirco page={page} partiInfo={partiInfo} />
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
