// L'ILLUSTRATION DE LA UNE N°1, pour tous les reels du module.
//
// Elle vivait dans `une-des-unes.ts` ; les reels COURTS en ont besoin aussi
// (analyse `saillance`), et une deuxième copie aurait fini par diverger de la
// garde d'appariement — précisément ce qui ferait attribuer une image à la
// mauvaise Une. Une seule source, ici.

import fs from "node:fs/promises";
import path from "node:path";

import type { EditionRef, UneEvent } from "@/lib/data/headlineEvents";
import { matchesCurrentUneArt } from "@/lib/shareUneArt";

import { SITE_URL } from "./reel";

/** Crédit de l'illustration de la Une. */
export const ART_CREDIT = "Image générée sous la direction de Mathieu Fortin";

// Même garde que le module (UneDesUnesSection) : `latest.png` est écrasée à
// chaque cycle, elle n'illustre donc que l'édition COURANTE, et seulement si
// elle appartient bien à la Une n°1. Dans le doute, pas d'image : une Une
// sans illustration vaut mieux qu'une illustration de la mauvaise Une.
export async function resolveArt(edition: EditionRef, current: EditionRef, top: UneEvent): Promise<string | null> {
  if (edition.key !== current.key) return null;

  // 1. Illustration rapatriée localement par scripts/fetch_art.mjs (clé d'API).
  const dir = path.resolve(process.cwd(), "public", "data", "generated-art");
  try {
    const meta = JSON.parse(await fs.readFile(path.join(dir, "latest.json"), "utf8"));
    if (matchesCurrentUneArt(meta, top)) {
      const png = await fs.readFile(path.join(dir, "latest.png"));
      return `data:image/png;base64,${png.toString("base64")}`;
    }
  } catch { /* pas de copie locale : on tente le site */ }

  // 2. Illustration publiée. Le site la sert à côté de hero-selection.json,
  //    qui nomme la Une de CE déploiement : les deux viennent du même build.
  try {
    const hero = (await (await fetch(`${SITE_URL}/data/hero-selection.json`)).json()) as { storyline_id?: string; event_id?: string };
    if (!matchesCurrentUneArt(hero, top)) {
      console.warn("  illustration ignorée : le site publié illustre une autre Une de l’actualité que le dépôt local.");
      return null;
    }
    const res = await fetch(`${SITE_URL}/data/generated-art/latest.png`);
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    console.warn("  illustration indisponible (site injoignable) : mise en page sans image.");
    return null;
  }
}
