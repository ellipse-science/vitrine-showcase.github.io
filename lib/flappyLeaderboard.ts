import { ScoreEntry, insertScore, sanitizeInitials } from "./flappy";

// Classement global du jeu caché « Flappy Enjeux ».
//
// HISTOIRE (issue #499) — pourquoi il n'y a AUCUN jeton ici : ce module tourne
// dans le navigateur, et tout ce qui est préfixé NEXT_PUBLIC_* est inliné dans
// le bundle client au build. Le dépôt a longtemps embarqué un jeton Upstash
// d'ÉCRITURE en clair ; la PR #491 l'a retiré, mais les variables de
// remplacement n'ont jamais été posées — le classement s'affichait vide.
//
// Depuis le 2026-08-20, le classement vit derrière l'API de la Vitrine
// (workers/api/src/flappy.ts) : lecture publique cachée au edge, écriture
// validée CÔTÉ SERVEUR — le client n'envoie que SON entrée, jamais le tableau,
// il ne peut donc pas l'écraser. Zéro secret côté client, zéro variable
// d'environnement à poser, plus d'Upstash du tout.

const API_BASE = process.env.NEXT_PUBLIC_VITRINE_API_BASE ?? "https://api.vitrinedemocratique.com";
const LEADERBOARD_URL = `${API_BASE}/v1/flappy/leaderboard`;

const DEFAULT_BOARD: ScoreEntry[] = [];

function parseBoardResult(raw: unknown): ScoreEntry[] {
  if (!raw) return DEFAULT_BOARD;
  try {
    let parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as ScoreEntry[];
  } catch {
    /* ignore parsing errors */
  }
  return DEFAULT_BOARD;
}

export async function fetchLeaderboard(): Promise<ScoreEntry[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(LEADERBOARD_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return parseBoardResult(data.board ?? data.result ?? data);
    }
  } catch (err) {
    console.error("Erreur lors de la récupération du classement global:", err);
  }

  return DEFAULT_BOARD;
}

export async function submitScoreToLeaderboard(
  entry: ScoreEntry,
  currentBoard: ScoreEntry[] = DEFAULT_BOARD,
): Promise<ScoreEntry[]> {
  const sanitizedEntry: ScoreEntry = {
    initials: sanitizeInitials(entry.initials),
    score: Number(entry.score),
    date: entry.date || new Date().toISOString().slice(0, 10),
  };

  // Fusion locale : le joueur voit toujours son score, même sans persistance.
  // On la calcule d'abord pour pouvoir la rendre en cas d'échec réseau — rendre
  // un tableau vide effacerait le classement affiché.
  const optimisticBoard = insertScore(currentBoard, sanitizedEntry);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    // Le Worker fait le get + merge + set côté serveur : le client n'envoie que
    // son entrée, jamais le tableau complet (sinon il pourrait l'écraser).
    const res = await fetch(LEADERBOARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizedEntry),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const persisted = parseBoardResult(data.board ?? data.result ?? data);
      if (persisted.length > 0) return persisted;
    }
  } catch (err) {
    console.error("Erreur lors de la publication du score global:", err);
  }

  return optimisticBoard;
}
