import { NextResponse } from "next/server";
import { insertScore, sanitizeInitials, ScoreEntry } from "@/lib/flappy";

// Stockage en mémoire pour le développement local si aucune DB n'est configurée
let inMemoryBoard: ScoreEntry[] = [
  { initials: "VTR", score: 42, date: "2026-07-27" },
  { initials: "PLQ", score: 28, date: "2026-07-27" },
  { initials: "CAQ", score: 19, date: "2026-07-27" },
];

export async function GET() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/get/vitrine-flappy-global-board`, {
        headers: { Authorization: `Bearer ${redisToken}` },
        next: { revalidate: 10 },
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.result ? JSON.parse(data.result) : [];
        return NextResponse.json({ board: raw, isGlobal: true });
      }
    } catch {
      /* Fallback vers mémoire locale */
    }
  }

  return NextResponse.json({ board: inMemoryBoard, isGlobal: false });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const initials = sanitizeInitials(body.initials);
    const score = Number(body.score);
    const date = typeof body.date === "string" ? body.date : new Date().toISOString().slice(0, 10);

    if (!initials || isNaN(score) || score <= 0 || score > 9999) {
      return NextResponse.json({ error: "Score ou initiales invalides" }, { status: 400 });
    }

    const newEntry: ScoreEntry = { initials, score, date };
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
      try {
        // Récupération du classement actuel
        const getRes = await fetch(`${redisUrl}/get/vitrine-flappy-global-board`, {
          headers: { Authorization: `Bearer ${redisToken}` },
        });
        let board: ScoreEntry[] = [];
        if (getRes.ok) {
          const data = await getRes.json();
          board = data.result ? JSON.parse(data.result) : [];
        }

        const updated = insertScore(board, newEntry);

        // Sauvegarde dans Redis
        await fetch(`${redisUrl}/set/vitrine-flappy-global-board`, {
          method: "POST",
          headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(JSON.stringify(updated)),
        });

        return NextResponse.json({ board: updated, isGlobal: true });
      } catch {
        /* Fallback vers mémoire */
      }
    }

    inMemoryBoard = insertScore(inMemoryBoard, newEntry);
    return NextResponse.json({ board: inMemoryBoard, isGlobal: false });
  } catch {
    return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
  }
}
