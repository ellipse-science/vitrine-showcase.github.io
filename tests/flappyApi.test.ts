import { describe, expect, it } from "vitest";

import { MAX_SCORE, sanitizeSubmission } from "@/workers/api/src/flappy-logic";

/**
 * La frontière de confiance du classement (issue #499) : le client est
 * anonyme, tout ce qu'il envoie est suspect. Ces tests fixent le contrat de
 * rejet — un relâchement ici rouvrirait la porte que la PR #491 a fermée
 * (n'importe qui réécrivait le tableau).
 */
describe("sanitizeSubmission (/v1/flappy/leaderboard)", () => {
  it("accepte une soumission normale et assainit les initiales", () => {
    const e = sanitizeSubmission({ initials: "a-b!c", score: 42, date: "2026-08-20" });
    expect(e).toEqual({ initials: "ABC", score: 42, date: "2026-08-20" });
  });

  it("rejette les scores non plausibles", () => {
    expect(sanitizeSubmission({ initials: "ABC", score: 0 })).toBeNull();
    expect(sanitizeSubmission({ initials: "ABC", score: -3 })).toBeNull();
    expect(sanitizeSubmission({ initials: "ABC", score: MAX_SCORE + 1 })).toBeNull();
    expect(sanitizeSubmission({ initials: "ABC", score: 3.5 })).toBeNull();
    expect(sanitizeSubmission({ initials: "ABC", score: "1e3" })).toBeNull();
  });

  it("rejette les entrées sans initiales exploitables", () => {
    expect(sanitizeSubmission({ initials: "!!!", score: 5 })).toBeNull();
    expect(sanitizeSubmission({ score: 5 })).toBeNull();
  });

  it("remplace une date invalide par celle du jour", () => {
    const e = sanitizeSubmission({ initials: "ABC", score: 5, date: "hier" });
    expect(e?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejette les corps non-objets", () => {
    expect(sanitizeSubmission(null)).toBeNull();
    expect(sanitizeSubmission([1, 2])).toBeNull();
    expect(sanitizeSubmission("{}")).toBeNull();
  });
});
