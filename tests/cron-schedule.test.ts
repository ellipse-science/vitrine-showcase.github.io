import { describe, expect, it } from "vitest";

import {
  ATHENA_REGISTERED_UTC_HOURS,
  ATHENA_TARGET_HOURS_NY,
  REGISTERED_UTC_HOURS,
  TARGET_HOURS_NY,
  hourInNY,
  isAthenaTargetHourInNY,
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

/** Même parade pour le sync DIRECT Athena (cron de la minute :10, chaîne
 *  émancipée de GitHub) : heures visées {0,4,8,12,16,20} à New York. */
function firedAthenaHoursNY(dateISO: string): number[] {
  return ATHENA_REGISTERED_UTC_HOURS
    .map((h) => new Date(`${dateISO}T${String(h).padStart(2, "0")}:10:00Z`))
    .filter(isAthenaTargetHourInNY)
    .map(hourInNY)
    .sort((a, b) => a - b);
}

const EXPECTED_ATHENA = [...ATHENA_TARGET_HOURS_NY].sort((a, b) => a - b);

describe("cron du sync Athena — horaire fixe à New York", () => {
  it("déclenche aux heures visées en heure avancée (été)", () => {
    expect(firedAthenaHoursNY("2026-08-19")).toEqual(EXPECTED_ATHENA);
  });

  it("déclenche aux mêmes heures locales en heure normale (hiver)", () => {
    expect(firedAthenaHoursNY("2027-01-15")).toEqual(EXPECTED_ATHENA);
  });

  it("ne saute ni ne double aucune exécution les nuits de bascule", () => {
    expect(firedAthenaHoursNY("2026-11-01")).toHaveLength(ATHENA_TARGET_HOURS_NY.length);
    expect(firedAthenaHoursNY("2027-03-08")).toHaveLength(ATHENA_TARGET_HOURS_NY.length);
  });

  it("écarte bien la moitié des déclenchements enregistrés", () => {
    expect(ATHENA_REGISTERED_UTC_HOURS).toHaveLength(ATHENA_TARGET_HOURS_NY.length * 2);
  });
});
