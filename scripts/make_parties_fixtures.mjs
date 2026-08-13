// Génère un jeu de données FICTIF pour le module « Partis et couverture ».
//
// Pourquoi : la donnée réelle est actuellement dégénérée — un seul parti
// franchit son seuil de détection, donc il rafle 100 % de la part de voix et
// les quatre autres tombent à zéro (aws-refiners#223, #248). Impossible de
// juger un changement visuel là-dessus. Ce script fabrique une donnée saine,
// au MÊME schéma que le raffineur radar-party-score-salient-shadow.
//
// Ce n'est PAS de la donnée réelle et ça ne doit jamais finir dans public/data/
// (règle dure #1 : ce dossier est généré par scripts/fetch_data.R). Chaque ligne
// porte un champ `_fictif: true` pour qu'aucune confusion ne soit possible.
//
// Produit AUSSI les tables ventilées par média (*_by_media_*), au même schéma
// que celles du raffineur — chaque média y a un penchant, sinon un sélecteur
// de média n'aurait rien à montrer.
//
// Usage :
//   node scripts/make_parties_fixtures.mjs            # profil réaliste
//   node scripts/make_parties_fixtures.mjs --dense    # 12 points par courbe
//
// Puis, pour développer avec :
//   VITRINE_PARTIES_FIXTURES=fixtures/parties npm run dev

import fs from "node:fs/promises";
import path from "node:path";

const DENSE = process.argv.includes("--dense");
const OUT_DIR = path.resolve(process.cwd(), "fixtures", "parties");

// Ancre temporelle fixe : un jeu de test qui change tout seul chaque jour ne
// permet pas de comparer deux captures d'écran à une semaine d'intervalle.
const TODAY = "2026-08-13";

const PARTIES = ["CAQ", "PQ", "PLQ", "QS", "PCQ"];

// Panel de médias, repris des identifiants réels de radar_annotated. Chaque
// média a un PENCHANT : un multiplicateur par parti, qui décale sa répartition
// par rapport à la moyenne. Sans ça, un sélecteur de média n'aurait rien à
// montrer — toutes les positions se ressembleraient.
// Identifiants RÉELS, relevés dans radar_annotated le 2026-08-13. Tous sont
// country_id = QC : le Globe and Mail (GAM) en a été retiré, c'est un journal
// CANADIEN et ce module porte sur les partis PROVINCIAUX.
const MEDIAS = {
  RCI: { label: "Radio-Canada",        penchant: { CAQ: 0.9,  PQ: 1.15, PLQ: 1.0,  QS: 1.2,  PCQ: 0.6 } },
  LAP: { label: "La Presse",           penchant: { CAQ: 0.95, PQ: 1.1,  PLQ: 1.05, QS: 1.1,  PCQ: 0.7 } },
  LED: { label: "Le Devoir",           penchant: { CAQ: 0.85, PQ: 1.2,  PLQ: 0.95, QS: 1.35, PCQ: 0.5 } },
  JDM: { label: "Journal de Montréal", penchant: { CAQ: 1.25, PQ: 0.95, PLQ: 0.85, QS: 0.7,  PCQ: 1.6 } },
  TVA: { label: "TVA Nouvelles",       penchant: { CAQ: 1.2,  PQ: 0.9,  PLQ: 0.95, QS: 0.75, PCQ: 1.4 } },
  MG:  { label: "Montreal Gazette",    penchant: { CAQ: 1.05, PQ: 0.7,  PLQ: 1.45, QS: 0.8,  PCQ: 0.9 } },
};
const MEDIA_IDS = Object.keys(MEDIAS);

// Part de voix de fond, avant bruit et avant l'événement scénarisé plus bas.
// Ordre plausible pour l'été 2026 ; la somme n'a pas à faire 1, on normalise.
const BASE_SOV = { PQ: 0.30, CAQ: 0.27, PLQ: 0.18, QS: 0.16, PCQ: 0.09 };

