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
 * LES COULEURS : palette « Sépia · Terres » (Jules Piral, 17-09), lues dans
 * `lib/modules.ts` — la même source que les reels, dans TOUS les modes :
 *   · Une des Unes      laiton — la couleur des paliers de saillance du module.
 *   · Deux solitudes    bordeaux (le rouge du Canada, assourdi).
 *   · 12 enjeux         mauve.
 *   · Partis            orange brûlé ; en SALLE SOMBRE dans les modes discret,
 *                       marqué et franc (Adrien, 16-09), l'accent s'y éclaircit.
 *   · Polimètre+        sauge (le vert du Polimètre, assourdi).
 *   · Assemblée         bleu Salon, comme le Salon bleu.
 * Aucune ne reprend une des douze couleurs d'enjeu (`lib/enjeux.ts`) : la
 * couleur d'un enjeu doit rester celle de cet enjeu.
 *
 * ⚠️ Règle d'Adrien du 3 sept., toujours valable : LA UNE DES UNES GARDE LE
 * PAPIER. Le premier changement se voit en arrivant sur Deux solitudes.
 *
 * TOUTE LA PAGE prend la couleur du module où l'on se trouve, et le changement
 * est franc d'un module à l'autre. « off » rend tout au papier.
 *
 *   ?lab=off | sepia | discret | marque | franc
 *
 * MODE « SÉPIA · TERRES » (retenu par Jules Piral le 17-09, mode par défaut) :
 * papiers et encres lus dans `lib/modules.ts` — LA MÊME SOURCE que les reels.
 * Le fond de la page GLISSE d'un papier à l'autre au défilement, et le calcul
 * trie les modules par leur POSITION RÉELLE sur la page (`lib/degradeModules.ts`,
 * testé) : réordonner les sections dans `app/page.tsx` ne casse pas le dégradé.
 */
import { useEffect, useState } from "react";

import { fondAuDefilement, type Repere } from "@/lib/degradeModules";
import { MODULES as IDENTITES, type CleModule } from "@/lib/modules";

type Intensite = "off" | "sepia" | "discret" | "marque" | "franc";

const PAPIER = "#F3ECDD";
const NUIT = "#14120F";

// Les accents viennent de `lib/modules.ts` (palette Sépia · Terres, 17-09) : ils
// sont les mêmes dans TOUS les modes et dans les reels. Ce tableau ne garde que
// ce qui est propre au banc d'essai : l'ordre de repli, la salle sombre, le papier
// pur de la Une.
const MODULES: {
  id: CleModule; nom: string; accent: string;
  /** L'accent, éclairci, quand le module est en salle sombre. */
  accentNuit?: string;
  papierPur?: boolean; sombre?: boolean;
}[] = ([
  { id: "une-des-unes", nom: "Une des Unes", papierPur: true },
  { id: "deux-solitudes", nom: "Deux solitudes" },
  { id: "enjeux-saillants", nom: "12 enjeux" },
  { id: "partis-et-couverture", nom: "Partis", sombre: true },
  { id: "polimetre-plus", nom: "Polimètre+" },
  { id: "assemblee-nationale", nom: "Assemblée" },
] as { id: CleModule; nom: string; papierPur?: boolean; sombre?: boolean }[]).map((m) => ({
  ...m,
  accent: IDENTITES[m.id].accent,
  accentNuit: m.sombre ? melange(IDENTITES[m.id].accent, PAPIER, 0.45) : undefined,
}));

/** Trois degrés : combien de la couleur du module passe dans son fond. */
const INTENSITES: Record<Exclude<Intensite, "off" | "sepia">, { nom: string; force: number; nuit: number }> = {
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
      const i = (p.get("lab") ?? window.localStorage.getItem("lab-intensite") ?? "sepia") as Intensite;
      setIntensite(["off", "sepia", "discret", "marque", "franc"].includes(i) ? i : "sepia");
    } catch { /* rien */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("lab-intensite", intensite); } catch { /* rien */ }
  }, [intensite]);

  // Sépia · Terres : le fond de la page glisse au défilement. Les repères sont
  // relus à chaque image, dans l'ordre où les sections se trouvent sur la page.
  useEffect(() => {
    if (intensite !== "sepia") return;
    const root = document.documentElement;
    let raf = 0;
    const calculer = () => {
      raf = 0;
      const reperes: Repere[] = [];
      for (const [id, m] of Object.entries(IDENTITES)) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        reperes.push({ id, centre: window.scrollY + r.top + r.height / 2, fond: m.papier, accent: m.accent });
      }
      const f = fondAuDefilement(reperes, window.scrollY + window.innerHeight / 2);
      if (f) root.style.setProperty("--lab-fond", f.fond);
    };
    const planifier = () => { if (!raf) raf = window.requestAnimationFrame(calculer); };
    calculer();
    window.addEventListener("scroll", planifier, { passive: true });
    window.addEventListener("resize", planifier);
    return () => {
      window.removeEventListener("scroll", planifier);
      window.removeEventListener("resize", planifier);
      if (raf) window.cancelAnimationFrame(raf);
      root.style.removeProperty("--lab-fond");
    };
  }, [intensite]);

  // TOUT EST EN CSS, POSÉ SUR CHAQUE SECTION PAR SON IDENTIFIANT. Aucun
  // observateur, aucun réglage au montage : le style s'applique que les modules
  // soient déjà là ou non (correctif du 16-09 — l'ancienne version branchait un
  // IntersectionObserver avant que les sections existent, et ne posait jamais
  // rien : « je vois rien »).
  //
  // Le fond de la section ET son papier prennent la couleur : sans le papier,
  // les cartes restent crème au milieu et on ne voit qu'une bande derrière le
  // titre — l'autre moitié du même correctif.
  // Sépia · Terres : chaque section garde SON papier pour ses cartes et SON encre
  // pour ses titres (posés par identifiant), mais son fond est transparent pour
  // laisser voir le dégradé de la page.
  const cssSepia = Object.entries(IDENTITES).map(([id, m]) =>
    `#${id}{background:transparent;--lab-accent:${m.accent};--paper:${m.papier};--paper-deep:${melange(m.papier, "#1C1917", 0.05)}}`).join("\n")
    + `\nbody{background:var(--lab-fond, ${PAPIER})!important}`;

  const css = intensite === "off" ? "" : intensite === "sepia" ? cssSepia : (() => {
    const I = INTENSITES[intensite];
    return MODULES.map((m) => {
      const fond = m.sombre
        ? melange(PAPIER, NUIT, I.nuit)
        : m.papierPur ? PAPIER : melange(PAPIER, m.accent, I.force);
      const accent = m.sombre ? (m.accentNuit ?? m.accent) : m.accent;
      const jetons = m.sombre
        ? Object.entries(jetonsNuit(fond, accent))
        : [["--paper", fond], ["--paper-deep", melange(fond, "#1C1917", 0.05)]];
      return `#${m.id}{background:${fond};--lab-accent:${accent};${jetons.map(([k, v]) => `${k}:${v}`).join(";")}}`;
    }).join("\n");
  })();

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
        [data-section] { transition: background-color 450ms ease; }
        [data-section] h2, [data-section] .section-label { color: var(--lab-accent, inherit); transition: color 450ms ease; }
        ${css}
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
          {bouton("sepia", "Sépia · Terres")}
          {(Object.keys(INTENSITES) as Exclude<Intensite, "off" | "sepia">[]).map((i) => bouton(i, INTENSITES[i].nom))}
        </div>
      )}
    </>
  );
}
