import { describe, expect, it } from "vitest";

import {
  ATHENA_FILET_HOURS_NY,
  ATHENA_FILET_REGISTERED_UTC_HOURS,
  ATHENA_REGISTERED_UTC_HOURS,
  ATHENA_TARGET_HOURS_NY,
  REGISTERED_UTC_HOURS,
  TARGET_HOURS_NY,
  hourInNY,
  isAthenaTargetHourInNY,
  isTargetHourInNY,
  shouldRunAthenaSync,
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

/** Même parade pour le sync DIRECT Athena (chaîne émancipée de GitHub) :
 *  depuis #570, la passe utile est celle de la minute :56 de l'heure qui
 *  PRÉCÈDE l'édition — heures visées {23,3,7,11,15,19} à New York, pour que le
 *  build soit fini autour de l'heure pile plutôt que 18 minutes après. */
function firedAthenaHoursNY(dateISO: string): number[] {
  // On compte les déclenchements d'une JOURNÉE DE NEW YORK, pas d'une journée
  // UTC : depuis #570 la première passe vise 23h locales, dont l'heure UTC
  // tombe le lendemain une partie de l'année. Compter par fenêtre UTC ferait
  // apparaître un trou là où il n'y en a pas. On balaie donc deux journées
  // UTC et on ne garde que ce qui tombe le jour NY demandé.
  const jourNY = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const veille = new Date(`${dateISO}T00:00:00Z`);
  veille.setUTCDate(veille.getUTCDate() - 1);
  const lendemain = new Date(`${dateISO}T00:00:00Z`);
  lendemain.setUTCDate(lendemain.getUTCDate() + 1);
  const jours = [veille, new Date(`${dateISO}T00:00:00Z`), lendemain].map(
    (d) => d.toISOString().slice(0, 10),
  );
  return jours
    .flatMap((j) =>
      ATHENA_REGISTERED_UTC_HOURS.map(
        (h) => new Date(`${j}T${String(h).padStart(2, "0")}:56:00Z`),
      ),
    )
    .filter((d) => jourNY(d) === dateISO)
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

  it("la passe :56 déclenche le sync, la passe :10 aussi, et rien d'autre", () => {
    // Le garde ne peut PAS se contenter de l'heure : les deux passes n'ont pas
    // le même calage. C'est le bug que la première version de cette PR
    // introduisait — un cron :56 qu'aucune branche ne lisait, et un filet :10
    // que le garde rejetait. Ici on vérifie les deux passes ET leur exclusivité.
    const aMinute = (iso: string) => new Date(iso);
    // 11h56 à New York en été = 15h56 UTC : passe utile, heure visée 11.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T15:56:00Z"))).toBe(true);
    // 12h10 à New York = 16h10 UTC : passe filet, heure visée 12.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T16:10:00Z"))).toBe(true);
    // 12h56 : ni l'une ni l'autre — 12 n'est pas une heure visée de la passe :56.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T16:56:00Z"))).toBe(false);
    // 11h10 : la passe filet ne vise pas 11 non plus.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T15:10:00Z"))).toBe(false);
    // Une minute qui n'appartient à aucune passe ne déclenche jamais rien.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T15:30:00Z"))).toBe(false);
  });

  it("le filet garde le calage de l'heure DE l'édition", () => {
    // Sinon il ne rattrape rien : il sert précisément les cycles où la cascade
    // n'avait rien publié à :56, donc il doit repasser APRÈS l'heure d'édition.
    expect([...ATHENA_FILET_HOURS_NY].sort((a, b) => a - b)).toEqual([0, 4, 8, 12, 16, 20]);
    expect(ATHENA_FILET_REGISTERED_UTC_HOURS).toHaveLength(ATHENA_FILET_HOURS_NY.length * 2);
  });

  it("vise l'heure qui PRÉCÈDE chaque édition, pour finir le build à l'heure pile", () => {
    // Les éditions tombent à {0,4,8,12,16,20} heure de Montréal. Chaque heure
    // visée doit être l'heure d'AVANT : sync à 11h56 pour l'édition du midi.
    const editions = [0, 4, 8, 12, 16, 20];
    const attendu = editions.map((h) => (h + 23) % 24).sort((a, b) => a - b);
    expect([...ATHENA_TARGET_HOURS_NY].sort((a, b) => a - b)).toEqual(attendu);
  });

  it("ne saute ni ne double aucune exécution les nuits de bascule", () => {
    expect(firedAthenaHoursNY("2026-11-01")).toHaveLength(ATHENA_TARGET_HOURS_NY.length);
    expect(firedAthenaHoursNY("2027-03-08")).toHaveLength(ATHENA_TARGET_HOURS_NY.length);
  });

  it("écarte bien la moitié des déclenchements enregistrés", () => {
    expect(ATHENA_REGISTERED_UTC_HOURS).toHaveLength(ATHENA_TARGET_HOURS_NY.length * 2);
  });
});
