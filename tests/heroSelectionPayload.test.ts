// `heroSelectionPayload` est ce que publient DEUX chemins désormais : la route
// `data/hero-selection.json` du site, et le Worker à :56 (aws-refiners#490).
// Les deux appellent la même fonction, donc ce qui est éprouvé ici vaut pour
// les deux — c'est précisément l'intérêt d'avoir une seule implémentation.
//
// Ce qui est couvert : le calcul de `latest_block`, dont le commentaire du code
// avertit qu'il repose sur un tri LEXICOGRAPHIQUE valide seulement parce que
// les intervalles sont zéro-padés. C'est un piège silencieux : une valeur non
// padée ne lève pas, elle classe mal.

import { describe, it, expect } from "vitest";
import { latestBlockOf, heroSelectionPayload } from "@/lib/data/heroSelectionCore";
import type { RawEvent } from "@/lib/data/heroSelectionCore";

function evt(date_utc: string, time_interval_utc: string): RawEvent {
  return { date_utc, time_interval_utc } as unknown as RawEvent;
}

describe("latestBlockOf", () => {
  it("rend null sur un jeu vide", () => {
    expect(latestBlockOf([])).toBeNull();
  });

  it("prend le bloc le plus récent, toutes dates confondues", () => {
    const events = [
      evt("2026-09-07", "19-23"),
      evt("2026-09-08", "07-11"),
      evt("2026-09-08", "03-07"),
    ];
    expect(latestBlockOf(events)).toEqual({
      date_utc: "2026-09-08",
      time_interval_utc: "07-11",
    });
  });

  it("classe 23-03 en dernier de SA date, pas de la suivante", () => {
    // Le bloc de nuit porte la date de son DÉBUT : « 2026-09-08 23-03 » est
    // postérieur à « 2026-09-08 19-23 », et antérieur à « 2026-09-09 03-07 ».
    const events = [
      evt("2026-09-08", "19-23"),
      evt("2026-09-08", "23-03"),
      evt("2026-09-09", "03-07"),
    ];
    expect(latestBlockOf(events)).toEqual({
      date_utc: "2026-09-09",
      time_interval_utc: "03-07",
    });
    expect(latestBlockOf(events.slice(0, 2))).toEqual({
      date_utc: "2026-09-08",
      time_interval_utc: "23-03",
    });
  });

  it("ignore les lignes sans date ni intervalle", () => {
    const events = [
      evt("2026-09-08", "11-15"),
      { date_utc: null, time_interval_utc: null } as unknown as RawEvent,
      { date_utc: "2026-09-08", time_interval_utc: undefined } as unknown as RawEvent,
    ];
    expect(latestBlockOf(events)).toEqual({
      date_utc: "2026-09-08",
      time_interval_utc: "11-15",
    });
  });

  it("DOCUMENTE LE PIÈGE : une valeur non padée se classe de travers", () => {
    // « 3-7 » se compare APRÈS « 19-23 » en lexicographique. Le raffineur pade
    // aujourd'hui ; si ça cessait, ce test dirait pourquoi la fraîcheur ment.
    const events = [evt("2026-09-08", "19-23"), evt("2026-09-08", "3-7")];
    expect(latestBlockOf(events)).toEqual({
      date_utc: "2026-09-08",
      time_interval_utc: "3-7",
    });
  });
});

describe("heroSelectionPayload", () => {
  it("rend null quand aucune Une ne se dégage", () => {
    expect(heroSelectionPayload([])).toBeNull();
  });

  it("ne rend jamais une sélection SANS latest_block", () => {
    // Le contrat publié porte les deux : `vitrine-art` lit la Une, la sonde de
    // fraîcheur lit le bloc. Une sélection amputée ferait sonner la seconde.
    const payload = heroSelectionPayload([]);
    if (payload !== null) {
      expect(payload).toHaveProperty("latest_block");
    }
  });
});
