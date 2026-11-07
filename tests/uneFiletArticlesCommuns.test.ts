// Filet « articles communs » de la Une des Unes (`articlesCommuns`).
//
// Cas réel du 4 nov. 2026 : le suivi a scindé l'événement des élections de
// mi-mandat américaines en deux cycles de vie (`storyline_id`). Leurs titres
// ne partagent que deux mots (« démocrates », « chambre »), sous le minimum de
// trois de `sameStory` : la Une affichait deux cartes pour le même événement.
// Les deux cycles de vie partageaient pourtant 7 articles hors pages en direct.

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

  it("reconnaît les formes de pages en direct des médias du panel", () => {
    for (const u of [
      LIVE_RC, LIVE_CBC, LIVE_FOX,
      "https://www.cnn.com/2026/11/03/politics/live-news/midterm-election-congress",
      "https://www.journaldemontreal.com/2026/11/03/en-direct--les-americains-aux-urnes",
      "https://www.lapresse.ca/sports/hockey/2026-10-31/penguins-4-canadien-5/relisez-notre-couverture-en-direct.php",
      "https://www.theglobeandmail.com/world/article-us-midterm-election-results-live-updates-november-4-2026/",
      "https://www.ctvnews.ca/vancouver/article/bc-has-voted-and-results-are-coming-in-live-real-time-election-updates-here/",
      "https://www.ctvnews.ca/toronto/article/olivia-chow-re-elected-as-torontos-mayor-live-updates-here/",
      "https://www.thestar.com/news/gta/city-hall/toronto-election-live/article_8c8feb8d.html",
      "https://globalnews.ca/news/12112175/bc-election-results-live-numbers-2026-vote/",
    ]) expect(estPageEnDirect(normaliserUrl(u)), u).toBe(true);
  });

  it("ne prend pas pour une page en direct un article ordinaire dont le slug contient « live »", () => {
    for (const u of [
      // Contre-exemple relevé par la revue : un article du Star sur des exercices de tir réel.
      "https://www.thestar.com/news/canada/cfb-wainwright-s-live-fire-drills-went-against-guidance-for-high-risk-fire-months/article_1.html",
      "https://livenews.example.com/politique/article",
      "https://www.ledevoir.com/culture/delivery-1234",
      "https://www.cbc.ca/news/canada/alberta-liveable-cities-ranking-9.1",
      A3,
    ]) expect(estPageEnDirect(normaliserUrl(u)), u).toBe(false);
  });
});

describe("articlesCommuns", () => {
  it("exige au moins trois articles communs", () => {
    const a = new Set(["a", "b", "c", "x"]);
    expect(articlesCommuns(a, new Set(["a", "b", "y"]))).toBe(false);
    expect(articlesCommuns(a, new Set(["a", "b", "c"]))).toBe(true);
  });
});

describe("storiesFrom24h — un événement scindé en deux cycles de vie", () => {
  it("réunit deux cycles de vie qui partagent trois articles hors direct", () => {
    const stories = storiesFrom24h([
      evt("story-donald-trump-67c90133", "08-12", titreA, [A1, A2, A3, LIVE_RC], 290),
      evt("story-alaska-18e90c41", "00-04", titreB, [A1, A2, A3, LIVE_CBC], 205),
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0].label).toBe(titreA); // l'hôte = le cycle de vie le plus saillant
  });

  it("ne réunit pas deux cycles de vie liés seulement par des pages en direct", () => {
    const stories = storiesFrom24h([
      evt("story-donald-trump-67c90133", "08-12", titreA, [LIVE_RC, LIVE_CBC, LIVE_FOX, A1], 290),
      evt("story-alaska-18e90c41", "00-04", titreB, [LIVE_RC, LIVE_CBC, LIVE_FOX, A2], 205),
    ]);
    expect(stories).toHaveLength(2);
  });

  it("ne réunit pas deux événements qui ne partagent que deux articles", () => {
    const stories = storiesFrom24h([
      evt("story-donald-trump-67c90133", "08-12", titreA, [A1, A2, "https://exemple.ca/a"], 290),
      evt("story-alaska-18e90c41", "00-04", titreB, [A1, A2, "https://exemple.ca/b"], 205),
    ]);
    expect(stories).toHaveLength(2);
  });

  it("un cycle de vie « pont » réunit A, B et C sous le plus saillant", () => {
    // A et B ne partagent rien ; C partage 3 articles avec chacun. Ordre de
    // saillance A > B > C : C rejoint A, puis A enrichi absorbe B.
    const a = ["https://ex.ca/1", "https://ex.ca/2", "https://ex.ca/3"];
    const b = ["https://ex.ca/4", "https://ex.ca/5", "https://ex.ca/6"];
    const stories = storiesFrom24h([
      evt("story-a", "08-12", "Grève des enseignants : Québec dépose une offre finale", a, 300),
      evt("story-b", "08-12", "Les syndicats rejettent la proposition du gouvernement Legault", b, 200),
      evt("story-c", "04-08", "Négociations dans le secteur public : où en est-on", [...a, ...b], 100),
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0].label).toBe("Grève des enseignants : Québec dépose une offre finale");
    expect(stories[0].sumQc).toBeGreaterThan(0);
  });
});
