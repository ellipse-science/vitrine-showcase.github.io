"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_ORDER,
  RANGE_TAB_LABELS,
  type PolimetreData,
  type PromiseView,
  type RangeKey,
  type VerdictSlug,
} from "@/lib/data/polimetre-meta";
import { InfoTip } from "@/components/interactive/InfoTip";
import { ShareButton } from "@/components/interactive/ShareButton";

// Number of promises shown at once — the maquette has five spots.
const TOP_N = 5;
const RANGES: RangeKey[] = ["week", "month"];

// Résumé placeholder until AI-generated text is wired in.
const SUMMARY_PLACEHOLDER =
  "Résumé en préparation — un texte généré automatiquement à partir de la couverture médiatique sera bientôt inséré ici.";

const VERDICT_FILTERS: { value: VerdictSlug | "all"; label: string; short?: string }[] = [
  { value: "all", label: "Tous les verdicts" },
  { value: "realisee", label: "Réalisée" },
  { value: "partielle", label: "Partiellement réalisée", short: "Partiellement" },
  { value: "en-cours", label: "En cours" },
  { value: "en-suspens", label: "En suspens" },
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
  return (
    <span className="ppl-trend ppl-trend--flat" aria-label="Aucun changement">
      —
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

export function PolimetrePlusClient({ data }: { data: PolimetreData }) {
  const [range, setRange] = useState<RangeKey>("week");
  const [verdict, setVerdict] = useState<VerdictSlug | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [catOpen, setCatOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const catRef = useRef<HTMLDivElement>(null);

  // Close the category dropdown on outside click or Escape.
  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCatOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [catOpen]);

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

  const filtered = promises
    .filter((p) => verdict === "all" || p.verdict === verdict)
    .filter((p) => category === "all" || p.category === category)
    .slice(0, TOP_N);

  return (
    <section className="polimeter-plus" aria-label="Polimètre+">
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Polimètre+ : promesses électorales à la une</h2>
          <div className="period-subtitle">
            Promesses électorales de la CAQ (élections de 2022), classées selon leur écho médiatique
            <InfoTip size="sm" label="À propos du Polimètre+">
              Le Polimètre (Université Laval) suit la réalisation des promesses électorales en continu. Le
              Polimètre+ croise les promesses de la Coalition avenir Québec, faites
              lors de la campagne de 2022, avec leur couverture en une dans les médias
              québécois pour faire ressortir celles qui retiennent l&apos;attention.
            </InfoTip>
          </div>
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
            <ShareButton title="Polimètre+ : promesses sous la loupe médiatique" anchor="polimetre-plus" />
          </div>
        </div>
      </div>

      <div className="ppl-grid">
        {/* Rail gauche : légende des verdicts + catégories d'enjeux */}
        <aside className="ppl-filters">
          <nav className="ppl-verdicts" aria-label="Filtrer par verdict">
            {VERDICT_FILTERS.map((f) => {
              const cls = f.value === "all" ? "ppl-verdict" : `ppl-verdict ppl-verdict--${f.value}`;
              return (
                <button
                  key={f.value}
                  type="button"
                  className={verdict === f.value ? `${cls} active` : cls}
                  data-verdict={f.value}
                  aria-pressed={verdict === f.value}
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
          <div className="ppl-cat-dropdown" ref={catRef}>
            <button
              type="button"
              className="ppl-issue-select ppl-cat-trigger"
              aria-haspopup="listbox"
              aria-expanded={catOpen}
              aria-label="Catégories d'enjeux"
              onClick={() => setCatOpen((o) => !o)}
            >
              {category === "all" ? "Toutes les catégories" : category}
            </button>
            {catOpen && (
              <ul className="ppl-cat-menu" role="listbox" aria-label="Catégories d'enjeux">
                <li
                  role="option"
                  tabIndex={0}
                  aria-selected={category === "all"}
                  className={`ppl-cat-option${category === "all" ? " active" : ""}`}
                  onClick={() => {
                    setCategory("all");
                    setCatOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCategory("all");
                      setCatOpen(false);
                    }
                  }}
                >
                  Toutes les catégories
                </li>
                {categoryItems.map(({ name, present }) => {
                  const active = category === name;
                  const cls = `ppl-cat-option${present ? "" : " ppl-cat-option--empty"}${active ? " active" : ""}`;
                  const choose = () => {
                    setCategory(name);
                    setCatOpen(false);
                  };
                  return (
                    <li
                      key={name}
                      role="option"
                      // Disabled (no-data) options stay out of the tab order so
                      // keyboard users never land on a non-interactive item.
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
                      {name}
                      {present ? "" : " — aucune donnée"}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
                    aria-label={p.verdictLabel || undefined}
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
                          <span className="ppl-title">
                            <span className="ppl-title__text">
                              {p.title}
                              <Chevron />
                            </span>
                          </span>
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
                        <span className="ppl-title">
                          <span className="ppl-title__text">
                            {p.title}
                            <Chevron />
                          </span>
                        </span>
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
              href="https://polimeter.org/fr/legault"
              target="_blank"
              rel="noopener"
            >
              Découvrir toutes les promesses sur le site Web (Vox Pop Labs)
            </a>
          </div>
        </div>
      </div>
      <div className="module-last-updated">{data.lastUpdated}</div>
    </section>
  );
}
