import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RawMaquette } from "@/components/sections/RawMaquette";
import { UneDesUnesSection } from "@/components/sections/UneDesUnesSection";
import { DeuxSolitudesSection } from "@/components/sections/DeuxSolitudesSection";
import { PartisCouvertureSection } from "@/components/sections/PartisCouvertureSection";
import { TreemapSection } from "@/components/sections/TreemapSection";
import { AssembleeSection } from "@/components/sections/AssembleeSection";
import { PolimetrePlusSection } from "@/components/sections/PolimetrePlusSection";
import { EditionNav } from "@/components/interactive/EditionNav";
import { IssueReporter } from "@/components/interactive/IssueReporter";
import { listEditions } from "@/lib/data/headlineEvents";

// ÉDITIONS PASSÉES (#434) — une page pré-rendue par édition du snapshot.
//
// POURQUOI UNE PAGE, ET NON UN ÉCHANGE CÔTÉ CLIENT. Le site est un export
// statique : `headline-events.json` est lu par `fs` au BUILD et n'est jamais
// téléchargé par le navigateur. Recalculer une édition dans le navigateur
// obligerait donc à lui expédier le snapshot entier — 1,3 Mo aujourd'hui, et
// c'est justement ce fichier qu'on veut pouvoir élargir. Pré-rendre garde le
// coût sur la machine de build, où il est gratuit, et donne à chaque édition
// une URL stable — ce que le partage (`app/partage/`) réclamait de toute façon.
//
// PORTÉE : le site entier (arbitrage d'Adrien, 2026-08-10). Une « édition » est
// un moment de la Vitrine, pas une vue d'un module — les six suivent donc.
// Ils ne suivent pas tous à la même finesse, et c'est une propriété de la
// DONNÉE, pas une limite de la page : les modules 1, 2 et 4 sortent de
// l'instantané 4 h et se rejouent au bloc près ; les modules 3, 5 et 6 sont
// publiés au jour ou à la semaine, et se rejouent donc à leur cadence. Le
// bandeau d'archive le dit au lecteur plutôt que de laisser croire à une
// précision qu'on n'a pas.

export const dynamicParams = false;

export async function generateStaticParams() {
  const editions = await listEditions();
  return editions.map((e) => ({ key: e.key }));
}

type Params = { key: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  const edition = (await listEditions()).find((e) => e.key === key);
  if (!edition) return {};

  const title = `${edition.label} — ${edition.dateLabel}`;
  const description =
    `La Vitrine démocratique telle qu'elle était à l'${edition.label.toLowerCase()} ` +
    `du ${edition.dateLabel.toLowerCase()} : Unes saillantes, deux solitudes, partis, ` +
    `enjeux, Assemblée nationale et Polimètre+.`;

  return {
    title: `${title} — La Vitrine démocratique`,
    description,
    openGraph: { type: "article", siteName: "La Vitrine démocratique", title, description, locale: "fr_CA" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EditionPage({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const editions = await listEditions();
  const index = editions.findIndex((e) => e.key === key);
  if (index === -1) notFound();

  const edition = editions[index];
  // `editions` est triée de la plus RÉCENTE à la plus ancienne : l'édition
  // suivante est donc à l'index précédent. L'édition d'index 0 est la courante,
  // servie par l'accueil — « suivante » y renvoie plutôt qu'à sa propre copie.
  const newer = index === 0 ? null : editions[index - 1];
  const older = editions[index + 1] ?? null;

  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      {/* Dire OÙ l'on est, avant de montrer quoi que ce soit. Une archive qui
          ressemble trait pour trait à l'accueil se lit comme l'actualité du
          moment — c'est le mode d'échec à écarter en premier. */}
      <div className="archive-notice" data-section="Bandeau d'archive">
        <p className="archive-notice-line">
          <span className="archive-notice-tag">Édition passée</span>
          <span className="archive-notice-body">
            {/* « à l'édition de minuit du dimanche 9 août » — les six libellés
                de lib/editions.ts commencent tous par « de/du/de la/de l' »,
                le tour tient donc pour les six. */}
            Vous consultez la Vitrine telle qu&apos;elle était à l&apos;
            <strong>{edition.label.toLowerCase()}</strong> du {edition.dateLabel.toLowerCase()}.
          </span>
        </p>
        {/* On ne garde que ce qui SURPREND le lecteur. Qu'un module publié
            chaque jour soit restitué au jour va de soi : le dire tenait de la
            note d'ingénieur, pas de l'information (retour d'Adrien, 10-08).
            L'absence d'illustration, elle, ne va pas de soi — l'image est un
            élément visible du module, et son absence demande une raison. */}
        <p className="archive-notice-aside">
          L&apos;illustration et la musique ne sont pas conservées : elles n&apos;existent que
          pour l&apos;édition courante.
        </p>
        {/* La sortie doit rester sous la main : le bandeau est collant, donc ce
            lien est le seul retour visible une fois qu'on a défilé. */}
        <a className="archive-notice-exit" href="../../">Revenir à l&apos;édition courante</a>
      </div>

      {/* Une ÉDITION, c'est le site entier à un moment donné — les six modules,
          pas seulement la Une des Unes. Les modules 1, 2 et 4 sortent du même
          instantané 4 h et se rejouent au BLOC près ; les modules 3, 5 et 6 sont
          publiés au jour ou à la semaine et se rejouent à leur propre cadence
          (cf. le bandeau ci-dessus, qui le dit au lecteur). */}
      <div id="une-des-unes" data-section="Une des unes">
        <UneDesUnesSection editionKey={edition.key} />
      </div>

      <div id="deux-solitudes" data-section="Deux solitudes">
        <DeuxSolitudesSection editionKey={edition.key} />
      </div>

      <div id="partis-et-couverture" data-section="Partis et couverture">
        <PartisCouvertureSection asOfIso={edition.navDateIso} />
      </div>

      <div id="enjeux-saillants" data-section="Enjeux saillants">
        <TreemapSection editionKey={edition.key} asOfIso={edition.navDateIso} />
      </div>

      <div id="assemblee-nationale" data-section="Assemblée nationale">
        <AssembleeSection asOfIso={edition.navDateIso} />
      </div>

      <div id="polimetre-plus" data-section="Polimètre+">
        <PolimetrePlusSection asOfIso={edition.navDateIso} />
      </div>

      <nav className="archive-pager" aria-label="Naviguer entre les éditions">
        {older
          ? <a className="archive-pager-prev" href={`../${older.key}/`}>← {older.label}, {older.dateLabel.toLowerCase()}</a>
          : <span className="archive-pager-prev is-end">Début de l&apos;archive</span>}
        <a className="archive-pager-home" href="../../">Revenir à l&apos;édition courante</a>
        {newer
          ? <a className="archive-pager-next" href={`../${newer.key}/`}>{newer.label}, {newer.dateLabel.toLowerCase()} →</a>
          : <span className="archive-pager-next is-end">Édition la plus récente</span>}
      </nav>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>

      <EditionNav editions={editions} currentKey={edition.key} />
      <IssueReporter />
    </div>
  );
}
