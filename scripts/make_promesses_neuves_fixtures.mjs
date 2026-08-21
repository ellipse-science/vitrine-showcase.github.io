// Génère un jeu de données de DÉVELOPPEMENT pour le mode « promesses de la
// campagne » du Polimètre+.
//
// Pourquoi : la table `polimetre_promesses_neuves` est déclarée `enabled: false`
// dans scripts/tables.json — le raffineur qui l'alimente n'est pas planifié, et
// son étage de saillance n'est pas fiable (cf. son README dans aws-refiners).
// Le JSON n'existe donc pas sur disque, `loadPromessesNeuves()` rend null, et le
// second mode du module est tout simplement INVISIBLE en `npm run dev`. Ce
// script fabrique de quoi le rendre, au MÊME schéma que le raffineur.
//
// Ce n'est PAS de la donnée réelle et ça ne doit jamais finir dans public/data/
// (règle dure #1). Chaque ligne porte `_fictif: true`, et le module affiche un
// bandeau quand il est alimenté d'ici.
//
// ⚠️ LES PROMESSES SONT INVENTÉES, PAS REPRISES DE VRAIS COMMUNIQUÉS.
// Attribuer à un parti une phrase qu'il n'a pas prononcée serait fabriquer une
// fausse affirmation politique, même en développement — et une fixture finit
// toujours par être lue par quelqu'un qui n'a pas lu cet en-tête. Les textes
// ci-dessous imitent la LONGUEUR et la FORME des vrais verbatims (c'est ce dont
// la mise en page a besoin), rien de plus.
//
// Le jeu couvre à dessein les cas limites que la donnée réelle ne fournit pas :
// les CINQ partis, un libellé très long, une promesse sans article, une à fort
// écho, une avec un sigle de parti inconnu.
//
// Usage :
//   node scripts/make_promesses_neuves_fixtures.mjs
//
// Puis, pour développer avec :
//   VITRINE_NEUVES_FIXTURES=fixtures/promesses-neuves/polimetre_promesses_neuves.json npm run dev

import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "fixtures", "promesses-neuves");
const OUT_FILE = "polimetre_promesses_neuves.json";

// Ancre temporelle : aujourd'hui, pour que « Aujourd'hui » veuille dire quelque
// chose. Épinglable pour un rendu reproductible.
const ANCRE = process.env.VITRINE_NEUVES_DATE ?? new Date().toISOString().slice(0, 10);
const jours = (n) =>
  new Date(Date.parse(`${ANCRE}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

const MEDIAS = ["LAP", "LED", "JDM", "TVA", "RCI"];
const article = (media, titre) => ({
  media_id: media,
  title: titre,
  url: `https://example.invalid/${media.toLowerCase()}/${encodeURIComponent(titre.slice(0, 40))}`,
});

