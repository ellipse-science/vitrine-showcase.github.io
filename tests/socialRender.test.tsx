import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialClient } from "@/components/interactive/SocialClient";
import { construireSocial } from "@/lib/data/social";

// Ce que la vue d'arrivée affirme tient dans son balisage : la période par
// défaut (toute la campagne, jusqu'au dernier jour complet), la frise et ses
// poignées utilisables au clavier, les quatre indicateurs en grandes cases, la
// rangée des vues, les filtres cochés, et la mention « expérimental » tant que
// le module n'existe que sur dev.
const data = construireSocial(
  [
    {
      compte: "facebook:eduhaime", plateforme: "facebook", pseudo: "eduhaime", candidat: "Éric Duhaime",
      parti: "PCQ", circonscription: "Bellechasse", type: "candidat", abonnes: 227675,
      releve: "2026-09-29 12:40", calcule_le: "2026-09-29 13:54", candidatures_parti: 127,
    },
  ],
  [
    { jour: "2026-09-27", parti: "QS", plateforme: "facebook", type: "candidat", publications: 132, jaime: 8281, commentaires: 2256 },
    { jour: "2026-09-28", parti: "QS", plateforme: "facebook", type: "candidat", publications: 30, jaime: 793, commentaires: 76 },
    { jour: "2026-09-29", parti: "QS", plateforme: "facebook", type: "candidat", publications: 9, jaime: 9, commentaires: 9 },
  ],
  [],
)!;

describe("rendu du module « La guerre des clics »", () => {
  const html = renderToStaticMarkup(<SocialClient data={data} />);
  // \s couvre l'espace insécable : on compare sur des espaces simples.
  const texte = html.replace(/<[^>]+>/g, " ").replace(/[\s\u00a0]+/g, " ");
  /** Les libellés des boutons enfoncés d'une tranche du balisage (icône devant le mot admise). */
  const enfonces = (tranche: string) =>
    [...tranche.matchAll(/aria-pressed="true"[^>]*>(?:<span[^>]*>)?(?:<svg[\s\S]*?<\/svg>)?([^<]+)</g)].map((m) => m[1].trim());

  it("s'ouvre sur toute la campagne, jusqu'au dernier jour complet", () => {
    const nb = data.jours.length - data.campagne;
    expect(texte).toContain(`au 28 septembre · ${nb} jours`);
  });

  it("le sous-titre porte le total de la période : le jour partiel du relevé n'y entre pas", () => {
    expect(texte).toContain("9 074 j’aime sur la période."); // 8 281 + 793, pas les 9 du 29
  });

  it("les grandes cases : quatre indicateurs avec leur question, J’aime enfoncé en premier", () => {
    const cases = html.slice(html.indexOf('class="social-vues'), html.indexOf('class="social-haut"'));
    expect(cases.match(/class="social-vue-mot"/g)).toHaveLength(4);
    for (const q of ["Qui fait réagir", "Qui est le plus suivi", "Qui publie le plus", "Qui fait discuter"]) expect(texte).toContain(q);
    expect(enfonces(cases)).toEqual(["J’aime"]);
    expect(cases.indexOf("J’aime")).toBeLessThan(cases.indexOf("Abonnés"));
  });

  it("la frise et ses deux poignées sont des curseurs accessibles au clavier", () => {
    expect((html.match(/role="slider"/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-label="Début de la période"');
    expect(html).toContain('aria-label="Fin de la période"');
  });

  it("filtres en tête : « Filtrer », plateformes et partis cochés ; plus de type de compte ni de Présence", () => {
    expect(texte).toContain("Filtrer");
    for (const nom of ["Facebook", "Instagram", "TikTok"]) {
      expect(html).toContain(`aria-label="${nom}"`);
      expect(html).toContain(`title="Masquer ${nom}"`);
    }
    expect(html).toContain('class="social-coche-marque"');
    // Les titres de groupe (Plateforme, Parti) restent dans le balisage pour les
    // lecteurs d'écran ; seul le type de compte a disparu.
    for (const mot of ["Type de compte", "Présence", "En chiffres"]) expect(texte).not.toContain(mot);
  });

  it("la rangée sobre : la vue, puis Total | Évolution, un filet entre les deux", () => {
    const reglages = html.slice(html.indexOf('class="social-reglages"'), html.indexOf('class="social-sous-titre"'));
    const groupes = [...reglages.matchAll(/role="group" aria-label="([^"]+)"/g)].map((x) => x[1]);
    expect(groupes).toEqual(["Vue", "Indicateur affiché", "Type de graphique"]);
    const vues = reglages.slice(reglages.indexOf('aria-label="Vue"'), reglages.indexOf('aria-label="Indicateur affiché"'));
    expect([...vues.matchAll(/<\/svg>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(["Par parti", "Par candidat", "Par publication"]);
    expect(enfonces(vues)).toEqual(["Par parti"]);
    const forme = reglages.slice(reglages.indexOf('aria-label="Type de graphique"'));
    expect(enfonces(forme)).toEqual(["Total"]);
    expect(texte).toContain("Évolution");
    for (const mot of ["Découpage", "Ensemble", "Par plateforme", "Barres et parts", "Dans le temps"]) expect(texte).not.toContain(mot);
    expect(reglages.match(/class="social-reglages-filet"/g)).toHaveLength(1);
    // L'interface dit « indicateur », jamais « mesure » (libellés et aria-label).
    expect(html).not.toMatch(/[Mm]esure/);
  });

  it("s'ouvre sur les barres seules : plus de treemap, « Évolution » disponible", () => {
    expect(html).toContain("social-barres-seules");
    expect(html).not.toContain("social-treemap");
    expect(html).not.toContain('title="Pas de série d’abonnés" disabled=""');
  });

  it("toutes plateformes cochées : la barre porte un segment par plateforme présente", () => {
    const tri = construireSocial(
      [{ compte: "facebook:x", plateforme: "facebook", pseudo: "x", candidat: "X", parti: "QS", circonscription: "Gouin",
        type: "candidat", abonnes: 1, releve: "2026-09-29 12:40", calcule_le: "2026-09-29 13:54", candidatures_parti: 127 }],
      (["facebook", "instagram", "tiktok"] as const).flatMap((p) => [
        { jour: "2026-09-27", parti: "QS", plateforme: p, type: "candidat", publications: 3, jaime: 100, commentaires: 1 },
        { jour: "2026-09-29", parti: "QS", plateforme: p, type: "candidat", publications: 1, jaime: 1, commentaires: 1 },
      ]),
      [],
    )!;
    const h = renderToStaticMarkup(<SocialClient data={tri} />);
    expect(h).toContain('aria-label="QS\u00a0: 300 j’aime (Facebook 100 · Instagram 100 · TikTok 100)"');
    // Le détail par réseau vit dans l'infobulle au survol, plus dans un title.
    for (const p of ["facebook", "instagram", "tiktok"]) expect(h).toContain(`data-plateforme="${p}"`);
  });

  it("filtres par défaut : pas de bouton « Réinitialiser »", () => {
    expect(texte).toContain("Filtres");
    expect(html).not.toContain('aria-label="Réinitialiser les filtres"');
  });

  it("sans fond de carte, pas de vue Par circonscription", () => {
    expect(texte).not.toContain("Par circonscription");
    expect(texte).not.toContain("Carte");
  });

  it("dit que le module est expérimental, sans valeur vide", () => {
    expect(texte).toContain("Module expérimental");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});
