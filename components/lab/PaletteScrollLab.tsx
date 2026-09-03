"use client";

/* BANC D'ESSAI LOCAL — palettes par module (demande de Yannick, 2 sept. 2026).
 *
 * Principe (concept Projet Quorum, repris ici avec les jetons de la Vitrine) :
 * trois familles de données, trois couleurs.
 *   · MÉDIAS     → le papier jaune de la Vitrine (paper, brass)     : Une des Unes,
 *                  Deux solitudes, 12 enjeux
 *   · DÉCIDEURS  → le rose / cordovan                               : Polimètre+ (promesses),
 *                  Assemblée nationale (Agora)
 *   · OPINION    → le bleu (--bleu)                                  : réservé aux modules
 *                  d'opinion publique à venir (Datagotchi, campagne)
 * Partis et couverture fait le pont : des médias vers les décideurs.
 *
 * Règle d'Adrien : la Une des Unes garde le papier tel quel ; le premier
 * changement se voit en arrivant sur Deux solitudes. Ensuite, le fond descend
 * dans la famille médias (papier qui se creuse), puis bascule vers le rose des
 * décideurs. Quatre « humeurs » de la même logique : clair, franc, sépia
 * (vieillot), moderne (neutres froids). Rien n'est destiné à être poussé tel quel.
 *
 *   ?lab=clair | franc | sepia | moderne | off      ?glisse=1 pour le dégradé continu
 */
import { useEffect, useRef, useState } from "react";

type Famille = "médias" | "pont" | "décideurs";
type Humeur = "off" | "clair" | "franc" | "sepia" | "moderne";

const PAPIER = "#F3ECDD";
const MODULES: { id: string; nom: string; famille: Famille }[] = [
  { id: "une-des-unes",         nom: "Une des Unes",   famille: "médias" },
  { id: "deux-solitudes",       nom: "Deux solitudes", famille: "médias" },
  { id: "enjeux-saillants",     nom: "12 enjeux",      famille: "médias" },
  { id: "partis-et-couverture", nom: "Partis",         famille: "pont" },
  { id: "polimetre-plus",       nom: "Polimètre+",     famille: "décideurs" },
  { id: "assemblee-nationale",  nom: "Assemblée",      famille: "décideurs" },
];

