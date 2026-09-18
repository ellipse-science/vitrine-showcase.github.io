// Briques communes aux scripts de module : choix de l'édition et tournures de
// rédaction. Les scènes communes (accroche, fin) et le thème vivent dans reel.ts
// et lib/modules.ts ; un module n'a plus qu'à décrire SES scènes et SES phrases.

import { listEditions, type EditionRef } from "@/lib/data/headlineEvents";

/** Attribut `style` d'une animation CSS du gabarit (voir BASE_CSS). */
export const anim = (name: string, dur: number, delay: number) => `style="animation:${name} ${dur}s ${delay}s both"`;

/** « 20h » : heure de publication de l'édition (heures collées, règle #7). */
export const pubHourLabel = (edition: EditionRef) => `${edition.pubHour % 24}h`;

/** « 16.09.2026 · Édition de 20h », pour le pied de page.
 *  LA DATE PASSE DEVANT (Jules Piral, 2026-09-18) : sur Instagram et TikTok, où
 *  le fil défile vite, la première chose à lire est DE QUAND DATE l'information.
 *  L'heure d'édition vient après — elle ne sert qu'à qui suit les six éditions. */
export const footerEdition = (edition: EditionRef) =>
  `${edition.navDateIso.split("-").reverse().join(".")} · Édition de ${pubHourLabel(edition)}`;

/** « A, B et C ». */
export const joinFr = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;

/** Titre entre guillemets français (insécables) ; les guillemets déjà présents
 *  passent au second niveau (“ ”). */
export const quote = (s: string) => `« ${s.replace(/«\s*/g, "“").replace(/\s*»/g, "”")} »`;

/** Typographie OQLF d'une légende en texte brut (U+00A0 avant « : » et « % »). */
export const captionTypo = (text: string) =>
  text.replace(/[ \t]*:(?=\s|$)/gm, " :").replace(/[ \t]*%/g, " %");

/** L'édition demandée (`--edition`) ou la plus récente, avec l'avertissement de
 *  fraîcheur : le reel montre le dépôt LOCAL, pas le site. */
export async function resolveEdition(args: Record<string, string | true>): Promise<{ edition: EditionRef; current: EditionRef }> {
  const editions = await listEditions();
  if (!editions.length) throw new Error("Aucune édition dans public/data/headline-events.json.");
  const current = editions[0];
  const edition = typeof args.edition === "string" ? editions.find((e) => e.key === args.edition) : current;
  if (!edition) throw new Error(`Édition « ${args.edition} » introuvable. Plus récentes : ${editions.slice(0, 6).map((e) => e.key).join(", ")}`);
  const ageH = (Date.now() - new Date(current.pubInstantIso).getTime()) / 3.6e6;
  if (edition === current && ageH > 5) {
    console.warn(`  ⚠️ La dernière édition du dépôt date de ${Math.round(ageH)} h. Faites « git pull » pour publier l'édition du moment.`);
  }
  return { edition, current };
}
