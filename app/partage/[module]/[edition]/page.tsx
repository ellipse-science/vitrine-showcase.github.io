import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  SHARE_MODULE_SLUGS,
  getShareModuleContent,
  isShareModuleSlug,
  listShareEditions,
  shareEditionLabel,
} from "@/lib/shareModules";

// basePath multi-hôte — même logique que next.config.ts / app/layout.tsx.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function generateStaticParams() {
  const editions = await listShareEditions();
  return SHARE_MODULE_SLUGS.flatMap((module) => editions.map((e) => ({ module, edition: e.key })));
}

type Params = { module: string; edition: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { module, edition: key } = await params;
  if (!isShareModuleSlug(module)) return {};
  const edition = (await listShareEditions()).find((e) => e.key === key);
  if (!edition) return {};

  const { title, description } = await getShareModuleContent(module, edition);
  const stamped = `${title} (${shareEditionLabel(edition)})`;

  return {
    // garde-redaction: ok (séparateur d'onglet, forme commune à toutes les pages du site)
    title: `${stamped} — La Vitrine démocratique`,
    description,
    openGraph: {
      // « article » plutôt que « website » : cette carte annonce un moment daté
      // de la Vitrine, comme app/edition/[key]/page.tsx.
      type: "article",
      siteName: "La Vitrine démocratique",
      title: stamped,
      description,
      locale: "fr_CA",
    },
    twitter: { card: "summary_large_image", title: stamped, description },
  };
}

// Mini-page de déballage d'un module POUR UNE ÉDITION DONNÉE. Elle renvoie
// vers /edition/<clé>/#<module> et non vers l'accueil : le lecteur qui clique
// doit retrouver à l'écran le chiffre qu'il a vu sur la carte, sans quoi
// l'archive publierait une carte que sa propre page contredit.
export default async function ShareEditionPage({ params }: { params: Promise<Params> }) {
  const { module, edition: key } = await params;
  if (!isShareModuleSlug(module)) notFound();
  const edition = (await listShareEditions()).find((e) => e.key === key);
  if (!edition) notFound();

  const { title, description } = await getShareModuleContent(module, edition);
  const target = `${basePath}/edition/${edition.key}/#${module}`;

  return (
    <div style={{ fontFamily: "Georgia, serif", padding: "48px 24px", textAlign: "center" }}>
      <meta httpEquiv="refresh" content={`0; url=${target}`} />
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(target)});` }}
      />
      <p>{title}</p>
      <p>{shareEditionLabel(edition)}</p>
      <p>{description}</p>
      <p>
        <a href={target}>Continuer vers La Vitrine démocratique →</a>
      </p>
    </div>
  );
}
