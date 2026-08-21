import { describe, expect, it } from "vitest";

import { matchesCurrentUneArt } from "@/lib/shareUneArt";

describe("matchesCurrentUneArt", () => {
  it("préfère la storyline, stable entre deux éditions", () => {
    expect(matchesCurrentUneArt(
      { storyline_id: "story-tarifs", event_id: "ancien-event" },
      { storylineId: "story-tarifs", eventId: "nouvel-event" },
    )).toBe(true);
  });

  it("se rabat sur l'identifiant d'événement", () => {
    expect(matchesCurrentUneArt(
      { event_id: "event-123" },
      { eventId: "event-123" },
    )).toBe(true);
  });

  it("refuse une illustration d'une autre Une", () => {
    expect(matchesCurrentUneArt(
      { storyline_id: "story-hier" },
      { storylineId: "story-maintenant" },
    )).toBe(false);
  });

  it("refuse les métadonnées incomplètes", () => {
    expect(matchesCurrentUneArt(undefined, { storylineId: "story-maintenant" })).toBe(false);
    expect(matchesCurrentUneArt({}, {})).toBe(false);
  });
});
