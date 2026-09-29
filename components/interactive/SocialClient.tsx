"use client";

import { useState } from "react";
import {
  FILTRES,
  NOMS_PLATEFORMES,
  PLATEFORMES,
  type FiltrePlateforme,
  type Serie,
  type SocialData,
} from "@/lib/data/social-meta";
import { MONTHS_FR } from "@/lib/dates";

type Vue = "presence" | "audience" | "publications" | "jaime" | "palmares";

const VUES: { cle: Vue; libelle: string }[] = [
  { cle: "presence", libelle: "Présence" },
  { cle: "audience", libelle: "Audience" },
  { cle: "publications", libelle: "Publications" },
  { cle: "jaime", libelle: "J’aime" },
  { cle: "palmares", libelle: "Palmarès" },
];

const SOUS_TITRES: Record<Vue, string> = {
  presence: "Part des candidatures de chaque parti dont au moins un compte est suivi",
  audience: "Les 20 comptes les plus suivis, en nombre d’abonnés",
  publications: "Publications par jour depuis le déclenchement des élections",
  jaime: "J’aime reçus par jour par les publications du jour",
  palmares: "Les publications les plus aimées des sept derniers jours",
};

const nombreFr = (n: number) => Math.round(n).toLocaleString("fr-CA").replace(/\s/g, " ");
const jourCourt = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS_FR[m - 1]}`;
};
const libelleFiltre = (f: FiltrePlateforme) => (f === "toutes" ? "Toutes" : NOMS_PLATEFORMES[f]);

/**
 * Courbes par parti. Même technique que le graphique « Palmares » du module
 * Partis : le SVG est étiré (preserveAspectRatio="none", traits à épaisseur
 * fixe), et tout le texte est en HTML positionné en pourcentage — il garde sa
 * taille à toutes les largeurs, du téléphone au grand écran.
 */
function Courbes({
  jours,
  series,
  unite,
  info,
}: {
  jours: string[];
  series: Serie[];
  unite: string;
  info: SocialData["partiInfo"];
}) {
  const n = jours.length;
  const max = Math.max(1, ...series.flatMap((s) => s.valeurs));
  const pas = Math.pow(10, Math.floor(Math.log10(max)));
  const haut = Math.ceil(max / pas) * pas;
  const x = (i: number) => (n > 1 ? (100 * i) / (n - 1) : 50);
  const y = (v: number) => 100 * (1 - v / haut);
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * haut);

  // Étiquettes de fin de courbe, écartées d'au moins 7 % de la hauteur.
  const fins = series
    .map((s) => ({ party: s.party, y: y(s.valeurs[n - 1] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < fins.length; i++) {
    if (fins[i].y - fins[i - 1].y < 7) fins[i].y = fins[i - 1].y + 7;
  }

  return (
    <div
      className="social-graphe"
      role="img"
      aria-label={`${unite} par jour et par parti, du ${jourCourt(jours[0])} au ${jourCourt(jours[n - 1])}`}
    >
      <div className="social-trace">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {graduations.map((v) => (
            <line key={v} x1={0} x2={100} y1={y(v)} y2={y(v)} stroke="#DED3B9" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          ))}
          {series.map((s) => (
            <polyline
              key={s.party}
              points={s.valeurs.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={info[s.party].couleur}
              strokeWidth={1.8}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {graduations.map((v) => (
          <span key={v} className="social-axe social-axe-y" style={{ top: `${y(v)}%` }}>
            {nombreFr(v)}
          </span>
        ))}
        {jours.map((j, i) =>
          i % 7 === 0 ? (
            <span key={j} className="social-axe social-axe-x" style={{ left: `${x(i)}%` }}>
              {jourCourt(j)}
            </span>
          ) : null,
        )}
        {fins.map((f) => (
          <span
            key={f.party}
            className="social-etiquette"
            style={{ top: `${f.y}%`, color: info[f.party].couleur }}
          >
            {info[f.party].sigle}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SocialClient({ data }: { data: SocialData }) {
  const [vue, setVue] = useState<Vue>("presence");
  const [filtre, setFiltre] = useState<FiltrePlateforme>("toutes");
  const avecFiltre = vue !== "presence";

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Les candidats sur les réseaux</h2>
          <div className="period-subtitle">{SOUS_TITRES[vue]}</div>
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline" role="tablist" aria-label="Vue">
              {VUES.map((v) => (
                <span
                  key={v.cle}
                  role="tab"
                  aria-selected={v.cle === vue}
                  className={v.cle === vue ? "active" : undefined}
                  onClick={() => setVue(v.cle)}
                  style={{ cursor: "pointer" }}
                >
                  {v.libelle}
                </span>
              ))}
            </div>
          </div>
          {avecFiltre && (
            <div className="control-row">
              <div className="legend-toggle inline" role="group" aria-label="Plateforme">
                {FILTRES.map((f) => (
                  <span
                    key={f}
                    className={f === filtre ? "active" : undefined}
                    onClick={() => setFiltre(f)}
                    style={{ cursor: "pointer" }}
                  >
                    {libelleFiltre(f)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="social">
        {vue === "presence" && (
          <table className="social-presence">
            <thead>
              <tr>
                <th scope="col" />
                {PLATEFORMES.map((p) => (
                  <th key={p} scope="col">{NOMS_PLATEFORMES[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.partis.map((k) => (
                <tr key={k}>
                  <th scope="row" title={data.partiInfo[k].nom}>{data.partiInfo[k].sigle}</th>
                  {PLATEFORMES.map((p) => {
                    const c = data.presence[k][p];
                    return (
                      <td
                        key={p}
                        style={{
                          background: `color-mix(in srgb, ${data.partiInfo[k].couleur} ${Math.round(15 + 85 * c.part)}%, transparent)`,
                        }}
                        className={c.part > 0.5 ? "fonce" : undefined}
                        title={`${c.avecCompte} sur ${c.candidats} candidatures`}
                      >
                        {Math.round(100 * c.part)}&nbsp;%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {vue === "audience" && (
          <ol className="social-barres">
            {data.audience[filtre].map((a) => {
              const max = data.audience[filtre][0]?.abonnes || 1;
              return (
                <li key={`${a.plateforme}-${a.nom}`}>
                  <span className="social-nom">
                    {a.nom}
                    <span className="social-meta">
                      {data.partiInfo[a.party].sigle} · {NOMS_PLATEFORMES[a.plateforme]}
                    </span>
                  </span>
                  <span className="social-piste">
                    <i style={{ width: `${(100 * a.abonnes) / max}%`, background: data.partiInfo[a.party].couleur }} />
                  </span>
                  <span className="social-valeur">{nombreFr(a.abonnes)}</span>
                </li>
              );
            })}
          </ol>
        )}

        {(vue === "publications" || vue === "jaime") && data.jours.length > 1 && (
          <Courbes
            jours={data.jours}
            series={vue === "publications" ? data.publications[filtre] : data.jaime[filtre]}
            unite={vue === "publications" ? "Publications" : "J’aime"}
            info={data.partiInfo}
          />
        )}

        {vue === "palmares" && (
          <ol className="social-palmares">
            {data.palmares[filtre].length === 0 && (
              <li className="social-vide">Aucune publication dans cette sélection.</li>
            )}
            {data.palmares[filtre].map((p, i) => (
              <li key={`${p.url ?? i}`}>
                <div className="social-palmares-tete">
                  <span className="social-rang">{i + 1}</span>
                  <span className="social-nom" style={{ color: data.partiInfo[p.party].couleur }}>
                    {p.nom}
                  </span>
                  <span className="social-meta">
                    {data.partiInfo[p.party].sigle} · {NOMS_PLATEFORMES[p.plateforme]} · {jourCourt(p.jour)}
                  </span>
                </div>
                {p.texte && <p className="social-texte">{p.texte}</p>}
                <div className="social-meta">
                  {nombreFr(p.jaime)}&nbsp;j’aime · {nombreFr(p.commentaires)}&nbsp;commentaires
                  {p.url && (
                    <>
                      {" · "}
                      <a href={p.url} target="_blank" rel="noopener noreferrer">
                        voir la publication
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="module-last-updated">
        {data.lastUpdated} · Module expérimental, visible sur le miroir de travail seulement.
      </div>
    </>
  );
}
