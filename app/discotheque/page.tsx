import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";
import { DiscothequeClient } from "@/components/interactive/DiscothequeClient";
import { groupeParAlbums, groupeParDiscographie, groupeParEditions, loadPochettes } from "@/lib/data/pochettes";
import { formatDateFr } from "@/lib/dates";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "La discothèque — La Vitrine démocratique",
};

export const dynamic = "force-static";

// MÊME GARDE QUE LE MODULE, à la source. « Partis et couverture » est retiré de
// la production depuis le 2026-08-20, le temps du rodage ; sa discothèque n'a
// aucune raison d'y être accessible par une adresse devinée. Elle est aussi
// absente du plan du site : rien ne doit y mener tant que le module lui-même
// n'est pas public.
const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "prod";

/**
 * LE FONDS : tout ce que la discothèque a jamais rangé — lu deux façons.
 *
 * Le module, lui, n'en montre qu'un mois glissant, et un seul disque à la fois
 * (le plus écouté). Cette page-ci parcourt l'INVENTAIRE COMPLET, qui vient du
 * listage du bucket : ce qui existe vraiment, jusqu'à la première pochette
 * engendrée. Les journées hors de l'horizon gardent leurs chiffres (le registre
 * les porte) mais pas leurs images.
 *
 * TROIS VUES, LA MÊME TRIADE QUE LE PALMARÈS (Jour / Semaine / Campagne),
 * depuis le 2026-09-01 : chaque single (une pochette, un jour, un parti)
 * rejoint l'ÉDITION de sa journée (les cinq partis, une compilation plutôt
 * qu'un album), l'ALBUM de sa semaine (samedi à vendredi, jusqu'à sept titres —
 * même semaine que le palmarès, `lib/semaine.ts`), ou la DISCOGRAPHIE de la
 * campagne entière. Les trois groupages viennent de la MÊME donnée
 * (`groupeParEditions`/`groupeParAlbums`/`groupeParDiscographie`, dans
 * `lib/data/pochettes.ts`) ; aucune pochette n'est relue ni recalculée pour
 * l'un ou pour l'autre.
 *
 * Aucune reconstitution : ce qui est écrit ici a été calculé le jour même et
 * figé avec la pochette. Une journée où le raffineur n'a pas tourné manque, et
 * c'est la vérité — pas un trou à combler. Une semaine en cours forme donc un
 * album à moins de sept titres, ce qui est exact plutôt qu'incomplet.
 */
export default async function DiscothequePage() {
  if (isProd) notFound();

  const { fonds } = await loadPochettes(formatDateFr);
  const total = fonds.reduce((n, j) => n + j.pochettes.length, 0);
  const servis = fonds.filter((j) => j.servi).length;
  const editions = groupeParEditions(fonds, formatDateFr);
  const albums = groupeParAlbums(fonds, formatDateFr);
  const discographies = groupeParDiscographie(fonds);

  return (
    <div className="page">
      <div data-section="En-tête">
        <RawMaquette chunk="top" />
      </div>

      <main className="fonds-container" data-section="Discothèque">
        <div className="fonds-header">
          <h1 className="fonds-title">La discothèque</h1>
          <p className="fonds-lead dek-with-cap">
            Chaque jour, à 20h, la pochette de chaque parti est figée telle
            qu’elle est à ce moment-là et rejoint le fonds. Ce qu’on lit ici a
            été mesuré le jour même&nbsp;: ce n’est pas une reconstitution.
          </p>
        </div>

        {fonds.length === 0 ? (
          <p className="fonds-vide">
            Le fonds est vide&nbsp;: aucune pochette n’a encore été rangée.
          </p>
        ) : (
          <>
            <p className="fonds-compte">
              {fonds.length === 1 ? "1 journée" : `${fonds.length} journées`} conservées,{" "}
              {total === 1 ? "1 pochette" : `${total} pochettes`}. Les{" "}
              {servis === 1 ? "images de la dernière journée sont" : `images des ${servis} dernières journées sont`}{" "}
              affichées&nbsp;; au-delà, les pochettes restent conservées mais ne
              sont plus servies par le site.
            </p>

            <DiscothequeClient editions={editions} albums={albums} discographies={discographies} />
          </>
        )}
      </main>

      <div data-section="Pied de page">
        <RawMaquette chunk="bottom" />
      </div>

      <IssueReporter />
    </div>
  );
}