// Ton de fond par parti, dans [-1, 1]. Le module affiche une « série » : une
// suite de jours de même signe. Des tons stables produisent donc des séries
// lisibles, ce qui est justement ce qu'on veut pouvoir regarder.
const BASE_TONE = { PQ: 0.18, CAQ: -0.24, PLQ: 0.02, QS: 0.12, PCQ: -0.15 };

// Générateur pseudo-aléatoire à graine fixe (mulberry32) : deux exécutions
// donnent le même fichier, donc un diff vide tant qu'on ne change pas le script.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoDate, n) => {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const round4 = (v) => Math.round(v * 10000) / 10000;

/** Jours consécutifs se terminant à TODAY (inclus). */
function dailyDates(n) {
  return Array.from({ length: n }, (_, i) => addDays(TODAY, -(n - 1 - i)));
}

/** Deux dates par semaine ISO, sur `weeks` semaines — de quoi peupler la
 *  courbe hebdomadaire, qui ne retient que la DERNIÈRE date de chaque semaine. */
function weeklyDates(weeks) {
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    out.push(addDays(TODAY, -(w * 7 + 3)));
    out.push(addDays(TODAY, -(w * 7)));
  }
  return [...new Set(out)].sort();
}

/** Deux dates par mois, sur `months` mois — même logique pour la courbe
 *  mensuelle, qui ne retient que la dernière date de chaque mois. */
function monthlyDates(months) {
  const out = [];
  for (let m = months - 1; m >= 0; m--) {
    const d = new Date(TODAY + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - m);
    const mid = new Date(d); mid.setUTCDate(14);
    out.push(iso(mid));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    out.push(iso(end));
  }
  // Le mois courant est BORNÉ à aujourd'hui, pas supprimé : en production le
  // raffineur publie chaque jour du mois en cours, mais rien pour demain.
  // (Filtrer au lieu de borner ferait disparaître le mois courant du fichier.)
  return [...new Set(out.map((d) => (d > TODAY ? TODAY : d)))].sort();
}

/**
 * Part de voix d'un parti à une date, normalisée ensuite sur l'ensemble.
 *
 * Deux éléments scénarisés, pour que la visualisation ait quelque chose à
 * montrer plutôt que cinq barres plates :
 *  - une poussée de la CAQ sur les ~8 derniers jours (crise médiatique),
 *    qui creuse aussi son ton ;
 *  - le PCQ qui passe sous les 2 % en fin de période, ce qui le fait basculer
 *    dans « Dans l'ombre médiatique » — le chemin d'affichage qu'on ne voit
 *    jamais autrement.
 */
function sovFor(party, date, rand, daysFromEnd) {
  let v = BASE_SOV[party] * (0.82 + 0.36 * rand());
  if (party === "CAQ" && daysFromEnd <= 8) v *= 1 + 0.55 * (1 - daysFromEnd / 8);
  if (party === "PCQ" && daysFromEnd <= 5) v *= 0.12;
  return v;
}

function toneFor(party, rand, daysFromEnd) {
  let t = BASE_TONE[party] + (rand() - 0.5) * 0.14;
  if (party === "CAQ" && daysFromEnd <= 8) t -= 0.28 * (1 - daysFromEnd / 8);
  return Math.max(-1, Math.min(1, t));
}

/** Construit les lignes pour une liste de dates, part de voix normalisée à 1
 *  par date — c'est le contrat du raffineur : weighted_mentions EST déjà une
 *  part de voix (0–1) dont la somme fait 1 sur les partis provinciaux. */
/** Lignes ventilées PAR MÉDIA — la part de voix y est normalisée DANS chaque
 *  média, comme le fait le raffineur. Volontairement PAS la moyenne des
 *  médias : l'agrégat est pondéré par le volume de chacun. */
