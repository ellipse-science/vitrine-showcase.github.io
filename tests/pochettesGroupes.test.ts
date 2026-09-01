import { describe, expect, it } from "vitest";

import { groupeParAlbums, groupeParDiscographie, singlesParEcoute } from "@/lib/data/pochettes";
import type { JourFonds, PochetteArchivee } from "@/lib/data/pochettes";

// `groupeParAlbums`/`groupeParDiscographie`/`singlesParEcoute` sont des
// fonctions PURES sur `fonds` déjà chargé : contrairement à `loadPochettes`,
// elles ne touchent jamais au système de fichiers, et s'éprouvent donc
// directement sur un jeu construit à la main.

function pochette(over: Partial<PochetteArchivee> & { parti: PochetteArchivee["parti"] }): PochetteArchivee {
  return {
    sigle: over.parti.toUpperCase(),
    couleur: "#A03440",
    rang: 1,
    minutesUne: 60,
    tempsLabel: "1h",
    partPct: 30,
    enjeu: "Économie",
    ton: "Neutre",
    tonPct: 50,
    chiffres: true,
    ...over,
  };
}

const formatJour = (iso: string) => {
  // Un formateur minimal, calqué sur `formatDateFr` : « Samedi 22 août 2026 ».
  // Le nom du jour est un mot quelconque ici — seul compte qu'il y en ait un à
  // retirer, ce que `sansNomDeJour` (privé) doit savoir faire.
  const [, m, d] = iso.split("-");
  return `Jour ${Number(d)}/${m} 2026`;
};

// DEUX SEMAINES : celle du 22 (sam.) au 28 août (ven.), et celle du 29 août
// (sam.) au 4 septembre. Le CAQ publie dans les deux, le PQ dans une seule.
const FONDS: JourFonds[] = [
  { jour: "2026-08-22", jourLabel: "Samedi 22 août 2026", servi: true, pochettes: [
    pochette({ parti: "caq", minutesUne: 40 }),
    pochette({ parti: "pq", minutesUne: 90 }),
  ] },
  { jour: "2026-08-24", jourLabel: "Lundi 24 août 2026", servi: true, pochettes: [
    pochette({ parti: "caq", minutesUne: 100 }),
  ] },
  { jour: "2026-08-28", jourLabel: "Vendredi 28 août 2026", servi: true, pochettes: [
    pochette({ parti: "caq", minutesUne: 20 }),
    pochette({ parti: "pq", minutesUne: 10 }),
  ] },
  { jour: "2026-08-29", jourLabel: "Samedi 29 août 2026", servi: true, pochettes: [
    pochette({ parti: "caq", minutesUne: 15 }),
  ] },
];

