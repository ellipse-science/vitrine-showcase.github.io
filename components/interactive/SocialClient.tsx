"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PartyKey } from "@/lib/data/parties";
import {
  COULEURS_PLATEFORMES,
  NOMS_PLATEFORMES,
  NOMS_TYPES,
  PLATEFORMES,
  TYPES,
  type Plateforme,
  type SocialData,
  type TypeCompte,
} from "@/lib/data/social-meta";
import {
  lignes,
  palmares,
  palmaresApproche,
  panneaux,
  parElement,
  parJour,
  series,
  totaux,
  treemap,
  valeur,
  type Decoupe,
  type Element,
  type Filtres,
  type Mesure,
  type Panneau,
} from "@/lib/data/social-calc";
import { MONTHS_FR } from "@/lib/dates";

type Vue = "presence" | "audience" | "publications" | "engagement" | "palmares";
type Forme = "barres" | "parts" | "temps";

const VUES: { cle: Vue; libelle: string }[] = [
  { cle: "presence", libelle: "Présence" },
  { cle: "audience", libelle: "Audience" },
  { cle: "publications", libelle: "Publications" },
  { cle: "engagement", libelle: "Engagement" },
  { cle: "palmares", libelle: "Palmarès" },
];
const FORMES: { cle: Forme; libelle: string }[] = [
  { cle: "barres", libelle: "Barres" },
  { cle: "parts", libelle: "Parts" },
  { cle: "temps", libelle: "Dans le temps" },
];
const DECOUPES: { cle: Decoupe; libelle: string }[] = [
  { cle: "ensemble", libelle: "Ensemble" },
  { cle: "plateforme", libelle: "Par plateforme" },
  { cle: "parti", libelle: "Par parti" },
];
const MESURES_ENGAGEMENT: { cle: Mesure; libelle: string }[] = [
  { cle: "jaime", libelle: "J’aime" },
  { cle: "commentaires", libelle: "Commentaires" },
  { cle: "parPublication", libelle: "J’aime par publication" },
];
const NOMS_MESURES: Record<Mesure, string> = {
  publications: "publications",
  jaime: "j’aime",
  commentaires: "commentaires",
  parPublication: "j’aime par publication",
};

const nombreFr = (n: number, dec = 0) =>
  n.toLocaleString("fr-CA", { maximumFractionDigits: dec, minimumFractionDigits: 0 }).replace(/\s/g, " ");
const court = (n: number) =>
  n >= 1e6 ? `${nombreFr(n / 1e6, 1)} M` : n >= 1e4 ? `${nombreFr(n / 1e3, 0)} k` : nombreFr(n);
