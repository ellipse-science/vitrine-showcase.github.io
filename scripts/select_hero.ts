// Désigne la Une n°1 — celle que le site affichera en hero — et l'écrit dans
// public/data/hero-selection.json, pour que `generate_art.py` illustre la BONNE
// histoire (issue #259).
//
// POURQUOI CE SCRIPT EXISTE
// Le script d'illustration re-calculait la Une n°1 de son côté : dernier bloc
// seulement, puis `score_qc` brut le plus haut. Le site, lui, classe sur la
// fenêtre 24 h avec pondération de récence, après fusion des storylines et
// seuil éditorial. Les deux ont divergé à mesure que le classement du site
// évoluait — et la divergence est devenue STRUCTURELLE : la Une n°1 est absente
// du bloc courant environ 38 % du temps (mesuré sur l'historique DEV), et dans
// ces cas-là le script d'art ne POUVAIT PAS la choisir, puisqu'il ne regardait
// que ce bloc.
//
// Ici, aucune ré-implémentation : on appelle les mêmes fonctions que le loader
// du site (`uniqueQcEvents` → `storiesFrom24h` → `selectTopUnes`). Si un jour le
// classement change, l'illustration suit sans qu'on ait à y penser.
import fs from "node:fs";
import path from "node:path";

import { uniqueQcEvents, __test__, type RawEvent } from "@/lib/data/headlineEvents";

const { storiesFrom24h, selectTopUnes } = __test__;

const DATA = path.resolve(process.cwd(), "public", "data", "headline-events.json");
const OUT = path.resolve(process.cwd(), "public", "data", "hero-selection.json");

function main() {
  let raw: string;
  try {
    raw = fs.readFileSync(DATA, "utf8");
  } catch {
    console.error(`select_hero: ${DATA} introuvable — rien à écrire.`);
    process.exit(1);
  }

  const stories = storiesFrom24h(uniqueQcEvents(JSON.parse(raw) as RawEvent[]));
  const hero = selectTopUnes(stories)[0];
  if (!hero) {
    console.error("select_hero: aucune Une sélectionnée — rien à écrire.");
    process.exit(1);
  }

  // `rep` = l'occurrence de l'histoire dans le bloc le plus récent où elle est
  // présente ; c'est elle qui porte le titre et les articles que le site affiche.
  const rep = hero.rep;
  const selection = {
    event_id: rep.event_id,
    storyline_id: rep.storyline_id ?? null,
    title: rep.title ?? null,
    main_issue: rep.main_issue ?? null,
    date_utc: rep.date_utc,
    time_interval_utc: rep.time_interval_utc,
    // Traces de contrôle : permettent de voir, dans le JSON commité, si le hero
    // vient d'un bloc antérieur au bloc courant (le cas fréquent).
    sum_qc: Number(hero.sumQc.toFixed(3)),
    peak_qc: Number(hero.peakQc.toFixed(3)),
  };

  fs.writeFileSync(OUT, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
  console.log(
    `select_hero: ${selection.title} (${selection.date_utc} ${selection.time_interval_utc}, sumQc ${selection.sum_qc})`,
  );
}

main();
