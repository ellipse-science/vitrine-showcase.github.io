import { ScoreEntry, insertScore, sanitizeInitials } from "./flappy";

// Classement global du jeu caché « Flappy Enjeux ».
//
// SÉCURITÉ — pourquoi il n'y a plus de jeton d'écriture ici : ce module tourne
// dans le navigateur, et tout ce qui est préfixé NEXT_PUBLIC_* est inliné dans
// le bundle client au build. Un jeton d'écriture placé ici est donc public par
// construction — n'importe qui peut réécrire ou vider le classement. Le dépôt a
// longtemps embarqué un jeton Upstash en clair dans ce fichier; il est révoqué.
//
// Le lecteur utilise un jeton Upstash **en lecture seule** (exposé sciemment :
// il ne donne accès qu'à des scores déjà affichés). L'écriture passe par un
// Worker qui, lui, détient le secret côté serveur — cf.
// docs/reference/api-direction.md. Tant que ce Worker n'existe pas, les scores
// restent locaux à la session : on n'écrit rien plutôt que d'écrire sans garde.

const UPSTASH_URL = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL ?? "";

// Jeton EN LECTURE SEULE. Ne jamais y mettre un jeton d'écriture (voir ci-dessus).
const UPSTASH_READONLY_TOKEN =
  process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_READONLY_TOKEN ?? "";

// Endpoint d'écriture (Worker). Absent aujourd'hui : l'écriture est désactivée.
const LEADERBOARD_WRITE_URL = process.env.NEXT_PUBLIC_LEADERBOARD_WRITE_URL ?? "";

const REDIS_KEY = "vitrine-flappy-global-board";

const DEFAULT_BOARD: ScoreEntry[] = [];

const canRead = Boolean(UPSTASH_URL && UPSTASH_READONLY_TOKEN);
const canWrite = Boolean(LEADERBOARD_WRITE_URL);

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
  if (!canRead) return DEFAULT_BOARD;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_READONLY_TOKEN}` },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return parseBoardResult(data.result);
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

  if (!canWrite) return optimisticBoard;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    // Le Worker fait le get + merge + set côté serveur : le client n'envoie que
    // son entrée, jamais le tableau complet (sinon il pourrait l'écraser).
    const res = await fetch(LEADERBOARD_WRITE_URL, {
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
