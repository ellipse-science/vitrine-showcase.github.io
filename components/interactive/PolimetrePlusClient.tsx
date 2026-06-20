"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_ORDER,
  RANGE_TAB_LABELS,
  type PolimetreData,
  type PromiseView,
  type RangeKey,
  type VerdictSlug,
} from "@/lib/data/polimetre-meta";
import { InfoTip } from "@/components/interactive/InfoTip";

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
  const [openId, setOpenId] = useState<string | null>(null);

  const promises = data.ranges[range];

  // Category options: full French names present in the current range, ordered
  // by the canonical taxonomy (then any extras alphabetically).
  const categoryOptions = useMemo(() => {
    const present = new Set(promises.map((p) => p.category).filter((c): c is string => !!c));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extras = [...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return [...ordered, ...extras];
  }, [promises]);

  const filtered = promises
    .filter((p) => verdict === "all" || p.verdict === verdict)
    .filter((p) => category === "all" || p.category === category)
    .slice(0, TOP_N);

  return (
    <section className="polimeter-plus" aria-label="Polimètre+">
      <div className="partis-title-row">
        <div className="title-block">
          <h2 className="partis-title">Polimètre+ : promesses sous la loupe médiatique</h2>
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
          <select
            className="ppl-issue-select"
            id="ppl-issue-select"
            aria-label="Catégories d'enjeux"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Toutes les catégories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
            <div style={{ textAlign: "center" }}>Verdict</div>
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
                          <span className="ppl-title">{p.title}</span>
                          <VerdictTag verdict={p.verdict} label={p.verdictLabel} />
                          <TrendBadge trend={p.trend} />
                        </div>
                        <div className="ppl-promise__detail" onClick={(e) => e.stopPropagation()}>
                          <p className="ppl-detail__eyebrow">Résumé</p>
                          <p className="ppl-detail__text">{p.summary ?? SUMMARY_PLACEHOLDER}</p>
                          {p.article && (
                            <p className="ppl-detail__article">
                              <span className="ppl-detail__article-media">À lire sur</span>
                              <a
                                className="ppl-detail__article-link"
                                href={p.article.url}
                                target="_blank"
                                rel="noopener"
                              >
                                {p.article.media}
                              </a>
                            </p>
                          )}
                          <p className="ppl-detail__article">
                            <span className="ppl-detail__article-media">État de réalisation</span>
                            <a
                              className="ppl-detail__article-link"
                              href={p.url}
                              target="_blank"
                              rel="noopener"
                            >
                              Consulter le Polimètre
                            </a>
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="ppl-rank">{i + 1}</span>
                        <span className="ppl-title">{p.title}</span>
                        <VerdictTag verdict={p.verdict} label={p.verdictLabel} />
                        <TrendBadge trend={p.trend} />
                      </>
                    )}
                  </li>
                );
              })}
              <li className="ppl-promise ppl-promise--more">
                <span className="ppl-rank">…</span>
                <a
                  className="ppl-title ppl-more-link"
                  href="https://polimeter.org/fr/legault"
                  target="_blank"
                  rel="noopener"
                >
                  Découvrir toutes les promesses
                </a>
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
