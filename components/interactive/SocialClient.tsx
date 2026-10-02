"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PartyKey } from "@/lib/data/parties";
import {
  COULEURS_PLATEFORMES,
  LOGOS_PLATEFORMES,
  NOMS_PLATEFORMES,
  nombreFr,
  nombreGrand,
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
  meneursCarte,
  mesurePalmares,
  palmares,
  palmaresApproche,
  panneaux,
  parElement,
  parJourParti,
  segments,
  series,
  totaux,
  type Element,
  type Filtres,
  type Mesure,
  type Panneau,
  type MesureAudience,
  type Meneur,
  valeursComptes,
} from "@/lib/data/social-calc";
import { MONTHS_FR } from "@/lib/dates";
import { InfoTip } from "@/components/interactive/InfoTip";

type Vue = "partis" | "candidats" | "palmares" | "carte";
/** « Barres et parts » côte à côte, ou « dans le temps ». */
type Forme = "barres" | "temps";

/** Les vues : « compté par quoi ? ». `court` sert à la barre du téléphone. */
const VUES: { cle: Vue; libelle: string; court: string }[] = [
  { cle: "partis", libelle: "Par parti", court: "Partis" },
  { cle: "candidats", libelle: "Par candidat", court: "Candidats" },
  { cle: "palmares", libelle: "Par publication", court: "Palmarès" },
  { cle: "carte", libelle: "Par circonscription", court: "Carte" },
];
/** LA liste des mesures du module : onglets Partis et Candidats, chiffres de
 *  la colonne de droite. Libellé complet, libellé court (bouton), unité, et la
 *  définition d'où viennent les sous-titres. */
const MESURES: { cle: Mesure; libelle: string; court: string; unite: string; definition: string; question: string }[] = [
  { cle: "jaime", libelle: "J’aime", court: "J’aime", unite: "j’aime", definition: "Total des j’aime de la période.", question: "Qui fait réagir" },
  {
    cle: "abonnes", libelle: "Abonnés", court: "Abonnés", unite: "abonnés",
    definition: "Total des abonnés des comptes suivis, au dernier relevé\u00a0: la période ne s’applique pas.",
    question: "Qui est le plus suivi",
  },
  { cle: "publications", libelle: "Publications", court: "Publications", unite: "publications", definition: "Total des publications de la période.", question: "Qui publie le plus" },
  { cle: "commentaires", libelle: "Commentaires", court: "Commentaires", unite: "commentaires", definition: "Total des commentaires de la période.", question: "Qui fait discuter" },
];
const MESURE = Object.fromEntries(MESURES.map((x) => [x.cle, x])) as Record<Mesure, (typeof MESURES)[number]>;
/** Titre d'axe des barres, comme la démo (« Nombre de publications »). */
const AXES: Record<Mesure, string> = {
  abonnes: "Nombre d’abonnés",
  publications: "Nombre de publications",
  jaime: "Nombre de j’aime",
  commentaires: "Nombre de commentaires",
};
/** Hauteur d'une rangée de barres (barre + marges), normale et compacte :
 *  le treemap voisin en tire sa hauteur, pour finir avec la dernière barre. */
const RANGEE = { normale: 44, compacte: 36, marge: 7 };


/** Mois abrégés (frise étroite), à la québécoise : « sept. », « juil. ». */
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

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

// Fils complets des circonscriptions (reseaux/fil-complet/<code>.json, déjà
// servis pour « Voir plus »), lus à la demande et une seule fois par visite
// pour l'infobulle d'un compte ; à défaut, le fil court (reseaux/fil/<code>.json).
const filsComplets = new Map<number, FilItem[] | null>();
const filsCompletsEnCours = new Map<number, Promise<void>>();
const lireJson = (url: string) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((j: unknown) => (Array.isArray(j) && j.length ? (j as FilItem[]) : null));
export function chargeFilComplet(code: number): Promise<void> {
  if (!filsCompletsEnCours.has(code)) {
    filsCompletsEnCours.set(
      code,
      lireJson(`${BASE_PATH}/reseaux/fil-complet/${code}.json`)
        .then((fil) => fil ?? lireJson(`${BASE_PATH}/reseaux/fil/${code}.json`))
        .then((fil) => {
          filsComplets.set(code, fil);
        }),
    );
  }
  return filsCompletsEnCours.get(code)!;
}
function useFilComplet(code: number | undefined): { fil: FilItem[] | null; charge: boolean } {
  const [, relire] = useState(0);
  useEffect(() => {
    if (code == null || filsComplets.has(code)) return;
    let vivant = true;
    chargeFilComplet(code).then(() => vivant && relire((n) => n + 1));
    return () => {
      vivant = false;
    };
  }, [code]);
  if (code == null) return { fil: null, charge: false };
  return filsComplets.has(code) ? { fil: filsComplets.get(code)!, charge: false } : { fil: null, charge: true };
}

/** Où est un candidat dans le classement entier : son meilleur compte (rang
 *  réel), s'il est dans les 40 affichés, et sa page de pagination. Rang null :
 *  aucun de ses comptes n'entre au classement avec ces filtres. */
export function trouverCandidat(
  complet: { item: SocialData["audience"][number]; index: number }[],
  sg: Pick<SuggestionCandidat, "code" | "party">,
  parPage: number,
): { index: number; rang: number | null; dans: boolean; page: number | null } {
  const r = complet.findIndex((x) => x.item.type === "candidat" && x.item.code === sg.code && x.item.party === sg.party);
  if (r < 0) return { index: -1, rang: null, dans: false, page: null };
  const dans = r < AUDIENCE_MAX;
  return { index: complet[r].index, rang: r + 1, dans, page: dans ? Math.floor(r / parPage) : null };
}

/** Position d'une infobulle de compte, relative au bloc du classement : sous la ligne. */
type BulleCompte = { index: number; x: number; y: number; largeur: number };

/** Au clic sur une ligne de Par candidat : la fiche du compte, posée dans
 *  l'écran de l'appareil (jamais coupée) : son nom, puis ses 10 dernières
 *  publications (date, logo, extrait, j'aime), chacune un lien vers son
 *  réseau. Les comptes de parti n'ont pas de circonscription, donc pas de
 *  fichier de fil publié : leur nom complet seul. */
