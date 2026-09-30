import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { CarteCandidat, FilCirco } from "@/components/interactive/CircoPage";
import { loadPagesCandidats, NOMS_PLATEFORMES, type SocialData } from "@/lib/data/social";
import { PARTY_COLORS, PARTY_FULL_NAMES, PARTY_KEYS, PARTY_LABELS } from "@/lib/data/parties";

// Une page par candidature officielle (table social_candidats du raffineur
// agora-social) pour le module « Les candidats sur les réseaux » : la carte du
// candidat en grand (comptes, activité, série depuis le 1er août), puis son fil
// depuis le déclenchement. Son fil est celui de sa circonscription restreint à
// son parti : aucun fichier de plus, « Voir plus » relit
// reseaux/fil-complet/<code>.json. Tout est lu AU BUILD.
//
// DEV SEULEMENT, comme les pages de circonscription : en prod, aucune page
// (et rien au plan du site, app/sitemap.ts ne les liste pas). L'export statique
// refuse une liste vide : une seule page sentinelle, `indisponible`, rend alors
// une 404.

export const dynamicParams = false;
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const SENTINELLE = "indisponible";

export async function generateStaticParams() {
  const slugs = isProd ? [] : [...(await loadPagesCandidats()).keys()];
  return (slugs.length ? slugs : [SENTINELLE]).map((slug) => ({ slug }));
}

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const page = isProd ? undefined : (await loadPagesCandidats()).get(slug);
  if (!page) return {};
  return {
    // garde-redaction: ok (séparateur <title>, exception PR #246)
    title: `${page.candidat.nom} sur les réseaux — La Vitrine démocratique`,
    description: `${page.candidat.nom} (${PARTY_LABELS[page.candidat.party]}, ${page.circo.nom}) sur Facebook, Instagram et TikTok : comptes, activité, publications.`,
    robots: { index: false },
  };
}

const partiInfo = Object.fromEntries(
  PARTY_KEYS.map((k) => [k, { sigle: PARTY_LABELS[k], nom: PARTY_FULL_NAMES[k], couleur: PARTY_COLORS[k] }]),
) as SocialData["partiInfo"];

export default async function CandidatPage({ params }: { params: Promise<Params> }) {
  if (isProd) notFound();
  const { slug } = await params;
  const page = (await loadPagesCandidats()).get(slug);
  if (!page) notFound();
  const c = page.candidat;
  const max = Math.max(1, ...(c.serie ?? []).map((j) => j.jaime));

  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="apropos-container circo-page candidat-page" data-section="Candidat">
        <a className="circo-retour" href="../../../#candidats-reseaux">
          ← Les candidats sur les réseaux
        </a>
        <div className="apropos-header">
          <h1 className="apropos-title">{c.nom}</h1>
          <p className="candidat-sous-titre">
            <span className="social-fiche-parti" style={{ background: PARTY_COLORS[c.party] }}>
              {PARTY_LABELS[c.party]}
            </span>{" "}
            {PARTY_FULL_NAMES[c.party]} · candidature dans{" "}
            <a href={`${BASE_PATH}/reseaux/circonscriptions/${page.circo.slug}/`}>{page.circo.nom}</a>
            <span className="social-meta">{page.circo.region}</span>
          </p>
          {c.comptes.some((k) => k.url) && (
            <ul className="candidat-profils" aria-label="Ses comptes">
              {c.comptes.flatMap((k) =>
                k.url
                  ? [
                      <li key={k.plateforme}>
                        <a href={k.url} target="_blank" rel="noopener noreferrer">
                          {NOMS_PLATEFORMES[k.plateforme]}
                        </a>
                      </li>,
                    ]
                  : [],
              )}
            </ul>
          )}
        </div>

        {page.rang != null && (
          <p className="candidat-rang">
            {page.rang === 1 ? "1er" : `${page.rang}e`} sur {page.nbActifs} dans sa circonscription, en j’aime depuis le
            déclenchement.
          </p>
        )}
        <ul className="circo-cartes candidat-carte">
          <CarteCandidat
            c={c}
            partiInfo={partiInfo}
            rang={page.rang}
            nbActifs={page.nbActifs}
            jours={page.jours}
            campagne={page.campagne}
            max={max}
            grand
          />
        </ul>

        {c.comptes.length > 0 && (
          <FilCirco
            page={{ fil: page.fil, total: page.total, complet: page.complet, code: page.circo.code }}
            partiInfo={partiInfo}
            party={c.party}
            titre="Ses publications"
          />
        )}

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
