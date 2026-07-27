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
// Ici, aucune ré-implémentation : tout le travail est fait par
// `selectHeroFromRawEvents`, l'API PUBLIQUE du loader, qui appelle les mêmes
// fonctions que le rendu du site. Si le classement change un jour,
// l'illustration suit sans qu'on ait à y penser.
import fs from "node:fs";
import path from "node:path";

import { selectHeroFromRawEvents, type RawEvent } from "@/lib/data/headlineEvents";

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

  const selection = selectHeroFromRawEvents(JSON.parse(raw) as RawEvent[]);
  if (!selection) {
    console.error("select_hero: aucune Une sélectionnée — rien à écrire.");
    process.exit(1);
  }

  fs.writeFileSync(OUT, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
  console.log(
    `select_hero: ${selection.title} (${selection.date_utc} ${selection.time_interval_utc}, sumQc ${selection.sum_qc})`,
  );
}

main();