// [parti, verbatim, libellé court, jours écoulés depuis l'annonce, mentions, articles]
const PROMESSES = [
  ["CAQ",
   "Un gouvernement de la Coalition avenir Québec réélu portera à 2 000 $ le crédit d'impôt pour la rénovation énergétique des résidences principales, dès le budget suivant l'élection.",
   "Porter à 2 000 $ le crédit de rénovation énergétique", 0, 14,
   [article("LAP", "Rénovation énergétique : la CAQ hausse son crédit d'impôt"),
    article("LED", "Le crédit de rénovation passerait à 2 000 $"),
    article("JDM", "Habitation | Un crédit bonifié promis par la CAQ")]],

  ["PLQ",
   "Un gouvernement libéral abolira la taxe de bienvenue pour l'achat d'une première propriété de moins de 400 000 $.",
   "Abolir la taxe de bienvenue au premier achat", 1, 9,
   [article("LED", "Première propriété : le PLQ promet d'abolir la taxe de bienvenue"),
    article("TVA", "Le PLQ vise les premiers acheteurs")]],

  ["QS",
   "Québec solidaire s'engage à construire 25 000 logements réellement abordables au cours du prochain mandat, dont 8 000 en milieu rural.",
   "Construire 25 000 logements abordables", 2, 6,
   [article("RCI", "Logement | QS chiffre son plan à 25 000 unités")]],

  ["PQ",
   "Un gouvernement du Parti Québécois haussera de 15 % l'enveloppe des services de garde en milieu familial, et créera 3 000 places dès la première année.",
   "Créer 3 000 places en milieu familial", 3, 4,
   [article("JDM", "Services de garde | Le PQ promet 3 000 places"),
    article("LAP", "Garderies : une hausse de 15 % proposée")]],

  ["PCQ",
   "Le Parti conservateur du Québec réduira de moitié le délai moyen d'attente en chirurgie d'ici la fin du mandat, en autorisant les cliniques privées à opérer sous couverture publique.",
   "Réduire de moitié l'attente en chirurgie", 5, 3,
   [article("TVA", "Le PCQ veut couper les délais en chirurgie de moitié")]],

  // ── Cas limites, que la donnée réelle ne fournit pas ──────────────────────
  // Libellé très long : éprouve le repli du titre et la solidarité du chevron
  // avec son dernier mot (cf. PromiseTitle).
  ["QS",
   "Québec solidaire déposera une loi-cadre sur la protection des milieux humides qui interdira toute compensation financière en remplacement d'une restauration effective du milieu détruit.",
   "Interdire la compensation financière pour les milieux humides détruits", 4, 2,
   [article("LED", "Milieux humides | QS veut interdire la compensation en argent")]],

  // Aucun article : le bloc « À lire sur » doit simplement disparaître.
  ["PQ",
   "Le Parti Québécois rendra gratuit le transport collectif pour les personnes de 65 ans et plus dans l'ensemble des sociétés de transport du Québec.",
   "Rendre le transport gratuit à 65 ans et plus", 6, 1, []],

  // Parti hors des cinq suivis : la pastille doit rester NEUTRE, jamais
  // emprunter la couleur d'un autre parti (cf. partiKeyFromId).
  ["PVQ",
   "Le Parti vert du Québec instaurera une redevance kilométrique sur le transport routier de marchandises à compter de 2028.",
   "Instaurer une redevance kilométrique sur le camionnage", 2, 2,
   [article("RCI", "Transport de marchandises | une redevance proposée")]],
];

// Le raffineur publie DEUX fenêtres. La règle d'appartenance étant l'écho
// médiatique, une promesse ancienne peut figurer dans la fenêtre du jour : la
// fixture le reproduit, sinon on ne pourrait pas éprouver ce comportement.
function lignes(windowKey, garder) {
  return PROMESSES.filter(garder)
    .map(([parti, verbatim, label, age, mentions, articles], i) => ({
      country_id: "QC",
      window_key: windowKey,
      window_end: ANCRE,
      rank_current: i + 1,
      promesse_id: `pn-fixture-${windowKey}-${String(i).padStart(2, "0")}`,
      party_id: parti,
      label,
      promesse_text: verbatim,
      announce_date: jours(age),
      release_url: `https://example.invalid/communique/${parti.toLowerCase()}-${i}`,
      release_title: `Communiqué de développement — ${parti}`,
      n_mentions: mentions,
      salience_index: Number((mentions * (3 - i * 0.2)).toFixed(2)),
      articles: JSON.stringify(articles),
      _fictif: true,
    }));
}

// « Aujourd'hui » : celles reprises aujourd'hui — donc les plus fort écho, quel
// que soit leur âge. « Semaine » : tout le jeu.
const rows = [
  ...lignes("day", ([, , , , mentions]) => mentions >= 3),
  ...lignes("week", () => true),
];

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, OUT_FILE), JSON.stringify(rows, null, 2) + "\n", "utf8");

console.log(`${rows.length} lignes écrites dans fixtures/promesses-neuves/${OUT_FILE}`);
console.log(`  fenêtre du jour    : ${rows.filter((r) => r.window_key === "day").length}`);
console.log(`  fenêtre de semaine : ${rows.filter((r) => r.window_key === "week").length}`);
console.log(`  partis            : ${[...new Set(rows.map((r) => r.party_id))].join(", ")}`);
console.log("");
console.log("Pour développer avec :");
console.log(`  VITRINE_NEUVES_FIXTURES=fixtures/promesses-neuves/${OUT_FILE} npm run dev`);
