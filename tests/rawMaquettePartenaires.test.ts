import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sansSectionPartenaires } from "@/components/sections/RawMaquette";

// Sur /apropos/partenaires/, la liste des partenaires est le contenu de la page :
// le pied de page ne doit pas la répéter en petit juste en dessous (2026-09-06).
describe("sansSectionPartenaires", () => {
  const bottom = fs.readFileSync(path.resolve(process.cwd(), "static-content/bottom.html"), "utf8");

  it("retire la section Partenaires du vrai pied de page, et rien d'autre", () => {
    expect(bottom).toContain('class="partners-section"');
    const sans = sansSectionPartenaires(bottom);
    expect(sans).not.toContain("partners-section");
    expect(sans).not.toContain("<!-- Partenaires -->");
    expect(sans).toContain("<!-- Footer -->");
    expect(sans.length).toBeLessThan(bottom.length);
  });

  it("laisse intact un pied de page qui n'a pas de section Partenaires", () => {
    const html = "<footer><!-- Footer --><p>Site</p></footer>";
    expect(sansSectionPartenaires(html)).toBe(html);
  });
});
