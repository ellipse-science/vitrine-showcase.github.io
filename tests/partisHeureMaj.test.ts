import { describe, it, expect } from "vitest";
import { lastUpdatedLabel } from "@/lib/dates";

// Le module des partis est republié SIX FOIS PAR JOUR. Sa ligne « Dernière mise
// à jour » n'affichait que la date, ce qui laissait croire à une mise à jour
// quotidienne alors que le chiffre affiché peut avoir quatre heures.
//
// L'heure vient de `computed_at`, un instant UTC, converti en heure de Montréal.
// JAMAIS de `date_montreal_tz` : malgré son nom, la colonne porte la date UTC.

/** L'heure de Montréal d'un instant UTC — la même conversion que le chargeur. */
function heureMontreal(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const rendu = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(t));
  const n = Number(rendu.replace(/\D/g, ""));
  return Number.isNaN(n) ? null : n;
}

describe("l'heure de la dernière mise à jour", () => {
  it("convertit l'instant UTC en heure de Montréal", () => {
    // Cas réel du 2026-08-27 : dernier calcul à 23h31 UTC = 19h31 à Montréal.
    expect(heureMontreal("2026-08-27T23:31:44Z")).toBe(19);
    // Et le cas qui traverse minuit : 03h31 UTC le 28 = 23h31 le 27.
    expect(heureMontreal("2026-08-28T03:31:12Z")).toBe(23);
  });

  it("ne se laisse pas piéger par le rendu « 15 h » de fr-CA", () => {
    // `Intl` en fr-CA rend « 15 h », pas « 15 ». Un `Number()` direct donnerait
    // NaN, l'heure retomberait à null, et le libellé perdrait son heure SANS
    // que rien ne le signale. C'est ce qui est arrivé au premier essai.
    const brut = new Intl.DateTimeFormat("fr-CA", {
      timeZone: "America/Toronto",
      hour: "2-digit",
      hour12: false,
    }).format(new Date("2026-08-27T19:32:58Z"));
    expect(Number(brut)).toBeNaN();          // le piège
    expect(heureMontreal("2026-08-27T19:32:58Z")).toBe(15); // la parade
  });

  it("écrit l'heure collée, sans espace — écart assumé à l'OQLF", () => {
    const libelle = lastUpdatedLabel("2026-08-27", 19);
    expect(libelle).toBe("Dernière mise à jour du module\u00a0: jeudi 27 août 2026, 19h");
    expect(libelle).not.toMatch(/\d\s+h/); // jamais « 19 h »
  });

  it("retombe sur la date seule quand aucun horodatage n'est exploitable", () => {
    expect(lastUpdatedLabel("2026-08-27", null)).toBe(
      "Dernière mise à jour du module\u00a0: jeudi 27 août 2026",
    );
    expect(heureMontreal("")).toBeNull();
  });
});
