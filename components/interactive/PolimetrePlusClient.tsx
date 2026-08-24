"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CATEGORY_ORDER,
  MODE_LABELS,
  NEUVE_RANGE_TAB_LABELS,
  PARTI_FULL_LABELS,
  PARTI_LABELS,
  PARTI_ORDER,
  RANGE_TAB_LABELS,
  type ModeKey,
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

// Number of promises shown at once — the maquette has five spots.
const TOP_N = 5;
const RANGES: RangeKey[] = ["week", "month"];

// Résumé placeholder until AI-generated text is wired in.
const SUMMARY_PLACEHOLDER =
  "Résumé en préparation : un texte généré automatiquement à partir de la couverture médiatique sera bientôt inséré ici.";

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
function PromiseTitle({ title }: { title: string }) {
  const words = title.split(" ");
  const last = words.pop() ?? "";
  return (
    <span className="ppl-title">
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

/* Vue « promesses de 2022 » — le module historique, inchangé. `modeSwitch` est
   l'inverseur de mode injecté par la coquille : il n'apparaît que lorsqu'il y a
   un second mode à offrir (cf. PolimetrePlusClient plus bas). */
function PolimetreView({
  data,
  modeSwitch,
  editionKey,
}: {
  data: PolimetreData;
  modeSwitch?: ReactNode;
  editionKey?: string;
}) {
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
          <h2 className="partis-title">Polimètre+&nbsp;: promesses électorales à la Une</h2>
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
          {modeSwitch}
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
                      {present ? "" : " (aucune donnée)"}
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
                          <PromiseTitle title={p.title} />
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
                        <PromiseTitle title={p.title} />
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
              <PolimetreMark />
              Découvrir toutes les promesses sur le site Web du Polimètre
            </a>
          </div>
        </div>
      </div>
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
 *  - les onglets sont « Aujourd'hui » et « Depuis une semaine », sans « mois » :
 *    une fenêtre d'un mois noierait la nouveauté sous l'accumulé.
 * ========================================================================== */

const NEUVE_RANGES: NeuveRangeKey[] = ["day", "week"];

/** Badge de parti — sigle sur fond de la couleur du parti. Le nom complet part
 *  en title/aria : « QS » seul ne se lit pas à voix haute, et la couleur ne dit
 *  rien à qui ne voit pas. */
function PartiBadge({ parti, rawLabel }: { parti: PartiKey | null; rawLabel: string }) {
  if (!parti) {
    // Parti hors des cinq suivis : on affiche le sigle brut, sans couleur — plutôt
    // que d'emprunter la teinte d'un autre parti.
    return (
      <span className="ppl-parti-badge ppl-parti-badge--inconnu" title={rawLabel || undefined}>
        {/* garde-redaction: ok (tiret = glyphe de donnée absente) */}
        {rawLabel || "—"}
      </span>
    );
  }
  const full = PARTI_FULL_LABELS[parti];
  return (
    <span className={`ppl-parti-badge ppl-parti-badge--${parti}`} title={full} aria-label={full}>
      {PARTI_LABELS[parti]}
    </span>
  );
}

/** « annoncée le 3 septembre » — repère de fraîcheur. En mode « neuves », la date
 *  d'annonce est une donnée du module, pas une métadonnée : c'est elle qui dit
 *  qu'on regarde une promesse neuve et non une promesse de 2022. */
function formatAnnonce(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", timeZone: "UTC" });
}

function NeuvesView({
  data,
  modeSwitch,
  editionKey,
}: {
  data: PromessesNeuvesData;
  modeSwitch?: ReactNode;
  editionKey?: string;
}) {
  const [range, setRange] = useState<NeuveRangeKey>("day");
  const [parti, setParti] = useState<PartiKey | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const promesses = data.ranges[range];

  // Les cinq partis sont toujours listés, mais ceux qui n'ont rien formulé sur la
  // période sont grisés et non cliquables — comme les catégories d'enjeux du mode
  // « 2022 ». Un filtre qui vide la liste sans prévenir se lit comme un bogue.
  const partiItems = useMemo(() => {
    const present = new Set(promesses.map((p) => p.parti).filter((k): k is PartiKey => !!k));
    return PARTI_ORDER.map((k) => ({ key: k, present: present.has(k) }));
  }, [promesses]);

  const filtered = promesses
    .filter((p) => parti === "all" || p.parti === parti)
    .slice(0, TOP_N);

  return (
    <section className="polimeter-plus polimeter-plus--neuves" aria-label="Polimètre+ : promesses de la campagne">
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
          <h2 className="partis-title">Polimètre+&nbsp;: les promesses de la campagne</h2>
          <div className="period-subtitle">
            Promesses repérées dans les communiqués des partis, classées selon leur écho médiatique
            <InfoTip size="sm" label="À propos de ce mode">
              Chaque communiqué de presse publié par un des cinq grands partis au Québec est lu
              automatiquement pour y repérer les promesses qu&apos;il formule, au sens du
              Polimètre&nbsp;: un engagement à une action ou à un but précis, formulé de façon
              qu&apos;on puisse vérifier plus tard s&apos;il a été tenu. Le texte affiché est
              celui du parti, repris mot pour mot; la pastille indique quel parti l&apos;a
              formulée. Le classement suit la reprise de la promesse dans les Unes des médias
              québécois.
            </InfoTip>
          </div>
        </div>
        <div className="control-block">
          {modeSwitch}
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

      <div className="ppl-grid">
        {/* Rail gauche : filtres de parti — à la place des verdicts */}
        <aside className="ppl-filters">
          <nav className="ppl-verdicts ppl-partis" aria-label="Filtrer par parti">
            <button
              type="button"
              className={`ppl-verdict${parti === "all" ? " active" : ""}`}
              aria-pressed={parti === "all"}
              onClick={() => setParti("all")}
            >
              Tous les partis
            </button>
            {partiItems.map(({ key, present }) => {
              const cls = `ppl-verdict ppl-verdict--parti-${key}`;
              return (
                <button
                  key={key}
                  type="button"
                  className={`${cls}${parti === key ? " active" : ""}${present ? "" : " ppl-verdict--empty"}`}
                  aria-pressed={parti === key}
                  aria-disabled={!present}
                  disabled={!present}
                  title={PARTI_FULL_LABELS[key]}
                  onClick={present ? () => setParti(key) : undefined}
                >
                  <span className="ppl-verdict__full">{PARTI_FULL_LABELS[key]}</span>
                  <span className="ppl-verdict__short">{PARTI_LABELS[key]}</span>
                </button>
              );
            })}
          </nav>

          {/* MÊME lien que le mode « 2022 » : c'est la définition du Polimètre
              qui décide ce qui compte comme promesse, dans les deux modes. Le
              prompt de repérage applique son critère de testabilité — pointer
              ailleurs laisserait croire à un standard maison. */}
          <a
            className="ppl-metho-rail"
            href="https://polimeter.org/guide/GuidePolimetre2026.pdf"
            target="_blank"
            rel="noopener"
          >
            Méthodologie du Polimètre
          </a>
        </aside>

        {/* Rail droit : liste des promesses neuves */}
        <div className="ppl-list">
          <div className="ppl-promise header" aria-hidden="true">
            <div style={{ textAlign: "center" }}>Rang</div>
            <div style={{ textAlign: "center" }}>Promesse</div>
            <div style={{ textAlign: "center" }}>Parti</div>
          </div>

          {filtered.length === 0 ? (
            <p style={{ padding: "18px 0", opacity: 0.6, fontStyle: "italic" }}>
              {/* L'état vide dit ce qui est vrai — aucune REPRISE — et non
                  « aucune promesse ». Des promesses ont pu être formulées sans
                  qu'un seul média en parle : c'est précisément ce que le module
                  donne à voir, et l'écrire autrement serait faux. */}
              {range === "day"
                ? "Aucune promesse de campagne n'a été reprise dans les Unes aujourd'hui."
                : "Aucune promesse de campagne n'a été reprise dans les Unes cette semaine."}
            </p>
          ) : (
            <ol className="ppl-promises">
              {filtered.map((p, i) => {
                const open = openId === p.promesseId;
                const partiCls = p.parti ? ` ppl-promise--parti-${p.parti}` : "";
                const cls = `ppl-promise${partiCls}${open ? " ppl-promise--open" : ""}`;
                const nom = p.parti ? PARTI_FULL_LABELS[p.parti] : p.partiLabel;
                return (
                  <li
                    key={p.promesseId}
                    className={cls}
                    /* Le nom accessible nomme d'abord la promesse, puis le parti :
                       le parti n'est porté que par la couleur de la pastille, donc
                       invisible sans la vue. Même raisonnement que pour le verdict
                       dans le mode « 2022 ». */
                    aria-label={nom ? `${p.title}, ${nom}` : p.title}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : p.promesseId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(open ? null : p.promesseId);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {open ? (
                      <>
                        <div className="ppl-promise__head">
                          <span className="ppl-rank">{i + 1}</span>
                          <PromiseTitle title={p.title} />
                          <PartiBadge parti={p.parti} rawLabel={p.partiLabel} />
                        </div>
                        <div className="ppl-promise__detail" onClick={(e) => e.stopPropagation()}>
                          <p className="ppl-detail__eyebrow">
                            Ce que le parti a écrit
                            <InfoTip size="sm" label="Texte d'origine">
                              Cette phrase est reprise mot pour mot du communiqué&nbsp;: elle
                              n&apos;est ni résumée ni reformulée.
                            </InfoTip>
                          </p>
                          <blockquote className="ppl-detail__verbatim">{p.verbatim}</blockquote>
                          <p className="ppl-detail__meta">
                            Annoncée le {formatAnnonce(p.announceDate)}
                            {p.nMentions > 0 ? (
                              <>
                                {" · "}
                                {p.nMentions} reprise{p.nMentions > 1 ? "s" : ""} dans les Unes
                              </>
                            ) : null}
                          </p>
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
                            </p>
                          )}
                          {p.sourceUrl && (
                            <a
                              className="ppl-detail__link"
                              href={p.sourceUrl}
                              target="_blank"
                              rel="noopener"
                            >
                              Lire le communiqué {nom ? `du ${nom}` : "d'origine"} →
                            </a>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="ppl-rank">{i + 1}</span>
                        <PromiseTitle title={p.title} />
                        <PartiBadge parti={p.parti} rawLabel={p.partiLabel} />
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
      <div className="module-last-updated">{data.lastUpdated}</div>
    </section>
  );
}

/* ========================================================================== *
 * Coquille — porte l'état de MODE et rend l'une des deux vues.
 *
 * `neuves` est optionnel et vaut null tant que le raffineur n'a rien publié (le
 * cas hors campagne, où les communiqués sont des annonces de candidature sans
 * promesse). L'inverseur n'apparaît alors PAS : offrir un mode qui mène à une
 * liste vide se lit comme une panne. Le module se comporte exactement comme
 * avant tant qu'il n'y a pas de promesse neuve à montrer.
 * ========================================================================== */
export function PolimetrePlusClient({
  data,
  neuves,
  editionKey,
}: {
  data: PolimetreData;
  neuves?: PromessesNeuvesData | null;
  editionKey?: string;
}) {
  const hasNeuves = !!neuves && (neuves.ranges.day.length > 0 || neuves.ranges.week.length > 0);
  /* Défaut = le module historique, PAS le mode neuf. Un visiteur qui revient doit
     retrouver ce qu'il connaît ; le mode « campagne » s'offre, il ne s'impose pas.
     L'ordre de l'inverseur suit ce défaut — un inverseur qui présente en premier
     un mode qui n'est pas celui affiché se lit comme un état incohérent.
     Basculer le défaut, le jour où la campagne le justifie, tient en une ligne. */
  const [mode, setMode] = useState<ModeKey>("polimetre");

  if (!hasNeuves) return <PolimetreView data={data} editionKey={editionKey} />;

  const modeSwitch = (
    <div className="legend-toggle inline ppl-mode-switch" role="group" aria-label="Source des promesses">
      {(["polimetre", "neuves"] as ModeKey[]).map((m) => (
        <span
          key={m}
          className={m === mode ? "active" : undefined}
          role="button"
          tabIndex={0}
          aria-pressed={m === mode}
          onClick={() => setMode(m)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setMode(m);
            }
          }}
          style={{ cursor: "pointer" }}
        >
          {MODE_LABELS[m]}
        </span>
      ))}
    </div>
  );

  return mode === "neuves" ? (
    <NeuvesView data={neuves!} modeSwitch={modeSwitch} editionKey={editionKey} />
  ) : (
    <PolimetreView data={data} modeSwitch={modeSwitch} editionKey={editionKey} />
  );
}
