// Source unique de vérité pour la « Note de journal » d'une PR.
//
// Deux consommateurs, et c'est le point : `garde-journal.yml` valide la note
// PENDANT la PR, quand un humain peut encore la corriger, et
// `append-changelog.mjs` l'extrait au merge. Les deux doivent découper le
// corps de la PR de la MÊME façon, sinon la garde approuve un texte que le
// journal publiera autrement.
//
// POURQUOI CETTE GARDE EXISTE. Toutes les entrées de /journal sont publiques.
// Jusqu'ici, la note était le SEUL texte public du site qu'aucune
// vérification ne touchait : `garde_redaction.mjs` exclut explicitement
// `changelog.json` parce que la note y arrive APRÈS le merge, donc trop tard
// pour la refuser. Audit du 2026-08-13 sur les 230 entrées publiées : 20
// titres de commit bruts, 4 artefacts de formulaire, et surtout une ligne
// annonçant au public qu'un jeton d'authentification avait été exposé.

export const PLACEHOLDER = "À remplacer";
// Une note de journal = 1-2 phrases. Au-delà, on tronque : le corps de la PR
// est une entrée non fiable et la page /journal doit rester lisible.
export const MAX_NOTE_LENGTH = 400;

/** Extrait la section « ## Note de journal » du corps de la PR (sans les
 *  commentaires HTML du template), jusqu'au prochain titre « ## ». */
export function extractNote(body) {
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

// Un titre de commit conventionnel publié tel quel : c'est ce que produisait
// l'ancien repli quand la note était vide. 20 des 230 entrées publiées en
// viennent, dont « test(saillance) : les fixtures cessent de dépendre de
// l'état du flag », illisible pour qui visite le site.
const TITRE_DE_COMMIT = /^(feat|fix|chore|docs|test|style|refactor|perf|build|ci|garde)\s*[(:]/i;

// Motifs de SÉCURITÉ, volontairement étroits pour ne pas mordre sur « un
// chiffre clé » ou « une clé de lecture ». Une divulgation d'incident se fait
// auprès des personnes concernées, jamais dans un journal de mises à jour.
const SECURITE =
  /\b(jetons?|tokens?|mots? de passe|identifiants?|failles?|vuln[ée]rabilit\w*|CVE-\d|fuite de donn[ée]es|cl[ée]s? (?:d['’])?(?:api|acc[èe]s|service|chiffrement))\b/i;

// Jargon interne : noms de tables, de raffineurs, d'outils et de services.
// La règle #7 interdit déjà ces termes dans les textes publics ; ici on
// l'applique là où personne ne relisait.
const JARGON =
  /\b(raffineurs?|refiners?|datamart|athena|glue|lambda|parquet|stepper|storyline|cutover|fixtures?|flag|regex|commit|merge|workflow|bucket|redis|upstash|cron|INT32|snapshots?|\.git|repo)\b/i;

// Une note qui s'ouvre sur une parenthèse est un artefact de formulaire, pas
// une phrase : « (Section vide — changement trop mineur/interne pour le
// journal public.) » a réellement été publiée sur le journal public.
const ARTEFACT = /^\s*\(/;

/** Renvoie la liste des problèmes d'une note. Vide = la note est publiable. */
export function verifierNote(note) {
  const problemes = [];
  if (!note) {
    problemes.push(
      "la section « ## Note de journal » est absente, vide, ou encore au texte d'exemple. " +
        "Écrivez 1 à 2 phrases GRAND PUBLIC : ce que la PR change pour le site. " +
        "Si rien n'est visible, dites-le en toutes lettres (« Rien ne change sur le site. »).",
    );
    return problemes;
  }
  if (TITRE_DE_COMMIT.test(note)) {
    problemes.push(
      `la note est un titre de commit (« ${note.slice(0, 60)}… »). Le journal est lu par des ` +
        "visiteurs, pas par des développeurs : reformulez en français courant.",
    );
  }
  if (ARTEFACT.test(note)) {
    problemes.push(
      "la note commence par une parenthèse, donc elle répond au formulaire au lieu d'être " +
        "une phrase. Écrivez la phrase que le visiteur doit lire.",
    );
  }
  const secu = note.match(SECURITE);
  if (secu) {
    problemes.push(
      `la note contient « ${secu[0]} », du vocabulaire de sécurité. Une question de sécurité ` +
        "se traite avec les personnes concernées, jamais dans un journal public. Décrivez " +
        "l'amélioration sans nommer la faiblesse.",
    );
  }
  const jargon = note.match(JARGON);
  if (jargon) {
    problemes.push(
      `la note contient « ${jargon[0]} », du jargon interne que la règle #7 interdit dans un ` +
        "texte public. Nommez ce que le visiteur voit, pas la pièce technique.",
    );
  }
  return problemes;
}
