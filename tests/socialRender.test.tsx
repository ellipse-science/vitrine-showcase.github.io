import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialClient } from "@/components/interactive/SocialClient";
import { construireSocial } from "@/lib/data/social";

// Ce que la vue d'arrivée (Présence) affirme tient dans son balisage : une
// rangée par parti suivi, une case par plateforme, un pourcentage lisible, et
// la mention « expérimental » tant que le module n'existe que sur dev.
const data = construireSocial(
  [{ compte: "facebook:eduhaime", plateforme: "facebook", pseudo: "eduhaime", candidat: "Éric Duhaime", parti: "PCQ", circonscription: "Bellechasse", type: "candidat", abonnes: 227675, releve: "2026-09-29 12:40", calcule_le: "2026-09-29 13:54" }],
  [
    { jour: "2026-09-28", parti: "QS", plateforme: "facebook", type: "candidat", publications: 132, jaime: 8281, commentaires: 2256 },
    { jour: "2026-09-29", parti: "QS", plateforme: "facebook", type: "candidat", publications: 30, jaime: 793, commentaires: 76 },
  ],
  [{ parti: "QS", plateforme: "facebook", avec_compte: 100, candidats: 127, part: 0.7874 }],
  [],
)!;

describe("rendu du module « Les candidats sur les réseaux »", () => {
  const html = renderToStaticMarkup(<SocialClient data={data} />);

  it("porte le titre du module et la vue Présence par défaut", () => {
    expect(html).toContain("Les candidats sur les réseaux");
    expect(html).toContain("Part des candidatures de chaque parti");
  });

  it("une rangée par parti suivi, une case par plateforme", () => {
    expect((html.match(/<tr>/g) ?? []).length).toBe(1 + 5);
    expect((html.match(/<td /g) ?? []).length).toBe(5 * 3);
    expect(html).toContain("79\u00a0%");
  });

  it("dit que le module est expérimental", () => {
    expect(html).toContain("Module expérimental");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});
