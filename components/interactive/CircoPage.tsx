"use client";

import { useState } from "react";
import type { PartyKey } from "@/lib/data/parties";
import {
  NOMS_PLATEFORMES,
  nombreFr,
  nombreGrand,
  PLATEFORMES,
  type CandidatPage,
  type FilItem,
  type PageCirco,
  type Plateforme,
  type SocialData,
} from "@/lib/data/social-meta";
import { CartePublication, Logo, Media } from "@/components/interactive/SocialClient";
import { MONTHS_FR } from "@/lib/dates";

// Page d'une circonscription du module « Les candidats sur les réseaux » :
// les parties qui bougent (séries, fil filtrable, lecteur vidéo). Tout le reste
// est rendu au build par la page serveur.

const jourCourt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_FR[Number(iso.slice(5, 7)) - 1]}`;


const COULEURS_PF: Record<Plateforme, string> = { facebook: "#2E4663", instagram: "#A07A3D", tiktok: "#433F38" };
const rang = (n: number) => (n === 1 ? "1er" : `${n}e`);

/** « aujourd'hui », « hier », « il y a 4 jours » : par rapport au jour du
 *  dernier relevé (le lendemain du dernier jour complet). */
function ilYa(jour: string, fin: string) {
  const ref = new Date(`${fin}T00:00:00Z`).getTime() + 86400000;
  const n = Math.round((ref - new Date(`${jour}T00:00:00Z`).getTime()) / 86400000);
  return n <= 0 ? "aujourd’hui" : n === 1 ? "hier" : `il y a ${nombreFr(n)}\u00a0jours`;
}

/** Les candidats de la circonscription, une carte chacun, classés par
 *  j'aime depuis le déclenchement (sans compte ou sans publication : à la fin,
 *  dans l'ordre des partis). Chaque carte : pastille de rang, abonnés,
 *  publications, j'aime et commentaires, part des plateformes, dernière
 *  publication, la plus aimée, et les j'aime par jour depuis le 1er août. */
export function CandidatsCirco({
  page,
  partiInfo,
}: {
  page: PageCirco;
  partiInfo: SocialData["partiInfo"];
}) {
  const avecSerie = page.jours.length > 0 && page.candidats.some((c) => c.serie);
  const max = Math.max(1, ...page.candidats.flatMap((c) => (c.serie ?? []).map((j) => j.jaime)));
  const n = page.jours.length;
  const fin = page.jours[n - 1] ?? "";
  const iCampagne = page.jours.indexOf(page.campagne);
  const mois = page.jours.flatMap((j, i) => (j.endsWith("-01") ? [{ i, m: MONTHS_FR[Number(j.slice(5, 7)) - 1] }] : []));
  const actif = (c: CandidatPage) => c.comptes.length > 0 && c.publications > 0;
  const tries = [
    ...page.candidats.filter(actif).sort((a, b) => b.jaime - a.jaime),
    ...page.candidats.filter((c) => !actif(c)),
  ];
  const nbActifs = tries.filter(actif).length;
  const rangDe = (c: CandidatPage) => 1 + tries.filter((x) => actif(x) && x.jaime > c.jaime).length;
  return (
    <section className="circo-section">
      <div className="circo-section-tete">
        <h2 className="apropos-section-title">Les candidats</h2>
      </div>
      <p className="social-sous-titre">
        Classés par j’aime depuis le déclenchement, jours complets.
        {avecSerie
          ? " En bas de chaque carte, les j’aime par jour depuis le 1er\u00a0août, à la même échelle pour tous. Le pointillé marque le déclenchement des élections."
          : ""}
      </p>
      <ul className="circo-cartes">
        {tries.map((c) => {
          const total = (c.serie ?? []).reduce((t, j) => t + j.jaime, 0);
          const totalPf = PLATEFORMES.reduce((t, p) => t + c.parPlateforme[p], 0);
          const r = rangDe(c);
          return (
            <li key={`${c.party}-${c.nom}`} className="circo-carte" style={{ borderLeftColor: partiInfo[c.party].couleur }}>
              {actif(c) && (
                <span
                  className={`circo-pastille${r === 1 ? " premier" : r <= 3 ? " podium" : ""}`}
                  title={`${rang(r)} sur ${nbActifs} en j’aime depuis le déclenchement`}
                  aria-label={`${rang(r)} sur ${nbActifs} en j’aime depuis le déclenchement`}
                >
                  <b>{r}</b>
                  <sup>{r === 1 ? "er" : "e"}</sup>
                </span>
              )}
              <div className="social-fiche-tete">
                <span className="social-fiche-parti" style={{ background: partiInfo[c.party].couleur }}>
                  {partiInfo[c.party].sigle}
                </span>
                <span className="social-nom">{c.nom}</span>
              </div>
              {c.comptes.length === 0 ? (
                <p className="social-meta circo-vide">Aucun compte suivi</p>
              ) : (
                <>
                  <div className="circo-abonnes">
                    <span className="circo-grand">{nombreGrand(c.abonnes)}</span>
                    <span className="social-meta">abonnés</span>
                  </div>
                  <ul className="circo-comptes">
                    {c.comptes.map((k) => {
                      const contenu = (
                        <span className="circo-compte">
                          <Logo p={k.plateforme} taille={14} />
                          <span className="visually-hidden">{NOMS_PLATEFORMES[k.plateforme]}</span>
                          <span>{k.abonnes != null ? nombreFr(k.abonnes) : "?"}</span>
                        </span>
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
                  {c.publications === 0 ? (
                    <p className="social-meta circo-vide">Aucune publication depuis le déclenchement</p>
                  ) : (
                    <>
                      <dl className="circo-chiffres">
                        <div><dd>{nombreGrand(c.publications)}</dd><dt>Publications</dt></div>
                        <div><dd>{nombreGrand(c.jaime)}</dd><dt>J’aime</dt></div>
                        <div><dd>{nombreGrand(c.commentaires)}</dd><dt>Commentaires</dt></div>
                      </dl>
                      {totalPf > 0 && (
                        <div
                          className="circo-plateformes"
                          role="img"
                          aria-label={PLATEFORMES.filter((p) => c.parPlateforme[p]).map((p) => `${NOMS_PLATEFORMES[p]} ${Math.round((100 * c.parPlateforme[p]) / totalPf)}\u00a0%`).join(", ")}
                        >
                          {PLATEFORMES.filter((p) => c.parPlateforme[p]).map((p) => {
                            const part = (100 * c.parPlateforme[p]) / totalPf;
                            return (
                              <i
                                key={p}
                                style={{ width: `${part}%`, background: COULEURS_PF[p] }}
                                title={`${NOMS_PLATEFORMES[p]}\u00a0: ${Math.round(part)}\u00a0% des publications`}
                              >
                                {part >= 18 && <Logo p={p} taille={10} />}
                              </i>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                  {c.derniere && (
                    <p className="social-meta circo-derniere">
                      Dernière publication {ilYa(c.derniere.jour, fin)}
                      {c.derniere.url && (
                        <>
                          {" · "}
                          <a href={c.derniere.url} target="_blank" rel="noopener noreferrer">
                            voir
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  {c.meilleure && c.meilleure.jaime > 0 && (
                    <div className="circo-meilleure">
                      <Media p={c.meilleure} />
                      <div>
                        <span className="social-meta">La plus aimée · {nombreFr(c.meilleure.jaime)}&nbsp;j’aime</span>
                        <p>
                          {c.meilleure.texte.length > 80 ? `${c.meilleure.texte.slice(0, 79).trimEnd()}…` : c.meilleure.texte || "(sans texte)"}
                        </p>
                        {c.meilleure.url && (
                          <a href={c.meilleure.url} target="_blank" rel="noopener noreferrer" className="social-meta">
                            voir la publication
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {c.serie && n > 0 && c.comptes.length > 0 && (
                <figure className="circo-serie">
                  <figcaption className="social-meta">
                    {nombreFr(total)}&nbsp;j’aime depuis le 1er&nbsp;août
                  </figcaption>
                  <svg viewBox={`0 0 ${n} 40`} preserveAspectRatio="none" role="img" aria-label={`${c.nom}\u00a0: ${nombreFr(total)} j’aime depuis le 1er août`}>
                    {c.serie.map((j, i) =>
                      j.jaime > 0 ? (
                        <rect
                          key={j.jour}
                          x={i + 0.12}
                          width={0.76}
                          y={40 - (38 * j.jaime) / max}
                          height={(38 * j.jaime) / max}
                          fill={partiInfo[c.party].couleur}
                        >
                          <title>{`${jourCourt(j.jour)}\u00a0: ${nombreFr(j.jaime)}\u00a0j’aime`}</title>
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
          <li key={k} className="circo-carte" style={{ borderLeftColor: partiInfo[k].couleur }}>
            <div className="social-fiche-tete">
              <span className="social-fiche-parti" style={{ background: partiInfo[k].couleur }}>
                {partiInfo[k].sigle}
              </span>
              <span className="social-nom">{partiInfo[k].nom}</span>
            </div>
            <p className="social-meta circo-vide">Aucun compte suivi</p>
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
