"use client";

import { useState } from "react";
import type { PartyKey } from "@/lib/data/parties";
import {
  candidatActif,
  NOMS_PLATEFORMES,
  nombreFr,
  nombreGrand,
  PLATEFORMES,
  type CandidatPage,
  type FilItem,
  type PageCirco,
  type Plateforme,
  rangCandidat,
  type SocialData,
} from "@/lib/data/social-meta";
import { CartePublication, Logo, Media } from "@/components/interactive/SocialClient";
import { MONTHS_FR } from "@/lib/dates";

// Page d'une circonscription du module « Les candidats sur les réseaux » :
// les parties qui bougent (séries, fil filtrable, lecteur vidéo). Tout le reste
// est rendu au build par la page serveur.

const jourCourt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_FR[Number(iso.slice(5, 7)) - 1]}`;


const COULEURS_PF: Record<Plateforme, string> = { facebook: "#2E4663", instagram: "#A07A3D", tiktok: "#433F38" };
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const rang = (n: number) => (n === 1 ? "1er" : `${n}e`);

/** La carte d'un candidat : pastille de rang, abonnés, publications, j'aime
 *  et commentaires, part des plateformes, la publication la plus aimée, et les
 *  j'aime par jour depuis le 1er août. Dans la liste de sa circonscription
 *  (`lien` : le nom mène à sa page), ou seule et en grand sur sa page. */
export function CarteCandidat({
  c,
  partiInfo,
  rang: r,
  nbActifs,
  jours,
  campagne,
  max,
  lien = false,
  grand = false,
}: {
  c: CandidatPage;
  partiInfo: SocialData["partiInfo"];
  rang: number | null;
  nbActifs: number;
  jours: string[];
  campagne: string;
  /** Haut de l'échelle de la série (commune à la circonscription). */
  max: number;
  lien?: boolean;
  grand?: boolean;
}) {
  const n = jours.length;
  const iCampagne = jours.indexOf(campagne);
  const mois = jours.flatMap((j, i) => (j.endsWith("-01") ? [{ i, m: MONTHS_FR[Number(j.slice(5, 7)) - 1] }] : []));
  const total = (c.serie ?? []).reduce((t, j) => t + j.jaime, 0);
  const totalPf = PLATEFORMES.reduce((t, p) => t + c.parPlateforme[p], 0);
  const Titre = grand ? "h2" : "span";
  return (
    <li className={`circo-carte${grand ? " grand" : ""}`} style={{ borderLeftColor: partiInfo[c.party].couleur }}>
      {r != null && (
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
        <Titre className="social-nom">
          {lien && c.slug ? <a href={`${BASE_PATH}/reseaux/candidats/${c.slug}/`}>{c.nom}</a> : c.nom}
        </Titre>
      </div>
      {c.comptes.length === 0 ? (
        <p className="social-meta circo-vide">Aucun compte suivi</p>
      ) : (
        <>
          {/* Une ligne : le total des abonnés, puis le détail par compte ; un
              seul compte, son logo suffit (le détail répéterait le total). */}
          <div className="circo-abonnes">
            <span className="circo-grand">{nombreGrand(c.abonnes)}</span>
            <span className="social-meta">abonnés</span>
            {c.comptes.length === 1 ? (
              (() => {
                const k = c.comptes[0];
                const logo = (
                  <span className="circo-compte">
                    <Logo p={k.plateforme} taille={14} />
                    <span className="visually-hidden">{NOMS_PLATEFORMES[k.plateforme]}</span>
                  </span>
                );
                return k.url ? (
                  <a href={k.url} target="_blank" rel="noopener noreferrer" title={`${NOMS_PLATEFORMES[k.plateforme]} de ${c.nom}`}>
                    {logo}
                  </a>
                ) : (
                  logo
                );
              })()
            ) : (
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
            )}
          </div>
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
}

/** Les candidats de la circonscription, une carte chacun, classés par
 *  j'aime depuis le déclenchement (sans compte ou sans publication : à la fin,
 *  dans l'ordre des partis). Le nom de chacun mène à sa page. */
export function CandidatsCirco({
  page,
  partiInfo,
}: {
  page: PageCirco;
  partiInfo: SocialData["partiInfo"];
}) {
  const avecSerie = page.jours.length > 0 && page.candidats.some((c) => c.serie);
  const max = Math.max(1, ...page.candidats.flatMap((c) => (c.serie ?? []).map((j) => j.jaime)));
  const tries = [
    ...page.candidats.filter(candidatActif).sort((a, b) => b.jaime - a.jaime),
    ...page.candidats.filter((c) => !candidatActif(c)),
  ];
  const nbActifs = tries.filter(candidatActif).length;
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
        {tries.map((c) => (
          <CarteCandidat
            key={`${c.party}-${c.nom}`}
            c={c}
            partiInfo={partiInfo}
            rang={rangCandidat(c, page.candidats)}
            nbActifs={nbActifs}
            jours={page.jours}
            campagne={page.campagne}
            max={max}
            lien
          />
        ))}
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

const PAS = 20;

/** Le fil de la circonscription. Le HTML en porte les 20 premières
 *  publications ; « Voir plus » charge le fichier statique complet de la
 *  circonscription (une fois), puis en montre 20 de plus à chaque clic. Les
 *  filtres (candidat, plateforme) portent sur tout ce qui est chargé.
 *  `party` : le fil d'un seul candidat (sa page), tiré du même fichier. */
export function FilCirco({
  page,
  partiInfo,
  party,
  titre = "Leurs publications",
}: {
  page: Pick<PageCirco, "fil" | "total" | "complet" | "code">;
  partiInfo: SocialData["partiInfo"];
  party?: PartyKey;
  titre?: string;
}) {
  const [tout, setTout] = useState<FilItem[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [montres, setMontres] = useState(PAS);
  const liste = tout ?? page.fil;
  const presentes = PLATEFORMES.filter((p) => liste.some((x) => x.plateforme === p));
  const partis = [...new Set(liste.map((x) => x.party))] as PartyKey[];
  const [plateformes, setPlateformes] = useState<Plateforme[]>([...PLATEFORMES]);
  const [exclus, setExclus] = useState<PartyKey[]>([]);
  const fil = liste.filter((x) => plateformes.includes(x.plateforme) && !exclus.includes(x.party));
  const bascule = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
  const total = page.total ?? page.fil.length;
  const voirPlus = async () => {
    if (!tout && page.complet && page.code != null) {
      setChargement(true);
      const r = await fetch(`${BASE_PATH}/reseaux/fil-complet/${page.code}.json`).catch(() => null);
      const j = r && r.ok ? await r.json().catch(() => null) : null;
      const lus = Array.isArray(j) ? (j as FilItem[]).filter((x) => !party || x.party === party) : [];
      setTout(lus.length ? lus : page.fil);
      setChargement(false);
    }
    setMontres((n) => n + PAS);
  };
  const reste = (tout ? fil.length : page.complet ? total : fil.length) - montres;
  return (
    <section className="circo-section">
      <div className="circo-section-tete">
        <h2 className="apropos-section-title">{titre}</h2>
        <span className="social-meta">
          {page.complet
            ? `${nombreFr(total)}\u00a0publication${total > 1 ? "s" : ""} depuis le déclenchement`
            : `Les ${nombreFr(page.fil.length)} dernières publications`}
        </span>
      </div>
      {liste.length === 0 ? (
        <p className="social-note">{party ? "Aucune publication depuis le déclenchement." : "Aucune publication de ces candidats."}</p>
      ) : (
        <>
          <div className="social-coches circo-filtres">
            <div role="group" aria-label="Filtres du fil">
              {!party && partis.map((k) => (
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
