import { useEffect, useRef } from "react";
import { KONAMI, matchKonami } from "@/lib/flappy";

export function useKonamiCode(onUnlock: () => void): void {
  const buf = useRef<string[]>([]);
  const cb = useRef(onUnlock);
  cb.current = onUnlock;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      buf.current = [...buf.current, e.key].slice(-KONAMI.length);
      if (matchKonami(buf.current)) {
        buf.current = [];
        cb.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