function buildRowsByMedia(dates, seed, periodLabel) {
  const rand = rng(seed);
  const rows = [];
  const lastIdx = dates.length - 1;

  dates.forEach((date, i) => {
    const daysFromEnd = lastIdx - i;
    for (const mid of MEDIA_IDS) {
      const pen = MEDIAS[mid].penchant;
      const raw = {};
      for (const p of PARTIES) raw[p] = sovFor(p, date, rand, daysFromEnd) * pen[p];
      const total = Object.values(raw).reduce((s, v) => s + v, 0);

      for (const p of PARTIES) {
        const sov = raw[p] / total;
        rows.push({
          party: p,
          media_id: mid,
          date_utc: date,
          date_montreal_tz: date,
          weighted_mentions: round4(sov),
          total_raw_score: round4(sov * (periodLabel === "day" ? 70 : periodLabel === "week" ? 430 : 1800)),
          weighted_tone: round4(toneFor(p, rand, daysFromEnd)),
          threshold: 0.02,
          period_start: dates[0],
          period_end: date,
          computed_at: `${date}T19:05:00Z`,
          _fictif: true,
        });
      }
    }
  });

  return rows;
}

function buildRows(dates, seed, periodLabel) {
  const rand = rng(seed);
  const rows = [];
  const lastIdx = dates.length - 1;

  dates.forEach((date, i) => {
    const daysFromEnd = lastIdx - i;
    const raw = {};
    for (const p of PARTIES) raw[p] = sovFor(p, date, rand, daysFromEnd);
    const total = Object.values(raw).reduce((s, v) => s + v, 0);

    for (const p of PARTIES) {
      const sov = raw[p] / total;
      rows.push({
        party: p,
        date_utc: date,
        date_montreal_tz: date,
        weighted_mentions: round4(sov),
        // Minutes cumulées en Une — proportionnelles à la part de voix, avec
        // un volume total plausible pour une journée de Unes québécoises.
        total_raw_score: round4(sov * (periodLabel === "day" ? 420 : periodLabel === "week" ? 2600 : 11000)),
        weighted_tone: round4(toneFor(p, rand, daysFromEnd)),
        variation_pct: round4((rand() - 0.5) * 40),
        threshold: 0.02,
        period_start: dates[0],
        period_end: date,
        computed_at: `${date}T19:05:00Z`,
        _fictif: true,
      });
    }
  });

  return rows;
}

const PROFILE = DENSE
  ? { day: 35, weeks: 12, months: 12 }
  : { day: 35, weeks: 6, months: 3 };

const D = dailyDates(PROFILE.day);
const W = weeklyDates(PROFILE.weeks);
const M = monthlyDates(PROFILE.months);

const files = [
  ["day", "provincial_parties_salient_shadow_day.json", buildRows(D, 1, "day")],
  ["week", "provincial_parties_salient_shadow_week.json", buildRows(W, 2, "week")],
  ["month", "provincial_parties_salient_shadow_month.json", buildRows(M, 3, "month")],
  ["day", "provincial_parties_salient_shadow_by_media_day.json", buildRowsByMedia(D, 11, "day")],
  ["week", "provincial_parties_salient_shadow_by_media_week.json", buildRowsByMedia(W, 12, "week")],
  ["month", "provincial_parties_salient_shadow_by_media_month.json", buildRowsByMedia(M, 13, "month")],
];

for (const [sub, name, rows] of files) {
  const dir = path.join(OUT_DIR, sub);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), JSON.stringify(rows, null, 2) + "\n", "utf8");
  const dates = [...new Set(rows.map((r) => r.date_utc))];
  console.log(`${sub.padEnd(6)} ${String(rows.length).padStart(4)} lignes  ${String(dates.length).padStart(3)} dates  ${dates[0]} → ${dates[dates.length - 1]}`);
}

console.log(`\nProfil : ${DENSE ? "dense (12 points par courbe)" : "réaliste (même rareté qu'en production)"}`);
console.log("Écrit dans fixtures/parties/ — données FICTIVES, jamais dans public/data/.");
console.log("\nPour développer avec :\n  VITRINE_PARTIES_FIXTURES=fixtures/parties npm run dev");
