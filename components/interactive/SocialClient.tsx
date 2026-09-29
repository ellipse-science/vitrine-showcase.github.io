"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { PartyKey } from "@/lib/data/parties";
import {
  COULEURS_PLATEFORMES,
  LOGOS_PLATEFORMES,
  NOMS_PLATEFORMES,
  NOMS_TYPES,
  nombreFr,
  PLATEFORMES,
  TYPES,
  type AudienceJour,
  type Circo,
  type CompteCirco,
  type FilItem,
  type CubeRow,
  type Plateforme,
  type SocialData,
  type TypeCompte,
} from "@/lib/data/social-meta";
import {
  AUDIENCE_MAX,
  classementAudience,
  integration,
  lignes,
  lignesAbonnes,
  MIN_PUBLICATIONS_MOYENNE,
  meneur,
  MOYENNES,
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
  type MesureAudience,
  type PeriodeCarte,
} from "@/lib/data/social-calc";
import { MONTHS_FR } from "@/lib/dates";

type Vue = "presence" | "partis" | "candidats" | "palmares" | "carte";
/** « Barres et parts » côte à côte, ou « dans le temps ». */
type Forme = "barres" | "temps";

const VUES: { cle: Vue; libelle: string }[] = [
  { cle: "presence", libelle: "Présence" },
  { cle: "partis", libelle: "Partis" },
  { cle: "candidats", libelle: "Candidats" },
  { cle: "palmares", libelle: "Palmarès" },
  { cle: "carte", libelle: "Carte" },
];
/** LA liste des mesures du module : onglets Partis et Candidats, chiffres de
 *  la colonne de droite. Libellé complet, libellé court (bouton), unité, et la
 *  définition d'où viennent les sous-titres. */
const MESURES: { cle: Mesure; libelle: string; court: string; unite: string; definition: string }[] = [
  {
    cle: "abonnes", libelle: "Abonnés", court: "Abonnés", unite: "abonnés",
    definition: "Total des abonnés des comptes suivis, au dernier relevé\u00a0: la période ne s’applique pas.",
  },
  { cle: "publications", libelle: "Publications", court: "Publications", unite: "publications", definition: "Total des publications de la période." },
  {
    cle: "parJour", libelle: "Par jour, en moyenne", court: "Par jour", unite: "publications par jour, en moyenne",
    definition: "Publications par jour, en moyenne sur la période.",
  },
  { cle: "jaime", libelle: "J’aime", court: "J’aime", unite: "j’aime", definition: "Total des j’aime de la période." },
  { cle: "commentaires", libelle: "Commentaires", court: "Commentaires", unite: "commentaires", definition: "Total des commentaires de la période." },
  {
    cle: "parPublication", libelle: "J’aime par publication", court: "J’aime / pub.", unite: "j’aime par publication",
    definition: "J’aime par publication\u00a0: total des j’aime divisé par le nombre de publications de la période.",
  },
];
const MESURE = Object.fromEntries(MESURES.map((x) => [x.cle, x])) as Record<Mesure, (typeof MESURES)[number]>;
/** Titre d'axe des barres, comme la démo (« Nombre de publications »). */
const AXES: Record<Mesure, string> = {
  abonnes: "Nombre d’abonnés",
  publications: "Nombre de publications",
  parJour: "Publications par jour, en moyenne",
  jaime: "Nombre de j’aime",
  commentaires: "Nombre de commentaires",
  parPublication: "J’aime par publication",
};
/** Hauteur d'une rangée de barres (barre + marges), normale et compacte :
 *  le treemap voisin en tire sa hauteur, pour finir avec la dernière barre. */
const RANGEE = { normale: 44, compacte: 36, marge: 7 };

/** Les grands chiffres en Playfair : l'espace fine y disparaît à l'œil
 *  (« 8903 ») ; une espace insécable ordinaire y reste lisible. */
const nombreGrand = (n: number, dec = 0) => nombreFr(n, dec).replace(/\u202f/g, "\u00a0");

/** Vrai sous une largeur d'écran (côté client ; faux au rendu serveur). */
function useEtroit(max = 640) {
  const [etroit, setEtroit] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${max}px)`);
    const maj = () => setEtroit(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, [max]);
  return etroit;
}

/** L'activité par compte et par jour : dans les props (tests), sinon le
 *  fichier statique du site, chargé une fois, seulement si l'on en a besoin. */
let audienceJourLu: Promise<AudienceJour[]> | null = null;
function useAudienceJour(data: SocialData, besoin: boolean): { jours: AudienceJour[]; charge: boolean } {
  const [jours, setJours] = useState<AudienceJour[] | null>(data.audienceJour.length ? data.audienceJour : null);
  useEffect(() => {
    if (!besoin || jours || !data.audienceJourDispo) return;
    let vivant = true;
    audienceJourLu ??= fetch(`${BASE_PATH}/reseaux/audience-jour.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    audienceJourLu.then((j) => vivant && setJours(Array.isArray(j) ? j : []));
    return () => {
      vivant = false;
    };
  }, [besoin, jours, data.audienceJourDispo]);
  return { jours: jours ?? [], charge: besoin && !jours && !!data.audienceJourDispo };
}

/** Audience : 20 comptes par page en deux colonnes de 10 (10 sur mobile),
 *  jusqu'à 50 ; une même échelle d'une page à l'autre (le premier du classement). */
