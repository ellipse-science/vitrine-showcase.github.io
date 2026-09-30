import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialClient } from "@/components/interactive/SocialClient";
import { construireSocial } from "@/lib/data/social";

// Ce que la vue d'arrivée affirme tient dans son balisage : la période par
// défaut (7 derniers jours complets, comme la démo), la frise et ses poignées
// utilisables au clavier, les tuiles en toutes lettres, les filtres, et la
// mention « expérimental » tant que le module n'existe que sur dev.
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

describe("rendu du module « Les candidats sur les réseaux »", () => {
  const html = renderToStaticMarkup(<SocialClient data={data} />);
  // \s couvre l'espace insécable : on compare sur des espaces simples.
  const texte = html.replace(/<[^>]+>/g, " ").replace(/[\s\u00a0]+/g, " ");

  it("s'ouvre sur les 7 derniers jours complets, comme la démo", () => {
    expect(texte).toContain("Du 22 septembre au 28 septembre · 7 jours");
  });

  it("les tuiles portent la période : le jour partiel du relevé n'y entre pas", () => {
    expect(texte).toContain("Publications 162"); // 132 + 30, pas les 9 du 29
    expect(texte).toContain("J’aime 9 074"); // 8 281 + 793
  });

  it("En chiffres : quatre mesures, sans les moyennes retirées", () => {
    expect((html.match(/<dt>/g) ?? []).length).toBe(4);
    for (const mot of ["Par jour, en moyenne", "J’aime par publication", "Une moyenne ne se découpe pas"])
      expect(texte).not.toContain(mot);
  });

  it("la frise et ses deux poignées sont des curseurs accessibles au clavier", () => {
    expect((html.match(/role="slider"/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-label="Début de la période"');
    expect(html).toContain('aria-label="Fin de la période"');
  });

  it("filtres, onglets, formes et découpes de la démo sont présents", () => {
    // « Filtres » puis « En chiffres » dans la colonne de droite.
    for (const mot of ["Filtres", "Plateforme", "Parti", "Type de compte", "Présence", "Partis", "Candidats",
      "Palmarès", "Campagne", "En chiffres", "Abonnés, dernier relevé"]) {
      expect(texte).toContain(mot);
    }
    // Formes, découpes et plateformes en icônes, comme la démo : le nom est
    // dans aria-label (lecteurs d'écran) et title (infobulle).
    for (const nom of ["Barres et parts", "Dans le temps", "Ensemble", "Par plateforme", "Par parti",
      "Facebook", "Instagram", "TikTok"]) {
      expect(html).toContain(`aria-label="${nom}"`);
      // « Dans le temps », grisé sur les abonnés, porte la raison en infobulle.
      if (nom !== "Dans le temps") expect(html).toContain(`title="${nom}"`);
    }
  });

  it("Indicateur, Graphique, Découpage : une ligne de groupes, chacun sous son en-tête", () => {
    const reglages = html.slice(html.indexOf('class="social-reglages"'), html.indexOf('class="social-sous-titre"'));
    const entetes = [...reglages.matchAll(/class="social-coches-titre"[^>]*>([^<]+)</g)].map((x) => x[1].replace(/\s+/g, " "));
    expect(entetes).toEqual(["Indicateur · J’aime", "Graphique", "Découpage"]);
    const groupes = [...reglages.matchAll(/role="group" aria-label="([^"]+)"/g)].map((x) => x[1]);
    expect(groupes).toEqual(["Indicateur affiché", "Graphique", "Découpage"]);
    const mesure = reglages.slice(reglages.indexOf('aria-label="Indicateur affiché"'));
    expect(mesure.slice(0, mesure.indexOf("</div>")).match(/<button/g)).toHaveLength(4);
    for (const nom of ["Abonnés", "Publications", "J’aime", "Commentaires"]) expect(html).toContain(`aria-label="${nom}"`);
    for (const nom of ["Par jour, en moyenne", "J’aime par publication"]) expect(html).not.toContain(`aria-label="${nom}"`);
    expect(html).not.toContain("social-mesure-nom");
    // L'interface dit « indicateur », jamais « mesure » (libellés et aria-label).
    expect(html).not.toMatch(/[Mm]esure/);
    // Un filet entre deux groupes : Indicateur | Graphique | Découpage.
    expect(reglages.match(/class="social-reglages-filet"/g)).toHaveLength(2);
  });

  it("s'ouvre sur Partis, en j'aime, barres et parts, ensemble ; « dans le temps » disponible", () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>Partis</);
    expect(html).toMatch(/aria-pressed="true" aria-label="J’aime"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Barres et parts"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Ensemble"/);
    expect(texte).toContain("Total des j’aime de la période.");
    expect(html).not.toContain('title="Pas de série d’abonnés" disabled=""');
    expect(html).toContain("social-treemap");
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
    for (const p of ["Facebook", "Instagram", "TikTok"]) expect(h).toContain(`title="${p}\u00a0: 100 j’aime"`);
  });

  it("filtres par défaut : pas de bouton « Réinitialiser »", () => {
    expect(texte).toContain("Filtres");
    expect(html).not.toContain('aria-label="Réinitialiser les filtres"');
  });

  it("sans fond de carte, pas d'onglet Carte", () => {
    expect(texte).not.toContain("Carte");
  });

  it("dit que le module est expérimental, sans valeur vide", () => {
    expect(texte).toContain("Module expérimental");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});
