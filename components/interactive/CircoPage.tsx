"use client";

import { useState } from "react";
import type { PartyKey } from "@/lib/data/parties";
import { NOMS_PLATEFORMES, PLATEFORMES, type CandidatPage, type PageCirco, type Plateforme, type SocialData } from "@/lib/data/social-meta";
import { CartePublication, Logo } from "@/components/interactive/SocialClient";
import { MONTHS_FR } from "@/lib/dates";

// Page d'une circonscription du module « Les candidats sur les réseaux » :
// les parties qui bougent (séries, fil filtrable, lecteur vidéo). Tout le reste
// est rendu au build par la page serveur.

const nombreFr = (n: number) => new Intl.NumberFormat("fr-CA").format(Math.round(n));
const jourCourt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_FR[Number(iso.slice(5, 7)) - 1]}`;

type MesureSerie = "publications" | "jaime";

/** Une petite série par candidat : barres par jour depuis le 1er août, même
 *  échelle pour tous (comparables d'un coup d'œil), trait pointillé au
 *  déclenchement. Masquée tant que la table des séries n'est pas publiée. */
export function SeriesCirco({
  page,
  partiInfo,
}: {
  page: PageCirco;
  partiInfo: SocialData["partiInfo"];
}) {
  const [mesure, setMesure] = useState<MesureSerie>("publications");
  const avecSerie = page.candidats.filter((c): c is CandidatPage & { serie: NonNullable<CandidatPage["serie"]> } => !!c.serie);
  if (avecSerie.length === 0 || page.jours.length === 0) return null;
  const max = Math.max(1, ...avecSerie.flatMap((c) => c.serie.map((j) => j[mesure])));
  const n = page.jours.length;
  const iCampagne = page.jours.indexOf(page.campagne);
  const mois = page.jours.flatMap((j, i) => (j.endsWith("-01") ? [{ i, m: MONTHS_FR[Number(j.slice(5, 7)) - 1] }] : []));
  return (
    <section className="circo-section">
      <div className="circo-section-tete">
        <h2 className="apropos-section-title">Jour après jour</h2>
        <div className="social-bascule" role="group" aria-label="Mesure des séries">
          {(
            [
              ["publications", "Publications"],
              ["jaime", "J’aime"],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              type="button"
              key={cle}
              aria-pressed={mesure === cle}
              className={mesure === cle ? "active" : undefined}
              onClick={() => setMesure(cle)}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>
      <p className="social-sous-titre">
        {mesure === "publications" ? "Publications" : "J’aime reçus"} par jour depuis le 1er&nbsp;août, même échelle pour
        tous ; le pointillé marque le déclenchement des élections.
      </p>
      <div className="circo-series">
        {avecSerie.map((c) => {
          const total = c.serie.reduce((t, j) => t + j[mesure], 0);
          return (
            <figure key={`${c.party}-${c.nom}`} className="circo-serie">
              <figcaption>
                <span className="circo-sigle" style={{ background: partiInfo[c.party].couleur }}>
                  {partiInfo[c.party].sigle}
                </span>
                <span>{c.nom}</span>
                <span className="social-meta">{nombreFr(total)}</span>
              </figcaption>
              <svg
                viewBox={`0 0 ${n} 40`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`${c.nom} : ${nombreFr(total)} ${mesure === "publications" ? "publications" : "j’aime"} depuis le 1er août`}
              >
                {c.serie.map((j, i) =>
                  j[mesure] > 0 ? (
                    <rect
                      key={j.jour}
                      x={i + 0.12}
                      width={0.76}
                      y={40 - (38 * j[mesure]) / max}
                      height={(38 * j[mesure]) / max}
                      fill={partiInfo[c.party].couleur}
                    >
                      <title>{`${jourCourt(j.jour)} : ${nombreFr(j[mesure])}`}</title>
                    </rect>
                  ) : null,
                )}
                {iCampagne >= 0 && (
                  <line x1={iCampagne} x2={iCampagne} y1={0} y2={40} className="circo-declenchement" vectorEffect="non-scaling-stroke" />
                )}
              </svg>
              <div className="circo-mois" aria-hidden="true">
                {mois.map(({ i, m }) => (
                  <span key={i} style={{ left: `${(100 * i) / n}%` }}>
                    {m}
                  </span>
                ))}
              </div>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

/** Le fil des 20 dernières publications, filtrable par plateforme et par parti. */
export function FilCirco({ page, partiInfo }: { page: PageCirco; partiInfo: SocialData["partiInfo"] }) {
  const [plateformes, setPlateformes] = useState<Plateforme[]>([...PLATEFORMES]);
  const presentes = PLATEFORMES.filter((p) => page.fil.some((x) => x.plateforme === p));
  const partis = [...new Set(page.fil.map((x) => x.party))] as PartyKey[];
  const [actifs, setActifs] = useState<PartyKey[]>(partis);
  const fil = page.fil.filter((x) => plateformes.includes(x.plateforme) && actifs.includes(x.party));
  const bascule = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
  return (
    <section className="circo-section">
      <h2 className="apropos-section-title">Leurs dernières publications</h2>
      {page.fil.length === 0 ? (
        <p className="social-note">Aucune publication récente de ces candidats.</p>
      ) : (
        <>
          <div className="social-coches circo-filtres">
            <div role="group" aria-label="Plateformes">
              {presentes.map((p) => (
                <button
                  type="button"
                  key={p}
                  aria-pressed={plateformes.includes(p)}
                  aria-label={NOMS_PLATEFORMES[p]}
                  title={NOMS_PLATEFORMES[p]}
                  className={plateformes.includes(p) ? "actif" : undefined}
                  onClick={() => setPlateformes(bascule(plateformes, p))}
                >
                  <Logo p={p} taille={15} />
                </button>
              ))}
              {partis.map((k) => (
                <button
                  type="button"
                  key={k}
                  aria-pressed={actifs.includes(k)}
                  className={actifs.includes(k) ? "actif" : undefined}
                  style={actifs.includes(k) ? { background: partiInfo[k].couleur, borderColor: partiInfo[k].couleur } : undefined}
                  onClick={() => setActifs(bascule(actifs, k))}
                >
                  {partiInfo[k].sigle}
                </button>
              ))}
            </div>
          </div>
          {fil.length === 0 ? (
            <p className="social-note">Aucune publication dans cette sélection.</p>
          ) : (
            <ol className="social-palmares">
              {fil.map((p, i) => (
                <CartePublication key={`${p.url ?? ""}-${i}`} partiInfo={partiInfo} p={p} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
