// LA MUSIQUE DES REELS — un lit sonore par module.
//
// Demande d'Adrien (2026-09-16) : « une musique par vidéo de module, une pour
// la vidéo de présentation ». Ce fichier produit ce lit avec ffmpeg, à partir
// de l'intention musicale déclarée dans `lib/modules.ts`.
//
// ⚠️ CE QUE C'EST, ET CE QUE CE N'EST PAS.
// C'est un ACCORD TENU, fabriqué ici : quelques sinusoïdes, un vibrato lent, un
// écho, des fondus. Rien n'est emprunté, donc rien n'est à libérer de droits, et
// le même module sonne pareil d'une édition à l'autre — c'est une signature.
// Ce n'est PAS une pièce musicale. Pour une vraie trame :
//   · sur Instagram et TikTok, la prendre dans le CATALOGUE DE L'APPLICATION au
//     moment de publier — c'est la seule façon d'être en règle sur ces
//     plateformes, et c'est ce que le gabarit prévoyait depuis le début ;
//   · ailleurs (LinkedIn, X, Facebook, YouTube), il faut un fichier dont on
//     détient les droits : `--musique fichier.mp3` le monte à la place du lit.
// 🪤 `public/audio/latest.mp3` existe, mais il date du 16 juin 2026 et la
// génération est en panne silencieuse : le site l'a retiré de la prod pour
// cette raison. Ne pas le coller sur une vidéo du jour.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";

import type { IntentionMusicale } from "@/lib/modules";

/** Demi-tons → fréquence, La 440 en référence. */
const hz = (demiTons: number) => 440 * Math.pow(2, demiTons / 12);

/** Les degrés de l'accord, en demi-tons depuis la fondamentale. */
const ACCORD = { min: [0, 3, 7, 12], maj: [0, 4, 7, 12] };

/** Écrit un lit sonore de `duree` secondes dans un fichier temporaire. */
export async function litSonore(intention: IntentionMusicale, duree: number): Promise<string> {
  const sortie = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "reel-musique-")), "lit.wav");
  const degres = ACCORD[intention.accord];
  // Une voix par degré, chacune un peu moins forte que la précédente (les
  // aigus portent plus), et un vibrato dont la vitesse suit le tempo du module.
  const voix = degres.map((d, i) => ({
    f: hz(intention.racine + d - 12),
    gain: [0.30, 0.20, 0.16, 0.10][i] ?? 0.08,
    vitesse: (intention.bpm / 60) * (i % 2 === 0 ? 0.25 : 0.33),
  }));
  const entrees = voix.flatMap((v) => ["-f", "lavfi", "-i", `sine=frequency=${v.f.toFixed(2)}:duration=${duree.toFixed(2)}:sample_rate=48000`]);
  const filtres = voix.map((v, i) =>
    `[${i}:a]tremolo=f=${v.vitesse.toFixed(3)}:d=0.35,volume=${v.gain}[v${i}]`).join(";");
  const melange = `${voix.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voix.length}:normalize=0`;
  // Passe-bas : on enlève le côté « sinus nu ». Écho : un peu d'air. Fondus :
  // la vidéo ne commence ni ne finit sur un son sec.
  const chaine = `${filtres};${melange},lowpass=f=${intention.accord === "min" ? 900 : 1100},aecho=0.8:0.85:600|1100:0.28|0.18,`
    + `afade=t=in:st=0:d=1.6,afade=t=out:st=${Math.max(0, duree - 2.2).toFixed(2)}:d=2.2,volume=0.5[out]`;
  await lancer([...entrees, "-filter_complex", chaine, "-map", "[out]", "-ac", "2", "-ar", "48000", "-y", sortie]);
  return sortie;
}

function lancer(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as unknown as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (musique) a échoué (${code}) :\n${err.slice(-1200)}`))));
  });
}
