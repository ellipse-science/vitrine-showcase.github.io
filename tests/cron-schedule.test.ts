import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ATHENA_FILET_HOURS_NY,
  ATHENA_FILET_REGISTERED_UTC_HOURS,
  ATHENA_REGISTERED_UTC_HOURS,
  ATHENA_SYNC_MINUTES,
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
 *  depuis le calage du 09-09 (#570), la passe utile est celle de la minute :02
 *  de l'heure DE l'édition — heures visées {0,4,8,12,16,20} à New York. À :56
 *  de l'heure précédente, elle lisait trois minutes après le raffineur, donc
 *  avant que Glue/Athena ait rattrapé : le build affichait l'édition d'avant. */
function firedAthenaHoursNY(dateISO: string): number[] {
  // On compte les déclenchements d'une JOURNÉE DE NEW YORK, pas d'une journée
  // UTC : la passe de 20h locales tombe le lendemain en UTC une partie de
  // l'année. Compter par fenêtre UTC ferait apparaître un trou là où il n'y en
  // a pas. On balaie donc deux journées UTC et on ne garde que ce qui tombe le
  // jour NY demandé.
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
        (h) => new Date(`${j}T${String(h).padStart(2, "0")}:02:00Z`),
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

  it("la passe :02 déclenche le sync, le filet :20 aussi, et rien d'autre", () => {
    // Le garde lit la minute AVANT de juger l'heure. Les deux passes visent
    // désormais les mêmes heures, mais l'ancien calage :56 — celui qui lisait
    // trois minutes après le raffineur — ne doit plus rien déclencher.
    const aMinute = (iso: string) => new Date(iso);
    // 12h02 à New York en été = 16h02 UTC : passe utile, heure visée 12.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T16:02:00Z"))).toBe(true);
    // 12h20 à New York = 16h20 UTC : passe filet, même heure visée.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T16:20:00Z"))).toBe(true);
    // 11h02 : 11 n'est pas une heure d'édition — ni l'une ni l'autre.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T15:02:00Z"))).toBe(false);
    // L'ANCIEN calage :56 est bien retiré, sur les deux heures qu'il visait.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T15:56:00Z"))).toBe(false);
    expect(shouldRunAthenaSync(aMinute("2026-08-19T16:56:00Z"))).toBe(false);
    // Et l'ancien filet :10 aussi.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T16:10:00Z"))).toBe(false);
    // Une minute qui n'appartient à aucune passe ne déclenche jamais rien.
    expect(shouldRunAthenaSync(aMinute("2026-08-19T16:30:00Z"))).toBe(false);
  });

  it("le filet garde le calage de l'heure DE l'édition", () => {
    // Sinon il ne rattrape rien : il sert précisément les cycles où la cascade
    // n'avait rien publié à :02, donc il doit repasser APRÈS l'heure d'édition.
    expect([...ATHENA_FILET_HOURS_NY].sort((a, b) => a - b)).toEqual([0, 4, 8, 12, 16, 20]);
    expect(ATHENA_FILET_REGISTERED_UTC_HOURS).toHaveLength(ATHENA_FILET_HOURS_NY.length * 2);
  });

  it("vise l'heure DE chaque édition, après la publication du raffineur", () => {
    // Les éditions tombent à {0,4,8,12,16,20} heure de Montréal, et le
    // raffineur publie vers :53 — donc APRÈS lui : sync à 12h02 pour l'édition
    // du midi. Viser l'heure d'avant, c'était lire le bloc précédent.
    const editions = [0, 4, 8, 12, 16, 20];
    expect([...ATHENA_TARGET_HOURS_NY].sort((a, b) => a - b)).toEqual(editions);
  });

  it("ne saute ni ne double aucune exécution les nuits de bascule", () => {
    expect(firedAthenaHoursNY("2026-11-01")).toHaveLength(ATHENA_TARGET_HOURS_NY.length);
    expect(firedAthenaHoursNY("2027-03-08")).toHaveLength(ATHENA_TARGET_HOURS_NY.length);
  });

  it("écarte bien la moitié des déclenchements enregistrés", () => {
    expect(ATHENA_REGISTERED_UTC_HOURS).toHaveLength(ATHENA_TARGET_HOURS_NY.length * 2);
  });

  it("laisse au moins cinq minutes entre la publication du raffineur et la lecture", () => {
    // LE CŒUR DU CORRECTIF DU 09-09, et la seule ligne de ce fichier dont la
    // violation coûte une heure de retard à chaque édition.
    //
    // Le dernier étage de la cascade publie `headline_events_4h` vers :53. En
    // deçà de cinq minutes, Glue/Athena n'a pas rattrapé : la passe lit encore
    // le bloc PRÉCÉDENT, le build est bâti dessus, et le site n'affiche la
    // bonne édition qu'au passage du filet GitHub de :50. C'est exactement ce
    // que faisait le calage :56 — trois minutes — mesuré le 2026-09-09.
    //
    // La même contrainte des cinq minutes vaut partout ailleurs dans
    // l'écosystème entre un raffineur et la lecture qui suit.
    const PUBLICATION_RAFFINEUR = 53; // minute, dans l'heure qui précède l'édition
    const DELAI_MINIMAL = 5; // minutes
    const [passeUtile] = ATHENA_SYNC_MINUTES;
    // La passe utile tombe à l'heure DE l'édition, le raffineur à l'heure d'avant.
    const ecart = 60 - PUBLICATION_RAFFINEUR + passeUtile;
    expect(ecart).toBeGreaterThanOrEqual(DELAI_MINIMAL);
  });
});


/** Le garde-fou qui manquait : `schedule.ts` décide, mais c'est `wrangler.toml`
 *  qui déclenche. Les deux se répètent — douze heures UTC et deux minutes — et
 *  rien jusqu'ici ne vérifiait qu'ils disent la même chose. Une divergence est
 *  MUETTE : le Worker ne s'exécute simplement plus aux bonnes heures, et on ne
 *  l'apprend qu'en regardant le site. C'est le risque principal de tout
 *  recalage, celui du 09-09 compris. */
describe("wrangler.toml et schedule.ts disent la même chose", () => {
  const crons = readFileSync("workers/api/wrangler.toml", "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^"\d+ [\d,]+ \* \* \*",?$/.test(l))
    .map((l) => {
      const [minute, heures] = l.replace(/^"|",?$/g, "").split(" ");
      return { minute: Number(minute), heures: heures.split(",").map(Number) };
    });

  it("déclare une passe, et une seule, pour chaque minute du sync Athena", () => {
    // On ne compte PAS les crons du fichier : un cron étranger au sync Athena
    // (un rollback :00, un futur déclencheur) est légitime et ne doit pas
    // faire échouer ce test. Il serait d'ailleurs inoffensif —
    // `shouldRunAthenaSync` ne répond vrai que sur ces minutes-là.
    for (const minute of ATHENA_SYNC_MINUTES) {
      expect(crons.filter((c) => c.minute === minute)).toHaveLength(1);
    }
  });

  it("enregistre pour chaque passe les heures UTC que le code attend", () => {
    const [minuteUtile, minuteFilet] = ATHENA_SYNC_MINUTES;
    const heuresDe = (m: number) =>
      [...(crons.find((c) => c.minute === m)?.heures ?? [])].sort((a, b) => a - b);
    expect(heuresDe(minuteUtile)).toEqual([...ATHENA_REGISTERED_UTC_HOURS].sort((a, b) => a - b));
    expect(heuresDe(minuteFilet)).toEqual(
      [...ATHENA_FILET_REGISTERED_UTC_HOURS].sort((a, b) => a - b),
    );
  });
});
