import type { Metadata } from "next";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";
import { DiscothequeClient } from "@/components/interactive/DiscothequeClient";
import { groupeParAlbums, groupeParDiscographie, singlesParEcoute, loadPochettes } from "@/lib/data/pochettes";
import { formatDateFr } from "@/lib/dates";

export const metadata: Metadata = {
  // garde-redaction: ok (séparateur <title>, exception PR #246)
  title: "La discothèque — La Vitrine démocratique",
};

export const dynamic = "force-static";

// MÊME SORT QUE LE MODULE, à la source. La discothèque était fermée en
// production depuis le 2026-08-20, le temps du rodage de « Partis et
// couverture » ; elle rouvre avec lui.

/**
 * LE FONDS : tout ce que la discothèque a jamais rangé — lu deux façons.
 *
 * Le module, lui, n'en montre qu'un mois glissant, et un seul disque à la fois
 * (le plus écouté). Cette page-ci parcourt l'INVENTAIRE COMPLET, qui vient du
 * listage du bucket : ce qui existe vraiment, jusqu'à la première pochette
 * engendrée. Les journées hors de l'horizon gardent leurs chiffres (le registre
 * les porte) mais pas leurs images.
 *
 * TROIS VUES, LA MÊME TRIADE QUE LE PALMARÈS (Jour / Semaine / Campagne).
 * Jour ne groupe RIEN — depuis le 2026-09-05, chaque single (une pochette, un
 * jour, un parti) s'affiche seul, tous classés en ordre d'écoute plutôt que
 * compilés par journée : c'est la vue la plus fine du fonds. L'ALBUM de sa
 * semaine (samedi à vendredi, jusqu'à sept titres — même semaine que le
 * palmarès, `lib/semaine.ts`) et la DISCOGRAPHIE de la campagne entière, eux,
 * groupent PAR PARTI. Les trois lectures viennent de la MÊME donnée
 * (`singlesParEcoute`/`groupeParAlbums`/`groupeParDiscographie`, dans
 * `lib/data/pochettes.ts`) ; aucune pochette n'est relue ni recalculée pour
 * l'une ou pour l'autre.
 *
 * Aucune reconstitution : ce qui est écrit ici a été calculé le jour même et
 * figé avec la pochette. Une journée où le raffineur n'a pas tourné manque, et
 * c'est la vérité — pas un trou à combler. Une semaine en cours forme donc un
 * album à moins de sept titres, ce qui est exact plutôt qu'incomplet.
 */
export default async function DiscothequePage() {
  const { fonds } = await loadPochettes(formatDateFr);
  const total = fonds.reduce((n, j) => n + j.pochettes.length, 0);
  const servis = fonds.filter((j) => j.servi).length;
  const singles = singlesParEcoute(fonds);
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
            Chaque soir à 20h, chaque parti reçoit sa pochette du jour. Elle
            porte quatre mesures prises ce jour-là&nbsp;: le temps passé à la
            Une, la part du temps total, l’enjeu sur lequel les médias l’ont
            couvert et le ton de cette couverture. L’illustration est générée
            par intelligence artificielle, sous la direction artistique de
            Mathieu Fortin (Anorak Studio). Elle figure cet enjeu, et rend le
            temps de couverture par la densité des formes plutôt que par un
            graphique.
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

            <DiscothequeClient singles={singles} albums={albums} discographies={discographies} />
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
