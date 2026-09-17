"use client";

/* BANC D'ESSAI LOCAL — une couleur par module (Yannick, 2 sept. 2026 ; repris et
 * tranché par Adrien le 16 sept.).
 *
 * CE QUI A CHANGÉ LE 16-09. Le banc donnait UNE couleur par famille de données,
 * donc deux modules partageaient la même : impossible de reconnaître un module à
 * sa couleur, et les fonds se ressemblaient tous à l'écran. Chaque module a
 * maintenant SA couleur, et le fond de sa section en est teinté — « que ce soit
 * bien apparent, découpé ». Les quatre humeurs sont remplacées par trois DEGRÉS
 * D'INTENSITÉ de la même palette : discret, marqué, franc.
 *
 * D'OÙ VIENNENT CES COULEURS (règle d'Adrien : réfléchies, pas aléatoires) :
 *   · Une des Unes      laiton — la couleur des paliers de saillance du module.
 *   · Deux solitudes    le ROUGE DU CANADA : seul module qui mobilise le Canada,
 *                       donc la couleur se retient toute seule. Le bleu reste au
 *                       Québec À L'INTÉRIEUR du module.
 *   · 12 enjeux         mauve sépia (Adrien, 16-09).
 *   · Partis            SALLE SOMBRE + BLEU (Adrien, 16-09) : « le look d'être
 *                       dans un club, devant une console ». Seul module où
 *                       l'encre et les filets basculent aussi ; le bleu s'y
 *                       éclaire, sinon il disparaît dans la nuit.
 *   · Polimètre+        le vert du Polimètre, relevé sur polimetre.org — couleur
 *                       du mot-symbole dans l'en-tête, rgb(81,115,104).
 *   · Assemblée         l'ORANGE DE LA LNH — l'inspiration d'Étienne pour ce
 *                       module : un alignement d'équipe. L'orange vif de
 *                       l'écusson teinte le fond, sa variante encre écrit.
 * Aucune ne reprend une des douze couleurs d'enjeu (`lib/enjeux.ts`) : la
 * couleur d'un enjeu doit rester celle de cet enjeu.
 *
 * ⚠️ Règle d'Adrien du 3 sept., toujours valable : LA UNE DES UNES GARDE LE
 * PAPIER. Le premier changement se voit en arrivant sur Deux solitudes.
 *
 * Les jetons sont posés SUR CHAQUE SECTION, jamais globalement : le reste de la
 * page n'en sait rien, et « off » rend tout au papier.
 *
 *   ?lab=off | discret | marque | franc
 */
import { useEffect, useState } from "react";

type Intensite = "off" | "discret" | "marque" | "franc";

const PAPIER = "#F3ECDD";
const NUIT = "#14120F";

const MODULES: {
  id: string; nom: string; accent: string;
  /** La couleur qui teinte le fond, quand elle diffère de l'accent (un orange
   *  vif teinte mieux qu'un orange encre, qui lui reste lisible en texte). */
  teinte?: string;
  /** L'accent, éclairci, quand le module est en salle sombre. */
  accentNuit?: string;
  papierPur?: boolean; sombre?: boolean;
}[] = [
  { id: "une-des-unes", nom: "Une des Unes", accent: "#86642C", papierPur: true },
  { id: "deux-solitudes", nom: "Deux solitudes", accent: "#A8302C" },
  { id: "enjeux-saillants", nom: "12 enjeux", accent: "#6E4F73" },
  // Le bleu passe aux Partis (Adrien, 16-09) : dans la salle sombre, il s'éclaire
  // pour rester lisible sur la nuit — c'est la même couleur, sous un projecteur.
  { id: "partis-et-couverture", nom: "Partis", accent: "#2F6480", accentNuit: "#7FB2D4", sombre: true },
  { id: "polimetre-plus", nom: "Polimètre+", accent: "#517368" },
  // L'ORANGE DE LA LNH (Adrien, 16-09) : l'inspiration d'Étienne pour ce module,
  // l'alignement d'une équipe. L'orange vif de l'écusson teinte le fond ; le
  // texte prend sa variante encre, seule lisible sur du papier.
  { id: "assemblee-nationale", nom: "Assemblée", accent: "#B5521E", teinte: "#E0661F" },
];

/** Trois degrés : combien de la couleur du module passe dans son fond. */
const INTENSITES: Record<Exclude<Intensite, "off">, { nom: string; force: number; nuit: number }> = {
  discret: { nom: "Discret", force: 0.10, nuit: 0.72 },
  marque: { nom: "Marqué", force: 0.22, nuit: 0.86 },
  franc: { nom: "Franc", force: 0.34, nuit: 1 },
};

