import { ScoreEntry, insertScore, sanitizeInitials } from "./flappy";

const UPSTASH_URL =
  process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "https://fond-jaguar-183203.upstash.io";

const UPSTASH_TOKEN =
  process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "gQAAAAAAAsujAAIgcDI4Y2RlN2NhZTI2NTI0MzYzOGE0NjI0YTQ2MmJiN2ZkNg";

const REDIS_KEY = "vitrine-flappy-global-board";

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

    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
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

export async function submitScoreToLeaderboard(entry: ScoreEntry): Promise<ScoreEntry[]> {
  try {
    const sanitizedEntry: ScoreEntry = {
      initials: sanitizeInitials(entry.initials),
      score: Number(entry.score),
      date: entry.date || new Date().toISOString().slice(0, 10),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    // 1. Récupération préalable de la liste globale
    const getRes = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      signal: controller.signal,
      cache: "no-store",
    });

    let currentGlobal = DEFAULT_BOARD;
    if (getRes.ok) {
      const data = await getRes.json();
      currentGlobal = parseBoardResult(data.result);
    }

    const updatedGlobal = insertScore(currentGlobal, sanitizedEntry);

    // 2. Publication de la liste mise à jour dans Upstash Redis (JSON simple)
    const setRes = await fetch(`${UPSTASH_URL}/set/${REDIS_KEY}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedGlobal),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (setRes.ok) {
      return updatedGlobal;
    }
  } catch (err) {
    console.error("Erreur lors de la publication du score global:", err);
  }

  return DEFAULT_BOARD;
}