export function InfobulleCompte({
  data,
  a,
  bulle,
  etroit = false,
  epinglee = false,
  onFermer,
}: {
  data: SocialData;
  a: SocialData["audience"][number];
  bulle: BulleCompte;
  etroit?: boolean;
  epinglee?: boolean;
  onFermer?: () => void;
}) {
  const etat = useFilComplet(a.type === "candidat" ? a.code : undefined);
  // Le compte lui-même (son parti, sa plateforme), jamais les filtres du module.
  const fil = (etat.fil ?? []).filter((x) => x.party === a.party && x.plateforme === a.plateforme).slice(0, 10);
  const circo = a.code != null ? data.carte?.circos.find((c) => c.code === a.code)?.nom : undefined;
  const aDroite = bulle.x + 352 > bulle.largeur;
  const nom = NOMS_PLATEFORMES[a.plateforme];
  return (
    <div
      className={`social-infobulle compte${epinglee ? " epinglee social-fiche" : ""}${etroit ? " etroite" : ""}`}
      {...(epinglee
        ? { role: "dialog", "aria-modal": true, "aria-label": `${a.nom}\u00a0: dernières publications` }
        : { "aria-hidden": true })}
      style={
        epinglee
          ? undefined
          : etroit
            ? { left: 0, right: 0, top: bulle.y + 4 }
            : { left: aDroite ? undefined : bulle.x, right: aDroite ? 0 : undefined, top: bulle.y + 4 }
      }
    >
      {epinglee && (
        <button type="button" className="social-infobulle-fermer" onClick={onFermer} aria-label="Fermer la fiche" autoFocus>
          ×
        </button>
      )}
      <strong>{a.nom}</strong>
      <span className="social-meta">
        {data.partiInfo[a.party].sigle} · {a.type === "parti" ? `compte du parti sur ${nom}` : `${circo ? `${circo} · ` : ""}${nom}`}
      </span>
      {a.type === "candidat" && a.code != null && (
        <div className="social-infobulle-fil">
          <span className="social-infobulle-entete">
          <span className="social-meta">Dernières publications</span>
          <span className="social-meta">J’aime</span>
        </span>
          {etat.charge ? (
            <span className="social-meta">Chargement du fil…</span>
          ) : fil.length === 0 ? (
            <span className="social-meta">Aucune publication récente</span>
          ) : (
            <ol>
              {fil.map((x, i) => (
                <li key={`${x.url ?? ""}-${i}`}>
                  <Logo p={x.plateforme} taille={11} />
                  <span className="social-infobulle-date">{jourBref(x.jour)}</span>
                  {x.url ? (
                    <a className="social-infobulle-texte" href={x.url} target="_blank" rel="noopener noreferrer">
                      {x.texte || "(sans texte)"}
                    </a>
                  ) : (
                    <span className="social-infobulle-texte">{x.texte || "(sans texte)"}</span>
                  )}
                  <span className="social-infobulle-n">{nombreFr(x.jaime)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {a.type === "candidat" && !epinglee && (
        <span className="social-infobulle-pied">cliquez pour épingler, faire défiler le fil et ouvrir une publication</span>
      )}
    </div>
  );
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
  couche = null,
}: {
  data: SocialData;
  mesure: MesureAudience;
  plateformes: Plateforme[];
  partis: PartyKey[];
  types: TypeCompte[];
  d0: number;
  d1: number;
  /** La couche de l'écran de l'appareil où se pose la fiche d'un compte. */
  couche?: HTMLElement | null;
}) {
  // Une seule page : les 20 premiers, en deux colonnes de 10 que le CSS empile
  // sur téléphone (pas de bascule en JavaScript, donc pas d'éclair au chargement).
  const parPage = AUDIENCE_MAX;
  const [page, setPage] = useState(0);
  const activite = useAudienceJour(data, mesure !== "abonnes");
  // Le classement entier (la recherche donne le rang réel), les 40 premiers affichés.
  const complet = useMemo(
    () => classementAudience(data.audience, activite.jours, mesure, { plateformes, partis, types, d0, d1 }, Infinity),
    [data, activite.jours, mesure, plateformes, partis, types, d0, d1],
  );
  const classement = useMemo(() => complet.slice(0, AUDIENCE_MAX), [complet]);

  // ── Fiche d'un compte : au clic (ou Entrée), dans l'écran de l'appareil ────
  const blocRef = useRef<HTMLDivElement>(null);
  const [epingle, setEpingle] = useState<BulleCompte | null>(null);
  // Candidat choisi dans la recherche : sa ligne est surlignée ; hors des 40,
  // elle s'affiche à part au-dessus de la liste.
  const [cherche, setCherche] = useState<{ index: number; rang: number | null; dans: boolean; sg: SuggestionCandidat } | null>(null);
  const bulleDe = (index: number, el: HTMLElement): BulleCompte | null => {
    const b = blocRef.current?.getBoundingClientRect();
    if (!b) return null;
    const r = el.getBoundingClientRect();
    return { index, x: r.left - b.left, y: r.bottom - b.top, largeur: b.width };
  };
  const epingler = (index: number, el: HTMLElement) => {
    setEpingle((e) => (e?.index === index ? null : bulleDe(index, el)));
  };
  // Un filtre, une mesure, la période ou la taille des pages change : retour à
  // la page 1, sans infobulle ni recherche en cours.
  useEffect(() => {
    setPage(0);
    setEpingle(null);
    setCherche(null);
  }, [mesure, plateformes, partis, types, d0, d1, parPage]);
  useEffect(() => {
    if (!epingle) return;
    const touche = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setEpingle(null);
    const dehors = (e: globalThis.PointerEvent) => {
      const t = e.target as globalThis.Element | null;
      if (t?.closest(".social-infobulle, .social-audience li, .social-recherche")) return;
      setEpingle(null);
    };
    document.addEventListener("keydown", touche);
    document.addEventListener("pointerdown", dehors);
    return () => {
      document.removeEventListener("keydown", touche);
      document.removeEventListener("pointerdown", dehors);
    };
  }, [epingle]);
  const choisirCandidat = (sg: SuggestionCandidat) => {
    // Tout se passe dans le module : la ligne du candidat, ou un mot qui dit
    // pourquoi il n'y est pas (aucun compte suivi, ou écarté par les filtres).
    const t = trouverCandidat(complet, sg, parPage);
    setEpingle(null);
    if (t.page != null) setPage(t.page);
    setCherche({ index: t.index, rang: t.rang, dans: t.dans, sg });
  };
  // Après le rendu de la bonne page : défiler jusqu'à la ligne, puis épingler son infobulle.
  useEffect(() => {
    if (!cherche || cherche.index < 0) return;
    const el = blocRef.current?.querySelector<HTMLElement>(`[data-compte="${cherche.index}"]`);
    if (!el) return;
    const doux = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView?.({ block: "center", behavior: doux ? "smooth" : "auto" });
    el.focus({ preventScroll: true });
    setEpingle(bulleDe(cherche.index, el));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cherche, page]);
  const chercher = useMemo(() => (t: string) => suggestionsCandidats(data, t), [data]);

  const pages = Math.max(1, Math.ceil(classement.length / parPage));
  const p = Math.min(page, pages - 1);
  const vus = classement.slice(p * parPage, (p + 1) * parPage);
  const max = classement[0]?.valeur ?? 1;
  // Valeurs en Playfair : séparateur de milliers visible (nombreGrand).
  const format = (v: number) => nombreGrand(v);
  const colonnes = [vus.slice(0, 10), vus.slice(10, 20)].filter((c) => c.length > 0);
  const recherche = data.candidatures?.length ? (
    <Combobox
      id="social-recherche-candidat"
      libelle="Rechercher un·e candidat·e"
      placeholder="Rechercher un·e candidat·e"
      chercher={chercher}
      onChoisir={choisirCandidat}
    />
  ) : null;
  const ligne = ({ item: a, valeur: v, index }: (typeof complet)[number], rang: number) => (
    <li
      key={`${a.plateforme}-${a.nom}-${a.party}`}
      data-compte={index}
      className={cherche?.index === index ? "surligne" : undefined}
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${rang}. ${a.nom}, ${data.partiInfo[a.party].sigle}, ${NOMS_PLATEFORMES[a.plateforme]}\u00a0: ${format(v)} ${MESURE[mesure].unite}. Entrée pour voir ses dernières publications.`}
      // Le clic (ou Entrée, ou espace) ouvre la fiche du compte dans l'écran :
      // ses dernières publications, chacune un lien vers son réseau.
      onClick={(e) => epingler(index, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          epingler(index, e.currentTarget);
        }
      }}
    >
      <span className="social-nom">
        <span className="social-rang-petit">{rang}</span>
        <Plateforme_ p={a.plateforme} />
        <span className="social-nom-texte">{a.nom}</span>
        <span className="social-meta">{data.partiInfo[a.party].sigle}</span>
      </span>
      <span className="social-piste">
        <i style={{ width: `${Math.min(100, (100 * v) / max)}%`, background: data.partiInfo[a.party].couleur }} />
      </span>
      <span className="social-valeur">{format(v)}</span>
    </li>
  );
  if (activite.charge) return <p className="social-note">Chargement de l’activité des comptes…</p>;
  if (classement.length === 0)
    return (
      <>
        {recherche}
        <p className="social-vide">Aucun compte pour ces filtres.</p>
      </>
    );
  return (
    <div className="social-audience-bloc" ref={blocRef}>
      {recherche}
      {cherche && !cherche.dans && (
        <div className="social-audience-apart" role="status">
          <p className="social-meta">
            {cherche.rang
              ? `${cherche.sg.nom}\u00a0: hors des ${AUDIENCE_MAX} premiers, rang ${nombreFr(cherche.rang)}`
              : cherche.sg.comptes
                ? `${cherche.sg.nom}\u00a0: aucun compte dans ce classement avec ces filtres`
                : `${cherche.sg.nom}\u00a0: aucun compte suivi sur Facebook, Instagram ou TikTok`}
          </p>
          {cherche.rang && (
            <ol className="social-barres social-audience" start={cherche.rang}>
              {ligne(complet[cherche.rang - 1], cherche.rang)}
            </ol>
          )}
        </div>
      )}
      <div className={`social-audience-colonnes${colonnes.length > 1 ? " deux" : ""}`}>
        {colonnes.map((col, n) => (
          <ol key={n} className="social-barres social-audience" start={p * parPage + n * 10 + 1}>
            {col.map((x, i) => ligne(x, p * parPage + n * 10 + i + 1))}
          </ol>
        ))}
      </div>
      {/* La fiche se pose dans la couche de l'écran (portail) : centrée sur
          la tablette, en tiroir sur le téléphone, jamais coupée par le bas. */}
      {epingle &&
        data.audience[epingle.index] &&
        couche &&
        createPortal(
          <div className="social-fiche-fond">
            <InfobulleCompte
              key={`e${epingle.index}`}
              data={data}
              a={data.audience[epingle.index]}
              bulle={epingle}
              epinglee
              onFermer={() => setEpingle(null)}
            />
          </div>,
          couche,
        )}
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
    </div>
  );
}

const FORMES: { cle: Forme; libelle: string }[] = [
  { cle: "barres", libelle: "Total" },
  { cle: "temps", libelle: "Évolution" },
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
  piles,
  couleurs,
  d0,
  d1,
  campagne,
  onChange,
}: {
  jours: string[];
  /** Publications du jour, empilées par parti (ordre de `couleurs`). */
  piles: number[][];
  couleurs: string[];
  d0: number;
  d1: number;
  campagne: number;
  onChange: (d0: number, d1: number) => void;
}) {
  const n = jours.length;
  const valeurs = piles.map((p) => p.reduce((a, b) => a + b, 0));
  // Frise étroite : les noms de mois entiers se chevauchent (« septembre »
  // touche « octobre ») ; on les abrège.
  const etroit = useEtroit();
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
          {/* Une pile par jour : chaque parti dans sa couleur, du bas vers le
              haut ; hors de la période, la pile pâlit. */}
          {piles.map((pile, i) => {
            let cumul = 0;
            return pile.map((v, k) => {
              if (v <= 0) return null;
              const h = (100 * v) / max;
              cumul += h;
              return (
                <rect
                  key={`${i}-${k}`}
                  x={i + 0.12}
                  width={0.76}
                  y={100 - cumul}
                  height={h}
                  fill={couleurs[k]}
                  className={i >= d0 && i <= d1 ? "dans" : "hors"}
                />
              );
            });
          })}
        </svg>
        {campagne > 0 && (
          <span className="social-frise-repere" style={{ left: `${pct(campagne)}%` }}>
            <span className="social-frise-repere-libelle">Lancement de la campagne électorale</span>
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
        {/* Un mois qui commence tout au bout de l'axe s'écrit à gauche de son
            repère, sinon il dépasse de la frise. */}
        {mois.map(({ j, i }) => (
          <span key={j} className={pct(i) > 90 ? "fin" : undefined} style={{ left: `${pct(i)}%` }}>
            {(etroit ? MOIS_COURTS : MONTHS_FR)[Number(j.slice(5, 7)) - 1]}
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
  prefixe,
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
  /** Une icône devant le libellé (le libellé reste visible). */
  prefixe?: (cle: T) => ReactNode;
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
            {prefixe && prefixe(o.cle)}
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
          // Une pastille se lit comme une case à cocher : coche quand elle
          // est active, contour pâle sinon ; l'infobulle dit ce qu'un clic fait.
          const seule = on && actifs.length === 1;
          return (
            <button
              type="button"
              key={o.cle}
              aria-pressed={on}
              className={on ? "actif" : undefined}
              style={on && couleur ? { background: couleur(o.cle), borderColor: couleur(o.cle) } : undefined}
              onClick={() => bascule(o.cle)}
              aria-label={icone ? o.libelle : undefined}
              title={seule ? `${o.libelle}\u00a0: seul choix affiché` : on ? `Masquer ${o.libelle}` : `Afficher ${o.libelle}`}
            >
              {on && <span className="social-coche-marque" aria-hidden="true">✓</span>}
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

type Blocs = ReturnType<typeof parElement>;

/**
 * Barres, comme la démo : une barre par élément, découpée par plateforme
 * (couleur du parti ; Facebook plein, Instagram hachuré, TikTok pointillé ;
 * logo dans le segment quand il y tient), total au bout. Sans légende : les
 * logos la portent.
 */
type SurvolBarre = { cle: string; plateforme: Plateforme | null; x: number; y: number };

function Barres({
  data,
  rows,
  pans,
  m,
  axe = true,
  maxCommun,
}: {
  data: SocialData;
  rows: CubeRow[];
  pans: Panneau[];
  m: Mesure;
  axe?: boolean;
  /** Échelle imposée (panneaux dessinés un à un, même échelle pour tous). */
  maxCommun?: number;
}) {
  const blocs = pans.map((pan) => ({
    panneau: pan,
    barres: pan.elements.map((el) => {
      const sg = segments(data, rows, pan, el, m);
      return { cle: `${pan.cle}/${el.cle}`, element: el, segments: sg, total: sg.reduce((a, b) => a + b.valeur, 0) };
    }),
  }));
  const max = maxCommun ?? Math.max(1e-9, ...blocs.flatMap((b) => b.barres.map((x) => x.total)));
  const multiples = blocs.length > 1;
  const seuilLogo = multiples ? 9 : 5; // % de la piste sous lequel le logo ne tient pas

  // Au survol (ou au focus) d'une barre : le total et le détail par réseau
  // dans une infobulle, le segment survolé mis en évidence.
  const cadre = useRef<HTMLDivElement>(null);
  const [survol, setSurvol] = useState<SurvolBarre | null>(null);
  const poser = (cle: string, plateforme: Plateforme | null, clientX: number, cible: HTMLElement) => {
    const c = cadre.current?.getBoundingClientRect();
    if (!c) return;
    const r = cible.getBoundingClientRect();
    setSurvol({ cle, plateforme, x: clientX - c.left, y: r.bottom - c.top });
  };
  const barre = survol ? blocs.flatMap((bl) => bl.barres.map((x) => ({ x, pan: bl.panneau }))).find(({ x }) => x.cle === survol.cle) : undefined;
  const largeur = cadre.current?.clientWidth ?? 0;

  return (
    <div className={`social-panneaux${multiples ? " multiples" : ""}`} ref={cadre}>
      {blocs.map((b) => (
        <div key={b.panneau.cle} className="social-panneau">
          {titrePanneau(data, b.panneau) && <div className="social-panneau-titre">{titrePanneau(data, b.panneau)}</div>}
          <ol className={`social-barres social-barres-empilees${multiples ? " compactes" : ""}`} onPointerLeave={() => setSurvol(null)}>
            {b.barres.map((x) => {
              const couleur = couleurElement(data, x.element, b.panneau);
              const detail = x.segments
                .map((sg) => `${sg.plateforme ? NOMS_PLATEFORMES[sg.plateforme] : ""} ${nombreFr(sg.valeur)}`.trim())
                .join(" · ");
              const actif = survol?.cle === x.cle;
              return (
                <li key={x.cle} className={actif ? "survolee" : undefined}>
                  <span className="social-nom">
                    {x.element.plateforme && !x.element.party ? <Logo p={x.element.plateforme} /> : nomElement(data, x.element)}
                  </span>
                  <span
                    className="social-piste"
                    role="img"
                    tabIndex={0}
                    aria-label={`${nomElement(data, x.element)}\u00a0: ${nombreFr(x.total)} ${NOMS_MESURES[m]}${detail ? ` (${detail})` : ""}`}
                    onPointerMove={(e) => {
                      // Le segment sous le pointeur dit le réseau ; hors segment, toute la barre.
                      const seg = (e.target as HTMLElement).closest("i");
                      poser(x.cle, (seg?.dataset.plateforme as Plateforme | undefined) ?? null, e.clientX, e.currentTarget);
                    }}
                    onFocus={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      poser(x.cle, null, r.left + r.width / 2, e.currentTarget);
                    }}
                    onBlur={() => setSurvol(null)}
                  >
                    {/* La barre occupe sa part de la piste, total réservé au bout. */}
                    <span className="social-segments" style={{ width: `calc((100% - 5rem) * ${x.total / max})` }}>
                      {x.segments.map((sg, k) => {
                        const part = x.total > 0 ? sg.valeur / x.total : 0;
                        return (
                          <i
                            key={sg.plateforme ?? k}
                            // Texture seulement là où des plateformes se côtoient dans la barre.
                            className={`${x.segments.length > 1 ? texture(sg.plateforme) ?? "" : ""}${actif && survol?.plateforme && survol.plateforme !== sg.plateforme ? " estompe" : ""}`.trim() || undefined}
                            style={{ width: `${100 * part}%`, background: couleur }}
                            data-plateforme={sg.plateforme ?? undefined}
                          >
                            {sg.plateforme && (100 * sg.valeur) / max >= seuilLogo && <Logo p={sg.plateforme} />}
                          </i>
                        );
                      })}
                    </span>
                    <span className="social-valeur">{nombreFr(x.total)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      {/* Seulement ce que la barre ne dit pas déjà : la part du réseau sous le
          pointeur (ou de chacun, hors segment). Rien pour un seul réseau. */}
      {survol && barre && barre.x.segments.length > 1 && (
        <div
          className="social-bulle-barre"
          role="presentation"
          style={{ left: Math.max(130, Math.min(Math.max(130, largeur - 130), survol.x)), top: survol.y + 6 }}
        >
          <dl>
            {barre.x.segments.filter((sg) => !survol.plateforme || sg.plateforme === survol.plateforme).map((sg) => (
              <div key={sg.plateforme ?? "?"} className={survol.plateforme === sg.plateforme ? "active" : undefined}>
                <dt>
                  {sg.plateforme && <Logo p={sg.plateforme} taille={12} />} {sg.plateforme ? NOMS_PLATEFORMES[sg.plateforme] : "Autre"}
                </dt>
                <dd>{nombreFr(sg.valeur)}</dd>
                <dd className="social-bulle-barre-part">{barre.x.total > 0 ? `${Math.round((100 * sg.valeur) / barre.x.total)}\u00a0%` : ""}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {axe && (
        <div className="social-axe-titre">
          <span>{AXES[m]}</span>
        </div>
      )}
    </div>
  );
}

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
  // Au survol : le jour sous le pointeur (repère vertical, valeur de chaque
  // courbe dans une infobulle) et la courbe la plus proche, mise en avant.
  const trace = useRef<HTMLDivElement>(null);
  const [survol, setSurvol] = useState<{ i: number; cle: string | null } | null>(null);
  const viser = (clientX: number, clientY: number) => {
    const r = trace.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const i = n > 1 ? Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))) : 0;
    let cle: string | null = null;
    let ecart = 26; // au-delà de 26 px d'une courbe, aucune n'est mise en avant
    for (const c of s) {
      const d = Math.abs((y(c.valeurs[i] ?? 0) / 100) * r.height - (clientY - r.top));
      if (d < ecart) {
        ecart = d;
        cle = c.element.cle;
      }
    }
    setSurvol((avant) => (avant?.i === i && avant.cle === cle ? avant : { i, cle }));
  };
  const classees = survol ? [...s].sort((a, b) => (b.valeurs[survol.i] ?? 0) - (a.valeurs[survol.i] ?? 0)) : [];
  // Dates de l'axe : cinq au plus, trois dans un panneau (début, milieu, fin).
  const reperes = compact
    ? [...new Set([0, Math.floor((n - 1) / 2), n - 1])]
    : Array.from({ length: n }, (_, i) => i).filter((i) => i % Math.max(1, Math.ceil(n / 5)) === 0);

  return (
    <div className="social-graphe" role="img" aria-label={`${NOMS_MESURES[m]} ${hebdo ? "par semaine" : "par jour"}`}>
      <div
        className="social-trace"
        ref={trace}
        onPointerMove={(e) => viser(e.clientX, e.clientY)}
        onPointerDown={(e) => viser(e.clientX, e.clientY)}
        onPointerLeave={(e) => e.pointerType !== "touch" && setSurvol(null)}
      >
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
                strokeWidth={survol?.cle === c.element.cle ? 2.8 : 1.8}
                strokeOpacity={survol?.cle && survol.cle !== c.element.cle ? 0.28 : 1}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
          {survol && n > 1 && (
            <line
              x1={x(survol.i)}
              x2={x(survol.i)}
              y1={0}
              y2={100}
              stroke="var(--ink-soft)"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {survol &&
          n > 1 &&
          s.map((c) => (
            <span
              key={c.element.cle}
              className={`social-point-survol${survol.cle && survol.cle !== c.element.cle ? " estompe" : ""}`}
              style={{ left: `${x(survol.i)}%`, top: `${y(c.valeurs[survol.i] ?? 0)}%`, background: couleurElement(data, c.element, panneau) }}
            />
          ))}
        {survol && (
          <div
            className="social-bulle-barre social-bulle-courbe"
            role="presentation"
            style={{ left: `${x(survol.i)}%`, transform: x(survol.i) > 55 ? "translateX(calc(-100% - 14px))" : "translateX(14px)" }}
          >
            <div className="social-bulle-courbe-date">
              {hebdo ? `Semaine du ${jourCourt(jours[survol.i])}` : jourCourt(jours[survol.i])} · {NOMS_MESURES[m]}
            </div>
            <dl>
              {classees.map((c) => (
                <div key={c.element.cle} className={survol.cle === c.element.cle ? "active" : undefined}>
                  <dt>
                    <i style={{ background: couleurElement(data, c.element, panneau) }} />
                    {nomElement(data, c.element)}
                  </dt>
                  <dd>{nombreFr(c.valeurs[survol.i] ?? 0)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
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
            {court(v)}
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
            style={{
              top: `${f.y}%`,
              color: couleurElement(data, f.c.element, panneau),
              opacity: survol?.cle && survol.cle !== f.c.element.cle ? 0.35 : 1,
            }}
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
  // Photo, carrousel, partage : leur icône ; le « document » est réservé au texte.
  return (
    <svg className="social-nature" viewBox="0 0 24 24" aria-hidden="true">
      {nature === "partage" ? (
        <path d="M14 5l7 7-7 7v-4c-5 0-8.5 1.5-11 5 1-5 4-10 11-11V5z" />
      ) : nature === "photo" ? (
        <path d="M4 5h16v14H4V5zm2 2v8.5l3.5-4 3 3.3 2.2-2.3L18 15.8V7H6zm9 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
      ) : nature === "carrousel" ? (
        <path d="M7 4h13v13H7V4zm2 2v9h9V6H9zM3 8h2v11h11v2H3V8z" />
      ) : nature === "video" ? (
        <path d="M8 5v14l11-7z" />
      ) : (
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
        : p.nature === "photo"
          ? "Photo sans texte"
          : p.nature === "carrousel"
            ? "Carrousel sans texte"
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
export function chargeFil(code: number) {
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
const ENCARTS = [
  { cle: "montreal", titre: "Montréal" },
  { cle: "quebec", titre: "Québec" },
] as const;

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

/** Les filtres qui écartent quelque chose, en clair : « TikTok · QS, PQ ».
 *  Vide quand tout est coché. */
export function resumeFiltres(data: SocialData, plateformes: Plateforme[], partis: PartyKey[]): string {
  return [
    plateformes.length < PLATEFORMES.length ? PLATEFORMES.filter((p) => plateformes.includes(p)).map((p) => NOMS_PLATEFORMES[p]).join(", ") : "",
    partis.length < data.partis.length ? data.partis.filter((k) => partis.includes(k)).map((k) => data.partiInfo[k].sigle).join(", ") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Vrai si un filtre (Plateforme, Parti, Type de compte) diffère du défaut :
 *  tout coché. Montre « Réinitialiser ». */
export function filtresModifies(data: SocialData, plateformes: Plateforme[], partis: PartyKey[], types: TypeCompte[]): boolean {
  return plateformes.length !== PLATEFORMES.length || partis.length !== data.partis.length || types.length !== TYPES.length;
}

/** Une circonscription. Au survol ou au focus : une infobulle compacte près du
 *  pointeur (nom, région, parti en tête, candidats et leurs comptes),
 *  décorative pour les lecteurs d'écran (aria-hidden). Au clic (`epinglee`) :
 *  la fiche, posée au centre de l'écran de l'appareil, avec en plus les 10
 *  dernières publications, chacune un lien vers son réseau. */
export function Infobulle({
  data,
  circo,
  m,
  unite,
  periodeTexte,
  valeurs,
  plateformes,
  partis,
  x,
  y,
  largeur,
  hauteur,
  versLeHaut,
  epinglee = false,
  onFermer,
  onRetirerFiltres,
}: {
  /** Au survol : ouvrir au-dessus du pointeur (bas de l'écran visible). Par défaut, selon la moitié de la carte. */
  versLeHaut?: boolean;
  epinglee?: boolean;
  onFermer?: () => void;
  /** Remet les filtres par défaut (lien « Retirer les filtres »). */
  onRetirerFiltres?: () => void;
  data: SocialData;
  circo: Circo;
  m: Meneur;
  /** Unité de l'indicateur (« j’aime », « abonnés »…) et sa période (« sur la période »). */
  unite: string;
  periodeTexte: string;
  /** Valeur de chaque compte de `data.audience`, par index. */
  valeurs: readonly number[];
  plateformes: Plateforme[];
  partis: PartyKey[];
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}) {
  const aGauche = x > largeur - 360;
  const enHaut = versLeHaut ?? y > hauteur * 0.5;
  // Écran étroit : l'infobulle prend toute la largeur, jamais coupée.
  const etroit = largeur < 600;
  // Le fil ne se charge que pour la fiche : le survol reste léger.
  const etat = useFil(epinglee ? circo.code : null);
  // Le fil suit l'actualité, pas les filtres : les 10 dernières publications
  // de la circonscription, toutes plateformes et tous partis. La couleur et la
  // liste des candidats, elles, suivent les filtres.
  const fil = (etat.fil ?? []).slice(0, 10);
  // Les comptes de candidats de la circonscription, avec leur valeur sur la
  // fenêtre (même source que la couleur de la carte).
  const comptesCirco = data.audience.map((a, i) => ({ ...a, i })).filter((a) => a.code === circo.code && a.type === "candidat");
  const lignes = data.partis
    .filter((k) => partis.includes(k))
    .map((k) => ({ k, comptes: comptesCirco.filter((c) => c.party === k && plateformes.includes(c.plateforme)) }))
    .filter((l) => l.comptes.length > 0);
  // Les plateformes présentes dans la circonscription : une colonne chacune,
  // pour aligner les logos sans réserver de place aux plateformes absentes.
  const pfPresentes = PLATEFORMES.filter((pf) => lignes.some((l) => l.comptes.some((c) => c.plateforme === pf)));
  // Des comptes suivis, tous écartés par les filtres : le dire, et non « aucun compte ».
  const filtresVides = lignes.length === 0 && comptesCirco.length > 0;
  const filtresActifs = resumeFiltres(data, plateformes, partis);
  return (
    <div
      className={`social-infobulle${epinglee ? " epinglee social-fiche circo" : ""}${etroit && !epinglee ? " etroite" : ""}`}
      {...(epinglee
        ? { role: "dialog", "aria-modal": true, "aria-label": `${circo.nom}\u00a0: candidats et dernières publications` }
        : { "aria-hidden": true })}
      style={
        epinglee
          ? undefined
          : etroit
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
        <button type="button" className="social-infobulle-fermer" onClick={onFermer} aria-label="Fermer la fiche" autoFocus>
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
            en tête {periodeTexte}
          </>
        ) : m.valeur > 0 ? (
          "Égalité entre partis"
        ) : filtresVides ? (
          "Rien avec ces filtres"
        ) : (
          `Aucun ${unite} ${periodeTexte}`
        )}
      </div>
      {filtresVides ? (
        <div className="social-infobulle-filtres">
          <span className="social-meta">
            Aucun compte ne correspond aux filtres{filtresActifs ? ` (${filtresActifs})` : ""}
          </span>
          {onRetirerFiltres && (
            <button type="button" className="social-lien" onClick={onRetirerFiltres}>
              Retirer les filtres
            </button>
          )}
        </div>
      ) : lignes.length === 0 ? (
        <div className="social-meta">Aucun compte de candidat suivi</div>
      ) : (
        <>
        <span className="social-infobulle-entete">
          <span className="social-meta">Candidats</span>
          <span className="social-meta">{unite.charAt(0).toUpperCase() + unite.slice(1)}</span>
        </span>
        <ul>
          {lignes.map(({ k, comptes }) => {
            const n = comptes.reduce((s, c) => s + (valeurs[c.i] ?? 0), 0);
            return (
              <li key={k}>
                <span className="social-infobulle-sigle" style={{ color: data.partiInfo[k].couleur }}>
                  {data.partiInfo[k].sigle}
                </span>
                <span className="social-infobulle-nom">{comptes[0].nom}</span>
                {/* Une case fixe par plateforme (Facebook, Instagram, TikTok) : les
                    logos d'une même plateforme restent alignés d'une ligne à l'autre. */}
                <span className="social-infobulle-logos" style={{ gridTemplateColumns: `repeat(${pfPresentes.length}, 14px)` }}>
                  {pfPresentes.map((pf) =>
                    comptes.some((c) => c.plateforme === pf) ? (
                      <Logo key={pf} p={pf} taille={12} />
                    ) : (
                      <span key={pf} className="social-infobulle-logo-vide" aria-hidden="true" />
                    ),
                  )}
                </span>
                <span className="social-infobulle-n">{nombreFr(n)}</span>
              </li>
            );
          })}
        </ul>
        </>
      )}
      {epinglee && (
      <div className="social-infobulle-fil">
        <span className="social-infobulle-entete">
          <span className="social-meta">Dernières publications</span>
          <span className="social-meta">J’aime</span>
        </span>
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
          <span className="social-meta">Aucune publication récente</span>
        ) : (
          <ol>
            {fil.map((p, i) => (
              <li key={`${p.url ?? ""}-${i}`}>
                <Logo p={p.plateforme} taille={11} />
                <b style={{ color: data.partiInfo[p.party].couleur }}>{data.partiInfo[p.party].sigle}</b>
                <span className="social-infobulle-date">{jourBref(p.jour)}</span>
                {p.url ? (
                  <a className="social-infobulle-texte" href={p.url} target="_blank" rel="noopener noreferrer">
                    {p.texte || "(sans texte)"}
                  </a>
                ) : (
                  <span className="social-infobulle-texte">{p.texte || "(sans texte)"}</span>
                )}
                <span className="social-infobulle-n">{nombreFr(p.jaime)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      )}
      {!epinglee && <span className="social-infobulle-pied">cliquez pour voir les dernières publications</span>}
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
  return toutes
    .map((s) => ({ s, r: rangSuggestion(s.nom, q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.s.nom.localeCompare(b.s.nom, "fr"))
    .slice(0, max)
    .map((x) => x.s);
}

/** Rang d'une suggestion : début du nom, puis début d'un mot, puis ailleurs. */
function rangSuggestion(nom: string, q: string) {
  const n = sansAccents(nom);
  if (n.startsWith(q)) return 0;
  if (n.split(" ").some((m) => m.startsWith(q))) return 1;
  return n.includes(q) ? 2 : -1;
}

/** Une candidature proposée par la recherche de l'onglet Candidats. */
export type SuggestionCandidat = { cle: string; nom: string; sous: string; party: PartyKey; code: number; comptes: number };

/** Les candidatures officielles (635), pour la recherche de l'onglet
 *  Candidats : mêmes règles que la recherche de la carte. */
export function suggestionsCandidats(data: SocialData, requete: string, max = 8): SuggestionCandidat[] {
  const q = sansAccents(requete.trim());
  if (q.length < 2 || !data.candidatures?.length) return [];
  const circos = new Map((data.carte?.circos ?? []).map((c) => [c.code, c.nom]));
  return data.candidatures
    .map(([nom, iParti, code, comptes]) => ({ nom, party: data.partis[iParti], code, comptes, r: rangSuggestion(nom, q) }))
    .filter((x) => x.r >= 0 && x.party)
    .sort((a, b) => a.r - b.r || a.nom.localeCompare(b.nom, "fr"))
    .slice(0, max)
    .map(({ nom, party, code, comptes }) => {
      const circo = circos.get(code) ?? "";
      return {
        cle: `${code}-${party}`,
        nom,
        party,
        code,
        comptes,
        sous: `${circo} · ${data.partiInfo[party].sigle}${comptes ? "" : " · aucun compte suivi"}`,
      };
    });
}

/** Champ de recherche à suggestions, accessible au clavier (motif
 *  « combobox ») : la carte et l'onglet Candidats s'en servent. */
function Combobox<T extends { cle: string; nom: string; sous: string }>({
  id,
  libelle,
  placeholder,
  chercher,
  onChoisir,
}: {
  id: string;
  libelle: string;
  placeholder: string;
  chercher: (texte: string) => T[];
  onChoisir: (sg: T) => void;
}) {
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [i, setI] = useState(0);
  const liste = useMemo(() => chercher(texte), [chercher, texte]);
  const choisir = (sg: T) => {
    setTexte(sg.nom);
    setOuvert(false);
    onChoisir(sg);
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
      <label htmlFor={`${id}-champ`} className="visually-hidden">
        {libelle}
      </label>
      <input
        id={`${id}-champ`}
        type="search"
        role="combobox"
        autoComplete="off"
        placeholder={placeholder}
        aria-expanded={visible}
        aria-controls={`${id}-liste`}
        aria-autocomplete="list"
        aria-activedescendant={visible ? `${id}-sg-${liste[i]?.cle}` : undefined}
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
        <ul id={`${id}-liste`} role="listbox" aria-label="Suggestions">
          {liste.map((sg, n) => (
            <li
              key={sg.cle}
              id={`${id}-sg-${sg.cle}`}
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

function Recherche({ data, onChoisir }: { data: SocialData; onChoisir: (code: number) => void }) {
  const chercher = useMemo(() => (t: string) => suggestions(data, t), [data]);
  return (
    <Combobox
      id="social-recherche"
      libelle="Chercher une circonscription ou un candidat"
      placeholder="Circonscription ou candidat·e"
      chercher={chercher}
      onChoisir={(sg) => onChoisir(sg.code)}
    />
  );
}

export function Carte({
  data,
  m: mesure,
  d0,
  d1,
  plateformes,
  partis,
  onRetirerFiltres,
  couche = null,
}: {
  data: SocialData;
  /** L'indicateur et la fenêtre choisis : la carte les suit comme les autres vues. */
  m: Mesure;
  d0: number;
  d1: number;
  /** La couche de l'écran de l'appareil où se pose la fiche d'une circonscription. */
  couche?: HTMLElement | null;
  plateformes: Plateforme[];
  partis: PartyKey[];
  onRetirerFiltres?: () => void;
}) {
  const carte = data.carte!;
  const unite = NOMS_MESURES[mesure];
  const periodeTexte = mesure === "abonnes" ? "au dernier relevé" : "sur la période";
  const [W, H] = [carte.vue[2], carte.vue[3]];
  // Le viewBox est le Québec méridional : la vue identité le montre, ⟲ y
  // revient ; le dézoom descend jusqu'à la province entière.
  const [sx, sy, sw, sh] = carte.sud;
  const kMin = Math.min(sw / W, sh / H);
  const [choix, setChoix] = useState<number | null>(null);
  // La valeur de chaque compte sur la fenêtre (table « compte par jour »,
  // chargée à la demande ; les abonnés viennent du dernier relevé).
  const activite = useAudienceJour(data, mesure !== "abonnes");
  const valeurs = useMemo(() => valeursComptes(data.audience, activite.jours, mesure, { d0, d1 }), [data.audience, activite.jours, mesure, d0, d1]);
  const meneurs = useMemo(() => meneursCarte(data.audience, valeurs, plateformes, partis), [data.audience, valeurs, plateformes, partis]);
  // Opacité : 0,25 + 0,7 × √(valeur / maximum), comme la démo.
  const maxValeur = useMemo(() => Math.max(1, ...[...meneurs.values()].map((m) => m.valeur)), [meneurs]);
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
    const k = Math.min(40, Math.max(kMin, v.k));
    // La province reste à l'écran, avec une marge de 10 % du cadre.
    const lim = (t: number, debut: number, taille: number, etendue: number) => {
      const a = debut + taille - etendue * k - 0.1 * taille;
      const b = debut + 0.1 * taille;
      return etendue * k >= taille ? Math.min(b, Math.max(a, t)) : Math.min(Math.max(a, b), Math.max(Math.min(a, b), t));
    };
    return { k, tx: lim(v.tx, sx, sw, W), ty: lim(v.ty, sy, sh, H) };
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
      const k = Math.min(40, Math.max(kMin, v.k * facteur));
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
    const k = Math.min(40, Math.max(kMin, Math.min((sw * 0.55) / Math.max(b.w, 1), (sh * 0.55) / Math.max(b.h, 1))));
    return { k, tx: sx + sw / 2 - (b.x + b.w / 2) * k, ty: sy + sh / 2 - (b.y + b.h / 2) * k };
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
  type Survol = { code: number; x: number; y: number; par: "souris" | "clavier"; haut?: boolean };
  const [survol, setSurvol] = useState<Survol | null>(null);
  const [epingle, setEpingle] = useState<{ code: number; x: number; y: number } | null>(null);
  const relatif = (x: number, y: number) => {
    const r = vuesRef.current?.getBoundingClientRect();
    return r ? { x: x - r.left, y: y - r.top } : null;
  };
  const place = (code: number, x: number, y: number, par: Survol["par"]) => {
    const p = relatif(x, y);
    // Dans la moitié basse de l'écran visible, l'infobulle s'ouvre vers le haut.
    const z = vuesRef.current?.closest(".social-zone")?.getBoundingClientRect();
    if (p) setSurvol({ code, ...p, par, haut: z ? y > z.top + z.height * 0.5 : undefined });
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
      if (t?.closest(".social-infobulle, .social-carte-province, .social-carte-encarts, .social-recherche, .social-zoom")) return;
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
    return { fill: data.partiInfo[m.party].couleur, fillOpacity: 0.25 + 0.7 * Math.sqrt(m.valeur / maxValeur) };
  };
  const titre = (code: number, nom: string) => {
    const m = meneurs.get(code);
    return m?.party
      ? `${nom} : ${data.partiInfo[m.party].sigle} en tête, ${nombreFr(m.parParti[m.party]!)} ${unite}`
      : `${nom} : ${m && m.valeur > 0 ? "égalité" : `aucun ${unite}`}`;
  };
  const circo = carte.circos.find((c) => c.code === choix) ?? null;
  const bulle = epingle ?? survol;

  return (
    <div className="social-carte">
      <Recherche data={data} onChoisir={trouver} />
      <ul className="social-carte-legende" aria-label={`Parti en tête, en ${unite}`}>
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
          Sans {unite}
        </li>
        <li className="social-carte-legende-note">
          {activite.charge ? "chargement de l’activité par jour…" : "plus la couleur est soutenue, plus le total est élevé"}
        </li>
      </ul>

      <div className="social-carte-vues" ref={vuesRef}>
        <div className="social-carte-principale">
        <svg
          ref={svgRef}
          className="social-carte-province"
          viewBox={carte.sud.join(" ")}
          style={{ aspectRatio: `${sw} / ${sh}` }}
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
                aria-label={`${titre(c.code, c.nom)}. Entrée pour ouvrir sa fiche.`}
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
            {/* Zones des encarts, en pointillé fin. */}
            {ENCARTS.map((e) => {
              const [x, y, w, h] = carte.encarts[e.cle];
              return <rect key={e.cle} className="social-carte-cadre" x={x} y={y} width={w} height={h} vectorEffect="non-scaling-stroke" />;
            })}
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
            aria-label="Revenir au cadrage initial"
            title="Revenir au cadrage initial"
          >
            ⟲
          </button>
        </div>
        </div>
        {/* Encarts fixes (pas de zoom) : mêmes formes, mêmes couleurs, mêmes
            gestes que la carte principale ; décoratifs pour les lecteurs
            d'écran, qui passent par la carte principale et la recherche. */}
        <div className="social-carte-encarts" aria-hidden="true">
          {ENCARTS.map((e) => (
            <figure key={e.cle}>
              <svg viewBox={carte.encarts[e.cle].join(" ")}>
                {carte.circos.map((c) => (
                  <use
                    key={c.code}
                    href={`#sc-circo-${c.code}`}
                    data-code={c.code}
                    {...remplissage(c.code)}
                    onClick={(ev) => epingler(c.code, ev.clientX, ev.clientY)}
                    onPointerMove={(ev) => ev.pointerType !== "touch" && !epingle && place(c.code, ev.clientX, ev.clientY, "souris")}
                    onPointerLeave={() => efface("souris")}
                  />
                ))}
                {circo && <use href={`#sc-circo-${circo.code}`} className="social-carte-contour" />}
              </svg>
              <figcaption>{e.titre}</figcaption>
            </figure>
          ))}
        </div>
        {/* Au survol : l'infobulle compacte, près du pointeur. Au clic : la
            fiche, posée au centre de l'écran de l'appareil (portail), jamais
            coupée ; sans couche (rendu isolé), elle reste sur la carte. */}
        {bulle &&
          (() => {
            const fiche = (
              <Infobulle
                key={epingle ? `e${bulle.code}` : "survol"}
                data={data}
                circo={carte.circos.find((c) => c.code === bulle.code)!}
                m={meneurs.get(bulle.code) ?? { party: null, valeur: 0, parParti: {} }}
                unite={unite}
                periodeTexte={periodeTexte}
                valeurs={valeurs}
                plateformes={plateformes}
                partis={partis}
                x={bulle.x}
                y={bulle.y}
                largeur={vuesRef.current?.clientWidth ?? 0}
                hauteur={vuesRef.current?.clientHeight ?? 0}
                versLeHaut={epingle ? undefined : survol?.haut}
                epinglee={!!epingle}
                onFermer={() => {
                  setEpingle(null);
                  setChoix(null);
                }}
                onRetirerFiltres={onRetirerFiltres}
              />
            );
            return epingle && couche ? createPortal(<div className="social-fiche-fond">{fiche}</div>, couche) : fiche;
          })()}
      </div>

      <p className="social-note">
        Comptes de candidats seulement. Comprend des données
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
/** Icônes des vues (barre d'onglets mobile) : traits simples sur 24 x 24. */
function IconeVue({ v }: { v: Vue }) {
  const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="social-icone-vue">
      {/* Un parti : un groupe ; un candidat : une personne seule. */}
      {v === "partis" && (
        <g {...trait}>
          <circle cx="12" cy="7.5" r="3" />
          <path d="M6.5 19c.6-3.4 3-5.3 5.5-5.3s4.9 1.9 5.5 5.3" />
          <circle cx="5" cy="9.5" r="2.2" />
          <path d="M1.5 18c.4-2.6 1.9-4.2 3.9-4.3" />
          <circle cx="19" cy="9.5" r="2.2" />
          <path d="M22.5 18c-.4-2.6-1.9-4.2-3.9-4.3" />
        </g>
      )}
      {v === "candidats" && (
        <g {...trait}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c.7-4 3.6-6.2 7-6.2s6.3 2.2 7 6.2" />
        </g>
      )}
      {v === "palmares" && (
        <g {...trait}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4M12 13v4M8.5 20h7" />
        </g>
      )}
      {v === "carte" && (
        <g {...trait}>
          <path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" />
          <circle cx="12" cy="10.5" r="2.2" />
        </g>
      )}
    </svg>
  );
}

/** Barre d'état de l'appareil : signal, wifi, batterie. Décor seulement. */
function StatutGlyphes() {
  const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const };
  return (
    <span className="social-statut-glyphes">
      <svg viewBox="0 0 16 10" aria-hidden="true">
        <rect x="0" y="6" width="2.5" height="4" fill="currentColor" />
        <rect x="4.5" y="4" width="2.5" height="6" fill="currentColor" />
        <rect x="9" y="2" width="2.5" height="8" fill="currentColor" />
        <rect x="13.5" y="0" width="2.5" height="10" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 14 10" aria-hidden="true">
        <path d="M1 3.5a9 9 0 0 1 12 0M3.2 6a6 6 0 0 1 7.6 0M5.4 8.3a3 3 0 0 1 3.2 0" {...trait} />
      </svg>
      <svg viewBox="0 0 24 10" aria-hidden="true">
        <rect x="0.7" y="0.7" width="19.6" height="8.6" rx="2" {...trait} />
        <rect x="2.5" y="2.5" width="13" height="5" rx="1" fill="currentColor" />
        <path d="M22 3.5v3" {...trait} />
      </svg>
    </span>
  );
}

function IconeFiltres() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="social-icone-vue">
      <path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8L4 5z" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

/** Icônes de Total (barres) et d'Évolution (courbe), devant leur mot. */
function IconeForme({ f }: { f: Forme }) {
  const trait = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 34 24" aria-hidden="true" className="trait">
      {f === "barres" ? (
        <path d="M6 6h18M6 12h22M6 18h12" {...trait} strokeWidth={3} />
      ) : (
        <path d="M5 18l7-7 5 4 6-8 6 3" {...trait} />
      )}
    </svg>
  );
}

