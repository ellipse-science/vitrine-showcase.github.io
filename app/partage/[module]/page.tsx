import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SHARE_MODULE_SLUGS, getShareModuleContent, isShareModuleSlug } from "@/lib/shareModules";

// basePath multi-hôte — même logique que next.config.ts / app/layout.tsx :
//   - GitHub Pages : NEXT_PUBLIC_BASE_PATH=/vitrine-showcase.github.io
//   - Cloudflare Pages / dev : ""
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function generateStaticParams() {
  return SHARE_MODULE_SLUGS.map((module) => ({ module }));
}

type Params = { module: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { module } = await params;
  if (!isShareModuleSlug(module)) return {};
  const { title, description } = await getShareModuleContent(module);

  return {
    // metadataBase est hérité de app/layout.tsx (#209) — pas besoin de le
    // redéfinir ici pour résoudre l'URL absolue de opengraph-image.tsx.
    // garde-redaction: ok (séparateur <title>, exception PR #246)
    title: `${title} — La Vitrine démocratique`,
    description,
    openGraph: {
      type: "website",
      siteName: "La Vitrine démocratique",
      title,
      description,
      locale: "fr_CA",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// Mini-page « déballage » (unfurl) : les robots Facebook/X/LinkedIn ne lisent
// que le HTML statique (balises <meta> + opengraph-image.tsx du même
// segment) sans exécuter de JS ni suivre le refresh — ils y voient donc la
// carte propre à ce module. Un humain qui clique est renvoyé aussitôt vers
// l'ancre correspondante sur l'accueil (#199).
export default async function SharePage({ params }: { params: Promise<Params> }) {
  const { module } = await params;
  if (!isShareModuleSlug(module)) notFound();

  const { title, description } = await getShareModuleContent(module);
  const target = `${basePath}/#${module}`;

  return (
    <div style={{ fontFamily: "Georgia, serif", padding: "48px 24px", textAlign: "center" }}>
      {/* Next.js hoiste automatiquement <meta>/<title>/<link> rendus n'importe
          où dans l'arbre vers le <head> du document (React 19) — pas besoin
          d'un <head> explicite, qu'app/layout.tsx fournit déjà une fois. */}
      <meta httpEquiv="refresh" content={`0; url=${target}`} />
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(target)});` }}
      />
      <p>{title}</p>
      <p>{description}</p>
      <p>
        <a href={target}>Continuer vers La Vitrine démocratique →</a>
      </p>
    </div>
  );
}
