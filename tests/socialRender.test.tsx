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
    expect(texte).toContain("J’aime par publication");
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
      "Facebook", "Instagram", "TikTok", "Par jour, en moyenne", "J’aime par publication"]) {
      expect(html).toContain(`aria-label="${nom}"`);
      // « Dans le temps », grisé sur les abonnés, porte la raison en infobulle.
      if (nom !== "Dans le temps") expect(html).toContain(`title="${nom}"`);
    }
  });

  it("la mesure : des icônes sous les onglets, le nom complet de la mesure active à côté", () => {
    expect(html).toContain('aria-label="Mesure affichée"');
    for (const nom of ["Abonnés", "Publications", "Par jour, en moyenne", "J’aime", "Commentaires", "J’aime par publication"])
      expect(html).toContain(`aria-label="${nom}"`);
    expect(html).toMatch(/class="social-mesure-nom"[^>]*>Abonnés</);
  });

  it("Partis s'ouvre sur les abonnés : « dans le temps » grisé, faute de série", () => {
    expect(texte).toContain("Total des abonnés des comptes suivis");
    expect(html).toMatch(/title="Pas de série d’abonnés" disabled=""/);
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
