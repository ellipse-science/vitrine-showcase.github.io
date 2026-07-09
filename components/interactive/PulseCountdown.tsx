"use client";

import { useEffect } from "react";

import { editionLabel, editionSlot } from "@/lib/editions";

// Live countdown to the next data-refresh slot.
//
// TOUT ici est piloté par l'heure murale : le compte à rebours (#cd-big), la
// bande céleste (.pulse-icon) ET le nom d'édition (#edition-name). L'édition
// est celle du SITE — le site entier se rafraîchit 6×/jour — pas celle d'un
// module (décision Adrien 2026-07-09) : elle doit toujours « fitter » avec le
// soleil/la lune allumés juste au-dessus. La fraîcheur réelle de chaque module
// est affichée module par module (« Dernière mise à jour du module : … »).
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
      if (bigEl) bigEl.textContent = `${hh} h ${mm < 10 ? "0" : ""}${mm} min`;

      const slot = editionSlot(h);
      document.querySelectorAll(".pulse-icon").forEach((el, i) => {
        el.classList.remove("current", "past");
        if (i < slot) el.classList.add("past");
        else if (i === slot) el.classList.add("current");
      });

      // Édition du site = bloc horaire courant (noms officiels, lib/editions.ts).
      const edEl = document.getElementById("edition-name");
      if (edEl) edEl.textContent = `Édition ${editionLabel(h)}`;
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
