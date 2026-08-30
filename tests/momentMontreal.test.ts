import { describe, expect, it } from "vitest";

import { heurePublicationMontreal, momentMontreal } from "@/lib/dates";

// Le `tag` d'issues_score_day est en UTC (clé d'ordre du stepper, l'exception
// admise par la règle « heure de Montréal partout »). Ce qui compte, c'est
// qu'il ne soit JAMAIS affiché tel quel.
describe("momentMontreal", () => {
  it("convertit un tag d'été (EDT, −4h)", () => {
    // Le passage réel du 2026-08-27 : 19:37 UTC.
    expect(momentMontreal("2026-08-27 19:37")).toEqual({ date: "2026-08-27", heure: 15 });
  });

  it("recule d'un jour quand la passe nocturne UTC tombe la veille à Montréal", () => {
    // 03:36 UTC le 27 = 23h36 le 26 à Montréal. C'est le cas qui fait diverger
    // une date tirée de `date_utc` et une heure convertie : les deux doivent
    // sortir du même instant.
    expect(momentMontreal("2026-08-27 03:36")).toEqual({ date: "2026-08-26", heure: 23 });
  });

  it("applique −5h en hiver, pas −4h", () => {
    // Même heure UTC, six semaines après la fin de l'heure avancée.
    expect(momentMontreal("2026-12-15 19:37")).toEqual({ date: "2026-12-15", heure: 14 });
  });

  it("bascule correctement le jour du changement d'heure", () => {
    // L'heure avancée 2026 se termine le dimanche 1er novembre à 2h.
    expect(momentMontreal("2026-11-01 05:00")).toEqual({ date: "2026-11-01", heure: 1 });
    expect(momentMontreal("2026-11-01 07:00")).toEqual({ date: "2026-11-01", heure: 2 });
  });

  it("accepte aussi un instant ISO avec Z (computed_at)", () => {
    expect(momentMontreal("2026-08-27T23:31:44Z")).toEqual({ date: "2026-08-27", heure: 19 });
  });

  it("rend null sur une entrée inexploitable, pour retomber sur la date seule", () => {
    expect(momentMontreal(null)).toBeNull();
    expect(momentMontreal("")).toBeNull();
    expect(momentMontreal("pas une date")).toBeNull();
  });
});

// Relevé par Copilot sur la PR #625 : un premier jet testait le seul PRÉFIXE
// « YYYY-MM-DD HH:MM » et réécrivait donc aussi les instants ISO complets,
// jetant leur décalage. Un `computed_at` avec offset se retrouvait quatre
// heures plus loin — précisément le chemin par lequel #617 doit passer.
describe("momentMontreal — instants qui portent déjà leur fuseau", () => {
  it("respecte un décalage explicite au lieu de le jeter", () => {
    // 23h31 heure de Montréal, écrit avec son offset : c'est déjà l'heure locale.
    expect(momentMontreal("2026-08-27T23:31:44-04:00")).toEqual({ date: "2026-08-27", heure: 23 });
  });

  it("le même instant écrit en Z donne le même résultat", () => {
    // 2026-08-28T03:31:44Z EST 2026-08-27T23:31:44-04:00.
    expect(momentMontreal("2026-08-28T03:31:44Z")).toEqual({ date: "2026-08-27", heure: 23 });
  });

  it("accepte la forme sans fuseau avec secondes", () => {
    expect(momentMontreal("2026-08-27 19:37:12")).toEqual({ date: "2026-08-27", heure: 15 });
  });
});

// ⚠️ Le défaut du 2026-08-30 : le module affichait l'heure BRUTE de la passe
// (« 15h », « depuis 11h ») au lieu de l'heure de l'ÉDITION (« 16h »,
// « depuis 12h »). Rien ne l'a signalé parce que `MOMENT_AUJ` a un repli pour
// les heures hors grille. Ces cas-là verrouillent la grille elle-même.
describe("heurePublicationMontreal — l'heure de l'édition, pas celle de la passe", () => {
  const GRILLE = [4, 8, 12, 16, 20, 24];

  it("place les six passes réelles sur la grille des éditions", () => {
    // Les six tags quotidiens d'issues_score_day, en UTC.
    expect(heurePublicationMontreal("2026-08-27 19:37")).toEqual({ date: "2026-08-27", heure: 16 });
    expect(heurePublicationMontreal("2026-08-27 15:36")).toEqual({ date: "2026-08-27", heure: 12 });
    expect(heurePublicationMontreal("2026-08-27 11:36")).toEqual({ date: "2026-08-27", heure: 8 });
    expect(heurePublicationMontreal("2026-08-27 07:36")).toEqual({ date: "2026-08-27", heure: 4 });
    expect(heurePublicationMontreal("2026-08-27 03:36")).toEqual({ date: "2026-08-26", heure: 24 });
    expect(heurePublicationMontreal("2026-08-26 23:36")).toEqual({ date: "2026-08-26", heure: 20 });
  });

  it("ne sort JAMAIS de la grille, quelle que soit l'heure de la passe", () => {
    for (let h = 0; h < 24; h++) {
      const iso = `2026-08-27 ${String((h + 4) % 24).padStart(2, "0")}:00`;
      const r = heurePublicationMontreal(iso);
      expect(GRILLE).toContain(r?.heure);
    }
  });

  it("rend 24 et non 0 pour minuit, ce que lastUpdatedLabel attend", () => {
    // 23h36 à Montréal tombe dans le bloc 20-24, servi à minuit.
    expect(heurePublicationMontreal("2026-08-28 03:36")?.heure).toBe(24);
  });

  it("tient aussi en heure normale, où la passe recule d'une heure", () => {
    // 19:37 UTC en décembre = 14h37 à Montréal → bloc 12-16 → servi à 16h.
    expect(heurePublicationMontreal("2026-12-15 19:37")).toEqual({ date: "2026-12-15", heure: 16 });
  });
});
