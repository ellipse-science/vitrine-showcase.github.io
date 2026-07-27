import { ScoreEntry, insertScore } from "./flappy";

const LOCAL_KEY = "vitrine-flappy-scores";

// URL de l'API globale du leaderboard (peut être définie via la variable d'environnement NEXT_PUBLIC_FLAPPY_LEADERBOARD_URL)
const API_URL =
  process.env.NEXT_PUBLIC_FLAPPY_LEADERBOARD_URL ||
  "/api/flappy-leaderboard";

export function loadLocalBoard(): ScoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveLocalBoard(board: ScoreEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(board));
  } catch {
    /* Quota ou mode privé */
  }
}

export async function fetchLeaderboard(): Promise<{ board: ScoreEntry[]; isGlobal: boolean }> {
  const local = loadLocalBoard();

  // Si nous sommes sur un site statique sans URL API globale configurée, on retourne la version locale
  if (!process.env.NEXT_PUBLIC_FLAPPY_LEADERBOARD_URL && typeof window !== "undefined" && !window.location.origin.includes("localhost")) {
    return { board: local.slice(0, 10), isGlobal: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(API_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.board)) {
        let merged = data.board as ScoreEntry[];
        for (const entry of local) {
          merged = insertScore(merged, entry);
        }
        return { board: merged.slice(0, 10), isGlobal: true };
      }
    }
  } catch {
    /* Repli sur le stockage local si déconnecté ou erreur API */
  }

  return { board: local.slice(0, 10), isGlobal: false };
}

export async function submitScoreToLeaderboard(entry: ScoreEntry): Promise<{ board: ScoreEntry[]; isGlobal: boolean }> {
  // 1. Sauvegarde locale immédiate (Local-First)
  const currentLocal = loadLocalBoard();
  const updatedLocal = insertScore(currentLocal, entry);
  saveLocalBoard(updatedLocal);

  // 2. Publication vers l'API globale
  if (!process.env.NEXT_PUBLIC_FLAPPY_LEADERBOARD_URL && typeof window !== "undefined" && !window.location.origin.includes("localhost")) {
    return { board: updatedLocal.slice(0, 10), isGlobal: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.board)) {
        return { board: (data.board as ScoreEntry[]).slice(0, 10), isGlobal: true };
      }
    }
  } catch {
    /* Repli sur le stockage local */
  }

  return { board: updatedLocal.slice(0, 10), isGlobal: false };
}
