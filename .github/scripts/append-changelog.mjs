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
import { extractNote, verifierNote } from "./journal-note.mjs";

const CHANGELOG = "static-content/changelog.json";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const pr = event.pull_request;

const isBot = pr.user?.type === "Bot" || /\[bot\]$/.test(pr.user?.login ?? "");
const extraite = extractNote(pr.body);

// PAS de repli sur le titre de la PR. C'est lui qui a publié « test(saillance) :
// les fixtures cessent de dépendre de l'état du flag » et 19 autres titres de
// commit sur une page que lisent les visiteurs et les partenaires. Un TROU dans
// le journal coûte infiniment moins cher qu'une ligne indéfendable : sans note
// publiable, on n'écrit rien. `garde-journal` fait échouer la PR bien avant
// d'en arriver là ; ceci n'est que le filet sous le filet, pour le jour où
// quelqu'un merge en passant outre.
const note = extraite ?? (isBot ? "Mise à jour automatique de dépendances techniques." : null);

if (note === null || verifierNote(note).length > 0) {
  console.log(
    `PR #${pr.number} : aucune note de journal publiable — aucune entrée ajoutée. ` +
      `(Le titre de la PR n'est JAMAIS publié à sa place.)`,
  );
  process.exit(0);
}

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
