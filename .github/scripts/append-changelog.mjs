// Ajoute une entrée au Journal des mises à jour (static-content/changelog.json)
// au merge d'une PR dans main. Appelé par .github/workflows/version-bump.yml.
//
// Sécurité (pull_request_target) : ce script vient de main, jamais de la
// branche de la PR. Le corps de la PR est une donnée non fiable : il n'est
// jamais évalué, seulement découpé en texte puis écrit dans le JSON (échappé
// par JSON.stringify ; rendu échappé par React côté page).
//
// Entrées : GITHUB_EVENT_PATH (payload pull_request_target) et NEW_VERSION
// (version après bump, vide si la PR n'avait pas de label semver:*).

import { readFileSync, writeFileSync } from "node:fs";

const CHANGELOG = "static-content/changelog.json";
const PLACEHOLDER = "À remplacer";
// Une note de journal = 1-2 phrases. Au-delà, on tronque : le corps de la PR
// est une entrée non fiable et la page /journal doit rester lisible.
const MAX_NOTE_LENGTH = 400;

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const pr = event.pull_request;

// Extrait la section « ## Note de journal » du corps de la PR (sans les
// commentaires HTML du template), jusqu'au prochain titre « ## ».
function extractNote(body) {
  if (!body) return null;
  const match = body.match(/^##\s*Note de journal\s*$([\s\S]*?)(?=^##\s|\n*$(?![\s\S]))/m);
  if (!match) return null;
  let note = match[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!note || note.includes(PLACEHOLDER)) return null;
  if (note.length > MAX_NOTE_LENGTH) {
    note = note.slice(0, MAX_NOTE_LENGTH).replace(/\s+\S*$/, "") + "…";
  }
  return note;
}

const isBot = pr.user?.type === "Bot" || /\[bot\]$/.test(pr.user?.login ?? "");
const note =
  extractNote(pr.body) ??
  (isBot ? "Mise à jour automatique de dépendances techniques." : pr.title);

const entry = {
  pr: pr.number,
  date: pr.merged_at,
  note,
  version: process.env.NEW_VERSION || null,
};

const entries = JSON.parse(readFileSync(CHANGELOG, "utf8"));
if (entries.some((e) => e.pr === entry.pr)) {
  console.log(`Entrée déjà présente pour la PR #${entry.pr} — rien à faire.`);
  process.exit(0);
}
entries.unshift(entry);
writeFileSync(CHANGELOG, JSON.stringify(entries, null, 2) + "\n");
console.log(`Entrée ajoutée pour la PR #${entry.pr} :`, JSON.stringify(entry));
