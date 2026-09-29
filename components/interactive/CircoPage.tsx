"use client";

import { useState } from "react";
import type { PartyKey } from "@/lib/data/parties";
import {
  NOMS_PLATEFORMES,
  nombreFr,
  PLATEFORMES,
  type CandidatPage,
  type FilItem,
  type PageCirco,
  type Plateforme,
  type SocialData,
} from "@/lib/data/social-meta";
import { CartePublication, Logo } from "@/components/interactive/SocialClient";
import { MONTHS_FR } from "@/lib/dates";

// Page d'une circonscription du module « Les candidats sur les réseaux » :
// les parties qui bougent (séries, fil filtrable, lecteur vidéo). Tout le reste
// est rendu au build par la page serveur.

const jourCourt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_FR[Number(iso.slice(5, 7)) - 1]}`;

type MesureSerie = "publications" | "jaime";

/** Les candidats de la circonscription, une carte chacun : parti et nom, ses
 *  comptes (logo, abonnés, lien vers le profil), son activité depuis le
 *  déclenchement et sa série jour par jour. La bascule Publications / J'aime
 *  agit sur toutes les séries, à la même échelle. Un parti sans compte suivi
 *  garde sa carte. */
export function CandidatsCirco({
  page,
  partiInfo,
}: {
  page: PageCirco;
  partiInfo: SocialData["partiInfo"];
}) {
  const [mesure, setMesure] = useState<MesureSerie>("publications");
  const avecSerie = page.jours.length > 0 && page.candidats.some((c) => c.serie);
  const max = Math.max(1, ...page.candidats.flatMap((c) => (c.serie ?? []).map((j) => j[mesure])));
  const n = page.jours.length;
  const iCampagne = page.jours.indexOf(page.campagne);
  const mois = page.jours.flatMap((j, i) => (j.endsWith("-01") ? [{ i, m: MONTHS_FR[Number(j.slice(5, 7)) - 1] }] : []));
  const unite = mesure === "publications" ? "publications" : "j’aime";
  return (
    <section className="circo-section">
      <div className="circo-section-tete">
        <h2 className="apropos-section-title">Les candidats</h2>
        {avecSerie && (
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
        )}
      </div>
      {avecSerie && (
        <p className="social-sous-titre">
          {mesure === "publications" ? "Publications" : "J’aime reçus"} par jour depuis le 1er&nbsp;août, même échelle
          pour tous ; le pointillé marque le déclenchement des élections.
        </p>
      )}
      <ul className="circo-cartes">
        {page.candidats.map((c) => {
          const total = (c.serie ?? []).reduce((t, j) => t + j[mesure], 0);
          return (
            <li key={`${c.party}-${c.nom}`} className="circo-carte">
              <div className="social-fiche-tete">
                <span className="social-fiche-parti" style={{ background: partiInfo[c.party].couleur }}>
                  {partiInfo[c.party].sigle}
                </span>
                <span className="social-nom">{c.nom}</span>
              </div>
              <ul className="circo-comptes">
                {c.comptes.map((k) => {
                  const contenu = (
                    <>
                      <Logo p={k.plateforme} taille={15} />
                      <span className="visually-hidden">{NOMS_PLATEFORMES[k.plateforme]}</span>
                      <span>{k.abonnes != null ? `${nombreFr(k.abonnes)}\u00a0abonnés` : "abonnés inconnus"}</span>
                    </>
                  );
                  return (
                    <li key={k.plateforme}>
                      {k.url ? (
                        <a href={k.url} target="_blank" rel="noopener noreferrer" title={`${NOMS_PLATEFORMES[k.plateforme]} de ${c.nom}`}>
                          {contenu}
                        </a>
                      ) : (
                        contenu
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="social-meta">
                {c.publications > 0
                  ? `${nombreFr(c.publications)}\u00a0publication${c.publications > 1 ? "s" : ""} · ${nombreFr(c.jaime)}\u00a0j’aime depuis le déclenchement`
                  : "Aucune publication depuis le déclenchement"}
              </p>
              {c.serie && n > 0 && (
                <figure className="circo-serie">
                  <figcaption className="social-meta">
                    {nombreFr(total)}&nbsp;{unite} depuis le 1er&nbsp;août
                  </figcaption>
                  <svg
                    viewBox={`0 0 ${n} 40`}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`${c.nom}\u00a0: ${nombreFr(total)} ${unite} depuis le 1er août`}
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
                          <title>{`${jourCourt(j.jour)}\u00a0: ${nombreFr(j[mesure])}`}</title>
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
              )}
            </li>
          );
        })}
        {page.sansCompte.map((k) => (
          <li key={k} className="circo-carte vide">
            <div className="social-fiche-tete">
              <span className="social-fiche-parti" style={{ background: partiInfo[k].couleur }}>
                {partiInfo[k].sigle}
              </span>
              <span className="social-nom">{partiInfo[k].nom}</span>
            </div>
            <p className="social-meta">Aucun compte suivi</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const NOMS_NATURES: Record<string, string> = {
  video: "Vidéos",
  photo: "Photos",
  carrousel: "Carrousels",
  texte: "Textes",
  partage: "Partages",
};
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PAS = 20;

/** Le fil de la circonscription. Le HTML en porte les 20 premières
 *  publications ; « Voir plus » charge le fichier statique complet de la
 *  circonscription (une fois), puis en montre 20 de plus à chaque clic. Les
 *  filtres (candidat, plateforme, nature) portent sur tout ce qui est chargé. */
export function FilCirco({ page, partiInfo }: { page: PageCirco; partiInfo: SocialData["partiInfo"] }) {
  const [tout, setTout] = useState<FilItem[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [montres, setMontres] = useState(PAS);
  const liste = tout ?? page.fil;
  const presentes = PLATEFORMES.filter((p) => liste.some((x) => x.plateforme === p));
  const partis = [...new Set(liste.map((x) => x.party))] as PartyKey[];
  const natures = Object.keys(NOMS_NATURES).filter((n) => liste.some((x) => x.nature === n));
  const [plateformes, setPlateformes] = useState<Plateforme[]>([...PLATEFORMES]);
  const [exclus, setExclus] = useState<PartyKey[]>([]);
  const [naturesExclues, setNaturesExclues] = useState<string[]>([]);
  const fil = liste.filter(
    (x) =>
      plateformes.includes(x.plateforme) &&
      !exclus.includes(x.party) &&
      !(x.nature && naturesExclues.includes(x.nature)),
  );
  const bascule = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const total = page.total ?? page.fil.length;
  const voirPlus = async () => {
    if (!tout && page.complet && page.code != null) {
      setChargement(true);
      const r = await fetch(`${BASE_PATH}/reseaux/fil-complet/${page.code}.json`).catch(() => null);
      const j = r && r.ok ? await r.json().catch(() => null) : null;
      setTout(Array.isArray(j) && j.length ? (j as FilItem[]) : page.fil);
      setChargement(false);
    }
    setMontres((n) => n + PAS);
  };
  const reste = (tout ? fil.length : page.complet ? total : fil.length) - montres;
  return (
    <section className="circo-section">
      <div className="circo-section-tete">
        <h2 className="apropos-section-title">Leurs publications</h2>
        <span className="social-meta">
          {page.complet
            ? `${nombreFr(total)}\u00a0publication${total > 1 ? "s" : ""} depuis le déclenchement`
            : `Les ${nombreFr(page.fil.length)} dernières publications`}
        </span>
      </div>
      {liste.length === 0 ? (
        <p className="social-note">Aucune publication de ces candidats.</p>
      ) : (
        <>
          <div className="social-coches circo-filtres">
            <div role="group" aria-label="Filtres du fil">
              {partis.map((k) => (
                <button
                  type="button"
                  key={k}
                  aria-pressed={!exclus.includes(k)}
                  className={!exclus.includes(k) ? "actif" : undefined}
                  style={!exclus.includes(k) ? { background: partiInfo[k].couleur, borderColor: partiInfo[k].couleur } : undefined}
                  title={liste.find((x) => x.party === k)?.nom}
                  onClick={() => setExclus(bascule(exclus, k))}
                >
                  {partiInfo[k].sigle}
                </button>
              ))}
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
              {natures.map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-pressed={!naturesExclues.includes(n)}
                  className={!naturesExclues.includes(n) ? "actif" : undefined}
                  onClick={() => setNaturesExclues(bascule(naturesExclues, n))}
                >
                  {NOMS_NATURES[n]}
                </button>
              ))}
            </div>
            {!tout && page.complet && (
              <p className="social-note">
                Les filtres portent sur les publications affichées. Le bouton «&nbsp;Voir plus&nbsp;» charge toutes les
                autres.
              </p>
            )}
          </div>
          {fil.length === 0 ? (
            <p className="social-note">Aucune publication dans cette sélection.</p>
          ) : (
            <ol className="social-palmares">
              {fil.slice(0, montres).map((p, i) => (
                <CartePublication key={`${p.url ?? ""}-${i}`} partiInfo={partiInfo} p={p} />
              ))}
            </ol>
          )}
          {reste > 0 && (page.complet || tout) && (
            <button type="button" className="circo-plus" onClick={voirPlus} disabled={chargement}>
              {chargement ? "Chargement…" : `Voir plus (${nombreFr(Math.min(PAS, reste))} sur ${nombreFr(reste)} restantes)`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
