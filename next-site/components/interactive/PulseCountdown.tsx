"use client";

import { useEffect } from "react";

// Live countdown to the next data-refresh slot.
//
// Updates the #cd-big and #cd-next text inside the pulse-band, plus toggles
// .past / .current classes on each .pulse-icon. Ported verbatim from the
// inline <script> at the bottom of public/index.html. Runs every second.
//
// The DOM nodes it targets live inside the RawMaquette "top" chunk; this
// component just attaches behavior, it renders nothing.

const UPDATE_HOURS = [0, 4, 8, 12, 16, 20];

export function PulseCountdown() {
  useEffect(() => {
    function tick() {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();

      let nextH = UPDATE_HOURS.find((x) => x > h);
      const rolledOver = nextH === undefined;
      if (rolledOver) nextH = 24;

      const totalSec = (nextH! - h) * 3600 - m * 60 - s;
      const hh = Math.floor(totalSec / 3600);
      const mm = Math.floor((totalSec % 3600) / 60);

      const bigEl = document.getElementById("cd-big");
      const nextEl = document.getElementById("cd-next");
      if (bigEl) bigEl.textContent = `${hh} h ${mm < 10 ? "0" : ""}${mm} min`;
      if (nextEl) nextEl.textContent = rolledOver ? "minuit" : `${nextH} h`;

      const slot = Math.floor(h / 4);
      document.querySelectorAll(".pulse-icon").forEach((el, i) => {
        el.classList.remove("current", "past");
        if (i < slot) el.classList.add("past");
        else if (i === slot) el.classList.add("current");
      });
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
