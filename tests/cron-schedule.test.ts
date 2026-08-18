import { describe, expect, it } from "vitest";

import {
  REGISTERED_UTC_HOURS,
  TARGET_HOURS_NY,
  hourInNY,
  isTargetHourInNY,
} from "@/workers/api/src/schedule";

/**
 * Le cron du Worker d'API doit tomber à heure FIXE à New York — 02:00, 06:00,
 * 10:00, 14:00, 18:00, 22:00 — alors que Cloudflare ne sait planifier qu'en
 * UTC, qui ignore l'heure avancée.
 *
 * La parade : enregistrer les douze heures UTC (les six d'été et les six
 * d'hiver) et laisser `isTargetHourInNY` écarter celles qui ne tombent pas
 * juste. Ces tests vérifient que la parade tient de part et d'autre du
 * changement d'heure — c'est précisément ce qu'un rappel semestriel manuel
 * finissait par oublier, en silence.
 */
function firedHoursNY(dateISO: string): number[] {
  return REGISTERED_UTC_HOURS
    .map((h) => new Date(`${dateISO}T${String(h).padStart(2, "0")}:00:00Z`))
    .filter(isTargetHourInNY)
    .map(hourInNY)
    .sort((a, b) => a - b);
}

const EXPECTED = [...TARGET_HOURS_NY].sort((a, b) => a - b);

describe("cron de l'API — horaire fixe à New York", () => {
  it("déclenche aux heures visées en heure avancée (été)", () => {
    expect(firedHoursNY("2026-08-18")).toEqual(EXPECTED);
  });

  it("déclenche aux mêmes heures locales en heure normale (hiver)", () => {
    expect(firedHoursNY("2027-01-15")).toEqual(EXPECTED);
  });

  it("ne saute ni ne double aucune exécution la nuit du passage à l'heure normale", () => {
    expect(firedHoursNY("2026-11-01")).toHaveLength(TARGET_HOURS_NY.length);
  });

  it("ne saute ni ne double aucune exécution la nuit du retour à l'heure avancée", () => {
    expect(firedHoursNY("2027-03-08")).toHaveLength(TARGET_HOURS_NY.length);
  });

  it("écarte bien la moitié des déclenchements enregistrés", () => {
    // Douze heures enregistrées, six qui travaillent : si ce rapport change,
    // c'est que wrangler.toml et REGISTERED_UTC_HOURS ont divergé.
    expect(REGISTERED_UTC_HOURS).toHaveLength(TARGET_HOURS_NY.length * 2);
  });
});