describe("groupeParAlbums", () => {
  const albums = groupeParAlbums(FONDS, formatJour);

  it("un album par (parti, semaine) — pas un de plus", () => {
    // CAQ a trois singles dans la semaine du 22, un dans celle du 29 : deux
    // albums. PQ n'a que la semaine du 22 : un album. Total attendu : 3.
    expect(albums.length).toBe(3);
  });

  it("regroupe les journées d'une même semaine, sans en inventer", () => {
    const caqSemaine22 = albums.find((a) => a.parti === "caq" && a.semaineDebut === "2026-08-22")!;
    expect(caqSemaine22.pistes.length).toBe(3);
    expect(caqSemaine22.pistes.map((p) => p.jour).sort()).toEqual([
      "2026-08-22", "2026-08-24", "2026-08-28",
    ]);
  });

  it("une semaine en cours reste COURTE — pas un album à sept forcé", () => {
    // La semaine du 29 n'a qu'un seul jour dans le jeu : l'album doit rester à
    // une piste, jamais complété par des titres inventés.
    const caqSemaine29 = albums.find((a) => a.parti === "caq" && a.semaineDebut === "2026-08-29")!;
    expect(caqSemaine29.pistes.length).toBe(1);
  });

  it("classe les pistes en ORDRE D'ÉCOUTE, pas par date", () => {
    const caqSemaine22 = albums.find((a) => a.parti === "caq" && a.semaineDebut === "2026-08-22")!;
    // 100 (24 août) devant 40 (22 août) devant 20 (28 août) : l'ordre du
    // calendrier aurait donné 22, 24, 28 — ce n'est pas ce qu'on attend.
    expect(caqSemaine22.pistes.map((p) => p.minutesUne)).toEqual([100, 40, 20]);
  });

  it("somme les minutes de la semaine, pour classer les albums entre eux", () => {
    const caqSemaine22 = albums.find((a) => a.parti === "caq" && a.semaineDebut === "2026-08-22")!;
    expect(caqSemaine22.totalMinutes).toBe(40 + 100 + 20);
  });

  it("la semaine la plus RÉCENTE d'abord, puis l'album le plus écouté", () => {
    // La semaine du 29 (même à une seule piste) précède celle du 22.
    expect(albums[0].semaineDebut).toBe("2026-08-29");
    // Dans la semaine du 22, CAQ (160 min) devant PQ (100 min).
    expect(albums[1].parti).toBe("caq");
    expect(albums[2].parti).toBe("pq");
  });

  it("l'étiquette de semaine ne répète pas le nom du jour", () => {
    const caqSemaine22 = albums.find((a) => a.parti === "caq" && a.semaineDebut === "2026-08-22")!;
    expect(caqSemaine22.semaineLabel).toBe("du 22/08 2026 au 28/08 2026");
  });
});

describe("groupeParDiscographie", () => {
  const discos = groupeParDiscographie(FONDS);

  it("une discographie par parti, tous ses singles confondus", () => {
    expect(discos.length).toBe(2);
    const caq = discos.find((d) => d.parti === "caq")!;
    expect(caq.pistes.length).toBe(4); // les trois de la semaine du 22 + celle du 29
  });

  it("classe les pistes en ORDRE D'ÉCOUTE sur TOUTE la campagne", () => {
    const caq = discos.find((d) => d.parti === "caq")!;
    expect(caq.pistes.map((p) => p.minutesUne)).toEqual([100, 40, 20, 15]);
  });

  it("le parti le plus écouté de la campagne entière en tête", () => {
    // CAQ : 40+100+20+15 = 175. PQ : 90+10 = 100.
    expect(discos[0].parti).toBe("caq");
    expect(discos[0].totalMinutes).toBe(175);
    expect(discos[1].parti).toBe("pq");
    expect(discos[1].totalMinutes).toBe(100);
  });
});

describe("singlesParEcoute", () => {
  const singles = singlesParEcoute(FONDS);

  it("TOUS les singles, un par (parti, jour) — aucun groupé", () => {
    // 2 + 1 + 2 + 1 = 6 pochettes dans FONDS, un single chacune : la vue Jour
    // ne compile plus les partis d'une même journée depuis le 2026-09-05.
    expect(singles.length).toBe(6);
  });

  it("classés en ORDRE D'ÉCOUTE, tous partis et toutes journées mélangés", () => {
    expect(singles.map((s) => s.minutesUne)).toEqual([100, 90, 40, 20, 15, 10]);
  });

  it("ne groupe NI par jour NI par parti — chaque single garde son propre jour et son propre parti", () => {
    expect(singles.map((s) => `${s.parti}/${s.jour}`)).toEqual([
      "caq/2026-08-24",
      "pq/2026-08-22",
      "caq/2026-08-22",
      "caq/2026-08-28",
      "caq/2026-08-29",
      "pq/2026-08-28",
    ]);
  });

  it("chaque single garde sa date en toutes lettres, comme dans un album ou une discographie", () => {
    const premier = singles[0];
    expect(premier.jourLabel).toBe("Lundi 24 août 2026");
    expect(premier.jourCourt).toBe("24 août");
  });
});