/** Icônes des indicateurs : abonnés, publications, j'aime, commentaires. */
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
      {m === "jaime" && <path d={coeur(17, 15.5, 1.35)} {...trait} />}
      {m === "commentaires" && (
        <path d="M8 6h18a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H15l-5 3.5V18H8a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 8 6z" {...trait} />
      )}
    </svg>
  );
}

/** L'indicateur du graphique (Partis) ou du classement (Candidats) : une
 *  rangée de boutons, celui qui est enfoncé est l'indicateur affiché. */
function Indicateurs({
  active,
  onChoisir,
  indisponible,
}: {
  active: Mesure;
  onChoisir: (m: Mesure) => void;
  /** Pourquoi un indicateur est grisé dans la vue courante, sinon null. */
  indisponible: (m: Mesure) => string | null;
}) {
  return (
    <div className="social-bascule social-indicateurs" role="group" aria-label="Indicateur affiché">
      {MESURES.map((x) => {
        const on = x.cle === active;
        const raison = indisponible(x.cle);
        return (
          <button
            type="button"
            key={x.cle}
            className={on ? "active" : undefined}
            aria-pressed={on}
            disabled={!!raison}
            title={raison ?? undefined}
            onClick={() => onChoisir(x.cle)}
          >
            <IconeMesure m={x.cle} />
            {x.libelle}
          </button>
        );
      })}
    </div>
  );
}