/** Mélange deux couleurs : `f` = 0 donne `a`, 1 donne `b`. */
function melange(a: string, b: string, f: number): string {
  const lire = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [r1, g1, b1] = lire(a);
  const [r2, g2, b2] = lire(b);
  return "#" + [r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f]
    .map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

/** La salle sombre : les seuls jetons qui basculent, et seulement là. */
const jetonsNuit = (fond: string, accent: string): Record<string, string> => ({
  "--paper": fond,
  "--paper-deep": melange(fond, PAPIER, 0.06),
  "--ink": "#F1E9D8",
  "--ink-soft": "#C9BEA8",
  "--ink-softer": "#8F8776",
  "--rule": melange(fond, PAPIER, 0.22),
  "--rule-faint": melange(fond, PAPIER, 0.12),
  "--brass": accent,
  "--amber-encre": accent,
  "--cordovan": "#C9585F",
});

const TOUS_JETONS = ["--paper", "--paper-deep", "--ink", "--ink-soft", "--ink-softer",
  "--rule", "--rule-faint", "--brass", "--amber-encre", "--cordovan", "--lab-accent"];

export default function PaletteScrollLab() {
  if (process.env.NEXT_PUBLIC_SITE_ENV === "prod") return null;
  return <PaletteScrollLabInner />;
}

function PaletteScrollLabInner() {
  const [intensite, setIntensite] = useState<Intensite>("off");
  const [replie, setReplie] = useState(false);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const i = (p.get("lab") ?? window.localStorage.getItem("lab-intensite") ?? "marque") as Intensite;
      setIntensite(["off", "discret", "marque", "franc"].includes(i) ? i : "marque");
    } catch { /* rien */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("lab-intensite", intensite); } catch { /* rien */ }

    const sections = MODULES
      .map((m) => ({ m, el: document.getElementById(m.id) }))
      .filter((x): x is typeof x & { el: HTMLElement } => !!x.el);

    const rendre = () => sections.forEach(({ el }) => {
      TOUS_JETONS.forEach((k) => el.style.removeProperty(k));
      el.style.removeProperty("background");
    });

    if (intensite === "off") { rendre(); return rendre; }

    const I = INTENSITES[intensite];
    for (const { m, el } of sections) {
      const fond = m.sombre
        ? melange(PAPIER, NUIT, I.nuit)
        : m.papierPur ? PAPIER : melange(PAPIER, m.teinte ?? m.accent, I.force);
      const accent = m.sombre ? (m.accentNuit ?? m.accent) : m.accent;
      el.style.background = fond;
      el.style.setProperty("--lab-accent", accent);
      if (m.sombre) for (const [k, v] of Object.entries(jetonsNuit(fond, accent))) el.style.setProperty(k, v);
    }
    return rendre;
  }, [intensite]);

  const bouton = (i: Intensite, libelle: string) => (
    <button
      key={i}
      type="button"
      onClick={() => setIntensite(i)}
      style={{
        font: "inherit", fontSize: 12, padding: "4px 9px", borderRadius: 999, cursor: "pointer",
        border: "1px solid #C8BDA6", background: intensite === i ? "#6B1E2A" : "transparent",
        color: intensite === i ? "#F3ECDD" : "#1C1917",
      }}
    >
      {libelle}
    </button>
  );

  return (
    <>
      <style>{`
        [data-section] { transition: background-color 500ms ease; }
        [data-section] h2, [data-section] .section-label { color: var(--lab-accent, inherit); transition: color 500ms ease; }
      `}</style>
      {replie ? (
        <button
          type="button"
          onClick={() => setReplie(false)}
          aria-label="Ouvrir le banc d'essai des palettes"
          style={{
            position: "fixed", right: 14, bottom: 14, zIndex: 9999, font: "inherit", fontSize: 12, padding: "6px 10px",
            borderRadius: 999, border: "1px solid #C8BDA6", background: "rgba(243,236,221,.94)", color: "#1C1917", cursor: "pointer",
            boxShadow: "0 4px 18px rgba(0,0,0,.12)",
          }}
        >
          Palettes ▸
        </button>
      ) : (
        <div
          aria-label="Banc d'essai des palettes par module"
          style={{
            position: "fixed", right: 14, bottom: 14, zIndex: 9999, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
            maxWidth: "min(560px, calc(100vw - 28px))", padding: "8px 10px", borderRadius: 12, background: "rgba(243,236,221,.94)",
            border: "1px solid #C8BDA6", boxShadow: "0 4px 18px rgba(0,0,0,.12)", backdropFilter: "blur(6px)", fontSize: 12, color: "#1C1917",
          }}
        >
          <button
            type="button"
            onClick={() => setReplie(true)}
            aria-label="Replier le banc d'essai"
            style={{ font: "inherit", fontSize: 12, border: 0, background: "transparent", cursor: "pointer", padding: "2px 4px", color: "#6E685F" }}
          >
            ×
          </button>
          <span style={{ fontWeight: 600 }}>Couleurs des modules</span>
          {bouton("off", "off")}
          {(Object.keys(INTENSITES) as Exclude<Intensite, "off">[]).map((i) => bouton(i, INTENSITES[i].nom))}
        </div>
      )}
    </>
  );
}
