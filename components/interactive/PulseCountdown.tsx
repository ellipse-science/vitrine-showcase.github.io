"use client";

import { useEffect } from "react";

import { editionSlot } from "@/lib/editions";

// Live countdown to the next data-refresh slot.
//
// Updates the #cd-big text inside the pulse-band and toggles .past / .current
// classes on each .pulse-icon every second (both driven by wall-clock time —
// they describe the *refresh schedule*, not the content).
//
// The edition NAME (#edition-name), au contraire, reflète le bloc des DONNÉES
// affichées (prop `edition` = periodLabel du serveur) — sinon l'en-tête
// contredit la section « Les Unes … » quand les données ont du retard (#136).
//
// The DOM nodes it targets live inside the RawMaquette "top" chunk; this
// component just attaches behavior, it renders nothing.

const UPDATE_HOURS = [0, 4, 8, 12, 16, 20];

export function PulseCountdown({ edition }: { edition?: string | null }) {
  useEffect(() => {
    // Édition = celle des données affichées (statique), écrite une fois.
    const edEl = document.getElementById("edition-name");
    if (edEl && edition) edEl.textContent = `Édition ${edition}`;

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
      if (bigEl) bigEl.textContent = `${hh} h ${mm < 10 ? "0" : ""}${mm} min`;

      const slot = editionSlot(h);
      document.querySelectorAll(".pulse-icon").forEach((el, i) => {
        el.classList.remove("current", "past");
        if (i < slot) el.classList.add("past");
        else if (i === slot) el.classList.add("current");
      });
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [edition]);

  return null;
}
