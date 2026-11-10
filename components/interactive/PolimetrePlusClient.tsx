"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  CATEGORY_ORDER,
  NEUVE_RANGE_ORDER,
  NEUVE_RANGE_TAB_LABELS,
  PARTI_FULL_LABELS,
  PARTI_LABELS,
  RANGE_TAB_LABELS,
  type NeuveRangeKey,
  type PartiKey,
  type PolimetreData,
  type PromesseNeuveView,
  type PromessesNeuvesData,
  type PromiseView,
  type RangeKey,
  type VerdictSlug,
} from "@/lib/data/polimetre-meta";
import { InfoTip } from "@/components/interactive/InfoTip";
import { ShareButton } from "@/components/interactive/ShareButton";
import { couleurEnjeu } from "@/lib/enjeux";
import { SymboleEnjeu } from "@/components/interactive/SymboleEnjeu";

// Number of promises shown at once — the maquette has five spots.
const TOP_N = 5;
const RANGES: RangeKey[] = ["week", "month"];

// Résumé placeholder until AI-generated text is wired in.
const SUMMARY_PLACEHOLDER =
  "Résumé en préparation : un texte généré automatiquement à partir de la couverture médiatique sera bientôt inséré ici.";

/* `masquableSiVide` : le filtre disparaît du rail quand aucune promesse de la
   période ne porte ce verdict. Réservé aux verdicts TRANSITOIRES — « En cours »
   et « En suspens » n'existent que pendant le mandat ; une fois celui-ci clos,
   chaque promesse est réalisée, partielle ou rompue, et ces deux boutons ne
   mèneraient plus qu'à une liste vide. Les trois verdicts finaux restent
   toujours affichés : le rail est aussi la légende des pastilles. */
const VERDICT_FILTERS: {
  value: VerdictSlug | "all";
  label: string;
  short?: string;
  masquableSiVide?: boolean;
}[] = [
  { value: "all", label: "Tous les verdicts" },
  { value: "realisee", label: "Réalisée" },
  { value: "partielle", label: "Partiellement réalisée", short: "Partiellement" },
  { value: "en-cours", label: "En cours", masquableSiVide: true },
  { value: "en-suspens", label: "En suspens", masquableSiVide: true },
  { value: "rompue", label: "Rompue" },
];

function TrendBadge({ trend }: { trend: PromiseView["trend"] }) {
  if (trend.dir === "up") {
    return (
      <span className="ppl-trend ppl-trend--up" aria-label={`Hausse de ${trend.delta} position${trend.delta > 1 ? "s" : ""}`}>
        ▲ +{trend.delta}
      </span>
    );
  }
  if (trend.dir === "down") {
    return (
      <span className="ppl-trend ppl-trend--down" aria-label={`Baisse de ${trend.delta} position${trend.delta > 1 ? "s" : ""}`}>
        ▼ −{trend.delta}
      </span>
    );
  }
  if (trend.dir === "flat") {
    return (
      <span className="ppl-trend ppl-trend--flat" aria-label="Aucun changement">
        {/* garde-redaction: ok (tiret = glyphe de donnée absente) */}
        —
      </span>
    );
  }
  // Pas de rang antérieur comparable : on n'affirme rien sur le mouvement.
  return (
    <span className="ppl-trend ppl-trend--unknown" aria-label="Aucune période de comparaison" title="Aucune période de comparaison">
      ·
    </span>
  );
}

/* Chevron d'affordance (#—) : signale que le rang est dépliable. Pivote de 180°
   à l'ouverture (voir .ppl-promise--open .ppl-chevron dans globals.css).
   aria-hidden : l'état est déjà porté par aria-expanded sur le <li>. */
