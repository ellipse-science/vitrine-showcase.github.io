import { editionDeLaDonnee, type Edition } from "@/lib/dates";
import { readDatasetText } from "./source";

/** Un article annoté tel que publié dans `public/data/refined/issues_articles.json`
 *  (`scripts/fetch_data.R`, filtre `radar_annotated_issues`) : `fin_utc` est la
 *  dernière capture de l'article en Une, en UTC ISO. */
export type ArticleDate = { fin_utc?: string | null };

/**
 * L'ÉDITION DE LA DONNÉE des modules qui vivent des articles annotés (12 enjeux,
 * Partis et couverture) : celle du plus récent article que le module a pu voir.
 *
 * `borneUtc` (ISO) sert aux archives : une édition passée ne peut annoncer que
 * ce qui existait à l'instant de sa publication (#735). Rend `null` si aucun
 * article ne porte `fin_utc` — l'appelant retombe alors sur la date seule,
 * jamais sur l'heure d'une passe.
 */
export function editionDesArticles(articles: ArticleDate[], borneUtc?: string | null): Edition | null {
  const borne = borneUtc ? Date.parse(borneUtc) : Number.NaN;
  let max = "";
  let maxT = Number.NEGATIVE_INFINITY;
  for (const a of articles) {
    const fin = typeof a.fin_utc === "string" ? a.fin_utc.trim() : "";
    if (!fin) continue;
    const t = Date.parse(fin);
    if (Number.isNaN(t)) continue;
    if (!Number.isNaN(borne) && t > borne) continue;
    if (t > maxT) { maxT = t; max = fin; }
  }
  return max ? editionDeLaDonnee(max) : null;
}

/** Lit le fichier des articles annotés et en tire l'édition de la donnée.
 *  Fichier absent ou illisible → `null`, sans bruit : le module dira la date. */
export async function fraicheurArticlesRadar(borneUtc?: string | null): Promise<Edition | null> {
  let txt: string;
  try { txt = await readDatasetText("public/data/refined/issues_articles.json"); } catch { return null; }
  try {
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? editionDesArticles(parsed as ArticleDate[], borneUtc) : null;
  } catch { return null; }
}
