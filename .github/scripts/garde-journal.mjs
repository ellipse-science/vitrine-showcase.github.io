#!/usr/bin/env node
// Garde-fou : la note de journal d'une PR est du TEXTE PUBLIC.
//
// Appelé par `.github/workflows/garde-journal.yml` avec le corps de la PR sur
// l'entrée standard. Échoue tant que la note n'est pas publiable — c'est le
// seul moment où un humain peut encore la corriger, puisque `append-changelog`
// la publie au merge sans repasser par personne.
//
// Règles et raisons : `.github/scripts/journal-note.mjs`, source unique de
// vérité partagée avec le script de publication.

import { readFileSync } from "node:fs";
import { extractNote, verifierNote } from "./journal-note.mjs";

const body = readFileSync(0, "utf8");
const note = extractNote(body);
const problemes = verifierNote(note);

if (problemes.length === 0) {
  console.log(`Note de journal publiable :\n  « ${note} »`);
  process.exit(0);
}

for (const p of problemes) console.error(`✘ ${p}`);
console.error(
  "\nCette note sera publiée telle quelle sur https://ellipse.science/vitrine-showcase.github.io/journal/, lisible par les visiteurs," +
    "\nles partenaires et la presse. Le check se relance dès que vous modifiez le corps de la PR." +
    "\nRègles d'écriture : .claude/skills/redaction-editoriale/SKILL.md",
);
process.exit(1);