// Fonds par module, dans l'ordre de MODULES (la Une reste toujours PAPIER).
const HUMEURS: Record<Exclude<Humeur, "off">, { nom: string; fonds: string[]; accents: Record<Famille, string> }> = {
  clair: {
    nom: "Clair",
    fonds: [PAPIER, "#F1E7D2", "#EEE2C6", "#F0E2D0", "#F2E3DC", "#EEDAD6"],
    accents: { "médias": "#A07A3D", pont: "#8A5A3A", "décideurs": "#6B1E2A" },
  },
  franc: {
    nom: "Franc",
    fonds: [PAPIER, "#EFE1C2", "#EAD8AE", "#ECD7C1", "#EDD3CA", "#E6C5BF"],
    accents: { "médias": "#A07A3D", pont: "#8A5A3A", "décideurs": "#6B1E2A" },
  },
  sepia: {
    nom: "Sépia",
    fonds: [PAPIER, "#EDE1CB", "#E6D6B8", "#E2D0B1", "#E5D1C3", "#DCC3B4"],
    accents: { "médias": "#86642C", pont: "#7A4E33", "décideurs": "#5E1A25" },
  },
  moderne: {
    nom: "Moderne",
    fonds: [PAPIER, "#F0EDE6", "#EBEAE6", "#EAE5E2", "#EFE2E3", "#E9DADB"],
    accents: { "médias": "#8B6A33", pont: "#6E685F", "décideurs": "#6B1E2A" },
  },
};

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)}, ${Math.round(g1 + (g2 - g1) * k)}, ${Math.round(b1 + (b2 - b1) * k)})`;
}

// Jamais en production : le composant ne se monte que hors prod (voir aussi
// app/page.tsx, qui ne l'inclut pas quand NEXT_PUBLIC_SITE_ENV vaut « prod »).
export default function PaletteScrollLab() {
  if (process.env.NEXT_PUBLIC_SITE_ENV === "prod") return null;
  return <PaletteScrollLabInner />;
}

function PaletteScrollLabInner() {
  const [humeur, setHumeur] = useState<Humeur>("off");
  const [replie, setReplie] = useState(false);
  const [glisse, setGlisse] = useState(false);
  const [courant, setCourant] = useState("");
  const glisseRef = useRef(false);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      // Par défaut sur dev : Clair, en continu (choix d'Adrien, 3 sept.). Le
      // panneau garde ensuite le dernier choix du visiteur dans son navigateur.
      const h = (p.get("lab") ?? window.localStorage.getItem("lab-humeur") ?? "clair") as Humeur;
      setHumeur(["off", "clair", "franc", "sepia", "moderne"].includes(h) ? h : "clair");
      const g = p.get("glisse") ?? window.localStorage.getItem("lab-glisse") ?? "1";
      setGlisse(g === "1" || g === "true");
    } catch { /* rien */ }
  }, []);

  useEffect(() => {
    glisseRef.current = glisse;
    try {
      window.localStorage.setItem("lab-humeur", humeur);
      window.localStorage.setItem("lab-glisse", glisse ? "1" : "0");
    } catch { /* rien */ }
    const root = document.documentElement;
    const poser = (fond: string, accent: string, nom: string) => {
      root.style.setProperty("--lab-fond", fond);
      root.style.setProperty("--lab-accent", accent);
      setCourant(nom);
    };
    if (humeur === "off") {
      root.style.removeProperty("--lab-fond");
      root.style.removeProperty("--lab-accent");
      setCourant("");
      return;
    }
    const H = HUMEURS[humeur];
    const sections = MODULES
      .map((m, i) => ({ m, fond: H.fonds[i], accent: H.accents[m.famille], el: document.getElementById(m.id) }))
      .filter((x): x is typeof x & { el: HTMLElement } => !!x.el);
    const libelle = (m: { nom: string; famille: Famille }) => `${m.nom} · ${m.famille}`;

    if (!glisse) {
      const ratios = new Map<string, number>();
      const choisir = () => {
        let meilleur: (typeof sections)[number] | null = null;
        let rmax = 0;
        for (const s of sections) {
          const r = ratios.get(s.m.id) ?? 0;
          if (r > rmax) { rmax = r; meilleur = s; }
        }
        if (meilleur) poser(meilleur.fond, meilleur.accent, libelle(meilleur.m));
        else poser(PAPIER, H.accents["médias"], "hors module");
      };
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) ratios.set((e.target as HTMLElement).id, e.intersectionRatio);
        choisir();
      }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
      sections.forEach((s) => io.observe(s.el));
      return () => io.disconnect();
    }

    // Glissement continu : le fond s'interpole entre les centres des modules.
    let raf = 0;
    const calculer = () => {
      raf = 0;
      const centre = window.scrollY + window.innerHeight / 2;
      const pts = sections.map((s) => {
        const r = s.el.getBoundingClientRect();
        return { s, y: window.scrollY + r.top + r.height / 2 };
      });
      if (!pts.length) return;
      if (centre <= pts[0].y) { poser(pts[0].s.fond, pts[0].s.accent, libelle(pts[0].s.m)); return; }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (centre >= a.y && centre < b.y) {
          const t = (centre - a.y) / (b.y - a.y);
          const proche = t < 0.5 ? a.s : b.s;
          poser(mix(a.s.fond, b.s.fond, t), proche.accent, libelle(proche.m));
          return;
        }
      }
      const d = pts[pts.length - 1].s;
      poser(d.fond, d.accent, libelle(d.m));
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(calculer); };
    calculer();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [humeur, glisse]);

  const bouton = (h: Humeur, libelle: string) => (
    <button
      key={h}
      type="button"
      onClick={() => setHumeur(h)}
      style={{
        font: "inherit", fontSize: 12, padding: "4px 9px", borderRadius: 999, cursor: "pointer",
        border: "1px solid #C8BDA6", background: humeur === h ? "#6B1E2A" : "transparent",
        color: humeur === h ? "#F3ECDD" : "#1C1917",
      }}
    >
      {libelle}
    </button>
  );

  return (
    <>
      <style>{`
        html { --lab-fond: ${PAPIER}; }
        body { background: var(--lab-fond, var(--paper)) !important; transition: background-color ${glisse ? "0ms" : "700ms"} ease; }
        [data-section] h2, [data-section] .section-label { color: var(--lab-accent, inherit); transition: color 700ms ease; }
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
          maxWidth: "min(560px, calc(100vw - 28px))", padding: "8px 10px", borderRadius: 12, background: "rgba(243,236,221,.94)", border: "1px solid #C8BDA6",
          boxShadow: "0 4px 18px rgba(0,0,0,.12)", backdropFilter: "blur(6px)", fontSize: 12, color: "#1C1917",
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
        <span style={{ fontWeight: 600 }}>Palettes</span>
        {bouton("off", "off")}
        {(Object.keys(HUMEURS) as Exclude<Humeur, "off">[]).map((h) => bouton(h, HUMEURS[h].nom))}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <input type="checkbox" checked={glisse} onChange={(e) => setGlisse(e.target.checked)} /> continu
        </label>
        <span style={{ color: "#6E685F", marginLeft: 4 }}>{courant}</span>
      </div>
      )}
    </>
  );
}