function Chevron() {
  return (
    <span className="ppl-chevron" aria-hidden="true">
      <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
        <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* Marque du Polimètre, reprise telle quelle du logo officiel (polimeter.org,
   viewBox 50×43). En currentColor : dans le bouton d'encre elle sort en papier,
   et elle suit le thème sans deuxième fichier. aria-hidden parce que le libellé
   du lien nomme déjà le Polimètre. */
function PolimetreMark() {
  return (
    <svg className="ppl-discover__mark" viewBox="0 0 50 43" width="20" height="17" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="35.5" r="5.5" fill="currentColor" stroke="currentColor" strokeWidth="4" />
      <rect x="14.5" y="4.5" width="31" height="17" rx="8.5" stroke="currentColor" strokeWidth="9" />
    </svg>
  );
}

/* Libellé + chevron. Le chevron est solidaire du DERNIER MOT (.ppl-title__last
   en white-space: nowrap) : sans ça, un titre dont le dernier mot tombe pile en
   fin de ligne laisse le chevron seul sur la ligne suivante — cas le plus
   probable à 375 px, où la colonne du titre est la plus étroite. Au pire le
   chevron descend maintenant AVEC son mot. Rendu identique dans les deux états
   du rang (fermé et ouvert), d'où le composant plutôt que deux blocs jumeaux. */
function PromiseTitle({ title, categorie }: { title: string; categorie?: string | null }) {
  const words = title.split(" ");
  const last = words.pop() ?? "";
  return (
    <span className="ppl-title">
      {/* Le symbole vit DANS la cellule du titre, jamais à côté : `.ppl-promise`
          est une grille à trois colonnes (rang, titre, tendance) et un quatrième
          enfant décalerait le titre et la tendance d'une colonne chacun. */}
      <SymboleEnjeu libelle={categorie} className="ppl-symbole" />
      <span className="ppl-title__text">
        {words.length > 0 ? `${words.join(" ")} ` : null}
        <span className="ppl-title__last">
          {last}
          <Chevron />
        </span>
      </span>
    </span>
  );
}

function VerdictTag({ verdict, label }: { verdict: VerdictSlug | null; label: string }) {
  if (!verdict) return <span className="ppl-verdict-tag" aria-hidden="true" />;
  return (
    <span
      className={`ppl-verdict-tag ppl-verdict-tag--${verdict}`}
      title={label || undefined}
      aria-label={label || undefined}
    >
      <span className="ppl-verdict-dot" aria-hidden="true" />
    </span>
  );
}

/* Filtre déroulant d'enjeu — partagé par les DEUX modes du Polimètre+.
 *
 * Extrait du mode « 2022 » le jour où le mode « campagne » en a eu besoin. Le
 * dupliquer aurait laissé deux comportements clavier et deux gestions de
 * fermeture à maintenir en parallèle, pour un composant dont l'accessibilité
 * est la partie délicate.
 *
 * Les deux modes filtrent sur la MÊME chose : le libellé français de l'enjeu,
 * l'un des 12. Seule leur PROVENANCE diffère — codée à la main dans la
 * mastersheet pour « 2022 », inférée du texte pour la campagne.
 *
 * Le couple {value, label} survit à cette unification : il coûte peu et laisse
 * la porte ouverte à une source dont la valeur de filtre ne serait pas ce qu'on
 * affiche. */
function EnjeuDropdown({
  value,
  onChange,
  options,
  allLabel = "Tous les enjeux",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; present: boolean }[];
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur ou à Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const courant = options.find((o) => o.value === value);

  return (
    <div className="ppl-cat-dropdown" ref={ref}>
      <button
        type="button"
        className="ppl-issue-select ppl-cat-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Catégories d'enjeux"
        onClick={() => setOpen((o) => !o)}
      >
        {value === "all" ? allLabel : (courant?.label ?? value)}
      </button>
      {open && (
        <ul className="ppl-cat-menu" role="listbox" aria-label="Catégories d'enjeux">
          <li
            role="option"
            tabIndex={0}
            aria-selected={value === "all"}
            className={`ppl-cat-option${value === "all" ? " active" : ""}`}
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange("all");
                setOpen(false);
              }
            }}
          >
            {allLabel}
          </li>
          {options.map(({ value: v, label, present }) => {
            const active = value === v;
            const cls = `ppl-cat-option${present ? "" : " ppl-cat-option--empty"}${active ? " active" : ""}`;
            const choose = () => {
              onChange(v);
              setOpen(false);
            };
            return (
              <li
                key={v}
                role="option"
                // Les options sans donnée restent hors de l'ordre de tabulation :
                // le clavier ne doit jamais s'arrêter sur un élément inerte.
                tabIndex={present ? 0 : -1}
                aria-selected={active}
                aria-disabled={!present}
                className={cls}
                onClick={present ? choose : undefined}
                onKeyDown={
                  present
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          choose();
                        }
                      }
                    : undefined
                }
              >
                <SymboleEnjeu libelle={label} className="ppl-symbole" />
                {label}
                {present ? "" : " (aucune donnée)"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ========================================================================== *
 * Kanban du module unifié : le module en tableau de gestion de projet Agile.
 * Les promesses deviennent des cartes, rangées en colonnes : par
 * verdict pour les mandats (PQ 2026, CAQ 2022), par parti pour la campagne.
 * Dans une colonne, les cartes suivent le rang d'écho médiatique.
 * ========================================================================== */
type CarteKanban = {
  id: string;
  rang: number;
  titre: string;
  categorie: string | null;
  /** Enjeu déduit du texte par un modèle (campagne), et non codé à la main
   *  (CAQ 2022) : le symbole le dit au survol. */
  enjeuInfere?: boolean;
  pied: ReactNode;
  url?: string;
};
type ColonneKanban = {
  cle: string;
  titre: string;
  detail?: string;
  cartes: CarteKanban[];
  /** Nombre réel de promesses de la colonne, quand `cartes` n'en porte qu'une
   *  partie (campagne : cinq par parti au plus). */
  total?: number;
};

// Sous chaque kanban : le guide du Polimètre, qui définit ce qu'est une
// promesse et chaque verdict. L'ancien tableau le portait dans son rail.
function LienMetho() {
  return (
    <a
      className="ppl-metho-kanban"
      href="https://polimeter.org/guide/GuidePolimetre2026.pdf"
      target="_blank"
      rel="noopener"
    >
      Méthodologie du Polimètre
    </a>
  );
}

// Colonnes de la campagne dans l'ordre des sièges obtenus le 5 octobre 2026.
const KANBAN_PARTIS: PartiKey[] = ["pq", "plq", "pcq", "qs", "caq"];

// Trop de cartes d'un coup alourdit le tableau. On en montre 3 par colonne, et
// « Voir plus » ouvre jusqu'à 5.
const KANBAN_N_COURT = 3;
const KANBAN_N_LONG = 5;

function KanbanBoard({ colonnes, label }: { colonnes: ColonneKanban[]; label: string }) {
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const basculer = (cle: string) =>
    setOuvertes((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });
  return (
    <div
      className="ppl-kanban"
      role="list"
      aria-label={label}
      // Le nombre de colonnes varie : 5 pour le PQ et la campagne, 3 pour la CAQ.
      style={{ "--kanban-n": colonnes.length } as CSSProperties}
    >
      {colonnes.map((col) => (
        <section key={col.cle} className={`ppl-kanban__col ppl-kanban__col--${col.cle}`} role="listitem">
          <header className="ppl-kanban__tete">
            <span className="ppl-kanban__titre">{col.titre}</span>
            <span className="ppl-kanban__compte">{col.total ?? col.cartes.length}</span>
            {col.detail && <span className="ppl-kanban__detail">{col.detail}</span>}
          </header>
          <ol className="ppl-kanban__cartes">
            {col.cartes.length === 0 ? (
              <li className="ppl-kanban__vide">Aucune promesse</li>
            ) : (
              col.cartes.slice(0, ouvertes.has(col.cle) ? KANBAN_N_LONG : KANBAN_N_COURT).map((c) => (
                <li key={c.id} className="ppl-kanban__carte">
                  <span className="ppl-kanban__rang">#{c.rang}</span>
                  <span className="ppl-kanban__texte" title={c.titre}>
                    {c.categorie &&
                      (c.enjeuInfere ? (
                        <span
                          className="ppl-kanban__enjeu"
                          title={`Enjeu probable\u00a0: ${c.categorie}`}
                          aria-label={`Enjeu probable\u00a0: ${c.categorie}`}
                          role="img"
                        >
                          <SymboleEnjeu libelle={c.categorie} className="ppl-symbole" />
                        </span>
                      ) : (
                        <SymboleEnjeu libelle={c.categorie} className="ppl-symbole" />
                      ))}
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noopener">{c.titre}</a>
                    ) : (
                      c.titre
                    )}
                  </span>
                  <span className="ppl-kanban__pied">{c.pied}</span>
                </li>
              ))
            )}
          </ol>
          {col.cartes.length > KANBAN_N_COURT && (
            <button
              type="button"
              className="ppl-kanban__plus"
              aria-expanded={ouvertes.has(col.cle)}
              onClick={() => basculer(col.cle)}
            >
              {ouvertes.has(col.cle) ? "Voir moins" : "Voir plus"}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

// Les colonnes portent les verdicts du Polimètre tels quels, de rompue à
// réalisée.
const KANBAN_VERDICTS: { slug: VerdictSlug; titre: string }[] = [
  { slug: "rompue", titre: "Rompue" },
  { slug: "en-suspens", titre: "En suspens" },
  { slug: "en-cours", titre: "En cours" },
  { slug: "partielle", titre: "Partiellement réalisée" },
  { slug: "realisee", titre: "Réalisée" },
];
// Mandat de la CAQ terminé : une promesse n'y est plus « en suspens » ni « en
// cours ». Ces deux colonnes restent pour le PQ, dont le mandat commence.
const KANBAN_VERDICTS_MANDAT_TERMINE = KANBAN_VERDICTS.filter(
  (v) => v.slug !== "en-suspens" && v.slug !== "en-cours",
);

/* Vue « promesses de 2022 » — le module historique.

   `sousModule` : la vue est le volet « 2022 » d'un module qui a aussi des
   promesses de campagne. Sans `bascule`, elle se rend SOUS le bloc « campagne »
   et lui cède le titre h2 : ne restent que son sous-titre et son infobulle,
   promus en h3. Avec `bascule` (module unifié, cf. PolimetrePlusClient), elle
   porte le titre commun et les onglets du filtre. Sans second bloc, la vue est
   le module entier et porte son h2 comme avant. */
function PolimetreView({
  data,
  editionKey,
  sousModule = false,
  bascule,
}: {
  data: PolimetreData;
  editionKey?: string;
  sousModule?: boolean;
  /** Onglets du module unifié (campagne / CAQ 2022 / PQ 2026), posés sur le panneau. */
  bascule?: ReactNode;
}) {
  const [range, setRange] = useState<RangeKey>("week");
  const [verdict, setVerdict] = useState<VerdictSlug | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const promises = data.ranges[range];

  // Category list: the 12 canonical categories are always shown, ordered
  // alphabetically (French collation). Each is flagged present/absent for the
  // current range — categories with no data are greyed out and non-clickable.
  // Any extra category in the data but outside the taxonomy is included too.
  const categoryItems = useMemo(() => {
    const present = new Set(promises.map((p) => p.category).filter((c): c is string => !!c));
    const extras = [...present].filter((c) => !CATEGORY_ORDER.includes(c));
    return [...CATEGORY_ORDER, ...extras]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((c) => ({ name: c, present: present.has(c) }));
  }, [promises]);

  // Filtres de verdict offerts sur la période : les verdicts transitoires ne
  // sont listés que s'ils ont au moins une promesse (cf. VERDICT_FILTERS).
  // Calculé sur la liste COMPLÈTE de la période, pas sur les cinq affichés : un
  // verdict absent du top 5 mais présent plus bas reste un filtre valide.
  const verdictFilters = useMemo(() => {
    const present = new Set(promises.map((p) => p.verdict));
    return VERDICT_FILTERS.filter(
      (f) => f.value === "all" || !f.masquableSiVide || present.has(f.value),
    );
  }, [promises]);

  // Un verdict choisi sur une période puis absent de la suivante n'a plus de
  // bouton : le choix retombe sur « Tous ». Dérivé plutôt que réinitialisé au
  // changement d'onglet, pour que l'affichage ne puisse jamais montrer un filtre
  // actif qui n'est pas dans le rail.
  const verdictActif = verdictFilters.some((f) => f.value === verdict) ? verdict : "all";

  const filtered = promises
    .filter((p) => verdictActif === "all" || p.verdict === verdictActif)
    .filter((p) => category === "all" || p.category === category)
    .slice(0, TOP_N);

  const sousTitre = (
    <>
      Promesses électorales de la CAQ (élections de 2022), classées selon leur écho médiatique
      <InfoTip size="sm" label="À propos du Polimètre+">
        Le Polimètre (Université Laval) suit la réalisation des promesses électorales en continu. Le
        Polimètre+ croise les promesses de la Coalition avenir Québec, faites
        lors de la campagne de 2022, avec leur couverture en une dans les médias
        québécois pour faire ressortir celles qui retiennent l&apos;attention.
      </InfoTip>
    </>
  );

  return (
    <section
      className={bascule ? "polimeter-plus polimeter-plus--unifie" : sousModule ? "polimeter-plus polimeter-plus--second" : "polimeter-plus"}
      aria-label={sousModule ? "Polimètre+ : promesses de 2022" : "Polimètre+"}
    >
      <div className="partis-title-row">
        <div className="title-block">
          {sousModule && !bascule ? (
            <h3 className="period-subtitle ppl-sous-titre">{sousTitre}</h3>
          ) : (
            <>
              <h2 className="partis-title">Polimètre+&nbsp;: promesses électorales à la Une</h2>
              <div className="period-subtitle">{sousTitre}</div>
            </>
          )}
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline">
              {RANGES.map((r) => (
                <span
                  key={r}
                  className={r === range ? "active" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-pressed={r === range}
                  onClick={() => setRange(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setRange(r);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {RANGE_TAB_LABELS[r]}
                </span>
              ))}
            </div>
            <ShareButton title="Polimètre+ : promesses sous la loupe médiatique" anchor="polimetre-plus" editionKey={editionKey} />
          </div>
        </div>
      </div>

      {bascule}
      {bascule ? (
        <>
          <KanbanBoard
            label="Promesses de la CAQ de 2022, rangées par verdict"
            colonnes={KANBAN_VERDICTS_MANDAT_TERMINE.map((v) => ({
              cle: v.slug,
              titre: v.titre,
              cartes: promises
                .map((p, idx) => ({ p, rang: idx + 1 }))
                .filter(({ p }) => p.verdict === v.slug)
                .map(({ p, rang }) => ({
                  id: p.pledgeNumber,
                  rang,
                  titre: p.title,
                  categorie: p.category,
                  url: p.url,
                  pied: <TrendBadge trend={p.trend} />,
                })),
            }))}
          />
          <LienMetho />
        </>
      ) : (
      <div className="ppl-grid">
        {/* Rail gauche : légende des verdicts + catégories d'enjeux */}
        <aside className="ppl-filters">
          <nav className="ppl-verdicts" aria-label="Filtrer par verdict">
            {verdictFilters.map((f) => {
              const cls = f.value === "all" ? "ppl-verdict" : `ppl-verdict ppl-verdict--${f.value}`;
              return (
                <button
                  key={f.value}
                  type="button"
                  className={verdictActif === f.value ? `${cls} active` : cls}
                  data-verdict={f.value}
                  aria-pressed={verdictActif === f.value}
                  onClick={() => setVerdict(f.value)}
                >
                  {f.short ? (
                    <>
                      <span className="ppl-verdict__full">{f.label}</span>
                      <span className="ppl-verdict__short">{f.short}</span>
                    </>
                  ) : (
                    f.label
                  )}
                </button>
              );
            })}
          </nav>

          <div className="ppl-rail-head">Catégorie d&apos;enjeu</div>
          <EnjeuDropdown
            value={category}
            onChange={setCategory}
            options={categoryItems.map(({ name, present }) => ({
              value: name,
              label: name,
              present,
            }))}
          />
          <a
            className="ppl-metho-rail"
            href="https://polimeter.org/guide/GuidePolimetre2026.pdf"
            target="_blank"
            rel="noopener"
          >
            Méthodologie du Polimètre
          </a>
        </aside>

        {/* Rail droit : liste des promesses */}
        <div className="ppl-list">
          <div className="ppl-promise header" aria-hidden="true">
            <div style={{ textAlign: "center" }}>Rang</div>
            <div style={{ textAlign: "center" }}>Promesse</div>
            <div style={{ textAlign: "center" }}>Tendance</div>
          </div>

          {filtered.length === 0 ? (
            <p style={{ padding: "18px 0", opacity: 0.6, fontStyle: "italic" }}>
              Aucune promesse couverte pour ce filtre sur cette période.
            </p>
          ) : (
            <ol className="ppl-promises">
              {filtered.map((p, i) => {
                const open = openId === p.pledgeNumber;
                const verdictCls = p.verdict ? ` ppl-promise--${p.verdict}` : "";
                const cls = `ppl-promise${verdictCls}${open ? " ppl-promise--open" : ""}`;
                return (
                  <li
                    key={p.pledgeNumber}
                    className={cls}
                    /* Le nom accessible doit d'abord dire SUR QUOI porte le bouton.
                       L'aria-label écrase le contenu : avec le seul verdict, un
                       lecteur d'écran annonçait « Réalisée, bouton » sans jamais
                       nommer la promesse. Le verdict reste en second — il n'est
                       porté que par la couleur, donc invisible sans la vue. */
                    aria-label={p.verdictLabel ? `${p.title}, ${p.verdictLabel}` : p.title}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : p.pledgeNumber)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(open ? null : p.pledgeNumber);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {open ? (
                      <>
                        <div className="ppl-promise__head">
                          <span className="ppl-rank">{i + 1}</span>
                          {/* Issue #425 : le même symbole d'enjeu qu'ailleurs sur
                              le site, à côté de la promesse. Le Polimètre+ ne
                              connaît ses enjeux que par leur libellé complet,
                              d'où la résolution par libellé. */}
                          <PromiseTitle title={p.title} categorie={p.category} />
                          <TrendBadge trend={p.trend} />
                        </div>
                        <div className="ppl-promise__detail" onClick={(e) => e.stopPropagation()}>
                          <p className="ppl-detail__eyebrow">Résumé</p>
                          <p className="ppl-detail__text">{p.summary ?? SUMMARY_PLACEHOLDER}</p>
                          {p.articles.length > 0 && (
                            <p className="ppl-detail__coverage">
                              <span className="ppl-detail__coverage-label">À lire sur</span>{" "}
                              <span className="ppl-detail__coverage-media">
                                {p.articles.map((article, idx) => (
                                  <span key={`${article.media}-${article.url}`}>
                                    <a href={article.url} target="_blank" rel="noopener">
                                      {article.media}
                                    </a>
                                    {idx < p.articles.length - 1 && <span className="sep">,</span>}
                                  </span>
                                ))}
                              </span>
                              <InfoTip size="sm" label="Choix des articles">
                                Pour chaque média ayant couvert cette promesse{" "}
                                {range === "month" ? "ce mois-ci" : "cette semaine"}, le lien mène
                                vers son article le plus récent.
                              </InfoTip>
                            </p>
                          )}
                          <a
                            className="ppl-detail__link"
                            href={p.url}
                            target="_blank"
                            rel="noopener"
                          >
                            + d&apos;info sur l&apos;état de réalisation de cette promesse →
                          </a>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="ppl-rank">{i + 1}</span>
                        <PromiseTitle title={p.title} categorie={p.category} />
                        <TrendBadge trend={p.trend} />
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="ppl-discover-wrap">
            <a
              className="ppl-discover"
              href="https://polimeter.org/fr/legault-frechette"
              target="_blank"
              rel="noopener"
            >
              <PolimetreMark />
              Découvrir toutes les promesses sur le site Web du Polimètre
            </a>
          </div>
        </div>
      </div>
      )}
      <div className="module-last-updated">{data.lastUpdated}</div>
    </section>
  );
}

/* ========================================================================== *
 * Vue « promesses de la campagne »
 *
 * Même grille, même liste dépliable, même écho médiatique — mais la liste n'est
 * plus fermée : elle se remplit des promesses repérées dans les communiqués des
 * partis au fur et à mesure qu'ils les formulent. D'où les deux écarts visibles :
 *
 *  - la pastille porte le PARTI, pas le verdict. Une promesse formulée hier n'a
 *    pas d'état de réalisation ; le Polimètre ne se prononcera que des mois plus
 *    tard. Ce qu'on sait d'elle le jour même, c'est qui l'a formulée.
 *  - les onglets sont « Aujourd'hui », « Depuis une semaine » et « Campagne »,
 *    sans « mois » : une fenêtre d'un mois noierait la nouveauté sous
 *    l'accumulé. « Campagne » n'est pas un mois qui glisse mais le cumul depuis
 *    le jour du bref, la même période que les autres modules appellent ainsi.
 * ========================================================================== */

const NEUVE_RANGES: NeuveRangeKey[] = NEUVE_RANGE_ORDER;

/** L'état vide d'un onglet, et ce qu'il a le droit d'affirmer.
 *
 *  Le raffineur ne publie PAS une fenêtre sans reprise : dans la donnée, « aucune
 *  promesse reprise cette semaine » et « la semaine n'a pas été calculée » se
 *  ressemblent (`week` et `campaign` ne sont calculées que sur demande, hors
 *  Lambda). Mais les fenêtres sont emboîtées, day ⊂ week ⊂ campaign : si un
 *  onglet plus court montre des promesses, l'onglet plus long ne peut pas être
 *  vide faute de reprise. Il est vide parce qu'il n'a pas été publié, et c'est ce
 *  qu'on dit. Écrire « aucune promesse n'a été reprise depuis le début de la
 *  campagne » sous un onglet « Aujourd'hui » qui en liste quatre serait faux.
 *
 *  Sans onglet plus court à contredire, l'état vide dit ce qui est vrai — aucune
 *  REPRISE — et non « aucune promesse » : des promesses ont pu être formulées
 *  sans qu'un seul média en parle, c'est précisément ce que le module donne à
 *  voir.
 *
 *  Exportée pour le test : le rendu statique n'ouvre que « Aujourd'hui ». */
export function messageEtatVide(range: NeuveRangeKey, ranges: PromessesNeuvesData["ranges"]): string {
  const plusCourtes = NEUVE_RANGE_ORDER.slice(0, NEUVE_RANGE_ORDER.indexOf(range));
  if (plusCourtes.some((r) => ranges[r].length > 0)) {
    return "Le classement de cette période n'a pas encore été publié.";
  }
  switch (range) {
    case "day":
      return "Aucune promesse de campagne n'a été reprise dans les Unes aujourd'hui.";
    case "week":
      return "Aucune promesse de campagne n'a été reprise dans les Unes cette semaine.";
    case "campaign":
      return "Aucune promesse de campagne n'a été reprise dans les Unes depuis le début de la campagne.";
  }
}

function NeuvesView({
  data,
  editionKey,
  bascule,
}: {
  data: PromessesNeuvesData;
  editionKey?: string;
  /** Onglets du module unifié (campagne / CAQ 2022 / PQ 2026), posés sur le panneau. */
  bascule?: ReactNode;
}) {
  const [range, setRange] = useState<NeuveRangeKey>("day");
  const promesses = data.ranges[range];

  return (
    <section className={bascule ? "polimeter-plus polimeter-plus--neuves polimeter-plus--unifie" : "polimeter-plus polimeter-plus--neuves"} aria-label="Polimètre+ : promesses de la campagne">
      {/* Bandeau de développement. Le module ne peut pas être travaillé sur la
          donnée réelle — la table est désactivée et le raffineur n'est pas
          fiable — donc on développe sur fixtures. Ce bandeau existe pour qu'une
          capture prise en cours de route ne puisse jamais passer pour le site.
          Même intention que pour le module des partis. */}
      {data.fictif && (
        <p className="ppl-bandeau-fictif" role="status">
          Données de développement. Ces promesses et leur écho médiatique ne
          reflètent pas le site.
        </p>
      )}
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">{bascule ? <>Polimètre+&nbsp;: promesses électorales à la Une</> : <>Polimètre+&nbsp;: les promesses de la campagne</>}</h2>
          <div className="period-subtitle">
            Promesses repérées dans les communiqués des partis, classées selon leur écho médiatique
            <InfoTip size="sm" label="À propos des promesses de la campagne">
              Chaque communiqué de presse publié par un des cinq grands partis au Québec est lu
              automatiquement pour y repérer les promesses qu&apos;il formule, au sens du
              Polimètre&nbsp;: un engagement à une action ou à un but précis, formulé de façon
              qu&apos;on puisse vérifier plus tard s&apos;il a été tenu. Chaque carte
              affiche un libellé court, rédigé automatiquement à partir de la promesse; le
              lien mène au communiqué du parti. L&apos;enjeu indiqué par le symbole est
              lui aussi déduit automatiquement du texte. Les promesses sont rangées par
              parti et classées selon leur reprise dans les Unes des médias québécois.
            </InfoTip>
          </div>
        </div>
        <div className="control-block">
          <div className="control-row">
            <div className="legend-toggle inline">
              {NEUVE_RANGES.map((r) => (
                <span
                  key={r}
                  className={r === range ? "active" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-pressed={r === range}
                  onClick={() => setRange(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setRange(r);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {NEUVE_RANGE_TAB_LABELS[r]}
                </span>
              ))}
            </div>
            <ShareButton title="Polimètre+ : les promesses de la campagne" anchor="polimetre-plus" editionKey={editionKey} />
          </div>
        </div>
      </div>

      {bascule}
      {promesses.length === 0 ? (
        <p className="ppl-kanban-vide">{messageEtatVide(range, data.ranges)}</p>
      ) : (
        <KanbanBoard
          label="Promesses de la campagne, rangées par parti"
          colonnes={KANBAN_PARTIS.map((parti) => ({
            cle: `parti-${parti}`,
            titre: PARTI_LABELS[parti],
            detail: PARTI_FULL_LABELS[parti],
            total: data.totaux[range][parti] ?? 0,
            cartes: promesses
              .filter((p) => p.parti === parti)
              .map((p) => ({
                id: p.promesseId,
                rang: p.rang,
                titre: p.title,
                categorie: p.enjeu,
                enjeuInfere: true,
                url: p.sourceUrl,
                pied: (
                  <span className="ppl-kanban__reprises">
                    {p.nMentions} reprise{p.nMentions > 1 ? "s" : ""}
                  </span>
                ),
              })),
          }))}
        />
      )}
      <LienMetho />
      <div className="module-last-updated">{data.lastUpdated}</div>
    </section>
  );
}

/* ========================================================================== *
 * Coquille — un seul module, un filtre pour passer d'une vue à l'autre.
 *
 * Les deux vues ne sont plus empilées : rendues l'une sous l'autre, elles se
 * lisaient comme deux modules distincts. Un seul panneau, donc, et des onglets
 * de classeur posés dessus qui servent de filtre : « PQ 2026 », choisi par
 * défaut, « CAQ 2022 » ou « Campagne 2026 ». Chaque vue garde ses propres
 * onglets de période ; seul le titre h2 est commun.
 *
 * `neuves` est optionnel et vaut null tant que le raffineur n'a rien publié (le
 * cas hors campagne, où les communiqués sont des annonces de candidature sans
 * promesse). Le bloc « campagne » n'apparaît alors PAS : un bloc qui n'offre
 * qu'une liste vide se lit comme une panne. Le module redevient exactement
 * celui d'avant, h2 compris, tant qu'il n'y a pas de promesse neuve à montrer.
 * ========================================================================== */
/* Onglet « PQ 2026 » : le kanban du nouveau mandat.
   Les promesses du PQ repérées pendant la campagne partent toutes « en
   suspens » : aucune n'a encore de verdict. Elles changeront de colonne au fil
   du mandat, quand le Polimètre les évaluera. */
function PqView({
  data,
  editionKey,
  bascule,
}: {
  data: PromessesNeuvesData;
  editionKey?: string;
  bascule: ReactNode;
}) {
  const promessesPq = data.ranges.campaign.filter((p) => p.parti === "pq");
  return (
    <section
      className="polimeter-plus polimeter-plus--neuves polimeter-plus--unifie"
      aria-label="Polimètre+ : promesses du PQ, mandat 2026"
    >
      {/* Même bandeau que la vue campagne : sur fixtures, rien ne doit passer
          pour de vraies données. */}
      {data.fictif && (
        <p className="ppl-bandeau-fictif" role="status">
          Données de développement. Ces promesses et leur écho médiatique ne
          reflètent pas le site.
        </p>
      )}
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Polimètre+&nbsp;: promesses électorales à la Une</h2>
          <div className="period-subtitle">
            Promesses du Parti québécois pendant la campagne 2026, rangées selon leur avancement et classées selon leur écho médiatique
            <InfoTip size="sm" label="À propos des promesses du PQ">
              Ce sont les promesses repérées dans les communiqués du Parti québécois pendant
              la campagne de 2026. Le repérage n&apos;est pas terminé&nbsp;: d&apos;autres
              promesses, tirées des mêmes documents, peuvent encore s&apos;ajouter. Toutes sont en suspens tant que le Polimètre ne les a pas
              évaluées. Chaque carte affiche un libellé court, rédigé automatiquement à
              partir de la promesse, et l&apos;enjeu indiqué par le symbole est lui aussi
              déduit automatiquement du texte. Le classement suit la reprise de la promesse
              dans les Unes des médias québécois depuis le début de la campagne.
            </InfoTip>
          </div>
        </div>
        <div className="control-block">
          <div className="control-row">
            <ShareButton title="Polimètre+ : promesses du PQ" anchor="polimetre-plus" editionKey={editionKey} />
          </div>
        </div>
      </div>
      {bascule}
      <KanbanBoard
        label="Promesses du PQ de 2026, rangées par verdict"
        colonnes={KANBAN_VERDICTS.map((v) => ({
          cle: v.slug,
          titre: v.titre,
          ...(v.slug === "en-suspens" ? { total: data.totaux.campaign.pq ?? 0 } : {}),
          cartes:
            v.slug !== "en-suspens"
              ? []
              : promessesPq.map((p, idx) => ({
                  id: p.promesseId,
                  rang: idx + 1,
                  titre: p.title,
                  categorie: p.enjeu,
                  enjeuInfere: true,
                  url: p.sourceUrl,
                  pied: (
                    <span className="ppl-kanban__reprises">
                      {p.nMentions} reprise{p.nMentions > 1 ? "s" : ""}
                    </span>
                  ),
                })),
        }))}
      />
      <LienMetho />
      <div className="module-last-updated">{data.lastUpdated}</div>
    </section>
  );
}

export function PolimetrePlusClient({
  data,
  neuves,
  editionKey,
  ongletInitial = "pq",
}: {
  data: PolimetreData;
  neuves?: PromessesNeuvesData | null;
  editionKey?: string;
  /** Onglet ouvert au premier rendu : le mandat du PQ, en premier. */
  ongletInitial?: "pq" | "campagne" | "2022";
}) {
  const hasNeuves = !!neuves && NEUVE_RANGE_ORDER.some((r) => neuves.ranges[r].length > 0);

  const [mode, setMode] = useState<"campagne" | "2022" | "pq">(ongletInitial);

  if (!hasNeuves) return <PolimetreView data={data} editionKey={editionKey} />;

  const onglet = (cle: "pq" | "2022" | "campagne", libelle: string) => (
    <button
      key={cle}
      type="button"
      role="tab"
      aria-selected={mode === cle}
      className={`ppl-onglet ppl-onglet--${cle}${mode === cle ? " active" : ""}`}
      onClick={() => setMode(cle)}
    >
      {libelle}
    </button>
  );
  // Deux familles, séparées par une barre oblique : les bilans de mandat
  // (PQ 2026, CAQ 2022), puis la campagne, d'une autre nature.
  const bascule = (
    <div className="ppl-onglets" role="tablist" aria-label="Promesses affichées">
      {onglet("pq", "PQ 2026")}
      {onglet("2022", "CAQ 2022")}
      <span className="ppl-onglets__barre" aria-hidden="true" />
      {onglet("campagne", "Campagne 2026")}
    </div>
  );

  if (mode === "pq") return <PqView data={neuves!} editionKey={editionKey} bascule={bascule} />;
  return mode === "campagne" ? (
    <NeuvesView data={neuves!} editionKey={editionKey} bascule={bascule} />
  ) : (
    <PolimetreView data={data} editionKey={editionKey} sousModule bascule={bascule} />
  );
}
