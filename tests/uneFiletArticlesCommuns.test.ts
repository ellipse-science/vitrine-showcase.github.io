// Filet « articles communs » de la Une des Unes (`articlesCommuns`).
//
// Cas réel du 4 nov. 2026 : le suivi des storylines a scindé les élections de
// mi-mandat américaines en deux storylines. Leurs titres ne partagent que deux
// mots (« démocrates », « chambre »), sous le minimum de trois de `sameStory` :
// la Une affichait deux cartes pour la même nouvelle. Les deux storylines
// partageaient pourtant 7 articles hors pages en direct.

import { describe, it, expect } from "vitest";
import {
  storiesFrom24h, articlesCommuns, normaliserUrl, estPageEnDirect,
} from "@/lib/data/heroSelectionCore";
import type { RawEvent } from "@/lib/data/heroSelectionCore";

const LIVE_RC = "https://ici.radio-canada.ca/info/en-direct/1014618/elections-mi-mandat-etats-unis-trump-vote";
const LIVE_CBC = "https://www.cbc.ca/news/world/livestory/us-midterm-election-results-live-updates-2026-9.7403367";
const LIVE_FOX = "https://www.foxnews.com/live-news/election-day-results-11-3-2026";
const A1 = "https://nationalpost.com/news/us-midterm-elections-results/";
const A2 = "https://ici.radio-canada.ca/info/long-format/2296294/etats-unis-resultats-elections-mi-mandat-2026";
const A3 = "https://www.ctvnews.ca/world/america-votes/article/power-shifts-in-washington-as-the-house-flips-and-senate-gains-mount-us-media-report/";

function evt(sid: string, interval: string, title: string, urls: string[], qc: number): RawEvent {
  return {
    date_utc: "2026-11-04", time_interval_utc: interval, event_id: `${sid}-${interval}`,
    storyline_id: sid, title, target_region: "QC", country_id: "CAN",
    score_qc: qc, salience_index_qc: qc / 100, score_roc: 0, salience_index_roc: 0,
    media_ids_qc: '["LED","LAP"]', media_ids_roc: "[]",
    articles: JSON.stringify(urls.map((url, i) => ({ url, media_id: `M${i}` }))),
  } as unknown as RawEvent;
}

const titreA = "Vague bleue : les démocrates reprennent le Sénat et la Chambre";
const titreB = "Mi-mandat américain: les démocrates ravissent la Chambre aux républicains";

describe("normaliserUrl et estPageEnDirect", () => {
  it("ramène deux écritures d'un même article à la même clé", () => {
    expect(normaliserUrl("https://www.lapresse.ca/actualites/x.php?utm=1#haut"))
      .toBe(normaliserUrl("http://lapresse.ca/actualites/x.php/"));
  });

  it("reconnaît les pages en direct par leur chemin, pas par leur hôte", () => {
    expect(estPageEnDirect(normaliserUrl(LIVE_RC))).toBe(true);
    expect(estPageEnDirect(normaliserUrl(LIVE_CBC))).toBe(true);
    expect(estPageEnDirect(normaliserUrl(LIVE_FOX))).toBe(true);
    expect(estPageEnDirect(normaliserUrl("https://livenews.example.com/politique/article"))).toBe(false);
    expect(estPageEnDirect(normaliserUrl("https://www.ledevoir.com/culture/delivery-1234"))).toBe(false);
    expect(estPageEnDirect(normaliserUrl(A3))).toBe(false);
  });
});

describe("articlesCommuns", () => {
  it("exige au moins trois articles communs", () => {
    const a = new Set(["a", "b", "c", "x"]);
    expect(articlesCommuns(a, new Set(["a", "b", "y"]))).toBe(false);
    expect(articlesCommuns(a, new Set(["a", "b", "c"]))).toBe(true);
  });
});

describe("storiesFrom24h — deux storylines d'une même nouvelle", () => {
  it("réunit deux storylines qui partagent trois articles hors direct", () => {
    const stories = storiesFrom24h([
      evt("story-donald-trump-67c90133", "08-12", titreA, [A1, A2, A3, LIVE_RC], 290),
      evt("story-alaska-18e90c41", "00-04", titreB, [A1, A2, A3, LIVE_CBC], 205),
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0].label).toBe(titreA); // l'hôte = la storyline la plus saillante
  });

  it("ne réunit pas deux storylines liées seulement par des pages en direct", () => {
    const stories = storiesFrom24h([
      evt("story-donald-trump-67c90133", "08-12", titreA, [LIVE_RC, LIVE_CBC, LIVE_FOX, A1], 290),
      evt("story-alaska-18e90c41", "00-04", titreB, [LIVE_RC, LIVE_CBC, LIVE_FOX, A2], 205),
    ]);
    expect(stories).toHaveLength(2);
  });

  it("ne réunit pas deux histoires qui ne partagent que deux articles", () => {
    const stories = storiesFrom24h([
      evt("story-donald-trump-67c90133", "08-12", titreA, [A1, A2, "https://exemple.ca/a"], 290),
      evt("story-alaska-18e90c41", "00-04", titreB, [A1, A2, "https://exemple.ca/b"], 205),
    ]);
    expect(stories).toHaveLength(2);
  });
});
