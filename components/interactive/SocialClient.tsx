"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { PartyKey } from "@/lib/data/parties";
import {
  COULEURS_PLATEFORMES,
  LOGOS_PLATEFORMES,
  NOMS_PLATEFORMES,
  NOMS_TYPES,
  PLATEFORMES,
  TYPES,
  type Circo,
  type CompteCirco,
  type FilItem,
  type CubeRow,
  type Plateforme,
  type SocialData,
  type TypeCompte,
} from "@/lib/data/social-meta";
import {
  integration,
  lignes,
  meneur,
  palmares,
  palmaresApproche,
  panneaux,
  parElement,
  parJour,
  segments,
  series,
  totaux,
  treemap,
  valeur,
  type Decoupe,
  type Element,
  type Filtres,
  type Mesure,
  type Panneau,
  type PeriodeCarte,
} from "@/lib/data/social-calc";
import { MONTHS_FR } from "@/lib/dates";

type Vue = "presence" | "audience" | "publications" | "engagement" | "palmares" | "carte";
type Forme = "barres" | "parts" | "temps";

const VUES: { cle: Vue; libelle: string }[] = [
  { cle: "presence", libelle: "Présence" },
  { cle: "audience", libelle: "Audience" },
  { cle: "publications", libelle: "Publications" },
  { cle: "engagement", libelle: "Engagement" },
  { cle: "palmares", libelle: "Palmarès" },
  { cle: "carte", libelle: "Carte" },
];
const PERIODES_CARTE: { cle: PeriodeCarte; libelle: string }[] = [
  { cle: "7j", libelle: "7 derniers jours" },
  { cle: "campagne", libelle: "Depuis le déclenchement" },
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
  icone,
}: {
  options: { cle: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
  label: string;
  /** Boutons en icônes, comme la démo : le libellé passe en aria-label et en infobulle. */
  icone?: (cle: T) => ReactNode;
}) {
  return (
    <div className={`social-bascule${icone ? " icones" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.cle}
          className={o.cle === v ? "active" : undefined}
          aria-pressed={o.cle === v}
          aria-label={icone ? o.libelle : undefined}
          title={icone ? o.libelle : undefined}
          onClick={() => onChange(o.cle)}
        >
          {icone ? icone(o.cle) : o.libelle}
        </button>
      ))}
    </div>
  );
}

/** Logo d'une plateforme (Simple Icons), dans la couleur du texte. */
function Logo({ p, taille = 14 }: { p: Plateforme; taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true" className="social-logo">
      <path d={LOGOS_PLATEFORMES[p]} fill="currentColor" />
    </svg>
  );
}

/** Plateforme nommée par son logo ; le nom reste pour les lecteurs d'écran. */
function Plateforme_({ p, taille = 13 }: { p: Plateforme; taille?: number }) {
  return (
    <span className="social-plateforme" title={NOMS_PLATEFORMES[p]}>
      <Logo p={p} taille={taille} />
      <span className="visually-hidden">{NOMS_PLATEFORMES[p]}</span>
    </span>
  );
}

/** Icônes des formes et des découpes, reprises de la démo. */
function IconeForme({ f }: { f: Forme }) {
  if (f === "barres")
    return (
      <svg viewBox="0 0 34 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="4" />
        <rect x="3" y="10" width="28" height="4" />
        <rect x="3" y="16" width="12" height="4" />
      </svg>
    );
  if (f === "parts")
    return (
      <svg viewBox="0 0 34 24" aria-hidden="true">
        <rect x="3" y="3" width="16" height="11" />
        <rect x="21" y="3" width="10" height="7" />
        <rect x="3" y="16" width="16" height="5" />
        <rect x="21" y="12" width="10" height="9" />
      </svg>
    );
  return (
    <svg viewBox="0 0 34 24" aria-hidden="true" className="trait">
      <polyline points="3,19 11,12 18,15 31,5" />
      <polyline points="3,21 12,17 20,19 31,12" opacity="0.5" />
    </svg>
  );
}
function IconeDecoupe({ d, data }: { d: Decoupe; data: SocialData }) {
  if (d === "ensemble")
    return (
      <svg viewBox="0 0 34 24" aria-hidden="true">
        <rect x="4" y="5" width="26" height="14" />
      </svg>
    );
  if (d === "plateforme")
    return (
      <span className="social-icone-logos" aria-hidden="true">
        {PLATEFORMES.map((p) => (
          <Logo key={p} p={p} taille={11} />
        ))}
      </span>
    );
  return (
    <svg viewBox="0 0 34 24" aria-hidden="true">
      {data.partis.map((k, i) => (
        <circle key={k} cx={4 + i * 6.5} cy={12} r={2.9} style={{ fill: data.partiInfo[k].couleur }} />
      ))}
    </svg>
  );
}

/** Boutons à cocher : au moins un reste actif. */
function Coches<T extends string>({
  options,
  actifs,
  onChange,
  label,
  couleur,
  icone,
}: {
  options: { cle: T; libelle: string }[];
  actifs: T[];
  onChange: (v: T[]) => void;
  label: string;
  couleur?: (c: T) => string;
  icone?: (c: T) => ReactNode;
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
              aria-label={icone ? o.libelle : undefined}
              title={icone ? o.libelle : undefined}
            >
              {icone ? icone(o.cle) : o.libelle}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function titrePanneau(data: SocialData, p: Panneau): ReactNode {
  if (p.party) return data.partiInfo[p.party].nom;
  if (p.plateforme) return <Plateforme_ p={p.plateforme} taille={16} />;
  return null;
}
function nomElement(data: SocialData, e: Element) {
  return e.party ? data.partiInfo[e.party].sigle : NOMS_PLATEFORMES[e.plateforme!];
}
function couleurElement(data: SocialData, e: Element, p?: Panneau) {
  if (e.party) return data.partiInfo[e.party].couleur;
  // Dans les panneaux « Par parti », les éléments sont des plateformes : la
  // couleur reste celle du parti, la texture dit la plateforme (comme la démo).
  if (p?.party) return data.partiInfo[p.party].couleur;
  return COULEURS_PLATEFORMES[e.plateforme!];
}
/** Texture d'une plateforme : Facebook plein, Instagram hachuré, TikTok pointillé. */
const texture = (p: Plateforme | null | undefined) => (p ? ` tex-${p}` : "");
const formatMesure = (m: Mesure) => (v: number) => (m === "parPublication" ? nombreFr(v, 1) : nombreFr(v));

type Blocs = ReturnType<typeof parElement>;

/**
 * Barres, comme la démo : une barre par élément, découpée par plateforme
 * (couleur du parti ; Facebook plein, Instagram hachuré, TikTok pointillé ;
 * logo dans le segment quand il y tient), total au bout. Sans légende : les
 * logos la portent.
 */
function Barres({
  data,
  rows,
  pans,
  m,
}: {
  data: SocialData;
  rows: CubeRow[];
  pans: Panneau[];
  m: Mesure;
}) {
  const blocs = pans.map((pan) => ({
    panneau: pan,
    barres: pan.elements.map((el) => {
      const sg = segments(data, rows, pan, el, m);
      return { element: el, segments: sg, total: m === "parPublication" ? (sg[0]?.valeur ?? 0) : sg.reduce((a, b) => a + b.valeur, 0) };
    }),
  }));
  const max = Math.max(1e-9, ...blocs.flatMap((b) => b.barres.map((x) => x.total)));
  const multiples = blocs.length > 1;
  const seuilLogo = multiples ? 9 : 5; // % de la piste sous lequel le logo ne tient pas
  return (
    <div className={`social-panneaux${multiples ? " multiples" : ""}`}>
      {blocs.map((b) => (
        <div key={b.panneau.cle} className="social-panneau">
          {titrePanneau(data, b.panneau) && <div className="social-panneau-titre">{titrePanneau(data, b.panneau)}</div>}
          <ol className={`social-barres social-barres-empilees${multiples ? " compactes" : ""}`}>
            {b.barres.map((x) => {
              const couleur = couleurElement(data, x.element, b.panneau);
              const detail = x.segments
                .map((sg) => `${sg.plateforme ? NOMS_PLATEFORMES[sg.plateforme] : ""} ${formatMesure(m)(sg.valeur)}`.trim())
                .join(" · ");
              return (
                <li key={x.element.cle}>
                  <span className="social-nom">
                    {x.element.plateforme && !x.element.party ? <Logo p={x.element.plateforme} /> : nomElement(data, x.element)}
                  </span>
                  <span
                    className="social-piste"
                    role="img"
                    aria-label={`${nomElement(data, x.element)}\u00a0: ${formatMesure(m)(x.total)} ${NOMS_MESURES[m]}${detail ? ` (${detail})` : ""}`}
                  >
                    {/* La barre occupe sa part de la piste, total réservé au bout. */}
                    <span className="social-segments" style={{ width: `calc((100% - 5rem) * ${x.total / max})` }}>
                      {x.segments.map((sg, k) => {
                        const part = x.total > 0 ? sg.valeur / x.total : 0;
                        return (
                          <i
                            key={sg.plateforme ?? k}
                            // Texture seulement là où des plateformes se côtoient dans la barre.
                            className={x.segments.length > 1 ? texture(sg.plateforme) : undefined}
                            style={{ width: `${100 * part}%`, background: couleur }}
                            title={`${sg.plateforme ? NOMS_PLATEFORMES[sg.plateforme] + "\u00a0: " : ""}${formatMesure(m)(sg.valeur)} ${NOMS_MESURES[m]}`}
                          >
                            {sg.plateforme && (100 * sg.valeur) / max >= seuilLogo && <Logo p={sg.plateforme} />}
                          </i>
                        );
                      })}
                    </span>
                    <span className="social-valeur">{formatMesure(m)(x.total)}</span>
                  </span>
                </li>
              );
            })}
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
                      className={`social-tuile${texture(t.item.plateforme)}`}
                      style={{
                        left: `${100 * t.x0}%`,
                        top: `${100 * t.y0}%`,
                        width: `${100 * (t.x1 - t.x0)}%`,
                        height: `${100 * (t.y1 - t.y0)}%`,
                        background: couleurElement(data, t.item, b.panneau),
                      }}
                    >
                      {lisible && (
                        <span aria-hidden="true">
                          <b>{t.item.plateforme && !t.item.party ? <Logo p={t.item.plateforme} taille={16} /> : nom}</b>
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
  panneau,
  compact = false,
}: {
  data: SocialData;
  jours: string[];
  hebdo: boolean;
  s: { element: Element; valeurs: number[] }[];
  m: Mesure;
  panneau?: Panneau;
  compact?: boolean;
}) {
  // Dans un panneau « Par parti », les courbes sont des plateformes : couleur du
  // parti, trait plein (Facebook), tireté (Instagram) ou pointillé (TikTok).
  const tirets: Record<Plateforme, string | undefined> = { facebook: undefined, instagram: "6 4", tiktok: "1.5 3.5" };
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
                stroke={couleurElement(data, c.element, panneau)}
                strokeDasharray={c.element.plateforme && !c.element.party ? tirets[c.element.plateforme] : undefined}
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
              style={{ top: `${y(c.valeurs[0])}%`, background: couleurElement(data, c.element, panneau) }}
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
            style={{ top: `${f.y}%`, color: couleurElement(data, f.c.element, panneau) }}
            title={nomElement(data, f.c.element)}
          >
            {f.c.element.plateforme && !f.c.element.party ? <Logo p={f.c.element.plateforme} /> : nomElement(data, f.c.element)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Une publication (palmarès, fil d'une circonscription) ─────────────────────
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function IconeLecture() {
  return (
    <svg className="social-lecture" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" />
      <path d="M16 12.5v15l12-7.5z" />
    </svg>
  );
}

/** La vignette, ou à sa place un emplacement de même taille : ▶ et logo pour
 *  une vidéo sans image, logo seul pour une publication sans média. Le texte
 *  reste ainsi aligné, et l'image comme l'emplacement mènent à la publication. */
/** Le lecteur OFFICIEL de la plateforme, dans une fenêtre modale (<dialog> :
 *  Échap ferme, le reste de la page est inerte, le focus revient au bouton).
 *  L'iframe n'existe qu'une fois la fenêtre ouverte : aucune requête vers la
 *  plateforme avant le clic. Le site n'héberge aucune vidéo. */
function Lecteur({
  p,
  ouvert,
  onClose,
}: {
  p: Pick<FilItem, "plateforme" | "url" | "nom">;
  ouvert: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const lecteur = integration(p.plateforme, p.url);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);
  const nom = NOMS_PLATEFORMES[p.plateforme];
  return (
    <dialog
      ref={ref}
      className="social-lecteur"
      aria-label={`Vidéo de ${p.nom} sur ${nom}`}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`social-lecteur-cadre ${lecteur?.format ?? "portrait"}`}>
        <div className="social-lecteur-tete">
          <Plateforme_ p={p.plateforme} taille={16} />
          <span>{p.nom}</span>
          <button type="button" className="social-lecteur-fermer" onClick={onClose} aria-label="Fermer la vidéo">
            ×
          </button>
        </div>
        {ouvert && lecteur && (
          <iframe
            src={lecteur.src}
            title={`Vidéo de ${p.nom}, lecteur ${nom}`}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
        <p className="social-lecteur-pied">
          Lecteur servi par {nom}, qui peut déposer ses propres témoins.{" "}
          {p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              Voir sur {nom}
            </a>
          )}
        </p>
      </div>
    </dialog>
  );
}

function Media({ p }: { p: Pick<FilItem, "vignette" | "media" | "plateforme" | "url" | "nom"> }) {
  const video = p.media === "video";
  const [ouvert, setOuvert] = useState(false);
  const corps = p.vignette ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- export statique, vignette déjà réduite */}
      <img src={p.vignette} alt="" loading="lazy" width={240} height={240} />
      {video && <IconeLecture />}
    </>
  ) : (
    <span className={`social-media-vide${video ? " video" : ""}`}>
      {video && <IconeLecture />}
      <span className="social-media-coin">
        <Logo p={p.plateforme} taille={14} />
      </span>
    </span>
  );
  const quoi = video ? "Vidéo" : p.vignette ? "Image" : "Publication";
  const libelle = `${quoi} de ${p.nom} sur ${NOMS_PLATEFORMES[p.plateforme]}`;
  if (video && integration(p.plateforme, p.url)) {
    return (
      <>
        <button
          type="button"
          className="social-media"
          aria-label={`Lire la vidéo de ${p.nom} (${NOMS_PLATEFORMES[p.plateforme]})`}
          title="Lire la vidéo"
          onClick={() => setOuvert(true)}
        >
          {corps}
        </button>
        <Lecteur p={p} ouvert={ouvert} onClose={() => setOuvert(false)} />
      </>
    );
  }
  return p.url ? (
    <a className="social-media" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={libelle} title={libelle}>
      {corps}
    </a>
  ) : (
    <span className="social-media" role="img" aria-label={libelle}>
      {corps}
    </span>
  );
}

export function CartePublication({ data, p, rang }: { data: SocialData; p: FilItem; rang?: number }) {
  return (
    <li className="social-publication">
      <Media p={p} />
      <div className="social-palmares-tete">
        {rang != null && <span className="social-rang">{rang}</span>}
        <span className="social-nom" style={{ color: data.partiInfo[p.party].couleur }}>
          {p.nom}
        </span>
        <span className="social-meta">
          <Plateforme_ p={p.plateforme} /> {data.partiInfo[p.party].sigle} · {jourCourt(p.jour)}
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
  );
}

// Fils des circonscriptions : un fichier statique chacun, lu une seule fois
// par visite et partagé entre l'infobulle (10 publications) et la fiche (20).
const filLus = new Map<number, FilItem[] | null>();
const filEnCours = new Map<number, Promise<void>>();
function chargeFil(code: number) {
  if (!filEnCours.has(code)) {
    filEnCours.set(
      code,
      fetch(`${BASE_PATH}/reseaux/fil/${code}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((fil: unknown) => {
          filLus.set(code, Array.isArray(fil) ? (fil as FilItem[]) : null);
        }),
    );
  }
  return filEnCours.get(code)!;
}
function useFil(code: number | null): { fil: FilItem[] | null; charge: boolean } {
  const [, relire] = useState(0);
  useEffect(() => {
    if (code == null || filLus.has(code)) return;
    let vivant = true;
    chargeFil(code).then(() => vivant && relire((n) => n + 1));
    return () => {
      vivant = false;
    };
  }, [code]);
  if (code == null) return { fil: null, charge: false };
  return filLus.has(code) ? { fil: filLus.get(code)!, charge: false } : { fil: null, charge: true };
}

