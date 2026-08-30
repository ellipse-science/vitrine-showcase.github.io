import { describe, expect, it } from "vitest";

import { momentMontreal } from "@/lib/dates";

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