function Audience({
  data,
  mesure,
  plateformes,
  partis,
  types,
  d0,
  d1,
}: {
  data: SocialData;
  mesure: MesureAudience;
  plateformes: Plateforme[];
  partis: PartyKey[];
  types: TypeCompte[];
  d0: number;
  d1: number;
}) {
  const etroit = useEtroit();
  const parPage = etroit ? 10 : 20;
  const [page, setPage] = useState(0);
  const activite = useAudienceJour(data, mesure !== "abonnes");
  const classement = useMemo(
    () => classementAudience(data.audience, activite.jours, mesure, { plateformes, partis, types, d0, d1 }),
    [data, activite.jours, mesure, plateformes, partis, types, d0, d1],
  );
  // Un filtre, une mesure, la période ou la taille des pages change : retour à la page 1.
  useEffect(() => setPage(0), [mesure, plateformes, partis, types, d0, d1, parPage]);
  const pages = Math.max(1, Math.ceil(classement.length / parPage));
  const p = Math.min(page, pages - 1);
  const vus = classement.slice(p * parPage, (p + 1) * parPage);
  const max = classement[0]?.valeur ?? 1;
  const format = (v: number) => (mesure === "parJour" || mesure === "parPublication" ? nombreFr(v, 1) : nombreFr(v));
  const colonnes = etroit ? [vus] : [vus.slice(0, 10), vus.slice(10, 20)].filter((c) => c.length > 0);
  if (activite.charge) return <p className="social-note">Chargement de l’activité des comptes…</p>;
  if (classement.length === 0) return <p className="social-vide">Aucun compte pour ces filtres.</p>;
  return (
    <div className="social-audience-bloc">
      <div className={`social-audience-colonnes${colonnes.length > 1 ? " deux" : ""}`}>
        {colonnes.map((col, n) => (
          <ol key={n} className="social-barres social-audience" start={p * parPage + n * 10 + 1}>
            {col.map(({ item: a, valeur: v }, i) => (
              <li key={`${a.plateforme}-${a.nom}-${a.party}`}>
                <span className="social-nom" title={`${a.nom} · ${data.partiInfo[a.party].sigle}`}>
                  <span className="social-rang-petit">{p * parPage + n * 10 + i + 1}</span>
                  <Plateforme_ p={a.plateforme} />
                  <span className="social-nom-texte">{a.nom}</span>
                  <span className="social-meta">{data.partiInfo[a.party].sigle}</span>
                </span>
                <span className="social-piste">
                  <i style={{ width: `${(100 * v) / max}%`, background: data.partiInfo[a.party].couleur }} />
                </span>
                <span className="social-valeur">{format(v)}</span>
              </li>
            ))}
          </ol>
        ))}
      </div>
      {pages === 1 && (
        <p className="social-meta social-audience-nombre">
          {classement.length}&nbsp;{classement.length > 1 ? "comptes" : "compte"}
        </p>
      )}
      {pages > 1 && (
        <nav className="social-pagination" aria-label="Pages du classement">
          <button type="button" onClick={() => setPage(p - 1)} disabled={p === 0} aria-label="Page précédente">
            ‹
          </button>
          {Array.from({ length: pages }, (_, n) => {
            const de = n * parPage + 1;
            const a = Math.min((n + 1) * parPage, classement.length);
            return (
              <button
                type="button"
                key={n}
                className={n === p ? "actif" : undefined}
                aria-current={n === p ? "page" : undefined}
                onClick={() => setPage(n)}
              >
                {de}–{a}
              </button>
            );
          })}
          <button type="button" onClick={() => setPage(p + 1)} disabled={p === pages - 1} aria-label="Page suivante">
            ›
          </button>
          <span className="social-meta">
            Comptes {p * parPage + 1} à {Math.min((p + 1) * parPage, classement.length)} sur {classement.length}
          </span>
        </nav>
      )}
      {(mesure === "parPublication" || mesure === "parJour") && (
        <p className="social-note">Comptes ayant au moins {MIN_PUBLICATIONS_MOYENNE}&nbsp;publications sur la période.</p>
      )}
    </div>
  );
}

const FORMES: { cle: Forme; libelle: string }[] = [
  { cle: "barres", libelle: "Barres et parts" },
  { cle: "temps", libelle: "Dans le temps" },
];
const DECOUPES: { cle: Decoupe; libelle: string }[] = [
  { cle: "ensemble", libelle: "Ensemble" },
  { cle: "plateforme", libelle: "Par plateforme" },
  { cle: "parti", libelle: "Par parti" },
];
const NOMS_MESURES = Object.fromEntries(MESURES.map((x) => [x.cle, x.unite])) as Record<Mesure, string>;

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
  court,
  desactives,
  classe,
}: {
  options: { cle: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
  label: string;
  /** Boutons en icônes, comme la démo : le libellé passe en aria-label et en infobulle. */
  icone?: (cle: T) => ReactNode;
  /** Libellé court dans le bouton, le complet en aria-label et en infobulle. */
  court?: (cle: T) => string;
  /** Boutons grisés (pas masqués), avec la raison en infobulle. */
  desactives?: Partial<Record<T, string>>;
  classe?: string;
}) {
  return (
    <div className={`social-bascule${icone ? " icones" : ""}${classe ? ` ${classe}` : ""}`} role="group" aria-label={label}>
      {options.map((o) => {
        const raison = desactives?.[o.cle];
        const nomme = !!icone || !!court;
        return (
          <button
            type="button"
            key={o.cle}
            className={o.cle === v ? "active" : undefined}
            aria-pressed={o.cle === v}
            aria-label={nomme ? o.libelle : undefined}
            title={raison ?? (nomme ? o.libelle : undefined)}
            disabled={!!raison}
            onClick={() => onChange(o.cle)}
          >
            {icone ? icone(o.cle) : court ? court(o.cle) : o.libelle}
          </button>
        );
      })}
    </div>
  );
}

