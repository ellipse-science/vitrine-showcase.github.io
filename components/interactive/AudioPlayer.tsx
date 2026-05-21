"use client";

import { useRef, useState, useEffect } from "react";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, compact = false }: { src: string; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [current, setCurrent]   = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration);
    const onEnd  = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else         { el.play();  setPlaying(true);  }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const pct = duration ? (current / duration) * 100 : 0;

  if (compact) {
    return (
      <div className="une-audio-compact">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} src={src} preload="metadata" />
        <button
          className="une-audio-btn"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Jouer"}
        >
          {playing ? "◼" : "▶"}
        </button>
        <span className="une-audio-compact-label">Ambiance du moment</span>
        <div
          className="une-audio-track"
          onClick={seek}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="une-audio-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="une-audio">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="metadata" />
      <span className="une-audio-label">Ambiance du moment</span>
      <div className="une-audio-controls">
        <button
          className="une-audio-btn"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Jouer"}
        >
          {playing ? "◼" : "▶"}
        </button>
        <div
          className="une-audio-track"
          onClick={seek}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="une-audio-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="une-audio-time">
          {fmt(current)}<span className="une-audio-sep"> / </span>{fmt(duration)}
        </span>
      </div>
    </div>
  );
}