const jourCourt = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS_FR[m - 1]}`;
};

// ── Frise : histogramme des publications et fenêtre de période ────────────────
function Frise({
  jours,
  valeurs,
  d0,
  d1,
  campagne,
  onChange,
}: {
  jours: string[];
  valeurs: number[];
  d0: number;
  d1: number;
  campagne: number;
  onChange: (d0: number, d1: number) => void;
}) {
  const n = jours.length;
  const max = Math.max(1, ...valeurs);
  const zone = useRef<HTMLDivElement>(null);
  const geste = useRef<{ mode: "debut" | "fin" | "fenetre" | "nouvelle"; origine: number; d0: number; d1: number } | null>(
    null,
  );
  const borne = (i: number) => Math.max(0, Math.min(n - 1, i));
  const jourDe = (clientX: number) => {
    const r = zone.current!.getBoundingClientRect();
    return borne(Math.floor(((clientX - r.left) / r.width) * n));
  };

  const commence = (e: PointerEvent<HTMLDivElement>) => {
    let cible = (e.target as HTMLElement).dataset.poignee as "debut" | "fin" | "fenetre" | undefined;
    // Une fenêtre qui couvre tout l'axe ne peut pas glisser : on en trace une nouvelle.
    if (cible === "fenetre" && d0 === 0 && d1 === n - 1) cible = undefined;
    const j = jourDe(e.clientX);
    geste.current = { mode: cible ?? "nouvelle", origine: j, d0, d1 };
    if (!cible) onChange(j, j);
    zone.current!.setPointerCapture(e.pointerId);
  };
  const bouge = (e: PointerEvent<HTMLDivElement>) => {
    const g = geste.current;
    if (!g) return;
    const j = jourDe(e.clientX);
    if (g.mode === "debut") onChange(Math.min(j, g.d1), g.d1);
    else if (g.mode === "fin") onChange(g.d0, Math.max(j, g.d0));
    else if (g.mode === "nouvelle") onChange(Math.min(j, g.origine), Math.max(j, g.origine));
    else {
      const largeur = g.d1 - g.d0;
      const nd0 = borne(Math.min(g.d0 + j - g.origine, n - 1 - largeur));
      onChange(nd0, nd0 + largeur);
    }
  };
  const finit = () => {
    geste.current = null;
  };

  // Clavier : flèches = un jour, Maj + flèche = une semaine.
  const clavier = (quoi: "debut" | "fin" | "fenetre") => (e: KeyboardEvent) => {
    const sens = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!sens) return;
    e.preventDefault();
    e.stopPropagation();
    const k = sens * (e.shiftKey ? 7 : 1);
    if (quoi === "debut") onChange(borne(Math.min(d0 + k, d1)), d1);
    else if (quoi === "fin") onChange(d0, borne(Math.max(d1 + k, d0)));
    else {
      const largeur = d1 - d0;
      const nd0 = borne(Math.min(d0 + k, n - 1 - largeur));
      onChange(nd0, nd0 + largeur);
    }
  };

  const pct = (i: number) => (100 * i) / n;
  const mois = jours.map((j, i) => ({ j, i })).filter(({ j }) => j.endsWith("-01"));

  return (
    <div className="social-frise">
      <div
        ref={zone}
        className="social-frise-zone"
        onPointerDown={commence}
        onPointerMove={bouge}
        onPointerUp={finit}
        onPointerCancel={finit}
      >
        <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
          {valeurs.map((v, i) => (
            <rect
              key={i}
              x={i + 0.12}
              width={0.76}
              y={100 - (100 * v) / max}
              height={(100 * v) / max}
              className={i >= d0 && i <= d1 ? "dans" : "hors"}
            />
          ))}
        </svg>
        {campagne > 0 && (
          <span className="social-frise-repere" style={{ left: `${pct(campagne)}%` }}>
            <span className="social-frise-repere-libelle">déclenchement</span>
          </span>
        )}
        <div
          className="social-frise-fenetre"
          data-poignee="fenetre"
          role="slider"
          tabIndex={0}
          aria-label="Période : déplacer la fenêtre"
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={d0}
          aria-valuetext={`du ${jourCourt(jours[d0])} au ${jourCourt(jours[d1])}`}
          onKeyDown={clavier("fenetre")}
          style={{ left: `${pct(d0)}%`, width: `${pct(d1 - d0 + 1)}%` }}
        >
          <span
            className="social-frise-poignee debut"
            data-poignee="debut"
            role="slider"
            tabIndex={0}
            aria-label="Début de la période"
            aria-valuemin={0}
            aria-valuemax={d1}
            aria-valuenow={d0}
            aria-valuetext={jourCourt(jours[d0])}
            onKeyDown={clavier("debut")}
          />
          <span
            className="social-frise-poignee fin"
            data-poignee="fin"
            role="slider"
            tabIndex={0}
            aria-label="Fin de la période"
            aria-valuemin={d0}
            aria-valuemax={n - 1}
            aria-valuenow={d1}
            aria-valuetext={jourCourt(jours[d1])}
            onKeyDown={clavier("fin")}
          />
        </div>
      </div>
      <div className="social-frise-mois" aria-hidden="true">
        {mois.map(({ j, i }) => (
          <span key={j} style={{ left: `${pct(i)}%` }}>
            {MONTHS_FR[Number(j.slice(5, 7)) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Petites pièces ────────────────────────────────────────────────────────────
function Bascule<T extends string>({
  options,
  valeur: v,
  onChange,
  label,
}: {
  options: { cle: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="social-bascule" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.cle}
          className={o.cle === v ? "active" : undefined}
          aria-pressed={o.cle === v}
          onClick={() => onChange(o.cle)}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

/** Boutons à cocher : au moins un reste actif. */
function Coches<T extends string>({
  options,
  actifs,
  onChange,
  label,
  couleur,
}: {
  options: { cle: T; libelle: string }[];
  actifs: T[];
  onChange: (v: T[]) => void;
  label: string;
  couleur?: (c: T) => string;
}) {
  const bascule = (c: T) => {
    const on = actifs.includes(c);
    if (on && actifs.length === 1) return;
    onChange(options.map((o) => o.cle).filter((x) => (x === c ? !on : actifs.includes(x))));
  };
  return (
    <div className="social-coches" role="group" aria-label={label}>
      <span className="social-coches-titre">{label}</span>
      <div>
        {options.map((o) => {
          const on = actifs.includes(o.cle);
          return (
            <button
              type="button"
              key={o.cle}
              aria-pressed={on}
              className={on ? "actif" : undefined}
              style={on && couleur ? { background: couleur(o.cle), borderColor: couleur(o.cle) } : undefined}
              onClick={() => bascule(o.cle)}
            >
              {o.libelle}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function titrePanneau(data: SocialData, p: Panneau) {
  if (p.party) return data.partiInfo[p.party].nom;
  if (p.plateforme) return NOMS_PLATEFORMES[p.plateforme];
  return null;
}
function nomElement(data: SocialData, e: Element) {
  return e.party ? data.partiInfo[e.party].sigle : NOMS_PLATEFORMES[e.plateforme!];
}
function couleurElement(data: SocialData, e: Element) {
  return e.party ? data.partiInfo[e.party].couleur : COULEURS_PLATEFORMES[e.plateforme!];
}
const formatMesure = (m: Mesure) => (v: number) => (m === "parPublication" ? nombreFr(v, 1) : nombreFr(v));

type Blocs = ReturnType<typeof parElement>;

function Barres({ data, blocs, m }: { data: SocialData; blocs: Blocs; m: Mesure }) {
  const max = Math.max(1e-9, ...blocs.flatMap((b) => b.valeurs.map((v) => v.valeur)));
  return (
    <div className={`social-panneaux${blocs.length > 1 ? " multiples" : ""}`}>
      {blocs.map((b) => (
        <div key={b.panneau.cle} className="social-panneau">
          {titrePanneau(data, b.panneau) && <div className="social-panneau-titre">{titrePanneau(data, b.panneau)}</div>}
          <ol className="social-barres">
            {b.valeurs.map((v) => (
              <li key={v.element.cle}>
                <span className="social-nom">{nomElement(data, v.element)}</span>
                <span className="social-piste">
                  <i style={{ width: `${(100 * v.valeur) / max}%`, background: couleurElement(data, v.element) }} />
                </span>
                <span className="social-valeur">{formatMesure(m)(v.valeur)}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/**
 * Parts : un treemap en tuiles par panneau, comme la démo. Aire proportionnelle
 * à la part, couleur du parti (ou de la plateforme), étiquette dans la tuile
 * quand elle y tient, infobulle avec le nombre.
 */
function Parts({ data, blocs, m }: { data: SocialData; blocs: Blocs; m: Mesure }) {
  const multiples = blocs.length > 1;
  const ratio = multiples ? 1.6 : 2.6; // largeur / hauteur du cadre (CSS)
  return (
    <div className={`social-panneaux${multiples ? " multiples" : ""}`}>
      {blocs.map((b) => {
        const total = b.valeurs.reduce((s, v) => s + v.valeur, 0);
        const tuiles = treemap(
          b.valeurs.map((v) => ({ item: v.element, valeur: v.valeur })),
          ratio,
        );
        return (
          <div key={b.panneau.cle} className="social-panneau">
            {titrePanneau(data, b.panneau) && <div className="social-panneau-titre">{titrePanneau(data, b.panneau)}</div>}
            {total === 0 ? (
              <p className="social-vide">Aucune donnée dans cette sélection.</p>
            ) : (
              <div className="social-treemap" role="list" style={{ aspectRatio: String(ratio) }}>
                {tuiles.map((t) => {
                  const part = Math.round((100 * t.valeur) / total);
                  const nom = nomElement(data, t.item);
                  const lisible = (t.x1 - t.x0) * ratio > 0.34 && t.y1 - t.y0 > 0.2;
                  const detail = `${nom}\u00a0: ${part}\u00a0% · ${formatMesure(m)(t.valeur)} ${NOMS_MESURES[m]}`;
                  return (
                    <div
                      key={t.item.cle}
                      role="listitem"
                      aria-label={detail}
                      title={detail}
                      className="social-tuile"
                      style={{
                        left: `${100 * t.x0}%`,
                        top: `${100 * t.y0}%`,
                        width: `${100 * (t.x1 - t.x0)}%`,
                        height: `${100 * (t.y1 - t.y0)}%`,
                        background: couleurElement(data, t.item),
                      }}
                    >
                      {lisible && (
                        <span aria-hidden="true">
                          <b>{nom}</b>
                          {part}&nbsp;%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Courbes, même technique que le graphique « Palmares » du module Partis : le
 * SVG est étiré (traits à épaisseur fixe) et le texte est en HTML positionné en
 * pourcentage, lisible à toutes les largeurs.
 */
function Courbes({
  data,
  jours,
  hebdo,
  s,
  m,
  compact = false,
}: {
  data: SocialData;
  jours: string[];
  hebdo: boolean;
  s: { element: Element; valeurs: number[] }[];
  m: Mesure;
  compact?: boolean;
}) {
  const n = jours.length;
  const max = Math.max(1e-9, ...s.flatMap((x) => x.valeurs));
  const pas = Math.pow(10, Math.floor(Math.log10(max)));
  const haut = Math.ceil(max / pas) * pas;
  const x = (i: number) => (n > 1 ? (100 * i) / (n - 1) : 50);
  const y = (v: number) => 100 * (1 - v / haut);
  const graduations = [0, 0.5, 1].map((f) => f * haut);
  const fins = s.map((c) => ({ c, y: y(c.valeurs[n - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  // Étiquettes écartées d'au moins 9 % de la hauteur, sans sortir du tracé :
  // on pousse vers le bas, puis on remonte ce qui dépasse.
  for (let i = 1; i < fins.length; i++) if (fins[i].y - fins[i - 1].y < 9) fins[i].y = fins[i - 1].y + 9;
  for (let i = fins.length - 1; i >= 0; i--) {
    const plafond = i === fins.length - 1 ? 100 : fins[i + 1].y - 9;
    if (fins[i].y > plafond) fins[i].y = plafond;
  }
  // Dates de l'axe : cinq au plus, trois dans un panneau (début, milieu, fin).
  const reperes = compact
    ? [...new Set([0, Math.floor((n - 1) / 2), n - 1])]
    : Array.from({ length: n }, (_, i) => i).filter((i) => i % Math.max(1, Math.ceil(n / 5)) === 0);

  return (
    <div className="social-graphe" role="img" aria-label={`${NOMS_MESURES[m]} ${hebdo ? "par semaine" : "par jour"}`}>
      <div className="social-trace">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {graduations.map((v) => (
            <line
              key={v}
              x1={0}
              x2={100}
              y1={y(v)}
              y2={y(v)}
              stroke="#DED3B9"
              strokeWidth={0.6}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {s.map((c) =>
            n === 1 ? null : (
              <polyline
                key={c.element.cle}
                points={c.valeurs.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                fill="none"
                stroke={couleurElement(data, c.element)}
                strokeWidth={1.8}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
        </svg>
        {n === 1 &&
          s.map((c) => (
            <span
              key={c.element.cle}
              className="social-point"
              style={{ top: `${y(c.valeurs[0])}%`, background: couleurElement(data, c.element) }}
            />
          ))}
        {graduations.map((v) => (
          <span key={v} className="social-axe social-axe-y" style={{ top: `${y(v)}%` }}>
            {m === "parPublication" ? nombreFr(v, 1) : court(v)}
          </span>
        ))}
        {reperes.map((i) => (
          <span key={jours[i]} className="social-axe social-axe-x" style={{ left: `${x(i)}%` }}>
            {jourCourt(jours[i])}
          </span>
        ))}
        {fins.map((f) => (
          <span
            key={f.c.element.cle}
            className="social-etiquette"
            style={{ top: `${f.y}%`, color: couleurElement(data, f.c.element) }}
          >
            {nomElement(data, f.c.element)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Le tableau de bord ────────────────────────────────────────────────────────
export function SocialClient({ data }: { data: SocialData }) {
  const n = data.jours.length;
  const [d0, setD0] = useState(Math.max(0, n - 7));
  const [d1, setD1] = useState(n - 1);
  const [plateformes, setPlateformes] = useState<Plateforme[]>([...PLATEFORMES]);
  const [partis, setPartis] = useState<PartyKey[]>([...data.partis]);
  const [types, setTypes] = useState<TypeCompte[]>([...TYPES]);
  const [vue, setVue] = useState<Vue>("publications");
  const [forme, setForme] = useState<Forme>("barres");
  const [decoupe, setDecoupe] = useState<Decoupe>("ensemble");
  const [mesureEng, setMesureEng] = useState<Mesure>("jaime");

  const f: Filtres = useMemo(() => ({ d0, d1, plateformes, partis, types }), [d0, d1, plateformes, partis, types]);
  const periode = (a: number, b: number) => {
    setD0(a);
    setD1(b);
  };

  const frise = useMemo(() => parJour(data, f), [data, f]);
  const rows = useMemo(() => lignes(data, f), [data, f]);
  const t = totaux(rows);
  const nbJours = d1 - d0 + 1;

  const m: Mesure = vue === "engagement" ? mesureEng : "publications";
  const formes = m === "parPublication" ? FORMES.filter((x) => x.cle !== "parts") : FORMES;
  const formeEff: Forme = m === "parPublication" && forme === "parts" ? "barres" : forme;
  const pans = panneaux(decoupe, f);
  const graphique = vue === "publications" || vue === "engagement";

  const raccourcis: { libelle: string; a: number }[] = [
    { libelle: "7 j", a: Math.max(0, n - 7) },
    { libelle: "30 j", a: Math.max(0, n - 30) },
    { libelle: "Campagne", a: data.campagne },
    { libelle: "Tout", a: 0 },
  ];

  const audience = data.audience
    .filter((a) => plateformes.includes(a.plateforme) && partis.includes(a.party) && types.includes(a.type))
    .slice(0, 20);
  const tops = vue === "palmares" ? palmares(data, f) : [];

  const sousTitre =
    vue === "presence"
      ? "Part des candidatures de chaque parti dont au moins un compte est suivi. Dernier relevé : la période ne s’applique pas."
      : vue === "audience"
        ? "Les 20 comptes les plus suivis, en abonnés. Dernier relevé : la période ne s’applique pas."
        : vue === "palmares"
          ? "Les 10 publications les plus aimées de la période."
          : m === "parPublication"
            ? "J’aime par publication : total des j’aime divisé par le nombre de publications de la période."
            : `Total des ${NOMS_MESURES[m]} de la période.`;

  return (
    <>
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Les candidats sur les réseaux</h2>
          <div className="period-subtitle">
            Du {jourCourt(data.jours[d0])} au {jourCourt(data.jours[d1])} · {nombreFr(nbJours)}
            {nbJours > 1 ? " jours" : " jour"}
          </div>
        </div>
      </div>

      <section className="social">
        <div className="social-tdb">
          <div className="social-principal">
            <div className="social-periode">
              <div className="social-raccourcis" role="group" aria-label="Raccourcis de période">
                <span className="social-coches-titre">Période</span>
                {raccourcis.map((r) => (
                  <button
                    type="button"
                    key={r.libelle}
                    aria-pressed={d0 === r.a && d1 === n - 1}
                    className={d0 === r.a && d1 === n - 1 ? "actif" : undefined}
                    onClick={() => periode(r.a, n - 1)}
                  >
                    {r.libelle}
                  </button>
                ))}
              </div>
              <Frise jours={data.jours} valeurs={frise} d0={d0} d1={d1} campagne={data.campagne} onChange={periode} />
            </div>

            <dl className="social-tuiles">
              <div>
                <dt>Publications</dt>
                <dd>{nombreFr(t.publications)}</dd>
              </div>
              <div>
                <dt>Par jour, en moyenne</dt>
                <dd>{nombreFr(t.publications / nbJours)}</dd>
              </div>
              <div>
                <dt>J’aime</dt>
                <dd>{nombreFr(t.jaime)}</dd>
              </div>
              <div>
                <dt>Commentaires</dt>
                <dd>{nombreFr(t.commentaires)}</dd>
              </div>
              <div>
                <dt>J’aime par publication</dt>
                <dd>{nombreFr(valeur(t, "parPublication"), 1)}</dd>
              </div>
            </dl>
          </div>

          <aside className="social-filtres" aria-label="Filtres">
            <Coches
              label="Plateforme"
              options={PLATEFORMES.map((p) => ({ cle: p, libelle: NOMS_PLATEFORMES[p] }))}
              actifs={plateformes}
              onChange={setPlateformes}
              couleur={(p) => COULEURS_PLATEFORMES[p]}
            />
            <Coches
              label="Parti"
              options={data.partis.map((p) => ({ cle: p, libelle: data.partiInfo[p].sigle }))}
              actifs={partis}
              onChange={setPartis}
              couleur={(p) => data.partiInfo[p].couleur}
            />
            <Coches
              label="Type de compte"
              options={TYPES.map((c) => ({ cle: c, libelle: NOMS_TYPES[c] }))}
              actifs={types}
              onChange={setTypes}
            />
          </aside>
        </div>

        <div className="social-onglets">
          <Bascule label="Vue" options={VUES} valeur={vue} onChange={setVue} />
        </div>

        {graphique && (
          <div className="social-reglages">
            {vue === "engagement" && (
              <Bascule label="Mesure" options={MESURES_ENGAGEMENT} valeur={mesureEng} onChange={setMesureEng} />
            )}
            <Bascule label="Forme" options={formes} valeur={formeEff} onChange={setForme} />
            <Bascule label="Découpe" options={DECOUPES} valeur={decoupe} onChange={setDecoupe} />
          </div>
        )}
        <p className="social-sous-titre">{sousTitre}</p>

        {vue === "presence" && (
          <table className="social-presence">
            <thead>
              <tr>
                <th scope="col" />
                {PLATEFORMES.map((p) => (
                  <th key={p} scope="col">
                    {NOMS_PLATEFORMES[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.partis.map((k) => (
                <tr key={k}>
                  <th scope="row" title={data.partiInfo[k].nom}>
                    {data.partiInfo[k].sigle}
                  </th>
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
          <ol className="social-barres social-audience">
            {audience.length === 0 && <li className="social-vide">Aucun compte dans cette sélection.</li>}
            {audience.map((a) => (
              <li key={`${a.plateforme}-${a.nom}-${a.abonnes}`}>
                <span className="social-nom">
                  {a.nom}
                  <span className="social-meta">
                    {data.partiInfo[a.party].sigle} · {NOMS_PLATEFORMES[a.plateforme]}
                  </span>
                </span>
                <span className="social-piste">
                  <i
                    style={{
                      width: `${(100 * a.abonnes) / audience[0].abonnes}%`,
                      background: data.partiInfo[a.party].couleur,
                    }}
                  />
                </span>
                <span className="social-valeur">{nombreFr(a.abonnes)}</span>
              </li>
            ))}
          </ol>
        )}

        {graphique && formeEff === "barres" && <Barres data={data} blocs={parElement(data, rows, pans, m)} m={m} />}
        {graphique && formeEff === "parts" && <Parts data={data} blocs={parElement(data, rows, pans, m)} m={m} />}
        {graphique &&
          formeEff === "temps" &&
          (() => {
            const s = series(data, rows, pans, m, f);
            const libelles = s.debuts.map((i) => data.jours[i]);
            return (
              <div className={`social-panneaux${s.panneaux.length > 1 ? " multiples" : ""}`}>
                {s.panneaux.map((p) => (
                  <div key={p.panneau.cle} className="social-panneau">
                    {titrePanneau(data, p.panneau) && (
                      <div className="social-panneau-titre">{titrePanneau(data, p.panneau)}</div>
                    )}
                    <Courbes
                      data={data}
                      jours={libelles}
                      hebdo={s.hebdo}
                      s={p.series}
                      m={m}
                      compact={s.panneaux.length > 1}
                    />
                  </div>
                ))}
                <p className="social-note">
                  {s.hebdo ? "Par semaine : la période dépasse 45 jours." : "Par jour."}
                  {s.panneaux.length > 1 ? " Chaque panneau a sa propre échelle." : ""}
                </p>
              </div>
            );
          })()}

        {vue === "palmares" && (
          <>
            <ol className="social-palmares">
              {tops.length === 0 && <li className="social-vide">Aucune publication dans cette sélection.</li>}
              {tops.map((p, i) => (
                <li key={`${p.url ?? ""}-${i}`}>
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
            {palmaresApproche(data, f) && (
              <p className="social-note">
                Classement approché&nbsp;: il est tiré des 10 publications les plus aimées de chaque jour et de chaque
                plateforme, sur les 60 derniers jours.
              </p>
            )}
          </>
        )}
      </section>
      <div className="module-last-updated">
        {data.lastUpdated} · Module expérimental, visible sur le miroir de travail seulement.
      </div>
    </>
  );
}