const MOIS_BREF = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const jourBref = (iso: string) => `${Number(iso.slice(8, 10))} ${MOIS_BREF[Number(iso.slice(5, 7)) - 1]}`;

/** Le fil d'une circonscription : son fichier statique, chargé à l'ouverture
 *  de la fiche (app/reseaux/fil/[fichier]/route.ts), filtré par plateforme et
 *  par parti comme le reste du module. */
function Fil({
  data,
  code,
  plateformes,
  partis,
}: {
  data: SocialData;
  code: number;
  plateformes: Plateforme[];
  partis: PartyKey[];
}) {
  const etat = useFil(code);
  if (etat.charge) return <p className="social-note">Chargement du fil…</p>;
  if (!etat.fil) return <p className="social-note">Le fil de cette circonscription est indisponible.</p>;
  const fil = etat.fil.filter((p) => plateformes.includes(p.plateforme) && partis.includes(p.party));
  return (
    <div className="social-fil">
      <h4>Fil des candidats</h4>
      {fil.length === 0 ? (
        <p className="social-note">Aucune publication récente dans cette sélection.</p>
      ) : (
        <ol className="social-palmares">
          {fil.map((p, i) => (
            <CartePublication key={`${p.url ?? ""}-${i}`} data={data} p={p} />
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Carte des circonscriptions ────────────────────────────────────────────────
// Les tracés sont écrits UNE fois dans <defs> et repris par <use> dans la carte
// et ses deux encarts : trois vues pour le poids d'une. Au clavier, la liste
// des circonscriptions remplace les 127 formes (autant d'arrêts de tabulation).
const ENCARTS = [
  { cle: "montreal", titre: "Grand Montréal" },
  { cle: "quebec", titre: "Québec" },
] as const;

/** Au survol ou au focus d'une circonscription : nom, région, parti en tête,
 *  et chaque candidat suivi avec les logos de ses comptes et ses publications
 *  de la période. Décorative pour les lecteurs d'écran (aria-hidden) : le
 *  libellé de la forme et la fiche portent la même information. */
function Infobulle({
  data,
  circo,
  m,
  periode,
  plateformes,
  partis,
  x,
  y,
  largeur,
  hauteur,
  epinglee = false,
  onFermer,
  onFiche,
}: {
  epinglee?: boolean;
  onFermer?: () => void;
  onFiche?: () => void;
  data: SocialData;
  circo: Circo;
  m: ReturnType<typeof meneur>;
  periode: PeriodeCarte;
  plateformes: Plateforme[];
  partis: PartyKey[];
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}) {
  const aGauche = x > largeur - 360;
  const enHaut = y > hauteur * 0.5;
  // Écran étroit : l'infobulle prend toute la largeur, jamais coupée.
  const etroit = largeur < 600;
  const etat = useFil(circo.code);
  const fil = (etat.fil ?? []).filter((p) => plateformes.includes(p.plateforme) && partis.includes(p.party)).slice(0, 10);
  const lignes = data.partis
    .filter((k) => partis.includes(k))
    .map((k) => ({ k, comptes: circo.comptes.filter((c) => c.party === k && plateformes.includes(c.plateforme)) }))
    .filter((l) => l.comptes.length > 0);
  return (
    <div
      className={`social-infobulle${epinglee ? " epinglee" : ""}${etroit ? " etroite" : ""}`}
      {...(epinglee ? { role: "dialog", "aria-label": `${circo.nom}\u00a0: dernières publications` } : { "aria-hidden": true })}
      style={
        etroit
          ? { left: 0, right: 0, top: enHaut ? undefined : y + 16, bottom: enHaut ? hauteur - y + 16 : undefined }
          : {
              left: aGauche ? undefined : x + 16,
              right: aGauche ? largeur - x + 16 : undefined,
              top: enHaut ? undefined : y + 16,
              bottom: enHaut ? hauteur - y + 16 : undefined,
            }
      }
    >
      {epinglee && (
        <button type="button" className="social-infobulle-fermer" onClick={onFermer} aria-label="Fermer l’infobulle">
          ×
        </button>
      )}
      <strong>{circo.nom}</strong>
      <span className="social-meta">{circo.region}</span>
      <div className="social-infobulle-tete">
        {m.party ? (
          <>
            <span className="social-fiche-parti" style={{ background: data.partiInfo[m.party].couleur }}>
              {data.partiInfo[m.party].sigle}
            </span>{" "}
            en tête {periode === "7j" ? "sur 7 jours" : "depuis le déclenchement"}
          </>
        ) : m.jaime > 0 ? (
          "Égalité entre partis"
        ) : m.publications > 0 ? (
          "Aucun j’aime sur la période"
        ) : (
          "Aucune publication sur la période"
        )}
      </div>
      {lignes.length === 0 ? (
        <div className="social-meta">Aucun compte de candidat suivi</div>
      ) : (
        <ul>
          {lignes.map(({ k, comptes }) => {
            const n = comptes.reduce((s, c) => s + (periode === "7j" ? c.jaime7j : c.jaimeCampagne), 0);
            return (
              <li key={k}>
                <span className="social-infobulle-sigle" style={{ color: data.partiInfo[k].couleur }}>
                  {data.partiInfo[k].sigle}
                </span>
                <span className="social-infobulle-nom">{comptes[0].nom}</span>
                <span className="social-infobulle-logos">
                  {comptes.map((c) => (
                    <Logo key={c.plateforme} p={c.plateforme} taille={12} />
                  ))}
                </span>
                <span className="social-infobulle-n">{nombreFr(n)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="social-infobulle-fil">
        <span className="social-meta">Dernières publications</span>
        {etat.charge ? (
          // En attendant le fichier : la dernière publication, déjà dans les props.
          circo.derniere ? (
            <ol>
              <li>
                <Logo p={circo.derniere.plateforme} taille={11} />
                <b style={{ color: data.partiInfo[circo.derniere.party].couleur }}>
                  {data.partiInfo[circo.derniere.party].sigle}
                </b>
                <span className="social-infobulle-date">{jourBref(circo.derniere.jour)}</span>
                <span className="social-infobulle-texte">{circo.derniere.extrait}</span>
                <span className="social-infobulle-n">…</span>
              </li>
            </ol>
          ) : (
            <span className="social-meta">Chargement du fil…</span>
          )
        ) : fil.length === 0 ? (
          <span className="social-meta">Aucune publication récente dans cette sélection</span>
        ) : (
          <ol>
            {fil.map((p, i) => (
              <li key={`${p.url ?? ""}-${i}`}>
                <Logo p={p.plateforme} taille={11} />
                <b style={{ color: data.partiInfo[p.party].couleur }}>{data.partiInfo[p.party].sigle}</b>
                <span className="social-infobulle-date">{jourBref(p.jour)}</span>
                <span className="social-infobulle-texte">{p.texte || "(sans texte)"}</span>
                <span className="social-infobulle-n">{nombreFr(p.jaime)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {epinglee ? (
        <button type="button" className="social-infobulle-fiche" onClick={onFiche}>
          Voir la fiche complète
        </button>
      ) : (
        <span className="social-infobulle-pied">j’aime · cliquez pour épingler et faire défiler le fil</span>
      )}
    </div>
  );
}

/** Recherche d'une circonscription ou d'un candidat (insensible aux accents),
 *  en liste de suggestions accessible au clavier (motif « combobox »). */
// Sans accents ni tirets ni apostrophes : « anjou louis » trouve « Anjou–Louis-Riel ».
const sansAccents = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[-\u2010-\u2015'’]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
type Suggestion = { cle: string; code: number; nom: string; sous: string };

export function suggestions(data: SocialData, requete: string, max = 8): Suggestion[] {
  const q = sansAccents(requete.trim());
  if (q.length < 2 || !data.carte) return [];
  const toutes: Suggestion[] = [];
  for (const c of data.carte.circos) {
    toutes.push({ cle: `c${c.code}`, code: c.code, nom: c.nom, sous: c.region });
    const vus = new Set<string>();
    for (const k of c.comptes) {
      if (vus.has(k.nom)) continue;
      vus.add(k.nom);
      toutes.push({ cle: `p${c.code}-${k.nom}`, code: c.code, nom: k.nom, sous: `${c.nom} · ${data.partiInfo[k.party].sigle}` });
    }
  }
  const rang = (s: Suggestion) => {
    const n = sansAccents(s.nom);
    if (n.startsWith(q)) return 0;
    if (n.split(" ").some((m) => m.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return toutes
    .map((s) => ({ s, r: rang(s) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.s.nom.localeCompare(b.s.nom, "fr"))
    .slice(0, max)
    .map((x) => x.s);
}

function Recherche({ data, onChoisir }: { data: SocialData; onChoisir: (code: number) => void }) {
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [i, setI] = useState(0);
  const liste = useMemo(() => suggestions(data, texte), [data, texte]);
  const choisir = (sg: Suggestion) => {
    setTexte(sg.nom);
    setOuvert(false);
    onChoisir(sg.code);
  };
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOuvert(true);
      if (liste.length) setI((n) => (n + (e.key === "ArrowDown" ? 1 : -1) + liste.length) % liste.length);
    } else if (e.key === "Enter" && ouvert && liste[i]) {
      e.preventDefault();
      choisir(liste[i]);
    } else if (e.key === "Escape") {
      setOuvert(false);
    }
  };
  const visible = ouvert && liste.length > 0;
  return (
    <div className="social-recherche">
      <label htmlFor="social-recherche-champ" className="visually-hidden">
        Chercher une circonscription ou un candidat
      </label>
      <input
        id="social-recherche-champ"
        type="search"
        role="combobox"
        autoComplete="off"
        placeholder="Circonscription ou candidat·e"
        aria-expanded={visible}
        aria-controls="social-recherche-liste"
        aria-autocomplete="list"
        aria-activedescendant={visible ? `social-sg-${liste[i]?.cle}` : undefined}
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          setOuvert(true);
          setI(0);
        }}
        onKeyDown={touche}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
      />
      {visible && (
        <ul id="social-recherche-liste" role="listbox" aria-label="Suggestions">
          {liste.map((sg, n) => (
            <li
              key={sg.cle}
              id={`social-sg-${sg.cle}`}
              role="option"
              aria-selected={n === i}
              className={n === i ? "actif" : undefined}
              onPointerDown={(e) => {
                e.preventDefault();
                choisir(sg);
              }}
            >
              <span>{sg.nom}</span>
              <small>{sg.sous}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Carte({
  data,
  plateformes,
  partis,
}: {
  data: SocialData;
  plateformes: Plateforme[];
  partis: PartyKey[];
}) {
  const carte = data.carte!;
  const [periode, setPeriode] = useState<PeriodeCarte>("campagne");
  const [choix, setChoix] = useState<number | null>(null);
  const meneurs = useMemo(
    () => new Map(carte.circos.map((c) => [c.code, meneur(c.comptes, periode, plateformes, partis)])),
    [carte, periode, plateformes, partis],
  );
  const circo = carte.circos.find((c) => c.code === choix) ?? null;
  // Ordre du clavier et de la liste : par région, puis par nom.
  const ordre = useMemo(
    () => [...carte.circos].sort((a, b) => a.region.localeCompare(b.region, "fr") || a.nom.localeCompare(b.nom, "fr")),
    [carte],
  );
  const regions = useMemo(() => [...new Set(ordre.map((c) => c.region))], [ordre]);
  const [actif, setActif] = useState<number>(ordre[0]?.code ?? 0);
  // Souris ou clavier : quitter une forme avec la souris n'efface pas
  // l'infobulle ouverte au clavier, et inversement.
  type Survol = { code: number; x: number; y: number; par: "souris" | "clavier" };
  const [survol, setSurvol] = useState<Survol | null>(null);
  // La fiche est sous la carte : un choix la fait venir à l'écran si elle n'y est pas.
  const ficheRef = useRef<HTMLElement>(null);
  const choisir = (code: number) => {
    setChoix(code);
    requestAnimationFrame(() => {
      const f = ficheRef.current;
      if (!f || f.getBoundingClientRect().top < window.innerHeight - 120) return;
      const doux = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      f.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
    });
  };
  const vuesRef = useRef<HTMLDivElement>(null);
  const place = (code: number, x: number, y: number, par: Survol["par"]) => {
    const r = vuesRef.current?.getBoundingClientRect();
    if (r) setSurvol({ code, x: x - r.left, y: y - r.top, par });
  };
  const efface = (par: Survol["par"]) => setSurvol((s) => (s?.par === par ? null : s));
  // Un clic (ou un toucher, ou Entrée) ÉPINGLE l'infobulle : elle ne suit
  // plus la souris et son fil défile. La fiche en dessous suit la même
  // circonscription sans faire défiler la page ; « Voir la fiche complète » y mène.
  const [epingle, setEpingle] = useState<{ code: number; x: number; y: number } | null>(null);
  const epingler = (code: number, x: number, y: number) => {
    const r = vuesRef.current?.getBoundingClientRect();
    if (!r) return;
    setEpingle({ code, x: x - r.left, y: y - r.top });
    setSurvol(null);
    setChoix(code);
  };
  const epinglerElement = (code: number, el: globalThis.Element | null | undefined) => {
    if (!el) return;
    const b = el.getBoundingClientRect();
    epingler(code, b.left + b.width / 2, b.top + b.height / 2);
  };
  // La forme la plus lisible d'une circonscription : dans un encart si elle y
  // est entière et petite, sinon sur la carte principale.
  const formeDe = (code: number) => {
    const v = vuesRef.current;
    if (!v) return null;
    for (const svg of v.querySelectorAll(".social-carte-encarts svg")) {
      const cadre = svg.getBoundingClientRect();
      const u = svg.querySelector(`use[data-code="${code}"]`);
      if (!u) continue;
      const b = u.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      if (b.width < cadre.width * 0.6 && cx > cadre.left && cx < cadre.right && cy > cadre.top && cy < cadre.bottom) return u;
    }
    return v.querySelector(`.social-carte-province use[data-code="${code}"]`);
  };
  const trouver = (code: number) => {
    vuesRef.current?.scrollIntoView({ block: "nearest" });
    requestAnimationFrame(() => epinglerElement(code, formeDe(code)));
  };
  useEffect(() => {
    if (!epingle) return;
    const touche = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setEpingle(null);
    const dehors = (e: globalThis.PointerEvent) => {
      const t = e.target as globalThis.Element | null;
      if (t?.closest(".social-infobulle, .social-carte use, .social-recherche")) return;
      setEpingle(null);
    };
    document.addEventListener("keydown", touche);
    document.addEventListener("pointerdown", dehors);
    return () => {
      document.removeEventListener("keydown", touche);
      document.removeEventListener("pointerdown", dehors);
    };
  }, [epingle]);
  const auFocus = (code: number, el: SVGElement) => {
    const b = el.getBoundingClientRect();
    place(code, b.left + b.width / 2, b.top + b.height / 2, "clavier");
  };
  const clavier = (e: KeyboardEvent<SVGUseElement>, code: number) => {
    const i = ordre.findIndex((c) => c.code === code);
    const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (pas) {
      e.preventDefault();
      const suivant = ordre[(i + pas + ordre.length) % ordre.length].code;
      setActif(suivant);
      const el = vuesRef.current?.querySelector<SVGUseElement>(`.social-carte-province use[data-code="${suivant}"]`);
      el?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      epinglerElement(code, e.currentTarget);
    } else if (e.key === "Escape") {
      efface("clavier");
    }
  };
  const couleur = (code: number) => {
    const k = meneurs.get(code)?.party;
    return k ? data.partiInfo[k].couleur : "var(--social-carte-vide)";
  };
  const titre = (code: number, nom: string) => {
    const m = meneurs.get(code);
    return m?.party
      ? `${nom}\u00a0: ${data.partiInfo[m.party].sigle} en tête, ${nombreFr(m.parParti[m.party]!.jaime)}\u00a0j’aime`
      : `${nom}\u00a0: ${m && m.jaime > 0 ? "égalité" : "aucun j’aime"}`;
  };
  const formes = (encart: boolean) => (
    <g>
      {(encart ? carte.circos : ordre).map((c) => (
        <use
          key={c.code}
          href={`#sc-circo-${c.code}`}
          data-code={c.code}
          fill={couleur(c.code)}
          className={c.code === choix ? "choisie" : undefined}
          onClick={(e) => epingler(c.code, e.clientX, e.clientY)}
          onPointerMove={(e) => e.pointerType !== "touch" && !epingle && place(c.code, e.clientX, e.clientY, "souris")}
          onPointerLeave={() => efface("souris")}
          // Carte principale : un seul arrêt de tabulation, les flèches font le reste.
          {...(encart
            ? {}
            : {
                tabIndex: c.code === actif ? 0 : -1,
                role: "button",
                "aria-label": `${titre(c.code, c.nom)}. Entrée pour épingler son infobulle et son fil.`,
                onFocus: (e: FocusEvent<SVGUseElement>) => {
                  setActif(c.code);
                  if (!epingle) auFocus(c.code, e.currentTarget);
                },
                onBlur: () => efface("clavier"),
                onKeyDown: (e: KeyboardEvent<SVGUseElement>) => clavier(e, c.code),
              })}
        />
      ))}
      {circo && <use href={`#sc-circo-${circo.code}`} className="social-carte-contour" />}
    </g>
  );
  const pub = (c: CompteCirco) => (periode === "7j" ? c.publications7j : c.publicationsCampagne);
  const jaime = (c: CompteCirco) => (periode === "7j" ? c.jaime7j : c.jaimeCampagne);

  return (
    <div className="social-carte">
      <Recherche data={data} onChoisir={trouver} />
      <div className="social-carte-outils">
        <Bascule label="Période de la carte" options={PERIODES_CARTE} valeur={periode} onChange={setPeriode} />
        <label className="social-carte-liste">
          <span>Circonscription</span>
          <select value={choix ?? ""} onChange={(e) => (e.target.value ? trouver(Number(e.target.value)) : setChoix(null))}>
            <option value="">Choisir…</option>
            {regions.map((r) => (
              <optgroup key={r} label={r}>
                {ordre
                  .filter((c) => c.region === r)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.nom}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <ul className="social-carte-legende" aria-label="Parti qui reçoit le plus de j’aime">
        {data.partis
          .filter((k) => partis.includes(k))
          .map((k) => (
            <li key={k}>
              <i style={{ background: data.partiInfo[k].couleur }} />
              {data.partiInfo[k].sigle}
            </li>
          ))}
        <li>
          <i style={{ background: "var(--social-carte-vide)" }} />
          Aucun j’aime
        </li>
      </ul>

      <div className="social-carte-vues" ref={vuesRef}>
        <svg
          className="social-carte-province"
          viewBox={carte.vue.join(" ")}
          role="img"
          aria-label="Carte des circonscriptions, colorées selon le parti dont les candidats y reçoivent le plus de j’aime. Les flèches passent d’une circonscription à l’autre, par région, et Entrée épingle son infobulle."
        >
          <defs>
            {carte.circos.map((c) => (
              <path key={c.code} id={`sc-circo-${c.code}`} d={c.d} vectorEffect="non-scaling-stroke" />
            ))}
          </defs>
          {formes(false)}
          {ENCARTS.map((e) => {
            const [x, y, w, h] = carte.encarts[e.cle];
            return (
              <rect
                key={e.cle}
                className="social-carte-cadre"
                x={x}
                y={y}
                width={w}
                height={h}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <div className="social-carte-encarts">
          {ENCARTS.map((e) => (
            <figure key={e.cle}>
              <svg viewBox={carte.encarts[e.cle].join(" ")} aria-hidden="true">
                {formes(true)}
              </svg>
              <figcaption>{e.titre}</figcaption>
            </figure>
          ))}
        </div>
        {(() => {
          const b = epingle ?? survol;
          if (!b) return null;
          return (
            <Infobulle
              key={epingle ? `e${b.code}` : "survol"}
              data={data}
              circo={carte.circos.find((c) => c.code === b.code)!}
              m={meneurs.get(b.code)!}
              periode={periode}
              plateformes={plateformes}
              partis={partis}
              x={b.x}
              y={b.y}
              largeur={vuesRef.current?.clientWidth ?? 0}
              hauteur={vuesRef.current?.clientHeight ?? 0}
              epinglee={!!epingle}
              onFermer={() => setEpingle(null)}
              onFiche={() => {
                setEpingle(null);
                choisir(b.code);
              }}
            />
          );
        })()}
      </div>

      <section className="social-fiche" aria-live="polite" ref={ficheRef}>
        {!circo ? (
          <p className="social-note">Choisissez une circonscription sur la carte ou dans la liste.</p>
        ) : (
          <>
            <h3>{circo.nom}</h3>
            <ul>
              {data.partis.map((k) => {
                const comptes = circo.comptes.filter((c) => c.party === k);
                const nom = comptes[0]?.nom;
                const p = comptes.reduce((s, c) => s + pub(c), 0);
                const j = comptes.reduce((s, c) => s + jaime(c), 0);
                return (
                  <li key={k}>
                    <div className="social-fiche-tete">
                      <span className="social-fiche-parti" style={{ background: data.partiInfo[k].couleur }}>
                        {data.partiInfo[k].sigle}
                      </span>
                      <span className="social-nom">{nom ?? "Aucun compte suivi"}</span>
                    </div>
                    {comptes.length > 0 && (
                      <>
                        <div className="social-fiche-comptes">
                          {comptes.map((c) => {
                            const contenu = (
                              <>
                                <Plateforme_ p={c.plateforme} taille={16} />
                                {c.abonnes != null ? `${nombreFr(c.abonnes)} abonnés` : "abonnés inconnus"}
                              </>
                            );
                            return c.url ? (
                              <a key={c.plateforme} href={c.url} target="_blank" rel="noopener noreferrer">
                                {contenu}
                              </a>
                            ) : (
                              <span key={c.plateforme}>{contenu}</span>
                            );
                          })}
                        </div>
                        <div className="social-meta">
                          {nombreFr(p)}&nbsp;{p > 1 ? "publications" : "publication"} · {nombreFr(j)}&nbsp;j’aime
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <Fil data={data} code={circo.code} plateformes={plateformes} partis={partis} />
          </>
        )}
      </section>
      <p className="social-note">
        Comptes de candidats seulement ; la période choisie en haut ne s’applique pas à la carte. Comprend des données
        ouvertes octroyées sous la{" "}
        <a href="https://www.dgeq.org/licence.html" target="_blank" rel="noopener noreferrer">
          licence d’utilisation des données ouvertes du directeur général des élections
        </a>{" "}
        disponible à l’adresse Web dgeq.org. L’octroi de la licence n’implique aucune approbation par le directeur
        général des élections de l’utilisation des données ouvertes qui en est faite.
      </p>
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
  const vues = data.carte ? VUES : VUES.filter((v) => v.cle !== "carte");
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
          : vue === "carte"
            ? "Chaque circonscription prend la couleur du parti dont les candidats y reçoivent le plus de j’aime sur la période."
          : m === "parPublication"
            ? "J’aime par publication : total des j’aime divisé par le nombre de publications de la période."
            : `Total des ${NOMS_MESURES[m]} de la période.`;

  return (
    <>
      <section className="social">
        {/* Deux colonnes sur grand écran : tout le tableau de bord à gauche,
            les filtres à droite derrière un filet. Sur mobile, les filtres
            passent entre les chiffres et le graphique. */}
        <div className="social-tdb">
          <div className="social-entete partis-title-row">
            <div className="title-block">
              <h2 className="partis-title">Les candidats sur les réseaux</h2>
              <div className="period-subtitle">
                Du {jourCourt(data.jours[d0])} au {jourCourt(data.jours[d1])} · {nombreFr(nbJours)}
                {nbJours > 1 ? " jours" : " jour"}
              </div>
            </div>
          </div>
          <div className="social-haut">
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
              icone={(p) => <Logo p={p} taille={15} />}
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

          <div className="social-bas">
          <div className="social-onglets">
            <Bascule label="Vue" options={vues} valeur={vue} onChange={setVue} />
          </div>

          {graphique && (
            <div className="social-reglages">
              {vue === "engagement" && (
                <div className="social-reglages-mesure">
                  <Bascule label="Mesure" options={MESURES_ENGAGEMENT} valeur={mesureEng} onChange={setMesureEng} />
                </div>
              )}
              {/* Comme la démo : la forme en haut à gauche, la découpe en haut à droite. */}
              <Bascule
                label="Forme"
                options={formes}
                valeur={formeEff}
                onChange={setForme}
                icone={(c) => <IconeForme f={c} />}
              />
              <Bascule
                label="Découpe"
                options={DECOUPES}
                valeur={decoupe}
                onChange={setDecoupe}
                icone={(c) => <IconeDecoupe d={c} data={data} />}
              />
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
                      <Plateforme_ p={p} taille={18} />
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
                    <Plateforme_ p={a.plateforme} />
                    {a.nom}
                    <span className="social-meta">{data.partiInfo[a.party].sigle}</span>
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

          {graphique && formeEff === "barres" && <Barres data={data} rows={rows} pans={pans} m={m} />}
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
                        panneau={p.panneau}
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

          {vue === "carte" && data.carte && <Carte data={data} plateformes={plateformes} partis={partis} />}

          {vue === "palmares" && (
            <>
              <ol className="social-palmares">
                {tops.length === 0 && <li className="social-vide">Aucune publication dans cette sélection.</li>}
                {tops.map((p, i) => (
                  <CartePublication key={`${p.url ?? ""}-${i}`} data={data} p={p} rang={i + 1} />
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
          </div>
        </div>
      </section>
      <div className="module-last-updated social-pied">
        {data.lastUpdated} · Module expérimental, visible sur le miroir de travail seulement.
      </div>
    </>
  );
}
