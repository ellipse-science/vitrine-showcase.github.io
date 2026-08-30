import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RawMaquette } from "@/components/sections/RawMaquette";
import { IssueReporter } from "@/components/interactive/IssueReporter";
import { loadPochettes } from "@/lib/data/pochettes";
import { SANS_ENJEU } from "@/lib/data/parties";
import { formatDateFr } from "@/lib/dates";
import { formatDuree } from "@/lib/duree";

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
 * LE FONDS : tout ce que la discothèque a jamais rangé.
 *
 * Le module, lui, n'en montre qu'un mois glissant — c'est ce que le build
 * rapatrie en images. Cette page-ci parcourt l'INVENTAIRE COMPLET, qui vient du
 * listage du bucket : ce qui existe vraiment, jusqu'à la première pochette
 * engendrée. Les journées hors de l'horizon gardent leurs chiffres (le registre
 * les porte) mais pas leurs images.
 *
 * Aucune reconstitution : ce qui est écrit ici a été calculé le jour même et
 * figé avec la pochette. Une journée où le raffineur n'a pas tourné manque, et
 * c'est la vérité — pas un trou à combler.
 */
export default async function DiscothequePage() {
  if (isProd) notFound();

  const { fonds } = await loadPochettes(formatDateFr);
  const total = fonds.reduce((n, j) => n + j.pochettes.length, 0);
  const servis = fonds.filter((j) => j.servi).length;

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

            <ol className="fonds-jours">
              {fonds.map((jour) => (
                <li className="fonds-jour" key={jour.jour}>
                  <p className="fonds-date">
                    {jour.jourLabel}
                    {!jour.servi && <span className="fonds-hors">conservée, non servie</span>}
                  </p>
                  <ol className="fonds-pochettes">
                    {jour.pochettes.map((p) => (
                      <li
                        className="fonds-pochette"
                        key={p.parti}
                        style={{ ["--party" as string]: p.couleur }}
                      >
                        <span className="fonds-sigle">{p.sigle}</span>
                        {p.chiffres ? (
                          <>
                            <span className="fonds-temps">
                              {p.tempsLabel || formatDuree(p.minutesUne)}
                            </span>
                            {/* Un enjeu absent est une AFFIRMATION sur la
                                mesure de ce jour-là (aucun modèle CAP n'a
                                franchi son seuil), pas une donnée manquante :
                                on le dit avec les mots du module plutôt qu'avec
                                un tiret. Le ton, lui, est toujours écrit quand
                                les chiffres existent ; sans lui, on n'affiche
                                rien. */}
                            <span className="fonds-enjeu">{p.enjeu ?? SANS_ENJEU}</span>
                            {p.ton && <span className="fonds-ton">{p.ton}</span>}
                          </>
                        ) : (
                          /* Le listage atteste que la pochette existe, le
                             registre l'ignore encore. On la montre sans ses
                             chiffres plutôt que de la cacher. */
                          <span className="fonds-sans-chiffres">chiffres non inscrits</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
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
