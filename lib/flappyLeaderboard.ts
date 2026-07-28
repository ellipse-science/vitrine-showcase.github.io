import { ScoreEntry, insertScore, sanitizeInitials } from "./flappy";

const LOCAL_KEY = "vitrine-flappy-scores";

const UPSTASH_URL =
  process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "https://fond-jaguar-183203.upstash.io";

const UPSTASH_TOKEN =
  process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "gQAAAAAAAsujAAIgcDI4Y2RlN2NhZTI2NTI0MzYzOGE0NjI0YTQ2MmJiN2ZkNg";

const REDIS_KEY = "vitrine-flappy-global-board";

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

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const raw = data.result ? JSON.parse(data.result) : [];
      if (Array.isArray(raw)) {
        let merged = raw as ScoreEntry[];
        for (const entry of local) {
          merged = insertScore(merged, entry);
        }
        return { board: merged.slice(0, 10), isGlobal: true };
      }
    }
  } catch {
    /* Repli sur le stockage local si déconnecté */
  }

  return { board: local.slice(0, 10), isGlobal: false };
}

export async function submitScoreToLeaderboard(entry: ScoreEntry): Promise<{ board: ScoreEntry[]; isGlobal: boolean }> {
  // 1. Sauvegarde locale immédiate (Local-First)
  const currentLocal = loadLocalBoard();
  const updatedLocal = insertScore(currentLocal, entry);
  saveLocalBoard(updatedLocal);

  try {
    const sanitizedEntry: ScoreEntry = {
      initials: sanitizeInitials(entry.initials),
      score: Number(entry.score),
      date: entry.date || new Date().toISOString().slice(0, 10),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    // Récupération préalable du classement mondial
    const getRes = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      signal: controller.signal,
    });
    let currentGlobal: ScoreEntry[] = [];
    if (getRes.ok) {
      const data = await getRes.json();
      currentGlobal = data.result ? JSON.parse(data.result) : [];
    }

    const updatedGlobal = insertScore(currentGlobal, sanitizedEntry);

    // Publication de la liste mise à jour dans Upstash Redis
    const setRes = await fetch(`${UPSTASH_URL}/set/${REDIS_KEY}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(JSON.stringify(updatedGlobal)),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (setRes.ok) {
      return { board: updatedGlobal.slice(0, 10), isGlobal: true };
    }
  } catch {
    /* Repli sur le stockage local */
  }

  return { board: updatedLocal.slice(0, 10), isGlobal: false };
}