/** Logo d'une plateforme (Simple Icons), dans la couleur du texte. */
export function Logo({ p, taille = 14 }: { p: Plateforme; taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true" className="social-logo">
      <path d={LOGOS_PLATEFORMES[p]} fill="currentColor" />
    </svg>
  );
}

/** Plateforme nommée par son logo ; le nom reste pour les lecteurs d'écran. */
export function Plateforme_({ p, taille = 13 }: { p: Plateforme; taille?: number }) {
  return (
    <span className="social-plateforme" title={NOMS_PLATEFORMES[p]}>
      <Logo p={p} taille={taille} />
      <span className="visually-hidden">{NOMS_PLATEFORMES[p]}</span>
    </span>
  );
}

/** Icônes des formes et des découpes, reprises de la démo. */
function IconeForme({ f }: { f: Forme }) {
  // Barres et parts côte à côte : les deux icônes de la démo dans un bouton.
  if (f === "barres")
    return (
      <svg viewBox="0 0 34 24" aria-hidden="true">
        <rect x="2" y="4" width="10" height="4" />
        <rect x="2" y="10" width="14" height="4" />
        <rect x="2" y="16" width="7" height="4" />
        <rect x="19" y="4" width="8" height="9" />
        <rect x="28.5" y="4" width="4" height="5" />
        <rect x="28.5" y="10.5" width="4" height="9.5" />
        <rect x="19" y="14.5" width="8" height="5.5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 34 24" aria-hidden="true" className="trait">
      <polyline points="3,19 11,12 18,15 31,5" />
      <polyline points="3,21 12,17 20,19 31,12" opacity="0.5" />
    </svg>
  );
}
/** Icônes des mesures, au trait, au format des boutons de réglage de la démo. */
function IconeMesure({ m }: { m: Mesure }) {
  const trait = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const coeur = (x: number, y: number, k: number) =>
    `M${x} ${y + 3 * k}c${-2.5 * k} ${-2.6 * k} ${-5 * k} ${-4.4 * k} ${-5 * k} ${-6.8 * k}a${2.6 * k} ${2.6 * k} 0 0 1 ${5 * k} ${-1.2 * k}a${2.6 * k} ${2.6 * k} 0 0 1 ${5 * k} ${1.2 * k}c0 ${2.4 * k} ${-2.5 * k} ${4.2 * k} ${-5 * k} ${6.8 * k}z`;
  return (
    <svg viewBox="0 0 34 24" aria-hidden="true" className="trait">
      {m === "abonnes" && (
        <g {...trait}>
          <circle cx="13" cy="8" r="3.2" />
          <path d="M6.5 20c.6-3.8 3.2-5.8 6.5-5.8s5.9 2 6.5 5.8" />
          <circle cx="22.5" cy="9" r="2.6" />
          <path d="M21.5 14.6c2.8-.4 5.4 1.2 6 5.4" />
        </g>
      )}
      {m === "publications" && (
        <g {...trait}>
          <rect x="10" y="3" width="14" height="18" rx="1.5" />
          <path d="M13.5 8h7M13.5 12h7M13.5 16h4.5" />
        </g>
      )}
      {m === "parJour" && (
        <g {...trait}>
          <rect x="8" y="5" width="18" height="16" rx="1.5" />
          <path d="M8 10h18M13 3v4M21 3v4" />
          <path d="M13 17v-3M17 17v-5M21 17v-2" />
        </g>
      )}
      {m === "jaime" && <path d={coeur(17, 15.5, 1.35)} {...trait} />}
      {m === "commentaires" && (
        <path d="M8 6h18a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H15l-5 3.5V18H8a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 8 6z" {...trait} />
      )}
      {m === "parPublication" && (
        <g {...trait}>
          <path d={coeur(17, 7.8, 0.85)} />
          <path d="M10 12.5h14" />
          <rect x="13" y="15" width="8" height="7" rx="1" />
        </g>
      )}
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
const formatMesure = (m: Mesure) => (v: number) => (MOYENNES.includes(m) ? nombreFr(v, 1) : nombreFr(v));

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
  jours = 1,
  legende = false,
  axe = true,
  maxCommun,
}: {
  data: SocialData;
  rows: CubeRow[];
  pans: Panneau[];
  m: Mesure;
  jours?: number;
  /** La légende des plateformes de la démo, sous le titre d'axe. */
  legende?: boolean;
  axe?: boolean;
  /** Échelle imposée (panneaux dessinés un à un, même échelle pour tous). */
  maxCommun?: number;
}) {
  const blocs = pans.map((pan) => ({
    panneau: pan,
    barres: pan.elements.map((el) => {
      const sg = segments(data, rows, pan, el, m, jours);
      return { element: el, segments: sg, total: m === "parPublication" ? (sg[0]?.valeur ?? 0) : sg.reduce((a, b) => a + b.valeur, 0) };
    }),
  }));
  const max = maxCommun ?? Math.max(1e-9, ...blocs.flatMap((b) => b.barres.map((x) => x.total)));
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
      {axe && (
      <div className="social-axe-titre">
        <span>{AXES[m]}</span>
        {legende && (
          <ul className="social-legende-pf" aria-label="Plateformes">
            {PLATEFORMES.map((p) => (
              <li key={p}>
                <i className={texture(p).trim() || undefined}>
                  <Logo p={p} taille={11} />
                </i>
                {NOMS_PLATEFORMES[p]}
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}

/**
 * Parts : un treemap en tuiles par panneau, comme la démo. Aire proportionnelle
 * à la part, couleur du parti (ou de la plateforme), étiquette dans la tuile
 * quand elle y tient, infobulle avec le nombre.
 */
function Parts({ data, blocs, m, rangs }: { data: SocialData; blocs: Blocs; m: Mesure; rangs?: number }) {
  const multiples = blocs.length > 1;
  const ratio = multiples ? 1.6 : rangs ? 1.4 : 2.6; // largeur / hauteur du cadre (CSS)
  // À côté des barres : la hauteur du bloc de barres, du haut de la première
  // au bas de la dernière (nombre de rangées × hauteur d'une rangée).
  const pas = multiples ? RANGEE.compacte : RANGEE.normale;
  const cadre = rangs
    ? { height: `${rangs * pas - 2 * RANGEE.marge}px`, marginTop: `${RANGEE.marge}px` }
    : { aspectRatio: String(ratio) };
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
              <div className="social-treemap" role="list" style={cadre}>
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

export function Media({ p }: { p: Pick<FilItem, "vignette" | "media" | "plateforme" | "url" | "nom"> }) {
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

/** « 1 commentaire », « 0 commentaire », « 2 commentaires » ; j'aime est invariable. */
export const commentaires = (n: number) => `${nombreFr(n)}\u00a0commentaire${n > 1 ? "s" : ""}`;

/** Pastille des publications sans image ni vidéo : leur nature en icône. */
function IconeNature({ nature }: { nature: FilItem["nature"] }) {
  return (
    <svg className="social-nature" viewBox="0 0 24 24" aria-hidden="true">
      {nature === "partage" ? (
        // flèche de partage
        <path d="M14 5l7 7-7 7v-4c-5 0-8.5 1.5-11 5 1-5 4-10 11-11V5z" />
      ) : (
        // page de texte
        <path d="M6 3h9l4 4v14H6V3zm2 6h8v1.6H8V9zm0 3.5h8v1.6H8v-1.6zm0 3.5h5v1.6H8V16z" />
      )}
    </svg>
  );
}

export function CartePublication({
  partiInfo,
  p,
  rang,
}: {
  partiInfo: SocialData["partiInfo"];
  p: FilItem;
  rang?: number;
}) {
  // Sans image ni vidéo : une carte compacte, une pastille plutôt qu'un grand
  // emplacement vide ; sans texte non plus, un libellé dit ce que c'est.
  const compacte = !p.vignette && p.media !== "video";
  const libelle =
    !p.texte && compacte
      ? p.nature === "partage"
        ? "Publication partagée (événement, lien ou autre publication)"
        : "Publication sans texte"
      : null;
  return (
    <li className={`social-publication${compacte ? " compacte" : ""}`}>
      {compacte ? (
        <span className="social-media social-media-pastille" title={libelle ?? undefined}>
          <IconeNature nature={p.nature} />
        </span>
      ) : (
        <Media p={p} />
      )}
      <div className="social-palmares-tete">
        {rang != null && <span className="social-rang">{rang}</span>}
        <span className="social-nom" style={{ color: partiInfo[p.party].couleur }}>
          {p.nom}
        </span>
        <span className="social-meta">
          <Plateforme_ p={p.plateforme} /> {partiInfo[p.party].sigle} · {jourCourt(p.jour)}
        </span>
      </div>
      {libelle && <p className="social-texte social-libelle">{libelle}</p>}
      {p.texte && (
        <p className={`social-texte${p.origine === "description" || p.origine === "autocollant" ? " repli" : ""}`}>
          {p.origine === "description" && <span className="social-repli">Description automatique de Meta&nbsp;: </span>}
          {p.origine === "autocollant" && <span className="social-repli">Texte à l’image&nbsp;: </span>}
          {p.texte}
        </p>
      )}
      <div className="social-meta">
        {nombreFr(p.jaime)}&nbsp;j’aime · {commentaires(p.commentaires)}
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

// ── Carte des circonscriptions ────────────────────────────────────────────────
// Une seule carte, zoomable (molette, glisser, pincement, boutons, recherche) ;
// les encarts Montréal et Québec n'ont plus lieu d'être. Au clavier, une
// tabulation mène à la carte, les flèches passent d'une forme à l'autre.
type Vue2D = { k: number; tx: number; ty: number };

/** Cadre d'un tracé précalculé (M absolu puis l relatifs, cf.
 *  scripts/reference/carte_circonscriptions.mjs), sans le dessiner. */
export function cadreChemin(d: string): { x: number; y: number; w: number; h: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  let x = 0;
  let y = 0;
  for (const sous of d.split(/(?=M)/)) {
    const [tete, corps = ""] = sous.slice(1).split("l");
    const [mx, my] = tete.match(/-?\d+/g)!.map(Number);
    [x, y] = [mx, my];
    const pts = [[x, y]];
    const n = (corps.replace(/z/g, "").match(/-?\d+/g) ?? []).map(Number);
    for (let i = 0; i + 1 < n.length; i += 2) {
      x += n[i];
      y += n[i + 1];
      pts.push([x, y]);
    }
    for (const [px, py] of pts) {
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Au survol ou au focus d'une circonscription : nom, région, parti en tête,
 *  et chaque candidat suivi avec les logos de ses comptes et ses publications
 *  de la période. Décorative pour les lecteurs d'écran (aria-hidden) : le
 *  libellé de la forme et la fiche portent la même information. */
export function Infobulle({
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
}: {
  epinglee?: boolean;
  onFermer?: () => void;
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
            en tête ces 7 derniers jours
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
        <a className="social-infobulle-fiche" href={`${BASE_PATH}/reseaux/circonscriptions/${circo.slug}/`}>
          <span>Voir la page de la circonscription</span>
          <span aria-hidden="true">→</span>
        </a>
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
  const [W, H] = [carte.vue[2], carte.vue[3]];
  // La carte porte sur les 7 derniers jours, indépendamment de la frise.
  const periode: PeriodeCarte = "7j";
  const [choix, setChoix] = useState<number | null>(null);
  const meneurs = useMemo(
    () => new Map(carte.circos.map((c) => [c.code, meneur(c.comptes, periode, plateformes, partis)])),
    [carte, periode, plateformes, partis],
  );
  // Opacité : 0,25 + 0,7 × √(j'aime / maximum), comme la démo.
  const maxJaime = useMemo(() => Math.max(1, ...[...meneurs.values()].map((m) => m.jaime)), [meneurs]);
  const cadres = useMemo(() => new Map(carte.circos.map((c) => [c.code, cadreChemin(c.d)])), [carte]);
  // Ordre du clavier : par région, puis par nom.
  const ordre = useMemo(
    () => [...carte.circos].sort((a, b) => a.region.localeCompare(b.region, "fr") || a.nom.localeCompare(b.nom, "fr")),
    [carte],
  );
  const [actif, setActif] = useState<number>(ordre[0]?.code ?? 0);

  // ── Zoom : une transformation (k, tx, ty) dans les unités de la carte ──────
  const [vue, setVue] = useState<Vue2D>({ k: 1, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const vuesRef = useRef<HTMLDivElement>(null);
  const anim = useRef<number | null>(null);
  const borne = (v: Vue2D): Vue2D => {
    const k = Math.min(40, Math.max(1, v.k));
    return { k, tx: Math.min(0, Math.max(W - W * k, v.tx)), ty: Math.min(0, Math.max(H - H * k, v.ty)) };
  };
  const versCarte = (cx: number, cy: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const zoomAutour = (facteur: number, cx?: number, cy?: number) => {
    setVue((v) => {
      const r = svgRef.current?.getBoundingClientRect();
      const p = cx != null && cy != null ? versCarte(cx, cy) : r ? versCarte(r.left + r.width / 2, r.top + r.height / 2) : null;
      if (!p) return v;
      const k = Math.min(40, Math.max(1, v.k * facteur));
      return borne({ k, tx: p.x - ((p.x - v.tx) * k) / v.k, ty: p.y - ((p.y - v.ty) * k) / v.k });
    });
  };
  const sansAnimation = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animerVers = (cible: Vue2D, fin?: () => void) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const but = borne(cible);
    if (sansAnimation()) {
      setVue(but);
      requestAnimationFrame(() => fin?.());
      return;
    }
    const depart = vue;
    const t0 = performance.now();
    const pas = (t: number) => {
      const u = Math.min(1, (t - t0) / 800);
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      // l'échelle en géométrique, la translation suit pour garder un cadrage cohérent
      const k = depart.k * (but.k / depart.k) ** e;
      setVue({ k, tx: depart.tx + (but.tx - depart.tx) * e, ty: depart.ty + (but.ty - depart.ty) * e });
      if (u < 1) anim.current = requestAnimationFrame(pas);
      else {
        anim.current = null;
        fin?.();
      }
    };
    anim.current = requestAnimationFrame(pas);
  };
  const cadrer = (code: number): Vue2D => {
    const b = cadres.get(code)!;
    const k = Math.min(40, Math.max(1, Math.min((W * 0.55) / Math.max(b.w, 1), (H * 0.55) / Math.max(b.h, 1))));
    return { k, tx: W / 2 - (b.x + b.w / 2) * k, ty: H / 2 - (b.y + b.h / 2) * k };
  };

  // ── Glisser, pincer, molette ───────────────────────────────────────────────
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const deplace = useRef(0);
  const pinceDebut = useRef<{ d: number; k: number } | null>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Molette : un écouteur non passif, pour que la page ne défile pas en zoomant.
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      zoomAutour(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    svg.addEventListener("wheel", molette, { passive: false });
    return () => svg.removeEventListener("wheel", molette);
  });
  const surDown = (e: PointerEvent<SVGSVGElement>) => {
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    deplace.current = 0;
    if (pointeurs.current.size === 2) {
      const [a, b] = [...pointeurs.current.values()];
      pinceDebut.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vue.k };
    }
  };
  const surMove = (e: PointerEvent<SVGSVGElement>) => {
    const avant = pointeurs.current.get(e.pointerId);
    if (!avant) return;
    const apres = { x: e.clientX, y: e.clientY };
    pointeurs.current.set(e.pointerId, apres);
    deplace.current += Math.hypot(apres.x - avant.x, apres.y - avant.y);
    if (deplace.current > 4 && pointeurs.current.size === 1) e.currentTarget.setPointerCapture?.(e.pointerId);
    const m = svgRef.current?.getScreenCTM();
    if (!m) return;
    if (pointeurs.current.size === 2 && pinceDebut.current) {
      const [a, b] = [...pointeurs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cible = (pinceDebut.current.k * d) / Math.max(pinceDebut.current.d, 1);
      zoomAutour(cible / vue.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pointeurs.current.size === 1 && deplace.current > 4) {
      setVue((v) => borne({ k: v.k, tx: v.tx + (apres.x - avant.x) / m.a, ty: v.ty + (apres.y - avant.y) / m.d }));
    }
  };
  const surUp = (e: PointerEvent<SVGSVGElement>) => {
    pointeurs.current.delete(e.pointerId);
    if (pointeurs.current.size < 2) pinceDebut.current = null;
  };

  // ── Infobulle : survol, focus, épingle ─────────────────────────────────────
  type Survol = { code: number; x: number; y: number; par: "souris" | "clavier" };
  const [survol, setSurvol] = useState<Survol | null>(null);
  const [epingle, setEpingle] = useState<{ code: number; x: number; y: number } | null>(null);
  const relatif = (x: number, y: number) => {
    const r = vuesRef.current?.getBoundingClientRect();
    return r ? { x: x - r.left, y: y - r.top } : null;
  };
  const place = (code: number, x: number, y: number, par: Survol["par"]) => {
    const p = relatif(x, y);
    if (p) setSurvol({ code, ...p, par });
  };
  const efface = (par: Survol["par"]) => setSurvol((s) => (s?.par === par ? null : s));
  const centreForme = (code: number) => {
    const el = svgRef.current?.querySelector(`use[data-code="${code}"]`);
    const b = el?.getBoundingClientRect();
    return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
  };
  const epingler = (code: number, x?: number, y?: number) => {
    const c = x != null && y != null ? { x, y } : centreForme(code);
    const p = c && relatif(c.x, c.y);
    if (!p) return;
    setEpingle({ code, ...p });
    setSurvol(null);
    setChoix(code);
  };
  // Zoom ou déplacement : l'infobulle épinglée suit sa circonscription.
  useEffect(() => {
    if (!epingle) return;
    const c = centreForme(epingle.code);
    const p = c && relatif(c.x, c.y);
    if (p && (Math.abs(p.x - epingle.x) > 1 || Math.abs(p.y - epingle.y) > 1)) setEpingle({ code: epingle.code, ...p });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue]);
  useEffect(() => {
    if (!epingle) return;
    const touche = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setEpingle(null);
        setChoix(null);
      }
    };
    const dehors = (e: globalThis.PointerEvent) => {
      const t = e.target as globalThis.Element | null;
      if (t?.closest(".social-infobulle, .social-carte-province, .social-recherche, .social-zoom")) return;
      setEpingle(null);
      setChoix(null);
    };
    document.addEventListener("keydown", touche);
    document.addEventListener("pointerdown", dehors);
    return () => {
      document.removeEventListener("keydown", touche);
      document.removeEventListener("pointerdown", dehors);
    };
  }, [epingle]);
  // Recherche : la vue glisse vers la circonscription, puis l'infobulle s'épingle.
  const trouver = (code: number) => {
    setChoix(code);
    setEpingle(null);
    vuesRef.current?.scrollIntoView({ block: "nearest" });
    animerVers(cadrer(code), () => epingler(code));
  };

  const clavier = (e: KeyboardEvent<SVGUseElement>, code: number) => {
    const i = ordre.findIndex((c) => c.code === code);
    const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (pas) {
      e.preventDefault();
      const suivant = ordre[(i + pas + ordre.length) % ordre.length].code;
      setActif(suivant);
      svgRef.current?.querySelector<SVGUseElement>(`use[data-code="${suivant}"]`)?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      epingler(code);
    } else if (e.key === "Escape") {
      efface("clavier");
    }
  };
  const remplissage = (code: number) => {
    const m = meneurs.get(code);
    if (!m?.party) return { fill: "var(--social-carte-vide)", fillOpacity: 1 };
    return { fill: data.partiInfo[m.party].couleur, fillOpacity: 0.25 + 0.7 * Math.sqrt(m.jaime / maxJaime) };
  };
  const titre = (code: number, nom: string) => {
    const m = meneurs.get(code);
    return m?.party
      ? `${nom} : ${data.partiInfo[m.party].sigle} en tête, ${nombreFr(m.parParti[m.party]!.jaime)} j’aime`
      : `${nom} : ${m && m.jaime > 0 ? "égalité" : "aucun j’aime"}`;
  };
  const circo = carte.circos.find((c) => c.code === choix) ?? null;
  const bulle = epingle ?? survol;

  return (
    <div className="social-carte">
      <Recherche data={data} onChoisir={trouver} />
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
        <li className="social-carte-legende-note">plus la couleur est soutenue, plus il y a de j’aime</li>
      </ul>

      <div className="social-carte-vues" ref={vuesRef}>
        <svg
          ref={svgRef}
          className="social-carte-province"
          viewBox={carte.vue.join(" ")}
          role="img"
          aria-label="Carte des circonscriptions, colorées selon le parti dont les candidats y reçoivent le plus de j’aime. La molette, le glisser ou le pincement zooment. Les flèches passent d’une circonscription à l’autre, par région, et Entrée épingle son infobulle."
          onPointerDown={surDown}
          onPointerMove={surMove}
          onPointerUp={surUp}
          onPointerCancel={surUp}
        >
          <defs>
            {carte.circos.map((c) => (
              <path key={c.code} id={`sc-circo-${c.code}`} d={c.d} vectorEffect="non-scaling-stroke" />
            ))}
          </defs>
          <g transform={`translate(${vue.tx} ${vue.ty}) scale(${vue.k})`}>
            {ordre.map((c) => (
              <use
                key={c.code}
                href={`#sc-circo-${c.code}`}
                data-code={c.code}
                {...remplissage(c.code)}
                className={c.code === choix ? "choisie" : undefined}
                onClick={(e) => deplace.current <= 4 && epingler(c.code, e.clientX, e.clientY)}
                onPointerMove={(e) =>
                  e.pointerType !== "touch" &&
                  !epingle &&
                  pointeurs.current.size === 0 &&
                  place(c.code, e.clientX, e.clientY, "souris")
                }
                onPointerLeave={() => efface("souris")}
                // Un seul arrêt de tabulation, les flèches font le reste.
                tabIndex={c.code === actif ? 0 : -1}
                role="button"
                aria-label={`${titre(c.code, c.nom)}. Entrée pour épingler son infobulle.`}
                onFocus={(e: FocusEvent<SVGUseElement>) => {
                  setActif(c.code);
                  if (epingle) return;
                  const b = e.currentTarget.getBoundingClientRect();
                  place(c.code, b.left + b.width / 2, b.top + b.height / 2, "clavier");
                }}
                onBlur={() => efface("clavier")}
                onKeyDown={(e: KeyboardEvent<SVGUseElement>) => clavier(e, c.code)}
              />
            ))}
            {circo && <use href={`#sc-circo-${circo.code}`} className="social-carte-contour" />}
          </g>
        </svg>
        <div className="social-zoom" role="group" aria-label="Zoom de la carte">
          <button type="button" onClick={() => zoomAutour(1.8)} aria-label="Zoomer" title="Zoomer">
            +
          </button>
          <button type="button" onClick={() => zoomAutour(1 / 1.8)} aria-label="Dézoomer" title="Dézoomer">
            −
          </button>
          <button
            type="button"
            onClick={() => animerVers({ k: 1, tx: 0, ty: 0 })}
            aria-label="Vue d’ensemble"
            title="Vue d’ensemble"
          >
            ⟲
          </button>
        </div>
        {bulle && (
          <Infobulle
            key={epingle ? `e${bulle.code}` : "survol"}
            data={data}
            circo={carte.circos.find((c) => c.code === bulle.code)!}
            m={meneurs.get(bulle.code)!}
            periode={periode}
            plateformes={plateformes}
            partis={partis}
            x={bulle.x}
            y={bulle.y}
            largeur={vuesRef.current?.clientWidth ?? 0}
            hauteur={vuesRef.current?.clientHeight ?? 0}
            epinglee={!!epingle}
            onFermer={() => {
              setEpingle(null);
              setChoix(null);
            }}
          />
        )}
      </div>

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
  const [vue, setVue] = useState<Vue>("partis");
  const vues = data.carte ? VUES : VUES.filter((v) => v.cle !== "carte");
  const [forme, setForme] = useState<Forme>("barres");
  const [decoupe, setDecoupe] = useState<Decoupe>("ensemble");
  // Une seule mesure, partagée par Partis et Candidats (abonnés par défaut).
  const [m, setMesure] = useState<Mesure>("abonnes");

  const f: Filtres = useMemo(() => ({ d0, d1, plateformes, partis, types }), [d0, d1, plateformes, partis, types]);
  const periode = (a: number, b: number) => {
    setD0(a);
    setD1(b);
  };

  const frise = useMemo(() => parJour(data, f), [data, f]);
  const rows = useMemo(() => lignes(data, f), [data, f]);
  const t = totaux(rows);
  const nbJours = d1 - d0 + 1;

  // Pas de série d'abonnés par jour : « dans le temps » est grisé pour eux.
  const formeEff: Forme = m === "abonnes" ? "barres" : forme;
  const pans = panneaux(decoupe, f);
  const graphique = vue === "partis";
  const rowsM = useMemo(() => (m === "abonnes" ? lignesAbonnes(data, f) : rows), [m, data, f, rows]);
  const abonnes = useMemo(() => totaux(lignesAbonnes(data, f)).publications, [data, f]);
  const sansParts = MOYENNES.includes(m);

  const raccourcis: { libelle: string; a: number }[] = [
    { libelle: "7 j", a: Math.max(0, n - 7) },
    { libelle: "30 j", a: Math.max(0, n - 30) },
    { libelle: "Campagne", a: data.campagne },
    { libelle: "Tout", a: 0 },
  ];

  const tops = vue === "palmares" ? palmares(data, f) : [];

  const sousTitre =
    vue === "presence"
      ? "Part des candidatures de chaque parti dont au moins un compte est suivi. Dernier relevé : la période ne s’applique pas."
      : vue === "candidats"
        ? m === "abonnes"
          ? `Les ${AUDIENCE_MAX} comptes les plus suivis, en abonnés. Dernier relevé\u00a0: la période ne s’applique pas.`
          : `Les ${AUDIENCE_MAX} comptes en tête sur la période, en ${MESURE[m].unite}.`
        : vue === "palmares"
          ? "Les 10 publications les plus aimées de la période."
          : vue === "carte"
            ? "Chaque circonscription prend la couleur du parti dont les candidats y reçoivent le plus de j’aime ces 7 derniers jours."
          : MESURE[m].definition;

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
          </div>

          <aside className="social-filtres">
            <div className="social-groupe" role="group" aria-label="Filtres">
            <h3 className="social-groupe-titre">Filtres</h3>
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
            </div>
            {/* Les chiffres de la période : un résultat, pas un contrôle. */}
            <section className="social-groupe social-chiffres" aria-label="En chiffres">
              <h3 className="social-groupe-titre">
                En chiffres · {nombreFr(nbJours)}&nbsp;{nbJours > 1 ? "jours" : "jour"}
              </h3>
              <dl className="social-tuiles">
                <div>
                  <dt>Abonnés, dernier relevé</dt>
                  <dd>{nombreGrand(abonnes)}</dd>
                </div>
                <div>
                  <dt>Publications</dt>
                  <dd>{nombreGrand(t.publications)}</dd>
                </div>
                <div>
                  <dt>Par jour, en moyenne</dt>
                  <dd>{nombreGrand(t.publications / nbJours)}</dd>
                </div>
                <div>
                  <dt>J’aime</dt>
                  <dd>{nombreGrand(t.jaime)}</dd>
                </div>
                <div>
                  <dt>Commentaires</dt>
                  <dd>{nombreGrand(t.commentaires)}</dd>
                </div>
                <div>
                  <dt>J’aime par publication</dt>
                  <dd>{nombreGrand(valeur(t, "parPublication"), 1)}</dd>
                </div>
              </dl>
            </section>
          </aside>

          <div className="social-bas">
          <div className="social-onglets">
            <Bascule label="Vue" options={vues} valeur={vue} onChange={setVue} />
          </div>
          {/* La mesure, sous les onglets, dans Partis et Candidats seulement :
              des icônes, le nom complet de la mesure active à côté. */}
          {(vue === "partis" || vue === "candidats") && (
            <div className="social-mesure">
              <Bascule
                label="Mesure affichée"
                options={
                  vue === "candidats" && !(data.audienceJour.length || data.audienceJourDispo) ? MESURES.slice(0, 1) : MESURES
                }
                valeur={m}
                onChange={setMesure}
                icone={(c) => <IconeMesure m={c} />}
              />
              <span className="social-mesure-nom" aria-hidden="true">
                {MESURE[m].libelle}
              </span>
            </div>
          )}

          {graphique && (
            <div className="social-reglages">
              {/* Comme la démo : la forme en haut à gauche, la découpe en haut à droite. */}
              <Bascule
                label="Forme"
                options={FORMES}
                valeur={formeEff}
                onChange={setForme}
                desactives={m === "abonnes" ? { temps: "Pas de série d’abonnés" } : undefined}
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

          {vue === "candidats" && (
            <Audience
              data={data}
              mesure={m}
              plateformes={plateformes}
              partis={partis}
              types={types}
              d0={d0}
              d1={d1}
            />
          )}

          {/* Barres et parts côte à côte (même mesure, filtres et découpe) ; une
              moyenne ne se découpe pas en parts : les barres seules. */}
          {graphique &&
            formeEff === "barres" &&
            (() => {
              // Une paire barres + parts par panneau : chaque treemap garde la
              // hauteur de ses barres ; les barres gardent une échelle commune.
              const blocs = parElement(data, rowsM, pans, m, nbJours);
              const maxCommun = Math.max(1e-9, ...blocs.flatMap((b) => b.valeurs.map((v) => v.valeur)));
              return (
                <>
                  {pans.map((pan, i) => (
                    <div key={pan.cle} className={`social-barres-parts${sansParts ? " seules" : ""}`}>
                      <Barres
                        data={data}
                        rows={rowsM}
                        pans={[pan]}
                        m={m}
                        jours={nbJours}
                        maxCommun={pans.length > 1 ? maxCommun : undefined}
                        axe={i === pans.length - 1}
                        legende={i === pans.length - 1 && decoupe !== "parti"}
                      />
                      {sansParts ? (
                        i === 0 && <p className="social-note social-sans-parts">Une moyenne ne se découpe pas en parts.</p>
                      ) : (
                        <Parts data={data} blocs={[blocs[i]]} m={m} rangs={pan.elements.length} />
                      )}
                    </div>
                  ))}
                </>
              );
            })()}
          {graphique &&
            formeEff === "temps" &&
            (() => {
              const s = series(data, rowsM, pans, m, f);
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
                  <CartePublication key={`${p.url ?? ""}-${i}`} partiInfo={data.partiInfo} p={p} rang={i + 1} />
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