/** Les trois groupes de filtres, dans la colonne de droite (grand écran) ou
 *  dans le tiroir (mobile). */
function GroupeFiltres({
  data,
  plateformes,
  partis,
  setPlateformes,
  setPartis,
}: {
  data: SocialData;
  plateformes: Plateforme[];
  partis: PartyKey[];
  setPlateformes: (v: Plateforme[]) => void;
  setPartis: (v: PartyKey[]) => void;
}) {
  return (
    <>
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
    </>
  );
}

export function SocialClient({ data }: { data: SocialData }) {
  const n = data.jours.length;
  // À l'arrivée : toute la campagne, du déclenchement au dernier jour complet.
  const [d0, setD0] = useState(data.campagne);
  const [d1, setD1] = useState(n - 1);
  const [plateformes, setPlateformes] = useState<Plateforme[]>([...PLATEFORMES]);
  const [partis, setPartis] = useState<PartyKey[]>([...data.partis]);
  const [vue, setVue] = useState<Vue>("partis");
  const vues = data.carte ? VUES : VUES.filter((v) => v.cle !== "carte");
  const [forme, setForme] = useState<Forme>("barres");
  // Une seule mesure, partagée par Partis et Candidats : j'aime à l'arrivée.
  const [m, setMesure] = useState<Mesure>("jaime");
  // Mobile : le tiroir des filtres, ouvert depuis la barre du bas.
  const [tiroir, setTiroir] = useState(false);
  // La couche de l'écran, par-dessus la zone qui défile : la fiche d'un compte s'y pose.
  const [couche, setCouche] = useState<HTMLDivElement | null>(null);
  // Grand écran : la tablette garde sa taille et défile à l'intérieur ; une
  // flèche en bas de l'écran dit qu'il reste du contenu, tant qu'il en reste.
  const defileur = useRef<HTMLDivElement>(null);
  const [resteADefiler, setResteADefiler] = useState(false);
  useEffect(() => {
    const el = defileur.current;
    if (!el) return;
    const maj = () => setResteADefiler(el.scrollHeight - el.clientHeight - el.scrollTop > 12);
    maj();
    el.addEventListener("scroll", maj, { passive: true });
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", maj);
      ro.disconnect();
    };
  }, []);
  useEffect(() => {
    defileur.current?.scrollTo({ top: 0 });
  }, [vue]);
  useEffect(() => {
    if (!tiroir) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setTiroir(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [tiroir]);

  // Le type de compte n'est pas un filtre : l'onglet Candidats ne classe que
  // des comptes de candidats, les autres vues prennent tout (partis officiels
  // et candidats).
  const types: TypeCompte[] = useMemo(() => (vue === "candidats" ? ["candidat"] : [...TYPES]), [vue]);
  const f: Filtres = useMemo(() => ({ d0, d1, plateformes, partis, types }), [d0, d1, plateformes, partis, types]);
  const periode = (a: number, b: number) => {
    setD0(a);
    setD1(b);
  };
  const modifies = filtresModifies(data, plateformes, partis, [...TYPES]);
  const retirerFiltres = () => {
    setPlateformes([...PLATEFORMES]);
    setPartis([...data.partis]);
  };
  // Nombre d'options écartées : le badge du bouton « Filtres ».
  const nbFiltres = PLATEFORMES.length - plateformes.length + (data.partis.length - partis.length);

  const frise = useMemo(() => parJourParti(data, f), [data, f]);
  const couleursPartis = useMemo(() => data.partis.map((p) => data.partiInfo[p].couleur), [data]);
  const rows = useMemo(() => lignes(data, f), [data, f]);
  const t = totaux(rows);
  const nbJours = d1 - d0 + 1;

  // Pas de série d'abonnés par jour : « dans le temps » est grisé pour eux.
  const formeEff: Forme = m === "abonnes" ? "barres" : forme;
  // Un seul découpage : les partis côte à côte, chaque barre empilée par
  // réseau (le survol donne le détail).
  const pans = panneaux("ensemble", f);
  const graphique = vue === "partis";
  const rowsM = useMemo(() => (m === "abonnes" ? lignesAbonnes(data, f) : rows), [m, data, f, rows]);
  const abonnes = useMemo(() => totaux(lignesAbonnes(data, f)).publications, [data, f]);

  // Les tuiles choisissent l'indicateur ; hors de Partis et Candidats, en
  // choisir un ramène à Partis. Sans l'activité par compte et par jour,
  // Candidats ne classe qu'en abonnés : un autre indicateur ramène aussi à Partis.
  const candidatsAbonnesSeulement = !(data.audienceJour.length || data.audienceJourDispo);
  const choisirMesure = (cle: Mesure) => {
    setMesure(cle);
    if ((vue === "candidats" || vue === "carte") && candidatsAbonnesSeulement && cle !== "abonnes") setVue("partis");
  };
  /** Par publication : abonnés et publications ne se comptent pas par publication. */
  const indisponible = (cle: Mesure): string | null =>
    vue === "palmares" && (cle === "abonnes" || cle === "publications") ? "Ne se compte pas par publication" : null;
  /** La case enfoncée : l'indicateur, ou ce qui classe les publications. */
  const mActive: Mesure = vue === "palmares" ? mesurePalmares(m) : m;
  // Le total de l'indicateur, pour le sous-titre de l'onglet Partis.
  const totalM = m === "abonnes" ? abonnes : m === "publications" ? t.publications : m === "jaime" ? t.jaime : t.commentaires;

  const raccourcis: { libelle: string; a: number }[] = [
    { libelle: "7 j", a: Math.max(0, n - 7) },
    { libelle: "30 j", a: Math.max(0, n - 30) },
    { libelle: "Campagne", a: data.campagne },
    { libelle: "Tout", a: 0 },
  ];

  // Par publication : les 10 en tête, par j'aime ou par commentaires selon la
  // case enfoncée.
  const mP = mesurePalmares(m);
  const tops = vue === "palmares" ? palmares(data, f, mP) : [];

  const sousTitre =
    vue === "candidats"
        ? m === "abonnes"
          ? `Les ${AUDIENCE_MAX} comptes de candidats les plus suivis, en abonnés. Dernier relevé : la période ne s’applique pas.`
          : `Les ${AUDIENCE_MAX} comptes de candidats en tête sur la période, en ${MESURE[m].unite}.`
        : vue === "palmares"
          ? `Les 10 publications les plus ${mP === "commentaires" ? "commentées" : "aimées"} de la période.`
          : vue === "carte"
            ? m === "abonnes"
              ? "Chaque circonscription prend la couleur du parti dont les candidats comptent le plus d’abonnés, au dernier relevé."
              : m === "publications"
                ? "Chaque circonscription prend la couleur du parti dont les candidats y publient le plus sur la période."
                : `Chaque circonscription prend la couleur du parti dont les candidats y reçoivent le plus de ${MESURE[m].unite} sur la période.`
            : m === "abonnes"
              ? `${nombreFr(totalM)} abonnés au dernier relevé (la période ne s’applique pas).`
              : `${nombreFr(totalM)} ${MESURE[m].unite} sur la période.`;

  const filtres = (
    <GroupeFiltres
      data={data}
      plateformes={plateformes}
      partis={partis}
      setPlateformes={setPlateformes}
      setPartis={setPartis}
    />
  );

  return (
    <>
      <section className="social">
        {/* Le module vit dans un appareil : un téléphone sur téléphone, une
            tablette sur grand écran (le CSS choisit). L'écran a une hauteur
            fixe et défile à l'intérieur ; la barre d'onglets (mobile) et le
            tiroir des filtres restent dans l'écran. Grand écran : le tableau
            de bord à gauche, les filtres à droite derrière un filet. */}
        <div className="social-appareil">
          <div className="social-ecran">
            <div className="social-statut" aria-hidden="true">
              <span className="social-statut-long">La Vitrine démocratique</span>
              <span className="social-statut-court">Vitrine</span>
              <StatutGlyphes />
            </div>
            {/* L'écran : barre d'état, zone qui défile (avec sa flèche), puis la
                barre d'onglets du téléphone. L'appareil ne change jamais de taille. */}
            <div className="social-zone">
            <div className="social-defilement" ref={defileur}>
        <div className="social-tdb">
          <div className="social-entete partis-title-row">
            <div className="title-block">
              <h2 className="partis-title">
                La guerre des clics
                {/* Texte validé par Adrien le 2026-10-02 : ne pas le retoucher sans lui. */}
                <InfoTip size="lg" label="À propos de La guerre des clics" dans=".social-ecran">
                  Ce module suit les comptes publics des personnes candidates aux élections québécoises de 2026 et les
                  comptes officiels des cinq partis, sur Facebook, Instagram et TikTok. On y compte leurs abonnés, leurs
                  publications, et les j’aime et les commentaires reçus. Ces réactions en ligne ne mesurent pas un appui
                  électoral.
                  <a className="tip-link" href={`${BASE_PATH}/methodologie/#reseaux-sociaux`}>
                    En savoir plus sur la méthodologie →
                  </a>
                </InfoTip>
              </h2>
              <div className="period-subtitle">
                Du {jourCourt(data.jours[d0])} au {jourCourt(data.jours[d1])} · {nombreFr(nbJours)}
                {nbJours > 1 ? " jours" : " jour"}
              </div>
            </div>
            {/* Grand écran : les filtres à droite du titre (sur mobile, le tiroir). */}
            <div className="control-block social-filtres-rangee" role="group" aria-label="Filtres">
              <span className="social-filtrer" aria-hidden="true">
                <IconeFiltres /> Filtrer
              </span>
              {filtres}
              {modifies && (
                <button type="button" className="social-lien social-reinitialiser" onClick={retirerFiltres} aria-label="Réinitialiser les filtres">
                  <span aria-hidden="true">⟲</span> Réinitialiser
                </button>
              )}
            </div>
          </div>
          {/* Sous le titre : la vue. Sur mobile, la barre du bas la remplace. */}
          <div className="social-premiers">
            {/* Grand écran : l'indicateur en grandes cases, avec sa question ;
                celle qui est enfoncée est l'indicateur affiché. */}
            <div className="social-vues social-onglets-haut" role="group" aria-label="Indicateur affiché">
              {MESURES.map((x) => {
                const on = x.cle === mActive;
                const raison = indisponible(x.cle);
                return (
                  <button
                    type="button"
                    key={x.cle}
                    className={`social-vue${on ? " active" : ""}`}
                    aria-pressed={on}
                    disabled={!!raison}
                    title={raison ?? undefined}
                    onClick={() => choisirMesure(x.cle)}
                  >
                    <span className="social-vue-mot">
                      <IconeMesure m={x.cle} />
                      {x.libelle}
                    </span>
                    <small>{x.question}</small>
                  </button>
                );
              })}
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
              <Frise
                jours={data.jours}
                piles={frise}
                couleurs={couleursPartis}
                d0={d0}
                d1={d1}
                campagne={data.campagne}
                onChange={periode}
              />
            </div>
          </div>

          <div className="social-bas">
            {/* Sous les onglets, dans Partis seulement : la forme du graphique et
                son découpage, en icônes ; l'indicateur se choisit par les tuiles. */}
            <div className="social-reglages">
              {/* Grand écran : la vue en boutons sobres ; téléphone : la barre du
                  bas la porte, et c'est l'indicateur qui prend cette place. */}
              <div className="social-reglage social-reglage-vues">
                <Bascule label="Vue" options={vues} valeur={vue} onChange={setVue} prefixe={(c) => <IconeVue v={c} />} />
              </div>
              <div className="social-reglage social-reglage-indicateur">
                <Indicateurs active={mActive} onChoisir={choisirMesure} indisponible={indisponible} />
              </div>
              {graphique && (
                <>
                  <span className="social-reglages-filet" aria-hidden="true" />
                  <div className="social-reglage">
                    <Bascule
                      label="Type de graphique"
                      options={FORMES}
                      valeur={formeEff}
                      onChange={setForme}
                      desactives={m === "abonnes" ? { temps: "Pas de série d’abonnés" } : undefined}
                      prefixe={(c) => <IconeForme f={c} />}
                    />
                  </div>
                </>
              )}
            </div>
            <p className="social-sous-titre">{sousTitre}</p>

            {vue === "candidats" && (
              <Audience data={data} mesure={m} plateformes={plateformes} partis={partis} types={types} d0={d0} d1={d1} couche={couche} />
            )}

            {/* Barres et parts côte à côte (même mesure, filtres et découpe). */}
            {graphique &&
              formeEff === "barres" &&
              (() => {
                // Un panneau de barres par découpe, à échelle commune.
                const blocs = parElement(data, rowsM, pans, m);
                const maxCommun = Math.max(1e-9, ...blocs.flatMap((b) => b.valeurs.map((v) => v.valeur)));
                return (
                  <>
                    {pans.map((pan, i) => (
                      <div key={pan.cle} className="social-barres-seules">
                        <Barres
                          data={data}
                          rows={rowsM}
                          pans={[pan]}
                          m={m}
                          maxCommun={pans.length > 1 ? maxCommun : undefined}
                          axe={i === pans.length - 1}
                        />
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
                        {titrePanneau(data, p.panneau) && <div className="social-panneau-titre">{titrePanneau(data, p.panneau)}</div>}
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
                      {s.hebdo ? "Par semaine\u00a0: la période dépasse 45 jours." : "Par jour."}
                      {s.panneaux.length > 1 ? " Chaque panneau a sa propre échelle." : ""}
                    </p>
                  </div>
                );
              })()}

            {vue === "carte" && data.carte && (
              <Carte data={data} m={m} d0={d0} d1={d1} plateformes={plateformes} partis={partis} onRetirerFiltres={retirerFiltres} couche={couche} />
            )}

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
                    {mP === "commentaires" ? " Une publication très commentée mais peu aimée peut y manquer." : ""}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
            </div>
            {resteADefiler && (
              <button
                type="button"
                className="social-indice-defiler"
                aria-label="Voir la suite"
                onClick={() => defileur.current?.scrollBy({ top: Math.round((defileur.current.clientHeight || 400) * 0.6), behavior: "smooth" })}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            </div>
          {/* Mobile : la barre d'onglets, au bas de l'écran du téléphone (hors du
              défilement), avec le bouton des filtres et son badge. */}
          <nav className="social-barre" aria-label="Vues du module">
            {vues.map((v) => (
              <button type="button" key={v.cle} className={v.cle === vue ? "active" : undefined} aria-pressed={v.cle === vue} onClick={() => setVue(v.cle)}>
                <IconeVue v={v.cle} />
                <span>{v.court}</span>
              </button>
            ))}
            <button
              type="button"
              className="social-barre-filtres"
              aria-haspopup="dialog"
              aria-expanded={tiroir}
              onClick={() => setTiroir(true)}
            >
              <IconeFiltres />
              <span>Filtres</span>
              {nbFiltres > 0 && <b className="social-badge">{nbFiltres}</b>}
            </button>
          </nav>
            <div className="social-couche" ref={setCouche} />
      {tiroir && (
        <div className="social-tiroir-fond" onClick={() => setTiroir(false)}>
          <div className="social-tiroir" role="dialog" aria-modal="true" aria-label="Filtres" onClick={(e) => e.stopPropagation()}>
            <div className="social-tiroir-tete">
              <span className="social-tiroir-poignee" aria-hidden="true" />
              <h3>Filtres</h3>
              <button type="button" className="social-tiroir-fermer" aria-label="Fermer les filtres" onClick={() => setTiroir(false)}>
                ×
              </button>
            </div>
            <div className="social-tiroir-corps">{filtres}</div>
            <div className="social-tiroir-pied">
              <button type="button" className="social-tiroir-remettre" onClick={retirerFiltres} disabled={!modifies}>
                Tout remettre
              </button>
              <button type="button" className="social-tiroir-voir" onClick={() => setTiroir(false)}>
                Voir {nombreFr(t.publications)} publication{t.publications > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
            <span className="social-accueil" aria-hidden="true" />
          </div>
        </div>
      </section>

      <div className="module-last-updated social-pied">
        {data.lastUpdated} · Module expérimental
      </div>
    </>
  );
}
